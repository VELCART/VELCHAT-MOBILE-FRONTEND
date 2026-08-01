/**
 * Chat-list queries + a dev seed (§L5/§F2). The list observes the conversations table so
 * the UI reacts to DB writes (the sync engine will feed it in MP2). Until sync lands, a
 * one-shot dev seed makes the list non-empty on a fresh install.
 */
import { Q } from '@nozbe/watermelondb';
import { database } from './database';
import { Conversation } from './models';

/** Observe the chat list: non-archived, pinned first, then most-recent (§F2). */
export function observeConversations() {
  return database
    .get<Conversation>('conversations')
    .query(
      Q.where('is_archived', false),
      Q.sortBy('is_pinned', Q.desc),
      Q.sortBy('last_message_at', Q.desc),
    )
    .observe();
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

/** Insert a few sample conversations once (dev only) so the list isn't empty pre-sync. */
export async function seedDevConversations(): Promise<void> {
  const col = database.get<Conversation>('conversations');
  if ((await col.query().fetchCount()) > 0) return;
  const now = Date.now();
  await database.write(async () => {
    await database.batch(
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
