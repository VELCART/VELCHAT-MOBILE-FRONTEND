/**
 * The search screen's owner state machine (§R1) — the part of the fix that nothing else can
 * assert, because it is about WHEN each state is true rather than what it renders.
 *
 * The two defects it encodes:
 *
 * 1. There was no state. The screen derived "browsing" from `query !== ''`, so on the first
 *    keystroke it was no longer browsing while `results` was still `[]` — and the zero state
 *    rendered for the whole 200ms debounce plus the DB round trip. Every search began by
 *    telling the user "No results for “a”".
 * 2. A rejected query was swallowed into `setResults([])`. A DB failure and a chat nobody had
 *    were the same screen, and the copy blamed the user's spelling for the failure.
 *
 * The `infra` barrel is replaced wholesale rather than spied on: requiring the real one pulls
 * in native modules that do not exist under Jest.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSearch, type SearchFilter } from '../useSearch';
import type {
  ConversationSearchHit,
  MessageSearchHit,
} from '../../../../infra/db/search';

const mockSearchConversations = jest.fn();
const mockSearchMessages = jest.fn();
const mockFetchChrome = jest.fn();
let mockFrequentEmit: ((rows: unknown[]) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('../../../../infra', () => ({
  searchConversations: (q: string, o?: unknown) =>
    mockSearchConversations(q, o),
  searchMessages: (q: string, o?: unknown) => mockSearchMessages(q, o),
  fetchConversationChrome: (ids: readonly string[]) => mockFetchChrome(ids),
  observeConversations: () => ({
    subscribe: (next: (rows: unknown[]) => void) => {
      mockFrequentEmit = next;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
}));

const ALL: SearchFilter = { unreadOnly: false, chatsOnly: false };

function conv(
  partial: Partial<ConversationSearchHit> & { id: string },
): ConversationSearchHit {
  return {
    name: '',
    lastMessagePreview: '',
    lastMessageAt: 1_000,
    unreadCount: 0,
    peerAvatarUrl: undefined,
    ...partial,
  };
}

function msg(
  partial: Partial<MessageSearchHit> & { id: string },
): MessageSearchHit {
  return {
    conversationId: 'c1',
    contentPlain: '',
    createdAt: 1_000,
    ...partial,
  };
}

/** Let the debounce fire and the resulting promise chain settle. */
async function settle(ms = 250): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFrequentEmit = null;
  mockSearchConversations.mockReset().mockResolvedValue([]);
  mockSearchMessages.mockReset().mockResolvedValue([]);
  mockFetchChrome.mockReset().mockResolvedValue({});
  mockUnsubscribe.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSearch — the four states', () => {
  it('is idle for an empty query, and never touches the DB for one', async () => {
    const { result } = renderHook(() => useSearch('   ', ALL));
    expect(result.current.status).toBe('idle');
    await settle();
    expect(mockSearchConversations).not.toHaveBeenCalled();
    expect(mockSearchMessages).not.toHaveBeenCalled();
  });

  it('is SEARCHING from the first keystroke — not "no results" for the debounce', () => {
    // The defect, exactly: `results` is empty here and always was. What changed is that the
    // screen is now told why it is empty.
    const { result } = renderHook(() => useSearch('a', ALL));
    expect(result.current.status).toBe('searching');
    expect(result.current.results).toEqual([]);
  });

  it('stays SEARCHING across the debounce AND the round trip, then goes done', async () => {
    let release: (v: ConversationSearchHit[]) => void = () => undefined;
    mockSearchConversations.mockReturnValue(
      new Promise<ConversationSearchHit[]>(res => {
        release = res;
      }),
    );
    const { result } = renderHook(() => useSearch('rahul', ALL));

    await act(async () => {
      jest.advanceTimersByTime(199);
    });
    expect(result.current.status).toBe('searching'); // debounce not yet fired

    await act(async () => {
      jest.advanceTimersByTime(2);
    });
    expect(result.current.status).toBe('searching'); // query in flight

    await act(async () => {
      release([conv({ id: 'c1', name: 'Rahul' })]);
    });
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.results.map(r => r.id)).toEqual(['c_c1']);
  });

  it('a DB failure is its OWN state, not an empty result', async () => {
    mockSearchConversations.mockRejectedValue(new Error('disk is gone'));
    const { result } = renderHook(() => useSearch('rahul', ALL));
    await settle();
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.results).toEqual([]);
  });

  it('retry re-runs the same query and can recover', async () => {
    mockSearchConversations.mockRejectedValueOnce(new Error('transient'));
    const { result } = renderHook(() => useSearch('rahul', ALL));
    await settle();
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Rahul' }),
    ]);
    await act(async () => {
      result.current.retry();
    });
    await settle();
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.results).toHaveLength(1);
  });

  it('clearing the query returns to idle rather than leaving the last results up', async () => {
    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Rahul' }),
    ]);
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearch(q, ALL),
      { initialProps: { q: 'rahul' } },
    );
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    rerender({ q: '' });
    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual([]);
  });
});

describe('useSearch — what a result carries', () => {
  it('the subtitle is a WINDOW on the match, not the head of a 400-character body', async () => {
    mockSearchConversations.mockResolvedValue([]);
    mockSearchMessages.mockResolvedValue([
      msg({
        id: 'm1',
        contentPlain: `${'filler '.repeat(60)}needle${' tail'.repeat(60)}`,
      }),
    ]);
    mockFetchChrome.mockResolvedValue({
      c1: { name: 'Design crit', peerAvatarUrl: undefined },
    });

    const { result } = renderHook(() => useSearch('needle', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    const row = result.current.results[0];
    expect(row?.subtitle).toContain('needle');
    expect(row?.subtitle.length).toBeLessThanOrEqual(40);
    // And it says exactly where to draw the emphasis, so the row never searches again.
    const span = row?.subtitleSpans[0];
    expect(span).toBeDefined();
    expect(
      row?.subtitle.slice(
        span?.start,
        (span?.start ?? 0) + (span?.length ?? 0),
      ),
    ).toBe('needle');
  });

  it('a title match is pre-spanned too', async () => {
    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Rahul Sharma', lastMessagePreview: 'see you' }),
    ]);
    const { result } = renderHook(() => useSearch('rahul', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.titleSpans).toEqual([
      { start: 0, length: 5 },
    ]);
  });

  it('carries the unread COUNT, so the row draws the same pill the inbox draws', async () => {
    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Rahul', unreadCount: 7 }),
    ]);
    const { result } = renderHook(() => useSearch('rahul', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.unreadCount).toBe(7);
    expect(result.current.unreadMatches).toBe(1);
  });
});

describe('useSearch — the filter is pushed into the query', () => {
  it('unreadOnly narrows the conversation query and skips the message scan entirely', async () => {
    const { result } = renderHook(() =>
      useSearch('standup', { unreadOnly: true, chatsOnly: false }),
    );
    await settle();
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(mockSearchConversations).toHaveBeenCalledWith('standup', {
      unreadOnly: true,
    });
    // `LIKE '%x%'` cannot use an index, so the cheapest message scan is the one never run.
    expect(mockSearchMessages).not.toHaveBeenCalled();
  });

  it('chatsOnly skips the message scan as well', async () => {
    const { result } = renderHook(() =>
      useSearch('standup', { unreadOnly: false, chatsOnly: true }),
    );
    await settle();
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(mockSearchMessages).not.toHaveBeenCalled();
  });

  it('flipping a chip re-runs WITHOUT paying the typing debounce again', async () => {
    const { result, rerender } = renderHook(
      ({ f }: { f: SearchFilter }) => useSearch('standup', f),
      { initialProps: { f: ALL } },
    );
    await settle();
    await waitFor(() => expect(result.current.status).toBe('done'));

    mockSearchConversations.mockClear();
    rerender({ f: { unreadOnly: true, chatsOnly: false } });
    // Zero delay: the chip tap must not feel like a stall.
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    await waitFor(() =>
      expect(mockSearchConversations).toHaveBeenCalledWith('standup', {
        unreadOnly: true,
      }),
    );
  });
});

describe('useSearch — ownership', () => {
  it('the frequent row is gated on the first DB emission, so it cannot flash', () => {
    const { result } = renderHook(() => useSearch('', ALL));
    expect(result.current.frequentLoaded).toBe(false);
    act(() => {
      mockFrequentEmit?.([{ id: 'c1', name: 'Rahul' }]);
    });
    expect(result.current.frequentLoaded).toBe(true);
    expect(result.current.frequent).toEqual([{ id: 'c1', name: 'Rahul' }]);
  });

  it('disposes the DB subscription on unmount (§M20.3)', () => {
    const { unmount } = renderHook(() => useSearch('', ALL));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('a slower stale query cannot overwrite a newer one', async () => {
    let releaseOld: (v: ConversationSearchHit[]) => void = () => undefined;
    mockSearchConversations.mockImplementationOnce(
      () =>
        new Promise<ConversationSearchHit[]>(res => {
          releaseOld = res;
        }),
    );
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useSearch(q, ALL),
      { initialProps: { q: 'ra' } },
    );
    await settle();

    mockSearchConversations.mockResolvedValue([
      conv({ id: 'new', name: 'Rahul' }),
    ]);
    rerender({ q: 'rahul' });
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));

    await act(async () => {
      releaseOld([conv({ id: 'stale', name: 'Ra' })]);
    });
    expect(result.current.results.map(r => r.id)).toEqual(['c_new']);
  });
});

describe('a result carries the peer photo the inbox already resolved', () => {
  it('passes the conversation row’s photo straight through', async () => {
    // Never fetched while rendering: a members lookup + profile + media URL per row per
    // keystroke is exactly why search drew coloured initials where the inbox drew faces.
    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Ada', peerAvatarUrl: 'https://x/ada.jpg' }),
    ]);

    const { result } = renderHook(() => useSearch('ada', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.peerAvatarUrl).toBe('https://x/ada.jpg');
  });

  it('gives a MESSAGE hit the photo of the chat it lives in', async () => {
    mockSearchMessages.mockResolvedValue([
      msg({ id: 'm1', conversationId: 'c1', contentPlain: 'ada' }),
    ]);
    mockFetchChrome.mockResolvedValue({
      c1: { name: 'Ada', peerAvatarUrl: 'https://x/ada.jpg' },
    });

    const { result } = renderHook(() => useSearch('ada', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.peerAvatarUrl).toBe('https://x/ada.jpg');
  });

  it('is undefined, never an empty string, when the chat has no photo', async () => {
    mockSearchConversations.mockResolvedValue([
      conv({ id: 'c1', name: 'Ada' }),
    ]);

    const { result } = renderHook(() => useSearch('ada', ALL));
    await settle();
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]?.peerAvatarUrl).toBeUndefined();
  });
});
