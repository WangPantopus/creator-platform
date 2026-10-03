package com.pantopus.qelvora.media

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.pantopus.qelvora.BuildConfig
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.*
import java.net.URI
import java.util.UUID

/** Explicit SDK transport; no registration, provider authority or fake media. */
class LiveKitNativeCallTransport(context: Context, private val sessionId: UUID) : NativeCallScreenTransport {
    private val context = context.applicationContext
    private val events = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var room: Room? = null
    private val controls = mutableSetOf<Deferred<Unit>>()
    private var draining: Deferred<Unit>? = null
    private var epoch = 0
    private var cameraAllowed = false
    private var collector: Job? = null
    private var video by mutableStateOf<VideoTrack?>(null)
    private val remote = linkedSetOf<VideoTrack>()
    private val renderers = mutableMapOf<TextureViewRenderer, VideoTrack>()
    private fun releaseRenderer(renderer: TextureViewRenderer) {
        renderers.remove(renderer)?.let { track -> track.removeRenderer(renderer); renderer.release() }
    }

    @Composable override fun Media() {
        val currentRoom = room ?: return
        val currentTrack = video ?: return
        val renderer = remember(currentRoom, currentTrack) {
            TextureViewRenderer(context).also { currentRoom.initVideoRenderer(it); currentTrack.addRenderer(it); renderers[it] = currentTrack }
        }
        DisposableEffect(renderer) {
            onDispose { releaseRenderer(renderer) }
        }
        AndroidView(factory = { renderer }, modifier = Modifier.fillMaxWidth().height(240.dp))
    }
    override suspend fun connect(admission: CallAdmission, camera: Boolean, onState: (String) -> Unit) {
        check(room == null && UUID.fromString(admission.sessionId) == sessionId)
        val uri = URI(admission.url)
        require(uri.userInfo == null && uri.query == null && uri.fragment == null &&
            (uri.scheme == "wss" || (BuildConfig.DEBUG && uri.scheme == "ws" && uri.host in listOf("localhost", "127.0.0.1", "[::1]"))))
        require(admission.token.isNotEmpty() && admission.token.length <= 16384)
        check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
        if (camera) check(context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
        val generation = ++epoch
        val current = LiveKit.create(context)
        room = current; cameraAllowed = camera
        collector = events.launch {
            current.events.collect { event ->
                if (generation != epoch || room !== current) return@collect
                when (event) {
                    is RoomEvent.Connected, is RoomEvent.Reconnected -> onState("connected")
                    is RoomEvent.Reconnecting -> onState("reconnecting")
                    is RoomEvent.Disconnected -> { remote.clear(); video = null; onState("disconnected") }
                    is RoomEvent.TrackSubscribed -> { (event.track as? VideoTrack)?.let { remote.add(it); video = remote.firstOrNull() } }
                    is RoomEvent.TrackUnsubscribed -> { (event.track as? VideoTrack)?.let { remote.remove(it); video = remote.firstOrNull() } }
                    else -> Unit
                }
            }
        }
        try {
            current.connect(admission.url, admission.token)
            currentCoroutineContext().ensureActive()
            check(generation == epoch && room === current)
            check(current.localParticipant.setMicrophoneEnabled(true))
            if (camera) check(current.localParticipant.setCameraEnabled(true))
            currentCoroutineContext().ensureActive()
            check(generation == epoch && room === current)
        } catch (error: Exception) {
            if (room === current) disconnect() else { current.disconnect(); current.release() }
            throw error
        }
    }
    private suspend fun control(enabled: Boolean, camera: Boolean) {
        val current = room ?: error("Call media disconnected")
        check(!camera || cameraAllowed)
        val generation = epoch
        val task = events.async(start = CoroutineStart.LAZY) {
            check(if (camera) current.localParticipant.setCameraEnabled(enabled) else current.localParticipant.setMicrophoneEnabled(enabled))
        }
        controls.add(task); task.start()
        try { task.await(); currentCoroutineContext().ensureActive(); check(generation == epoch && room === current) }
        finally { task.cancel(); controls.remove(task) }
    }
    override suspend fun microphone(enabled: Boolean) = control(enabled, false)
    override suspend fun camera(enabled: Boolean) = control(enabled, true)
    internal suspend fun disconnectAndDrain() { disconnect(); draining?.await() }
    override fun disconnect() {
        epoch++; collector?.cancel(); collector = null
        val current = room; room = null; video = null; remote.clear(); cameraAllowed = false
        renderers.keys.toList().forEach { releaseRenderer(it) }
        val pending = controls.toList(); controls.clear(); pending.forEach { it.cancel() }
        val prior = draining
        draining = events.async(NonCancellable) {
            prior?.await()
            pending.forEach { try { it.await() } catch (_: CancellationException) {} }
            current?.disconnect(); current?.release()
        }
    }
}
