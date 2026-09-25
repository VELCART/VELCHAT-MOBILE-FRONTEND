/**
 * Encrypted MMKV key-value store (§M10, §M1). Fast, synchronous, encrypted.
 * The ONLY sanctioned small-KV store — AsyncStorage is lint-banned.
 *
 * The encryption key comes from the OS keystore, not from this file (VC-016). It used to be a
 * constant right here, which meant it shipped inside every APK: unzip, read the bundle, and you
 * hold the key to the auth tokens and to the Ed25519 device private key kept below under
 * `devicePrivKey`. That one cannot be re-derived, so its disclosure is not something signing out
 * can undo.
 *
 * Built at module scope, so it exists before anything can read a token from it — which is why
 * the keystore calls are synchronous.
 */
import { MMKV, useMMKVString } from 'react-native-mmkv';
import {
  commitSecureStoreKey,
  secureStoreKey,
  secureStoreKeyCommitted,
} from '../native/secureStore';
import { LEGACY_ENCRYPTION_KEY, resolveStoreKey } from './storeKey';

/**
 * Open the store, re-encrypting it on the way if this install is still on the legacy key.
 *
 * LEGACY KEY FIRST, ALWAYS, and then `recrypt` in place — because the store can only ever be
 * opened ONCE per process. MMKV caches native instances by mmapID and returns the cached one on
 * a second `new MMKV({id})`, DROPPING the crypt key it was handed
 * (`MMKV/Core/MMKV_Android.cpp` — the `g_instanceDic` hit returns before `checkReSetCryptKey`).
 * So "open with the keystore key, and if it reads nothing fall back to the legacy one" cannot
 * work: the second construction is the same object with the same key, reads empty too, and the
 * code then concludes "fresh install" and commits the new key over a store it never actually
 * opened. That was written here as a safety improvement and was the opposite — it would have
 * destroyed `auth.devicePrivKey`, the one secret that cannot be re-derived. Do not reintroduce
 * a probe; there is nothing to probe with.
 *
 * The order below is therefore the only one available, and it is also the correct one: open
 * with the key the data was last written under, rewrite it in place, and only then let native
 * record the new key as committed — after `recrypt` returns, never when the key is generated,
 * so a process that dies mid-migration comes back uncommitted and simply tries again.
 *
 * The one case nothing can rescue is a keystore key lost AFTER the data was encrypted with it:
 * those bytes are unreadable by anyone. That costs a sign-in, which is what every
 * keystore-backed app does on a restore.
 */
function openStore(): MMKV {
  const plan = resolveStoreKey({
    nativeKey: secureStoreKey(),
    committed: secureStoreKeyCommitted(),
  });
  if (plan.kind === 'native') {
    return new MMKV({ id: 'velchat', encryptionKey: plan.key });
  }
  const store = new MMKV({
    id: 'velchat',
    encryptionKey: LEGACY_ENCRYPTION_KEY,
  });
  if (plan.kind === 'legacy') return store;
  try {
    store.recrypt(plan.key);
    commitSecureStoreKey();
  } catch {
    // Still on the legacy key, exactly where it already was — no worse than the build before
    // this one, and the migration runs again next launch. Deliberately silent: anything logged
    // here would be one bit away from describing the key (§M19).
  }
  return store;
}

export const storage = openStore();

/** Stable, typed key names (avoid stringly-typed access across the app). */
export const KVKeys = {
  themeMode: 'settings.themeMode',
  language: 'settings.language',
  featureFlagsCache: 'config.featureFlags',
  // auth session — encrypted at rest under the keystore-backed key above (VC-016)
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  cnfJkt: 'auth.cnfJkt',
  deviceId: 'auth.deviceId',
  accountId: 'auth.accountId',
  tenantId: 'auth.tenantId',
  // Device identity keypair (§L14). The store's own key is now keystore-sealed (VC-016), so
  // this is no longer readable from an unpacked APK; moving the private key itself INTO the
  // keystore, so it can be used without ever being in JS memory, is the next step.
  devicePrivKey: 'auth.devicePrivKey',
  phone: 'auth.phone',
  // ISO timestamp of the last successful sign-in (shown on the Profile page)
  loginAt: 'auth.loginAt',
  // ISO timestamp of account creation (server truth) → "member since" on the Profile page
  memberSince: 'auth.memberSince',
  // profile onboarding — set once the directory profile has a display name
  profileComplete: 'user.profileComplete',
  // email captured during profile setup (server-side verify is a backend follow-up)
  email: 'user.email',
  // display name mirrored locally so Settings renders instantly (no network)
  displayName: 'user.displayName',
  // about/bio mirrored locally so the Profile page renders instantly (no network)
  about: 'user.about',
  // local uri of the picked avatar photo — shown instantly in header/settings
  avatarUri: 'user.avatarUri',
  // last-resolved signed URL of the server avatar — cached so it shows INSTANTLY (no
  // wait for the media round-trip) across launches, then refreshed in the background
  avatarUrl: 'user.avatarUrl',
  // one-time flag: legacy dev-seed rows have been purged from the local DB (set once)
  chatPurged: 'db.chatPurged.v1',
  // accountId this device last registered for contact discovery (opt-in OPRF token) — so we
  // register once per account, making it findable by contacts without opening New Chat
  discoverySelfRegistered: 'discovery.selfRegistered',
  // cached New-Chat contacts snapshot (JSON, per account) — so reopening the app shows the
  // list instantly instead of re-discovering every launch
  contactsSnapshot: 'contacts.snapshot.v1',
} as const;

export const kv = {
  getString(key: string): string | undefined {
    return storage.getString(key);
  },
  getBoolean(key: string): boolean | undefined {
    return storage.getBoolean(key);
  },
  getNumber(key: string): number | undefined {
    return storage.getNumber(key);
  },
  set(key: string, value: string | boolean | number): void {
    storage.set(key, value);
  },
  delete(key: string): void {
    storage.delete(key);
  },
  /**
   * Every key currently held. Needed by the purges that run on logout: entries written under a
   * DYNAMIC key (`rcpt.want.<conversationId>`, `avatar.<accountId>`, …) can't be deleted from a
   * fixed list, and leaving them behind leaks the previous account's state into the next sign-in.
   */
  getAllKeys(): string[] {
    return storage.getAllKeys();
  },
  clearAll(): void {
    storage.clearAll();
  },
};

/**
 * Reactive read of a string key — re-renders the component whenever that key changes
 * anywhere (via `kv.set`), on the SAME encrypted instance. This is what makes the
 * profile summary (avatar/name/about) update live across the header, Settings and the
 * Profile page the instant a photo is picked or a field saved — no manual refresh,
 * no network on the render path.
 */
export function useKVString(key: string): string | undefined {
  return useMMKVString(key, storage)[0];
}
