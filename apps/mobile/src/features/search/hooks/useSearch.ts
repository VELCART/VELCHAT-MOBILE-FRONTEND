/**
 * Search data hook (§F1, §M0, §R1) — the feature-layer bridge between the UI and infra. The UI
 * (`ui/`) never touches infra directly; it calls this hook, which queries the LOCAL DB.
 *
 * It owns the screen's STATE MACHINE, which is the point of it. The previous version returned
 * `results` alone and let the screen derive "browsing" from `query !== ''`, so on the first
 * keystroke `browsing` went false while `results` was still `[]` and every single search began
 * by telling the user "No results for “a”" for the length of the debounce plus a DB round trip.
 * A rejected query was swallowed into `setResults([])`, so a DB failure was indistinguishable
 * from a chat nobody had, and the copy blamed the user's spelling for it. There are four
 * states now and the screen renders four different things.
 *
 * - `frequent`: the user's most-recent conversations, OBSERVED from the DB (live), for the
 *   browse-state avatar row. `frequentLoaded` gates its zero state so it cannot flash.
 * - `results`: a ONE-SHOT search over conversations + messages, re-run on each debounced query
 *   change. A per-run `active` flag guards against a slower stale query overwriting a newer
 *   one; the debounce timer + DB subscription are both disposed on cleanup (§M20.3).
 *
 * Nothing here blocks the render path — the query runs off the debounce timer, async.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  searchConversations,
  searchMessages,
  fetchConversationNames,
  observeConversations,
  Conversation,
} from '../../../infra';
import { log } from '../../../core';
import type { SearchResult, SearchStatus, FrequentChat } from '../model/types';
import { timeLabel } from '../model/format';
import { matchSpans, snippet } from '../model/snippet';
import { mergeHits, type RankedHit } from '../model/merge';

/** Debounce before hitting the DB — one query per settled keystroke, not per character. */
const DEBOUNCE_MS = 200;
/** How many recent conversations to surface in the browse-state "Frequent" row. */
const FREQUENT_LIMIT = 5;
/** Fallback title when a conversation has no name (matched via preview, or a bare stub). */
const NO_NAME = '—';
/** Rows the merged list is capped at, AFTER ranking and dedupe (§R5). */
const RESULT_LIMIT = 100;
/**
 * Characters of context a subtitle gets. Sized to a one-line 13sp caption on the narrowest
 * supported screen, because a window wider than the row can be read is a window whose centred
 * match is still off-screen — which was the original defect.
 */
const SNIPPET_BUDGET = 40;

/** Which chip is active. Both narrowings are pushed INTO the query, never applied after a cap. */
export interface SearchFilter {
  readonly unreadOnly: boolean;
  readonly chatsOnly: boolean;
}

export interface SearchState {
  readonly status: SearchStatus;
  readonly results: readonly SearchResult[];
  readonly frequent: readonly FrequentChat[];
  /** False until the DB has emitted once, so the browse zero state cannot flash on mount. */
  readonly frequentLoaded: boolean;
  /** Unread conversations among the current matches — the Unread chip's badge. */
  readonly unreadMatches: number;
  /** Re-run the current query. The error state is the only thing that offers this. */
  readonly retry: () => void;
}

interface RunOutcome {
  readonly results: SearchResult[];
  readonly unreadMatches: number;
}

/** Build the view model for one hit: the window, and where to draw the emphasis in it. */
function toResult(
  id: string,
  kind: 'chat' | 'message',
  title: string,
  body: string,
  query: string,
  at: number,
  conversationId: string,
  unreadCount: number,
): SearchResult {
  const window = snippet(body, query, SNIPPET_BUDGET);
  return {
    id,
    kind,
    title,
    // Computed ONCE per result rather than per text node per render: the old row compiled a
    // fresh RegExp inside `Highlight` every time it drew, ~200 compilations per keystroke on a
    // full set.
    titleSpans: matchSpans(title, query),
    subtitle: window.text,
    subtitleSpans:
      window.offset >= 0
        ? [{ start: window.offset, length: window.length }]
        : [],
    time: at ? timeLabel(at) : '',
    unreadCount,
    conversationId,
    conversationName: title,
  };
}

/** Run the local searches the active filter actually needs, resolve names, merge + rank. */
async function runSearch(q: string, filter: SearchFilter): Promise<RunOutcome> {
  // A filter that cannot be satisfied by messages does not pay for a message scan. `LIKE
  // '%x%'` cannot use an index, so the cheapest message query is the one we never run.
  const wantsMessages = !filter.unreadOnly && !filter.chatsOnly;
  const [convs, msgs] = await Promise.all([
    searchConversations(q, { unreadOnly: filter.unreadOnly }),
    wantsMessages ? searchMessages(q) : Promise.resolve([]),
  ]);

  // Join: resolve which chat each message hit belongs to (one batched query).
  const names =
    msgs.length > 0
      ? await fetchConversationNames(msgs.map(m => m.conversationId))
      : {};

  const hits: RankedHit[] = [];

  for (const c of convs) {
    const title = c.name || NO_NAME;
    hits.push({
      at: c.lastMessageAt,
      raw: c.lastMessagePreview,
      result: toResult(
        `c_${c.id}`,
        'chat',
        title,
        c.lastMessagePreview,
        q,
        c.lastMessageAt,
        c.id,
        c.unreadCount,
      ),
    });
  }

  for (const m of msgs) {
    const chatName = names[m.conversationId] || NO_NAME;
    hits.push({
      at: m.createdAt,
      raw: m.contentPlain,
      result: toResult(
        `m_${m.id}`,
        'message',
        chatName,
        m.contentPlain,
        q,
        m.createdAt,
        m.conversationId,
        0,
      ),
    });
  }

  return {
    results: mergeHits(hits, q, RESULT_LIMIT),
    unreadMatches: convs.filter(c => c.unreadCount > 0).length,
  };
}

interface QueryState {
  readonly status: SearchStatus;
  readonly results: readonly SearchResult[];
  readonly unreadMatches: number;
}

const IDLE: QueryState = { status: 'idle', results: [], unreadMatches: 0 };
const SEARCHING: QueryState = {
  status: 'searching',
  results: [],
  unreadMatches: 0,
};

export function useSearch(query: string, filter: SearchFilter): SearchState {
  const [queryState, setQueryState] = useState<QueryState>(IDLE);
  const [frequent, setFrequent] = useState<readonly FrequentChat[]>([]);
  const [frequentLoaded, setFrequentLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  // Live "frequent" = most-recent conversations, straight from the DB (offline-first). The
  // subscription is owned here and disposed on unmount. Guarded so a missing native DB module
  // (pre-rebuild binary) degrades to an empty row instead of crashing the screen.
  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    try {
      sub = observeConversations(FREQUENT_LIMIT).subscribe(
        (rows: Conversation[]) => {
          setFrequent(
            rows.map(c => ({
              id: c.id,
              name: c.name ?? '',
            })),
          );
          setFrequentLoaded(true);
        },
      );
    } catch {
      setFrequent([]);
      setFrequentLoaded(true);
    }
    return () => sub?.unsubscribe();
  }, []);

  // The query a run is already in flight for. Typing earns the debounce; flipping a chip
  // re-runs the same query immediately, because 200ms of skeleton on a tap reads as a stall.
  const lastQuery = useRef<string | null>(null);

  const { unreadOnly, chatsOnly } = filter;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      lastQuery.current = null;
      setQueryState(IDLE);
      return undefined;
    }
    const delay = lastQuery.current === q ? 0 : DEBOUNCE_MS;
    lastQuery.current = q;

    let active = true;
    setQueryState(SEARCHING);
    const timer = setTimeout(() => {
      runSearch(q, { unreadOnly, chatsOnly })
        .then(outcome => {
          if (!active) return;
          setQueryState({
            status: 'done',
            results: outcome.results,
            unreadMatches: outcome.unreadMatches,
          });
        })
        .catch(() => {
          if (!active) return;
          // No query text in the log line — a search term is user content (§M19 redaction).
          log.warn('search: local query failed');
          setQueryState({ status: 'error', results: [], unreadMatches: 0 });
        });
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, unreadOnly, chatsOnly, attempt]);

  return {
    status: queryState.status,
    results: queryState.results,
    frequent,
    frequentLoaded,
    unreadMatches: queryState.unreadMatches,
    retry,
  };
}
