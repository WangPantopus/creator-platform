package com.pantopus.qelvora.conversation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Device Keystore encryption, bounded scoped replay metadata only. No messages,
 * input or credentials are persisted. App backup is disabled by the W1 host. */
class ConversationResumeStorage(context: Context) {
    data class Cursor(val cursor: Long, val epoch: Long)
    private val preferences = context.getSharedPreferences("conversation-resume", Context.MODE_PRIVATE)
    private val alias = context.packageName + ".conversation-resume"
    private companion object { val lock = Any() }
    private fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun read(): JsonObject? = runCatching {
        val parts = preferences.getString("state", null)?.split('.') ?: return null
        require(parts.size == 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))) }
        val bytes = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)); require(bytes.size <= 32768)
        Json.parseToJsonElement(bytes.toString(Charsets.UTF_8)).jsonObject
    }.getOrElse { preferences.edit().clear().commit(); null }
    private fun write(state: JsonObject) {
        val bytes = state.toString().toByteArray(); require(bytes.size <= 32768)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val value = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(bytes), Base64.NO_WRAP)
        check(preferences.edit().putString("state", value).commit())
    }
    private fun state(accountId: String) = read()?.takeIf { it["account"]?.jsonPrimitive?.content == digest(accountId) }
    suspend fun activate(accountId: String) = withContext(Dispatchers.IO) { synchronized(lock) {
        if (state(accountId) == null) write(buildJsonObject { put("account", digest(accountId)); put("entries", buildJsonObject {}) })
    } }
    suspend fun cursor(accountId: String, scope: String): Cursor? = withContext(Dispatchers.IO) { synchronized(lock) {
        val entry = state(accountId)?.get("entries")?.jsonObject?.get(digest(scope))?.jsonObject
        val cursor = entry?.get("cursor")?.jsonPrimitive?.longOrNull; val epoch = entry?.get("epoch")?.jsonPrimitive?.longOrNull
        if (cursor != null && epoch != null && cursor >= 0 && epoch >= 0) Cursor(cursor, epoch) else null
    } }
    suspend fun save(accountId: String, scope: String, cursor: Long, epoch: Long) = withContext(Dispatchers.IO) { synchronized(lock) {
        val state = state(accountId) ?: return@synchronized
        val entries = state["entries"]!!.jsonObject.toMutableMap(); val key = digest(scope)
        if (cursor < 0 || epoch < 0 || (entries[key]?.jsonObject?.get("cursor")?.jsonPrimitive?.longOrNull ?: 0) > cursor) return@synchronized
        if (entries[key] == null && entries.size >= 64) entries.clear()
        entries[key] = buildJsonObject { put("cursor", cursor); put("epoch", epoch) }
        write(buildJsonObject { put("account", digest(accountId)); put("entries", JsonObject(entries)) })
    } }
    suspend fun remove(accountId: String, scope: String) = withContext(Dispatchers.IO) { synchronized(lock) {
        val state = state(accountId) ?: return@synchronized
        val entries = state["entries"]!!.jsonObject.toMutableMap(); entries.remove(digest(scope))
        write(buildJsonObject { put("account", digest(accountId)); put("entries", JsonObject(entries)) })
    } }
    suspend fun purge() = withContext(Dispatchers.IO) { synchronized(lock) { check(preferences.edit().clear().commit()) } }
}
