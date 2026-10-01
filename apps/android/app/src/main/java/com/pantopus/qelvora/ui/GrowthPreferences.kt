package com.pantopus.qelvora.ui

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private val growthKinds = listOf("ai_reply", "approved_draft", "personal_reply", "request_status", "call_reminder", "answered_publicly", "content_match", "announcement", "creator_offer", "slot_change", "new_packet", "commitment_due", "guardrail", "pool_share", "note", "reaction", "public_answer", "spending_reminder", "weekly_impact")

@Composable
internal fun GrowthNotificationSettings(client: GrowthClient?) {
    var value by remember { mutableStateOf<JSONObject?>(null) }
    var creators by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var from by remember { mutableStateOf("") }
    var until by remember { mutableStateOf("") }
    var zone by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val ink = qColor("ink")
    fun update(key: String, next: Any) {value = JSONObject(value.toString()).put(key, next)}
    fun contains(key: String, id: String): Boolean {val list = value?.optJSONArray(key) ?: return false;return (0 until list.length()).any {list.getString(it) == id}}
    fun toggle(key: String, id: String) {val list = value!!.getJSONArray(key);val present = contains(key, id);val updated = JSONArray();for (i in 0 until list.length()) if (list.getString(i) != id) updated.put(list.getString(i));if (!present) updated.put(id);update(key, updated)}
    fun time(key: String): String {val current = value ?: return "";if (current.isNull(key)) return "";val minute = current.getInt(key);return "%02d:%02d".format(minute / 60, minute % 60)}
    fun minute(text: String): Any {if (text.isEmpty()) return JSONObject.NULL;require(Regex("[0-2][0-9]:[0-5][0-9]").matches(text));val parts = text.split(':').map {it.toInt()};require(parts[0] < 24);return parts[0] * 60 + parts[1]}
    LaunchedEffect(client, reload) {busy = true;try {requireNotNull(client);value = client.request("preferences");val directory = client.request("preferences/creators").getJSONArray("creators");creators = (0 until directory.length()).map {val c = directory.getJSONObject(it);c.getString("id") to c.getString("name")};from = time("quietStart");until = time("quietEnd");zone = value!!.getString("timeZone");message = ""}catch (cancelled: CancellationException) {throw cancelled} catch (_: Exception) {message = QelvoraCopy.text("growthSettingsNeedACurrentSignedInAccountAndNetworkConnection")}finally {busy = false}}
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("growthNotificationSettings"), style = qText("display-md").copy(color = ink))
        BasicText(QelvoraCopy.text("growthYourInAppRecordCannotBeTurnedOffPushAnd"), style = qText("body").copy(color = ink))
        value?.let {current ->
            listOf("push" to QelvoraCopy.text("growthPushNotifications"), "email" to QelvoraCopy.text("growthEmailDigest"), "hideSensitive" to QelvoraCopy.text("growthHideSensitivePreviews")).forEach {(key, label) -> Button(QelvoraCopy.text("growthLabelWithState", mapOf("label" to label, "state" to if (current.getBoolean(key)) QelvoraCopy.text("growthOn") else QelvoraCopy.text("growthOff"))), ButtonVariant.SECONDARY, disabled = busy, block = true) {update(key, !current.getBoolean(key))} }
            BasicTextField(from, {from = it.take(5)}, textStyle = qText("body").copy(color = ink), modifier = Modifier.fillMaxWidth().padding(12.dp).semantics {contentDescription = QelvoraCopy.text("growthQuietHoursFromHhMm")})
            BasicTextField(until, {until = it.take(5)}, textStyle = qText("body").copy(color = ink), modifier = Modifier.fillMaxWidth().padding(12.dp).semantics {contentDescription = QelvoraCopy.text("growthQuietHoursUntilHhMm")})
            BasicTextField(zone, {zone = it.take(80)}, textStyle = qText("body").copy(color = ink), modifier = Modifier.fillMaxWidth().padding(12.dp).semantics {contentDescription = QelvoraCopy.text("growthTimeZone")})
            BasicText(QelvoraCopy.text("growthLeaveBothTimesEmptyForNoQuietHours"), style = qText("caption").copy(color = ink))
            creators.forEach {(id, name) -> Button(QelvoraCopy.text("growthCreatorWithState", mapOf("name" to name, "state" to if (contains("mutedCreators", id)) QelvoraCopy.text("growthMuted") else QelvoraCopy.text("growthPushAndEmailAllowed"))), ButtonVariant.SECONDARY, disabled = busy, block = true) {toggle("mutedCreators", id)} }
            growthKinds.forEach {kind -> BasicText(QelvoraCopy.text("growthKind" + kind.split("_").joinToString("") { it.replaceFirstChar { c -> c.uppercase() } }), style = qText("label").copy(color = ink));listOf("disabledPushTypes" to QelvoraCopy.text("growthPush"), "disabledEmailTypes" to QelvoraCopy.text("growthEmail")).forEach {(key, label) -> Button(QelvoraCopy.text("growthLabelWithState", mapOf("label" to label, "state" to if (contains(key, kind)) QelvoraCopy.text("growthOff") else QelvoraCopy.text("growthOn"))), ButtonVariant.QUIET, disabled = busy) {toggle(key, kind)} } }
            Button(if (busy) QelvoraCopy.text("growthSaving") else QelvoraCopy.text("growthSavePreferences"), ButtonVariant.SECONDARY, disabled = busy, block = true) {scope.launch {busy = true;try {requireNotNull(client);require(from.isEmpty() == until.isEmpty());val body = JSONObject(current.toString()).put("quietStart", minute(from)).put("quietEnd", minute(until)).put("timeZone", zone);value = client.request("preferences", "PUT", body);message = QelvoraCopy.text("growthPreferencesSavedYourInAppRecordRemainsAvailable")}catch (cancelled: CancellationException) {throw cancelled} catch (_: Exception) {message = QelvoraCopy.text("growthPreferencesWereNotSavedCheckBothQuietHourTimesAnd")}finally {busy = false}}}
        }
        if (message.isNotEmpty()) BasicText(message, style = qText("body").copy(color = ink))
        Button(QelvoraCopy.text("growthReloadSettings"), ButtonVariant.QUIET, disabled = busy) {reload++}
    }
}
