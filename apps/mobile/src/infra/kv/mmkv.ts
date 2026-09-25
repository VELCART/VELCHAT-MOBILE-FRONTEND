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
 * Which key opens it is decided by ASKING THE STORE, not by a flag, and that is the whole
 * lesson of the first version of this function. That one trusted a native "have I migrated yet"
 * flag, and the flag can disagree with reality: if the keystore entry is regenerated — an
 * emulator cold boot, a partial data reset, a restore — native reports "no key, never migrated",
 * javascript opens a store that IS encrypted with the old keystore key using the LEGACY key
 * instead, MMKV reports it as empty, and the app happily writes a fresh session over the top.
 * That signed a test device out and took its device key with it. A flag cannot be trusted
 * because it does not share fate with the data it describes.
 *
 * So: try the keystore key, and only if that store is EMPTY look at the legacy one. MMKV cannot
 * report a wrong key — it simply reads nothing — so "empty" is exactly the signal that this is
 * not the key the data was written with. Constructing an MMKV instance is cheap; being wrong
 * about which key to use is not.
 *
 * The one case nothing can rescue is a keystore key that is lost after the data was encrypted
 * with it: the bytes are unreadable by anyone, including us. That now costs a sign-in rather
 * than a silent overwrite, and it is the same thing every keystore-backed app does on a restore.
 */
function openStore(): MMKV {
  const nativeKey = secureStoreKey();
  const plan = resolveStoreKey({
    nativeKey,
    committed: secureStoreKeyCommitted(),
  });
  if (plan.kind === 'legacy') {
    return new MMKV({ id: 'velchat', encryptionKey: LEGACY_ENCRYPTION_KEY });
  }

  const sealed = new MMKV({ id: 'velchat', encryptionKey: plan.key });
  // Anything at all means this key reads the data, whatever a flag claims.
  if (sealed.getAllKeys().length > 0) {
    if (plan.kind === 'migrate') commitSecureStoreKey();
    return sealed;
  }

  const legacy = new MMKV({
    id: 'velchat',
    encryptionKey: LEGACY_ENCRYPTION_KEY,
  });
  if (legacy.getAllKeys().length === 0) {
    // Both empty: a fresh install. Start on the keystore key so it is never written in the clear.
    commitSecureStoreKey();
    return sealed;
  }
  try {
    legacy.recrypt(plan.key);
    commitSecureStoreKey();
  } catch {
    // Still on the legacy key, exactly where it already was — no worse than the build before
    // this one, and the migration runs again next launch. Deliberately silent: anything logged
    // here would be one bit away from describing the key (§M19).
  }
  return legacy;
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
