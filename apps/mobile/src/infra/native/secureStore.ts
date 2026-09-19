/**
 * The keystore that holds the encrypted KV store's key (§M23, VC-016).
 *
 * A thin typed wrapper over `VelChatSecureStore`, whose methods are all SYNCHRONOUS because the
 * MMKV instance is built at module scope — the key has to exist before javascript reaches its
 * first `await`, or there is a legacy-encrypted window on every launch.
 *
 * Every call is defensive. A missing module (iOS, where the native half is not written yet), an
 * older build, or a device whose keystore throws must all end in the same place: the app opens
 * on the legacy key rather than failing to open at all. A store the app cannot read looks to the
 * user exactly like a wiped account, and the device private key inside it cannot be re-derived.
 */
import { NativeModules } from 'react-native';

interface SecureStoreNativeModule {
  getMmkvKey(): string;
  isMmkvKeyCommitted(): boolean;
  commitMmkvKey(): void;
}

function nativeModule(): SecureStoreNativeModule | undefined {
  const mod = (NativeModules as Record<string, unknown>)['VelChatSecureStore'];
  return typeof mod === 'object' && mod !== null
    ? (mod as SecureStoreNativeModule)
    : undefined;
}

/** The keystore-backed key for the KV store, or `undefined` when this build has no keystore. */
export function secureStoreKey(): string | undefined {
  try {
    const key = nativeModule()?.getMmkvKey();
    // Native answers "" rather than throwing when the keystore is unusable — encrypting with an
    // empty key would be worse than staying on the legacy one.
    return key !== undefined && key !== '' ? key : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the store has already been re-encrypted with that key. */
export function secureStoreKeyCommitted(): boolean {
  try {
    return nativeModule()?.isMmkvKeyCommitted() ?? false;
  } catch {
    return false;
  }
}

/**
 * Record that the re-encrypt succeeded. Call this ONLY after it actually has: the flag is what
 * stops the next launch opening a legacy-encrypted store with the new key and finding nothing.
 */
export function commitSecureStoreKey(): void {
  try {
    nativeModule()?.commitMmkvKey();
  } catch {
    // Staying uncommitted is safe — the migration simply runs again next launch.
  }
}
