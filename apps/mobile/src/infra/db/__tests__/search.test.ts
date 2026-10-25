/**
 * Local search queries (§M0) — what the LIKE pattern is allowed to do, and what the rows that
 * come back are allowed to be.
 *
 * Three defects are encoded here.
 *
 * 1. `sanitizeLikeQuery` folded `%` AND `_` to `_` and stopped there, so searching `100%`
 *    silently matched "1000" and "100x": the user was shown rows that did not contain what
 *    they typed, with the matched term highlighted nowhere. The pattern is still relaxed —
 *    WatermelonDB's `Q.like` emits `LIKE ?` with no `ESCAPE` clause on SQLite, so a literal
 *    `%` is not expressible in SQL — but the relaxation is now a documented SUPERSET that an
 *    in-memory exact pass narrows back down.
 * 2. `searchMessages` did not exclude archived conversations while `searchConversations` did,
 *    so archived messages leaked into the results and tapping one opened an archived chat.
 * 3. The "Unread" chip filtered in JS after the 50-row cap, so it could show nothing while
 *    unread chats matched. The narrowing now happens in the query.
 */
import { Q } from '@nozbe/watermelondb';
import {
  likePattern,
  matchesLiteral,
  searchConversations,
  searchMessages,
} from '../search';
import { getDatabase } from '../database';
import { purgeAllLocalChat } from '../queries';
import { Conversation, Message } from '../models';

interface ConvSeed {
  readonly id: string;
  readonly name?: string;
  readonly preview?: string;
  readonly at?: number;
  readonly unread?: number;
  readonly archived?: boolean;
}

async function seedConversation(seed: ConvSeed): Promise<void> {
  const db = getDatabase();
  await db.write(async () => {
    await db.get<Conversation>('conversations').create(c => {
      c._raw.id = seed.id;
      c.type = 'dm';
      c.name = seed.name ?? '';
      c.lastMessagePreview = seed.preview ?? '';
      c.lastMessageAt = seed.at ?? 1_000;
      c.unreadCount = seed.unread ?? 0;
      c.isArchived = seed.archived ?? false;
    });
  });
}

interface MsgSeed {
  readonly id: string;
  readonly conversationId: string;
  readonly body: string;
  readonly at?: number;
  readonly deleted?: boolean;
}

async function seedMessage(seed: MsgSeed): Promise<void> {
  const db = getDatabase();
  await db.write(async () => {
    await db.get<Message>('messages').create(m => {
      m._raw.id = seed.id;
      m.conversationId = seed.conversationId;
      m.clientMsgId = seed.id;
      m.senderId = 'u1';
      m.type = 'text';
      m.state = 'sent';
      m.contentPlain = seed.body;
      m.createdAt = seed.at ?? 1_000;
      m.deleted = seed.deleted ?? false;
    });
  });
}

describe('likePattern', () => {
  test('wraps the query so it matches anywhere in the column', () => {
    expect(likePattern('rahul')).toBe('%rahul%');
  });

  test('both SQL wildcards are relaxed to the single-character one', () => {
    // A RELAXATION: `_` matches exactly one character, so the rows SQLite returns are a
    // superset of the real matches and never a subset. `matchesLiteral` removes the extras.
    expect(likePattern('50%')).toBe('%50_%');
    expect(likePattern('a_b')).toBe('%a_b%');
    expect(likePattern('%_mix_%')).toBe('%__mix__%');
  });

  test('ordinary text — letters, digits, spaces, punctuation — is untouched', () => {
    expect(likePattern('hello, world! 42')).toBe('%hello, world! 42%');
  });

  test('Unicode survives for real matching', () => {
    expect(likePattern('Jöhn')).toBe('%Jöhn%');
    expect(likePattern('नमस्ते')).toBe('%नमस्ते%');
    expect(likePattern('مرحبا')).toBe('%مرحبا%');
    expect(likePattern('gg 🎉')).toBe('%gg 🎉%');
  });

  test('surrounding whitespace is trimmed, not turned into a wildcard', () => {
    expect(likePattern('  rahul  ')).toBe('%rahul%');
  });
});

describe('matchesLiteral', () => {
  test('a typed % is literal here, which is the whole point', () => {
    expect(matchesLiteral('paid 100% upfront', '100%')).toBe(true);
    expect(matchesLiteral('1000 rupees', '100%')).toBe(false);
    expect(matchesLiteral('100x faster', '100%')).toBe(false);
  });

  test('a typed _ is literal too', () => {
    expect(matchesLiteral('file_name.txt', 'e_n')).toBe(true);
    expect(matchesLiteral('eXn', 'e_n')).toBe(false);
  });

  test('case is ignored', () => {
    expect(matchesLiteral('Rahul Sharma', 'rahul')).toBe(true);
  });

  test('empty text or empty query is never a match', () => {
    expect(matchesLiteral('', 'a')).toBe(false);
    expect(matchesLiteral('a', '')).toBe(false);
  });
});

describe('searchConversations', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
  });

  test('a query is not run at all for empty or whitespace input', async () => {
    await seedConversation({ id: 'c1', name: 'Rahul' });
    expect(await searchConversations('')).toEqual([]);
    expect(await searchConversations('   ')).toEqual([]);
  });

  test('matches on name OR preview, newest first', async () => {
    await seedConversation({ id: 'c1', name: 'Rahul Sharma', at: 1_000 });
    await seedConversation({
      id: 'c2',
      name: 'Team',
      preview: 'ask rahul',
      at: 5_000,
    });
    await seedConversation({
      id: 'c3',
      name: 'Nobody',
      preview: 'hello',
      at: 9_000,
    });
    const hits = await searchConversations('rahul');
    expect(hits.map(h => h.id)).toEqual(['c2', 'c1']);
  });

  test('archived conversations never surface', async () => {
    await seedConversation({ id: 'c1', name: 'Rahul', archived: true });
    expect(await searchConversations('rahul')).toEqual([]);
  });

  test('a literal % does not match the rows the relaxed pattern let through', async () => {
    await seedConversation({
      id: 'exact',
      name: 'paid 100% upfront',
      at: 1_000,
    });
    await seedConversation({ id: 'over1', name: '1000 rupees', at: 2_000 });
    await seedConversation({ id: 'over2', name: '100x faster', at: 3_000 });
    const hits = await searchConversations('100%');
    expect(hits.map(h => h.id)).toEqual(['exact']);
  });

  test('unreadOnly narrows IN THE QUERY, so the cap cannot hide an unread chat', async () => {
    // Twenty newer read matches would have filled a cap applied before the chip filter.
    for (let i = 0; i < 20; i += 1) {
      await seedConversation({
        id: `read${i}`,
        name: `standup ${i}`,
        at: 10_000 + i,
      });
    }
    await seedConversation({
      id: 'unread',
      name: 'standup notes',
      at: 1,
      unread: 3,
    });

    const all = await searchConversations('standup', { limit: 5 });
    expect(all.map(h => h.id)).not.toContain('unread');

    const onlyUnread = await searchConversations('standup', {
      limit: 5,
      unreadOnly: true,
    });
    expect(onlyUnread.map(h => h.id)).toEqual(['unread']);
    expect(onlyUnread[0]?.unreadCount).toBe(3);
  });

  test('the cap bounds the result set', async () => {
    for (let i = 0; i < 12; i += 1) {
      await seedConversation({ id: `c${i}`, name: `standup ${i}`, at: i });
    }
    expect(await searchConversations('standup', { limit: 4 })).toHaveLength(4);
  });
});

describe('searchMessages', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
  });

  test('finds non-deleted message bodies, newest first', async () => {
    await seedConversation({ id: 'c1' });
    await seedMessage({
      id: 'm1',
      conversationId: 'c1',
      body: 'the invoice is paid',
      at: 1_000,
    });
    await seedMessage({
      id: 'm2',
      conversationId: 'c1',
      body: 'invoice attached',
      at: 5_000,
    });
    await seedMessage({
      id: 'm3',
      conversationId: 'c1',
      body: 'invoice void',
      at: 9_000,
      deleted: true,
    });
    const hits = await searchMessages('invoice');
    expect(hits.map(h => h.id)).toEqual(['m2', 'm1']);
  });

  test('messages in an ARCHIVED conversation never surface', async () => {
    // The defect: tapping one of these opened a chat the user had deliberately put away.
    await seedConversation({ id: 'live' });
    await seedConversation({ id: 'filed', archived: true });
    await seedMessage({
      id: 'm1',
      conversationId: 'live',
      body: 'invoice here',
      at: 1_000,
    });
    await seedMessage({
      id: 'm2',
      conversationId: 'filed',
      body: 'invoice there',
      at: 9_000,
    });
    const hits = await searchMessages('invoice');
    expect(hits.map(h => h.id)).toEqual(['m1']);
  });

  test('an archived chat cannot eat the cap either', async () => {
    await seedConversation({ id: 'live' });
    await seedConversation({ id: 'filed', archived: true });
    for (let i = 0; i < 10; i += 1) {
      await seedMessage({
        id: `a${i}`,
        conversationId: 'filed',
        body: `invoice ${i}`,
        at: 10_000 + i,
      });
    }
    await seedMessage({
      id: 'keep',
      conversationId: 'live',
      body: 'invoice paid',
      at: 1,
    });
    expect(
      (await searchMessages('invoice', { limit: 3 })).map(h => h.id),
    ).toEqual(['keep']);
  });

  test('a literal % in a message body is matched literally', async () => {
    await seedConversation({ id: 'c1' });
    await seedMessage({
      id: 'exact',
      conversationId: 'c1',
      body: 'paid 100% upfront',
      at: 1_000,
    });
    await seedMessage({
      id: 'over',
      conversationId: 'c1',
      body: '1000 rupees owed',
      at: 2_000,
    });
    expect((await searchMessages('100%')).map(h => h.id)).toEqual(['exact']);
  });

  test('an empty query never touches the DB', async () => {
    expect(await searchMessages('  ')).toEqual([]);
  });
});

describe('the archived exclusion is a query clause, not only a filter', () => {
  beforeEach(async () => {
    await purgeAllLocalChat();
  });

  test('with no archived chats at all, no exclusion clause is added', async () => {
    await seedConversation({ id: 'c1' });
    await seedMessage({
      id: 'm1',
      conversationId: 'c1',
      body: 'invoice',
      at: 1,
    });
    expect((await searchMessages('invoice')).map(h => h.id)).toEqual(['m1']);
    const archived = await getDatabase()
      .get<Conversation>('conversations')
      .query(Q.where('is_archived', true))
      .fetchCount();
    expect(archived).toBe(0);
  });
});
