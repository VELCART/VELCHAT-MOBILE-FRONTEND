/**
 * Profile hooks. `useProfileGate` decides whether the first-run profile sheet must
 * open — a local flag short-circuits it after completion, otherwise it checks the
 * backend once (a fresh OTP account has no profile → 404 → needs setup). `useSaveProfile`
 * persists the directory profile. Both read the account id from infra (no cross-feature
 * import); it's already set by the time the app reaches home.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAccountId, isAppError, kv, KVKeys } from '../../../infra';
import { getProfile, updateProfile, type Profile } from '../api/userApi';

export function useProfileGate(): {
  needsSetup: boolean;
  markComplete: () => void;
} {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    const accountId = getAccountId();
    if (!accountId) return undefined;
    if (kv.getBoolean(KVKeys.profileComplete) === true) return undefined;

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
  save: (patch: Partial<Profile>) => Promise<boolean>;
  saving: boolean;
  error: string | null;
} {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (patch: Partial<Profile>): Promise<boolean> => {
      const accountId = getAccountId();
      if (!accountId) {
        setError('You are not signed in.');
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        await updateProfile(accountId, patch);
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
