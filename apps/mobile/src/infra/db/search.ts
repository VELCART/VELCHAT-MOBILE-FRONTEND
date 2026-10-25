/**
 * Local search queries (§M0) — search runs over the LOCAL WatermelonDB, the UI's source of
 * truth, NOT the network. The backend has no usable server-side full-text search wired for
 * personal chats (message content is/will be opaque, and the `/search` service isn't
 * integrated), so a fully offline-first local query is both correct and the only option.
 *
 * These are ONE-SHOT fetches (not observed): search is a query, re-run on each debounced
 * keystroke, so there is no long-lived subscription to own/dispose here.
 *
 * Cost note (§R4): `LIKE '%x%'` cannot use an index, so every query below is a table scan.
 * Nothing here adds a scan that was not already being paid for — the archived-conversation
 * lookup is a single id-only read of a small table, and the exact-match pass is in-memory over
 * rows SQLite has already returned.
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

export interface ConversationSearchOptions {
  /**
   * Narrow to conversations with unread messages, IN THE QUERY. The "Unread" chip used to
   * filter in JS after a 50-row cap had already been applied, so it could show nothing while
   * unread chats matched, and its badge counted only inside those 50.
   */
  readonly unreadOnly?: boolean;
  readonly limit?: number;
}

export interface MessageSearchOptions {
  readonly limit?: number;
}

/** Cap on either result set — bounds the query cost + memory on the render path (§R5). */
const SEARCH_LIMIT = 50;

/**
 * How many candidate rows to read per row we intend to keep, when the query contains a `LIKE`
 * wildcard and the SQL pattern is therefore wider than the user's literal text (see
 * `likePattern`). Without it, a query like `100%` could have its real matches pushed out of
 * the cap by the over-matches the relaxed pattern let in.
 */
const WILDCARD_OVERFETCH = 4;

/**
 * Above this many archived conversations we stop inlining them as a `NOT IN (...)` list and
 * lean on the in-memory filter instead — the clause is an optimisation, never the correctness.
 */
const ARCHIVED_CLAUSE_MAX = 200;

const WILDCARD = /[%_]/;

/**
 * The SQL `LIKE` pattern for a user's query.
 *
 * WatermelonDB's `Q.like` compiles to a bare `LIKE ?` with NO `ESCAPE` clause on the SQLite
 * adapter, so `%` and `_` cannot be made literal in SQL. Both are therefore mapped to `_`,
 * which matches exactly one character — a RELAXATION, never a restriction, so the rows SQLite
 * returns are a strict superset of the true matches. `matchesLiteral` below then removes the
 * over-matches in memory.
 *
 * That two-step is what fixes the old behaviour: `sanitizeLikeQuery` folded `%` to `_` and
 * stopped there, so searching `100%` silently returned "1000" and "100x" and the user was
 * shown results that did not contain what they typed. Escaping it in SQL would mean hand-built
 * raw SQL (`Q.unsafeSqlExpr`) around user input — an injection surface on the one code path
 * that takes free text, and one the Loki adapter the tests run on cannot execute at all.
 */
export function likePattern(query: string): string {
  return `%${query.trim().replace(/[%_]/g, '_')}%`;
}

/** Does `text` literally contain `query`, ignoring ASCII case? The exactness SQL cannot give. */
export function matchesLiteral(text: string, query: string): boolean {
  if (!query) return false;
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
}

/** Read candidates generously only when the relaxed pattern can actually over-match. */
function candidateTake(query: string, limit: number): number {
  return WILDCARD.test(query) ? limit * WILDCARD_OVERFETCH : limit;
}

/**
 * Conversations whose `name` OR `last_message_preview` matches `query` (case-insensitive),
 * most-recent first, capped. Archived chats are excluded (they don't surface in the inbox, so
 * they shouldn't surface in search either). Empty/whitespace query → no query at all.
 */
export async function searchConversations(
  query: string,
  options: ConversationSearchOptions = {},
): Promise<ConversationSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options.limit ?? SEARCH_LIMIT;
  if (limit <= 0) return [];
  const like = likePattern(q);
  const rows = await getDatabase()
    .get<Conversation>('conversations')
    .query(
      Q.where('is_archived', false),
      ...(options.unreadOnly ? [Q.where('unread_count', Q.gt(0))] : []),
      Q.or(
        Q.where('name', Q.like(like)),
        Q.where('last_message_preview', Q.like(like)),
      ),
      Q.sortBy('last_message_at', Q.desc),
      Q.take(candidateTake(q, limit)),
    )
    .fetch();
  const hits: ConversationSearchHit[] = [];
  for (const c of rows) {
    const name = c.name ?? '';
    const preview = c.lastMessagePreview ?? '';
    // The relaxed LIKE can only have let extra rows IN; drop the ones that do not actually
    // contain what the user typed.
    if (!matchesLiteral(name, q) && !matchesLiteral(preview, q)) continue;
    hits.push({
      id: c.id,
      name,
      lastMessagePreview: preview,
      lastMessageAt: c.lastMessageAt ?? 0,
      unreadCount: c.unreadCount ?? 0,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Ids of every archived conversation — the exclusion list message search needs. */
async function archivedConversationIds(): Promise<string[]> {
  return getDatabase()
    .get<Conversation>('conversations')
    .query(Q.where('is_archived', true))
    .fetchIds();
}

/**
 * Non-deleted messages whose `content_plain` matches `query`, newest-first, capped, EXCLUDING
 * messages in archived conversations.
 *
 * That exclusion is not cosmetic: `searchConversations` has always skipped archived chats, so
 * an archived conversation's messages leaked into the results as rows that looked like any
 * other and opened a chat the user had deliberately put away.
 *
 * NOTE (E2EE, §M0): `content_plain` is the readable body TODAY (enterprise / server-readable
 * chats + optimistic local sends). Personal E2EE messages store ciphertext in
 * `content_encrypted` (opaque) and are NOT searchable this way. When E2EE lands, message
 * search must run over a locally-decrypted index, not this column.
 */
export async function searchMessages(
  query: string,
  options: MessageSearchOptions = {},
): Promise<MessageSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = options.limit ?? SEARCH_LIMIT;
  if (limit <= 0) return [];
  const like = likePattern(q);

  const archivedIds = await archivedConversationIds();
  const archived = new Set(archivedIds);
  // Pushing the exclusion into SQL keeps archived rows from eating the cap. Past a bounded
  // list size the inline clause costs more than it saves, so we over-fetch and rely on the
  // in-memory check below — which runs either way, and is what actually guarantees the result.
  const excludeClause =
    archivedIds.length > 0 && archivedIds.length <= ARCHIVED_CLAUSE_MAX
      ? [Q.where('conversation_id', Q.notIn(archivedIds))]
      : [];
  const take =
    candidateTake(q, limit) *
    (excludeClause.length === 0 && archived.size ? 2 : 1);

  const rows = await getDatabase()
    .get<Message>('messages')
    .query(
      Q.where('deleted', false),
      ...excludeClause,
      Q.where('content_plain', Q.like(like)),
      Q.sortBy('created_at', Q.desc),
      Q.take(take),
    )
    .fetch();

  const hits: MessageSearchHit[] = [];
  for (const m of rows) {
    if (archived.has(m.conversationId)) continue;
    const body = m.contentPlain ?? '';
    if (!matchesLiteral(body, q)) continue;
    hits.push({
      id: m.id,
      conversationId: m.conversationId,
      contentPlain: body,
      createdAt: m.createdAt ?? 0,
    });
    if (hits.length >= limit) break;
  }
  return hits;
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
