/**
 * Contacts directory API (§B3, user-service `/users/:id/contacts`). Thin typed wrappers over
 * the shared axios client — the response envelope is unwrapped by the interceptor; the read
 * shape is normalised in `contactShape.ts` (pure, unit-tested).
 */
import { api } from '../../../infra';
import { normalizeContacts, type Contact } from './contactShape';

export { normalizeContacts };
export type { Contact };

/** List the user's contacts (§B3). Blocked flag is preserved; callers filter as needed. */
export async function getContacts(userId: string): Promise<Contact[]> {
  const res = await api.get(`/users/${encodeURIComponent(userId)}/contacts`);
  return normalizeContacts(res.data);
}
