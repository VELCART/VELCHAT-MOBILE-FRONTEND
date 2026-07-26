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

// ── Media (avatar) upload (§B11): init → single multipart PUT ──
export interface InitUploadResult {
  mediaId: string;
  uploadPath: string;
}

/** Reserve a media id + upload path for the owner's new blob. */
export async function initUpload(
  ownerId: string,
  mime: string,
): Promise<InitUploadResult> {
  const res = await api.post('/media/uploads', { ownerId, mime });
  return res.data as InitUploadResult;
}

/** PUT the picked image bytes (multipart) to the reserved path. */
export async function uploadMediaFile(
  uploadPath: string,
  file: { uri: string; name: string; type: string },
): Promise<void> {
  const form = new FormData();
  // RN FormData accepts a { uri, name, type } part — cast past the DOM Blob type.
  form.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  await api.put(uploadPath, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
