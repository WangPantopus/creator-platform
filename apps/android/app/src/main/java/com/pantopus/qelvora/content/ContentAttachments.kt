package com.pantopus.qelvora.content

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.os.SystemClock
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.identity.SecureSessionStorage
import com.pantopus.qelvora.ui.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.*
import org.json.JSONObject

internal data class ContentAttachmentValue(val kind: String, val id: String, val version: Int, val sha256: String, val alt: String?)
private fun JSONObject.actualLong(name: String): Long {
    val value = get(name) as? Number ?: error("Expected an actual number.")
    val result = value.toLong()
    check(value.toDouble().isFinite() && value.toDouble() == result.toDouble())
    return result
}
private fun JSONObject.actualInt(name: String): Int = actualLong(name).also { check(it in 0L..Int.MAX_VALUE.toLong()) }.toInt()
private fun JSONObject.duration(name: String): Long? { check(has(name)); return if (isNull(name)) null else actualLong(name) }
private data class PlaybackFile(val variant: String, val sha256: String, val bytes: Int) {
    fun matches(asset: AudienceAsset): Boolean = variant == "credentialed" && bytes in 1..268_435_456 &&
        sha256.matches(Regex("^[a-f0-9]{64}$")) && asset.provenance?.file == this
    companion object {
        fun read(value: JSONObject): PlaybackFile = PlaybackFile(value.getString("variant"), value.getString("sha256"), value.actualInt("bytes"))
    }
}
private data class AudienceProvenance(val verified: Boolean, val assetId: String, val version: Int, val creatorId: String, val objectId: String, val accountId: String, val signedActId: String, val sha256: String, val bytes: Int, val mimeType: String, val durationMs: Long?, val file: PlaybackFile) {
    companion object {
        fun read(value: JSONObject): AudienceProvenance = AudienceProvenance(value.opt("c2paVerified") == true, value.getString("assetId"), value.actualInt("assetVersion"), value.getString("creatorId"), value.getString("objectId"), value.getString("accountId"), value.getString("signedActId"), value.getString("processedMediaSha256"), value.actualInt("processedMediaBytes"), value.getString("processedMediaMimeType"), value.duration("processedMediaDurationMs"), PlaybackFile(value.getString("fileVariant"), value.getString("fileSha256"), value.actualInt("fileBytes")))
    }
}
private data class AudienceAsset(val id: String, val creatorId: String, val objectId: String, val ownerAccountId: String, val signedActId: String?, val purpose: String, val state: String, val version: Int, val sha256: String, val bytes: Int, val mimeType: String, val durationMs: Long?, val provenance: AudienceProvenance?) {
    companion object {
        fun read(value: JSONObject): AudienceAsset {
            val provenance = value.optJSONObject("provenance")
            return AudienceAsset(value.getString("id"), value.getString("creatorId"), value.getString("objectId"), value.getString("ownerAccountId"), value.opt("signedActId") as? String, value.getString("purpose"), value.getString("state"), value.actualInt("version"), value.getString("sha256"), value.actualInt("bytes"), value.getString("mimeType"), value.duration("durationMs"), provenance?.let { AudienceProvenance.read(it) })
        }
    }
}
private class ContentMediaTransport(context: Context, private val base: URL, private val accountId: String) {
    private val storage = SecureSessionStorage(context)
    init {
        require(base.protocol == "https" || (base.protocol == "http" && base.host in listOf("localhost", "127.0.0.1", "10.0.2.2")))
        require(base.userInfo == null && UUID.fromString(accountId).toString() == accountId)
    }
    suspend fun request(path: String, post: Boolean = false, range: IntRange? = null, total: Int? = null): ByteArray = withContext(Dispatchers.IO) {
        require(path.startsWith("/v1/w6/") && !path.contains(".."))
        val url = URI(base.toString()).resolve(path).toURL()
        require(url.protocol == base.protocol && url.host == base.host && url.port == base.port)
        val token = storage.read() ?: error("Your session ended.")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false; connection.useCaches = false
            connection.connectTimeout = 4000; connection.readTimeout = 4000
            connection.requestMethod = if (post) "POST" else "GET"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("x-qelvora-expected-account", accountId)
            connection.setRequestProperty("Content-Type", "application/json")
            range?.let { connection.setRequestProperty("Range", "bytes=${it.first}-${it.last}") }
            if (post) { connection.doOutput = true; connection.setFixedLengthStreamingMode(2); connection.outputStream.use { it.write("{}".toByteArray()) } }
            val status = connection.responseCode
            if (range != null && total != null) {
                check(status == 206 && connection.getHeaderField("Content-Range") == "bytes ${range.first}-${range.last}/$total")
            } else check(status == 200)
            val maximum = range?.let { it.last - it.first + 1 } ?: 1_048_576
            val data = ByteArrayOutputStream()
            connection.inputStream.use { stream ->
                val buffer = ByteArray(8192)
                while (true) {
                    coroutineContext.ensureActive()
                    val count = stream.read(buffer); if (count < 0) break
                    check(data.size() + count <= maximum); data.write(buffer, 0, count)
                }
            }
            data.toByteArray().also { if (range != null) check(it.size == maximum) }
        } finally { connection.disconnect() }
    }
    suspend fun download(context: Context, path: String, asset: AudienceAsset, proof: PlaybackFile): File {
        require(proof.matches(asset))
        val file = File.createTempFile("w5-content-", if (asset.mimeType == "image/png") ".png" else ".m4a", context.cacheDir)
        try {
            withContext(Dispatchers.IO) {
            val digest = MessageDigest.getInstance("SHA-256")
            file.outputStream().use { output ->
                var offset = 0
                while (offset < proof.bytes) {
                    coroutineContext.ensureActive()
                    val end = minOf(offset + 1_048_576, proof.bytes)
                    val bytes = request(path, range = offset until end, total = proof.bytes)
                    output.write(bytes); digest.update(bytes); offset = end
                }
            }
            val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
            check(hash == proof.sha256)
            }
            return file
        } catch (failure: Throwable) { file.delete(); throw failure }
    }
}

@Composable
internal fun NativeContentAttachment(context: Context, baseURL: String, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) {
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val transport = remember(baseURL, accountId) { runCatching { ContentMediaTransport(context, URL(baseURL), accountId) }.getOrNull() }
    val family = "/v1/w6/creators/$creatorId/audience-media/${attachment.id}"
    var asset by remember { mutableStateOf<AudienceAsset?>(null) }
    var playbackFile by remember { mutableStateOf<PlaybackFile?>(null) }
    var image by remember { mutableStateOf<Bitmap?>(null) }
    var file by remember { mutableStateOf<File?>(null) }
    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var error by remember { mutableStateOf("") }
    var available by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var playing by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }
    var checkedAt by remember { mutableLongStateOf(0L) }
    var generation by remember { mutableIntStateOf(0) }
    var active by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var loading by remember { mutableStateOf<Job?>(null) }
    fun clearBytes() {
        generation++; loading?.cancel(); loading = null
        player?.release(); player = null; playing = false; ready = false; busy = false
        playbackFile = null
        image = null; file?.delete(); file = null
    }
    fun matches(value: AudienceAsset): Boolean {
        val provenance = value.provenance ?: return false
        return value.id == attachment.id && value.creatorId == creatorId && value.objectId == objectId &&
        value.version == attachment.version && value.sha256 == attachment.sha256 && value.state == "ready" &&
        value.bytes in 1..268_435_456 && provenance.verified && provenance.sha256 == attachment.sha256 &&
        provenance.assetId == value.id && provenance.version == value.version && provenance.creatorId == value.creatorId && provenance.objectId == value.objectId &&
        provenance.accountId == value.ownerAccountId && value.signedActId != null && provenance.signedActId == value.signedActId &&
        runCatching { UUID.fromString(value.signedActId).toString() == value.signedActId }.getOrDefault(false) &&
        provenance.bytes == value.bytes && provenance.mimeType == value.mimeType && provenance.durationMs == value.durationMs && provenance.file.matches(value) &&
        (if (attachment.kind == "photo") value.purpose == "post_photo" && value.mimeType == "image/png" && !attachment.alt.isNullOrBlank()
        else attachment.kind == "voice" && value.mimeType == "audio/mp4" && (value.durationMs ?: 0) > 0 && value.purpose == (if (contentKind == "note") "human_note" else "post_audio"))
    }
    suspend fun checkAccess() {
        if (!active) return
        val epoch = generation; val started = SystemClock.elapsedRealtime()
        try {
            listOf(creatorId, objectId, attachment.id).forEach { require(UUID.fromString(it).toString() == it) }
            require(attachment.version > 0 && attachment.sha256.matches(Regex("^[a-f0-9]{64}$")))
            val api = transport ?: error("The media service is not connected.")
            check(JSONObject(api.request("/v1/w6/capabilities").toString(Charsets.UTF_8)).opt("creatorMediaAudienceAvailable") == true)
            val current = AudienceAsset.read(JSONObject(api.request(family).toString(Charsets.UTF_8)))
            check(matches(current))
            if (epoch != generation || !active) return
            if (playbackFile?.matches(current) == false) clearBytes()
            checkedAt = started; available = SystemClock.elapsedRealtime() - started < 5000; asset = current; error = ""
            if (!available) clearBytes()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (epoch != generation || !active) return
            available = false; asset = null; clearBytes()
            error = "Attachment access could not be confirmed. Check current access before retrying."
        }
    }
    fun load() {
        val current = asset ?: return
        if (!active || !available || busy || SystemClock.elapsedRealtime() - checkedAt >= 5000) return
        val epoch = generation; busy = true
        loading = scope.launch {
            try {
                val api = transport ?: error("The media service is not connected.")
                val ticket = JSONObject(api.request("$family/playback", post = true).toString(Charsets.UTF_8))
                val issued = AudienceAsset.read(ticket.getJSONObject("asset"))
                val proof = PlaybackFile.read(ticket.getJSONObject("playbackFile"))
                check(matches(issued) && issued.bytes == current.bytes && issued.mimeType == current.mimeType && issued.durationMs == current.durationMs)
                check(proof.matches(issued) && proof.matches(current))
                val url = URI(ticket.getString("url"))
                check(url.rawPath == "$family/play" && !url.rawQuery.isNullOrEmpty() && url.rawQuery.split('&').size == 1 && url.rawQuery.startsWith("ticket=") && url.rawQuery.length > 7)
                check(Instant.parse(ticket.getString("expiresAt")).isAfter(Instant.now()))
                val saved = api.download(context, url.rawPath + "?" + url.rawQuery, issued, proof)
                if (!active || epoch != generation || !available || SystemClock.elapsedRealtime() - checkedAt >= 5000) { saved.delete(); return@launch }
                file = saved; playbackFile = proof
                if (attachment.kind == "photo") {
                    val bitmap = withContext(Dispatchers.IO) {
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeFile(saved.path, bounds)
                        check(bounds.outWidth > 0 && bounds.outHeight > 0)
                        val metrics = context.resources.displayMetrics
                        val options = BitmapFactory.Options().apply { inSampleSize = 1 }
                        while (bounds.outWidth / options.inSampleSize > metrics.widthPixels || bounds.outHeight / options.inSampleSize > metrics.heightPixels) options.inSampleSize *= 2
                        BitmapFactory.decodeFile(saved.path, options) ?: error("The photo is unreadable.")
                    }
                    if (!active || epoch != generation || !available) return@launch
                    image = bitmap; ready = true; busy = false
                } else {
                    val playback = MediaPlayer()
                    player = playback
                    playback.setOnPreparedListener {
                        if (player === playback && epoch == generation) {
                            if (active && available && SystemClock.elapsedRealtime() - checkedAt < 5000) { ready = true; busy = false }
                            else clearBytes()
                        } else runCatching { playback.release() }
                    }
                    playback.setOnCompletionListener { if (player === playback && epoch == generation) playing = false }
                    playback.setOnErrorListener { _, _, _ ->
                        if (player === playback && epoch == generation) { clearBytes(); error = "The recording could not be played. Check current access before retrying." }
                        else runCatching { playback.release() }
                        true
                    }
                    playback.setDataSource(saved.path); playback.prepareAsync()
                }
                error = ""
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (epoch == generation && active) { clearBytes(); error = "The attachment could not be loaded. Check current access before retrying." }
            }
        }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ ->
            active = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!active) { available = false; asset = null; clearBytes() }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); active = false; available = false; clearBytes() }
    }
    LaunchedEffect(active, transport) { if (active) while (true) { checkAccess(); delay(2000) } }
    LaunchedEffect(Unit) { while (true) {
        if (SystemClock.elapsedRealtime() - checkedAt >= 5000) { available = false; asset = null; if (busy || file != null || player != null) clearBytes() }
        delay(500)
    } }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (error.isNotEmpty()) BasicText(error, style = qText("caption").copy(color = qColor("ink")))
        if (!available) BasicText("Checking current attachment access…", style = qText("caption").copy(color = qColor("ink")))
        else if (attachment.kind == "photo") {
            val photo = image
            if (photo != null) Image(photo.asImageBitmap(), attachment.alt, modifier = Modifier.fillMaxWidth())
            else Button(if (busy) "Loading photo…" else "Load photo", ButtonVariant.SECONDARY, disabled = busy) { load() }
        } else {
            BasicText("$creatorName’s recording", style = qText("label").copy(color = qColor("ink")))
            Button(if (busy) "Loading recording…" else if (!ready) "Load recording" else if (playing) "Pause recording" else "Play recording", ButtonVariant.SECONDARY, disabled = busy) {
                if (!available || !active || SystemClock.elapsedRealtime() - checkedAt >= 5000) clearBytes()
                else if (!ready) load()
                else player?.let { if (it.isPlaying) it.pause() else it.start(); playing = it.isPlaying }
            }
        }
    }
}
