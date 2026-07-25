/**
 * Profile hooks. `useProfileGate` decides whether the first-run profile sheet must
 * open — a local flag short-circuits it after completion, otherwise it checks the
 * backend once (a fresh OTP account has no profile → 404 → needs setup). `useSaveProfile`
 * persists the directory profile. Both read the account id from infra (no cross-feature
 * import); it's already set by the time the app reaches home.
 */
import { useCallback, useEffect, useState } from 'react';
import { launchImageLibrary } from 'react-native-image-picker';
import { getAccountId, isAppError, kv, KVKeys } from '../../../infra';
import {
  getProfile,
  updateProfile,
  initUpload,
  uploadMediaFile,
  type Profile,
} from '../api/userApi';

// Re-exported so feature UI gets haptics through the feature layer (UI must not
// import infra directly — layer boundaries §M3).
export { hapticTick } from '../../../infra';

export function useProfileGate(): {
  needsSetup: boolean;
  markComplete: () => void;
} {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const accountId = getAccountId();
    if (!accountId) return undefined;
    if (kv.getBoolean(KVKeys.profileComplete) === true) return undefined;
    // An email already captured → the profile is set up; never prompt again.
    if (kv.getString(KVKeys.email)) {
      kv.set(KVKeys.profileComplete, true);
      return undefined;
    }

    let active = true;
    const check = async (): Promise<void> => {
      try {
        const profile = await getProfile(accountId);
        if (profile?.displayName && profile.displayName.trim() !== '') {
          kv.set(KVKeys.profileComplete, true); // already has a name → never ask again
        } else if (active) {
          setNeedsSetup(true);
        }
      } catch {
        // No profile yet (404) or a transient error → prompt to set it up.
        if (active) setNeedsSetup(true);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, []);

  const markComplete = useCallback(() => {
    kv.set(KVKeys.profileComplete, true);
    setNeedsSetup(false);
  }, []);

  return { needsSetup, markComplete };
}

export function useSaveProfile(): {
  save: (patch: Partial<Profile>, email?: string) => Promise<boolean>;
  saving: boolean;
  error: string | null;
} {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: Partial<Profile>, email?: string): Promise<boolean> => {
      const accountId = getAccountId();
      if (!accountId) {
        setError('You are not signed in.');
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await updateProfile(accountId, patch);
        // Email isn't a directory field — it's a verified identifier. Keep it locally
        // for now; server-side attach/verify (magic-link for an existing account) is a
        // backend follow-up.
        if (email) kv.set(KVKeys.email, email);
        return true;
      } catch (e) {
        setError(
          isAppError(e)
            ? e.message
            : 'Could not save your profile. Please try again.',
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, error };
}

/**
 * Pick an avatar from the gallery and upload it (init → multipart PUT). Exposes the
 * local uri for an instant optimistic preview + the reserved mediaId to attach to the
 * profile on save. Failures are surfaced but never block finishing the form (the
 * default placeholder simply stays).
 */
export function useAvatarUpload(): {
  pick: () => Promise<void>;
  localUri: string | null;
  mediaId: string | null;
  uploading: boolean;
  error: string | null;
} {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async (): Promise<void> => {
    const accountId = getAccountId();
    if (!accountId) return;
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.8,
    });
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) {
      if (result.errorCode) setError('Could not open the gallery.');
      return;
    }
    setLocalUri(asset.uri);
    setError(null);
    setUploading(true);
    try {
      const mime = asset.type ?? 'image/jpeg';
      const { mediaId: id, uploadPath } = await initUpload(accountId, mime);
      await uploadMediaFile(uploadPath, {
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: mime,
      });
      setMediaId(id);
    } catch (e) {
      setError(
        isAppError(e) ? e.message : 'Photo upload failed. You can try again.',
      );
      setMediaId(null);
    } finally {
      setUploading(false);
    }
  }, []);

  return { pick, localUri, mediaId, uploading, error };
}
