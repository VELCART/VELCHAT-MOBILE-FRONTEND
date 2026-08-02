/**
 * Conversation REST shapes + read normalisers (§L6, group-channel-service). Pure — no infra
 * imports — so the create-DM / details / members shapes are trivially unit-testable and this
 * is the single place the backend read shape is interpreted (same pattern as profileShape.ts
 * and chat.ts's `normalizeServerMessage`).
 *
 * The group-channel-service returns conversation READS as raw DB rows (snake_case:
 * `conversation_id`, `avatar_media_id`, `created_by`, …); the global response envelope does
 * NOT camelCase them. Normalise defensively so ids/names actually resolve instead of silently
 * being `undefined` on a casing drift.
 */

export type ConversationType = 'dm' | 'group' | 'channel';

/** `POST /conversations/dm` result. Idempotent — `conversationId` is deterministic
 * (`dm-<sha>`); `created:false` when the DM already existed. */
export interface CreateDmResult {
  conversationId: string;
  created: boolean;
}

/** `GET /conversations/:id` normalised to camelCase. */
export interface ConversationDetails {
  conversationId: string;
  type: ConversationType;
  name?: string;
  avatarMediaId?: string;
  createdBy?: string;
  tenantId?: string;
}

function rec(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function pickStr(
  d: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickBool(
  d: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
}

/** Coerce a raw `type` field to a known ConversationType; unknown/missing → `dm`. */
function normalizeType(raw: unknown): ConversationType {
  return raw === 'group' || raw === 'channel' ? raw : 'dm';
}

/** Normalise a `POST /conversations/dm` response. Missing id → '' (never a silent undefined). */
export function normalizeCreateDm(raw: unknown): CreateDmResult {
  const d = rec(raw);
  const conversationId =
    pickStr(d, 'conversationId', 'conversation_id', 'id') ?? '';
  const created = pickBool(d, 'created') ?? false;
  return { conversationId, created };
}

/** Normalise a `GET /conversations/:id` row to camelCase; only defined fields are set
 * (respects `exactOptionalPropertyTypes`). */
export function normalizeConversationDetails(
  raw: unknown,
): ConversationDetails {
  const d = rec(raw);
  const conversationId =
    pickStr(d, 'conversationId', 'conversation_id', 'id') ?? '';
  const type = normalizeType(d.type ?? d.conversation_type);
  const name = pickStr(d, 'name');
  const avatarMediaId = pickStr(d, 'avatarMediaId', 'avatar_media_id');
  const createdBy = pickStr(d, 'createdBy', 'created_by');
  const tenantId = pickStr(d, 'tenantId', 'tenant_id');
  return {
    conversationId,
    type,
    ...(name !== undefined ? { name } : {}),
    ...(avatarMediaId !== undefined ? { avatarMediaId } : {}),
    ...(createdBy !== undefined ? { createdBy } : {}),
    ...(tenantId !== undefined ? { tenantId } : {}),
  };
}

/**
 * Normalise `GET /conversations/:id/members` — the backend returns a bare `string[]` of
 * account_ids, but we read it defensively (also accepting `{account_id}`/`{user_id}` objects)
 * so a shape drift yields the ids we can, never a throw. Non-string/blank entries are dropped.
 */
export function normalizeMembers(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v === 'string') {
      if (v.length > 0) out.push(v);
      continue;
    }
    const id = pickStr(
      rec(v),
      'accountId',
      'account_id',
      'userId',
      'user_id',
      'id',
    );
    if (id !== undefined) out.push(id);
  }
  return out;
}
