package com.velchat.securestore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The encryption key for the app's MMKV store, kept where the APK cannot leak it (VC-016).
 *
 * The key used to be a constant in the JS bundle. Unzip the APK, read the bundle, and you hold
 * the key to every secret the app persists — the auth tokens, and the Ed25519 DEVICE PRIVATE KEY
 * that authenticates the install to the backend. That key cannot be re-derived, so it is the one
 * secret whose disclosure cannot be undone by signing out.
 *
 * What is stored here is NOT the MMKV key itself. A random 32-byte key is generated once and
 * sealed with an AES key that lives in the AndroidKeyStore and never leaves it — on most devices
 * in the TEE, and on a device with StrongBox in dedicated hardware. Only the sealed blob is
 * written to disk, so an attacker with the file has ciphertext and an attacker with the APK has
 * nothing at all. No user authentication is required to unseal it: the store has to be readable
 * for a push to be acknowledged while the screen is locked (§M13), and a key bound to the
 * lockscreen would also be invalidated the next time the user changes their PIN, taking the
 * device identity with it.
 *
 * NOTHING in this file may be logged. Not the key, not the sealed blob, not a fragment of
 * either (§M19) — only which step failed.
 */
internal object SecureKeyStore {

  private const val TAG = "VelChatSecureKey"
  private const val PREFS = "velchat.securestore"
  private const val KEY_SEALED = "mmkv.sealed.v1"
  private const val KEY_COMMITTED = "mmkv.committed.v1"

  /** Marks a value written by {@link sealText}; its absence means a legacy plaintext entry. */
  private const val SEALED_PREFIX = "v1:"

  private const val KEYSTORE = "AndroidKeyStore"
  private const val WRAP_ALIAS = "velchat.mmkv.wrap.v1"
  private const val TRANSFORM = "AES/GCM/NoPadding"
  private const val GCM_TAG_BITS = 128
  private const val IV_BYTES = 12
  /** 32 bytes: MMKV takes the key as a string, and this is what the sealed blob protects. */
  private const val KEY_BYTES = 32

  /**
   * The MMKV key for this install, generating and sealing one on first call.
   *
   * Returns an empty string if the keystore is unusable for any reason. That is a deliberate
   * signal rather than an exception: the JS side falls back to the legacy key and the app opens
   * normally. A store the app cannot open is indistinguishable to the user from a wiped account,
   * which is a far worse outcome than staying on the key the previous build already used.
   */
  fun mmkvKey(context: Context): String {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return try {
      val existing = prefs.getString(KEY_SEALED, null)
      if (existing != null) return unseal(existing)
      val fresh = ByteArray(KEY_BYTES).also { SecureRandom().nextBytes(it) }
      val sealed = seal(fresh)
      // The key is written BEFORE it is used, and `committed` stays false until javascript
      // reports the re-encrypt succeeded. A process that dies in between therefore comes back
      // with a key that exists but is not yet the one the store is encrypted with.
      prefs.edit().putString(KEY_SEALED, sealed).putBoolean(KEY_COMMITTED, false).apply()
      Base64.encodeToString(fresh, Base64.NO_WRAP)
    } catch (e: Throwable) {
      // The class name only. The message could carry a key alias or a provider detail, and this
      // path runs on every launch.
      Log.w(TAG, "keystore unavailable, falling back to the legacy key: ${e.javaClass.simpleName}")
      ""
    }
  }

  /** Whether the store is already encrypted with {@link mmkvKey}. */
  fun isCommitted(context: Context): Boolean =
      context.applicationContext
          .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .getBoolean(KEY_COMMITTED, false)

  /**
   * Record that the re-encrypt succeeded. Called by javascript AFTER `recrypt` returns, never
   * before — this flag is the only thing that stops the next launch opening a legacy-encrypted
   * store with the new key and finding it empty.
   */
  fun commit(context: Context) {
    context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putBoolean(KEY_COMMITTED, true)
        .apply()
  }

  // ── sealing arbitrary text ─────────────────────────────────────────────────

  /**
   * Seal a string for at-rest storage, or return null if the keystore cannot (VC-017).
   *
   * Used for the notification store's message bodies and the user's own typed replies, which
   * were sitting in SharedPreferences as readable JSON. The prefix is what makes the upgrade
   * free: a value without it is a legacy plaintext one, so nothing has to be migrated up front
   * — it is simply re-sealed the next time it is written.
   *
   * Null means "could not", never "empty". The caller stores the plaintext rather than losing
   * the data, which is exactly where it already was.
   */
  fun sealText(context: Context, plain: String): String? =
      try {
        require(context.applicationContext != null)
        SEALED_PREFIX + seal(plain.toByteArray(Charsets.UTF_8))
      } catch (e: Throwable) {
        Log.w(TAG, "seal failed, storing as-is: ${e.javaClass.simpleName}")
        null
      }

  /**
   * Unseal a value written by {@link sealText}. A value with no prefix is returned unchanged —
   * that is a legacy plaintext entry, and refusing to read it would lose a pending reply.
   */
  fun unsealText(context: Context, stored: String): String {
    if (!stored.startsWith(SEALED_PREFIX)) return stored
    return try {
      require(context.applicationContext != null)
      val raw = unsealBytes(stored.removePrefix(SEALED_PREFIX))
      String(raw, Charsets.UTF_8)
    } catch (e: Throwable) {
      // A key the device can no longer unwrap (app data restored onto another device, keystore
      // reset). The entry is unreadable rather than wrong, and every caller already treats a
      // corrupt entry as empty rather than wedging notifications forever.
      Log.w(TAG, "unseal failed, treating as empty: ${e.javaClass.simpleName}")
      ""
    }
  }

  // ── sealing ────────────────────────────────────────────────────────────────

  private fun seal(raw: ByteArray): String {
    val cipher = Cipher.getInstance(TRANSFORM)
    cipher.init(Cipher.ENCRYPT_MODE, wrapKey())
    val iv = cipher.iv
    val body = cipher.doFinal(raw)
    // IV first, fixed width, so unsealing needs no format beyond "the first 12 bytes".
    return Base64.encodeToString(iv + body, Base64.NO_WRAP)
  }

  private fun unseal(sealed: String): String =
      Base64.encodeToString(unsealBytes(sealed), Base64.NO_WRAP)

  private fun unsealBytes(sealed: String): ByteArray {
    val blob = Base64.decode(sealed, Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORM)
    cipher.init(
        Cipher.DECRYPT_MODE,
        wrapKey(),
        GCMParameterSpec(GCM_TAG_BITS, blob, 0, IV_BYTES),
    )
    return cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
  }

  /**
   * The AES key that seals the MMKV key. Created once and never exported — `getKey` hands back a
   * handle, and the bytes stay inside the keystore.
   */
  private fun wrapKey(): SecretKey {
    val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (store.getKey(WRAP_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
        KeyGenParameterSpec.Builder(
                WRAP_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            // Not bound to the lockscreen on purpose — see the class comment.
            .setUserAuthenticationRequired(false)
            .build())
    return generator.generateKey()
  }
}
