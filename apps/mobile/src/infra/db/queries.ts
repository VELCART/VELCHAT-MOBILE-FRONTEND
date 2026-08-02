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

/** Insert a few sample conversations once (dev). Serialised so concurrent effect calls
 * (React StrictMode double-invoke) can't both read count 0 and double-insert. */
export function seedDevConversations(): Promise<void> {
  if (!seedOnce) seedOnce = doSeed();
  return seedOnce;
}
