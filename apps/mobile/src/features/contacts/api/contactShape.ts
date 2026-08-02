/**
 * Contact directory shape + read normaliser (§B3, user-service `/users/:id/contacts`). Pure —
 * no infra imports — so it is trivially unit-testable and the single place the backend read
 * shape is interpreted (same pattern as profileShape.ts).
 *
 * The user-service returns contacts as raw rows (`contact_user_id`, `display_name`, `blocked`);
 * the response envelope does NOT camelCase them. Normalise defensively so the peer id + name
 * actually resolve instead of silently being `undefined`. Rows without a usable id are dropped.
 */

export interface Contact {
  contactUserId: string;
  displayName: string | null;
  blocked: boolean;
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
  }
  return undefined;
}

function pickBool(d: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = d[k];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return false;
}

/** Map one raw contact row to a `Contact`; returns null when it lacks a usable peer id. */
export function normalizeContact(raw: unknown): Contact | null {
  const d = rec(raw);
  const contactUserId = pickStr(
    d,
    'contactUserId',
    'contact_user_id',
    'userId',
    'user_id',
    'accountId',
    'account_id',
    'id',
  );
  if (contactUserId === undefined) return null;
  const displayName = pickStr(d, 'displayName', 'display_name') ?? null;
  const blocked = pickBool(d, 'blocked', 'is_blocked', 'isBlocked');
  return { contactUserId, displayName, blocked };
}

/** Normalise a `GET /users/:id/contacts` array; non-array / unusable rows are dropped. */
export function normalizeContacts(raw: unknown): Contact[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Contact[] = [];
  for (const r of arr) {
    const c = normalizeContact(r);
    if (c) out.push(c);
  }
  return out;
}
