/**
 * Ranking + dedupe for the merged result set (§F1).
 *
 * Two defects are encoded here.
 *
 * 1. Ranking was recency-only, so typing a contact's exact name put that contact BELOW any
 *    newer message that happened to contain the word — the one row the user was certainly
 *    looking for was pushed off the top of the list by chatter.
 * 2. A conversation that matched on `last_message_preview` and the same message matching in
 *    `searchMessages` produced two adjacent rows with identical text and identical time. The
 *    conversation row is the one that survives: it carries the unread state and is the object
 *    the user is navigating to.
 */
import { matchTier, mergeHits, type RankedHit } from '../merge';
import type { ResultKind, SearchResult } from '../types';

function hit(
  partial: Partial<SearchResult> & { id: string; kind: ResultKind },
  at: number,
  raw = '',
): RankedHit {
  return {
    at,
    raw,
    result: {
      title: '',
      titleSpans: [],
      subtitle: raw,
      subtitleSpans: [],
      time: '',
      unreadCount: 0,
      conversationId: 'c1',
      conversationName: '',
      ...partial,
    },
  };
}

describe('matchTier', () => {
  test('an exact name match outranks a prefix, which outranks a substring', () => {
    expect(matchTier('chat', 'Tusha', 'tusha')).toBe(0);
    expect(matchTier('chat', 'Tushar Mehta', 'tusha')).toBe(1);
    expect(matchTier('chat', 'Anita Tushar', 'tusha')).toBe(2);
  });

  test('a message is always a message match, even in an exactly-named chat', () => {
    // The chat row for "Tusha" is the exact-name hit; a message inside it is not.
    expect(matchTier('message', 'Tusha', 'tusha')).toBe(3);
  });

  test('a conversation that matched only on its preview ranks with the messages', () => {
    expect(matchTier('chat', 'Team standup', 'invoice')).toBe(3);
  });

  test('surrounding whitespace and case never decide the tier', () => {
    expect(matchTier('chat', '  Tusha  ', 'TUSHA')).toBe(0);
  });
});

describe('mergeHits — ordering', () => {
  test('an exact name match beats a newer message containing the same word', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'm1', kind: 'message', title: 'Design crit' },
          9_000,
          'ping tusha about it',
        ),
        hit({ id: 'c1', kind: 'chat', title: 'Tusha' }, 1_000, 'older'),
      ],
      'tusha',
      50,
    );
    expect(merged.map(r => r.id)).toEqual(['c1', 'm1']);
  });

  test('within a tier, the most recent wins', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'm1', kind: 'message', title: 'A', conversationId: 'a' },
          1_000,
          'x',
        ),
        hit(
          { id: 'm2', kind: 'message', title: 'B', conversationId: 'b' },
          3_000,
          'y',
        ),
        hit(
          { id: 'm3', kind: 'message', title: 'C', conversationId: 'c' },
          2_000,
          'z',
        ),
      ],
      'nothing',
      50,
    );
    expect(merged.map(r => r.id)).toEqual(['m2', 'm3', 'm1']);
  });

  test('the full ladder: exact, prefix, substring, then message', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'm', kind: 'message', title: 'Someone' },
          9_999,
          'anna said hi',
        ),
        hit({ id: 'sub', kind: 'chat', title: 'Joanna Reed' }, 8_000),
        hit({ id: 'pre', kind: 'chat', title: 'Anna Baker' }, 7_000),
        hit({ id: 'exact', kind: 'chat', title: 'Anna' }, 1),
      ],
      'anna',
      50,
    );
    expect(merged.map(r => r.id)).toEqual(['exact', 'pre', 'sub', 'm']);
  });
});

describe('mergeHits — dedupe', () => {
  test('a conversation and its own last message collapse to one row', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'c_1', kind: 'chat', title: 'Tusha', conversationId: '1' },
          5_000,
          'the invoice is paid',
        ),
        hit(
          { id: 'm_9', kind: 'message', title: 'Tusha', conversationId: '1' },
          5_000,
          'the invoice is paid',
        ),
      ],
      'invoice',
      50,
    );
    expect(merged).toHaveLength(1);
    // The conversation row survives — it is the object being navigated to and it carries unread.
    expect(merged[0]?.id).toBe('c_1');
  });

  test('whitespace and case differences do not save a duplicate', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'c_1', kind: 'chat', conversationId: '1' },
          5_000,
          'The Invoice Is Paid',
        ),
        hit(
          { id: 'm_9', kind: 'message', conversationId: '1' },
          5_000,
          '  the invoice\n is paid ',
        ),
      ],
      'invoice',
      50,
    );
    expect(merged).toHaveLength(1);
  });

  test('the same text in a DIFFERENT chat is a different result', () => {
    const merged = mergeHits(
      [
        hit(
          { id: 'c_1', kind: 'chat', conversationId: '1' },
          5_000,
          'invoice paid',
        ),
        hit(
          { id: 'm_9', kind: 'message', conversationId: '2' },
          4_000,
          'invoice paid',
        ),
      ],
      'invoice',
      50,
    );
    expect(merged).toHaveLength(2);
  });

  test('an OLDER message with the same text as the preview is still its own row', () => {
    // Same words, different message: the user genuinely said it twice and both are results.
    const merged = mergeHits(
      [
        hit(
          { id: 'c_1', kind: 'chat', conversationId: '1' },
          5_000,
          'on my way',
        ),
        hit(
          { id: 'm_9', kind: 'message', conversationId: '1' },
          5_000,
          'on my way',
        ),
        hit(
          { id: 'm_8', kind: 'message', conversationId: '1' },
          1_000,
          'on my way then',
        ),
      ],
      'way',
      50,
    );
    expect(merged.map(r => r.id)).toEqual(['c_1', 'm_8']);
  });

  test('two rows with the same id cannot both survive', () => {
    const merged = mergeHits(
      [
        hit({ id: 'c_1', kind: 'chat' }, 5_000, 'a'),
        hit({ id: 'c_1', kind: 'chat' }, 4_000, 'b'),
      ],
      'a',
      50,
    );
    expect(merged).toHaveLength(1);
  });
});

describe('mergeHits — the cap', () => {
  test('the cap is applied LAST, so it keeps the best rows and not the first-fetched ones', () => {
    const hits: RankedHit[] = [];
    for (let i = 0; i < 40; i += 1) {
      hits.push(
        hit(
          {
            id: `m${i}`,
            kind: 'message',
            title: 'Noise',
            conversationId: `x${i}`,
          },
          10_000 + i,
          'anna mentioned',
        ),
      );
    }
    hits.push(
      hit({ id: 'exact', kind: 'chat', title: 'Anna', conversationId: 'z' }, 1),
    );
    const merged = mergeHits(hits, 'anna', 5);
    expect(merged).toHaveLength(5);
    expect(merged[0]?.id).toBe('exact');
  });

  test('a zero cap returns nothing rather than everything', () => {
    expect(mergeHits([hit({ id: 'a', kind: 'chat' }, 1)], 'q', 0)).toEqual([]);
  });

  test('an empty input is an empty result, not a crash', () => {
    expect(mergeHits([], 'q', 10)).toEqual([]);
  });
});
