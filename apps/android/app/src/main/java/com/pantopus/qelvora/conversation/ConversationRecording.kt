package com.pantopus.qelvora.conversation

import android.media.AudioAttributes
import android.media.MediaDataSource
import android.media.MediaPlayer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.ui.Button
import com.pantopus.qelvora.ui.ButtonVariant
import com.pantopus.qelvora.ui.VoiceNote
import com.pantopus.qelvora.ui.qColor
import com.pantopus.qelvora.ui.qText
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.net.URI
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

@Serializable data class ConversationRecording(val state: String, val asset: APIMediaMediaAsset? = null)
private data class LoadedRecording(val bytes: ByteArray, val proof: APIMediaPlaybackFile, val checkedAt: Long)

/** Every request retains the same actual W1 capture and immutable typed client. */
private class RecordingClient(private val base: URI, private val capture: FanSessionRequestCapture, private val creatorId: String, private val fanId: String) {
    suspend fun isCurrent(): Boolean = withContext(Dispatchers.Main.immediate) { capture.isCurrent() }
    private suspend fun requireCurrent() { currentCoroutineContext().ensureActive(); check(isCurrent()) }
    private fun text(asset: APIMediaMediaAsset, key: String): String? = (asset.provenance?.get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun number(asset: APIMediaMediaAsset, key: String): Double? = (asset.provenance?.get(key) as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }
    private fun uuid(value: String?): Boolean = value != null && runCatching { UUID.fromString(value).toString() == value }.getOrDefault(false)
    private fun qualified(asset: APIMediaMediaAsset): Boolean {
        // This is the original creator signer, not the viewing fan account.
        val verified = (asset.provenance?.get("c2paVerified") as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true
        return asset.state == APIMediaMediaAssetState.READY && asset.purpose == APIMediaMediaAssetPurpose.HUMAN_REPLY &&
            asset.mimeType == "audio/mp4" && asset.bytes in 1L..268_435_456L && (asset.durationMs ?: 0) in 1L..3_600_000L &&
            uuid(asset.signedActId) && uuid(text(asset, "accountId")) && verified && number(asset, "schemaVersion") == 1.0 &&
            text(asset, "kind") == "human_recording" && text(asset, "creatorId") == creatorId && text(asset, "fanId") == fanId &&
            text(asset, "threadId") == asset.threadId && text(asset, "purpose") == "human_reply" &&
            text(asset, "signedActId") == asset.signedActId && text(asset, "assetId") == asset.id &&
            number(asset, "assetVersion") == asset.version.toDouble() && text(asset, "processedMediaSha256") == asset.sha256 &&
            number(asset, "processedMediaBytes") == asset.bytes.toDouble() && text(asset, "processedMediaMimeType") == asset.mimeType &&
            number(asset, "processedMediaDurationMs") == asset.durationMs?.toDouble() && text(asset, "transform") == "aac_m4a"
    }
    private fun matches(current: APIMediaMediaAsset, asset: APIMediaMediaAsset): Boolean =
        qualified(current) && qualified(asset) && current.id == asset.id && current.threadId == asset.threadId &&
        current.version == asset.version && current.sha256 == asset.sha256 && current.bytes == asset.bytes &&
        current.durationMs == asset.durationMs && current.signedActId == asset.signedActId && text(current, "accountId") == text(asset, "accountId")
    private fun matchesFile(asset: APIMediaMediaAsset, proof: APIMediaPlaybackFile): Boolean =
        qualified(asset) && proof.variant == APIMediaPlaybackFileVariant.CREDENTIALED && proof.bytes in 1L..268_435_456L &&
        proof.sha256.matches(Regex("^[a-f0-9]{64}$")) && text(asset, "fileVariant") == "credentialed" &&
        text(asset, "fileSha256") == proof.sha256 && number(asset, "fileBytes") == proof.bytes.toDouble()
    suspend fun assertCurrent(asset: APIMediaMediaAsset, proof: APIMediaPlaybackFile): Long {
        val started = android.os.SystemClock.elapsedRealtime()
        requireCurrent()
        val current = capture.client.readThreadMedia(creatorId, fanId, asset.id, capture.expectedAccountId)
        requireCurrent()
        check(matches(current, asset) && matchesFile(current, proof) && matchesFile(asset, proof) && android.os.SystemClock.elapsedRealtime() - started < 5000)
        return started
    }
    suspend fun audio(asset: APIMediaMediaAsset): LoadedRecording = withContext(Dispatchers.IO) {
        require(uuid(asset.id) && qualified(asset)); requireCurrent()
        val ticket = capture.client.threadMediaPlayback(creatorId, fanId, asset.id, capture.expectedAccountId)
        requireCurrent()
        // Convert only the same original typed response's nested DTOs.
        val issued = Json.decodeFromJsonElement<APIMediaMediaAsset>(Json.encodeToJsonElement(ticket.asset))
        val proof = Json.decodeFromJsonElement<APIMediaPlaybackFile>(Json.encodeToJsonElement(ticket.playbackFile)); val url = URI(ticket.url)
        val path = "/v1/w6/threads/$creatorId/$fanId/media/${asset.id}/play"
        require(matches(issued, asset) && matchesFile(issued, proof) && matchesFile(asset, proof))
        require(Instant.parse(ticket.expiresAt).isAfter(Instant.now()) && url.scheme == base.scheme && url.host == base.host && url.port == base.port && url.userInfo == null && url.fragment == null && url.rawPath == path)
        require(url.rawQuery != null && Regex("^ticket=[A-Za-z0-9_.-]+$").matches(url.rawQuery))
        val token = url.rawQuery.substring(7)
        val bytes = ByteArray(proof.bytes.toInt()); val hash = MessageDigest.getInstance("SHA-256")
        try {
            var offset = 0
            while (offset < bytes.size) {
                requireCurrent()
                val end = minOf(offset + 1_048_576, bytes.size)
                val result = capture.client.playThreadMedia(creatorId, fanId, asset.id, token, "bytes=$offset-${end-1}", capture.expectedAccountId)
                try {
                    requireCurrent()
                    check(result.status == 206 && result.contentRange == "bytes $offset-${end-1}/${proof.bytes}" && result.body.size == end - offset)
                    result.body.copyInto(bytes, offset); hash.update(result.body); offset = end
                } finally { result.body.fill(0) }
            }
            check(hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) } == proof.sha256)
            LoadedRecording(bytes, proof, assertCurrent(asset, proof))
        } catch (failure: Throwable) { bytes.fill(0); throw failure }
    }
}

/** Seekable in-memory source. Closing releases and erases its sole owned audio buffer. */
private class RecordingDataSource(private var bytes: ByteArray?) : MediaDataSource() {
    @Synchronized override fun getSize(): Long = bytes?.size?.toLong() ?: 0
    @Synchronized override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
        val current = bytes ?: return -1
        if (position < 0 || position >= current.size) return -1
        val count = minOf(size, current.size - position.toInt())
        System.arraycopy(current, position.toInt(), buffer, offset, count)
        return count
    }
    @Synchronized override fun close() { bytes?.fill(0); bytes = null }
}

@Composable
internal fun ConversationRecordingPlayer(baseURL: String, session: FanSession, destination: String, accountId: String, creatorId: String, fanId: String, asset: APIMediaMediaAsset, name: String, time: String, active: Boolean, onVerify: () -> Unit) {
    val key = "$baseURL/$accountId/$creatorId/$fanId/${asset.id}/${asset.version}/${asset.sha256}"
    var client by remember(key, session, destination) { mutableStateOf<RecordingClient?>(null) }
    val scope = rememberCoroutineScope()
    var player by remember(key) { mutableStateOf<MediaPlayer?>(null) }
    var source by remember(key) { mutableStateOf<RecordingDataSource?>(null) }
    var proof by remember(key) { mutableStateOf<APIMediaPlaybackFile?>(null) }
    var loading by remember(key) { mutableStateOf(false) }
    var prepared by remember(key) { mutableStateOf(false) }
    var playing by remember(key) { mutableStateOf(false) }
    var position by remember(key) { mutableStateOf(0L) }
    var failure by remember(key) { mutableStateOf("") }
    var load by remember(key) { mutableStateOf<Job?>(null) }
    var revision by remember(key) { mutableStateOf(0L) }
    var checkedAt by remember(key) { mutableLongStateOf(0L) }
    val currentActive by rememberUpdatedState(active)
    fun fresh() = android.os.SystemClock.elapsedRealtime() - checkedAt < 5000
    fun discardBytes() {
        player?.release(); player = null; source?.close(); source = null; proof = null
        prepared = false; playing = false; position = 0; checkedAt = 0
    }
    fun clear() { revision += 1; load?.cancel(); load = null; loading = false; discardBytes(); client = null }
    DisposableEffect(key, session, destination) { onDispose { clear() } }
    LaunchedEffect(active, key, session, destination) {
        if (!active) { clear(); return@LaunchedEffect }
        while (isActive) {
            val api = client; val current = player; val file = proof; val attempt = revision
            if (api != null && current != null && file != null && prepared) try {
                val started = api.assertCurrent(asset, file)
                ensureActive()
                if (currentActive && revision == attempt && player === current && client === api) checkedAt = started
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (revision == attempt && player === current && client === api) { clear(); failure = "This recording is unavailable. Reopen the conversation to try again." }
            }
            delay(1000)
        }
    }
    LaunchedEffect(active, key, session, destination) {
        if (!active) return@LaunchedEffect
        while (isActive) {
            val api = client
            if (api != null && !api.isCurrent() && client === api) { clear(); failure = "Your session changed. Load this recording again." }
            if (player != null && !fresh()) { clear(); failure = "This recording is unavailable. Reopen the conversation to try again." }
            if (prepared) player?.let { current -> runCatching { position = current.currentPosition.toLong().coerceIn(0L, asset.durationMs ?: 0); playing = current.isPlaying }.onFailure { clear(); failure = "Playback could not continue. Try again." } }
            delay(500)
        }
    }
    fun command(seek: Long? = null) {
        if (!currentActive || loading || load != null) return
        var attempt = revision; loading = true; failure = ""
        load = scope.launch {
            var pendingBytes: ByteArray? = null
            try {
                if (client?.isCurrent() != true) {
                    discardBytes(); client = null; revision += 1; attempt = revision
                    val capture = session.captureRequest(destination, maximumResponseBytes = 1_048_576, timeoutMs = 4000) ?: error("Your session ended.")
                    check(capture.expectedAccountId == accountId); ensureActive()
                    if (!currentActive || revision != attempt) return@launch
                    client = RecordingClient(URI(baseURL), capture, creatorId, fanId)
                }
                val api = client ?: error("Your session ended.")
                val current = player; val file = proof
                if (current != null && file != null && prepared) {
                    val started = api.assertCurrent(asset, file)
                    ensureActive()
                    if (!currentActive || revision != attempt || client !== api || player !== current) return@launch
                    check(api.isCurrent() && android.os.SystemClock.elapsedRealtime() - started < 5000)
                    if (seek != null) {
                        val end = minOf(current.duration.toLong(), asset.durationMs ?: 0); check(end > 0)
                        current.seekTo((current.currentPosition.toLong() + seek).coerceIn(0L, end).toInt())
                    } else if (current.isPlaying) current.pause() else current.start()
                    checkedAt = started; position = current.currentPosition.toLong(); playing = current.isPlaying
                    return@launch
                }
                if (seek != null) return@launch
                val audio = api.audio(asset); pendingBytes = audio.bytes; ensureActive()
                if (!currentActive || revision != attempt || client !== api) return@launch
                check(api.isCurrent() && android.os.SystemClock.elapsedRealtime() - audio.checkedAt < 5000)
                val data = RecordingDataSource(audio.bytes); source = data; pendingBytes = null; proof = audio.proof; checkedAt = audio.checkedAt
                val next = MediaPlayer(); player = next
                next.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                next.setDataSource(data)
                next.setOnPreparedListener {
                    scope.launch {
                        val currentCapture = api.isCurrent()
                        if (revision == attempt && player === next && client === api) {
                            if (currentCapture && currentActive && fresh()) {
                                runCatching { check(next.duration > 0); prepared = true; next.start(); playing = true; loading = false }.onFailure { clear(); failure = "Playback could not start. Try again." }
                            } else clear()
                        } else runCatching { next.release() }
                    }
                }
                next.setOnCompletionListener {
                    scope.launch {
                        val currentCapture = api.isCurrent()
                        if (revision == attempt && player === next && client === api) {
                            if (currentCapture && currentActive && fresh()) { playing = false; position = asset.durationMs ?: 0 } else clear()
                        }
                    }
                }
                next.setOnErrorListener { _, _, _ ->
                    scope.launch {
                        val currentCapture = api.isCurrent()
                        if (revision == attempt && player === next && client === api) { clear(); failure = if (currentCapture && currentActive) "Playback could not start. Try again." else "Your session changed. Load this recording again." }
                    }; true
                }
                next.prepareAsync()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (revision == attempt) { clear(); failure = "Audio access could not be confirmed. Try again." }
            } finally { pendingBytes?.fill(0); if (revision == attempt) { load = null; if (player == null || prepared) loading = false } }
        }
    }
    fun elapsed(milliseconds: Long): String { val seconds = maxOf(0, milliseconds / 1000); return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}" }
    Column {
        VoiceNote(name = name, time = time, duration = elapsed(asset.durationMs ?: 0), playing = playing, playbackAvailable = active && !loading,
            waveform = asset.waveform, position = position.toDouble() / maxOf(1L, asset.durationMs ?: 0), onVerify = onVerify, onPlayPause = { command() })
        BasicText(if (loading) "Loading recording…" else elapsed(position), style = qText("data-sm").copy(color = qColor("ink")))
        if (prepared) {
            Button("Back 10 seconds", ButtonVariant.QUIET, disabled = !active || loading) { command(-10_000) }
            Button("Forward 10 seconds", ButtonVariant.QUIET, disabled = !active || loading) { command(10_000) }
        }
        if (failure.isNotEmpty()) BasicText(failure, style = qText("caption").copy(color = qColor("ink")))
    }
}
