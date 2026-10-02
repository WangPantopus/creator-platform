package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.CreatorAPIError
import com.pantopus.qelvora.generated.APIError
import kotlinx.serialization.json.Json

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONObject

internal data class CallRoute(val creator: UUID, val fan: UUID, val session: UUID) {
    val path get() = "/v1/w6/threads/$creator/$fan/calls/$session"
    companion object { fun from(destination: String): CallRoute? = runCatching { val parts = destination.substringBefore('?').trim('/').split('/'); require(parts.size == 4 && parts[0] == "calls"); CallRoute(UUID.fromString(parts[1]), UUID.fromString(parts[2]), UUID.fromString(parts[3])) }.getOrNull() }
}
data class CallAdmission(val token: String, val url: String, val nonce: String, val sessionId: String, val accountId: String, val expiresAt: String, val role: String)
/** Genuine SDK transport owns media; the default composition also owns Telecom
 * and foreground lifetime. Current server admission is still required. */
interface NativeCallScreenTransport {
    @Composable fun Media()
    suspend fun connect(admission: CallAdmission, camera: Boolean, onState: (String) -> Unit)
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
    var mediaEpoch by remember(route) { mutableStateOf(0) }
    var active by remember(route) { mutableStateOf(true) }
    var automaticRefresh by remember(route) { mutableStateOf(true) }
    var pollDelay by remember(route) { mutableStateOf(1000L) }
    var refreshVersion by remember(route) { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val devicePermissions = rememberNativeMediaDevicePermissions()
    val lifecycle = LocalLifecycleOwner.current
    var foreground by remember(lifecycle) { mutableStateOf(lifecycle.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    fun disconnectMedia() { mediaEpoch++; val current = transport; transport = null; localState = "disconnected"; current?.disconnect() }
    fun role(value: JSONObject): String? = when (model.session?.accountId) { value.getString("creatorAccountId") -> "creator"; value.getString("fanAccountId") -> "fan"; else -> null }
    suspend fun refresh() {
        val api = NativeCallRequest.capture(baseURL, model) ?: return; val currentRoute = route ?: return
        if (busy || fetching) return; fetching = true
        val account = model.session?.accountId
        if (account == null) { automaticRefresh = false; fetching = false; return }
        try {
            val value = api.read(currentRoute)
            require(UUID.fromString(value.getString("id")) == currentRoute.session)
            if (!active || !api.current() || account != model.session?.accountId) return
            if (value.getInt("version") >= (call?.getInt("version") ?: 0)) call = value
            stale = false
            notice = null
            pollDelay = if (value.getString("state") in listOf("ended", "cancelled")) 30000L else 1000L
            if (value.getString("state") in listOf("ending", "ended", "cancelled")) disconnectMedia()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) {
            if (!active || !api.current() || account != model.session?.accountId) return
            if (error is CreatorAPIError && error.status in listOf(401, 403, 404, 409)) { disconnectMedia(); call = null; automaticRefresh = false }
            if (error is CreatorAPIError && (runCatching { Json.decodeFromString<APIError>(error.body).error.code }.getOrNull()) in listOf("calls_unconfigured", "call_control_unconfigured", "call_provider_unconfigured", "call_admission_unverified", "call_control_role_invalid")) automaticRefresh = false
            pollDelay = minOf(pollDelay * 2, 30000L)
            stale = true; notice = QelvoraCopy.text("w6ReconnectToRefreshThisCallActionsAreUnavailableUntilAccess")
        }
        finally { fetching = false }
    }
    suspend fun action(name: String, body: JSONObject = JSONObject()) {
        val value = call ?: return; val api = NativeCallRequest.capture(baseURL, model) ?: return; val currentRoute = route ?: return
        if (busy || stale || role(value) == null) return; busy = true; notice = null
        try {
            body.put("expectedVersion", value.getInt("version")).put("idempotencyKey", UUID.randomUUID().toString())
            val returned = api.action(currentRoute, name, body)
            if (!active || !api.current()) return
            require(UUID.fromString(returned.getString("id")) == currentRoute.session)
            call = returned
            if (name == "end") { disconnectMedia(); leaving = false }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (active && api.current()) { notice = QelvoraCopy.text("w6ThisActionCouldNotCompleteRefreshTheCallBeforeTrying"); stale = true } }
        finally { busy = false }
    }
    suspend fun join() {
        val value = call ?: return; val api = NativeCallRequest.capture(baseURL, model) ?: return; val currentRoute = route ?: return
        if (!active || busy || stale || role(value) == null || (transport != null && localState != "disconnected")) return
        val adapter = NativeCallTransports.create?.invoke(currentRoute.session) ?: TelecomNativeCallTransport(
            context, currentRoute.session, api.destination, api::current,
        ) { sessionId ->
            if (sessionId != currentRoute.session || !api.current()) false
            else {
                val current = api.read(currentRoute)
                UUID.fromString(current.getString("id")) == sessionId &&
                    api.accountId in listOf(current.getString("creatorAccountId"), current.getString("fanAccountId")) &&
                    current.getString("state") !in listOf("ending", "ended", "cancelled") &&
                    Instant.parse(current.getString("hardEndAt")).isAfter(Instant.now()) && api.current()
            }
        }
        busy = true; notice = null
        mediaEpoch++; val epoch = mediaEpoch
        val account = model.session?.accountId
        val wantsCamera = value.getString("mediaMode") == "video"
        try {
            if (!devicePermissions.request(wantsCamera)) {
                if (active && epoch == mediaEpoch) notice = QelvoraCopy.text(if (wantsCamera) "w6CameraOrMicrophoneAccessIsOffOrUnavailableCheckYour" else "w6MicrophoneAccessIsOffAllowItInSettingsThenTry")
                return
            }
            if (!active || epoch != mediaEpoch || !api.current() || account != model.session?.accountId) return
            val response = api.join(currentRoute)
            if (!active || epoch != mediaEpoch || !api.current()) return
            val admission = CallAdmission(response.getString("token"), response.getString("url"), response.getString("nonce"), response.getString("sessionId"), response.getString("accountId"), response.getString("expiresAt"), response.getString("role"))
            require(UUID.fromString(admission.sessionId) == currentRoute.session && admission.accountId == model.session?.accountId && admission.role == role(value))
            UUID.fromString(admission.nonce)
            val expires = Instant.parse(admission.expiresAt)
            require(expires.isAfter(Instant.now()))
            val admitted = api.redeem(currentRoute, admission.nonce)
            if (!active || epoch != mediaEpoch || !api.current()) return
            require(admitted && expires.isAfter(Instant.now()) && admission.accountId == model.session?.accountId)
            transport = adapter; camera = wantsCamera
            adapter.connect(admission, camera) { state -> scope.launch { if (active && epoch == mediaEpoch && api.current()) localState = state } }
            if (!active || epoch != mediaEpoch || !api.current()) adapter.disconnect()
        } catch (cancelled: CancellationException) { adapter.disconnect(); throw cancelled }
        catch (_: Exception) { adapter.disconnect(); if (active && epoch == mediaEpoch && api.current()) { transport = null; localState = "disconnected"; notice = QelvoraCopy.text("w6ConnectionFailedRejoinTheSameCall") } }
        finally { busy = false }
    }
    suspend fun changeMicrophone() {
        val current = transport ?: return; val api = NativeCallRequest.capture(baseURL, model) ?: return
        val epoch = mediaEpoch; val enabled = muted
        try { current.microphone(enabled); if (active && epoch == mediaEpoch && api.current()) muted = !enabled }
        catch (_: Exception) { if (active && epoch == mediaEpoch && api.current()) notice = QelvoraCopy.text("w6MicrophoneChangeFailed") }
    }
    suspend fun changeCamera() {
        val current = transport ?: return; val api = NativeCallRequest.capture(baseURL, model) ?: return
        val epoch = mediaEpoch; val enabled = !camera
        try { current.camera(enabled); if (active && epoch == mediaEpoch && api.current()) camera = enabled }
        catch (_: Exception) { if (active && epoch == mediaEpoch && api.current()) notice = QelvoraCopy.text("w6CameraChangeFailed") }
    }
    LaunchedEffect(route, baseURL, model.session?.accountId, model.session?.sessionId, foreground, refreshVersion) {
        if (!foreground) return@LaunchedEffect
        automaticRefresh = true; pollDelay = 1000L
        while (automaticRefresh) { refresh(); if (automaticRefresh) delay(pollDelay) }
    }
    DisposableEffect(route) { active = true; onDispose { active = false; devicePermissions.cancel(); disconnectMedia() } }
    DisposableEffect(route, lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) foreground = true
            if (event == Lifecycle.Event.ON_STOP) foreground = false
            if (event == Lifecycle.Event.ON_STOP && transport == null) {
                mediaEpoch++; devicePermissions.cancel()
            }
        }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(model.session?.accountId) { devicePermissions.cancel(); disconnectMedia(); call = null; stale = true }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val value = call
        if (value == null) {
            BasicText(QelvoraCopy.text(if (route != null && notice == null) "w6OpeningYourCall" else "w6ThisCallIsUnavailable"), style = qText("display-md").copy(color = qColor("ink")))
            if (route == null || notice == null) BasicText(if (route == null) QelvoraCopy.text("w6OpenThisCallFromItsAuthorizedRequestLink") else QelvoraCopy.text("w6CheckingTheBookingAndParticipantAccess"), style = qText("body").copy(color = qColor("ink")))
        } else {
            val state = value.getString("state"); val live = state in listOf("connected", "reconnecting", "ending"); val ended = state in listOf("ended", "cancelled")
            val creator = value.getString("creatorName"); val duration = value.getLong("durationSeconds"); val connected = value.getLong("connectedMilliseconds")
            val recording = value.getString("recordingState")
            if (live) CallChip(name = creator, time = callClock(connected), end = callClock(duration * 1000), recording = recording in listOf("on", "stopping"))
            else {
                BasicText(QelvoraCopy.text("w6MINUTECALL", mapOf("value1" to (duration / 60).toString(), "value2" to value.getString("mediaMode").uppercase())), style = qText("label").copy(color = qColor("ink-muted")))
                val title = if (state == "cancelled") QelvoraCopy.text("w6ThisCallWasCancelled") else if (ended) { if (value.optString("outcome") == "completed") QelvoraCopy.text("w6YouSpokeWithForMinutesa8bf6c", mapOf("value1" to (creator).toString(), "value2" to (connected / 60_000).toString())) else QelvoraCopy.text("w6CallOutcome", mapOf("value1" to (value.optString("outcome", QelvoraCopy.text("w6BeingReconciled")).replace('_', ' ')).toString())) } else QelvoraCopy.text("w6With", mapOf("value1" to runCatching { DateTimeFormatter.ofPattern("EEEE, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(value.getString("scheduledAt"))) }.getOrDefault(value.getString("scheduledAt")), "value2" to creator))
                BasicText(title, style = qText("display-md").copy(color = qColor("ink")))
            }
            if (!ended && !(state == "connected" && localState == "connected")) {
                val countdown = when (state) { "reconnecting" -> QelvoraCopy.text("w6ReconnectingAllowanceLeft", mapOf("value1" to (callClock(value.getLong("reconnectBudgetSeconds") * 1000 - value.getLong("reconnectUsedMilliseconds"))).toString())); "ending" -> QelvoraCopy.text("w6EndingConfirmingProviderHistory"); else -> runCatching { val remaining = Instant.parse(value.getString("scheduledAt")).toEpochMilli() - Instant.parse(value.getString("serverNow")).toEpochMilli(); if (remaining > 0) QelvoraCopy.text("w6StartsIn", mapOf("value1" to (callClock(remaining)).toString())) else QelvoraCopy.text("w6WaitingForBothParticipants") }.getOrDefault(QelvoraCopy.text("w6WaitingForServerConfirmation")) }
                Countdown(countdown, CountdownTone.SOON)
            }
            if (stale) Notice(title = QelvoraCopy.text("w6ConnectionLost"), children = QelvoraCopy.text("w6DisplayedTimesAreFromTheLastServerUpdate"))
            if (recording in listOf("starting", "stopping", "blocked")) BasicText(when (recording) { "stopping" -> QelvoraCopy.text("w6RecordingStopRequestedAwaitingProviderConfirmation"); "starting" -> QelvoraCopy.text("w6RecordingStartRequestedAwaitingProviderConfirmation"); else -> QelvoraCopy.text("w6RecordingStatusNeedsConfirmation") }, style = qText("caption").copy(color = qColor("ink-muted")))
            if (!live && !ended) {
                BasicText(QelvoraCopy.text("w6MinutesFixedNoOvertimeCharge", mapOf("value1" to (duration / 60).toString())), style = qText("body").copy(color = qColor("ink")))
                BasicText(QelvoraCopy.text("w6SharedWith", mapOf("value1" to (creator).toString())), style = qText("label").copy(color = qColor("ink-muted")))
                BasicText(value.getJSONObject("packet").getString("summary"), style = qText("body").copy(color = qColor("ink")))
                BasicText(QelvoraCopy.text("w6SharedFilesInZone", mapOf("value1" to value.getJSONObject("packet").getJSONArray("attachmentIds").length().toString(), "value2" to ZoneId.systemDefault().id)), style = qText("caption").copy(color = qColor("ink-muted")))
                BasicText(QelvoraCopy.text("w6Requestfc03f5", mapOf("value1" to (value.getString("commitmentId")).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
                BasicText(QelvoraCopy.text("w6JoiningEarlyStartsNothingTheConnectedTimerPausesDuringA", mapOf("value1" to (value.getLong("reconnectBudgetSeconds") / 60).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
                Button(QelvoraCopy.text("w6EnterTheWaitingRoom"), ButtonVariant.SECONDARY, block = true, disabled = busy || stale || role(value) == null) { scope.launch { join() } }
            }
            if (live) {
                transport?.Media() ?: BasicText(QelvoraCopy.text("w6MediaConnectionIsUnavailable"), style = qText("body").copy(color = qColor("ink")))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(if (muted) QelvoraCopy.text("w6Unmute") else QelvoraCopy.text("w6Mute"), ButtonVariant.SECONDARY, disabled = busy || stale || transport == null) { scope.launch { changeMicrophone() } }
                    Button(QelvoraCopy.text("w6Camera"), ButtonVariant.SECONDARY, disabled = busy || stale || transport == null || value.getString("mediaMode") != "video") { scope.launch { changeCamera() } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Button(QelvoraCopy.text("w6Report"), ButtonVariant.SECONDARY) { model.open("/support") }; Button(QelvoraCopy.text("w6Leave"), ButtonVariant.SECONDARY, disabled = busy || stale || role(value) == null) { leaving = true } }
            }
            if (live || ended) {
                BasicText(if (state == "ended") QelvoraCopy.text("w6BothOfYouCanGetAShortSummary") else QelvoraCopy.text("w6SeparatePermissions"), style = qText("title").copy(color = qColor("ink")))
                val consents = value.getJSONArray("consents")
                fun granted(purpose: String, participant: String?) = (0 until consents.length()).any { val c = consents.getJSONObject(it); c.getString("role") == participant && c.getString("purpose") == purpose && c.getBoolean("granted") }
                listOf("recording", "summary", "content_reuse", "ai_source").filter { purpose ->
                    if (state == "cancelled") granted(purpose, role(value))
                    else purpose != "recording" || state !in listOf("ending", "ended") || granted(purpose, role(value))
                }.forEach { purpose ->
                    val label = when (purpose) { "recording" -> QelvoraCopy.text("w6AllowRecording"); "summary" -> QelvoraCopy.text("w6IDLikeASummary"); "content_reuse" -> QelvoraCopy.text("w6AllowContentReuse"); else -> QelvoraCopy.text("w6AllowUseAsAnAISource") }
                    val allowed = granted(purpose, role(value))
                    Button(QelvoraCopy.text("w6ControlStatus", mapOf("label" to label, "state" to if (allowed) QelvoraCopy.text("w6On") else QelvoraCopy.text("w6Off"))), ButtonVariant.SECONDARY, block = true, disabled = busy || stale || role(value) == null) { scope.launch { action("consent", JSONObject().put("purpose", purpose).put("granted", !allowed)) } }
                }
                BasicText(QelvoraCopy.text("w6EachPurposeNeedsBothPeopleSPermissionWithoutRecordingPermission8487ed"), style = qText("caption").copy(color = qColor("ink-muted")))
                if (!value.isNull("summary") && listOf("creator", "fan").all { granted("summary", it) }) { BasicText(value.getString("summary"), style = qText("body").copy(color = qColor("ink"))); Button(QelvoraCopy.text("w6DeleteThisSummary"), ButtonVariant.QUIET, disabled = busy || stale) { scope.launch { action("delete-summary") } } }
                if (value.optString("summaryState") == "pending") BasicText(QelvoraCopy.text("w6SummaryQueuedAvailableWhenItsProviderCompletes"), style = qText("caption").copy(color = qColor("ink-muted")))
            }
            if (state == "ended") {
                BasicText(QelvoraCopy.text("w6CallReceipt"), style = qText("title").copy(color = qColor("ink")))
                BasicText(QelvoraCopy.text("w6ConnectedOf", mapOf("value1" to (callClock(connected)).toString(), "value2" to (callClock(duration * 1000)).toString())), style = qText("body").copy(color = qColor("ink")))
                BasicText(if (value.optBoolean("recordingOccurred")) QelvoraCopy.text("w6RecordingOccurredCheckTheConsentHistory") else QelvoraCopy.text("w6NoRecordingWasConfirmed"), style = qText("caption").copy(color = qColor("ink-muted")))
                Button(QelvoraCopy.text("w6ViewRequestsForSettlement"), ButtonVariant.SECONDARY) { model.open("/requests") }
            }
            if (leaving) {
              Dialog(title = QelvoraCopy.text("w6EndThisCall"), confirm = if (role(value) == "fan") QelvoraCopy.text("w6EndByChoice") else QelvoraCopy.text("w6EndCall"), cancel = QelvoraCopy.text("w6StayInTheCall"), onCancel = { leaving = false }, onConfirm = { scope.launch { action("end", if (role(value) == "fan") JSONObject().put("fanChoice", "end_by_choice") else JSONObject()) } }) {
                BasicText(QelvoraCopy.text("w6AFanEndingByChoiceCountsAsACompletedCall"), style = qText("caption").copy(color = qColor("ink-muted")))
                if (role(value) == "fan") Button(QelvoraCopy.text("w6TechnicalProblem"), ButtonVariant.SECONDARY, disabled = busy || stale) { scope.launch { action("end", JSONObject().put("fanChoice", "technical_problem")) } }
              }
            }
        }
        notice?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        Button(QelvoraCopy.text("w6RefreshCall"), ButtonVariant.QUIET, disabled = busy || fetching || baseURL == null || route == null) { refreshVersion++ }
    }
}
