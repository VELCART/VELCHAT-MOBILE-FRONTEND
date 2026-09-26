/**
 * Resolve what a reply is quoting (§F2).
 *
 * A quote usually points at something a few bubbles up, which the open window already holds, so
 * the common case is a map lookup and costs nothing. Answering a message from far back is the
 * case that needs a read — and it needs it EXACTLY ONCE: a quoted id that cannot be resolved
 * (deleted, or history this device never held) would otherwise be re-queried on every DB
 * emission for as long as the chat is open. `tried` is what makes a miss final.
 *
 * It lives in `hooks/` rather than in the screen because the screen may not reach `infra`
 * directly (§M3, `eslint-plugin-boundaries`), and it hands back PRIMITIVES rather than DB rows
 * so no model type crosses the boundary either.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { findQuotedMessages, type Message } from '../../../infra';

export interface QuoteSourceRow {
  readonly senderId: string;
  readonly type: string;
  readonly contentPlain: string | null;
}

const NONE: ReadonlyMap<string, QuoteSourceRow> = new Map();

/**
 * Most ids a single pass can ask for. The window grows with every page of scrollback, so an
 * unbounded batch is an unbounded `IN (…)` — and a bounded one loses nothing: what is left over
 * is picked up by the next emission, and a quote the reader cannot see yet does not need to be
 * resolved yet (§M0, no unbounded caches or queries).
 */
const MAX_PER_BATCH = 50;

function toRow(m: Message): QuoteSourceRow {
  return {
    senderId: m.senderId,
    type: m.type,
    contentPlain: m.contentPlain ?? null,
  };
}

export function useQuoteSource(
  messages: readonly Message[],
): ReadonlyMap<string, QuoteSourceRow> {
  const [fetched, setFetched] =
    useState<ReadonlyMap<string, QuoteSourceRow>>(NONE);
  const tried = useRef<Set<string>>(new Set());

  useEffect(() => {
    const held = new Set(messages.map(m => m.id));
    const missing: string[] = [];
    for (const m of messages) {
      const q = m.replyToId;
      if (!q || held.has(q) || tried.current.has(q)) continue;
      if (missing.length >= MAX_PER_BATCH) break;
      tried.current.add(q);
      missing.push(q);
    }
    if (missing.length === 0) return;
    let alive = true;
    void findQuotedMessages(missing)
      .then((found: readonly Message[]) => {
        if (!alive || found.length === 0) return;
        setFetched(prev => {
          const next = new Map(prev);
          for (const row of found) next.set(row.id, toRow(row));
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [messages]);

  // The open window wins over anything fetched earlier: a message that has since been edited
  // or re-stamped is correct in the window and stale in the cache.
  return useMemo(() => {
    const byId = new Map<string, QuoteSourceRow>(fetched);
    for (const m of messages) byId.set(m.id, toRow(m));
    return byId;
  }, [messages, fetched]);
}
