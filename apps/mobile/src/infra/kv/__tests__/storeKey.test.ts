/**
 * Which key opens the encrypted store, and when it has to be re-encrypted (VC-016).
 *
 * The MMKV encryption key was a constant in the JS bundle: anyone who unpacks the APK reads it,
 * and with it every secret the app persists — the auth tokens and, worst of all, the Ed25519
 * DEVICE PRIVATE KEY that authenticates this install to the backend. The key now comes from the
 * OS keystore instead.
 *
 * The dangerous part is not generating a key, it is the upgrade. An install that already exists
 * has its store encrypted with the old constant, and if the app opens it with the new key it
 * reads nothing — which would sign the user out AND destroy the device key, the one secret that
 * cannot be re-derived. So the order matters: open with the legacy key, re-encrypt, and only
 * then treat the new key as the one that opens the store. This is that decision, pure, because
 * getting it wrong is unrecoverable and a keystore call cannot be unit-tested here.
 */
import { resolveStoreKey } from '../storeKey';

const NATIVE = 'a-32-byte-key-from-the-keystore';

describe('resolveStoreKey', () => {
  it('falls back to the legacy key when the platform has no keystore for us', () => {
    // iOS here (no native module on this build), or a device where the keystore threw. The app
    // must still open — a store it cannot read is indistinguishable from a wiped account.
    expect(resolveStoreKey({ nativeKey: undefined, committed: false })).toEqual(
      {
        kind: 'legacy',
      },
    );
    expect(resolveStoreKey({ nativeKey: '', committed: true })).toEqual({
      kind: 'legacy',
    });
  });

  it('migrates when a key exists but the store has not been re-encrypted yet', () => {
    expect(resolveStoreKey({ nativeKey: NATIVE, committed: false })).toEqual({
      kind: 'migrate',
      key: NATIVE,
    });
  });

  it('opens straight with the keystore key once the migration is committed', () => {
    expect(resolveStoreKey({ nativeKey: NATIVE, committed: true })).toEqual({
      kind: 'native',
      key: NATIVE,
    });
  });

  it('retries the migration after a crash between generating the key and using it', () => {
    // The commit is what native records AFTER javascript reports the re-encrypt succeeded. If
    // the process died in between, the store is still on the legacy key while a native key
    // exists — and opening with the native key would read an empty store. Uncommitted therefore
    // has to keep meaning "migrate", however many times it is retried.
    const first = resolveStoreKey({ nativeKey: NATIVE, committed: false });
    const second = resolveStoreKey({ nativeKey: NATIVE, committed: false });
    expect(first).toEqual(second);
    expect(second.kind).toBe('migrate');
  });
});
