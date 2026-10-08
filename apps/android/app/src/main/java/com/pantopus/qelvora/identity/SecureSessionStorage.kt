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
import com.pantopus.qelvora.generated.ApplicationDestination
import org.json.JSONObject
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** OS Keystore encryption; app backup is disabled. Saved navigation contains
 * only a bounded account-bound path, never query strings or feature payloads. */
class SecureSessionStorage(context: Context, issuer: String?) {
    private companion object {
        val lock = Any()
        val blockedAliases = mutableSetOf<String>()
        val clearedLegacyPackages = mutableSetOf<String>()
        val navigationOwners = mutableMapOf<String, Any>()
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
    private val navigationOwner = Any()
    private fun navigationAAD() = (requireNotNull(issuerOrigin) + "\nidentity-navigation-v1").toByteArray(Charsets.UTF_8)
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
            navigationOwners.remove(alias)
            check(preferences.edit().clear().commit())
            null
        }
    }
    fun save(token: String?, replacing: String? = null) {
        synchronized(lock) {
            require(issuerOrigin != null || token == null)
            clearLegacy()
            if (replacing != null) check(read() == replacing)
            blockedAliases.add(alias)
            if (token == null) { navigationOwners.remove(alias); check(preferences.edit().clear().commit()); return@synchronized }
            require(token.isNotEmpty())
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            cipher.updateAAD(requireNotNull(issuerOrigin).toByteArray(Charsets.UTF_8))
            val body = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            val edit = preferences.edit().putString("credential", Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(body, Base64.NO_WRAP))
            // A genuine guarded rotation keeps this account's route. A new
            // sign-in clears it atomically with credential replacement.
            if (replacing == null) { navigationOwners.remove(alias); edit.remove("navigation") }
            check(edit.commit())
            blockedAliases.remove(alias)
        }
    }

    fun readDestination(accountId: String, credential: String): String? = synchronized(lock) {
        require(UUID.fromString(accountId).toString() == accountId.lowercase(Locale.ROOT))
        check(read() == credential)
        navigationOwners[alias] = navigationOwner
        val encrypted = preferences.getString("navigation", null) ?: return@synchronized null
        try {
            require(encrypted.length <= 4096)
            val parts = encrypted.split('.'); require(parts.size == 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            cipher.updateAAD(navigationAAD())
            val saved = JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
            val path = saved.getString("path")
            require(saved.getInt("version") == 1 && path.toByteArray(Charsets.UTF_8).size <= 512 &&
                !path.contains('?') && ApplicationDestination.isPermitted(path))
            if (saved.getString("accountId") != accountId) {
                check(preferences.edit().remove("navigation").commit())
                return@synchronized null
            }
            path
        } catch (failure: Exception) {
            check(preferences.edit().remove("navigation").commit())
            throw failure
        }
    }

    fun saveDestination(destination: String, accountId: String, credential: String) = synchronized(lock) {
        // Recreated shells claim this lifetime when reading. A late result
        // from an old shell cannot overwrite its replacement's navigation.
        if (navigationOwners[alias] !== navigationOwner) return@synchronized
        check(read() == credential)
        require(UUID.fromString(accountId).toString() == accountId.lowercase(Locale.ROOT))
        require(ApplicationDestination.isPermitted(destination))
        val path = destination.substringBefore('?').takeIf {
            it.toByteArray(Charsets.UTF_8).size <= 512 && ApplicationDestination.isPermitted(it)
        } ?: "/home"
        val saved = JSONObject().put("version", 1).put("accountId", accountId).put("path", path)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        cipher.updateAAD(navigationAAD())
        val encrypted = cipher.doFinal(saved.toString().toByteArray(Charsets.UTF_8))
        check(preferences.edit().putString("navigation", Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit())
    }
}
