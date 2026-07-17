/**
 * Loads remote config from the backend (§L15, backend /feature-flags/evaluate).
 * Non-blocking + offline-safe: any failure keeps the defaults. Never blocks the
 * render path (§M9). MMKV caching of the last-known-good is added with the MMKV slice.
 */
import { appEnv } from '../config/env';
import { log } from '../logger';
import {
  DEFAULT_FLAGS,
  DEFAULT_CONFIG,
  type FeatureFlags,
  type FeatureFlagKey,
  type RemoteConfigState,
} from './types';

export const CLIENT_VERSION = '0.0.1';

/** Compare dotted numeric versions; -1 if a<b, 0 if equal, 1 if a>b. */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export async function loadRemoteConfig(
  timeoutMs = 8000,
): Promise<RemoteConfigState> {
  const fallback: RemoteConfigState = {
    ...DEFAULT_CONFIG,
    flags: { ...DEFAULT_FLAGS },
    loaded: true,
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('feature-flags timeout')),
        timeoutMs,
      );
    });
    const res = await Promise.race([
      fetch(`${appEnv.apiBaseUrl}/feature-flags/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { platform: 'android', appVersion: CLIENT_VERSION },
        }),
      }),
      timeout,
    ]);
    if (!res.ok) return fallback;

    const json: unknown = await res.json();
    const data = (json as { data?: unknown })?.data ?? json;
    const rec = (data ?? {}) as Record<string, unknown>;

    const serverFlags = (rec.flags ?? {}) as Record<string, { on?: unknown }>;
    const flags = { ...DEFAULT_FLAGS } as FeatureFlags;
    (Object.keys(DEFAULT_FLAGS) as FeatureFlagKey[]).forEach(key => {
      const on = serverFlags[key]?.on;
      if (typeof on === 'boolean') flags[key] = on;
    });

    const minVer = (rec.minClientVersion ?? rec.min_client_version) as
      string | undefined;
    const needsUpgrade =
      typeof minVer === 'string'
        ? compareVersion(CLIENT_VERSION, minVer) < 0
        : false;

    return {
      flags,
      maintenance: Boolean(rec.maintenance),
      announcement:
        typeof rec.announcement === 'string' ? rec.announcement : null,
      needsUpgrade,
      loaded: true,
    };
  } catch (err) {
    log.warn('feature-flags fetch failed; using defaults', {
      reason: String(err),
    });
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
