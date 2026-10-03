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
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.ui.*
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
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
/** The original W1-issued client is retained for the whole download/playback lifetime. */
private class ContentMediaTransport(private val capture: FanSessionRequestCapture, private val creatorId: String, private val assetId: String) {
    suspend fun isCurrent(): Boolean = withContext(Dispatchers.Main.immediate) { capture.isCurrent() }
    private suspend fun requireCurrent() { currentCoroutineContext().ensureActive(); check(isCurrent()) }
    suspend fun audienceAvailable(): Boolean {
        requireCurrent()
        val value = capture.client.readMediaCapabilities()
        requireCurrent()
        return value.creatorMediaAudienceAvailable
    }
    suspend fun asset(): AudienceAsset {
        requireCurrent()
        val value = capture.client.readAudienceCreatorMedia(creatorId, assetId, capture.expectedAccountId)
        requireCurrent()
        return AudienceAsset.read(JSONObject(Json.encodeToString(value)))
    }
    suspend fun playback(): JSONObject {
        requireCurrent()
        val value = capture.client.audienceCreatorMediaPlayback(creatorId, assetId, capture.expectedAccountId)
        requireCurrent()
        return JSONObject(Json.encodeToString(value))
    }
    suspend fun download(context: Context, ticket: String, asset: AudienceAsset, proof: PlaybackFile): File {
        requireCurrent(); require(proof.matches(asset))
        val file = File.createTempFile("w5-content-", if (asset.mimeType == "image/png") ".png" else ".m4a", context.cacheDir)
        try {
            withContext(Dispatchers.IO) {
                val digest = MessageDigest.getInstance("SHA-256")
                file.outputStream().use { output ->
                    var offset = 0
                    while (offset < proof.bytes) {
                        requireCurrent()
                        val end = minOf(offset + 1_048_576, proof.bytes)
                        val result = capture.client.playAudienceCreatorMedia(creatorId, assetId, ticket, "bytes=$offset-${end-1}", capture.expectedAccountId)
                        requireCurrent()
                        check(result.status == 206 && result.contentRange == "bytes $offset-${end-1}/${proof.bytes}" && result.body.size == end - offset)
                        output.write(result.body); digest.update(result.body); offset = end
                    }
                }
                val hash = digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
                check(hash == proof.sha256)
            }
            requireCurrent()
            return file
        } catch (failure: Throwable) { file.delete(); throw failure }
    }
}

@Composable
internal fun NativeContentAttachment(context: Context, session: FanSession, destination: String, baseURL: String, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) {
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var transport by remember(session, destination, baseURL, accountId) { mutableStateOf<ContentMediaTransport?>(null) }
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
        var epoch = generation; val started = SystemClock.elapsedRealtime()
        try {
            listOf(creatorId, objectId, attachment.id).forEach { require(UUID.fromString(it).toString() == it) }
            require(attachment.version > 0 && attachment.sha256.matches(Regex("^[a-f0-9]{64}$")))
            val origin = URI(baseURL)
            require(origin.scheme == "https" || (origin.scheme == "http" && origin.host in listOf("localhost", "127.0.0.1", "10.0.2.2")))
            require(origin.userInfo == null && UUID.fromString(accountId).toString() == accountId)
            if (transport?.isCurrent() != true) {
                available = false; asset = null; clearBytes(); transport = null; epoch = generation
                val capture = session.captureRequest(destination, maximumResponseBytes = 1_048_576, timeoutMs = 4000) ?: error("Your session ended.")
                check(capture.expectedAccountId == accountId)
                if (epoch != generation || !active) return
                transport = ContentMediaTransport(capture, creatorId, attachment.id)
            }
            val api = transport ?: error("The media service is not connected.")
            check(api.audienceAvailable())
            val current = api.asset()
            check(matches(current))
            if (epoch != generation || !active || transport !== api || !api.isCurrent()) return
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
                check(api.isCurrent() && active && epoch == generation)
                val ticket = api.playback()
                val issued = AudienceAsset.read(ticket.getJSONObject("asset"))
                val proof = PlaybackFile.read(ticket.getJSONObject("playbackFile"))
                check(matches(issued) && issued.bytes == current.bytes && issued.mimeType == current.mimeType && issued.durationMs == current.durationMs)
                check(proof.matches(issued) && proof.matches(current))
                val url = URI(ticket.getString("url"))
                val origin = URI(baseURL)
                check(url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port && url.userInfo == null && url.rawFragment == null)
                check(url.rawPath == "$family/play" && !url.rawQuery.isNullOrEmpty() && url.rawQuery.split('&').size == 1 && url.rawQuery.startsWith("ticket=") && url.rawQuery.length > 7)
                val token = java.net.URLDecoder.decode(url.rawQuery.substring(7), "UTF-8")
                check(Instant.parse(ticket.getString("expiresAt")).isAfter(Instant.now()))
                val saved = api.download(context, token, issued, proof)
                if (!active || epoch != generation || transport !== api || !api.isCurrent() || !available || SystemClock.elapsedRealtime() - checkedAt >= 5000) { saved.delete(); return@launch }
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
                    if (!active || epoch != generation || transport !== api || !api.isCurrent() || !available || SystemClock.elapsedRealtime() - checkedAt >= 5000) {
                        if (epoch == generation) clearBytes()
                        return@launch
                    }
                    image = bitmap; ready = true; busy = false
                } else {
                    val playback = MediaPlayer()
                    player = playback
                    playback.setOnPreparedListener {
                        scope.launch {
                            val currentCapture = api.isCurrent()
                            if (player === playback && epoch == generation) {
                                if (currentCapture && transport === api && active && available && SystemClock.elapsedRealtime() - checkedAt < 5000) { ready = true; busy = false }
                                else clearBytes()
                            } else runCatching { playback.release() }
                        }
                    }
                    playback.setOnCompletionListener {
                        scope.launch {
                            val currentCapture = api.isCurrent()
                            if (player === playback && epoch == generation) {
                                if (currentCapture && transport === api && active && available) playing = false else clearBytes()
                            }
                        }
                    }
                    playback.setOnErrorListener { _, _, _ ->
                        scope.launch {
                            val currentCapture = api.isCurrent()
                            if (player === playback && epoch == generation) {
                                clearBytes()
                                if (currentCapture && transport === api && active) error = "The recording could not be played. Check current access before retrying."
                            } else runCatching { playback.release() }
                        }
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
            if (!active) { available = false; asset = null; clearBytes(); transport = null }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); active = false; available = false; clearBytes(); transport = null }
    }
    LaunchedEffect(active, session, destination) { if (active) while (true) { checkAccess(); delay(2000) } }
    LaunchedEffect(Unit) { while (true) {
        val api = transport
        if (api != null && !api.isCurrent() && transport === api) { available = false; asset = null; clearBytes(); transport = null }
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
                else {
                    val playback = player; val api = transport; val epoch = generation
                    scope.launch {
                        if (api != null && api.isCurrent() && active && available && epoch == generation && transport === api && player === playback && SystemClock.elapsedRealtime() - checkedAt < 5000) {
                            playback?.let { if (it.isPlaying) it.pause() else it.start(); playing = it.isPlaying }
                        } else if (epoch == generation) clearBytes()
                    }
                }
            }
        }
    }
}
