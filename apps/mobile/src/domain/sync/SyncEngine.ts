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
  recordLatency,
  logLatencySnapshot,
} from '../../core';
import type { ConnectionState } from '../../core';
import {
  RealtimeSocket,
  WS_CODE_UNAUTHORIZED,
  hasSession,
  subscribeSession,
  getAccessToken,
  refreshAccessToken,
  getAccountId,
  getDeviceId,
  getConversationMembers,
  setNativeSafeReadSeq,
  maxContiguousSeqForConversation,
  countMessagesWithSeq,
  getPresence,
  subscribePresence,
  presenceOnline,
  presenceOffline,
  presenceHeartbeat,
  normalizePresenceEvent,
  subscribeNetwork,
  getNetworkStatus,
  subscribeAppState,
  isAppError,
  AppError,
  sendChatMessage,
  fetchMessagesAfter,
  fetchPeerReceipts,
  normalizeServerMessage,
  applyServerMessage,
  applyServerMessages,
  markMessageSent,
  markMessageFailed,
  markMessageSending,
  maxSeqForConversation,
  minSeqForConversation,
  applyReceipt,
  parseReceiptFrame,
  enqueueOptimisticSend,
  findQuotedMessages,
  claimNextDue,
  markAckd,
  markFailed,
  recoverStuckSends,
  requeueFailed,
  outboxStats,
  classifySendFailure,
  shouldProbeGap,
  backoffMs,
  listConversationIds,
  clearUnread,
  upsertConversation,
  peerIdFor,
  pendingReceiptFrames,
  getDesired,
  getSent,
  noteDesired,
  noteSent,
  getPeerWatermark,
  notePeerWatermark,
  markDirty,
  takeDirty,
  reassertReceipts,
} from '../../infra';
import type { SendMessageInput } from '../../infra';

/** Lower/upper bounds for the outbox self-adjusting timer (never poll a hot loop). */
const OUTBOX_MIN_DELAY_MS = 500;
const OUTBOX_MAX_DELAY_MS = 30_000;
/**
 * How many times a 4001 may be answered with a token refresh before the engine concludes the
 * session is genuinely dead. Bounded so a revoked session degrades to "no realtime" instead of
 * an endless refresh↔connect loop hammering the gateway (the exact shape that earns a 429).
 */
const MAX_AUTH_REFRESH_ATTEMPTS = 2;
/**
 * Safety ceiling on how many pages `fetchOlderMessages` will step back over in ONE call while
 * searching for the first non-deleted page (VC-027). Real deletion runs are nowhere near this
 * wide; it exists purely so a pathological/corrupt history can't turn one scroll gesture into an
 * unbounded request storm — it still returns `false` (today's exact behaviour) in that case
 * rather than hang.
 */
const MAX_HOLE_HOPS = 200;
/**
 * Receipts are coalesced over this window before going out. A burst of inbound messages must cost
 * ONE cumulative frame, not one per message: the gateway drops inbound frames above ~40/sec per
 * connection, silently and shared, so a chatty group could otherwise starve `read` and `sync`.
 */
const RECEIPT_FLUSH_DELAY_MS = 250;
/**
 * Per-tick ceiling on receipt frames `flushReceipts` will emit (VC-025). Kept well under the
 * gateway's ~40/sec inbound budget deliberately: receipts share that budget with everything else
 * on the connection (outbox sends, typing), so a reassert must leave room rather than claim it
 * all for itself.
 */
const MAX_RECEIPT_FRAMES_PER_FLUSH = 20;
/**
 * Gap between chunks of an over-budget flush — comfortably longer than the gateway's own
 * per-second window, so consecutive chunks land in SEPARATE rate-limit windows instead of one
 * burst split across two ticks that still lands in the same second.
 */
const RECEIPT_FLUSH_CHUNK_DELAY_MS = 1100;
/**
 * Conversations backfilled concurrently on reconnect. Sequential catch-up leaves a 500-chat user
 * "syncing" for minutes; unbounded fan-out is a self-inflicted burst against the edge limiter.
 */
const RESYNC_CONCURRENCY = 4;
/**
 * Conversations whose catch-up the user actually waits on. `syncing` should describe the chat in
 * front of them, not a walk of their entire history: with a few hundred conversations the banner
 * otherwise sits there through hundreds of round-trips while the app is already perfectly usable.
 * The rest continue quietly afterwards — the same work, just not presented as a wait.
 */
const PRIORITY_SYNC_COUNT = 8;
/** Matches the server's hard clamp — a full page means "there is more", so keep paging. */
const BACKFILL_PAGE = 100;
/** Safety stop for the paging loop: 100 pages = 10k messages in one conversation, per resync. */
const MAX_BACKFILL_PAGES = 100;
/**
 * Grace period before a backgrounded app tears its socket down (§M13). Not zero: switching apps
 * for a few seconds is constant, and suspend-on-blur would turn every glance at the notification
 * shade into a reconnect + full catch-up. Long enough to ride out a quick switch, short enough
 * that a phone in a pocket is never holding a socket open.
 */
const BACKGROUND_SUSPEND_DELAY_MS = 30_000;
/**
 * How often we refresh our OWN presence server-side. Must be comfortably inside the server's
 * `PRESENCE_ONLINE_TTL_MS` (30 s) `online:{userId}` TTL or we flicker offline while still connected; 20 s leaves room for
 * one lost request. The realtime gateway never reports our socket to the presence service (its
 * `ping` refreshes only its own connection registry), so if the client doesn't do this, nobody
 * does — which is why every peer appeared offline regardless of what they were doing.
 */
const PRESENCE_HEARTBEAT_MS = 20_000;
/**
 * How often the OPEN chat re-reads its peer's presence. The gateway fans no `presence.changed`
 * frame to sockets, so there is no push to wait for: a one-shot read at chat-open was simply a
 * snapshot that went stale seconds later and never recovered. Also re-subscribes, since the
 * server's `subscribers:{u}` set expires after 300 s.
 */
const PEER_PRESENCE_POLL_MS = 20_000;

class SyncEngine {
  private socket: RealtimeSocket | null = null;
  private netUnsub: (() => void) | null = null;
  private appStateUnsub: (() => void) | null = null;
  private sessionUnsub: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private outboxTimer: ReturnType<typeof setTimeout> | null = null;
  private receiptTimer: ReturnType<typeof setTimeout> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  /** Owned timers for the presence pair: our own keepalive, and the open chat's peer refresh. */
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private peerPresenceTimer: ReturnType<typeof setInterval> | null = null;
  /** True once we have told the server this device is online (so we only say "offline" if so). */
  private presenceAnnounced = false;
  /** True while the app is backgrounded and the socket has been deliberately released. */
  private suspended = false;
  /**
   * Whether a push channel can wake us. §M13's "no background WebSocket" rule is only safe
   * BECAUSE push delivers while we sleep — without it, releasing the socket means the user
   * simply stops receiving messages the moment the app leaves the foreground. So the rule is
   * gated on the premise actually holding; `infra/push` sets this once FCM/APNs is registered.
   */
  private pushAvailable = false;
  /**
   * The conversation the user is currently looking at. Messages that land here are read the
   * instant they arrive — that is what makes the peer's ticks turn blue live, and what stops the
   * unread badge from climbing on the chat the user is staring at.
   */
  private activeConversationId: string | null = null;
  private reconnectAttempts = 0;
  /** Consecutive 4001s answered with a refresh; reset once a socket actually opens. */
  private authRefreshAttempts = 0;
  private online = false;
  private started = false;
  private stopped = true;
  private draining = false;
  /**
   * The walk currently in progress, so a caller who needs the queue actually EMPTY can wait for
   * it instead of being told it is somebody else's problem. See `flushOutboxNow`.
   */
  private drainInFlight: Promise<void> | null = null;
  /** Set when the server rate-limits a send; no drain runs before it expires. */
  private outboxCooldownUntil = 0;
  /**
   * When realtime last went down. The gap until the next successful open is how long the user was
   * actually cut off — the number that decides whether a flaky link is survivable, and one no unit
   * test can observe.
   */
  private lastCloseAt: number | null = null;
  /**
   * Per conversation, the cursor a gap-probe last ran from. Deleted messages leave a permanent,
   * legitimate hole in `seq`, so a probe that comes back empty must not be repeated on every
   * later message — only a cursor that actually moved earns another.
   */
  private readonly gapProbedFrom = new Map<string, number>();
  /**
   * In-flight "load older" per conversation. Two callers that both read the cursor before either
   * writes will fetch the SAME page and insert it twice: the dedup in `applyServerMessages`
   * decides from a read taken before its write, so concurrent applies each conclude the rows are
   * new. A double-tap at the top of a chat is enough to produce it.
   */
  private readonly loadingOlder = new Map<string, Promise<boolean>>();
  /**
   * Resolves an account id to a display name. INJECTED by the feature layer (§M3: domain must
   * not import features), because a brand-new DM arrives as a bare account id and would
   * otherwise sit in the chat list showing a raw UUID until the next cold start.
   */
  private displayNameResolver:
    ((accountId: string) => Promise<string | undefined>) | null = null;
  /** Account ids we already tried to name — one attempt each, never a retry loop per message. */
  private readonly namedPeers = new Set<string>();
  // Ephemeral realtime (§C4/§A15) — NEVER persisted. One owned expiry timer per typing
  // conversation; `activePresencePeers` maps an open DM → the peer we're watching.
  private readonly typingTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly activePresencePeers = new Map<string, string>();
  /**
   * Bumped by every close. `activatePresence` captures it before its first await and bails if it
   * has moved, because that means the chat it was resolving for is no longer open (VC-065).
   * Without it the late resume registered a peer AFTER the close had deleted it — a ghost the map
   * could never lose, which made `deactivatePresence` stop clearing timers for the whole session
   * — and started a 20s poll for a chat nobody was looking at.
   */
  private presenceEpoch = 0;

  /** When the last receipt chunk actually went out — see `flushReceipts` (VC-025). */
  private lastReceiptChunkAt = 0;

  /**
   * Per conversation, the seq up to which the SERVER has been asked and has answered — so any
   * hole below it is proven legitimate rather than merely missing.
   *
   * The contiguity clamp (VC-069) exists to stop a cumulative `read` covering a message this
   * device never received. On its own it assumes every hole is fillable, and on this backend
   * that is false in two ways: history filters `deleted:false`, so a delete-for-everyone leaves
   * a seq that can NEVER be served again, and the seq counter is incremented before the insert
   * with no release path, so a failed send burns one permanently. Clamping on a hole like that
   * would freeze the watermark for the life of the install — the sender stuck on a grey tick
   * forever, which is worse than the bug the clamp fixes.
   *
   * A completed catch-up is the proof: if we asked for everything after X and the server ran out,
   * whatever is still missing below the newest is not coming. In memory on purpose — losing it
   * on a restart costs one clamped window until the next sync, and a wrong PERSISTED floor would
   * be the permanent lie all over again.
   */
  private readonly provenFloor = new Map<string, number>();

  /**
   * Which `activatePresence` call owns each conversation's entry, by epoch.
   *
   * The epoch alone says "something closed since I started"; it does not say whether the entry
   * under this id is still MINE. Open a chat, back out, re-open it, and the first call's network
   * fetch can resolve after the second call has already registered and started polling — its
   * undo would then delete a live registration and stop the poll for a chat that is on screen,
   * leaving the presence line frozen until the user leaves and comes back.
   */
  private readonly presenceOwner = new Map<string, number>();
  // One-shot crash-recovery: resets outbox rows orphaned in `sending` by a prior kill.
  // The first drain awaits it so it can't claim behind a stuck row.
  private recovery: Promise<unknown> | null = null;
  /** Single-flight for `resyncNow()` — see the note there. */
  private pushResync: Promise<void> | null = null;

  /**
   * Declare that push can wake the app. Until this is true the engine keeps its socket while
   * backgrounded, because dropping it would trade battery for undelivered messages.
   */
  setPushAvailable(available: boolean): void {
    this.pushAvailable = available;
    if (!available && this.suspended) {
      // Push went away while we were asleep — come back up rather than stay deaf.
      this.suspended = false;
      this.clearSuspendTimer();
      this.connect();
      this.kickOutbox();
    }
  }

  /** Provide the profile lookup used to name a newly-arrived DM (called once, at startup). */
  setDisplayNameResolver(
    fn: (accountId: string) => Promise<string | undefined>,
  ): void {
    this.displayNameResolver = fn;
  }

  /**
   * A DM created from an inbound message is named by the sender's ACCOUNT ID, because that is all
   * the message carries. Resolve it to a real name so the chat list doesn't show a raw UUID until
   * the app is restarted.
   */
  private async nameStubConversation(
    conversationId: string,
    senderId: string,
  ): Promise<void> {
    const resolve = this.displayNameResolver;
    if (!resolve || this.namedPeers.has(senderId)) return;
    this.namedPeers.add(senderId);
    try {
      const name = (await resolve(senderId))?.trim();
      if (name) await upsertConversation(conversationId, { name });
    } catch {
      // Best-effort: the id remains as the label until the next launch resolves it.
    }
  }

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
    // A sign-in that happens while the app is ALREADY RUNNING is the case this engine could
    // not previously see: `connect()` refuses to open a socket without a session, and it only
    // re-arms on a network/foreground transition — neither of which a login causes. So the
    // socket stayed shut for the rest of the run and the user received nothing (no messages,
    // no receipts → no ticks, no presence) until they force-quit. Now the session itself tells us.
    this.sessionUnsub = subscribeSession(present => {
      if (this.stopped) return;
      if (present) {
        this.onSessionEstablished();
      } else {
        this.onSessionCleared();
      }
    });
    // §8 addendum: detect background→foreground transitions. If the socket died silently
    // while backgrounded (common on iOS), NetInfo doesn't fire — this catches it.
    this.appStateUnsub = subscribeAppState(s => {
      if (s === 'active') {
        this.clearSuspendTimer();
        this.suspended = false;
        this.onForeground();
        // Presence follows the FOREGROUND, not the socket. The server uses it to decide whether
        // a push would be noise, so it has to be re-announced here — the socket may well have
        // stayed open across the switch, in which case nothing else would restart it.
        this.startSelfPresence();
      } else {
        // Backgrounding is the natural reporting boundary: a session's numbers, emitted once,
        // where they cost nothing. This must NOT live inside the suspend timer — that is gated
        // on push being available, so the snapshot would never fire while push is missing.
        logLatencySnapshot();
        // Announce offline IMMEDIATELY, before and independently of the socket suspend.
        //
        // Waiting for the suspend left a 30-second window in which a backgrounded user still
        // counted as online and received no notification — and when push was unavailable the
        // suspend never ran at all, so that window was the rest of the session. Presence is
        // about ATTENTION, not connectivity: the moment the app is not in front of the user, a
        // message deserves a notification.
        this.stopSelfPresence();
        this.scheduleSuspend();
      }
    });
    // Seed the initial connectivity (the subscription only fires on CHANGES).
    void getNetworkStatus()
      .then(s => this.onNetwork(s.connected))
      .catch(() => undefined);
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    // Forget the connectivity of the session that just ended. `connect()` only fires on a
    // TRANSITION to online, and `start()` seeds that from a fresh NetInfo read — so a remembered
    // `true` makes the seed look like "no change" and the next session runs with NO socket at all:
    // no inbound messages, no ticks, no presence, until the app is force-quit. `stopSync`/
    // `startSync` bracket the authenticated session, so this is precisely the sign-out → sign-in path.
    this.online = false;
    if (this.netUnsub) {
      this.netUnsub();
      this.netUnsub = null;
    }
    if (this.appStateUnsub) {
      this.appStateUnsub();
      this.appStateUnsub = null;
    }
    if (this.sessionUnsub) {
      this.sessionUnsub();
      this.sessionUnsub = null;
    }
    this.clearReconnectTimer();
    this.clearOutboxTimer();
    this.clearReceiptTimer();
    this.clearSuspendTimer();
    this.clearPeerPresenceTimer();
    this.stopSelfPresence();
    this.suspended = false;
    this.clearAllTyping();
    this.activeConversationId = null;
    this.gapProbedFrom.clear();
    this.loadingOlder.clear();
    this.namedPeers.clear();
    this.lastReceiptChunkAt = 0; // a new run must not inherit the old one's chunk window
    this.presenceEpoch += 1; // an activate still in flight must not repopulate this
    this.presenceOwner.clear();
    this.activePresencePeers.clear();
    this.presenceOwner.clear();
    this.provenFloor.clear();
    // Not awaited, but it must not be remembered: a resync in flight when the session ends would
    // otherwise make the NEXT session's first `resyncNow()` a no-op returning the old promise.
    this.pushResync = null;
    useRealtimeStore.getState().reset();
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.draining = false;
    this.drainInFlight = null;
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
      // Going offline took the open chat's presence poll with it (the `else` branch below).
      // Nothing else will put it back — the chat screen never unmounted, so the effect that
      // starts the poll will not run again.
      this.resumePeerPresence();
    } else if (!connected && was) {
      // Went offline — tear the socket down and pause the outbox (no hammering).
      this.setConnState('disconnected');
      this.clearReconnectTimer();
      const s = this.socket;
      this.socket = null;
      s?.close();
      this.clearOutboxTimer();
      this.clearPeerPresenceTimer();
      this.stopSelfPresence();
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
    // Same reasoning as the socket: whatever the open chat was watching went stale (or stopped
    // entirely) while we were away, and returning to it is exactly when the user looks at it.
    this.resumePeerPresence();
  }

  /**
   * The user just signed in (in-session), so everything that was gated on "no session" can now
   * run. Reset the backoff/refresh budgets first: attempts accumulated while signed out say
   * nothing about this fresh, known-good token, and leaving them set would delay the first
   * connect by the tail of an old backoff.
   */
  private onSessionEstablished(): void {
    log.info('session established: connecting realtime');
    this.reconnectAttempts = 0;
    this.authRefreshAttempts = 0;
    this.clearReconnectTimer();
    this.connect();
    this.kickOutbox();
  }

  /**
   * Signed out (or the session was revoked). Drop the socket rather than let it keep running on
   * a token that is gone — the gateway would close it as 4001 anyway, and the recovery path
   * would then burn its refresh budget trying to revive a session that no longer exists.
   */
  private onSessionCleared(): void {
    log.info('session cleared: releasing realtime');
    this.clearReconnectTimer();
    this.clearAllTyping();
    this.clearPeerPresenceTimer();
    // Announce offline BEFORE the token disappears — afterwards the request would 401.
    this.stopSelfPresence();
    this.activeConversationId = null;
    this.gapProbedFrom.clear();
    this.namedPeers.clear();
    this.lastReceiptChunkAt = 0; // a new run must not inherit the old one's chunk window
    this.presenceEpoch += 1; // an activate still in flight must not repopulate this
    this.presenceOwner.clear();
    this.activePresencePeers.clear();
    this.presenceOwner.clear();
    this.provenFloor.clear();
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.setConnState('disconnected');
  }

  // ── socket lifecycle ─────────────────────────────────────────────────────
  private connect(): void {
    if (this.stopped) return;
    if (this.suspended) return; // backgrounded: §M13 holds no socket
    if (this.socket) return; // single-flight: one socket per engine
    if (!this.online || !hasSession()) return;
    const token = getAccessToken();
    if (!token) return;
    this.clearReconnectTimer();
    this.setConnState('connecting');
    const socket = new RealtimeSocket({
      onOpen: () => {
        if (this.lastCloseAt !== null) {
          recordLatency('ws.reconnect', Date.now() - this.lastCloseAt);
          this.lastCloseAt = null;
        }
        this.reconnectAttempts = 0;
        // The token is proven good — re-arm the 4001 refresh budget for the next expiry.
        this.authRefreshAttempts = 0;
        this.setConnState('connected');
        // An open socket IS this device being online — and the ONLY thing that can tell the
        // presence service so, because the gateway never reports it (see infra/network/presence).
        this.startSelfPresence();
        log.info('ws open');
      },
      onConnected: () => {
        // A frame we handed to a dead or misbehaving link was recorded as sent even though the
        // peer never saw it — which is how a tick gets stuck on one tick permanently, since the
        // only client that could correct it believes the work is done. A reconnect is exactly when
        // that belief is worthless, so re-announce what we want the peer to know.
        for (const id of reassertReceipts()) markDirty(id);
        // Re-emit anything the peer still doesn't know BEFORE the catch-up: receipts owed from
        // before the drop are the ones most likely to be showing a stale tick right now.
        this.flushReceipts();
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
    // Only the FIRST close of an outage starts the clock; retries that fail to open must not
    // reset it, or a long outage would be reported as a series of short ones.
    if (this.lastCloseAt === null) this.lastCloseAt = Date.now();
    this.socket = null;
    // Peers' "typing" is no longer trustworthy once the link drops — clear all indicators.
    this.clearAllTyping();
    // The link is gone, so this device is no longer reachable: say so rather than let the TTL
    // expire silently (which would leave the peer's "last seen" up to 30s wrong).
    this.stopSelfPresence();
    log.info('ws closed', { code, reason });
    if (this.stopped) return;
    if (code === WS_CODE_UNAUTHORIZED) {
      this.setConnState('disconnected');
      void this.recoverFromUnauthorized();
      return;
    }
    if (this.online && hasSession()) {
      this.setConnState('reconnecting');
      this.scheduleReconnect();
    } else {
      this.setConnState('disconnected');
    }
  }

  /**
   * A 4001 is the gateway refusing the handshake's token. The overwhelmingly common cause is an
   * access token that EXPIRED WHILE THE APP WAS BACKGROUNDED — the token rides the connect URL,
   * so unlike REST there is no interceptor to refresh it mid-flight. Treating that as fatal is
   * what makes realtime silently dead until the user force-quits: the socket never retries, and
   * `onNetwork`/`onForeground` only reconnect on a transition that may never come.
   *
   * So: refresh once (the refresh call is single-flight), then let the normal backoff reconnect
   * with the fresh token. A genuinely revoked session fails the refresh and stays disconnected.
   */
  private async recoverFromUnauthorized(): Promise<void> {
    if (this.stopped || !this.online || !hasSession()) return;
    if (this.authRefreshAttempts >= MAX_AUTH_REFRESH_ATTEMPTS) {
      log.warn(
        'ws unauthorized (4001) — refresh exhausted, staying disconnected',
      );
      return;
    }
    this.authRefreshAttempts += 1;
    const token = await refreshAccessToken().catch(() => null);
    // The world may have moved while the refresh was in flight (stop/offline/logout).
    if (this.stopped || !this.online || !hasSession()) return;
    if (!token) {
      log.warn(
        'ws unauthorized (4001) — token refresh failed, staying disconnected',
      );
      return;
    }
    log.info('ws unauthorized (4001) — token refreshed, reconnecting');
    this.setConnState('reconnecting');
    this.reconnectAttempts = 0;
    this.scheduleReconnect();
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

  /**
   * §M13: an app in the background holds NO WebSocket. The socket's 25s ping and watchdog, plus
   * the outbox timer, otherwise keep waking the device all night for a user who is asleep —
   * hundreds of wakeups, a socket the OS may kill silently anyway, and a battery budget blown.
   * Delivery while backgrounded is push's job; the cursor catch-up on resume is the backstop.
   */
  private scheduleSuspend(): void {
    if (this.stopped || this.suspended || this.suspendTimer !== null) return;
    // No push channel = the socket IS the delivery path. Releasing it would save battery by
    // making the app stop receiving messages, which is not a trade worth making.
    if (!this.pushAvailable) return;
    this.suspendTimer = setTimeout(() => {
      this.suspendTimer = null;
      if (this.stopped) return;
      this.suspended = true;
      // Flush what the peer is owed BEFORE releasing the socket — otherwise a read the user just
      // performed sits in the ledger until the next foreground.
      this.flushReceipts();
      this.clearReconnectTimer();
      this.clearOutboxTimer();
      this.clearReceiptTimer();
      this.clearAllTyping();
      this.clearPeerPresenceTimer();
      // Backgrounded with the socket released = offline to everyone else. Announce it so the
      // peer sees a real "last seen" instead of a user who never goes away.
      this.stopSelfPresence();
      const s = this.socket;
      this.socket = null;
      s?.close();
      this.setConnState('disconnected');
    }, BACKGROUND_SUSPEND_DELAY_MS);
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
  }

  private clearReceiptTimer(): void {
    if (this.receiptTimer !== null) {
      clearTimeout(this.receiptTimer);
      this.receiptTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── catch-up (reconnect backfill) ────────────────────────────────────────
  /**
   * Catch up now, on demand — the push layer's entry point (§M13 "push → bounded sync → sleep").
   *
   * Single-flighted against itself, because the two callers can easily coincide: a data push
   * arriving while JS is alive, and FCM reporting that it DROPPED messages for this device. Two
   * concurrent walks would double every backfill request for no gain.
   *
   * Deliberately reuses the reconnect path rather than fetching the pushed message by id: a push
   * is a hint, not a delivery, and the cursor sync is what makes "we have everything up to N"
   * true even when several pushes were coalesced or dropped (§G4).
   */
  async resyncNow(): Promise<void> {
    if (this.stopped) return;
    if (this.pushResync) return this.pushResync;
    this.pushResync = this.resyncAll()
      .catch(() => undefined)
      .finally(() => {
        this.pushResync = null;
      });
    return this.pushResync;
  }

  /**
   * Catch up every conversation after a reconnect. Four properties are deliberate:
   *
   *  - The conversation on screen goes FIRST. Everything else can settle in the background; the
   *    one the user is staring at cannot.
   *  - Bounded concurrency, not a sequential walk. At 200 ms RTT a 500-chat user would otherwise
   *    sit in `syncing` for well over a minute before a single message appeared.
   *  - A socket drop mid-catch-up must NOT abandon the tail. The backfill is plain REST and stays
   *    valid without the socket; aborting meant that on a flapping link the far end of the
   *    conversation list was never caught up, permanently.
   *  - No per-conversation `sync` frame. The gateway only echoes that cursor back — it replays
   *    nothing — so one frame per conversation was pure noise that consumed the ~40/sec inbound
   *    budget and got real receipts dropped alongside it.
   */
  private async resyncAll(): Promise<void> {
    if (this.stopped) return;
    // Only CLAIM to be syncing when this is a post-connect catch-up.
    //
    // `resyncNow()` (the push path) can run with no socket at all, and this method only restored
    // the state to `live` when one existed — so a push-triggered catch-up left the UI stuck on
    // "syncing" indefinitely, describing work nobody was waiting on. A background catch-up should
    // be silent; the banner belongs to the socket's own lifecycle.
    const announce = this.socket !== null;
    if (announce) this.setConnState('syncing');
    let ids: string[] = [];
    try {
      ids = await listConversationIds();
    } catch {
      ids = [];
    }
    const active = this.activeConversationId;
    if (active && ids.includes(active)) {
      ids = [active, ...ids.filter(id => id !== active)];
    }

    // The conversation on screen plus the most recent handful — everything a user could be
    // looking at right now. `ids` is already most-recent-first.
    const priority = ids.slice(0, PRIORITY_SYNC_COUNT);
    const rest = ids.slice(PRIORITY_SYNC_COUNT);

    await this.backfillMany(priority);
    // Receipts owed for what just landed, then report live: the app IS current for everything the
    // user can see. Holding `syncing` until the whole history is walked describes work nobody is
    // waiting on and reads as a hang.
    this.flushReceipts();
    // Not `announce &&` alone: if the socket died mid-catch-up, `onSocketClose` has already
    // published the truthful state and overwriting it with `live` would be a lie.
    if (announce && !this.stopped && this.socket) this.setConnState('live');

    if (rest.length > 0) {
      // Deliberately not awaited: the remainder converges in the background.
      void this.backfillMany(rest)
        .then(() => {
          this.flushReceipts();
        })
        .catch(() => undefined);
    }
  }

  /** Backfill a set of conversations with bounded concurrency. */
  private async backfillMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        if (this.stopped) return;
        const i = next++;
        if (i >= ids.length) return;
        const id = ids[i];
        if (id === undefined) return;
        try {
          await this.backfillConversation(id);
        } catch (e) {
          log.warn('resync conversation failed', { id, reason: String(e) });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(RESYNC_CONCURRENCY, ids.length) }, worker),
    );
  }

  /**
   * Pull everything past our local cursor for one conversation, PAGING until the server runs out.
   * The server clamps `limit` to 100, so a single request silently truncates any longer gap — an
   * 8-hour absence from a busy group used to restore the oldest 100 missed messages and leave the
   * newest hundreds invisible until several more reconnect cycles happened to fill them in.
   */
  private async backfillConversation(
    conversationId: string,
    fromSeq?: number,
  ): Promise<void> {
    try {
      await this.pageBackfill(conversationId, fromSeq);
    } finally {
      // AFTER the messages, and on every exit path.
      //
      // Both halves matter. After, because a watermark applies to ROWS — reconciling first put it
      // against messages this backfill had not created yet, and it silently did nothing. And on
      // every path, because the case that needs repairing most is a reconnect with nothing new to
      // fetch: the peer read while we were away, so there are no new messages and the ticks are
      // still wrong.
      await this.reconcilePeerReceipts(conversationId);
    }
  }

  /**
   * The paging half of {@link backfillConversation}.
   *
   * `fromSeq` is what makes a HOLE repairable (VC-051). Every cursor this client has is
   * MAX(seq), so the moment anything newer lands, a message missing below it is beneath the
   * cursor and no `afterSeq` request can ever reach it again — which is why a dropped message
   * stayed missing across cold starts and reconnects forever. The gap probe knows the lower
   * edge of the hole (the `localMax` read BEFORE the new message was applied); passing it here
   * is the difference between detecting the hole and actually asking the server for it.
   */
  private async pageBackfill(
    conversationId: string,
    fromSeq?: number,
  ): Promise<void> {
    let cursor = fromSeq ?? (await maxSeqForConversation(conversationId));
    for (let page = 0; page < MAX_BACKFILL_PAGES; page++) {
      if (this.stopped) return;
      const batch = await fetchMessagesAfter(
        conversationId,
        cursor,
        BACKFILL_PAGE,
      );
      if (batch.length === 0) {
        // The server has nothing after `cursor`: everything up to here is accounted for.
        this.noteProvenFloor(conversationId, cursor);
        return;
      }
      await applyServerMessages(batch);
      // Rows that just landed may already have been delivered/read by the peer — their receipt
      // arrived while we had nothing to apply it to. Re-apply the remembered watermark so those
      // bubbles come back with the right ticks instead of stuck grey ones.
      await this.applyPeerWatermark(conversationId);
      const highest = batch.reduce(
        (max, m) => (m.seq > max ? m.seq : max),
        cursor,
      );
      const me = getAccountId();
      const inbound = batch.filter(m => m.senderId !== me);
      // Both watermarks below are cumulative, so neither may reach past a hole we still hold
      // (VC-069) — and both are clamped, not just the read one.
      if (inbound.length > 0) {
        // Received while we were away — the sender is still waiting on a second grey tick.
        const highestInbound = inbound.reduce(
          (max, m) => (m.seq > max ? m.seq : max),
          0,
        );
        this.noteDelivered(
          conversationId,
          await this.honestWatermarkIfHoled(conversationId, highestInbound),
        );
      }
      // A page landing in the conversation ON SCREEN has been seen, exactly like the live path
      // above (VC-026) — otherwise a reconnect backfill into an open chat climbs the unread badge
      // on the conversation the user is actively reading, and the peer's ticks stall on grey until
      // the user leaves and re-enters.
      if (this.activeConversationId === conversationId) {
        this.noteRead(
          conversationId,
          await this.honestWatermarkIfHoled(conversationId, highest),
        );
        try {
          await clearUnread(conversationId);
        } catch {
          // badge cosmetics only — never fail the backfill over it
        }
      }
      if (highest <= cursor) return; // server isn't advancing — stop rather than spin
      cursor = highest;
      if (batch.length < BACKFILL_PAGE) {
        this.noteProvenFloor(conversationId, cursor); // short page = caught up
        return;
      }
    }
    log.warn('backfill hit the page cap — more history remains', {
      conversationId,
    });
  }

  // ── receipts (§F2/§C5) ───────────────────────────────────────────────────
  /**
   * Read the peer's DURABLE watermark from the server and apply it.
   *
   * Receipts arrive as live socket frames, and a frame missed is a frame lost. If the peer read a
   * message while this device happened to be reconnecting — a network flip, a process the OS just
   * restarted, the seconds after a push woke us — that frame went nowhere, and nothing re-derived
   * it: the bubble kept a single tick for the rest of its life however long ago it was read.
   * `applyPeerWatermark` could not help, because it replays a LOCAL memory of frames that did
   * arrive.
   *
   * Safe to call anywhere: `fetchPeerReceipts` answers with an empty list for any failure,
   * including a 404 from a backend that predates the route, so a tick that cannot be repaired
   * never costs the sync that carries the messages.
   */
  async reconcilePeerReceipts(conversationId: string): Promise<void> {
    if (!hasSession()) return;
    const me = getAccountId();
    const rows = await fetchPeerReceipts(conversationId);
    for (const r of rows) {
      // Our own rows are dropped server-side; this is belt and braces for a proxy that is not.
      if (me !== undefined && r.userId === me) continue;
      try {
        await applyReceipt(conversationId, r.upToSeq, r.state);
      } catch (e) {
        log.warn('apply durable receipt failed', {
          conversationId,
          reason: String(e),
        });
      }
    }
  }

  /** Re-apply what the peer already told us, for rows that only exist now. */
  private async applyPeerWatermark(conversationId: string): Promise<void> {
    const peer = getPeerWatermark(conversationId);
    try {
      if (peer.delivered > 0) {
        await applyReceipt(conversationId, peer.delivered, 'delivered');
      }
      if (peer.read > 0) await applyReceipt(conversationId, peer.read, 'read');
    } catch (e) {
      log.warn('re-apply peer receipts failed', {
        conversationId,
        reason: String(e),
      });
    }
  }

  /**
   * Record that a message is on this device. Called from BOTH receive paths — the live frame and
   * the REST catch-up — because a message that arrived while offline is just as delivered as one
   * that arrived over the socket. Only emitting from the live path is why a night in airplane mode
   * used to leave the sender on one grey tick forever, with nothing that could ever repair it.
   */
  private noteDelivered(conversationId: string, seq: number): void {
    if (noteDesired(conversationId, { delivered: seq })) {
      markDirty(conversationId);
      this.scheduleReceiptFlush();
    }
  }

  /** Record that the user has actually seen up to `seq` (blue ticks for the peer). */
  private noteRead(conversationId: string, seq: number): void {
    if (noteDesired(conversationId, { read: seq })) {
      markDirty(conversationId);
      this.scheduleReceiptFlush();
    }
  }

  /**
   * Arm the receipt flush.
   *
   * `atLeast` is what keeps the chunked continuation honest. An already-armed timer normally
   * wins — that is the whole point of the coalescing — but the over-budget path asks for a
   * LONGER delay on purpose, because the spacing between chunks is the half of VC-025 that
   * actually keeps the burst inside the gateway's inbound window. Deferring to whatever short
   * timer happened to be armed collapsed chunk two to ~250ms behind chunk one, putting 40
   * frames inside a quarter second — at the gateway's limit, where the excess is dropped
   * silently while `noteSent` records them as delivered. That is the exact failure this bug
   * was filed for, reintroduced by the scheduler rather than by the sender.
   */
  private scheduleReceiptFlush(
    delayMs: number = RECEIPT_FLUSH_DELAY_MS,
    atLeast = false,
  ): void {
    if (this.stopped || this.suspended) return;
    if (this.receiptTimer !== null) {
      if (!atLeast) return;
      // Re-arm at the longer delay: the pending timer is too soon for a continuation.
      clearTimeout(this.receiptTimer);
      this.receiptTimer = null;
    }
    this.receiptTimer = setTimeout(() => {
      this.receiptTimer = null;
      void this.flushReceipts();
    }, delayMs);
  }

  /**
   * Emit the receipts still owed, one cumulative frame per state per conversation — CHUNKED to
   * stay under the gateway's shared inbound budget (VC-025).
   *
   * `sent` advances ONLY when the transport accepted the frame. The socket drops sends silently
   * when it isn't OPEN, so treating "we tried" as "they know" is exactly how a receipt vanishes
   * into a reconnect. Anything unsent stays dirty and is re-derived on the next flush — which the
   * reconnect path triggers, so a dropped frame costs one extra frame, never a stuck tick.
   *
   * A reconnect after any real gap can mark DOZENS of conversations dirty at once
   * (`reassertReceipts`), and the old code sent every resulting frame in one synchronous tick.
   * The gateway drops inbound frames past ~40/sec per connection, silently — so that burst
   * self-inflicts exactly the backpressure this coalescing exists to avoid, and the client never
   * learns which frames were dropped (a bare `socket.send()` only checks `readyState`). Capping
   * frames per tick and rescheduling the rest, further apart than the gateway's own window,
   * spreads a big reassert across several ticks instead of racing the rate limiter.
   */
  private flushReceipts(): void {
    if (this.stopped) return;
    // A chunk that has just gone out owns the next RECEIPT_FLUSH_CHUNK_DELAY_MS, whoever asks.
    //
    // The cap is only half of VC-025; the SPACING is what keeps the burst inside the gateway's
    // inbound window, and the cap alone does not provide it — `onConnected` calls
    // `reassertReceipts()` and then `flushReceipts()` directly, and the reconnect catch-up calls
    // it again per wave. Two direct calls in one tick therefore put 40 frames on the wire inside
    // a quarter second, at the gateway's limit, where the excess is dropped silently while
    // `noteSent` records it as delivered. The timer alone could not fix that, because these
    // callers bypass the timer entirely.
    const sinceLastChunk = Date.now() - this.lastReceiptChunkAt;
    if (sinceLastChunk < RECEIPT_FLUSH_CHUNK_DELAY_MS) {
      this.scheduleReceiptFlush(
        RECEIPT_FLUSH_CHUNK_DELAY_MS - sinceLastChunk,
        true,
      );
      return;
    }
    const ids = takeDirty();
    if (ids.length === 0) return;
    let sentFrames = 0;
    let overBudget = false;
    for (const conversationId of ids) {
      if (overBudget) {
        markDirty(conversationId); // untouched this tick — catch it on the next chunk
        continue;
      }
      const desired = getDesired(conversationId);
      const frames = pendingReceiptFrames(desired, getSent(conversationId));
      if (frames.length === 0) continue;
      for (const f of frames) {
        if (sentFrames >= MAX_RECEIPT_FRAMES_PER_FLUSH) {
          markDirty(conversationId);
          overBudget = true;
          break;
        }
        const ok = this.socket?.send(f.state, {
          conversationId,
          seq: f.upToSeq,
        });
        if (ok) {
          noteSent(conversationId, { [f.state]: f.upToSeq });
          sentFrames += 1;
        } else {
          // Socket down or backpressured — keep it owed and retry on the next flush/reconnect.
          markDirty(conversationId);
        }
      }
    }
    if (sentFrames > 0) this.lastReceiptChunkAt = Date.now();
    if (overBudget) {
      this.scheduleReceiptFlush(RECEIPT_FLUSH_CHUNK_DELAY_MS, true);
    }
  }

  /**
   * Acknowledge inbound messages that some OTHER path restored (the inbox backfill at launch /
   * after sign-in), so the sender's second tick appears.
   *
   * Needed because the engine's own catch-up asks only for messages past the local cursor: once
   * `backfillInbox` has pulled a conversation's history, `backfillConversation` gets an empty
   * page and its `noteDelivered` never runs. Messages that arrived while the user was signed out
   * therefore sat on the recipient's device fully delivered while the sender kept one grey tick
   * with nothing that could ever repair it. Cumulative + monotonic, so a duplicate call is free.
   */
  noteInboundDelivered(conversationId: string, seq: number): void {
    if (!(seq > 0)) return;
    this.noteDelivered(conversationId, seq);
  }

  /**
   * The chat screen tells the engine which conversation is on screen. While a conversation is
   * active, every message that lands in it is read on arrival: the badge never climbs on a chat
   * the user is looking at, and the sender sees blue ticks without the reader touching anything.
   */
  setActiveConversation(conversationId: string | null): void {
    this.activeConversationId = conversationId;
  }

  // ── inbound frames ───────────────────────────────────────────────────────
  private async onInboundMessage(data: unknown): Promise<void> {
    const arrivedAt = Date.now();
    const m = normalizeServerMessage(data);
    if (!m) return;
    // A new message from the peer means they've stopped typing — clear the indicator (§C4).
    this.clearTyping(m.conversationId);
    try {
      // Read the cursor BEFORE applying: once this message lands, the hole it skipped over
      // becomes invisible, and no future `afterSeq` request can ever reach back past it.
      let localMax = 0;
      try {
        localMax = await maxSeqForConversation(m.conversationId);
      } catch {
        localMax = 0;
      }
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
      // The push skipped ahead of what we hold — the messages in between were dropped by
      // best-effort fan-out, and REST is the only way they can still be recovered.
      if (
        shouldProbeGap({
          localMax,
          incomingSeq: m.seq,
          lastProbedFrom: this.gapProbedFrom.get(m.conversationId),
        })
      ) {
        this.gapProbedFrom.set(m.conversationId, localMax);
        try {
          // From `localMax`, NOT from wherever the conversation now sits. `applyServerMessage`
          // above has just moved MAX(seq) up to the message that REVEALED the hole, so the
          // ordinary backfill would ask `afterSeq = m.seq` — above the gap — and come back
          // empty however many times it ran. Re-fetching the rows we already hold between
          // `localMax` and `m.seq` is free: `applyServerMessages` dedups on (conversation, seq).
          await this.backfillConversation(m.conversationId, localMax);
        } catch (e) {
          log.warn('gap backfill failed', {
            conversationId: m.conversationId,
            reason: String(e),
          });
        }
      }
      // Frame → row on screen. This is the "did it arrive?" feeling, and the only place the
      // receive path can be judged without a device in hand.
      recordLatency('recv.apply', Date.now() - arrivedAt);
      if (m.senderId !== getAccountId()) {
        void this.nameStubConversation(m.conversationId, m.senderId);
        // Mirror on EVERY inbound message, not only when a chat is opened (VC-073). The
        // notification's own Mark-as-read runs with no database, so it falls back to the seq the
        // push carried when it has never been told a safe one — and a conversation the user has
        // not opened since this build landed is exactly the case where that fallback could
        // acknowledge across a hole. This is the same clamp the read below uses, so native's
        // policy now matches javascript's instead of approximating it.
        setNativeSafeReadSeq(
          m.conversationId,
          this.clampToHeld(m.seq, localMax),
        );
        // Clamped like the read below it, and for the same reason: `delivered` is cumulative
        // too, so the frame that SKIPS ahead of what we hold would claim a second grey tick for
        // every message it skipped (VC-069). `localMax` is already in hand from the gap check.
        this.noteDelivered(m.conversationId, this.clampToHeld(m.seq, localMax));
      }
      // A message that lands in the conversation ON SCREEN has been seen — whoever sent it.
      //
      // This deliberately sits OUTSIDE the "from someone else" guard. In a chat with yourself
      // every message is your own, so gating the read on a foreign sender meant the watermark
      // never advanced while the chat was open: the tick stayed on sent until you left and came
      // back, where the mount-time read finally reported it. Reading a chat you are looking at is
      // true regardless of who wrote the message.
      if (this.activeConversationId === m.conversationId) {
        this.noteRead(m.conversationId, this.clampToHeld(m.seq, localMax));
        try {
          await clearUnread(m.conversationId);
        } catch {
          // badge cosmetics only — never fail the inbound path over it
        }
      }
    } catch (e) {
      log.warn('apply inbound message failed', { reason: String(e) });
    }
  }

  private async onInboundReceipt(data: unknown): Promise<void> {
    // Parsing + the self-echo filter are pure and unit-tested (`parseReceiptFrame`). The
    // gateway fans a receipt to EVERY member including the acknowledger, so without that
    // filter our own `read` — emitted the instant we open a chat — came back and turned our
    // OWN bubbles blue, making the ticks describe us rather than the peer.
    // Parse WITHOUT the self-echo rule first, so we know which conversation this is about, then
    // apply the rule with that context: in a chat whose only member is us, our own receipt is the
    // only one that will ever arrive and must NOT be discarded.
    const me = getAccountId();
    const preview = parseReceiptFrame(data, undefined);
    if (!preview) return;
    const selfChat =
      me !== undefined &&
      (await peerIdFor(preview.conversationId).catch(() => undefined)) === me;
    const r = parseReceiptFrame(data, me, { selfChat });
    if (!r) return;
    const { conversationId, upToSeq, state } = r;
    // Remember it even if it matches nothing right now: a receipt for messages we have not
    // backfilled yet used to evaporate, leaving permanent grey ticks on messages the peer had
    // already read. The backfill re-applies this watermark once those rows exist.
    notePeerWatermark(conversationId, { [state]: upToSeq });
    try {
      await applyReceipt(conversationId, upToSeq, state);
    } catch (e) {
      log.warn('apply receipt failed', { reason: String(e) });
    }
  }

  // ── outbox worker ────────────────────────────────────────────────────────
  private kickOutbox(): void {
    if (this.stopped || this.suspended) return;
    void this.drainOutbox();
  }

  /**
   * Transmit the outbox once, WITHOUT the engine running and without a socket — the headless
   * push wake (§M13 "push → bounded work → sleep").
   *
   * A reply typed into a notification writes its bubble and its outbox row like any other send,
   * but `kickOutbox` is gated on a started, online engine, and in a headless JS context neither
   * is true: `stopped` is still its initial `true` and `online` has never been seeded from
   * NetInfo. So the message would sit in the queue until the user next opened the app, which is
   * precisely the wait replying from the notification is supposed to avoid.
   *
   * Sending is plain REST (`sendChatMessage`) and stays valid without a socket, so lifting the
   * lifecycle gate here costs nothing and changes no behaviour for the running engine: if it is
   * live and already draining, the `draining` guard makes this a no-op.
   */
  async flushOutboxNow(): Promise<void> {
    // Join a walk already in progress, then walk once more.
    //
    // The caller is a headless task, and Android kills it the INSTANT this resolves. `sendText`
    // kicks a drain of its own and returns, so the old code found `draining` set and came back in
    // milliseconds: the task completed, the foreground service stopped, and the HTTP send died in
    // flight. The reply sat in the outbox until the app was next opened — from the user's side,
    // indistinguishable from a reply that never sent. On a real device the service stopped 164 ms
    // after JS began draining.
    //
    // The second walk is not belt-and-braces: a row written after the first walk claimed its last
    // item would otherwise be left behind, and that row is the reply.
    const running = this.drainInFlight;
    if (running) await running.catch(() => undefined);
    await this.drainOutbox({ ignoreLifecycle: true });
  }

  private drainOutbox(opts: { ignoreLifecycle?: boolean } = {}): Promise<void> {
    // A walk already in progress is RETURNED, not swallowed.
    //
    // This used to be `if (this.draining) return`, which told the caller the queue was dealt with
    // when in fact somebody else was halfway through it. Harmless for a fire-and-forget kick;
    // fatal for `flushOutboxNow`, whose caller is killed the moment it resolves.
    if (this.draining) return this.drainInFlight ?? Promise.resolve();
    this.draining = true;
    const run = this.walkOutbox(opts).finally(() => {
      this.draining = false;
      this.drainInFlight = null;
    });
    this.drainInFlight = run;
    return run;
  }

  private async walkOutbox(
    opts: { ignoreLifecycle?: boolean } = {},
  ): Promise<void> {
    try {
      // Never claim before crash-recovery has un-stuck orphaned `sending` rows.
      if (this.recovery) await this.recovery;
      for (;;) {
        // Why a walk STOPPED, on the one path where a stop is a bug.
        //
        // A wake window has no second chance, and every exit below looks identical from outside:
        // the walk returns, the task completes, the process dies, and the message leaves when the
        // app is next opened. The device log said only "flushed" — true, and useless. It now says
        // which of these it was. Only for `ignoreLifecycle`, i.e. the headless flush, so the app's
        // ordinary drains stay silent.
        const stop = (reason: string): void => {
          if (opts.ignoreLifecycle) log.info('outbox walk stopped', { reason });
        };
        // `hasSession()` is checked either way: without tokens there is nothing to send, and no
        // caller may bypass that.
        if (!hasSession()) {
          stop('no session');
          break;
        }
        if (!opts.ignoreLifecycle && (this.stopped || !this.online)) break;
        // Rate limited a moment ago — walking the queue now just re-earns the 429 and burns an
        // attempt on every message behind it.
        if (Date.now() < this.outboxCooldownUntil) {
          stop('cooldown');
          break;
        }
        const item = await claimNextDue(Date.now());
        if (!item) {
          stop('nothing claimable');
          break;
        }
        if (opts.ignoreLifecycle) {
          log.info('outbox walk claimed a row', {
            clientMsgId: item.clientMsgId,
          });
        }
        try {
          const ack = await sendChatMessage(
            await this.resolveReplyTarget(item.input),
          );
          // A 2xx with no usable seq (`normalizeSendAck` defaults a missing/NaN one to 0) is a
          // server-side anomaly, not a successful send (VC-022): `seq > 0` filters elsewhere (the
          // cursor, `applyReceipt`) would make this row invisible forever — un-tickable, and the
          // WS echo for the same message could never collapse into it either, leaving a permanent
          // phantom duplicate. Route it through the SAME retry path as any other send failure
          // instead of writing a state the rest of the system can never recover.
          if (!(ack.seq > 0)) {
            throw new AppError(
              'server',
              'Send acknowledged with no usable seq',
            );
          }
          await markMessageSent(item.clientMsgId, ack);
          await markAckd(item.id);
          // The peer may have acknowledged this message BEFORE our own ack came back — the
          // fan-out reaches them while our HTTP response is still in flight, so their `delivered`
          // routinely wins the race. Applied then it matched nothing, because the row had no seq
          // yet and `applyReceipt` selects on seq. Now that it has one, re-apply what the peer
          // already told us; without this the message keeps a single tick for good, however long
          // ago it was delivered.
          await this.applyPeerWatermark(item.conversationId);
          // From when the user composed it, not from when this attempt started: a message that
          // sat in the queue through three failures took that long to be delivered, and pretending
          // otherwise would make a bad network look fast.
          recordLatency('send.ack', Date.now() - item.createdAt);
        } catch (e) {
          const attempts = item.attempts + 1;
          const msg = isAppError(e) ? e.message : String(e);
          // The CAUSE decides, not the attempt count: unreachable keeps the clock icon forever,
          // a refusal of this message surfaces the retry affordance immediately.
          const decision = classifySendFailure(e, attempts);
          await markFailed(item.id, msg, attempts, decision.permanent);
          if (decision.permanent) await markMessageFailed(item.clientMsgId);
          if (decision.cooldownMs > 0) {
            this.outboxCooldownUntil = Date.now() + decision.cooldownMs;
          }
          if (decision.pauseDrain) break;
        }
      }
    } finally {
      // Cleared HERE, before the next drain is scheduled, and again by `drainOutbox` when this
      // promise settles. Both matter: `scheduleOutbox` reads the queue and arms the timer that
      // continues a backlog, and it must not do that while the flag still says a walk is running.
      this.draining = false;
      void this.scheduleOutbox();
    }
  }

  /** Self-adjusting timer: schedule the next drain at the earliest due time, else stay idle. */
  private async scheduleOutbox(): Promise<void> {
    this.clearOutboxTimer();
    if (this.stopped || !this.online || this.suspended) return;
    let stats: { queued: number; nextDueAt: number | null };
    try {
      stats = await outboxStats();
    } catch {
      return;
    }
    if (stats.queued === 0) return; // idle — nothing to poll for
    const now = Date.now();
    // Never wake before a rate-limit cooldown expires, however soon the row claims to be due.
    const dueAt = Math.max(stats.nextDueAt ?? now, this.outboxCooldownUntil);
    const delay = Math.max(
      OUTBOX_MIN_DELAY_MS,
      Math.min(OUTBOX_MAX_DELAY_MS, dueAt - now),
    );
    this.outboxTimer = setTimeout(() => {
      this.outboxTimer = null;
      void this.drainOutbox();
    }, delay);
  }

  /**
   * Translate a reply's quoted id from LOCAL to SERVER, immediately before the send.
   *
   * It has to happen here rather than at compose time, and the reason is timing. The composer
   * only has the quoted message's local record id, and replying to a message that is itself
   * still in flight is ordinary behaviour — so at enqueue time there is frequently no server id
   * to substitute. Resolving once, then, would freeze that "none" into the durable payload and
   * the reply would stay unattributed through every retry. Resolving on each attempt means the
   * usual case (the target was acked a round trip ago) just works, and the unusual one repairs
   * itself on the next attempt.
   *
   * The stored payload is deliberately NOT rewritten: it keeps the local id so the next attempt
   * re-resolves from scratch. And when there is still no server id, `replyTo` is dropped from
   * the wire body entirely rather than sent as a local id the backend cannot resolve — a plain
   * message is a smaller lie than a dangling reference. The row's own `reply_to_id` is left
   * untouched either way, so the sender keeps seeing their own quote.
   */
  private async resolveReplyTarget(
    input: SendMessageInput,
  ): Promise<SendMessageInput> {
    const quoted = input.replyTo;
    if (quoted === undefined || quoted === '') return input;
    // `string | null` deliberately, not the model's declared `string | undefined`: WatermelonDB
    // stamps every unwritten optional column `null`, so a row that has never learned its server
    // id reads back as null here. An `=== undefined` guard passes that straight through and puts
    // `replyTo: null` on the wire — which is the dangling reference this method exists to
    // prevent, wearing a different type. Truthiness covers null, undefined and ''.
    let serverId: string | null | undefined;
    try {
      // Matches either identity, so this also no-ops correctly if the id is ALREADY a server one.
      const rows = await findQuotedMessages([quoted]);
      serverId = rows[0]?.serverMsgId;
    } catch (e) {
      // A lookup failure must not fail the send — the message still deserves to go out.
      log.warn('reply target lookup failed', { reason: String(e) });
      serverId = undefined;
    }
    if (serverId) {
      return { ...input, replyTo: serverId };
    }
    // Shallow copy minus the key. `delete` rather than a rest-destructure so there is no unused
    // binding, and rather than an explicit rebuild so a field added to SendMessageInput later
    // cannot be silently dropped from a reply's wire body.
    const withoutReply: SendMessageInput = { ...input };
    delete withoutReply.replyTo;
    return withoutReply;
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
    /**
     * The message being quoted, when this is a reply. Passed straight through to the one
     * transaction below — the engine holds no reply policy of its own, and deliberately does
     * NOT validate that the target exists: the DB write is the render path, and a lookup here
     * would put a query in front of the bubble for a target the composer just picked off screen.
     */
    replyToId?: string,
  ): Promise<void> {
    // ONE transaction for the bubble + its outbox row: a crash between two writes used to strand
    // a message in `sending` that nothing would ever transmit or surface as failed.
    const t0 = Date.now();
    const clientMsgId = await enqueueOptimisticSend(
      conversationId,
      text,
      senderId,
      replyToId,
    );
    if (!clientMsgId) return;
    // The budget that decides whether sending FEELS instant (§L7: ≤20 ms p50). Measured here
    // because this is the moment the bubble becomes visible — everything after is background.
    recordLatency('send.local', Date.now() - t0);
    this.kickOutbox();
  }

  /**
   * Pull the page of history immediately BEFORE what we hold (§L7 "load older").
   *
   * The API is forward-only — there is no `before` parameter — but `afterSeq` is a free cursor,
   * so asking from `oldestHeld - 1 - page` and taking a page reaches back correctly. Returns
   * whether anything new landed, so the UI only grows its window when there is more to show.
   */
  async loadOlderMessages(
    conversationId: string,
    page: number,
  ): Promise<boolean> {
    // Concurrent callers share ONE fetch — see `loadingOlder`.
    const inFlight = this.loadingOlder.get(conversationId);
    if (inFlight) return inFlight;
    const work = this.fetchOlderMessages(conversationId, page).finally(() => {
      this.loadingOlder.delete(conversationId);
    });
    this.loadingOlder.set(conversationId, work);
    return work;
  }

  private async fetchOlderMessages(
    conversationId: string,
    page: number,
  ): Promise<boolean> {
    // The backend's history filters `deleted:false`, so a contiguous deleted run WIDER than one
    // page comes back completely empty — that means "nothing non-deleted in this window", not
    // "nothing older exists". Treating it as end-of-history stranded the UI permanently: the
    // window never grows, so there is no further "scrolled past the oldest bubble" event left to
    // retry with (VC-027). Step back over the hole instead, page by page, until a page actually
    // has something in it or we truly reach the start of the conversation.
    let oldest = await minSeqForConversation(conversationId);
    for (let hop = 0; hop < MAX_HOLE_HOPS; hop++) {
      if (oldest <= 1) return false; // seq 1 is the first message ever — nothing precedes it
      const from = Math.max(0, oldest - 1 - page);
      const older = await fetchMessagesAfter(conversationId, from, page);
      const fresh = older.filter(m => m.seq < oldest);
      if (fresh.length > 0) {
        await applyServerMessages(fresh);
        return true;
      }
      oldest = from + 1; // this whole window was a hole — the next hop starts just before it
    }
    return false;
  }

  /**
   * The user opened a conversation → clear its unread badge locally and tell the server we
   * read up to the latest seq we hold (§F2/§5). Best-effort: the read frame only goes out
   * when the socket is up; the local badge clears regardless (offline-first).
   */
  /**
   * A cumulative watermark for an arriving frame, held back to what this device actually has.
   *
   * The frame that skips ahead of `localMax` is the one that OPENS a hole, and acknowledging its
   * own seq would claim every message it skipped (VC-069). `localMax` is read before the message
   * is applied, so this costs nothing on the inbound hot path — no DB scan. `localMax === 0` is
   * a conversation we hold nothing for, where the skipped range is unloaded history, not a hole.
   */
  private clampToHeld(incomingSeq: number, localMax: number): number {
    if (localMax === 0 || incomingSeq <= localMax + 1) return incomingSeq;
    return localMax;
  }

  /** Remember that the server has been asked up to `seq` and had nothing more to give. */
  private noteProvenFloor(conversationId: string, seq: number): void {
    if (seq <= 0) return;
    const previous = this.provenFloor.get(conversationId) ?? 0;
    if (seq > previous) this.provenFloor.set(conversationId, seq);
  }

  /**
   * The highest seq this device may honestly acknowledge (VC-069).
   *
   * The contiguous max, lifted past any hole a completed catch-up has already proven the server
   * cannot fill, and never above what we actually hold.
   */
  private async honestWatermark(conversationId: string): Promise<number> {
    const [contiguous, max] = await Promise.all([
      maxContiguousSeqForConversation(conversationId),
      maxSeqForConversation(conversationId),
    ]);
    const proven = this.provenFloor.get(conversationId) ?? 0;
    return Math.min(max, Math.max(contiguous, proven));
  }

  /**
   * The same rule, but skipped entirely for a conversation no hole has ever been detected in.
   *
   * `maxContiguousSeqForConversation` materialises up to 500 rows, and the backfill calls this
   * once PER PAGE, inside a loop that runs for several conversations at a time on reconnect —
   * on the 3 GB reference device (§R5) that is real work to spend on a question whose answer is
   * almost always "nothing is missing". A conversation the gap probe has never fired for has no
   * known hole, so `candidate` is already honest.
   */
  private async honestWatermarkIfHoled(
    conversationId: string,
    candidate: number,
  ): Promise<number> {
    // The gate used to be `gapProbedFrom.has(...)` — "no probe has fired, so there is no known
    // hole". That premise is false across a process restart: the probe map is in memory and is
    // cleared on stop, so a device holding 1-49 and 51-60 comes back from a kill with an empty
    // map, and the reconnect backfill then emits an UNCLAMPED watermark covering the seq it
    // never received. `mergeWatermark` is monotonic, so that lie is permanent — and it would
    // override the correct value `markConversationRead` had already sent.
    //
    // A cheap, restart-proof stand-in for "could this conversation have a hole": compare what we
    // hold against the span we hold it over. A conversation whose row count matches its seq
    // range is contiguous by arithmetic, needs no scan, and is the overwhelmingly common case.
    const [max, min, held] = await Promise.all([
      maxSeqForConversation(conversationId),
      minSeqForConversation(conversationId),
      countMessagesWithSeq(conversationId),
    ]);
    if (max === 0 || held >= max - min + 1) return candidate;
    return Math.min(candidate, await this.honestWatermark(conversationId));
  }

  async markConversationRead(conversationId: string): Promise<void> {
    await clearUnread(conversationId);
    try {
      // The CONTIGUOUS max, not the plain one. A `read` frame is cumulative — it covers every
      // message at or below its seq — so sending the local maximum across a hole told the
      // sender their message had been read when this device never received it (VC-069).
      const seq = await this.honestWatermark(conversationId);
      // Hand the same answer to native: the notification's own Mark-as-read runs in a process
      // with no database, so without this it can only ack the seq the push happened to carry
      // and would cover a message we do not hold (VC-073).
      setNativeSafeReadSeq(conversationId, seq);
      // Record it even with the socket down: the ledger is durable, so opening a chat offline
      // still turns the sender's ticks blue as soon as we reconnect.
      if (seq > 0) this.noteRead(conversationId, seq);
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
   * Tell the presence service this device is online and keep saying so.
   *
   * The realtime gateway is documented as the caller of `POST /presence/online` but never wires a
   * presence client, and its inbound `ping` refreshes only its own connection registry — so
   * before this, `online:{userId}` was never populated for ANY account and every peer read as
   * offline no matter what they were doing. Idempotent: re-announcing is harmless (`SADD`).
   */
  private startSelfPresence(): void {
    const me = getAccountId();
    const device = getDeviceId();
    if (!me || !device) return;
    this.clearPresenceTimer();
    this.presenceAnnounced = true;
    void presenceOnline(me, device).catch((e: unknown) => {
      log.warn('presence online failed', { reason: String(e) });
    });
    // Owned interval (§M7): refreshes inside the server's 30s TTL, disposed with the socket.
    this.presenceTimer = setInterval(() => {
      const uid = getAccountId();
      const dev = getDeviceId();
      if (!uid) return;
      // The device id lets a beat restore a presence key that already lapsed, instead of only
      // extending one that survived — see `presenceHeartbeat`.
      void presenceHeartbeat(uid, dev ?? undefined).catch(() => undefined);
    }, PRESENCE_HEARTBEAT_MS);
  }

  /**
   * Tell the presence service this device is gone, and stop the keepalive. Called on every path
   * that releases the socket (close, background suspend, sign-out, engine stop) so the peer sees
   * an accurate "last seen" instead of a user who is online forever.
   */
  private stopSelfPresence(): void {
    this.clearPresenceTimer();
    if (!this.presenceAnnounced) return;
    this.presenceAnnounced = false;
    const me = getAccountId();
    const device = getDeviceId();
    if (!me || !device) return;
    void presenceOffline(me, device).catch(() => undefined);
  }

  private clearPresenceTimer(): void {
    if (this.presenceTimer !== null) {
      clearInterval(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  private clearPeerPresenceTimer(): void {
    if (this.peerPresenceTimer !== null) {
      clearInterval(this.peerPresenceTimer);
      this.peerPresenceTimer = null;
    }
  }

  /** Read one peer's presence snapshot into the live store. Best-effort, never throws. */
  private async refreshPeerPresence(peerId: string): Promise<void> {
    const me = getAccountId();
    if (!me) return;
    try {
      const p = await getPresence(peerId, me);
      useRealtimeStore.getState().setPresence(peerId, {
        status: normalizePresenceStatus(p.status),
        lastSeen: p.lastSeen,
      });
    } catch (e) {
      log.warn('presence fetch failed', { reason: String(e) });
    }
  }

  /**
   * Keep the OPEN chat's peer presence current. There is no `presence.changed` frame to wait for
   * (the gateway's fan-out subscribes to message/receipt/caption only), so the snapshot has to be
   * re-read: without this, a peer who came online AFTER the chat was opened stayed grey forever,
   * and one who left stayed "online" forever. Re-subscribes each tick too, because the server's
   * `subscribers:{u}` set expires after 300s.
   */
  private startPeerPresencePolling(peerId: string): void {
    this.clearPeerPresenceTimer();
    const me = getAccountId();
    if (!me) return;
    this.peerPresenceTimer = setInterval(() => {
      // Only while we're actually in the foreground with a link — polling a suspended app would
      // be exactly the overnight battery drain §M13 exists to prevent.
      if (this.stopped || this.suspended || !this.online) return;
      if (!this.activePresencePeers.has(this.activeConversationId ?? ''))
        return;
      void subscribePresence(me, [peerId]).catch(() => undefined);
      void this.refreshPeerPresence(peerId);
    }, PEER_PRESENCE_POLL_MS);
  }

  /**
   * Put the open chat's presence poll back after an interruption took it away (VC-046).
   *
   * Every path that releases the link tears the poll down — `onNetwork(false)` and the §M13
   * background suspend both call `clearPeerPresenceTimer` — and that half is right: polling a
   * link that is gone is pure battery. What was missing is the other half. The ONLY caller of
   * `activatePresence` is the chat header's mount effect, and neither returning from the
   * background nor returning from a tunnel remounts a screen, so the poll simply never came
   * back: a chat held open across one interruption showed the presence it had read before the
   * interruption for as long as the user stayed in it. Reported as "presence updates with a
   * noticeable delay"; it was actually "presence stops updating".
   *
   * Keyed off `activePresencePeers`, NOT `activeConversationId`. The chat screen withdraws its
   * active id when the app leaves the foreground and re-asserts it on return, and it registers
   * its AppState listener after the engine's — so at the instant this runs the active id is
   * still null and a resume keyed on it would do nothing on the one transition that needs it
   * most. `activePresencePeers` is the registration `activatePresence` / `deactivatePresence`
   * own, which is the honest answer to "is a presence line on screen right now": empty means
   * nobody is watching, and then this must stay silent (§M20.3, VC-065).
   *
   * The leading read is as much of the fix as the timer. There is no live `presence.changed`
   * frame to correct a stale value (the gateway fans out message/receipt/caption only), so
   * without it the user would stare at a known-stale line for a full interval after coming
   * back. One extra GET per resume is nothing against §R6 — unlike shortening the interval,
   * which would pay for that latency every 20 s of every open chat, forever.
   */
  private resumePeerPresence(): void {
    if (this.stopped || this.suspended || !this.online) return;
    const me = getAccountId();
    if (!me) return;
    // Insertion-ordered, so the last entry is the most recently opened chat — the same one
    // `activatePresence` would have left the single poll pointed at.
    const watching = [...this.activePresencePeers.values()];
    const peer = watching[watching.length - 1];
    if (peer === undefined) return;
    // The server's `subscribers:{u}` set expires after 300s, so an outage long enough to stop
    // the poll is long enough to have dropped us out of it too.
    void subscribePresence(me, [peer]).catch(() => undefined);
    void this.refreshPeerPresence(peer);
    this.startPeerPresencePolling(peer);
  }

  /**
   * A chat became active → resolve its DM peer (members − me), subscribe to the peer's live presence
   * (fan-out targets subscribers only), and fetch the current snapshot into the store. Returns the
   * peerId, or `null` for a group / note-to-self (no single-peer presence line). Never blocks the UI:
   * every network call is best-effort and off the render path.
   */
  async activatePresence(conversationId: string): Promise<string | null> {
    const me = getAccountId();
    if (!me) return null;
    const epoch = this.presenceEpoch;
    let peerId: string | null = null;
    // The inbox sync already resolved this DM's peer onto the row, so opening a chat should not
    // pay a members round-trip to learn something we stored. Falling back to the network only
    // covers a conversation that arrived before that field existed (or a group).
    const stored = await peerIdFor(conversationId).catch(() => undefined);
    // The chat closed while we were reading the row. Returning HERE is what stops the ghost:
    // anything past this point writes to `activePresencePeers`.
    if (epoch !== this.presenceEpoch) return null;
    if (stored) {
      peerId = stored;
    } else {
      try {
        const members = await getConversationMembers(conversationId);
        const others = members.filter(m => m !== me);
        peerId = others.length === 1 ? (others[0] ?? null) : null;
      } catch (e) {
        log.warn('presence members resolve failed', { reason: String(e) });
        return null;
      }
      if (epoch !== this.presenceEpoch) return null;
    }
    if (peerId === null) return null;
    this.activePresencePeers.set(conversationId, peerId);
    this.presenceOwner.set(conversationId, epoch);
    const peer = peerId;
    void subscribePresence(me, [peer]).catch((e: unknown) => {
      log.warn('presence subscribe failed', { reason: String(e) });
    });
    await this.refreshPeerPresence(peer);
    // Checked AGAIN, because that fetch is a network round trip and the user can close the chat
    // inside it. Starting the poll here is what left an invisible interval waking the JS thread
    // every 20s for a chat that is gone — all night, when push is unavailable and the suspend
    // never runs (§M13). Undo the registration too: this call no longer owns anything.
    if (epoch !== this.presenceEpoch) {
      // Undo only what is still OURS. A newer activate for the same chat may have registered
      // while this one was awaiting, and tearing down its live registration would stop the poll
      // for a conversation the user is looking at.
      if (this.presenceOwner.get(conversationId) === epoch) {
        this.presenceOwner.delete(conversationId);
        this.activePresencePeers.delete(conversationId);
        if (this.activePresencePeers.size === 0) this.clearPeerPresenceTimer();
      }
      return null;
    }
    // The snapshot alone is a single point-in-time reading and there is no live presence frame
    // to correct it, so keep re-reading it while this chat is on screen.
    this.startPeerPresencePolling(peer);
    return peer;
  }

  /** A chat closed → stop tracking its peer (the last-known snapshot may stay in the store). */
  deactivatePresence(conversationId: string): void {
    // Before the delete, so an activate still awaiting sees the move and bails instead of
    // re-registering the peer we are about to forget.
    this.presenceEpoch += 1;
    this.presenceOwner.delete(conversationId);
    this.activePresencePeers.delete(conversationId);
    // §M7: the poll belongs to the open chat — it must not outlive it.
    if (this.activePresencePeers.size === 0) this.clearPeerPresenceTimer();
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
    /** Whether the OPEN chat's peer-presence poll is currently armed (§M20.3 ownership). */
    peerPresencePollActive: boolean;
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
      peerPresencePollActive: this.peerPresenceTimer !== null,
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
