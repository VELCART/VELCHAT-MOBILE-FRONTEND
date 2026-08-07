/**
 * Resolve a VelChat user's profile photo (DP) for display in lists — the New-Chat picker shows
 * an on-VelChat contact with THEIR avatar (like WhatsApp), falling back to a coloured initial.
 *
 * Fetch is best-effort + cached per account for the session: profile → avatarMediaId → a
 * short-lived signed URL (§B11). A negative cache avoids re-hitting the network for users with
 * no photo. Signed URLs expire (~10 min) so we cache only in-memory (not MMKV) — a new session
 * re-resolves. Never throws; on any failure the caller just shows the initial.
 */
import { useEffect, useState } from 'react';
import { getProfile, getMediaUrl } from '../api/userApi';

const urlCache = new Map<string, string>();
const noAvatar = new Set<string>();

export function useContactAvatar(
  accountId: string | undefined,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    accountId ? urlCache.get(accountId) : undefined,
  );

  useEffect(() => {
    if (!accountId) return undefined;
    const cached = urlCache.get(accountId);
    if (cached) {
      setUrl(cached);
      return undefined;
    }
    if (noAvatar.has(accountId)) return undefined;

    let alive = true;
    void (async () => {
      try {
        const profile = await getProfile(accountId);
        if (!profile.avatarMediaId) {
          noAvatar.add(accountId);
          return;
        }
        const { url: resolved } = await getMediaUrl(profile.avatarMediaId);
        urlCache.set(accountId, resolved);
        if (alive) setUrl(resolved);
      } catch {
        // best-effort: fall back to the coloured initial.
      }
    })();
    return () => {
      alive = false;
    };
  }, [accountId]);

  return url;
}
