package com.pantopus.qelvora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

internal fun growthWeeklyImpactRegistration(baseURL: String?) = FanFeatureRegistration(
    matches = { it == "/studio/impact" },
    screen = { GrowthWeeklyImpact(baseURL, it) },
)

private data class WeeklyImpact(
    val week: String, val people: Int, val ai: Int, val personal: Int,
    val notes: Int, val thanks: Int, val quotes: List<Pair<String, String?>>,
)

private fun readImpact(row: JSONObject): WeeklyImpact {
    fun count(key: String): Int {
        val value = row.getLong(key)
        require(value in 0..Int.MAX_VALUE.toLong())
        return value.toInt()
    }
    val quotes = row.getJSONArray("consented_thanks")
    require(quotes.length() <= 20)
    val week = LocalDate.parse(row.getString("window_start").take(10))
        .format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))
    return WeeklyImpact(week, count("unique_fans"), count("ai_conversations"), count("personal_replies"), count("notes"), count("thanks_count"),
        (0 until quotes.length()).map { index ->
            val quote = quotes.getJSONObject(index)
            quote.getString("text") to if (quote.isNull("displayName")) null else quote.getString("displayName")
        })
}

/** Uses the actual shell capture and issuer-bound credential. Private results
 * are discarded on backgrounding; each fresh API read rechecks quote consent. */
@Composable
private fun GrowthWeeklyImpact(baseURL: String?, model: FanSession) {
    var impact by remember { mutableStateOf<WeeklyImpact?>(null) }
    var visibleSession by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    val sessionId = model.session?.sessionId
    val client = remember(baseURL, model) { baseURL?.let { GrowthClient(it, model::currentToken) } }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) foreground = true
            if (event == Lifecycle.Event.ON_STOP) { foreground = false; impact = null; visibleSession = null; loaded = false; message = "" }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(client, sessionId, model.checkingSession, reload, foreground) {
        impact = null; visibleSession = null; loaded = false; message = ""; loading = false
        if (!foreground || model.checkingSession) { loading = foreground && model.checkingSession; return@LaunchedEffect }
        loading = true
        try {
            val capture = model.captureRequest("/studio/impact") ?: throw GrowthRequestFailure(401)
            val credential = model.currentToken() ?: throw GrowthRequestFailure(401)
            if (!capture.isCurrent()) return@LaunchedEffect
            val page = (client ?: throw IllegalStateException()).request("impact", expectedSession = credential)
            if (!foreground || !capture.isCurrent()) return@LaunchedEffect
            val row = if (page.isNull("impact")) null else readImpact(page.getJSONObject("impact"))
            if (!capture.isCurrent()) return@LaunchedEffect
            impact = row; visibleSession = capture.sessionId; loaded = true
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) {
            if (foreground && model.session?.sessionId == sessionId) message = (failure as? GrowthRequestFailure)?.message ?: QelvoraCopy.text("growthTheServiceIsUnavailableReconnectAndTryAgain")
        } finally { loading = false }
    }
    val enlarged = LocalDensity.current.fontScale > 1.3f
    val numbers = NumberFormat.getIntegerInstance()
    val ink = qColor("on-maya")
    val muted = qColor("on-maya-muted")
    Column(Modifier.fillMaxSize().background(qColor("maya-surface")).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 48.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(28.dp)) {
        BasicText(QelvoraCopy.text("growthYourWeekImpact"), style = qText("data-sm").copy(color = qColor("maya-accent")))
        val row = impact?.takeIf { foreground && !model.checkingSession && !model.purgingPrivateState && visibleSession == sessionId }
        if (row != null) {
            BasicText(QelvoraCopy.text("growthImpactPeopleHelped", mapOf("people" to numbers.format(row.people))), style = qText("display-lg").copy(color = ink, fontSize = 44.sp, lineHeight = 46.sp, letterSpacing = (-1.1).sp), modifier = Modifier.semantics { heading() })
            Box(Modifier.fillMaxWidth().height(1.dp).background(qColor("maya-line")))
            val counts = listOf(row.ai to "growthAiConversations", row.personal to "growthPersonalReplies", row.thanks to "growthThanks", row.notes to "navNotes")
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                if (enlarged) counts.forEach { (value, label) -> ImpactCount(numbers.format(value), label, Modifier.fillMaxWidth()) }
                else counts.chunked(2).forEach { pair ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        pair.forEach { (value, label) -> ImpactCount(numbers.format(value), label, Modifier.weight(1f)) }
                    }
                }
            }
            if (row.quotes.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    BasicText(QelvoraCopy.text("growthImpactThankYou"), style = qText("data-sm").copy(color = muted))
                    row.quotes.forEach { (text, name) ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.semantics(mergeDescendants = true) {}) {
                            BasicText("“$text”", style = qText("voice-lg").copy(color = ink, fontSize = 20.sp, lineHeight = 30.sp))
                            name?.let { BasicText(it, style = qText("caption").copy(color = ink)) }
                        }
                    }
                }
            }
            BasicText(QelvoraCopy.text("growthSevenDaysFromThanksAppearOnlyWhenFansChooseTo", mapOf("value1" to row.week)), style = qText("caption").copy(color = muted))
        } else {
            BasicText(QelvoraCopy.text("growthThePeopleYouHelpedThisWeek"), style = qText("display-lg").copy(color = ink), modifier = Modifier.semantics { heading() })
            val status = if (loading) QelvoraCopy.text("growthLoading") else if (message.isNotEmpty()) message else if (loaded) QelvoraCopy.text("growthImpactNotAvailable") else ""
            if (status.isNotEmpty()) BasicText(status, style = qText("body").copy(color = ink), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        BasicText(QelvoraCopy.text("growthImpactWeekCounts"), style = qText("caption").copy(color = muted))
        Box(Modifier.fillMaxWidth().border(1.dp, qColor("maya-line"), RoundedCornerShape(12.dp)).clickable(enabled = !loading, role = Role.Button) { reload++ }.padding(horizontal = 16.dp, vertical = 14.dp).heightIn(min = 20.dp)) {
            BasicText(QelvoraCopy.text("growthTryAgain"), style = qText("body-strong").copy(color = ink))
        }
    }
}

@Composable
private fun ImpactCount(value: String, label: String, modifier: Modifier) {
    Column(modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        BasicText(value, style = qText("data-lg").copy(color = qColor("on-maya"), fontSize = 28.sp, lineHeight = 32.sp))
        BasicText(QelvoraCopy.text(label), style = qText("caption").copy(color = qColor("on-maya-muted")))
    }
}
