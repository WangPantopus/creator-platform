package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.QelvoraCopy

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
    private var closed = false
    private var accumulated = 0L
    private var activeAt = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val manager = context.getSystemService(AudioManager::class.java)
    private val routeCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) { if (mutable.value.state == "recording") pause(QelvoraCopy.text("w6AudioRouteChangedCheckTheMicrophoneBeforeResuming")) }
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
        if (closed) return
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
            value.setOnInfoListener { source, what, _ -> if (source === recorder && what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stop() }
            value.setOnErrorListener { source, _, _ -> if (source === recorder) pause(QelvoraCopy.text("w6RecordingWasInterruptedPreviewItOrRecordAgain")) }
            recorder = value; value.prepare(); value.start(); activeAt = android.os.SystemClock.elapsedRealtime()
            mutable.value = RecordingSnapshot("recording", file = file); handler.post(tick)
        } catch (_: Exception) { recorder?.release(); recorder = null; file.delete(); mutable.value = RecordingSnapshot("failed", reason = QelvoraCopy.text("w6TheMicrophoneIsUnavailableTryAgain")) }
    }
    fun deny() {
        if (closed) return
        // A permission denial can follow Record again while a private preview
        // still exists. Release its player and bytes before dropping the file.
        discard()
        mutable.value = RecordingSnapshot("denied", reason = QelvoraCopy.text("w6MicrophoneAccessIsOffAllowItInSettingsThenTry"))
    }
    fun pause(reason: String? = null) {
        if (mutable.value.state != "recording") return
        accumulated += android.os.SystemClock.elapsedRealtime() - activeAt
        try { recorder?.pause(); handler.removeCallbacks(tick); mutable.value = mutable.value.copy(state = "paused", durationMs = accumulated, reason = reason) }
        catch (_: Exception) { stop(); mutable.value = mutable.value.copy(reason = QelvoraCopy.text("w6RecordingCouldNotPausePreviewWhatWasSaved")) }
    }
    fun resume() {
        if (mutable.value.state != "paused") return
        try { recorder?.resume(); activeAt = android.os.SystemClock.elapsedRealtime(); mutable.value = mutable.value.copy(state = "recording", reason = null); handler.post(tick) }
        catch (_: Exception) { mutable.value = mutable.value.copy(reason = QelvoraCopy.text("w6RecordingCouldNotResumeRecordAgain")) }
    }
    fun stop() {
        if (mutable.value.state !in listOf("recording", "paused")) return
        val duration = if (mutable.value.state == "recording") accumulated + android.os.SystemClock.elapsedRealtime() - activeAt else accumulated
        handler.removeCallbacks(tick)
        try { recorder?.stop(); mutable.value = mutable.value.copy(state = "preview", durationMs = duration.coerceAtMost(maxDurationMs)) }
        catch (_: Exception) { mutable.value.file?.delete(); mutable.value = RecordingSnapshot("failed", reason = QelvoraCopy.text("w6NoUsableAudioWasSavedRecordAgain")) }
        finally { recorder?.release(); recorder = null }
    }
    fun playPreview() {
        val file = mutable.value.file ?: return
        if (mutable.value.state != "preview") return
        try { player?.release(); player = MediaPlayer().apply { setDataSource(file.absolutePath); prepare(); start() } }
        catch (_: Exception) { mutable.value = mutable.value.copy(reason = QelvoraCopy.text("w6ThisRecordingCouldNotBePlayedRecordAgain")) }
    }
    fun seekTo(milliseconds: Int) { player?.seekTo(milliseconds.coerceIn(0, mutable.value.durationMs.toInt())) }
    fun pausePreview() { if (player?.isPlaying == true) player?.pause() }
    fun discard() {
        handler.removeCallbacks(tick); try { recorder?.stop() } catch (_: Exception) { /* no valid recording */ }
        recorder?.release(); recorder = null; player?.release(); player = null; mutable.value.file?.delete(); accumulated = 0
        mutable.value = RecordingSnapshot()
    }
    fun close() { closed = true; discard(); manager.unregisterAudioDeviceCallback(routeCallback) }
}
