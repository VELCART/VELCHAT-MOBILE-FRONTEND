/**
 * User directory API (§B3, backend user-service /users). Thin typed wrappers over
 * the shared axios client — the response envelope is unwrapped by the interceptor.
 */
import { api } from '../../../infra';

/** Directory profile (matches user-service UpdateProfileDto). Email is NOT here — it
 * is a separately-verified identifier (auth-service), added via the magic-link flow. */
export interface Profile {
  displayName?: string;
  about?: string;
  avatarMediaId?: string;
  presencePrivacy?: 'everyone' | 'contacts' | 'nobody';
  lastseenPrivacy?: 'everyone' | 'contacts' | 'nobody';
  readreceiptsEnabled?: boolean;
}

export async function getProfile(userId: string): Promise<Profile> {
  const res = await api.get(`/users/${userId}/profile`);
  return res.data as Profile;
}

export async function updateProfile(
  userId: string,
  patch: Partial<Profile>,
): Promise<Profile> {
  const res = await api.put(`/users/${userId}/profile`, patch);
  return res.data as Profile;
}
