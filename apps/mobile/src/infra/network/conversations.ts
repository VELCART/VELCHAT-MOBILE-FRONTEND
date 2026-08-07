/**
 * Conversation REST surface (§L6, group-channel-service via the gateway). The backend has
 * NO inbox / list-all-conversations endpoint (§M0) — the LOCAL WatermelonDB is the inbox.
 * These three calls create + describe a conversation; the LIST is built locally from them
 * (startDm upsert) and from inbound messages (messages.ts stub creation).
 *
 *   - `createDm(a, b)`   → POST /conversations/dm — IDEMPOTENT, deterministic `dm-<sha>`.
 *   - `getConversationDetails(id)` → GET /conversations/:id (raw row, normalised).
 *   - `getConversationMembers(id)` → GET /conversations/:id/members (bare account_id[]).
 *
 * Response casing is normalised defensively in `conversationShape.ts` (pure, unit-tested).
 */
import { api } from './client';
import {
  normalizeCreateDm,
  normalizeConversationDetails,
  normalizeMembers,
  type CreateDmResult,
  type ConversationDetails,
} from './conversationShape';

/**
 * Create (or resolve) a DM between two account_ids (§F2). Idempotent: the same `(a,b)` pair
 * always yields the SAME deterministic `conversationId`, with `created:false` when it already
 * existed — so starting a DM twice never forks the thread. The backend rejects `a === b`.
 */
export async function createDm(a: string, b: string): Promise<CreateDmResult> {
  const res = await api.post('/conversations/dm', { a, b });
  return normalizeCreateDm(res.data);
}

/** Fetch a conversation's details (§F2). Raw DB row → normalised camelCase. */
export async function getConversationDetails(
  id: string,
): Promise<ConversationDetails> {
  const res = await api.get(`/conversations/${encodeURIComponent(id)}`);
  return normalizeConversationDetails(res.data);
}

/** Fetch a conversation's members — a bare array of account_ids (no names). */
export async function getConversationMembers(id: string): Promise<string[]> {
  const res = await api.get(`/conversations/${encodeURIComponent(id)}/members`);
  return normalizeMembers(res.data);
}

/** One conversation from the server inbox (§M0 re-enumerate) — id, type, and the member list
 * (so a DM can be named by the other member after a reinstall / re-login). */
export interface InboxConversation {
  conversationId: string;
  type: string;
  name: string | null;
  memberIds: string[];
}

/**
 * The server inbox: every conversation this user belongs to (group-channel `GET
 * /users/:id/conversations`). Lets a fresh install / re-login re-discover its DMs + groups; the
 * per-conversation MESSAGE history is then backfilled by the sync engine (afterSeq). Defensive
 * against casing/shape; a malformed row is dropped, never thrown.
 */
export async function fetchInbox(userId: string): Promise<InboxConversation[]> {
  const res = await api.get(
    `/users/${encodeURIComponent(userId)}/conversations`,
  );
  const rows: unknown[] = Array.isArray(res.data) ? res.data : [];
  const out: InboxConversation[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = r.conversation_id ?? r.conversationId;
    if (typeof id !== 'string' || id === '') continue;
    const members = r.member_ids ?? r.memberIds;
    out.push({
      conversationId: id,
      type: typeof r.type === 'string' ? r.type : 'dm',
      name: typeof r.name === 'string' && r.name !== '' ? r.name : null,
      memberIds: Array.isArray(members)
        ? members.filter((x): x is string => typeof x === 'string')
        : [],
    });
  }
  return out;
}
