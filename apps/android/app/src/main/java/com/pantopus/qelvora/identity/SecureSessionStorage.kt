package com.pantopus.qelvora.identity

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.MessageDigest
import java.net.URI
import java.util.Locale
import com.pantopus.qelvora.BuildConfig
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** OS Keystore encryption; app backup is disabled. No private screen state is persisted here. */
class SecureSessionStorage(context: Context, issuer: String?) {
    private companion object {
        val lock = Any()
        val blockedAliases = mutableSetOf<String>()
        val clearedLegacyPackages = mutableSetOf<String>()
        fun origin(value: String?): String? = runCatching {
            val uri = URI(value ?: return null)
            val scheme = uri.scheme?.lowercase(Locale.ROOT)
            val host = uri.host?.lowercase(Locale.ROOT)
            require(!host.isNullOrEmpty() && uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.rawPath in listOf("", "/") && (uri.port == -1 || uri.port in 1..65535))
            require(scheme == "https" || (BuildConfig.DEBUG && scheme == "http" && host in listOf("localhost", "127.0.0.1", "10.0.2.2")))
            val port = if (uri.port == (if (scheme == "https") 443 else 80)) -1 else uri.port
            URI(scheme, null, host, port, null, null, null).toString()
        }.getOrNull()
    }
    private val issuerOrigin = origin(issuer)
    private val scope = issuerOrigin?.let { MessageDigest.getInstance("SHA-256").digest(it.toByteArray(Charsets.UTF_8)).joinToString("") { byte -> "%02x".format(byte.toInt() and 255) } } ?: "unconfigured"
    private val preferences = context.getSharedPreferences("identity-session-$scope", Context.MODE_PRIVATE)
    private val legacyPreferences = context.getSharedPreferences("identity-session", Context.MODE_PRIVATE)
    private val legacyAlias = context.packageName + ".identity-session"
    private val alias = "$legacyAlias.$scope"
    private fun clearLegacy() {
        if (legacyAlias in clearedLegacyPackages) return
        // The previous credential had no issuer binding and cannot be safely migrated.
        check(legacyPreferences.edit().clear().commit())
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); if (containsAlias(legacyAlias)) deleteEntry(legacyAlias) }
        clearedLegacyPackages.add(legacyAlias)
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun read(): String? = synchronized(lock) {
        if (issuerOrigin == null) return@synchronized null
        clearLegacy()
        if (alias in blockedAliases) return@synchronized null
        val value = preferences.getString("credential", null) ?: return@synchronized null
        try {
            val parts = value.split('.')
            require(parts.size == 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            cipher.updateAAD(issuerOrigin.toByteArray(Charsets.UTF_8))
            String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8).also { require(it.isNotEmpty()) }
        } catch (_: Exception) {
            // Key invalidation or corrupt ciphertext requires reauthorization.
            blockedAliases.add(alias)
            check(preferences.edit().remove("credential").commit())
            null
        }
    }
    fun save(token: String?, replacing: String? = null) {
        synchronized(lock) {
            require(issuerOrigin != null || token == null)
            clearLegacy()
            if (replacing != null) check(read() == replacing)
            blockedAliases.add(alias)
            if (token == null) { check(preferences.edit().clear().commit()); return@synchronized }
            require(token.isNotEmpty())
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            cipher.updateAAD(requireNotNull(issuerOrigin).toByteArray(Charsets.UTF_8))
            val body = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            check(preferences.edit().putString("credential", Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(body, Base64.NO_WRAP)).commit())
            blockedAliases.remove(alias)
        }
    }
}
