package com.pantopus.qelvora.conversation

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.pantopus.qelvora.generated.APIConversationConversationOfflineLease
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.time.Instant
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@Serializable data class ConversationOfflineSnapshot(val lease: APIConversationConversationOfflineLease, val page: ConversationPage)

/** A single device-encrypted read lease. Its clock and authority live only in
 * this process; a cold start purges the old ciphertext before any read. */
object ConversationOfflineStorage {
    private data class Binding(val origin: String, val account: String, val session: String, val root: String)
    private var binding: Binding? = null
    private var generation = 0L
    private var key: SecretKey? = null
    private var sessionBinding = ""
    private var savedWall = 0L
    private var savedTick = 0L
    private var remaining = 0L
    private var app: Context? = null
    private val json = Json { ignoreUnknownKeys = true }
    private val alias get() = requireNotNull(app).packageName + ".conversation-offline"
    private val file get() = File(requireNotNull(app).noBackupFilesDir, "conversation-offline.enc")
    private fun valid(): Boolean {
        val wall = System.currentTimeMillis() - savedWall
        val tick = SystemClock.elapsedRealtime() - savedTick
        return key != null && remaining > 0 && tick >= 0 && wall >= 0 && tick < remaining && kotlin.math.abs(wall - tick) < 50
    }
    private fun aad(): ByteArray = requireNotNull(binding).let { "${it.origin}\n${it.account}\n${it.root}\n$sessionBinding".toByteArray(Charsets.UTF_8) }
    @Synchronized fun activate(context: Context, origin: String, account: String, session: String, root: String): Long {
        app = context.applicationContext
        val next = Binding(origin, account, session, root)
        if (binding != next) { purge(); binding = next }
        return generation
    }
    @Synchronized fun current(expected: Long): Boolean = expected == generation && valid()
    @Synchronized fun purge(expected: Long) { if (expected == generation) purge() }
    @Synchronized fun purge(context: Context) { app = context.applicationContext; purge() }
    private fun purge() {
        generation++; binding = null; key = null; sessionBinding = ""; remaining = 0
        if (app != null) {
            runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias) }
            runCatching { file.delete() }
        }
    }
    @Synchronized fun save(data: ByteArray, expected: Long, started: Long): Boolean {
        if (expected != generation || binding == null || data.size > 163840) return false
        return try {
            val owner = requireNotNull(binding)
            val snapshot = json.decodeFromString<ConversationOfflineSnapshot>(data.toString(Charsets.UTF_8))
            val lease = snapshot.lease; val page = snapshot.page
            // JSON primitive encoding matches the server's sorted canonical keys.
            val fields = kotlinx.serialization.json.buildJsonObject {
                put("accountId", kotlinx.serialization.json.JsonPrimitive(owner.account))
                put("issuer", kotlinx.serialization.json.JsonPrimitive(lease.issuer))
                put("purpose", kotlinx.serialization.json.JsonPrimitive("conversation-offline-session-v1"))
                put("sessionId", kotlinx.serialization.json.JsonPrimitive(owner.session))
            }.toString().toByteArray(Charsets.UTF_8)
            val digest = MessageDigest.getInstance("SHA-256").digest(fields).joinToString("") { "%02x".format(it.toInt() and 255) }
            val issued = Instant.parse(lease.issuedAt).toEpochMilli()
            val expires = Instant.parse(lease.expiresAt).toEpochMilli()
            val lifetime = expires - issued
            val left = minOf(lifetime - (SystemClock.elapsedRealtime() - started), expires - System.currentTimeMillis()) - 100
            require(lease.accountId == owner.account && lease.sessionBinding == digest && "${lease.creatorId}/${lease.fanId}" == owner.root)
            require(lease.threadId == page.threadId && lease.revision == page.revision && lease.epoch == page.epoch && lease.cursor == page.cursor)
            require(!page.canSend && !page.offTheRecord && page.consentCurrent && lifetime in 1..5000 && left > 0)
            require(lease.messages.size == page.messages.size && lease.messages.zip(page.messages).all { (version, message) ->
                version.id == message.id && version.version == message.version && message.threadId == lease.threadId && !message.offTheRecord && message.recording == null
            })
            if (key == null) {
                val parameters = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                if (Build.VERSION.SDK_INT >= 28) parameters.setUnlockedDeviceRequired(true)
                key = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(parameters.build()) }.generateKey()
            }
            sessionBinding = digest; savedWall = System.currentTimeMillis(); savedTick = SystemClock.elapsedRealtime(); remaining = left
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key); updateAAD(aad()) }
            val encrypted = cipher.iv + cipher.doFinal(data)
            file.outputStream().use { it.write(encrypted); it.flush(); it.fd.sync() }
            valid()
        } catch (_: Exception) { purge(); false }
    }
    @Synchronized fun read(expected: Long): ConversationOfflineSnapshot? {
        if (expected != generation) return null
        if (!valid()) { purge(); return null }
        return try {
            val bytes = file.inputStream().use { input ->
                val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size()+count <= 164000); output.write(buffer,0,count) }
                output.toByteArray()
            }
            require(bytes.size in 28..164000)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0,12))); updateAAD(aad())
            }
            val data = cipher.doFinal(bytes.copyOfRange(12,bytes.size))
            require(valid())
            json.decodeFromString<ConversationOfflineSnapshot>(data.toString(Charsets.UTF_8))
        } catch (_: Exception) { purge(); null }
    }
}
