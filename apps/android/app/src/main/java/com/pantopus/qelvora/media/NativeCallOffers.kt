package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

private data class NativeOfferDeadline(val id: String, val version: Int, val timestamp: String, val wall: Long, val elapsed: Long) {
    fun current() = System.currentTimeMillis() < wall && android.os.SystemClock.elapsedRealtime() < elapsed
}
private fun offerUuid(value: String) = runCatching { UUID.fromString(value).also { require(it.toString().equals(value, ignoreCase = true)) } }.getOrNull()
private fun offerDate(value: String) = runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
private fun validOffer(value: JSONObject): Boolean = runCatching {
    require(offerUuid(value.getString("id")) != null && offerUuid(value.getString("commitmentId")) != null && value.getInt("version") > 0)
    ZoneId.of(value.getString("fanTimeZone")); ZoneId.of(value.getString("creatorTimeZone"))
    require(offerDate(value.getString("expiresAt")) != null)
    require(value.isNull("selectedSessionId") || offerUuid(value.getString("selectedSessionId")) != null)
    val slots = value.getJSONArray("slots"); val ids = mutableSetOf<UUID>()
    for (index in 0 until slots.length()) {
        val slot = slots.getJSONObject(index); val id = offerUuid(slot.getString("id")) ?: error("Invalid slot")
        require(ids.add(id) && offerDate(slot.getString("startsAt")) != null)
    }
    true
}.getOrDefault(false)
private fun sameOffer(left: JSONObject?, right: JSONObject?): Boolean {
    if (left == null || right == null) return left == right
    return listOf("id", "commitmentId", "version", "state", "creatorTimeZone", "fanTimeZone", "expiresAt", "selectedSessionId", "slots").all { left.opt(it).toString() == right.opt(it).toString() }
}

/** Query selects a screen only; the canonical actor and server transaction authorize every selection. */
@Composable
fun NativeCallDestination(baseURL: String?, model: FanSession) {
    key(baseURL, model.destination, model.session?.accountId, model.session?.sessionId) {
        val parts = model.destination.substringBefore('?').trim('/').split('/')
        val callId = if (parts.size == 2 && parts[0] == "calls") runCatching { UUID.fromString(parts[1]).also { require(it.toString().equals(parts[1], ignoreCase = true)) } }.getOrNull() else null
        if (callId != null) NativeAccountCallLookup(model, callId)
        else if (model.destination.substringAfter('?', "").split('&').contains("offer=1")) NativeCallOffers(baseURL, model)
        else NativeCallScreen(baseURL, model)
    }
}

@Composable
private fun NativeAccountCallLookup(model: FanSession, callId: UUID) {
    var attempt by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var unavailable by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var active by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ -> active = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(model.destination, model.session?.accountId, model.session?.sessionId, attempt, active) {
        if (!active) { loading = false; return@LaunchedEffect }
        loading = true; unavailable = false
        val target = model.destination
        val resolved = model.resolveCallDestination(callId.toString(), target)
        if (model.destination != target) return@LaunchedEffect
        loading = false; unavailable = !resolved
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("w1CallLookupTitle"), modifier = Modifier.semantics { heading() }, style = qText("display-md").copy(color = qColor("ink")))
        if (loading) BasicText(QelvoraCopy.text("w1CallLookupChecking"), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = qText("body").copy(color = qColor("ink")))
        if (unavailable) Notice(tone = "error", children = QelvoraCopy.text("w1CallLookupUnavailable"))
        Button(QelvoraCopy.text("retry"), ButtonVariant.SECONDARY, block = true, disabled = loading || model.busy || !active) { attempt += 1 }
        Button(QelvoraCopy.text("w6OpenRequests"), ButtonVariant.QUIET) { model.open("/requests") }
    }
}

@Composable
private fun NativeCallOffers(baseURL: String?, model: FanSession) {
    val route = remember(model.destination) { CallRoute.from(model.destination) }
    var offer by remember(route) { mutableStateOf<JSONObject?>(null) }
    var chosen by remember(route) { mutableStateOf<String?>(null) }
    var loaded by remember(route) { mutableStateOf(false) }
    var stale by remember(route) { mutableStateOf(true) }
    var busy by remember(route) { mutableStateOf(false) }
    var notice by remember(route) { mutableStateOf<String?>(null) }
    var submission by remember(route) { mutableStateOf<Triple<String, Int, String>?>(null) }
    var deadline by remember(route) { mutableStateOf<NativeOfferDeadline?>(null) }
    var epoch by remember(route) { mutableStateOf(0) }
    var now by remember(route) { mutableStateOf(System.currentTimeMillis()) }
    var command by remember(route) { mutableStateOf<Job?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var active by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    val scope = rememberCoroutineScope()
    val canSelect = model.session?.fan?.id?.lowercase() == route?.fan?.toString()
    fun conceal() {
        epoch++; command?.cancel(); command = null; busy = false; stale = true; loaded = false
        offer = null; chosen = null; notice = null
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ ->
            val resumed = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!resumed && active) conceal()
            active = resumed
        }
        lifecycle.addObserver(observer)
        onDispose { active = false; conceal(); lifecycle.removeObserver(observer) }
    }
    suspend fun current(api: NativeCallRequest, attempt: Int): Boolean {
        if (!active || attempt != epoch) return false
        val issued = api.current()
        return issued && active && attempt == epoch
    }
    suspend fun read(api: NativeCallRequest, route: CallRoute, attempt: Int): JSONObject? {
        if (!current(api, attempt)) throw CancellationException("Call offer view changed")
        val started = android.os.SystemClock.elapsedRealtime()
        val values = api.offers(route)
        if (!current(api, attempt)) throw CancellationException("Call offer view changed")
        require(android.os.SystemClock.elapsedRealtime() - started < 5_000)
        val offers = (0 until values.length()).map { values.getJSONObject(it) }
        require(offers.all(::validOffer))
        return offers.firstOrNull { offerUuid(it.getString("id")) == route.session }
    }
    fun display(timestamp: String, zone: String) = runCatching { DateTimeFormatter.ofPattern("EEEE, MMMM d, HH:mm XXX").withZone(ZoneId.of(zone)).format(Instant.parse(timestamp)) }.getOrDefault(timestamp)
    suspend fun refresh() {
        val route = route ?: return
        if (!active || busy) return
        val attempt = epoch; busy = true
        try {
            val api = NativeCallRequest.capture(baseURL, model, 1_048_576, 4_000) ?: return
            try {
                val next = read(api, route, attempt)
                if (!current(api, attempt)) return
                if (!sameOffer(next, offer)) chosen = null
                if (next != null) {
                    val wall = offerDate(next.getString("expiresAt")) ?: error("Invalid expiry")
                    var elapsed = android.os.SystemClock.elapsedRealtime() + (wall - System.currentTimeMillis()).coerceAtLeast(0)
                    val prior = deadline
                    if (prior != null && prior.id == next.getString("id") && prior.version == next.getInt("version") && prior.timestamp == next.getString("expiresAt")) elapsed = minOf(elapsed, prior.elapsed)
                    deadline = NativeOfferDeadline(next.getString("id"), next.getInt("version"), next.getString("expiresAt"), wall, elapsed)
                } else deadline = null
                offer = next; loaded = true; stale = next?.getString("state") == "offered" && deadline?.current() != true; now = System.currentTimeMillis()
                notice = if (stale) QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") else null
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { if (current(api, attempt)) { offer = null; chosen = null; loaded = true; stale = true; notice = QelvoraCopy.text("w6TheTimesCouldNotBeLoadedReconnectAndTryAgain") } }
        } catch (cancelled: CancellationException) { throw cancelled }
        finally { if (attempt == epoch) busy = false }
    }
    suspend fun select() {
        val route = route ?: return; val value = offer ?: return; val slot = chosen ?: return
        val slots = value.getJSONArray("slots")
        val selectedSlot = (0 until slots.length()).map { slots.getJSONObject(it) }.firstOrNull { it.getString("id") == slot } ?: return
        val starts = offerDate(selectedSlot.getString("startsAt")) ?: return
        if (!active || busy || stale || !canSelect || value.getString("state") != "offered" || deadline?.current() != true || starts <= System.currentTimeMillis()) return
        val attempt = epoch; busy = true; notice = null
        try {
            val api = NativeCallRequest.capture(baseURL, model, 1_048_576, 4_000) ?: return
            try {
                withTimeout(10_000) {
                    val started = android.os.SystemClock.elapsedRealtime()
                    val latest = read(api, route, attempt)
                    if (!current(api, attempt)) return@withTimeout
                    require(android.os.SystemClock.elapsedRealtime() - started < 5_000 && sameOffer(latest, value) && !stale && deadline?.current() == true && starts > System.currentTimeMillis())
                    val version = value.getInt("version")
                    if (submission?.first != slot || submission?.second != version) submission = Triple(slot, version, UUID.randomUUID().toString())
                    val body = JSONObject().put("slotId", slot).put("expectedVersion", version).put("idempotencyKey", submission!!.third)
                    val selected = api.select(route, value.getString("id"), body)
                    if (!current(api, attempt)) return@withTimeout
                    val sessionId = offerUuid(selected.getString("id")) ?: error("Invalid session")
                    require(offerUuid(selected.getString("fanAccountId")) == offerUuid(api.accountId) && offerUuid(selected.getString("commitmentId")) == offerUuid(value.getString("commitmentId")) && offerDate(selected.getString("scheduledAt")) == starts)
                    model.open("/calls/${route.creator}/${route.fan}/$sessionId")
                }
            } catch (_: TimeoutCancellationException) { if (current(api, attempt)) { stale = true; notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") } }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { if (current(api, attempt)) { stale = true; notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") } }
        } catch (cancelled: CancellationException) { throw cancelled }
        finally { if (attempt == epoch) busy = false }
    }
    suspend fun openSelected(id: UUID) {
        val route = route ?: return; val observed = offer ?: return
        if (!active || busy || stale) return
        val attempt = epoch; busy = true
        try {
            val api = NativeCallRequest.capture(baseURL, model, 1_048_576, 4_000) ?: return
            try {
                withTimeout(10_000) {
                    val latest = read(api, route, attempt)
                    if (!current(api, attempt)) return@withTimeout
                    require(latest != null && sameOffer(latest, observed) && latest.getString("state") == "selected" && offerUuid(latest.getString("selectedSessionId")) == id)
                    val session = api.read(route.copy(session = id))
                    if (!current(api, attempt)) return@withTimeout
                    require(offerUuid(session.getString("id")) == id && offerUuid(session.getString("commitmentId")) == offerUuid(observed.getString("commitmentId")) && listOf("creatorAccountId", "fanAccountId").any { offerUuid(session.getString(it)) == offerUuid(api.accountId) })
                    model.open("/calls/${route.creator}/${route.fan}/$id")
                }
            } catch (_: TimeoutCancellationException) { if (current(api, attempt)) { stale = true; notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") } }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { if (current(api, attempt)) { stale = true; notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") } }
        } catch (cancelled: CancellationException) { throw cancelled }
        finally { if (attempt == epoch) busy = false }
    }
    LaunchedEffect(route, baseURL, active) { if (active) while (true) { refresh(); delay(if (loaded) 30_000 else 1_000) } }
    LaunchedEffect(active) {
        if (active) while (true) {
            now = System.currentTimeMillis()
            if (offer?.getString("state") == "offered" && deadline?.current() != true) { chosen = null; stale = true; notice = QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") }
            delay(500)
        }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("w6CALLREQUEST"), style = qText("label").copy(color = qColor("ink-muted")))
        BasicText(QelvoraCopy.text("w6ChooseATime"), style = qText("display-md").copy(color = qColor("ink")))
        val value = offer
        if (value != null && value.getString("state") == "offered" && !stale && active) {
            val zone = value.getString("fanTimeZone"); val slots = value.getJSONArray("slots")
            for (index in 0 until slots.length()) {
                val slot = slots.getJSONObject(index); val id = slot.getString("id")
                Button(display(slot.getString("startsAt"), zone) + if (chosen == id) " · Selected" else "", ButtonVariant.SECONDARY, block = true, disabled = busy || deadline?.current() != true || !canSelect || (offerDate(slot.getString("startsAt")) ?: 0) <= now) { chosen = id }
            }
            BasicText(QelvoraCopy.text("w6YourTime", mapOf("value1" to (zone).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6CreatorSTimeZone", mapOf("value1" to (value.getString("creatorTimeZone")).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6YourAcceptedTermsAndPaymentStayWithTheRequestReceipt"), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6OfferExpirescfe463", mapOf("value1" to (display(value.getString("expiresAt"), zone)).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            Button(QelvoraCopy.text("w6ConfirmThisTime"), ButtonVariant.SECONDARY, block = true, disabled = busy || deadline?.current() != true || chosen == null || !canSelect) { command = scope.launch { select() } }
        } else if (value != null && value.getString("state") == "selected" && !stale && active && !value.isNull("selectedSessionId") && route != null) {
            val selected = offerUuid(value.getString("selectedSessionId"))
            if (selected != null) Button(QelvoraCopy.text("w6OpenYourScheduledCall"), ButtonVariant.SECONDARY, block = true, disabled = busy) { command = scope.launch { openSelected(selected) } }
        } else if (notice == null) BasicText(if (loaded) QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") else QelvoraCopy.text("w6CheckingTheCurrentOfferAndParticipantAccess"), style = qText("body").copy(color = qColor("ink")))
        notice?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        Button(QelvoraCopy.text("w6ReloadCurrentOffer"), ButtonVariant.QUIET, disabled = busy || !active || baseURL == null || route == null) { command = scope.launch { refresh() } }
        Button(QelvoraCopy.text("w6OpenRequests"), ButtonVariant.QUIET) { model.open("/requests") }
    }
}
