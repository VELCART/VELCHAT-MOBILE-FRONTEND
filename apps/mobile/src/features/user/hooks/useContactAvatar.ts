/**
 * A VelChat user's profile photo (DP) for lists/headers — cached like WhatsApp: persisted to
 * MMKV per account, shown INSTANTLY on every render/restart with no network, and refreshed only
 * when the cached signed URL is about to expire (or the account's avatar actually changed).
 *
 * Why not cache forever: media URLs are short-lived signed links (~10 min), so we store the URL
 * + the avatar mediaId + a timestamp. Fresh URL → serve from cache (zero API). Stale → one
 * profile read (itself cached) + one URL resolve; if the mediaId is unchanged the image bytes
 * are still served from RN's own URL cache. "No avatar" is cached too, so we don't re-ask.
 *
 * Best-effort: never throws; on any failure the caller falls back to a coloured initial.
 */
import { useEffect, useState } from 'react';
import { kv } from '../../../infra';
import { getProfile, getMediaUrl } from '../api/userApi';

const URL_TTL_MS = 9 * 60_000; // refresh just before the ~10-min signed-URL expiry
const mem = new Map<string, string>(); // session fast-path (accountId → url)

interface Cached {
  mediaId: string | null;
  url: string | null;
  at: number;
}

function cacheKey(id: string): string {
  return `avatar.${id}`;
}

function read(id: string): Cached | null {
  try {
    const raw = kv.getString(cacheKey(id));
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function write(id: string, c: Cached): void {
  try {
    kv.set(cacheKey(id), JSON.stringify(c));
  } catch {
    // best-effort cache
  }
  if (c.url) mem.set(id, c.url);
}

export function useContactAvatar(
  accountId: string | undefined,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    accountId
      ? (mem.get(accountId) ?? read(accountId)?.url ?? undefined)
      : undefined,
  );

  useEffect(() => {
    if (!accountId) return undefined;
    let alive = true;
    const cached = read(accountId);
    const fresh = cached && Date.now() - cached.at < URL_TTL_MS;

    if (fresh) {
      // Fresh cache (either a live URL or a known "no avatar") — serve instantly, no network.
      setUrl(cached.url ?? undefined);
      return () => {
        alive = false;
      };
    }

    // Stale/missing → refresh: profile (cached upstream) → mediaId → signed URL. Only touches
    // the network when the cache is expired, so it's rare.
    void (async () => {
      try {
        const profile = await getProfile(accountId);
        const mediaId = profile.avatarMediaId ?? null;
        if (!mediaId) {
          write(accountId, { mediaId: null, url: null, at: Date.now() });
          if (alive) setUrl(undefined);
          return;
        }
        const { url: resolved } = await getMediaUrl(mediaId);
        write(accountId, { mediaId, url: resolved, at: Date.now() });
        if (alive) setUrl(resolved);
      } catch {
        // keep showing whatever we already have (cached url, or the initial)
      }
    })();
    return () => {
      alive = false;
    };
  }, [accountId]);

  return url;
}
