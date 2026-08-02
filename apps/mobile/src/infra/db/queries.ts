/**
 * Chat-list queries + a dev seed (§L5/§F2). The list observes the conversations table so
 * the UI reacts to DB writes (the sync engine will feed it in MP2). Until sync lands, a
 * one-shot dev seed makes the list non-empty on a fresh install.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from './database';
import { Conversation } from './models';

/**
 * Observe the chat list: non-archived, pinned first, then most-recent (§F2).
 * `observeWithColumns` so IN-PLACE field changes (unread cleared, preview updated) also
 * re-render — a plain `.observe()` under a `sortBy` only re-emits on reorder/identity.
 */
export function observeConversations() {
  return getDatabase()
    .get<Conversation>('conversations')
    .query(
      Q.where('is_archived', false),
      Q.sortBy('is_pinned', Q.desc),
      Q.sortBy('last_message_at', Q.desc),
    )
    .observeWithColumns([
      'is_pinned',
      'last_message_at',
      'unread_count',
      'last_message_preview',
    ]);
}

/**
 * All known conversation ids (§L6 reconnect) — the sync engine walks these to send a
 * per-conversation `sync {cursor}` and pull the `afterSeq` backfill. Non-archived only is
 * not required here; sync should catch up every conversation we hold locally.
 */
export async function listConversationIds(): Promise<string[]> {
  const rows = await getDatabase()
    .get<Conversation>('conversations')
    .query()
    .fetch();
  return rows.map(c => c.id);
}

/**
 * A partial conversation row to create-or-update (§M0 — the local DB IS the inbox, since the
 * backend has no list-all-conversations endpoint). Only defined fields are written.
 */
export interface ConversationPatch {
  type?: string;
  name?: string;
  avatarMediaId?: string;
  lastMessagePreview?: string;
  lastMessageAt?: number;
}

/**
 * Create-or-update a conversation row keyed by the SERVER conversationId (§M0). Used by
 * `startDm` (user starts a DM) and, indirectly, wherever a conversation must appear in the
 * local inbox. Idempotent: a second call with the same id updates in place. Serialised via
 * the WatermelonDB writer (one writer at a time), so concurrent upserts for the same id can't
 * both create — the second sees the first's row. The row `id` is set to `conversationId` so
 * `find(conversationId)` (preview bumps, unread clear, receipts) resolves it.
 */
export async function upsertConversation(
  conversationId: string,
  patch: ConversationPatch,
): Promise<void> {
  const db = getDatabase();
  const col = db.get<Conversation>('conversations');
  const now = Date.now();
  await db.write(async () => {
    const existing = await col.find(conversationId).catch(() => null);
    if (existing) {
      await existing.update(c => {
        if (patch.type !== undefined) c.type = patch.type;
        if (patch.name !== undefined) c.name = patch.name;
        if (patch.avatarMediaId !== undefined) {
          c.avatarMediaId = patch.avatarMediaId;
        }
        if (patch.lastMessagePreview !== undefined) {
          c.lastMessagePreview = patch.lastMessagePreview;
        }
        // Never move the sort key backwards (a stale patch mustn't reorder the list).
        if (
          patch.lastMessageAt !== undefined &&
          patch.lastMessageAt >= (c.lastMessageAt ?? 0)
        ) {
          c.lastMessageAt = patch.lastMessageAt;
        }
        c.updatedAt = now;
      });
      return;
    }
    await col.create(c => {
      c._raw.id = conversationId;
      c.type = patch.type ?? 'dm';
      if (patch.name !== undefined) c.name = patch.name;
      if (patch.avatarMediaId !== undefined)
        c.avatarMediaId = patch.avatarMediaId;
      c.isAnnouncement = false;
      c.isPinned = false;
      c.isArchived = false;
      c.isLocked = false;
      if (patch.lastMessagePreview !== undefined) {
        c.lastMessagePreview = patch.lastMessagePreview;
      }
      // A freshly-started DM (no messages yet) sorts to the top: default to `now`.
      c.lastMessageAt = patch.lastMessageAt ?? now;
      c.unreadCount = 0;
      c.mentionCount = 0;
      c.notifLevel = 'all';
      c.createdAt = now;
      c.updatedAt = now;
    });
  });
}

/**
 * Clear a conversation's unread badge (§F2) — called when the user opens the chat. A
 * no-op if it's already 0 so an open doesn't churn a needless write/re-emit.
 */
export async function clearUnread(conversationId: string): Promise<void> {
  const db = getDatabase();
  const conv = await db
    .get<Conversation>('conversations')
    .find(conversationId)
    .catch(() => null);
  if (!conv || conv.unreadCount === 0) return;
  await db.write(async () => {
    await conv.update(c => {
      c.unreadCount = 0;
    });
  });
}

const SEED = [
  {
    name: 'Aarav Sharma',
    preview: 'See you at 6? 🎉',
    unread: 2,
    pinned: true,
  },
  {
    name: 'Design Team',
    preview: 'Riya: pushed the new mockups',
    unread: 5,
    pinned: true,
  },
  { name: 'Meera', preview: 'Thank you so much! 🙏', unread: 0, pinned: false },
  { name: 'Kabir', preview: 'Voice message', unread: 0, pinned: false },
  {
    name: 'Family ❤️',
    preview: 'Mom: Dinner is ready',
    unread: 1,
    pinned: false,
  },
  { name: 'Ishaan', preview: 'Sent a photo', unread: 0, pinned: false },
];

let seedOnce: Promise<void> | null = null;

async function doSeed(): Promise<void> {
  const db = getDatabase();
  const col = db.get<Conversation>('conversations');
  if ((await col.query().fetchCount()) > 0) return;
  const now = Date.now();
  await db.write(async () => {
    await db.batch(
      SEED.map((s, i) =>
        col.prepareCreate(c => {
          c.type = 'dm';
          c.name = s.name;
          c.isAnnouncement = false;
          c.isPinned = s.pinned;
          c.isArchived = false;
          c.isLocked = false;
          c.lastMessagePreview = s.preview;
          c.lastMessageAt = now - i * 3_600_000;
          c.unreadCount = s.unread;
          c.mentionCount = 0;
          c.notifLevel = 'all';
          c.createdAt = now;
          c.updatedAt = now;
        }),
      ),
    );
  });
}

/** Insert a few sample conversations once (DEV ONLY). Serialised so concurrent effect
 * calls (React StrictMode double-invoke) can't both read count 0 and double-insert.
 * Hard `__DEV__` gate so a release build never writes fake chats into the real DB. */
export function seedDevConversations(): Promise<void> {
  if (!__DEV__) return Promise.resolve();
  if (!seedOnce) seedOnce = doSeed();
  return seedOnce;
}
