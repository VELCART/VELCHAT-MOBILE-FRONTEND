package com.velchat.securestore

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The bridge for {@link SecureKeyStore} (VC-016).
 *
 * Every method here is SYNCHRONOUS, and that is not a shortcut. The MMKV instance is constructed
 * at module scope in `infra/kv/mmkv.ts` — the store has to exist before anything can read a
 * token from it — so the key must be available before the first `await` javascript ever
 * reaches. A promise here would mean an unencrypted or legacy-encrypted window on every launch.
 *
 * The cost is three blocking calls on the JS thread at startup, each a SharedPreferences read
 * and one AES-GCM operation over 32 bytes. Measured against §R4's cold-start budget that is
 * noise; the keystore handle is the only part that can be slow, and it is created once per
 * install.
 */
class VelChatSecureStoreModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  /** The keystore-backed MMKV key, or "" when this device cannot give us one. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getMmkvKey(): String = SecureKeyStore.mmkvKey(reactContext)

  /** Whether the store is already encrypted with that key. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isMmkvKeyCommitted(): Boolean = SecureKeyStore.isCommitted(reactContext)

  /** Called only after `recrypt` has actually succeeded. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun commitMmkvKey() {
    SecureKeyStore.commit(reactContext)
  }

  companion object {
    const val NAME = "VelChatSecureStore"
  }
}
