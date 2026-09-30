package com.pantopus.qelvora.media

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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

@Composable
fun VoiceRecordingScreen(maxDurationMs: Long = 60_000) {
    val context = LocalContext.current
    val recorder = remember(context, maxDurationMs) { NativeVoiceRecorder(context, maxDurationMs) }
    val snapshot by recorder.snapshot.collectAsState()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) recorder.start() else recorder.deny() }
    DisposableEffect(recorder, lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_PAUSE) { recorder.pause("Recording paused while you left this screen."); recorder.pausePreview() } }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); recorder.close() }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(QelvoraTokens.space4), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space5)) {
        BasicText("Your own voice", style = qText("display-md").copy(color = qColor("ink")))
        BasicText("Record and listen before uploading. Your preview stays on this device.", style = qText("body").copy(color = qColor("ink")))
        BasicText("${snapshot.durationMs / 60_000}:${(snapshot.durationMs / 1000 % 60).toString().padStart(2, '0')}", Modifier.semantics { contentDescription = "${snapshot.durationMs / 1000} seconds recorded" }, style = qText("data-lg").copy(color = qColor("ink")))
        BasicText("Up to ${maxDurationMs / 1000} seconds", style = qText("caption").copy(color = qColor("ink-muted")))
        if (snapshot.state in listOf("recording", "paused")) {
            Button(if (snapshot.state == "recording") "Pause" else "Resume", ButtonVariant.SECONDARY) { if (snapshot.state == "recording") recorder.pause() else recorder.resume() }
            Button("Stop and preview", ButtonVariant.SECONDARY) { recorder.stop() }
        } else Button(if (snapshot.state == "preview") "Record again" else "Record", ButtonVariant.SECONDARY) { permission.launch(Manifest.permission.RECORD_AUDIO) }
        if (snapshot.state == "preview") {
            Button("Play private preview", ButtonVariant.SECONDARY) { recorder.playPreview() }
            Button("Pause preview", ButtonVariant.SECONDARY) { recorder.pausePreview() }
            Button("Discard recording", ButtonVariant.QUIET) { recorder.discard() }
        }
        snapshot.reason?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        BasicText("Uploading and exact-media signing require a configured account and media service.", style = qText("caption").copy(color = qColor("ink-muted")))
    }
}
