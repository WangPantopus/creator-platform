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
class NativeMediaRequestError(val status: Int) : Exception("Media access expired or is unavailable.")

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
            if (connection.responseCode !in 200..299) throw NativeMediaRequestError(connection.responseCode)
            connection.inputStream.use { it.readBytes() }
        } finally { connection.disconnect() }
    }
    suspend fun upload(file: File, path: String, uploadedBytes: Long, progress: suspend (Double) -> Unit) = withContext(Dispatchers.IO) {
        val size = file.length(); require(size in 1..268_435_456 && uploadedBytes in 0..size)
        RandomAccessFile(file, "r").use { handle ->
            var offset = uploadedBytes; handle.seek(offset)
            while (offset < size) {
                coroutineContext.ensureActive()
                val data = ByteArray(minOf(1_048_576L, size - offset).toInt()); handle.readFully(data)
                val acknowledged = asset(JSONObject(request(path, "PUT", data, "application/octet-stream", offset).toString(Charsets.UTF_8)))
                require(acknowledged.uploadedBytes == offset + data.size)
                offset = acknowledged.uploadedBytes; progress(offset.toDouble() / size)
            }
        }
    }
    suspend fun uploadRecording(file: File, creatorId: UUID, fanId: UUID, purpose: String, durationMs: Long, idempotencyKey: String, resume: NativeUploadTicket? = null, ticketChanged: suspend (NativeUploadTicket) -> Unit, progress: suspend (Double) -> Unit): NativeMediaAsset = withContext(Dispatchers.IO) {
        require(purpose in listOf("human_note", "human_reply", "fan_attachment", "source_audio", "interview_audio"))
        require(idempotencyKey.length in 8..128 && durationMs in 1..3_600_000)
        val root = "/v1/w6/threads/$creatorId/$fanId/media"
        val size = file.length(); require(size in 1..268_435_456)
        val digest = MessageDigest.getInstance("SHA-256"); var observed = 0L
        file.inputStream().use { input -> val buffer = ByteArray(1_048_576); while (true) { coroutineContext.ensureActive(); val length = input.read(buffer); if (length < 0) break; observed += length; require(observed <= 268_435_456); digest.update(buffer, 0, length) } }
        require(observed == size)
        val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
        var current = resume ?: ticket(request(root, "POST", JSONObject().put("purpose", purpose).put("mimeType", "audio/mp4").put("bytes", size).put("durationMs", durationMs).put("sha256", hash).put("idempotencyKey", idempotencyKey).toString().toByteArray()))
        require((current.asset.state != "uploading" || (current.asset.sha256 == hash && current.asset.bytes == size)) && current.asset.uploadedBytes in 0..size)
        ticketChanged(current)
        val saved = asset(JSONObject(request("$root/${current.asset.id}").toString(Charsets.UTF_8)))
        require(saved.id == current.asset.id)
        if (saved.state in listOf("quarantined", "processing", "ready", "rejected")) return@withContext saved
        require(saved.state == "uploading")
        RandomAccessFile(file, "r").use { handle ->
            var offset = current.asset.uploadedBytes
            while (offset < size) {
                coroutineContext.ensureActive()
                val assetId = current.asset.id
                current = ticket(request("$root/$assetId/resume", "POST", "{}".toByteArray())); offset = current.asset.uploadedBytes; require(current.asset.id == assetId && current.asset.sha256 == hash && current.asset.bytes == size && offset in 0..size && current.chunkBytes in 1..1_048_576); ticketChanged(current)
                if (offset == size) break
                val url = current.url; require(url.protocol == base.protocol && url.host == base.host && url.port == base.port && url.path == "$root/$assetId/upload" && url.ref == null)
                handle.seek(offset); val bytes = ByteArray(minOf(current.chunkBytes.toLong(), size-offset).toInt()); handle.readFully(bytes)
                val acknowledged = asset(JSONObject(request(url.path + (url.query?.let { "?$it" } ?: ""), "PUT", bytes, "application/octet-stream", offset).toString(Charsets.UTF_8)))
                require(acknowledged.id == current.asset.id && acknowledged.uploadedBytes == offset + bytes.size)
                offset = acknowledged.uploadedBytes; progress(offset.toDouble()/size)
            }
        }
        val finished = asset(JSONObject(request("$root/${current.asset.id}/finish", "POST", "{}".toByteArray()).toString(Charsets.UTF_8)))
        require(finished.id == current.asset.id && finished.state in listOf("quarantined", "processing", "ready", "rejected"))
        finished
    }
}
