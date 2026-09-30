package com.pantopus.qelvora.media

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

data class NativeMediaAsset(val id: String, val state: String, val version: Int, val bytes: Long, val uploadedBytes: Long, val sha256: String, val mimeType: String, val failureCode: String?)
data class NativeUploadTicket(val asset: NativeMediaAsset, val url: URL, val chunkBytes: Int)

/** Authentication comes from W1's secure session store, never a media-issued local identity. */
class NativeMediaClient(private val base: URL, private val token: suspend () -> String) {
    init { require(base.protocol == "https" || (base.protocol == "http" && base.host in listOf("localhost", "127.0.0.1", "10.0.2.2"))); require(base.userInfo == null) }
    private fun asset(value: JSONObject) = NativeMediaAsset(value.getString("id"), value.getString("state"), value.getInt("version"), value.getLong("bytes"), value.getLong("uploadedBytes"), value.getString("sha256"), value.getString("mimeType"), if (value.isNull("failureCode")) null else value.getString("failureCode"))
    private fun ticket(bytes: ByteArray): NativeUploadTicket { val value = JSONObject(bytes.toString(Charsets.UTF_8)); return NativeUploadTicket(asset(value.getJSONObject("asset")), URL(value.getString("url")), value.getInt("chunkBytes").also { require(it in 1..1_048_576) }) }
    suspend fun request(path: String, method: String = "GET", bytes: ByteArray? = null, contentType: String = "application/json", offset: Long? = null): ByteArray = withContext(Dispatchers.IO) {
        require(path.startsWith("/v1/w6/") && !path.contains(".."))
        val url = URI(base.toString()).resolve(path).toURL()
        require(url.host == base.host && url.protocol == base.protocol && url.port == base.port)
        val connection = url.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false; connection.requestMethod = method; connection.connectTimeout = 15_000; connection.readTimeout = 15_000
        connection.setRequestProperty("Authorization", "Bearer ${token()}"); connection.setRequestProperty("Content-Type", contentType)
        offset?.let { connection.setRequestProperty("Upload-Offset", it.toString()) }
        try {
            bytes?.let { connection.doOutput = true; connection.setFixedLengthStreamingMode(it.size); connection.outputStream.use { stream -> stream.write(it) } }
            check(connection.responseCode in 200..299) { "Media access expired or is unavailable." }
            connection.inputStream.use { it.readBytes() }
        } finally { connection.disconnect() }
    }
    suspend fun upload(file: File, path: String, uploadedBytes: Long, progress: suspend (Double) -> Unit) = withContext(Dispatchers.IO) {
        RandomAccessFile(file, "r").use { handle ->
            var offset = uploadedBytes; handle.seek(offset)
            while (offset < handle.length()) {
                coroutineContext.ensureActive()
                val data = ByteArray(minOf(1_048_576L, handle.length() - offset).toInt()); handle.readFully(data)
                request(path, "PUT", data, "application/octet-stream", offset)
                offset += data.size; progress(offset.toDouble() / handle.length())
            }
        }
    }
    suspend fun uploadRecording(file: File, creatorId: UUID, fanId: UUID, purpose: String, durationMs: Long, resume: NativeUploadTicket? = null, ticketChanged: suspend (NativeUploadTicket) -> Unit, progress: suspend (Double) -> Unit): NativeMediaAsset = withContext(Dispatchers.IO) {
        require(purpose in listOf("human_note", "human_reply", "fan_attachment", "source_audio", "interview_audio"))
        val root = "/v1/w6/threads/$creatorId/$fanId/media"
        val size = file.length(); require(size in 1..268_435_456)
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val buffer = ByteArray(1_048_576); while (true) { coroutineContext.ensureActive(); val length = input.read(buffer); if (length < 0) break; digest.update(buffer, 0, length) } }
        val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        var current = if (resume != null) ticket(request("$root/${resume.asset.id}/resume", "POST", "{}".toByteArray())).also { require(it.asset.sha256 == hash && it.asset.bytes == size) }
        else ticket(request(root, "POST", JSONObject().put("purpose", purpose).put("mimeType", "audio/mp4").put("bytes", size).put("durationMs", durationMs).put("sha256", hash).put("idempotencyKey", UUID.randomUUID().toString()).toString().toByteArray()))
        ticketChanged(current)
        RandomAccessFile(file, "r").use { handle ->
            var offset = current.asset.uploadedBytes
            while (offset < size) {
                coroutineContext.ensureActive()
                current = ticket(request("$root/${current.asset.id}/resume", "POST", "{}".toByteArray())); offset = current.asset.uploadedBytes; require(offset in 0..size); ticketChanged(current)
                if (offset == size) break
                val url = current.url; require(url.protocol == base.protocol && url.host == base.host && url.port == base.port)
                handle.seek(offset); val bytes = ByteArray(minOf(current.chunkBytes.toLong(), size-offset).toInt()); handle.readFully(bytes)
                request(url.path + (url.query?.let { "?$it" } ?: ""), "PUT", bytes, "application/octet-stream", offset)
                offset += bytes.size; progress(offset.toDouble()/size)
            }
        }
        asset(JSONObject(request("$root/${current.asset.id}/finish", "POST", "{}".toByteArray()).toString(Charsets.UTF_8)))
    }
}
