package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.generated.QelvoraTokens
import com.pantopus.qelvora.ui.Button
import com.pantopus.qelvora.ui.ButtonVariant
import com.pantopus.qelvora.ui.qColor
import com.pantopus.qelvora.ui.qText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun VoiceRecordingScreen(maxDurationMs: Long = 60_000) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val recorder = remember(context, maxDurationMs, lifecycle) { NativeVoiceRecorder(context, maxDurationMs) }
    val snapshot by recorder.snapshot.collectAsState()
    var mounted by remember(recorder, lifecycle) { mutableStateOf(true) }
    var requestPending by remember(recorder) { mutableStateOf(false) }
    var grantedPending by remember(recorder) { mutableStateOf(false) }
    val permissions = rememberNativeMediaDevicePermissions()
    val scope = rememberCoroutineScope()
    fun startWhenResumed() {
        if (mounted && requestPending && grantedPending && lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
            requestPending = false; grantedPending = false; recorder.start()
        }
    }
    DisposableEffect(recorder, lifecycle) {
        mounted = true
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> startWhenResumed()
                Lifecycle.Event.ON_PAUSE -> { recorder.pause(QelvoraCopy.text("w6RecordingPausedWhileYouLeftThisScreen")); recorder.pausePreview() }
                Lifecycle.Event.ON_STOP -> { requestPending = false; grantedPending = false; permissions.cancel() }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { mounted = false; requestPending = false; grantedPending = false; permissions.cancel(); lifecycle.removeObserver(observer); recorder.close() }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(QelvoraTokens.space4), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space5)) {
        BasicText(QelvoraCopy.text("w6YourOwnVoice"), style = qText("display-md").copy(color = qColor("ink")))
        BasicText(QelvoraCopy.text("w6RecordAndListenBeforeUploadingYourPreviewStaysOnThis"), style = qText("body").copy(color = qColor("ink")))
        BasicText("${snapshot.durationMs / 60_000}:${(snapshot.durationMs / 1000 % 60).toString().padStart(2, '0')}", Modifier.semantics { contentDescription = QelvoraCopy.text("w6SecondsRecorded", mapOf("value1" to (snapshot.durationMs / 1000).toString())) }, style = qText("data-lg").copy(color = qColor("ink")))
        BasicText(QelvoraCopy.text("w6UpToSeconds", mapOf("value1" to (maxDurationMs / 1000).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
        if (snapshot.state in listOf("recording", "paused")) {
            Button(if (snapshot.state == "recording") QelvoraCopy.text("w6Pause") else QelvoraCopy.text("w6Resume"), ButtonVariant.SECONDARY) { if (snapshot.state == "recording") recorder.pause() else recorder.resume() }
            Button(QelvoraCopy.text("w6StopAndPreview"), ButtonVariant.SECONDARY) { recorder.stop() }
        } else if (requestPending) Button(QelvoraCopy.text("w6CancelPermissionRequest"), ButtonVariant.SECONDARY) { requestPending = false; grantedPending = false; permissions.cancel() }
        else Button(if (snapshot.state == "preview") QelvoraCopy.text("w6RecordAgain") else QelvoraCopy.text("w6Record"), ButtonVariant.SECONDARY, disabled = permissions.inFlight) {
            if (!mounted || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return@Button
            requestPending = true; grantedPending = false
            scope.launch {
                try {
                    val granted = permissions.request(camera = false)
                    if (mounted && requestPending) {
                        if (granted) { grantedPending = true; startWhenResumed() }
                        else { requestPending = false; recorder.deny() }
                    }
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { if (mounted && requestPending) { requestPending = false; recorder.deny() } }
            }
        }
        if (snapshot.state == "preview") {
            Button(QelvoraCopy.text("w6PlayPrivatePreview"), ButtonVariant.SECONDARY) { recorder.playPreview() }
            Button(QelvoraCopy.text("w6PausePreview"), ButtonVariant.SECONDARY) { recorder.pausePreview() }
            Button(QelvoraCopy.text("w6DiscardRecording"), ButtonVariant.QUIET) { recorder.discard() }
        }
        snapshot.reason?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        BasicText(QelvoraCopy.text("w6UploadingAndExactMediaSigningRequireAConfiguredAccountAnd"), style = qText("caption").copy(color = qColor("ink-muted")))
    }
}
