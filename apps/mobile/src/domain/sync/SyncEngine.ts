/**
 * SyncEngine (§L6/§M8) — the offline-first send/receive orchestrator. One singleton owns:
 *   - ONE RealtimeSocket (opened only when online + a session exists),
 *   - the reconnect policy (full-jitter backoff; honour close 4001; single-flight connect),
 *   - the catch-up (per-conversation `sync {cursor}` + REST `afterSeq` backfill — the
 *     no-loss backstop behind best-effort WS push),
 *   - the outbox drain worker (claim due → send → ack, or back off / surface a failure).
 *
 * The local DB is the UI's source of truth (§M0): the engine only ever MUTATES the DB; the
 * UI observes it and never waits on the network. Every timer/socket/subscription is owned
 * and disposed in `stop()` (§M7). Pure decision logic (reconcile branch, backoff schedule,
 * retry threshold) lives in `infra/db/syncLogic.ts` — this file is the wiring.
 */
import {
  appEnv,
  log,
  useRealtimeStore,
  normalizePresenceStatus,
  TYPING_TTL_MS,
} from '../../core';
import type { ConnectionState } from '../../core';
import {
  RealtimeSocket,
  WS_CODE_UNAUTHORIZED,
  hasSession,
  getAccessToken,
  getAccountId,
  getConversationMembers,
  getPresence,
  subscribePresence,
  normalizePresenceEvent,
  subscribeNetwork,
  getNetworkStatus,
  subscribeAppState,
  isAppError,
  sendChatMessage,
  fetchMessagesAfter,
  normalizeServerMessage,
  applyServerMessage,
  applyServerMessages,
  markMessageSent,
  markMessageFailed,
  markMessageSending,
  maxSeqForConversation,
  applyReceipt,
  enqueueSend,
  claimNextDue,
  markAckd,
  markFailed,
  recoverStuckSends,
  requeueFailed,
  outboxStats,
  nextOutboxRetry,
  backoffMs,
  sendMessageLocal,
  listConversationIds,
  clearUnread,
  type SendMessageInput,
} from '../../infra';

/** Lower/upper bounds for the outbox self-adjusting timer (never poll a hot loop). */
const OUTBOX_MIN_DELAY_MS = 500;
const OUTBOX_MAX_DELAY_MS = 30_000;

class SyncEngine {
  private socket: RealtimeSocket | null = null;
  private netUnsub: (() => void) | null = null;
  private appStateUnsub: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private outboxTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private online = false;
  private started = false;
  private stopped = true;
  private draining = false;
  // Ephemeral realtime (§C4/§A15) — NEVER persisted. One owned expiry timer per typing
  // conversation; `activePresencePeers` maps an open DM → the peer we're watching.
  private readonly typingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly activePresencePeers = new Map<string, string>();
  // One-shot crash-recovery: resets outbox rows orphaned in `sending` by a prior kill.
  // The first drain awaits it so it can't claim behind a stuck row.
  private recovery: Promise<unknown> | null = null;

  /** Push the connection state to the observable store (§5 addendum). */
  private setConnState(s: ConnectionState): void {
    useRealtimeStore.getState().setConnectionState(s);
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    // Recover any send orphaned in `sending` by a previous app-kill BEFORE the first
    // drain (the drain awaits this) — otherwise that row wedges its conversation forever.
    this.recovery = recoverStuckSends().catch((e: unknown) => {
      log.warn('outbox recovery failed', { reason: String(e) });
    });
    this.netUnsub = subscribeNetwork(s => this.onNetwork(s.connected));
    // §8 addendum: detect background→foreground transitions. If the socket died silently
    // while backgrounded (common on iOS), NetInfo doesn't fire — this catches it.
    this.appStateUnsub = subscribeAppState(s => {
      if (s === 'active') this.onForeground();
    });
    // Seed the initial connectivity (the subscription only fires on CHANGES).
    void getNetworkStatus()
      .then(s => this.onNetwork(s.connected))
      .catch(() => undefined);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.netUnsub) {
      this.netUnsub();
      this.netUnsub = null;
    }
    if (this.appStateUnsub) {
      this.appStateUnsub();
      this.appStateUnsub = null;
    }
    this.clearReconnectTimer();
    this.clearOutboxTimer();
    this.clearAllTyping();
    this.activePresencePeers.clear();
    useRealtimeStore.getState().reset();
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.draining = false;
  }

  // ── connectivity ─────────────────────────────────────────────────────────
  private onNetwork(connected: boolean): void {
    const was = this.online;
    this.online = connected;
    if (this.stopped) return;
    if (connected && !was) {
      this.reconnectAttempts = 0;
      this.connect();
      this.kickOutbox();
    } else if (!connected && was) {
      // Went offline — tear the socket down and pause the outbox (no hammering).
      this.setConnState('disconnected');
      this.clearReconnectTimer();
      const s = this.socket;
      this.socket = null;
      s?.close();
      this.clearOutboxTimer();
    }
  }

  /**
   * §8 addendum: foreground recovery. If the socket died silently while the app was
   * backgrounded (common on iOS), reconnect and catch up. Single-flight: `connect()`
   * guards `if (this.socket) return`, so this never creates a duplicate socket.
   */
  private onForeground(): void {
    if (this.stopped || !this.online) return;
    if (!this.socket || !this.socket.isActive) {
      log.info('foreground resume: socket dead, reconnecting');
      this.reconnectAttempts = 0;
      this.connect();
    }
    this.kickOutbox();
  }

  // ── socket lifecycle ─────────────────────────────────────────────────────
  private connect(): void {
    if (this.stopped) return;
    if (this.socket) return; // single-flight: one socket per engine
    if (!this.online || !hasSession()) return;
    const token = getAccessToken();
    if (!token) return;
    this.clearReconnectTimer();
    this.setConnState('connecting');
    const socket = new RealtimeSocket({
      onOpen: () => {
        this.reconnectAttempts = 0;
        this.setConnState('connected');
        log.info('ws open');
      },
      onConnected: () => {
        void this.resyncAll();
        this.kickOutbox();
      },
      onMessage: data => {
        void this.onInboundMessage(data);
      },
      onReceipt: data => {
        void this.onInboundReceipt(data);
      },
      onTyping: (data, state) => {
        this.onInboundTyping(data, state);
      },
      onPresence: data => {
        this.onInboundPresence(data);
      },
      onReconnectRequested: () => {
        this.onServerReconnect();
      },
      onClose: (code, reason) => {
        this.onSocketClose(code, reason);
      },
    });
    this.socket = socket;
    socket.connect(token, appEnv.wsUrl);
  }

  private onSocketClose(code: number, reason: string): void {
    this.socket = null;
    // Peers' "typing" is no longer trustworthy once the link drops — clear all indicators.
    this.clearAllTyping();
    log.info('ws closed', { code, reason });
    if (this.stopped) return;
    if (code === WS_CODE_UNAUTHORIZED) {
      // Missing/invalid account_id/device_id on the socket — don't hammer with a bad token;
      // a future connectivity change or app relaunch re-attempts with a fresh session.
      this.setConnState('disconnected');
      log.warn('ws unauthorized (4001) — not reconnecting');
      return;
    }
    if (this.online && hasSession()) {
      this.setConnState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setConnState('disconnected');
    }
  }

  private onServerReconnect(): void {
    // Server asked us to drain then it closes 1001. Push a final drain, close proactively,
    // and reconnect promptly (reset the backoff — this is a graceful, expected cycle).
    void this.drainOutbox();
    const s = this.socket;
    this.socket = null;
    s?.close();
    if (this.stopped || !this.online || !hasSession()) return;
    this.reconnectAttempts = 0;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const attempt = ++this.reconnectAttempts;
    const delay = backoffMs(attempt);
    log.info('ws reconnect scheduled', { attempt, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── catch-up (reconnect backfill) ────────────────────────────────────────
  private async resyncAll(): Promise<void> {
    if (this.stopped) return;
    this.setConnState('syncing');
    let ids: string[] = [];
    try {
      ids = await listConversationIds();
    } catch {
      ids = [];
    }
    for (const id of ids) {
      if (this.stopped || !this.socket) break;
      try {
        const cursor = await maxSeqForConversation(id);
        this.socket?.send('sync', { conversationId: id, cursor });
        const missed = await fetchMessagesAfter(id, cursor);
        if (missed.length > 0) await applyServerMessages(missed);
      } catch (e) {
        log.warn('resync conversation failed', { id, reason: String(e) });
      }
    }
    if (!this.stopped && this.socket) this.setConnState('live');
  }

  // ── inbound frames ───────────────────────────────────────────────────────
  private async onInboundMessage(data: unknown): Promise<void> {
    const m = normalizeServerMessage(data);
    if (!m) return;
    // A new message from the peer means they've stopped typing — clear the indicator (§C4).
    this.clearTyping(m.conversationId);
    try {
      await applyServerMessage(m);
      // Live fan-out frames are metadata-only (no body) unless the message was server-readable,
      // so an inbound frame often has no `content` → the bubble would render blank. Pull the
      // persisted message over REST (which DOES carry content) to fill it in. Best-effort.
      if (m.content === undefined || m.content === '') {
        try {
          const filled = await fetchMessagesAfter(
            m.conversationId,
            Math.max(0, m.seq - 1),
          );
          if (filled.length > 0) await applyServerMessages(filled);
        } catch {
          // best-effort: the metadata row still exists; content syncs on next catch-up
        }
      }
      if (m.senderId !== getAccountId()) {
        this.socket?.send('delivered', {
          conversationId: m.conversationId,
          seq: m.seq,
        });
      }
    } catch (e) {
      log.warn('apply inbound message failed', { reason: String(e) });
    }
  }

  private async onInboundReceipt(data: unknown): Promise<void> {
    const d =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const conversationId =
      typeof d.conversationId === 'string'
        ? d.conversationId
        : typeof d.conversation_id === 'string'
          ? d.conversation_id
          : undefined;
    const seqRaw = d.upToSeq ?? d.up_to_seq ?? d.seq;
    const upToSeq = typeof seqRaw === 'number' ? seqRaw : Number(seqRaw);
    const state =
      d.state === 'read'
        ? 'read'
        : d.state === 'delivered'
          ? 'delivered'
          : undefined;
    if (
      conversationId === undefined ||
      !Number.isFinite(upToSeq) ||
      state === undefined
    ) {
      return;
    }
    try {
      await applyReceipt(conversationId, upToSeq, state);
    } catch (e) {
      log.warn('apply receipt failed', { reason: String(e) });
    }
  }

  // ── outbox worker ────────────────────────────────────────────────────────
  private kickOutbox(): void {
    if (this.stopped) return;
    void this.drainOutbox();
  }

  private async drainOutbox(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      // Never claim before crash-recovery has un-stuck orphaned `sending` rows.
      if (this.recovery) await this.recovery;
      for (;;) {
        if (this.stopped || !this.online || !hasSession()) break;
        const item = await claimNextDue(Date.now());
        if (!item) break;
        try {
          const ack = await sendChatMessage(item.input);
          await markMessageSent(item.clientMsgId, ack);
          await markAckd(item.id);
        } catch (e) {
          const attempts = item.attempts + 1;
          const msg = isAppError(e) ? e.message : String(e);
          await markFailed(item.id, msg, attempts);
          if (nextOutboxRetry(attempts).state === 'failed') {
            await markMessageFailed(item.clientMsgId);
          }
          // Transient (network/timeout/5xx) → stop this pass; the timer resumes when due.
          // Non-retryable client error → keep draining other conversations.
          const transient =
            !isAppError(e) ||
            e.kind === 'network' ||
            e.kind === 'timeout' ||
            e.kind === 'server';
          if (transient) break;
        }
      }
    } finally {
      this.draining = false;
      void this.scheduleOutbox();
    }
  }

  /** Self-adjusting timer: schedule the next drain at the earliest due time, else stay idle. */
  private async scheduleOutbox(): Promise<void> {
    this.clearOutboxTimer();
    if (this.stopped || !this.online) return;
    let stats: { queued: number; nextDueAt: number | null };
    try {
      stats = await outboxStats();
    } catch {
      return;
    }
    if (stats.queued === 0) return; // idle — nothing to poll for
    const now = Date.now();
    const dueAt = stats.nextDueAt ?? now;
    const delay = Math.max(
      OUTBOX_MIN_DELAY_MS,
      Math.min(OUTBOX_MAX_DELAY_MS, dueAt - now),
    );
    this.outboxTimer = setTimeout(() => {
      this.outboxTimer = null;
      void this.drainOutbox();
    }, delay);
  }

  private clearOutboxTimer(): void {
    if (this.outboxTimer !== null) {
      clearTimeout(this.outboxTimer);
      this.outboxTimer = null;
    }
  }

  // ── public send ──────────────────────────────────────────────────────────
  /**
   * Optimistic send (§L7): write the `sending` bubble to the DB (instant UI), enqueue the
   * durable outbox item, and kick the worker. Never blocks the render path — the outbox
   * transmits + reconciles the ack, even across a mid-send crash + relaunch.
   */
  async sendText(
    conversationId: string,
    senderId: string,
    text: string,
  ): Promise<void> {
    const clientMsgId = await sendMessageLocal(conversationId, text, senderId);
    if (!clientMsgId) return;
    const input: SendMessageInput = {
      conversationId,
      senderId,
      clientMsgId,
      type: 'text',
      content: text.trim(),
    };
    await enqueueSend(conversationId, clientMsgId, input);
    this.kickOutbox();
  }

  /**
   * The user opened a conversation → clear its unread badge locally and tell the server we
   * read up to the latest seq we hold (§F2/§5). Best-effort: the read frame only goes out
   * when the socket is up; the local badge clears regardless (offline-first).
   */
  async markConversationRead(conversationId: string): Promise<void> {
    await clearUnread(conversationId);
    if (!this.socket) return;
    try {
      const seq = await maxSeqForConversation(conversationId);
      if (seq > 0) this.socket?.send('read', { conversationId, seq });
    } catch {
      // a missing cursor just means no read frame this time — the badge already cleared
    }
  }

  /**
   * Manual retry of a permanently-failed send (§L6): flip the bubble back to `sending`,
   * re-arm the outbox row, and kick the worker. Re-send is idempotent (same clientMsgId).
   */
  async retrySend(clientMsgId: string): Promise<void> {
    const requeued = await requeueFailed(clientMsgId);
    if (!requeued) return;
    await markMessageSending(clientMsgId);
    this.kickOutbox();
  }

  // ── typing (§C4) ───────────────────────────────────────────────────────────
  /**
   * Tell the server I'm typing / stopped (ephemeral, best-effort). The gateway reads these fields
   * at the frame's TOP LEVEL (`sendEphemeral` sends a FLAT `{kind:'ephemeral',type:'typing',…}`),
   * then relays `typing.started`/`typing.stopped` to the OTHER members. Dropped when offline — that
   * is fine (§C4: typing is never re-synced).
   */
  sendTyping(conversationId: string, state: 'start' | 'stop'): void {
    this.socket?.sendEphemeral('typing', { conversationId, state });
  }

  /** Inbound `typing.started`/`typing.stopped` → the live store, with an owned auto-expire timer. */
  private onInboundTyping(data: unknown, state: 'start' | 'stop'): void {
    const d =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const conversationId =
      typeof d.conversationId === 'string'
        ? d.conversationId
        : typeof d.conversation_id === 'string'
          ? d.conversation_id
          : undefined;
    const userId =
      typeof d.userId === 'string'
        ? d.userId
        : typeof d.user_id === 'string'
          ? d.user_id
          : typeof d.account_id === 'string'
            ? d.account_id
            : undefined;
    if (conversationId === undefined || userId === undefined) return;
    if (state === 'stop') {
      this.clearTyping(conversationId);
      return;
    }
    useRealtimeStore
      .getState()
      .setTyping(conversationId, userId, Date.now() + TYPING_TTL_MS);
    // Owned expiry timer (§M7): replace any existing one so the indicator self-clears if no
    // refresh / `stop` / message arrives within the TTL (the store change re-renders it away).
    const existing = this.typingTimers.get(conversationId);
    if (existing) clearTimeout(existing);
    this.typingTimers.set(
      conversationId,
      setTimeout(() => {
        this.typingTimers.delete(conversationId);
        useRealtimeStore.getState().clearTyping(conversationId);
      }, TYPING_TTL_MS),
    );
  }

  /** Clear one conversation's typing indicator + cancel its expiry timer. */
  private clearTyping(conversationId: string): void {
    const timer = this.typingTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.typingTimers.delete(conversationId);
    }
    useRealtimeStore.getState().clearTyping(conversationId);
  }

  /** Cancel every typing timer + drop all indicators (socket drop / engine stop). */
  private clearAllTyping(): void {
    for (const timer of this.typingTimers.values()) clearTimeout(timer);
    this.typingTimers.clear();
    useRealtimeStore.getState().resetTyping();
  }

  // ── presence (§A15) ────────────────────────────────────────────────────────
  /**
   * A chat became active → resolve its DM peer (members − me), subscribe to the peer's live presence
   * (fan-out targets subscribers only), and fetch the current snapshot into the store. Returns the
   * peerId, or `null` for a group / note-to-self (no single-peer presence line). Never blocks the UI:
   * every network call is best-effort and off the render path.
   */
  async activatePresence(conversationId: string): Promise<string | null> {
    const me = getAccountId();
    if (!me) return null;
    let peerId: string | null = null;
    try {
      const members = await getConversationMembers(conversationId);
      const others = members.filter(m => m !== me);
      peerId = others.length === 1 ? (others[0] ?? null) : null;
    } catch (e) {
      log.warn('presence members resolve failed', { reason: String(e) });
      return null;
    }
    if (peerId === null) return null;
    this.activePresencePeers.set(conversationId, peerId);
    const peer = peerId;
    void subscribePresence(me, [peer]).catch((e: unknown) => {
      log.warn('presence subscribe failed', { reason: String(e) });
    });
    try {
      const p = await getPresence(peer, me);
      useRealtimeStore.getState().setPresence(peer, {
        status: normalizePresenceStatus(p.status),
        lastSeen: p.lastSeen,
      });
    } catch (e) {
      log.warn('presence fetch failed', { reason: String(e) });
    }
    return peer;
  }

  /** A chat closed → stop tracking its peer (the last-known snapshot may stay in the store). */
  deactivatePresence(conversationId: string): void {
    this.activePresencePeers.delete(conversationId);
  }

  /** Inbound live presence frame (`presence`/`presence.changed`) → the store. */
  private onInboundPresence(data: unknown): void {
    const ev = normalizePresenceEvent(data);
    if (!ev) return;
    useRealtimeStore.getState().setPresence(ev.userId, {
      status: normalizePresenceStatus(ev.status),
      lastSeen: ev.lastSeen,
    });
  }

  /**
   * §26 addendum: development-time runtime diagnostics. Exposes a non-sensitive snapshot
   * of the engine's internal state for debugging. Never exposes tokens, content, or credentials.
   */
  getDiagnostics(): {
    connectionState: ConnectionState;
    socketActive: boolean;
    reconnectAttempts: number;
    online: boolean;
    started: boolean;
    stopped: boolean;
    draining: boolean;
    outboxTimerActive: boolean;
    reconnectTimerActive: boolean;
    activePresencePeers: number;
    typingTimers: number;
  } {
    return {
      connectionState: useRealtimeStore.getState().connectionState,
      socketActive: this.socket?.isActive ?? false,
      reconnectAttempts: this.reconnectAttempts,
      online: this.online,
      started: this.started,
      stopped: this.stopped,
      draining: this.draining,
      outboxTimerActive: this.outboxTimer !== null,
      reconnectTimerActive: this.reconnectTimer !== null,
      activePresencePeers: this.activePresencePeers.size,
      typingTimers: this.typingTimers.size,
    };
  }
}

/** The app-wide singleton (§L6). Started at the root; owns all sync resources. */
export const syncEngine = new SyncEngine();

/** Start the engine app-wide (call once on mount at the root). */
export function startSync(): void {
  syncEngine.start();
}

/** Stop + fully dispose the engine (call on root unmount). */
export function stopSync(): void {
  syncEngine.stop();
}
