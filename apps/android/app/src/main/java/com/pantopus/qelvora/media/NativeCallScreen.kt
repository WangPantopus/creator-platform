package com.pantopus.qelvora.media

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONObject

internal data class CallRoute(val creator: UUID, val fan: UUID, val session: UUID) {
    val path get() = "/v1/w6/threads/$creator/$fan/calls/$session"
    companion object { fun from(destination: String): CallRoute? = runCatching { val parts = destination.substringBefore('?').trim('/').split('/'); require(parts.size == 4 && parts[0] == "calls"); CallRoute(UUID.fromString(parts[1]), UUID.fromString(parts[2]), UUID.fromString(parts[3])) }.getOrNull() }
}
data class CallAdmission(val token: String, val url: String, val sessionId: String, val accountId: String, val expiresAt: String)
/** Genuine transport owns camera/audio, rendering, Telecom and foreground lifetime. No transport is registered by default. */
interface NativeCallScreenTransport {
    @Composable fun Media()
    suspend fun connect(admission: CallAdmission, onState: (String) -> Unit)
    suspend fun microphone(enabled: Boolean)
    suspend fun camera(enabled: Boolean)
    fun disconnect()
}
object NativeCallTransports { @Volatile var create: ((UUID) -> NativeCallScreenTransport)? = null }
private fun callClock(milliseconds: Long): String = "${maxOf(0, milliseconds) / 60_000}:${(maxOf(0, milliseconds) / 1000 % 60).toString().padStart(2, '0')}"

/** Actual fan call feature: server clocks and outcomes, canonical account, separate persisted consent. */
@Composable
fun NativeCallScreen(baseURL: String?, model: FanSession) {
    val route = remember(model.destination) { CallRoute.from(model.destination) }
    val client = remember(baseURL, model) { baseURL?.let { NativeMediaClient(URL(it)) { model.currentToken() ?: error("Sign in again.") } } }
    var call by remember(route) { mutableStateOf<JSONObject?>(null) }
    var notice by remember(route) { mutableStateOf<String?>(null) }
    var stale by remember(route) { mutableStateOf(true) }
    var busy by remember(route) { mutableStateOf(false) }
    var fetching by remember(route) { mutableStateOf(false) }
    var leaving by remember(route) { mutableStateOf(false) }
    var muted by remember(route) { mutableStateOf(false) }
    var camera by remember(route) { mutableStateOf(false) }
    var localState by remember(route) { mutableStateOf("disconnected") }
    var transport by remember(route) { mutableStateOf<NativeCallScreenTransport?>(null) }
    val scope = rememberCoroutineScope()
    fun role(value: JSONObject): String? = when (model.session?.accountId) { value.getString("creatorAccountId") -> "creator"; value.getString("fanAccountId") -> "fan"; else -> null }
    suspend fun refresh() {
        val api = client ?: return; val currentRoute = route ?: return
        if (busy || fetching) return; fetching = true
        try {
            val value = JSONObject(api.request(currentRoute.path).toString(Charsets.UTF_8))
            if (value.getInt("version") >= (call?.getInt("version") ?: 0)) call = value
            stale = false
            if (value.getString("state") in listOf("ending", "ended", "cancelled")) { transport?.disconnect(); localState = "disconnected" }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { stale = true; notice = "Reconnect to refresh this call. Actions are unavailable until access is confirmed." }
        finally { fetching = false }
    }
    suspend fun action(name: String, body: JSONObject = JSONObject()) {
        val value = call ?: return; val api = client ?: return; val currentRoute = route ?: return
        if (busy || stale || role(value) == null) return; busy = true; notice = null
        try {
            body.put("expectedVersion", value.getInt("version")).put("idempotencyKey", UUID.randomUUID().toString())
            call = JSONObject(api.request(currentRoute.path + "/" + name, "POST", body.toString().toByteArray()).toString(Charsets.UTF_8))
            if (name == "end") { transport?.disconnect(); localState = "disconnected"; leaving = false }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { notice = "This action could not complete. Refresh the call before trying again."; stale = true }
        finally { busy = false }
    }
    suspend fun join() {
        val value = call ?: return; val api = client ?: return; val currentRoute = route ?: return
        if (busy || stale || role(value) == null) return
        val adapter = NativeCallTransports.create?.invoke(currentRoute.session)
        if (adapter == null) { notice = "Calling is not connected yet. Your booking is unchanged."; return }
        busy = true; notice = null
        try {
            val response = JSONObject(api.request(currentRoute.path + "/join", "POST", "{}".toByteArray()).toString(Charsets.UTF_8))
            transport = adapter; camera = value.getString("mediaMode") == "video"
            adapter.connect(CallAdmission(response.getString("token"), response.getString("url"), response.getString("sessionId"), response.getString("accountId"), response.getString("expiresAt"))) { localState = it }
        } catch (cancelled: CancellationException) { adapter.disconnect(); throw cancelled }
        catch (_: Exception) { adapter.disconnect(); notice = "Connection failed. Rejoin the same call." }
        finally { busy = false }
    }
    LaunchedEffect(route, client) { while (true) { refresh(); delay(1000) } }
    DisposableEffect(route) { onDispose { transport?.disconnect() } }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val value = call
        if (value == null) {
            BasicText("This call is unavailable", style = qText("display-md").copy(color = qColor("ink")))
            BasicText(if (route == null) "Open this call from its authorized request link." else "Checking the booking and participant access.", style = qText("body").copy(color = qColor("ink")))
        } else {
            val state = value.getString("state"); val live = state in listOf("connected", "reconnecting", "ending"); val ended = state in listOf("ended", "cancelled")
            val creator = value.getString("creatorName"); val duration = value.getLong("durationSeconds"); val connected = value.getLong("connectedMilliseconds")
            if (live) CallChip(name = creator, time = callClock(connected), end = callClock(duration * 1000), recording = value.getString("recordingState") == "on")
            else {
                BasicText("${duration / 60}-MINUTE ${value.getString("mediaMode").uppercase()} CALL", style = qText("label").copy(color = qColor("ink-muted")))
                val title = if (state == "cancelled") "This call was cancelled." else if (ended) { if (value.optString("outcome") == "completed") "You spoke with $creator for ${connected / 60_000} minutes." else "Call outcome: ${value.optString("outcome", "being reconciled").replace('_', ' ')}" } else "${runCatching { DateTimeFormatter.ofPattern("EEEE, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(value.getString("scheduledAt"))) }.getOrDefault(value.getString("scheduledAt"))} with $creator"
                BasicText(title, style = qText("display-md").copy(color = qColor("ink")))
            }
            if (!ended && !(state == "connected" && localState == "connected")) {
                val countdown = when (state) { "reconnecting" -> "Reconnecting · ${callClock(value.getLong("reconnectBudgetSeconds") * 1000 - value.getLong("reconnectUsedMilliseconds"))} allowance left"; "ending" -> "Ending · confirming provider history"; else -> runCatching { val remaining = Instant.parse(value.getString("scheduledAt")).toEpochMilli() - Instant.parse(value.getString("serverNow")).toEpochMilli(); if (remaining > 0) "Starts in ${callClock(remaining)}" else "Waiting for both participants" }.getOrDefault("Waiting for server confirmation") }
                Countdown(countdown, CountdownTone.SOON)
            }
            if (stale) Notice(title = "Connection lost", children = "Displayed times are from the last server update.")
            if (!live && !ended) {
                BasicText("${duration / 60} minutes, fixed · no overtime charge", style = qText("body").copy(color = qColor("ink")))
                BasicText("Shared with $creator", style = qText("label").copy(color = qColor("ink-muted")))
                BasicText(value.getJSONObject("packet").getString("summary"), style = qText("body").copy(color = qColor("ink")))
                BasicText("${value.getJSONObject("packet").getJSONArray("attachmentIds").length()} shared files · ${ZoneId.systemDefault().id}", style = qText("caption").copy(color = qColor("ink-muted")))
                BasicText("Request ${value.getString("commitmentId")}", style = qText("caption").copy(color = qColor("ink-muted")))
                BasicText("Joining early starts nothing. The connected timer pauses during a drop, up to ${value.getLong("reconnectBudgetSeconds") / 60} minutes total.", style = qText("caption").copy(color = qColor("ink-muted")))
                Button("Enter the waiting room", ButtonVariant.SECONDARY, block = true, disabled = busy || stale || role(value) == null) { scope.launch { join() } }
            }
            if (live) {
                transport?.Media() ?: BasicText("Media connection is unavailable.", style = qText("body").copy(color = qColor("ink")))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(if (muted) "Unmute" else "Mute", ButtonVariant.SECONDARY, disabled = busy || stale || transport == null) { scope.launch { try { transport?.microphone(muted); muted = !muted } catch (_: Exception) { notice = "Microphone change failed." } } }
                    Button("Camera", ButtonVariant.SECONDARY, disabled = busy || stale || transport == null || value.getString("mediaMode") != "video") { scope.launch { try { transport?.camera(!camera); camera = !camera } catch (_: Exception) { notice = "Camera change failed." } } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Button("Report", ButtonVariant.SECONDARY) { model.open("/support") }; Button("Leave", ButtonVariant.SECONDARY, disabled = busy || stale || role(value) == null) { leaving = true } }
            }
            if (live || state == "ended") {
                BasicText(if (state == "ended") "Both of you can get a short summary" else "Separate permissions", style = qText("title").copy(color = qColor("ink")))
                val consents = value.getJSONArray("consents")
                fun granted(purpose: String, participant: String?) = (0 until consents.length()).any { val c = consents.getJSONObject(it); c.getString("role") == participant && c.getString("purpose") == purpose && c.getBoolean("granted") }
                listOf("recording", "summary", "content_reuse", "ai_source").filter { state != "ended" || it != "recording" }.forEach { purpose ->
                    val label = when (purpose) { "recording" -> "Allow recording"; "summary" -> "I'd like a summary"; "content_reuse" -> "Allow content reuse"; else -> "Allow use as an AI source" }
                    val allowed = granted(purpose, role(value))
                    Button("$label · ${if (allowed) "On" else "Off"}", ButtonVariant.SECONDARY, block = true, disabled = busy || stale || role(value) == null) { scope.launch { action("consent", JSONObject().put("purpose", purpose).put("granted", !allowed)) } }
                }
                BasicText("Each purpose needs both people's permission. Without recording permission, a summary uses only the packet and a creator-typed note.", style = qText("caption").copy(color = qColor("ink-muted")))
                if (!value.isNull("summary") && listOf("creator", "fan").all { granted("summary", it) }) { BasicText(value.getString("summary"), style = qText("body").copy(color = qColor("ink"))); Button("Delete this summary", ButtonVariant.QUIET, disabled = busy || stale) { scope.launch { action("delete-summary") } } }
                if (value.optString("summaryState") == "pending") BasicText("Summary queued · available when its provider completes.", style = qText("caption").copy(color = qColor("ink-muted")))
            }
            if (state == "ended") {
                BasicText("Call receipt", style = qText("title").copy(color = qColor("ink")))
                BasicText("Connected ${callClock(connected)} of ${callClock(duration * 1000)}", style = qText("body").copy(color = qColor("ink")))
                BasicText(if (value.optBoolean("recordingOccurred")) "Recorded with consent" else "No recording was confirmed", style = qText("caption").copy(color = qColor("ink-muted")))
                Button("View Requests for settlement", ButtonVariant.SECONDARY) { model.open("/requests") }
            }
            if (leaving) {
              Dialog(title = "End this call?", confirm = if (role(value) == "fan") "End by choice" else "End call", cancel = "Stay in the call", onCancel = { leaving = false }, onConfirm = { scope.launch { action("end", if (role(value) == "fan") JSONObject().put("fanChoice", "end_by_choice") else JSONObject()) } }) {
                BasicText("A fan ending by choice counts as a completed call after actual connected time. Technical problems and creator early ends are reconciled before settlement.", style = qText("caption").copy(color = qColor("ink-muted")))
                if (role(value) == "fan") Button("Technical problem", ButtonVariant.SECONDARY, disabled = busy || stale) { scope.launch { action("end", JSONObject().put("fanChoice", "technical_problem")) } }
              }
            }
        }
        notice?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        Button("Refresh call", ButtonVariant.QUIET, disabled = busy || fetching || client == null || route == null) { scope.launch { refresh() } }
    }
}
