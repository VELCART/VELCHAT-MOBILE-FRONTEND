/**
 * Local search queries (§M0) — search runs over the LOCAL WatermelonDB, the UI's source of
 * truth, NOT the network. The backend has no usable server-side full-text search wired for
 * personal chats (message content is/will be opaque, and the `/search` service isn't
 * integrated), so a fully offline-first local query is both correct and the only option.
 *
 * These are ONE-SHOT fetches (not observed): search is a query, re-run on each debounced
 * keystroke, so there is no long-lived subscription to own/dispose here.
 */
import { Q } from '@nozbe/watermelondb';
import { getDatabase } from './database';
import { Conversation, Message } from './models';

/** A conversation match — the fields the search UI renders + navigates with. */
export interface ConversationSearchHit {
  id: string;
  name: string;
  lastMessagePreview: string;
  lastMessageAt: number;
  unreadCount: number;
}

/** A message match — the message row + which conversation it belongs to (for the join). */
export interface MessageSearchHit {
  id: string;
  conversationId: string;
  contentPlain: string;
  createdAt: number;
}

/** Cap on either result set — bounds the query cost + memory on the render path (§R5). */
const SEARCH_LIMIT = 50;

/**
 * Neutralise the two SQL `LIKE` wildcards in user input. WatermelonDB's `Q.like` compiles to
 * a bare `LIKE ?` with NO `ESCAPE` clause on the SQLite adapter, so `%`/`_` can't be made
 * strictly literal; we map BOTH to the single-char wildcard `_`. That bounds a user-typed
 * `%` from degenerating into a match-everything scan and keeps the query injection-safe,
 * while a literal `_` in a chat name still matches. (Mirrors `Q.sanitizeLikeString`'s intent,
 * scoped to just the two wildcards so spaces/punctuation/Unicode survive for real matching.)
 */
export function sanitizeLikeQuery(query: string): string {
  return query.replace(/[%_]/g, '_');
}

/**
 * Conversations whose `name` OR `last_message_preview` matches `query` (case-insensitive —
 * SQLite `LIKE` is ASCII-case-insensitive), most-recent first, capped. Archived chats are
 * excluded (they don't surface in the inbox, so they shouldn't surface in search either).
 * Empty/whitespace query → no query at all.
 */
export async function searchConversations(
  query: string,
): Promise<ConversationSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${sanitizeLikeQuery(q)}%`;
  const rows = await getDatabase()
    .get<Conversation>('conversations')
    .query(
      Q.where('is_archived', false),
      Q.or(
        Q.where('name', Q.like(like)),
        Q.where('last_message_preview', Q.like(like)),
      ),
      Q.sortBy('last_message_at', Q.desc),
      Q.take(SEARCH_LIMIT),
    )
    .fetch();
  return rows.map(c => ({
    id: c.id,
    name: c.name ?? '',
    lastMessagePreview: c.lastMessagePreview ?? '',
    lastMessageAt: c.lastMessageAt ?? 0,
    unreadCount: c.unreadCount ?? 0,
  }));
}

/**
 * Non-deleted messages whose `content_plain` matches `query`, newest-first, capped.
 *
 * NOTE (E2EE, §M0): `content_plain` is the readable body TODAY (enterprise / server-readable
 * chats + optimistic local sends). Personal E2EE messages store ciphertext in
 * `content_encrypted` (opaque) and are NOT searchable this way. When E2EE lands, message
 * search must run over a locally-decrypted index, not this column.
 */
export async function searchMessages(
  query: string,
): Promise<MessageSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${sanitizeLikeQuery(q)}%`;
  const rows = await getDatabase()
    .get<Message>('messages')
    .query(
      Q.where('deleted', false),
      Q.where('content_plain', Q.like(like)),
      Q.sortBy('created_at', Q.desc),
      Q.take(SEARCH_LIMIT),
    )
    .fetch();
  return rows.map(m => ({
    id: m.id,
    conversationId: m.conversationId,
    contentPlain: m.contentPlain ?? '',
    createdAt: m.createdAt ?? 0,
  }));
}

/**
 * Resolve conversation display names for a set of ids in ONE query (id → name), so a message
 * hit can show which chat it lives in without an N+1 fetch. Missing ids are simply absent.
 */
export async function fetchConversationNames(
  ids: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const rows = await getDatabase()
    .get<Conversation>('conversations')
    .query(Q.where('id', Q.oneOf(unique)))
    .fetch();
  const out: Record<string, string> = {};
  for (const c of rows) out[c.id] = c.name ?? '';
  return out;
}
