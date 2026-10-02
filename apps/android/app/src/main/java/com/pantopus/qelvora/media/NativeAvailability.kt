package com.pantopus.qelvora.media

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URL
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

internal fun availabilityCreator(destination: String): UUID? {
    val parts = destination.removePrefix("/").split('/')
    return if (parts.size == 3 && parts[0] == "studio" && parts[2] == "more" && !destination.contains('?'))
        runCatching { UUID.fromString(parts[1]) }.getOrNull() else null
}
private data class AvailabilityWindow(val startsAt: String, val endsAt: String)
private data class AvailabilitySaved(val version: Int, val zone: String, val windows: List<AvailabilityWindow>)
private data class AvailabilitySave(val version: Int, val zone: String, val windows: List<AvailabilityWindow>, val body: String)

/** Uses the actual account's creator scope. No local identity or call provider. */
@Composable
internal fun NativeAvailabilityDestination(baseURL: String?, model: FanSession) {
    val creator = availabilityCreator(model.destination)
    val account = model.session?.accountId
    key(creator, account, model.session?.sessionId) {
        if (creator != null && account != null) NativeAvailability(baseURL, model, creator, account)
        else BasicText(QelvoraCopy.text("w6MediaAccessExpiredOrIsUnavailable"), style = qText("body").copy(color = qColor("ink")))
    }
}

@Composable
private fun NativeAvailability(baseURL: String?, model: FanSession, creator: UUID, account: String) {
    val client = remember(baseURL, model) { baseURL?.let { NativeMediaClient(URL(it)) { model.currentToken() ?: error("session_required") } } }
    val root = "/v1/w6/creators/$creator/call-availability"
    val focus = LocalFocusManager.current
    var current by remember { mutableStateOf<AvailabilitySaved?>(null) }
    var zone by remember { mutableStateOf("") }
    var windows by remember { mutableStateOf<List<AvailabilityWindow>>(emptyList()) }
    var command by remember { mutableStateOf<AvailabilitySave?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var fresh by remember { mutableStateOf(false) }
    var freshUntil by remember { mutableLongStateOf(0L) }
    var busy by remember { mutableStateOf(false) }
    var replacingSavedWindows by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(true) }
    var notice by remember { mutableStateOf<String?>(null) }
    var confirmRefresh by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val dirty = loaded && (zone != (current?.zone ?: ZoneId.systemDefault().id) || windows != current?.windows.orEmpty())
    fun instant(value: String) = OffsetDateTime.parse(value).toInstant()
    fun decode(bytes: ByteArray): AvailabilitySaved? {
        val text = bytes.toString(Charsets.UTF_8)
        if (text == "null") return null
        val value = JSONObject(text)
        require(value.getString("creatorId") == creator.toString() && value.getInt("version") > 0)
        val rows = value.getJSONArray("windows"); require(rows.length() <= 64)
        return AvailabilitySaved(value.getInt("version"), value.getString("timeZone"), (0 until rows.length()).map {
            val row = rows.getJSONObject(it); AvailabilityWindow(row.getString("startsAt"), row.getString("endsAt"))
        })
    }
    fun authorityLost(failure: NativeMediaRequestError) = failure.status in listOf(401, 404) ||
        (failure.status == 403 && failure.code !in listOf("availability_invalid", "time_zone_invalid", "availability_stale")) || failure.code == "session_account_changed"
    fun clear() { loaded = false; fresh = false; current = null; command = null; windows = emptyList(); zone = "" }
    suspend fun read(replace: Boolean) {
        val api = client ?: return
        if (busy || !active) return; busy = true; replacingSavedWindows = replace
        val started = android.os.SystemClock.elapsedRealtime()
        try {
            val value = decode(api.request(root, expectedAccountId = account, timeoutMs = 4000))
            if (!active || android.os.SystemClock.elapsedRealtime() >= started + 5000) return
            freshUntil = started + 5000; fresh = true
            if (notice == QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded")) notice = null
            if (replace || !loaded || (!dirty && command == null && value?.version != current?.version)) { current = value; zone = value?.zone ?: ZoneId.systemDefault().id; windows = value?.windows.orEmpty(); loaded = true; notice = null }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: NativeMediaRequestError) { fresh = false; if (authorityLost(failure)) clear(); notice = QelvoraCopy.text(if (failure.code == "session_account_changed") "w6AvailabilityAccountChanged" else "w6AvailabilityCouldNotBeLoaded") }
        catch (_: Exception) { fresh = false; notice = QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded") }
        finally { busy = false; replacingSavedWindows = false }
    }
    suspend fun save() {
        val api = client ?: return
        if (busy || !loaded || !active) return; busy = true
        try {
            if (command == null) {
                try { ZoneId.of(zone); windows.forEach { instant(it.startsAt); instant(it.endsAt) } }
                catch (_: Exception) { notice = QelvoraCopy.text("w6UseISOTimesWithAnExplicitUTCOffsetForEach"); return }
                val version = current?.version ?: 0
                val normalized = windows.map { AvailabilityWindow(instant(it.startsAt).toString(), instant(it.endsAt).toString()) }
                val rows = JSONArray(normalized.map { JSONObject().put("startsAt", it.startsAt).put("endsAt", it.endsAt) })
                command = AvailabilitySave(version, zone, normalized, JSONObject().put("timeZone", zone).put("windows", rows).put("expectedVersion", version).put("idempotencyKey", UUID.randomUUID().toString()).toString())
            }
            val sent = command ?: return
            val value = decode(api.request(root, "PUT", sent.body.toByteArray(), expectedAccountId = account)) ?: error("receipt_required")
            val normalized = sent.windows.sortedBy { instant(it.startsAt) }
            require(value.version == sent.version + 1 && ZoneId.of(value.zone).rules == ZoneId.of(sent.zone).rules && value.windows.size == normalized.size &&
                value.windows.zip(normalized).all { (a, b) -> instant(a.startsAt) == instant(b.startsAt) && instant(a.endsAt) == instant(b.endsAt) })
            if (!active) return
            command = null; current = value; zone = value.zone; windows = value.windows; freshUntil = android.os.SystemClock.elapsedRealtime() + 5000; fresh = true; notice = QelvoraCopy.text("w6AvailabilitySaved")
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: NativeMediaRequestError) {
            if (failure.status in listOf(400, 401, 403, 404, 409, 422)) command = null
            if (authorityLost(failure)) clear()
            notice = QelvoraCopy.text(if (failure.code == "session_account_changed") "w6AvailabilityAccountChanged" else if (command == null) "w6AvailabilityCouldNotBeSavedYourChangesAreKept" else "w6AvailabilitySaveIsUnconfirmed")
        } catch (_: Exception) { notice = QelvoraCopy.text(if (command == null) "w6AvailabilityCouldNotBeSavedYourChangesAreKept" else "w6AvailabilitySaveIsUnconfirmed") }
        finally { busy = false }
    }
    DisposableEffect(lifecycle) {
        active = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) active = true else if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) { active = false; fresh = false } }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); active = false; fresh = false }
    }
    LaunchedEffect(client, active) { while (active) { read(false); delay(4000) } }
    LaunchedEffect(freshUntil) { delay((freshUntil - android.os.SystemClock.elapsedRealtime()).coerceAtLeast(0)); fresh = false }
    @Composable fun field(label: String, value: String, change: (String) -> Unit) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicText(label, style = qText("caption").copy(color = qColor("ink-muted")))
            BasicTextField(value, { change(it.take(80)) }, Modifier.fillMaxWidth().heightIn(min = 48.dp).background(qColor("surface")).padding(12.dp).semantics { contentDescription = label }, enabled = !replacingSavedWindows && command == null, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }), textStyle = qText("body").copy(color = qColor("ink")))
        }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("w6CallAvailability"), Modifier.semantics { heading() }, style = qText("display-md").copy(color = qColor("ink")))
        BasicText(QelvoraCopy.text("w6UseDatedWindowsEachOfferedCallAndItsReconnectAllowance"), style = qText("caption").copy(color = qColor("ink-muted")))
        if (fresh && active) {
            field(QelvoraCopy.text("w6YourTimeZone"), zone) { zone = it }
            windows.forEachIndexed { index, value ->
                BasicText(QelvoraCopy.text("w6Window", mapOf("value1" to (index + 1).toString())), style = qText("label").copy(color = qColor("ink")))
                field(QelvoraCopy.text("w6Starts"), value.startsAt) { text -> windows = windows.mapIndexed { i, row -> if (i == index) row.copy(startsAt = text) else row } }
                field(QelvoraCopy.text("w6Ends"), value.endsAt) { text -> windows = windows.mapIndexed { i, row -> if (i == index) row.copy(endsAt = text) else row } }
                Button(QelvoraCopy.text("w6RemoveWindow", mapOf("value1" to (index + 1).toString())), ButtonVariant.QUIET, disabled = busy || command != null) { windows = windows.filterIndexed { i, _ -> i != index } }
            }
            if (windows.isEmpty()) BasicText(QelvoraCopy.text("w6NoWindowsSaved"), style = qText("caption").copy(color = qColor("ink-muted")))
            Button(QelvoraCopy.text("w6AddAWindow"), ButtonVariant.SECONDARY, disabled = busy || command != null || windows.size >= 64) { windows = windows + AvailabilityWindow("", "") }
        }
        notice?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        Button(QelvoraCopy.text(if (command == null) "w6SaveAvailability" else "w6RetryAvailabilitySave"), ButtonVariant.SECONDARY, block = true, disabled = busy || !loaded || (!fresh && command == null) || !active) { scope.launch { save() } }
        Button(QelvoraCopy.text("w6ReloadSavedWindows"), ButtonVariant.QUIET, disabled = busy || command != null) { if (dirty) confirmRefresh = true else scope.launch { read(true) } }
    }
    if (confirmRefresh) Dialog(onDismissRequest = { confirmRefresh = false }) {
        Column(Modifier.background(qColor("surface")).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            BasicText(QelvoraCopy.text("w6RefreshWillReplaceAvailabilityChanges"), style = qText("body").copy(color = qColor("ink")))
            Button(QelvoraCopy.text("confirm"), ButtonVariant.SECONDARY) { confirmRefresh = false; scope.launch { read(true) } }
            Button(QelvoraCopy.text("cancel"), ButtonVariant.QUIET) { confirmRefresh = false }
        }
    }
}
