package com.pantopus.qelvora.conversation

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Unsent input only, independently encrypted in the app's no-backup directory.
 * Never shares storage with credentials, replay cursors or offline pages. */
internal class ConversationDraftStorage(context: Context) {
    @Serializable data class Pending(val key: String, val text: String, val sequence: Long,
        val destination: String, val uncertain: Boolean = false, val rejected: Boolean = false)
    @Serializable data class Value(val text: String, val pending: Pending? = null)
    @Serializable data class Binding(val origin: String, val account: String, val root: String) {
        val creator: String get() = root.substringBefore('/')
    }
    data class Ticket(val binding: Binding, val key: String, val generation: Long, val epoch: Long, val id: UUID)
    data class Lease(val ticket: Ticket, val thread: String)
    data class Opened(val lease: Lease, val value: Value?)
    @Serializable private data class Record(val binding: Binding, val thread: String, val value: Value)
    private data class Owner(val binding: Binding, var epoch: Long = 0, var candidate: UUID? = null,
        var writer: UUID? = null, var thread: String? = null, var revision: Long = 0)
    private companion object {
        val lock = Any()
        var generation = 0L
        val owners = mutableMapOf<String, Owner>()
        var cachedKey: SecretKey? = null
        // Input commits finish when a composition disappears. Purge/lease
        // fences still reject stale writes; no background network work occurs.
        val writes = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
    private val directory = File(context.noBackupFilesDir, "conversation-drafts")
    private val alias = context.packageName + ".conversation-drafts"
    private fun file(name: String) = File(directory, "$name.enc")
    private fun key(create: Boolean): SecretKey? {
        cachedKey?.let { return it }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { cachedKey = it; return it }
        if (!create) return null
        val key = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
        cachedKey = key
        return key
    }
    private fun removeFile(name: String) {
        AtomicFile(file(name)).delete()
        check(listOf("", ".bak", ".new").none { File(file(name).path + it).exists() })
    }
    private fun read(name: String): Record? {
        val target = file(name)
        if (!target.exists()) return null
        val key = key(false) ?: run { removeFile(name); return null }
        val bytes = AtomicFile(target).readFully()
        if (bytes.size !in 28..65536) { removeFile(name); return null }
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
                updateAAD(name.toByteArray(Charsets.UTF_8))
            }
            val record = Json.decodeFromString<Record>(cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8))
            require(record.value.text.length <= 2000 && (record.value.pending?.text?.length ?: 0) <= 2000)
            record.value.pending?.let {
                require(UUID.fromString(it.key).toString() == it.key && it.sequence >= 0 && it.destination in listOf("messages", "fan-replies"))
            }
            record
        } catch (_: Exception) { removeFile(name); null }
    }
    suspend fun begin(origin: String, account: String, root: String): Ticket = withContext(Dispatchers.IO) { synchronized(lock) {
        val binding = Binding(origin, account, root)
        val name = MessageDigest.getInstance("SHA-256").digest("$origin\n$account\n$root".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val owner = owners.getOrPut(name) { Owner(binding) }
        val id = UUID.randomUUID(); owner.candidate = id
        Ticket(binding, name, generation, owner.epoch, id)
    } }
    private fun valid(ticket: Ticket) = ticket.generation == generation && owners[ticket.key]?.epoch == ticket.epoch && owners[ticket.key]?.candidate == ticket.id
    private fun owns(lease: Lease) = lease.ticket.generation == generation && owners[lease.ticket.key]?.epoch == lease.ticket.epoch && owners[lease.ticket.key]?.writer == lease.ticket.id && owners[lease.ticket.key]?.thread == lease.thread
    suspend fun current(lease: Lease): Boolean = withContext(Dispatchers.IO) { synchronized(lock) { owns(lease) } }
    /** A fresh authorized page must precede this call. Old reads cannot reopen a
     * purged scope or take ownership back from a newer screen. */
    suspend fun open(ticket: Ticket, thread: String): Opened? = withContext(Dispatchers.IO) { synchronized(lock) {
        if (!valid(ticket)) return@synchronized null
        val owner = owners.getValue(ticket.key)
        owner.writer = ticket.id; owner.thread = thread; owner.revision = 0
        val record = read(ticket.key)
        val value = if (record?.binding == ticket.binding && record.thread == thread) record.value
            else { removeFile(ticket.key); null }
        Opened(Lease(ticket, thread), value)
    } }
    /** Revisions order input tasks; leases fence replaced screens and purges. */
    fun enqueue(value: Value, lease: Lease, revision: Long) = writes.async { save(value, lease, revision) }
    suspend fun save(value: Value, lease: Lease, revision: Long): Boolean = withContext(Dispatchers.IO) { synchronized(lock) {
        if (!owns(lease)) return@synchronized false
        val owner = owners.getValue(lease.ticket.key)
        if (revision <= owner.revision) return@synchronized true
        require(value.text.length <= 2000 && (value.pending?.text?.length ?: 0) <= 2000)
        val name = lease.ticket.key
        if (value.text.isEmpty() && value.pending == null) removeFile(name)
        else {
            val bytes = Json.encodeToString(Record(lease.ticket.binding, lease.thread, value)).toByteArray(Charsets.UTF_8)
            require(bytes.size <= 65000)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
                init(Cipher.ENCRYPT_MODE, key(true)); updateAAD(name.toByteArray(Charsets.UTF_8))
            }
            check(cipher.iv.size == 12)
            val encrypted = cipher.iv + cipher.doFinal(bytes)
            check(directory.isDirectory || directory.mkdirs())
            val atomic = AtomicFile(file(name)); val stream = atomic.startWrite()
            try { stream.write(encrypted); atomic.finishWrite(stream) }
            catch (failure: Exception) { atomic.failWrite(stream); throw failure }
        }
        owner.revision = revision
        true
    } }
    private fun invalidate(name: String) {
        owners[name]?.let { it.epoch++; it.candidate = null; it.writer = null }
    }
    suspend fun discard(ticket: Ticket) = withContext(Dispatchers.IO) { synchronized(lock) {
        if (valid(ticket)) { invalidate(ticket.key); removeFile(ticket.key) }
    } }
    fun discardLater(ticket: Ticket) = writes.async { discard(ticket) }
    suspend fun purge(origin: String, account: String, creator: String? = null, thread: String? = null) = withContext(Dispatchers.IO) { synchronized(lock) {
        fun matches(binding: Binding, id: String?) = binding.origin == origin && binding.account == account &&
            (creator == null || binding.creator == creator) && (thread == null || id == null || id == thread)
        owners.toMap().forEach { (name, owner) -> if (matches(owner.binding, owner.thread)) invalidate(name) }
        directory.listFiles()?.filter { it.extension == "enc" }?.forEach { file ->
            val name = file.nameWithoutExtension
            read(name)?.let { if (matches(it.binding, it.thread)) { invalidate(name); removeFile(name) } }
        }
    } }
    suspend fun purge() = withContext(Dispatchers.IO) { synchronized(lock) {
        generation++; owners.clear(); cachedKey = null
        val removed = !directory.exists() || directory.deleteRecursively()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
        check(removed)
    } }
}
