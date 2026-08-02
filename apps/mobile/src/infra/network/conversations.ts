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
