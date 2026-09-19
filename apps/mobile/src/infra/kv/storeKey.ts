/**
 * Which key opens the encrypted KV store, and whether it still has to be re-encrypted (VC-016).
 *
 * Pure on purpose. The keystore call underneath cannot be unit-tested on this machine, and the
 * consequence of getting this wrong is not a bad render — it is opening an existing store with
 * the wrong key, which reads as an empty store and destroys the Ed25519 device private key kept
 * inside it. That key cannot be re-derived; the account would have to be re-provisioned. So the
 * decision lives here, where it is covered.
 */

/**
 * The key the JS bundle shipped with before there was a keystore. It is public by definition —
 * it was compiled into every APK — so it protects nothing and is kept for exactly one reason:
 * an install that upgraded still has its store encrypted with it, and that store has to be
 * opened before it can be re-encrypted.
 */
export const LEGACY_ENCRYPTION_KEY =
  'velchat-mp0-placeholder-key-derive-from-keychain-in-mp1';

export type StoreKeyPlan =
  /** No keystore key available — open with the legacy key and stay there. */
  | { readonly kind: 'legacy' }
  /** A keystore key exists, but the store is still encrypted with the legacy one. */
  | { readonly kind: 'migrate'; readonly key: string }
  /** The store is already encrypted with the keystore key. */
  | { readonly kind: 'native'; readonly key: string };

export function resolveStoreKey(input: {
  /** The keystore-backed key, or undefined when the platform could not give us one. */
  readonly nativeKey: string | undefined;
  /**
   * Whether native has recorded that the re-encrypt SUCCEEDED. It is recorded after the fact,
   * not when the key is generated, so a process that dies mid-migration comes back as
   * uncommitted and tries again — opening with the new key at that point would find nothing.
   */
  readonly committed: boolean;
}): StoreKeyPlan {
  const key = input.nativeKey;
  // An empty string is what a native call returns when the keystore is unavailable or threw.
  // Treating it as a key would encrypt the store with nothing.
  if (key === undefined || key === '') return { kind: 'legacy' };
  return input.committed ? { kind: 'native', key } : { kind: 'migrate', key };
}
