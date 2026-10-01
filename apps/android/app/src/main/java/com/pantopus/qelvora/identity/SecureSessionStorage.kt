package com.pantopus.qelvora.identity

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** OS Keystore encryption; app backup is disabled. No private screen state is persisted here. */
class SecureSessionStorage(context: Context) {
    private companion object {
        val lock = Any()
        val blockedAliases = mutableSetOf<String>()
    }
    private val preferences = context.getSharedPreferences("identity-session", Context.MODE_PRIVATE)
    private val alias = context.packageName + ".identity-session"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun read(): String? = synchronized(lock) {
        if (alias in blockedAliases) return@synchronized null
        val value = preferences.getString("credential", null) ?: return@synchronized null
        try {
            val parts = value.split('.')
            require(parts.size == 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8).also { require(it.isNotEmpty()) }
        } catch (_: Exception) {
            // Key invalidation or corrupt ciphertext requires reauthorization.
            blockedAliases.add(alias)
            check(preferences.edit().remove("credential").commit())
            null
        }
    }
    fun save(token: String?) {
        synchronized(lock) {
            blockedAliases.add(alias)
            if (token == null) { check(preferences.edit().clear().commit()); return@synchronized }
            require(token.isNotEmpty())
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val body = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            check(preferences.edit().putString("credential", Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(body, Base64.NO_WRAP)).commit())
            blockedAliases.remove(alias)
        }
    }
}
