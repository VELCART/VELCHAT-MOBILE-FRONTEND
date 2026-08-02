/**
 * Message operations (§L7) — observe a conversation's messages, write an optimistic local
 * send, and reconcile inbound server messages (§L6). The UI reads the DB; the MP2 sync
 * engine transmits via the outbox and applies the server `seq`. Reconcile decisions come
 * from the pure `syncLogic.ts` (client_msg_id → seq); this file only reads/writes rows.
 */
import { Q, Model } from '@nozbe/watermelondb';
import { getDatabase } from './database';
import { Message, Conversation } from './models';
import { reconcileDecision } from './syncLogic';
import { getAccountId } from '../network/tokens';
import type { ServerMessage, SendAck } from '../network/chat';

/**
 * Observe a conversation's messages newest-first (fed into a reversed list).
 * `observeWithColumns` so in-place changes (a bubble ticking sending→sent→read, reactions)
 * re-render even though the sort key (`created_at`) is immutable.
 */
export function observeMessages(conversationId: string) {
  return getDatabase()
    .get<Message>('messages')
    .query(
      Q.where('conversation_id', conversationId),
      Q.where('deleted', false),
      Q.sortBy('created_at', Q.desc),
    )
    .observeWithColumns(['state', 'reactions', 'attachments']);
}

/** A short client message id (server seq is assigned later, on ACK). */
function newClientMsgId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Optimistic local send (§L7.sendMessage): write a `sending` message + bump the
 * conversation preview, all in one transaction, so the UI updates instantly. Returns the
 * generated `client_msg_id` so the sync engine can enqueue the matching outbox item (or
 * `null` for an empty body). The outbox worker (MP2) transmits it and the ack flips the
 * state to sent → delivered → read.
 */
export async function sendMessageLocal(
  conversationId: string,
  text: string,
  senderId: string,
): Promise<string | null> {
  const body = text.trim();
  if (!body) return null;
  const db = getDatabase();
  const now = Date.now();
  const clientMsgId = newClientMsgId();
  await db.write(async () => {
    await db.get<Message>('messages').create(m => {
      m.clientMsgId = clientMsgId;
      m.conversationId = conversationId;
      m.senderId = senderId;
      m.type = 'text';
      m.contentPlain = body;
      m.state = 'sending';
      m.deleted = false;
      m.viewOnce = false;
      m.starred = false;
      m.createdAt = now;
    });
    // The conversation row may not exist locally (real conversations are created in
    // group-channel-service, out of MP2 scope) — bump it only when present.
    const conv = await db
      .get<Conversation>('conversations')
      .find(conversationId)
      .catch(() => null);
    if (conv) {
      await conv.update(c => {
        c.lastMessagePreview = body;
        c.lastMessageAt = now;
        c.unreadCount = 0;
        c.updatedAt = now;
      });
    }
  });
  return clientMsgId;
}

// ── inbound reconciliation (§L6) ─────────────────────────────────────────────

interface ConvBump {
  preview: string;
  at: number;
  seq: number;
  unread: number;
}

function accumulateBump(
  map: Map<string, ConvBump>,
  s: ServerMessage,
  unread: number,
  now: number,
): void {
  const at = s.serverTs ?? now;
  const preview = s.content ?? '';
  const prev = map.get(s.conversationId);
  if (!prev) {
    map.set(s.conversationId, { preview, at, seq: s.seq, unread });
    return;
  }
  if (s.seq >= prev.seq) {
    prev.preview = preview;
    prev.at = at;
    prev.seq = s.seq;
  }
  prev.unread += unread;
}

/**
 * Batch-apply inbound server messages in a SINGLE transaction (§L6 "pull → batch-apply →
 * advance"). Each row is reconciled via `reconcileDecision`: our own echo (matched by
 * `client_msg_id`) → UPDATE the optimistic row with the server `seq`; a `seq` we already
 * hold → SKIP; otherwise INSERT. Unread bumps only for inbound from OTHERS, never own echo.
 * Ordering by `seq` (never timestamp). Idempotent — replaying the same window is a no-op.
 */
export async function applyServerMessages(
  servers: ServerMessage[],
): Promise<void> {
  if (servers.length === 0) return;
  const db = getDatabase();
  const meId = getAccountId();
  const msgs = db.get<Message>('messages');
  const convs = db.get<Conversation>('conversations');
  const now = Date.now();
  const sorted = [...servers].sort((a, b) => a.seq - b.seq);
  await db.write(async () => {
    const ops: Model[] = [];
    const bumps = new Map<string, ConvBump>();
    for (const s of sorted) {
      const byClient = s.clientMsgId
        ? await msgs.query(Q.where('client_msg_id', s.clientMsgId)).fetch()
        : [];
      const bySeq = await msgs
        .query(
          Q.where('conversation_id', s.conversationId),
          Q.where('seq', s.seq),
        )
        .fetch();
      const decision = reconcileDecision({
        hasClientMsgIdRow: byClient.length > 0,
        hasSeqRow: bySeq.length > 0,
      });
      if (decision === 'skip') continue;
      const own = meId !== undefined && s.senderId === meId;
      const nextState = own ? 'sent' : 'delivered';
      if (decision === 'update') {
        const row = byClient[0];
        if (!row) continue;
        // Drop any live-echo dup that already carried this seq (WS raced ahead of the ack).
        for (const d of bySeq) {
          if (d.id !== row.id) ops.push(d.prepareDestroyPermanently());
        }
        ops.push(
          row.prepareUpdate(m => {
            m.seq = s.seq;
            if (s.serverTs !== undefined) m.serverTs = s.serverTs;
            if (s.content !== undefined) m.contentPlain = s.content;
            // don't downgrade a delivered/read receipt back to sent
            if (m.state === 'sending' || m.state === 'failed')
              m.state = nextState;
          }),
        );
        accumulateBump(bumps, s, 0, now);
      } else {
        ops.push(
          msgs.prepareCreate(m => {
            m.clientMsgId = s.clientMsgId ?? `srv_${s.conversationId}_${s.seq}`;
            m.conversationId = s.conversationId;
            m.seq = s.seq;
            m.senderId = s.senderId;
            m.type = s.type;
            if (s.content !== undefined) m.contentPlain = s.content;
            if (s.replyToId !== undefined) m.replyToId = s.replyToId;
            m.state = nextState;
            m.deleted = false;
            m.viewOnce = false;
            m.starred = false;
            // created_at is the local timeline sort key; anchor it to server sent_at so a
            // backfilled row lands in the right place (ordering identity is still `seq`).
            m.createdAt = s.serverTs ?? now;
            if (s.serverTs !== undefined) m.serverTs = s.serverTs;
          }),
        );
        accumulateBump(bumps, s, own ? 0 : 1, now);
      }
    }
    for (const [convId, b] of bumps) {
      const conv = await convs.find(convId).catch(() => null);
      if (!conv) continue;
      ops.push(
        conv.prepareUpdate(c => {
          if (b.at >= (c.lastMessageAt ?? 0)) {
            c.lastMessagePreview = b.preview;
            c.lastMessageAt = b.at;
            c.lastMessageSeq = b.seq;
          }
          if (b.unread > 0) c.unreadCount = (c.unreadCount ?? 0) + b.unread;
          c.updatedAt = now;
        }),
      );
    }
    if (ops.length > 0) await db.batch(...ops);
  });
}

/** Apply a single inbound server message (WS `message` frame). Thin wrapper over the batch. */
export function applyServerMessage(server: ServerMessage): Promise<void> {
  return applyServerMessages([server]);
}

/**
 * Flip our optimistic row to `sent` on the send ACK, stamping the authoritative `seq`.
 * Also destroys any live-echo dup that already carries this seq (WS beat the REST ack) so
 * the invariant "one row per seq" holds regardless of which arrived first.
 */
export async function markMessageSent(
  clientMsgId: string,
  ack: SendAck,
): Promise<void> {
  const db = getDatabase();
  const msgs = db.get<Message>('messages');
  await db.write(async () => {
    const mine = await msgs
      .query(Q.where('client_msg_id', clientMsgId))
      .fetch();
    const row = mine[0];
    if (!row) return;
    const dups = await msgs
      .query(
        Q.where('conversation_id', row.conversationId),
        Q.where('seq', ack.seq),
      )
      .fetch();
    const conv = await db
      .get<Conversation>('conversations')
      .find(row.conversationId)
      .catch(() => null);
    const ops: Model[] = [];
    for (const d of dups) {
      if (d.id !== row.id) ops.push(d.prepareDestroyPermanently());
    }
    ops.push(
      row.prepareUpdate(m => {
        m.seq = ack.seq;
        if (ack.serverTs !== undefined) m.serverTs = ack.serverTs;
        if (m.state === 'sending' || m.state === 'failed') m.state = 'sent';
      }),
    );
    if (conv && ack.seq > (conv.lastMessageSeq ?? 0)) {
      ops.push(
        conv.prepareUpdate(c => {
          c.lastMessageSeq = ack.seq;
        }),
      );
    }
    await db.batch(...ops);
  });
}

/** Surface a permanently-failed send in the UI (retry affordance) — state → `failed`. */
export async function markMessageFailed(clientMsgId: string): Promise<void> {
  const db = getDatabase();
  const msgs = db.get<Message>('messages');
  await db.write(async () => {
    const mine = await msgs
      .query(Q.where('client_msg_id', clientMsgId))
      .fetch();
    const row = mine[0];
    if (!row) return;
    await row.update(m => {
      m.state = 'failed';
    });
  });
}

/** The reconnect cursor for a conversation: the highest server `seq` we hold (0 if none). */
export async function maxSeqForConversation(
  conversationId: string,
): Promise<number> {
  const rows = await getDatabase()
    .get<Message>('messages')
    .query(
      Q.where('conversation_id', conversationId),
      Q.where('seq', Q.gt(0)),
      Q.sortBy('seq', Q.desc),
      Q.take(1),
    )
    .fetch();
  return rows[0]?.seq ?? 0;
}

/**
 * Apply a cumulative receipt (§5): advance OUR messages with `seq ≤ upToSeq` to the new
 * state (`delivered`|`read`), monotonically (never downgrade). Bounded by the matched rows.
 */
export async function applyReceipt(
  conversationId: string,
  upToSeq: number,
  state: 'delivered' | 'read',
): Promise<void> {
  if (!(upToSeq > 0)) return;
  const meId = getAccountId();
  if (meId === undefined) return;
  const db = getDatabase();
  const rows = await db
    .get<Message>('messages')
    .query(
      Q.where('conversation_id', conversationId),
      Q.where('sender_id', meId),
      Q.where('seq', Q.gt(0)),
      Q.where('seq', Q.lte(upToSeq)),
    )
    .fetch();
  const rank: Record<string, number> = {
    sending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
  };
  const target = rank[state] ?? 0;
  const toUpdate = rows.filter(r => (rank[r.state] ?? 0) < target);
  if (toUpdate.length === 0) return;
  await db.write(async () => {
    await db.batch(
      ...toUpdate.map(r =>
        r.prepareUpdate(m => {
          m.state = state;
        }),
      ),
    );
  });
}

const SEED_MESSAGES: Array<{ mine: boolean; text: string }> = [
  { mine: false, text: 'Hey! Are we still on for 6? 🎉' },
  { mine: true, text: 'Yes! Just wrapping up here.' },
  { mine: false, text: 'Perfect, see you then.' },
  { mine: true, text: 'On my way 🚗' },
];

const seededConversations = new Map<string, Promise<void>>();

async function doSeedMessages(
  conversationId: string,
  meId: string,
): Promise<void> {
  const db = getDatabase();
  const col = db.get<Message>('messages');
  const existing = await col
    .query(Q.where('conversation_id', conversationId))
    .fetchCount();
  if (existing > 0) return;
  const base = Date.now() - SEED_MESSAGES.length * 60_000;
  await db.write(async () => {
    await db.batch(
      SEED_MESSAGES.map((s, i) =>
        col.prepareCreate(m => {
          m.clientMsgId = newClientMsgId();
          m.conversationId = conversationId;
          m.senderId = s.mine ? meId : `peer_${conversationId}`;
          m.type = 'text';
          m.contentPlain = s.text;
          m.state = s.mine ? 'read' : 'delivered';
          m.deleted = false;
          m.viewOnce = false;
          m.starred = false;
          m.createdAt = base + i * 60_000;
        }),
      ),
    );
  });
}

/** Seed a few messages for a conversation once (dev). Serialised per conversation so
 * concurrent effect calls (StrictMode double-invoke) can't double-insert. */
export function seedDevMessages(
  conversationId: string,
  meId: string,
): Promise<void> {
  let p = seededConversations.get(conversationId);
  if (!p) {
    p = doSeedMessages(conversationId, meId);
    seededConversations.set(conversationId, p);
  }
  return p;
}
