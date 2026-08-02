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
import { appEnv, log } from '../../core';
import {
  RealtimeSocket,
  WS_CODE_UNAUTHORIZED,
  hasSession,
  getAccessToken,
  getAccountId,
  subscribeNetwork,
  getNetworkStatus,
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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private outboxTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private online = false;
  private started = false;
  private stopped = true;
  private draining = false;
  // One-shot crash-recovery: resets outbox rows orphaned in `sending` by a prior kill.
  // The first drain awaits it so it can't claim behind a stuck row.
  private recovery: Promise<unknown> | null = null;

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
    this.clearReconnectTimer();
    this.clearOutboxTimer();
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
      this.clearReconnectTimer();
      const s = this.socket;
      this.socket = null;
      s?.close();
      this.clearOutboxTimer();
    }
  }

  // ── socket lifecycle ─────────────────────────────────────────────────────
  private connect(): void {
    if (this.stopped) return;
    if (this.socket) return; // single-flight: one socket per engine
    if (!this.online || !hasSession()) return;
    const token = getAccessToken();
    if (!token) return;
    this.clearReconnectTimer();
    const socket = new RealtimeSocket({
      onOpen: () => {
        this.reconnectAttempts = 0;
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
    log.info('ws closed', { code, reason });
    if (this.stopped) return;
    if (code === WS_CODE_UNAUTHORIZED) {
      // Missing/invalid account_id/device_id on the socket — don't hammer with a bad token;
      // a future connectivity change or app relaunch re-attempts with a fresh session.
      log.warn('ws unauthorized (4001) — not reconnecting');
      return;
    }
    if (this.online && hasSession()) this.scheduleReconnect();
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
  }

  // ── inbound frames ───────────────────────────────────────────────────────
  private async onInboundMessage(data: unknown): Promise<void> {
    const m = normalizeServerMessage(data);
    if (!m) return;
    try {
      await applyServerMessage(m);
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
