package com.pantopus.qelvora.ui

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.TimeZone

private val growthKinds = listOf("ai_reply", "approved_draft", "personal_reply", "request_status", "call_reminder", "answered_publicly", "content_match", "announcement", "creator_offer", "slot_change", "new_packet", "commitment_due", "guardrail", "pool_share", "note", "reaction", "public_answer", "spending_reminder", "weekly_impact")

@Composable
@OptIn(ExperimentalFoundationApi::class)
internal fun GrowthNotificationSettings(client: GrowthClient?) {
    var value by remember { mutableStateOf<JSONObject?>(null) }
    var creators by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var from by remember { mutableStateOf("") }
    var until by remember { mutableStateOf("") }
    var zone by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var errors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val fromFocus = remember { FocusRequester() }
    val untilFocus = remember { FocusRequester() }
    val zoneFocus = remember { FocusRequester() }
    val fromView = remember { BringIntoViewRequester() }
    val untilView = remember { BringIntoViewRequester() }
    val zoneView = remember { BringIntoViewRequester() }
    val timeZones = remember { TimeZone.getAvailableIDs().toSet() }
    val scope = rememberCoroutineScope()
    val ink = qColor("ink")
    fun update(key: String, next: Any) {value = JSONObject(value.toString()).put(key, next); message = ""}
    fun clearError(vararg fields: String) {errors = errors - fields.toSet(); message = ""}
    fun contains(key: String, id: String): Boolean {val list = value?.optJSONArray(key) ?: return false;return (0 until list.length()).any {list.getString(it) == id}}
    fun toggle(key: String, id: String) {val list = value!!.getJSONArray(key);val present = contains(key, id);val updated = JSONArray();for (i in 0 until list.length()) if (list.getString(i) != id) updated.put(list.getString(i));if (!present) updated.put(id);update(key, updated)}
    fun time(current: JSONObject, key: String): String {if (current.isNull(key)) return "";val minute = current.getInt(key);return "%02d:%02d".format(java.util.Locale.ROOT, minute / 60, minute % 60)}
    fun minute(text: String): Any {if (text.isEmpty()) return JSONObject.NULL;require(Regex("[0-2][0-9]:[0-5][0-9]").matches(text));val parts = text.split(':').map {it.toInt()};require(parts[0] < 24);return parts[0] * 60 + parts[1]}
    LaunchedEffect(client, reload) {
        busy = true
        try {
            requireNotNull(client)
            val preferences = client.request("preferences")
            val directory = client.request("preferences/creators").getJSONArray("creators")
            val nextCreators = (0 until directory.length()).map { val c = directory.getJSONObject(it); c.getString("id") to c.getString("name") }
            val nextFrom = time(preferences, "quietStart")
            val nextUntil = time(preferences, "quietEnd")
            val nextZone = preferences.getString("timeZone")
            // Keep the whole old form if any part of the reload fails.
            value = preferences
            creators = nextCreators
            from = nextFrom
            until = nextUntil
            zone = nextZone
            errors = emptyMap()
            message = ""
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { message = QelvoraCopy.text("growthSettingsNeedACurrentSignedInAccountAndNetworkConnection") }
        finally { busy = false }
    }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("growthNotificationSettings"), style = qText("display-md").copy(color = ink))
        BasicText(QelvoraCopy.text("growthYourInAppRecordCannotBeTurnedOffPushAnd"), style = qText("body").copy(color = ink))
        value?.let {current ->
            listOf("push" to QelvoraCopy.text("growthPushNotifications"), "email" to QelvoraCopy.text("growthEmailDigest"), "hideSensitive" to QelvoraCopy.text("growthHideSensitivePreviews")).forEach {(key, label) -> Button(QelvoraCopy.text("growthLabelWithState", mapOf("label" to label, "state" to if (current.getBoolean(key)) QelvoraCopy.text("growthOn") else QelvoraCopy.text("growthOff"))), ButtonVariant.SECONDARY, disabled = busy, block = true) {update(key, !current.getBoolean(key))} }
            GrowthPreferenceField(from, {from = it; clearError("from", "until")}, QelvoraCopy.text("growthQuietHoursFromHhMm"), errors["from"], fromFocus, fromView, !busy)
            GrowthPreferenceField(until, {until = it; clearError("from", "until")}, QelvoraCopy.text("growthQuietHoursUntilHhMm"), errors["until"], untilFocus, untilView, !busy)
            GrowthPreferenceField(zone, {zone = it; clearError("zone")}, QelvoraCopy.text("growthTimeZone"), errors["zone"], zoneFocus, zoneView, !busy)
            BasicText(QelvoraCopy.text("growthLeaveBothTimesEmptyForNoQuietHours"), style = qText("caption").copy(color = ink))
            creators.forEach {(id, name) -> Button(QelvoraCopy.text("growthCreatorWithState", mapOf("name" to name, "state" to if (contains("mutedCreators", id)) QelvoraCopy.text("growthMuted") else QelvoraCopy.text("growthPushAndEmailAllowed"))), ButtonVariant.SECONDARY, disabled = busy, block = true) {toggle("mutedCreators", id)} }
            growthKinds.forEach {kind -> BasicText(QelvoraCopy.text("growthKind" + kind.split("_").joinToString("") { it.replaceFirstChar { c -> c.uppercase() } }), style = qText("label").copy(color = ink));listOf("disabledPushTypes" to QelvoraCopy.text("growthPush"), "disabledEmailTypes" to QelvoraCopy.text("growthEmail")).forEach {(key, label) -> Button(QelvoraCopy.text("growthLabelWithState", mapOf("label" to label, "state" to if (contains(key, kind)) QelvoraCopy.text("growthOff") else QelvoraCopy.text("growthOn"))), ButtonVariant.QUIET, disabled = busy) {toggle(key, kind)} } }
            Button(if (busy) QelvoraCopy.text("growthSaving") else QelvoraCopy.text("growthSavePreferences"), ButtonVariant.SECONDARY, disabled = busy, block = true) {
                if (!busy) {
                    message = ""
                    val next = linkedMapOf<String, String>()
                    val validTime = Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]")
                    if (from.isNotEmpty() && !validTime.matches(from)) next["from"] = QelvoraCopy.text("growthErrorQuietHoursFormat")
                    if (until.isNotEmpty() && !validTime.matches(until)) next["until"] = QelvoraCopy.text("growthErrorQuietHoursFormat")
                    if (from.isEmpty() != until.isEmpty()) next[if (from.isEmpty()) "from" else "until"] = QelvoraCopy.text("growthErrorQuietHoursPair")
                    if (zone.isEmpty() || zone.length > 80 || zone !in timeZones) next["zone"] = QelvoraCopy.text("growthErrorTimeZone")
                    errors = next
                    if (next.isNotEmpty()) {
                        val target = when {
                            "from" in next -> fromFocus to fromView
                            "until" in next -> untilFocus to untilView
                            else -> zoneFocus to zoneView
                        }
                        target.first.requestFocus()
                        scope.launch {
                            // An already-focused field also needs scrolling after Save.
                            // Include the newly rendered inline error in the target.
                            withFrameNanos { }
                            target.second.bringIntoView()
                        }
                    } else {
                        busy = true
                        val body = JSONObject(current.toString()).put("quietStart", minute(from)).put("quietEnd", minute(until)).put("timeZone", zone)
                        scope.launch {
                            try {
                                requireNotNull(client)
                                value = client.request("preferences", "PUT", body)
                                message = QelvoraCopy.text("growthPreferencesSavedYourInAppRecordRemainsAvailable")
                            } catch (cancelled: CancellationException) { throw cancelled }
                            catch (_: Exception) { message = QelvoraCopy.text("growthPreferencesWereNotSaved") }
                            finally { busy = false }
                        }
                    }
                }
            }
        }
        if (message.isNotEmpty()) BasicText(message, style = qText("body").copy(color = ink))
        Button(QelvoraCopy.text("growthReloadSettings"), ButtonVariant.QUIET, disabled = busy) {reload++}
    }
}

@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun GrowthPreferenceField(value: String, change: (String) -> Unit, label: String, failure: String?, focus: FocusRequester, view: BringIntoViewRequester, enabled: Boolean) {
    Column(modifier = Modifier.bringIntoViewRequester(view), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText(label, style = qText("caption").copy(color = qColor("ink-muted")))
        BasicTextField(value, change, enabled = enabled, singleLine = true,
            textStyle = qText("body").copy(color = qColor("ink")),
            modifier = Modifier.fillMaxWidth().focusRequester(focus)
                .background(qColor("surface"), RoundedCornerShape(12.dp))
                .border(1.dp, qColor(if (failure == null) "control-line" else "alert"), RoundedCornerShape(12.dp))
                .padding(12.dp).semantics {
                    contentDescription = label
                    if (failure != null) error(failure)
                })
        if (failure != null) BasicText(failure,
            style = qText("caption").copy(color = qColor("alert")),
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    }
}
