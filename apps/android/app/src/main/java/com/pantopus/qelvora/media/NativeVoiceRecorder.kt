package com.pantopus.qelvora.media

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.util.UUID

data class RecordingSnapshot(val state: String = "idle", val durationMs: Long = 0, val file: File? = null, val reason: String? = null)

/** Private AAC/M4A recording; never labels local microphone capture as a verified creator act. */
class NativeVoiceRecorder(private val context: Context, val maxDurationMs: Long) {
    private val mutable = MutableStateFlow(RecordingSnapshot())
    val snapshot: StateFlow<RecordingSnapshot> = mutable
    private var recorder: MediaRecorder? = null
    private var player: MediaPlayer? = null
    private var accumulated = 0L
    private var activeAt = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(AudioManager::class.java)
    private val routeCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) { if (mutable.value.state == "recording") pause("Audio route changed. Check the microphone before resuming.") }
    }
    private val tick = object : Runnable {
        override fun run() {
            if (mutable.value.state != "recording") return
            val duration = accumulated + android.os.SystemClock.elapsedRealtime() - activeAt
            mutable.value = mutable.value.copy(durationMs = duration.coerceAtMost(maxDurationMs))
            if (duration >= maxDurationMs) stop() else handler.postDelayed(this, 100)
        }
    }
    init { require(maxDurationMs > 0); manager.registerAudioDeviceCallback(routeCallback, handler) }
    @Suppress("DEPRECATION")
    fun start() {
        discard()
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { deny(); return }
        val file = File(context.cacheDir, "voice-${UUID.randomUUID()}.m4a")
        try {
            val value = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
            value.setAudioSource(MediaRecorder.AudioSource.MIC)
            value.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            value.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            value.setAudioSamplingRate(48000); value.setAudioEncodingBitRate(96000); value.setAudioChannels(1)
            value.setMaxDuration(maxDurationMs.toInt()); value.setOutputFile(file.absolutePath)
            value.setOnInfoListener { _, what, _ -> if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stop() }
            value.setOnErrorListener { _, _, _ -> pause("Recording was interrupted. Preview it or record again.") }
            recorder = value; value.prepare(); value.start(); activeAt = android.os.SystemClock.elapsedRealtime()
            mutable.value = RecordingSnapshot("recording", file = file); handler.post(tick)
        } catch (_: Exception) { recorder?.release(); recorder = null; file.delete(); mutable.value = RecordingSnapshot("failed", reason = "The microphone is unavailable. Try again.") }
    }
    fun deny() { mutable.value = RecordingSnapshot("denied", reason = "Microphone access is off. Allow it in Settings, then try again.") }
    fun pause(reason: String? = null) {
        if (mutable.value.state != "recording") return
        accumulated += android.os.SystemClock.elapsedRealtime() - activeAt
        try { recorder?.pause(); handler.removeCallbacks(tick); mutable.value = mutable.value.copy(state = "paused", durationMs = accumulated, reason = reason) }
        catch (_: Exception) { stop(); mutable.value = mutable.value.copy(reason = "Recording could not pause. Preview what was saved.") }
    }
    fun resume() {
        if (mutable.value.state != "paused") return
        try { recorder?.resume(); activeAt = android.os.SystemClock.elapsedRealtime(); mutable.value = mutable.value.copy(state = "recording", reason = null); handler.post(tick) }
        catch (_: Exception) { mutable.value = mutable.value.copy(reason = "Recording could not resume. Record again.") }
    }
    fun stop() {
        if (mutable.value.state !in listOf("recording", "paused")) return
        val duration = if (mutable.value.state == "recording") accumulated + android.os.SystemClock.elapsedRealtime() - activeAt else accumulated
        handler.removeCallbacks(tick)
        try { recorder?.stop(); mutable.value = mutable.value.copy(state = "preview", durationMs = duration.coerceAtMost(maxDurationMs)) }
        catch (_: Exception) { mutable.value.file?.delete(); mutable.value = RecordingSnapshot("failed", reason = "No usable audio was saved. Record again.") }
        finally { recorder?.release(); recorder = null }
    }
    fun playPreview() {
        val file = mutable.value.file ?: return
        if (mutable.value.state != "preview") return
        try { player?.release(); player = MediaPlayer().apply { setDataSource(file.absolutePath); prepare(); start() } }
        catch (_: Exception) { mutable.value = mutable.value.copy(reason = "This recording could not be played. Record again.") }
    }
    fun seekTo(milliseconds: Int) { player?.seekTo(milliseconds.coerceIn(0, mutable.value.durationMs.toInt())) }
    fun pausePreview() { if (player?.isPlaying == true) player?.pause() }
    fun discard() {
        handler.removeCallbacks(tick); try { recorder?.stop() } catch (_: Exception) { /* no valid recording */ }
        recorder?.release(); recorder = null; player?.release(); player = null; mutable.value.file?.delete(); accumulated = 0
        mutable.value = RecordingSnapshot()
    }
    fun close() { discard(); manager.unregisterAudioDeviceCallback(routeCallback) }
}
