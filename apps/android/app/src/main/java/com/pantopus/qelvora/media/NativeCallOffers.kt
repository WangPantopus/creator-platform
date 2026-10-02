package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.QelvoraCopy

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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/** Query selects a screen only; the canonical actor and server transaction authorize every selection. */
@Composable
fun NativeCallDestination(baseURL: String?, model: FanSession) {
    key(baseURL, model.destination, model.session?.accountId, model.session?.sessionId) {
        if (model.destination.substringAfter('?', "").split('&').contains("offer=1")) NativeCallOffers(baseURL, model)
        else NativeCallScreen(baseURL, model)
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
    val scope = rememberCoroutineScope()
    val root = route?.let { "/v1/w6/threads/${it.creator}/${it.fan}/call-offers" }
    val canSelect = model.session?.fan?.id?.lowercase() == route?.fan?.toString()
    fun display(timestamp: String, zone: String) = runCatching { DateTimeFormatter.ofPattern("EEEE, MMMM d, HH:mm XXX").withZone(ZoneId.of(zone)).format(Instant.parse(timestamp)) }.getOrDefault(timestamp)
    suspend fun refresh() {
        val api = NativeCallRequest.capture(baseURL, model) ?: return; val path = root ?: return; val current = route ?: return
        if (busy) return; busy = true
        try {
            val values = JSONArray(api.request(path).toString(Charsets.UTF_8))
            val next = (0 until values.length()).map { values.getJSONObject(it) }.firstOrNull { it.getString("id").lowercase() == current.session.toString() }
            if (next?.optInt("version") != offer?.optInt("version")) chosen = null
            offer = next; loaded = true; stale = false; notice = null
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (api.current()) { loaded = true; stale = true; notice = QelvoraCopy.text("w6TheTimesCouldNotBeLoadedReconnectAndTryAgain") } }
        finally { busy = false }
    }
    suspend fun select() {
        val api = NativeCallRequest.capture(baseURL, model) ?: return; val path = root ?: return; val current = route ?: return; val value = offer ?: return; val slot = chosen ?: return
        if (busy || stale || !canSelect) return; busy = true; notice = null
        try {
            val version = value.getInt("version")
            if (submission?.first != slot || submission?.second != version) submission = Triple(slot, version, UUID.randomUUID().toString())
            val command = JSONObject().put("slotId", slot).put("expectedVersion", version).put("idempotencyKey", submission!!.third)
            val selected = JSONObject(api.request("$path/${value.getString("id")}/select", "POST", command.toString().toByteArray()).toString(Charsets.UTF_8))
            val sessionId = UUID.fromString(selected.getString("id"))
            if (api.current()) model.open("/calls/${current.creator}/${current.fan}/$sessionId")
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (api.current()) notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") }
        finally { busy = false }
    }
    LaunchedEffect(route, baseURL) { while (true) { refresh(); delay(30_000) } }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("w6CALLREQUEST"), style = qText("label").copy(color = qColor("ink-muted")))
        BasicText(QelvoraCopy.text("w6ChooseATime"), style = qText("display-md").copy(color = qColor("ink")))
        val value = offer
        if (value != null && value.getString("state") == "offered") {
            val zone = value.getString("fanTimeZone"); val slots = value.getJSONArray("slots")
            for (index in 0 until slots.length()) {
                val slot = slots.getJSONObject(index); val id = slot.getString("id")
                Button(display(slot.getString("startsAt"), zone) + if (chosen == id) " · Selected" else "", ButtonVariant.SECONDARY, block = true, disabled = busy || stale || !canSelect) { chosen = id }
            }
            BasicText(QelvoraCopy.text("w6YourTime", mapOf("value1" to (zone).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6CreatorSTimeZone", mapOf("value1" to (value.getString("creatorTimeZone")).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6YourAcceptedTermsAndPaymentStayWithTheRequestReceipt"), style = qText("caption").copy(color = qColor("ink-muted")))
            BasicText(QelvoraCopy.text("w6OfferExpirescfe463", mapOf("value1" to (display(value.getString("expiresAt"), zone)).toString())), style = qText("caption").copy(color = qColor("ink-muted")))
            Button(QelvoraCopy.text("w6ConfirmThisTime"), ButtonVariant.SECONDARY, block = true, disabled = busy || stale || chosen == null || !canSelect) { scope.launch { select() } }
        } else if (value != null && value.getString("state") == "selected" && !value.isNull("selectedSessionId") && route != null) {
            val selected = runCatching { UUID.fromString(value.getString("selectedSessionId")) }.getOrNull()
            if (selected != null) Button(QelvoraCopy.text("w6OpenYourScheduledCall"), ButtonVariant.SECONDARY, block = true) { model.open("/calls/${route.creator}/${route.fan}/$selected") }
        } else BasicText(if (loaded) QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") else QelvoraCopy.text("w6CheckingTheCurrentOfferAndParticipantAccess"), style = qText("body").copy(color = qColor("ink")))
        notice?.let { BasicText(it, style = qText("caption").copy(color = qColor("ink-muted"))) }
        Button(QelvoraCopy.text("w6ReloadCurrentOffer"), ButtonVariant.QUIET, disabled = busy || baseURL == null || route == null) { scope.launch { refresh() } }
        Button(QelvoraCopy.text("w6OpenRequests"), ButtonVariant.QUIET) { model.open("/requests") }
    }
}
