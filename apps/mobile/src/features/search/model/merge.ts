/**
 * Merging the two local searches into one ranked, deduplicated list (§F1). Pure: no React, no
 * DB, so the ordering rules are testable without a device.
 *
 * Why ranking exists at all: the first version sorted by recency alone, which meant typing a
 * contact's exact name put that contact below every newer message that happened to contain the
 * word. The tiers below are deliberately crude — exact name, name prefix, name substring, then
 * message body — because a search over two columns with `LIKE` has no relevance score to
 * borrow, and a crude tier that matches intent beats a precise score that does not.
 *
 * Why dedupe exists: a conversation matches on `last_message_preview` and the very same message
 * matches in `searchMessages`, so the list showed two adjacent rows with identical text and
 * identical time. The conversation row is the one kept — it carries unread state and is the
 * object the tap navigates to.
 */
import type { ResultKind, SearchResult } from './types';
import { collapseWhitespace } from './snippet';

/** A result plus the two things ordering needs and the view model does not carry. */
export interface RankedHit {
  /** Timestamp used for recency within a tier. */
  readonly at: number;
  /** The RAW text the subtitle was windowed from — what dedupe compares. */
  readonly raw: string;
  readonly result: SearchResult;
}

/** Lower is better. 0 exact name · 1 name prefix · 2 name substring · 3 body match. */
export function matchTier(
  kind: ResultKind,
  title: string,
  query: string,
): 0 | 1 | 2 | 3 {
  if (kind === 'message') return 3;
  const n = title.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q || !n) return 3;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  // A conversation that matched on its preview rather than its name: it is a body match.
  return 3;
}

/** Same conversation + same words = the same thing said once, however it was found. */
function dedupeKey(conversationId: string, raw: string): string {
  return `${conversationId}\u0000${collapseWhitespace(raw).toLowerCase()}`;
}

/**
 * Dedupe, rank, then cap — in that order. The cap comes LAST on purpose: capping per table
 * before ranking is how the best row in the set gets dropped for forty newer ones.
 */
export function mergeHits(
  hits: readonly RankedHit[],
  query: string,
  limit: number,
): SearchResult[] {
  if (limit <= 0) return [];

  // A conversation row wins over a message row with the same words in the same chat.
  const conversationText = new Set<string>();
  for (const h of hits) {
    if (h.result.kind === 'chat' && h.raw.trim()) {
      conversationText.add(dedupeKey(h.result.conversationId, h.raw));
    }
  }

  const seenIds = new Set<string>();
  const kept: RankedHit[] = [];
  for (const h of hits) {
    if (seenIds.has(h.result.id)) continue;
    if (
      h.result.kind === 'message' &&
      h.raw.trim() &&
      conversationText.has(dedupeKey(h.result.conversationId, h.raw))
    ) {
      continue;
    }
    seenIds.add(h.result.id);
    kept.push(h);
  }

  const tiers = new Map<string, number>();
  for (const h of kept) {
    tiers.set(h.result.id, matchTier(h.result.kind, h.result.title, query));
  }

  kept.sort((a, b) => {
    const ta = tiers.get(a.result.id) ?? 3;
    const tb = tiers.get(b.result.id) ?? 3;
    if (ta !== tb) return ta - tb;
    return b.at - a.at;
  });

  return kept.slice(0, limit).map(h => h.result);
}
