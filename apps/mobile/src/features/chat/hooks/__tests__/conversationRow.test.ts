/**
 * Chat-list row view-model. The hook must hand the UI PLAIN PRIMITIVES snapshotted per
 * emission — WatermelonDB mutates its cached model in place and re-emits the same object
 * reference, so anything derived lazily from the model would be invisible to a memoised row.
 * The timestamp label is part of that snapshot (ICU over JNI is far too slow per render).
 */
import type { Conversation } from '../../../../infra';
import { conversationTimeLabel, toConversationRow } from '../useConversations';

const at = (y: number, mo: number, d: number, h: number, mi: number): number =>
  new Date(y, mo, d, h, mi).getTime();

const NOW = at(2026, 7, 2, 12, 0); // 2 Aug 2026, noon

function model(over: Record<string, unknown> = {}): Conversation {
  return {
    id: 'c1',
    type: 'dm',
    name: 'Ada Lovelace',
    lastMessagePreview: 'see you at 6',
    lastMessageAt: at(2026, 7, 2, 9, 30),
    unreadCount: 3,
    isPinned: false,
    ...over,
  } as unknown as Conversation;
}

describe('toConversationRow', () => {
  it('snapshots the model into plain primitives', () => {
    const row = toConversationRow(model(), NOW);
    expect(row).toEqual({
      id: 'c1',
      type: 'dm',
      name: 'Ada Lovelace',
      preview: 'see you at 6',
      unread: 3,
      pinned: false,
      time: conversationTimeLabel(at(2026, 7, 2, 9, 30), NOW),
    });
  });

  it('reflects an IN-PLACE model mutation in a NEW row object', () => {
    // Exactly what WatermelonDB does when a chat is read or a message lands: the cached
    // model is mutated and the SAME reference is re-emitted.
    const m = model();
    const before = toConversationRow(m, NOW);

    const mutable = m as unknown as {
      unreadCount: number;
      lastMessagePreview: string;
    };
    mutable.unreadCount = 0;
    mutable.lastMessagePreview = 'on my way';
    const after = toConversationRow(m, NOW);

    expect(before.unread).toBe(3); // the earlier snapshot is immutable
    expect(before.preview).toBe('see you at 6');
    expect(after.unread).toBe(0);
    expect(after.preview).toBe('on my way');
  });

  it('substitutes an empty preview rather than undefined', () => {
    const row = toConversationRow(
      model({ lastMessagePreview: undefined }),
      NOW,
    );
    expect(row.preview).toBe('');
  });
});

describe('conversationTimeLabel', () => {
  it('returns a time-of-day for a same-day timestamp', () => {
    const label = conversationTimeLabel(at(2026, 7, 2, 9, 30), NOW);
    expect(label).toMatch(/30/);
    expect(label).not.toBe('Yesterday');
  });

  it('returns "Yesterday" for the previous calendar day', () => {
    expect(conversationTimeLabel(at(2026, 7, 1, 22, 0), NOW)).toBe('Yesterday');
  });

  it('returns a short date for anything older', () => {
    const label = conversationTimeLabel(at(2026, 6, 20, 10, 0), NOW);
    expect(label).not.toBe('');
    expect(label).not.toBe('Yesterday');
    expect(label).toMatch(/20/);
  });

  it('is empty for a missing or invalid timestamp', () => {
    expect(conversationTimeLabel(undefined, NOW)).toBe('');
    expect(conversationTimeLabel(0, NOW)).toBe('');
    expect(conversationTimeLabel(NaN, NOW)).toBe('');
  });
});

describe('VC-044 / VC-047 — the chat list shows the name YOU saved', () => {
  const book = [
    {
      key: 'k1',
      accountId: 'peer_1',
      name: 'Aayush Sir',
      phoneE164: '+910000000000',
    },
  ];

  it('the exact defect: prefers the address-book name over the registered one', () => {
    const row = toConversationRow(
      model({ name: 'Aayush Jain', peerId: 'peer_1' }),
      NOW,
      book,
    );
    expect(row.name).toBe('Aayush Sir');
  });

  it('keeps the registered name for a peer who is not in the address book', () => {
    const row = toConversationRow(
      model({ name: 'Ada Lovelace', peerId: 'peer_9' }),
      NOW,
      book,
    );
    expect(row.name).toBe('Ada Lovelace');
  });

  it('leaves a group name alone — it has no peer to look up', () => {
    const row = toConversationRow(
      model({ type: 'group', name: 'Team Velchat', peerId: undefined }),
      NOW,
      book,
    );
    expect(row.name).toBe('Team Velchat');
  });

  it('behaves exactly as before when contacts have not loaded', () => {
    const row = toConversationRow(
      model({ name: 'Aayush Jain', peerId: 'peer_1' }),
      NOW,
      null,
    );
    expect(row.name).toBe('Aayush Jain');
  });
});
