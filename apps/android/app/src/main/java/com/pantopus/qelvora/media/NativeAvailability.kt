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
import com.pantopus.qelvora.generated.CreatorAPIError
import com.pantopus.qelvora.generated.APICallAvailabilityCommand
import com.pantopus.qelvora.generated.APICallAvailabilityCommandWindowsItem
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URI
import java.time.OffsetDateTime
import java.time.ZoneId
import java.util.UUID
import org.json.JSONObject
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal fun availabilityCreator(destination: String): UUID? {
    val parts = destination.removePrefix("/").split('/')
    return if (parts.size == 3 && parts[0] == "studio" && parts[2] == "more" && !destination.contains('?'))
        runCatching { UUID.fromString(parts[1]) }.getOrNull() else null
}
private data class AvailabilityWindow(val startsAt: String, val endsAt: String)
private data class AvailabilitySaved(val version: Int, val zone: String, val windows: List<AvailabilityWindow>)
private data class AvailabilitySave(val version: Int, val zone: String, val windows: List<AvailabilityWindow>, val body: APICallAvailabilityCommand)

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
    val destination = remember(model) { model.destination }
    var request by remember(model, destination) { mutableStateOf<FanSessionRequestCapture?>(null) }
    var generation by remember { mutableIntStateOf(0) }
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
        require(value.getString("creatorId") == creator.toString() && value.getLong("version") in 1L..Int.MAX_VALUE.toLong())
        val rows = value.getJSONArray("windows"); require(rows.length() <= 64)
        return AvailabilitySaved(value.getInt("version"), value.getString("timeZone"), (0 until rows.length()).map {
            val row = rows.getJSONObject(it); AvailabilityWindow(row.getString("startsAt"), row.getString("endsAt"))
        })
    }
    fun authorityLost(failure: NativeMediaRequestError) = failure.status in listOf(401, 404) ||
        (failure.status == 403 && failure.code !in listOf("availability_invalid", "time_zone_invalid", "availability_stale")) || failure.code == "session_account_changed"
    fun clear() { loaded = false; fresh = false; current = null; command = null; windows = emptyList(); zone = "" }
    fun clearCapture() { generation++; request = null; clear() }
    suspend fun currentRequest(captured: FanSessionRequestCapture, epoch: Int): Boolean {
        if (!active || epoch != generation || request !== captured) return false
        val valid = captured.isCurrent()
        return valid && active && epoch == generation && request === captured
    }
    suspend fun readCapture(): FanSessionRequestCapture? {
        request?.let { if (it.isCurrent()) return it }
        if (request != null) clearCapture()
        val origin = baseURL?.let(::URI) ?: return null
        require(origin.scheme == "https" || (origin.scheme == "http" && origin.host in listOf("localhost", "127.0.0.1", "10.0.2.2")))
        require(origin.userInfo == null)
        val captured = model.captureRequest(destination, maximumResponseBytes = 1_048_576, timeoutMs = 4000) ?: return null
        if (!active || captured.expectedAccountId != account) return null
        request = captured; return captured
    }
    fun failure(value: CreatorAPIError) = NativeMediaRequestError(value.status, runCatching { JSONObject(value.body).optJSONObject("error")?.optString("code")?.takeIf { it.isNotEmpty() } }.getOrNull())
    suspend fun read(replace: Boolean) {
        if (busy || !active) return
        val captured = try { readCapture() } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { fresh = false; notice = QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded"); return }
        if (captured == null) { fresh = false; return }
        if (busy || !active) return
        val epoch = generation
        busy = true; replacingSavedWindows = replace
        val started = android.os.SystemClock.elapsedRealtime()
        try {
            if (!currentRequest(captured, epoch)) return
            val receipt = captured.client.readCreatorCallAvailability(creator.toString(), captured.expectedAccountId)
            if (!currentRequest(captured, epoch)) return
            val value = decode(Json.encodeToString(receipt).toByteArray(Charsets.UTF_8))
            if (!active || android.os.SystemClock.elapsedRealtime() >= started + 5000) return
            freshUntil = started + 5000; fresh = true
            if (notice == QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded")) notice = null
            // The polling effect outlives recompositions. Read the current state here;
            // its initially captured `dirty` value cannot protect later edits.
            val hasEdits = loaded && (zone != (current?.zone ?: ZoneId.systemDefault().id) || windows != current?.windows.orEmpty())
            if (replace || !loaded || (!hasEdits && command == null && value?.version != current?.version)) { current = value; zone = value?.zone ?: ZoneId.systemDefault().id; windows = value?.windows.orEmpty(); loaded = true; notice = null }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (refused: CreatorAPIError) {
            if (!currentRequest(captured, epoch)) return
            val failure = failure(refused)
            fresh = false; if (authorityLost(failure)) clear(); notice = QelvoraCopy.text(if (failure.code == "session_account_changed") "w6AvailabilityAccountChanged" else "w6AvailabilityCouldNotBeLoaded")
        }
        catch (_: Exception) { if (currentRequest(captured, epoch)) { fresh = false; notice = QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded") } }
        finally { busy = false; replacingSavedWindows = false }
    }
    suspend fun save() {
        if (busy || !loaded || !active) return
        val captured = request ?: return; val epoch = generation
        if (!currentRequest(captured, epoch)) { if (request === captured && epoch == generation) clearCapture(); return }
        if (busy || !loaded || !active) return
        busy = true
        try {
            if (command == null) {
                try { ZoneId.of(zone); windows.forEach { instant(it.startsAt); instant(it.endsAt) } }
                catch (_: Exception) { notice = QelvoraCopy.text("w6UseISOTimesWithAnExplicitUTCOffsetForEach"); return }
                val version = current?.version ?: 0
                val normalized = windows.map { AvailabilityWindow(instant(it.startsAt).toString(), instant(it.endsAt).toString()) }
                val original = APICallAvailabilityCommand(zone, normalized.map { APICallAvailabilityCommandWindowsItem(it.startsAt, it.endsAt) }, version.toLong(), UUID.randomUUID().toString())
                command = AvailabilitySave(version, zone, normalized, original)
            }
            val sent = command ?: return
            if (!currentRequest(captured, epoch)) return
            val receipt = captured.client.saveCreatorCallAvailability(creator.toString(), sent.body, captured.expectedAccountId)
            if (!currentRequest(captured, epoch)) return
            val value = decode(Json.encodeToString(receipt).toByteArray(Charsets.UTF_8)) ?: error("receipt_required")
            val normalized = sent.windows.sortedBy { instant(it.startsAt) }
            require(value.version == sent.version + 1 && ZoneId.of(value.zone).rules == ZoneId.of(sent.zone).rules && value.windows.size == normalized.size &&
                value.windows.zip(normalized).all { (a, b) -> instant(a.startsAt) == instant(b.startsAt) && instant(a.endsAt) == instant(b.endsAt) })
            if (!active) return
            command = null; current = value; zone = value.zone; windows = value.windows; freshUntil = android.os.SystemClock.elapsedRealtime() + 5000; fresh = true; notice = QelvoraCopy.text("w6AvailabilitySaved")
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (refused: CreatorAPIError) {
            if (!currentRequest(captured, epoch)) return
            val failure = failure(refused)
            if (failure.status in listOf(400, 401, 403, 404, 409, 422)) command = null
            if (authorityLost(failure)) clear()
            notice = QelvoraCopy.text(if (failure.code == "session_account_changed") "w6AvailabilityAccountChanged" else if (command == null) "w6AvailabilityCouldNotBeSavedYourChangesAreKept" else "w6AvailabilitySaveIsUnconfirmed")
        } catch (_: Exception) { if (currentRequest(captured, epoch)) notice = QelvoraCopy.text(if (command == null) "w6AvailabilityCouldNotBeSavedYourChangesAreKept" else "w6AvailabilitySaveIsUnconfirmed") }
        finally { busy = false }
    }
    DisposableEffect(lifecycle) {
        active = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) active = true else if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) { generation++; active = false; fresh = false } }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); generation++; active = false; fresh = false; request = null }
    }
    LaunchedEffect(model, destination, active) { while (active) { read(false); delay(4000) } }
    LaunchedEffect(model, destination) { while (true) {
        val captured = request
        if (captured != null && !captured.isCurrent() && request === captured) clearCapture()
        if (android.os.SystemClock.elapsedRealtime() >= freshUntil) fresh = false
        delay(250)
    } }
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
