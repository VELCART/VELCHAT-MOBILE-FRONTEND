/**
 * Encrypted MMKV key-value store (§M10, §M1). Fast, synchronous, encrypted.
 * The ONLY sanctioned small-KV store — AsyncStorage is lint-banned.
 *
 * TODO(MP1): derive `encryptionKey` from a Keychain/Keystore secret
 * (react-native-keychain) instead of this build-time placeholder.
 */
import { MMKV } from 'react-native-mmkv';

const ENCRYPTION_KEY =
  'velchat-mp0-placeholder-key-derive-from-keychain-in-mp1';

export const storage = new MMKV({
  id: 'velchat',
  encryptionKey: ENCRYPTION_KEY,
});

/** Stable, typed key names (avoid stringly-typed access across the app). */
export const KVKeys = {
  themeMode: 'settings.themeMode',
  language: 'settings.language',
  featureFlagsCache: 'config.featureFlags',
  // auth session (MP1 replaces the MMKV encryption key with a Keychain-derived one)
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
  cnfJkt: 'auth.cnfJkt',
  deviceId: 'auth.deviceId',
  accountId: 'auth.accountId',
  tenantId: 'auth.tenantId',
  // device identity keypair (§L14; harden to hardware-backed StrongBox/Enclave later)
  devicePrivKey: 'auth.devicePrivKey',
  phone: 'auth.phone',
  // profile onboarding — set once the directory profile has a display name
  profileComplete: 'user.profileComplete',
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
  clearAll(): void {
    storage.clearAll();
  },
};
