/**
 * A VelChat user's profile photo (DP) for lists/headers — cached like WhatsApp: persisted to
 * MMKV per account, shown INSTANTLY on every render/restart with no network, and refreshed only
 * when the cached signed URL is about to expire (or the avatar actually changed).
 *
 * RECYCLE-SAFE (critical for FlashList): the hook NEVER holds the resolved URL in state — it
 * derives it from the in-memory cache keyed by the CURRENT accountId on every render. So when a
 * row is recycled for a different contact, it can never flash the previous contact's photo. A
 * bump counter just forces a re-read after an async resolve.
 *
 * Why not cache the URL forever: media URLs are short-lived signed links (~10 min), so we store
 * url + mediaId + timestamp; fresh → serve from cache (zero API), stale → one (cached) profile
 * read + one URL resolve. "No avatar" is cached too, so we don't re-ask. Best-effort; on any
 * failure the caller falls back to a coloured initial.
 */
import { useEffect, useState } from 'react';
import { kv } from '../../../infra';
import { getProfile, getMediaUrl } from '../api/userApi';

const URL_TTL_MS = 9 * 60_000; // refresh just before the ~10-min signed-URL expiry
const mem = new Map<string, string>(); // accountId → live URL (the render source of truth)

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
  else mem.delete(id); // "no avatar" → never leave a stale URL in the render cache
}

export function useContactAvatar(
  accountId: string | undefined,
): string | undefined {
  const [, bump] = useState(0);
  const rerender = (): void => bump(n => (n + 1) % 1_000_000);

  useEffect(() => {
    if (!accountId) return undefined;
    let alive = true;
    const cached = read(accountId);
    const fresh = cached && Date.now() - cached.at < URL_TTL_MS;

    if (fresh) {
      // Seed the render cache from MMKV (or clear it for a known "no avatar"); no network.
      if (cached.url) mem.set(accountId, cached.url);
      else mem.delete(accountId);
      rerender();
      return () => {
        alive = false;
      };
    }

    // Stale/missing → refresh: profile (cached upstream) → mediaId → signed URL. Rare.
    void (async () => {
      try {
        const profile = await getProfile(accountId);
        const mediaId = profile.avatarMediaId ?? null;
        if (!mediaId) {
          write(accountId, { mediaId: null, url: null, at: Date.now() });
        } else {
          const { url } = await getMediaUrl(mediaId);
          write(accountId, { mediaId, url, at: Date.now() });
        }
        if (alive) rerender();
      } catch {
        // keep whatever we already have (cached url, or the initial)
      }
    })();
    return () => {
      alive = false;
    };
  }, [accountId]);

  // ALWAYS read for the CURRENT accountId — never stale state from a recycled row.
  return accountId ? mem.get(accountId) : undefined;
}
