/**
 * Message operations (§L7) — observe a conversation's messages and write an optimistic
 * local send. The UI reads the DB; the MP2 sync engine (§L6) will actually transmit via
 * the outbox and reconcile the server seq. Kept separate from the chat-list queries.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from './database';
import { Message, Conversation } from './models';

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
 * conversation preview, all in one transaction, so the UI updates instantly. The outbox
 * worker (MP2) transmits it and flips the state to sent/delivered/read.
 */
export async function sendMessageLocal(
  conversationId: string,
  text: string,
  senderId: string,
): Promise<void> {
  const body = text.trim();
  if (!body) return;
  const db = getDatabase();
  const now = Date.now();
  await db.write(async () => {
    await db.get<Message>('messages').create(m => {
      m.clientMsgId = newClientMsgId();
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
    const conv = await db
      .get<Conversation>('conversations')
      .find(conversationId);
    await conv.update(c => {
      c.lastMessagePreview = body;
      c.lastMessageAt = now;
      c.unreadCount = 0;
      c.updatedAt = now;
    });
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
