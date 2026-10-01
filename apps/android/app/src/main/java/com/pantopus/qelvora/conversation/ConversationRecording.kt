package com.pantopus.qelvora.conversation

import android.media.AudioAttributes
import android.media.MediaDataSource
import android.media.MediaPlayer
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.ui.VoiceNote
import com.pantopus.qelvora.ui.qText
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

@Serializable data class ConversationRecording(val state: String, val asset: APIMediaMediaAsset? = null)
@Serializable private data class RecordingTicket(val asset: APIMediaMediaAsset, val url: String, val expiresAt: String, val playbackFile: APIMediaPlaybackFile)
private data class LoadedRecording(val bytes: ByteArray, val proof: APIMediaPlaybackFile)

/** Credentials stay in W1's store. Audio is bounded and checked in memory; redirects and disk caching are disabled. */
private class RecordingClient(private val base: URL, private val accountId: String, creatorId: String, fanId: String, private val token: () -> String?) {
    private val json = Json { ignoreUnknownKeys = true }
    private val family = "/v1/w6/threads/$creatorId/$fanId/media"
    init {
        UUID.fromString(accountId); UUID.fromString(creatorId); UUID.fromString(fanId)
        require(base.userInfo == null && (base.protocol == "https" || (base.protocol == "http" && base.host in listOf("localhost", "127.0.0.1", "10.0.2.2"))))
    }
    private suspend fun bytes(path: String, limit: Int, post: Boolean = false, proof: APIMediaPlaybackFile? = null): ByteArray = withContext(Dispatchers.IO) {
        val credential = token() ?: throw ConversationFailure(401, "Your session ended. Reopen the conversation.")
        val url = URI(base.toString()).resolve(path).toURL()
        require(url.protocol == base.protocol && url.host == base.host && url.port == base.port && url.userInfo == null)
        val connection = url.openConnection() as HttpURLConnection
        connection.instanceFollowRedirects = false; connection.useCaches = false
        connection.connectTimeout = 15_000; connection.readTimeout = 15_000
        connection.requestMethod = if (post) "POST" else "GET"
        connection.setRequestProperty("Authorization", "Bearer $credential")
        connection.setRequestProperty("X-Qelvora-Expected-Account", accountId)
        try {
            if (post) {
                connection.setRequestProperty("Content-Type", "application/json"); connection.doOutput = true
                connection.setFixedLengthStreamingMode(2); connection.outputStream.use { it.write("{}".toByteArray()) }
            }
            if (connection.responseCode != 200) throw ConversationFailure(connection.responseCode, "Audio access could not be confirmed. Try again.")
            if (proof != null && connection.contentLengthLong != proof.bytes) throw ConversationFailure(503, "This recording changed. Refresh to try again.")
            val output = java.io.ByteArrayOutputStream()
            val hash = proof?.let { MessageDigest.getInstance("SHA-256") }
            connection.inputStream.use { input ->
                val chunk = ByteArray(8192)
                while (true) {
                    coroutineContext.ensureActive()
                    val count = input.read(chunk); if (count < 0) break
                    if (count > limit - output.size()) throw ConversationFailure(503, "The recording could not be confirmed.")
                    output.write(chunk, 0, count); hash?.update(chunk, 0, count)
                }
            }
            coroutineContext.ensureActive()
            if (token() != credential) throw ConversationFailure(401, "Your account changed. Reopen the conversation.")
            if (proof != null && (output.size().toLong() != proof.bytes || hash!!.digest().joinToString("") { "%02x".format(it.toInt() and 255) } != proof.sha256)) throw ConversationFailure(503, "The recording could not be confirmed.")
            output.toByteArray()
        } finally { connection.disconnect() }
    }
    private fun matches(current: APIMediaMediaAsset, asset: APIMediaMediaAsset): Boolean =
        current.id == asset.id && current.threadId == asset.threadId && current.state == APIMediaMediaAssetState.READY &&
        current.purpose == APIMediaMediaAssetPurpose.HUMAN_REPLY && current.version == asset.version &&
        current.sha256 == asset.sha256 && current.bytes == asset.bytes && current.mimeType == "audio/mp4" &&
        current.durationMs == asset.durationMs && current.signedActId != null && current.signedActId == asset.signedActId
    private fun matchesFile(asset: APIMediaMediaAsset, proof: APIMediaPlaybackFile): Boolean {
        val provenance = asset.provenance
        return if (proof.variant == APIMediaPlaybackFileVariant.CREDENTIALED)
            provenance?.get("c2paVerified")?.jsonPrimitive?.booleanOrNull == true &&
            provenance?.get("fileVariant")?.jsonPrimitive?.contentOrNull == "credentialed" &&
            provenance?.get("fileSha256")?.jsonPrimitive?.contentOrNull == proof.sha256 &&
            provenance?.get("fileBytes")?.jsonPrimitive?.longOrNull == proof.bytes
        else provenance?.get("c2paVerified")?.jsonPrimitive?.booleanOrNull != true && proof.sha256 == asset.sha256 && proof.bytes == asset.bytes
    }
    suspend fun assertCurrent(asset: APIMediaMediaAsset, proof: APIMediaPlaybackFile) {
        val current = json.decodeFromString<APIMediaMediaAsset>(bytes("$family/${asset.id}", 1_000_000).toString(Charsets.UTF_8))
        if (!matches(current, asset) || !matchesFile(current, proof)) throw ConversationFailure(403, "This recording is no longer available.")
    }
    suspend fun audio(asset: APIMediaMediaAsset): LoadedRecording {
        UUID.fromString(asset.id)
        val ticket = json.decodeFromString<RecordingTicket>(bytes("$family/${asset.id}/playback", 1_000_000, post = true).toString(Charsets.UTF_8))
        val proof = ticket.playbackFile
        val url = URI(ticket.url)
        val path = "$family/${asset.id}/play"
        require(matches(ticket.asset, asset) && matchesFile(ticket.asset, proof) && proof.bytes in 1..268_435_456 && Regex("^[a-f0-9]{64}$").matches(proof.sha256))
        require(Instant.parse(ticket.expiresAt).isAfter(Instant.now()) && url.isAbsolute && url.userInfo == null && url.fragment == null && url.path == path)
        require(url.rawQuery != null && Regex("^ticket=[A-Za-z0-9_.-]+$").matches(url.rawQuery))
        // The ticket never selects a host: only this fixed path/query goes to the configured authenticated base.
        val audio = bytes(path + "?" + url.rawQuery, proof.bytes.toInt(), proof = proof)
        try { assertCurrent(asset, proof) } catch (error: Exception) { audio.fill(0); throw error }
        return LoadedRecording(audio, proof)
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
internal fun ConversationRecordingPlayer(baseURL: String, accountId: String, creatorId: String, fanId: String, asset: APIMediaMediaAsset, name: String, time: String, active: Boolean, token: () -> String?, onVerify: () -> Unit) {
    val key = "$baseURL/$accountId/$creatorId/$fanId/${asset.id}/${asset.version}/${asset.sha256}"
    val client = remember(key) { RecordingClient(URL(baseURL), accountId, creatorId, fanId, token) }
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
    val currentActive by rememberUpdatedState(active)
    fun clear() {
        revision += 1
        load?.cancel(); load = null
        player?.release(); player = null; source?.close(); source = null; proof = null
        loading = false; prepared = false; playing = false; position = 0
    }
    DisposableEffect(key) { onDispose { clear() } }
    LaunchedEffect(active, key) {
        if (!active) { clear(); return@LaunchedEffect }
        while (isActive) {
            delay(1000)
            val current = player; val file = proof
            val attempt = revision
            if (current != null && file != null) try {
                client.assertCurrent(asset, file)
                ensureActive(); if (revision == attempt && prepared && player === current) { position = current.currentPosition.toLong(); playing = current.isPlaying }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                if (revision == attempt && player === current) { clear(); failure = "This recording is unavailable. Reopen the conversation to try again." }
            }
        }
    }
    fun elapsed(milliseconds: Long): String { val seconds = maxOf(0, milliseconds / 1000); return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}" }
    Column {
        VoiceNote(name = name, time = time, duration = elapsed(asset.durationMs ?: 0), playing = playing, playbackAvailable = active && !loading,
            waveform = asset.waveform, position = position.toDouble() / maxOf(1L, asset.durationMs ?: 0), onVerify = onVerify, onPlayPause = {
                if (currentActive) {
                    val current = player
                    if (current != null) { if (current.isPlaying) current.pause() else current.start(); playing = current.isPlaying }
                    else if (load == null) {
                        val attempt = revision
                        load = scope.launch {
                        loading = true; failure = ""
                        var pendingBytes: ByteArray? = null
                        try {
                            val audio = client.audio(asset); pendingBytes = audio.bytes; ensureActive()
                            if (!currentActive || revision != attempt) return@launch
                            val data = RecordingDataSource(audio.bytes); source = data; pendingBytes = null; proof = audio.proof
                            val next = MediaPlayer(); player = next
                            next.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                            next.setDataSource(data)
                            next.setOnPreparedListener { if (revision == attempt && player === it) { if (currentActive) { prepared = true; it.start(); playing = true; loading = false } else clear() } }
                            next.setOnCompletionListener { if (revision == attempt && player === it) { playing = false; position = asset.durationMs ?: 0 } }
                            next.setOnErrorListener { failed, _, _ -> if (revision == attempt && player === failed) { clear(); failure = "Playback could not start. Try again." }; true }
                            next.prepareAsync()
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            if (revision == attempt) { clear(); failure = "Audio access could not be confirmed. Try again." }
                        } finally { pendingBytes?.fill(0); if (revision == attempt) { load = null; if (player == null) loading = false } }
                        }
                    }
                }
            })
        BasicText(if (loading) "Loading recording…" else elapsed(position), style = qText("data-sm").copy(color = qColor("ink")))
        if (failure.isNotEmpty()) BasicText(failure, style = qText("caption").copy(color = qColor("ink")))
    }
}
