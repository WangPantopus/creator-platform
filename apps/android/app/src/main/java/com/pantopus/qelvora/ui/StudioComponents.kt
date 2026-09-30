@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T

enum class QueueKind { PACKET, COMMITMENT, RULE }
@Composable
fun QueueCard(kind: QueueKind = QueueKind.PACKET, handle: String = "@kilnfire", mode: String = copy("writtenReply"), price: String = "$25", due: String = "DECIDE BY OCT 5", summary: String = "", shared: String? = null, draftReady: Boolean = false, overdue: Boolean = false, onOpen: () -> Unit = {}, onDecline: () -> Unit = {}) {
    Panel(Modifier.fillMaxWidth(), line = if (overdue) "alert" else if (kind == QueueKind.COMMITMENT) "ink" else "line") {
        Row(horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
            if (overdue) Glyph("alert", T.glyphSize, qColor("alert"))
            TextLine(handle, "body-strong", modifier = Modifier.weight(1f)); TextLine(if (overdue) copy("overduePrefix", "time" to due) else due, "mono-caption", if (overdue) "alert" else "ink")
        }
        TextLine(copy(when (kind) { QueueKind.PACKET -> "queueNew"; QueueKind.COMMITMENT -> "queueAccepted"; QueueKind.RULE -> "queueRule" }) + " · $mode · $price", "data-sm", "ink-muted")
        TextLine(summary)
        shared?.let { TextLine(copy("shared", "items" to it), "caption", "ink-muted") }
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(T.space2, Alignment.End), verticalArrangement = Arrangement.spacedBy(T.space2)) {
            if (draftReady) Badge(copy("aiDraftReady"), "ai-ink")
            if (kind != QueueKind.COMMITMENT) Button(copy("declineNoCharge"), ButtonVariant.QUIET, onClick = onDecline)
            Button(copy(if (kind == QueueKind.COMMITMENT) "deliver" else "open"), ButtonVariant.SECONDARY, onClick = onOpen)
        }
    }
}

data class CapacityRow(val mode: String, val used: Int, val limit: Int) { init { require(used >= 0 && limit >= 0) } }
@Composable
fun CapacityHeader(rows: List<CapacityRow> = emptyList(), line: String? = null) {
    Column(Modifier.fillMaxWidth().background(qColor("maya-surface"), RoundedCornerShape(T.radiusLg)).padding(T.messagePadding), verticalArrangement = Arrangement.spacedBy(T.space2)) {
        TextLine(copy("thisWeek").uppercase(), "data-sm", "on-maya-muted")
        rows.forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(row.mode, "control-body", "on-maya", modifier = Modifier.weight(1f)); TextLine(copy("capacityUsed", "used" to row.used.toString(), "limit" to row.limit.toString(), "left" to (row.limit-row.used).coerceAtLeast(0).toString()), "data-label", "maya-accent") } }
        line?.let { Hairline(color = qColor("maya-line")); TextLine(it, "label", "on-maya-muted") }
    }
}

@Composable
fun LabelPreview(kind: AuthorKind = AuthorKind.APPROVED_DRAFT, name: String = "Maya") {
    Column(Modifier.fillMaxWidth().dashedBorder(qColor("control-line"), T.radiusMd).padding(horizontal = T.messagePadding, vertical = T.space3), verticalArrangement = Arrangement.spacedBy(T.space2)) { TextLine(copy("labelPreview"), "caption", "ink-muted"); AuthorLabel(kind, name) }
}

@Composable
fun SigningSheet(title: String = copy("acceptRequest"), rows: List<Pair<String, String>> = emptyList(), action: String = copy("signBiometric"), signingAvailable: Boolean = false, onSign: () -> Unit = {}) {
    Column(Modifier.widthIn(max = T.phoneWidth).fillMaxWidth().qShadow("shadow-sheet", T.radiusXl).background(qColor("surface"), RoundedCornerShape(T.radiusXl, T.radiusXl, 0.dp, 0.dp)).padding(start = T.space5, end = T.space5, top = T.space3, bottom = T.welcomeGap).semantics { contentDescription = copy("reviewAndSign") }, verticalArrangement = Arrangement.spacedBy(T.space4)) {
        Box(Modifier.align(Alignment.CenterHorizontally).size(T.sheetGrabberWidth, T.sheetGrabberHeight).background(qColor("line"), RoundedCornerShape(T.sheetGrabberRadius)))
        Column(verticalArrangement = Arrangement.spacedBy(T.space1)) { TextLine(copy("reviewAndSign").uppercase(), "data-sm", "ink-muted"); TextLine(title, "signing-title") }
        Panel(Modifier.fillMaxWidth(), radius = T.radiusMd, padding = 0.dp, gap = 0.dp) {
            rows.forEachIndexed { index, (label, value) -> if (index > 0) Hairline(); Row(Modifier.padding(horizontal = T.space3, vertical = T.composerGap), horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(label.uppercase(), "signing-label", "ink-muted", modifier = Modifier.width(T.signingLabelWidth)); TextLine(value, modifier = Modifier.weight(1f)) } }
        }
        TextLine(copy("exactBiometricSignature"), "caption", "ink-muted")
        Row(Modifier.fillMaxWidth().heightIn(min = T.buttonLg).alpha(if (signingAvailable) 1f else .55f).background(qColor("maya-surface"), RoundedCornerShape(T.radiusLg)).border(T.hairline, qColor("maya-line"), RoundedCornerShape(T.radiusLg)).clickable(enabled = signingAvailable, role = Role.Button, onClick = onSign).padding(horizontal = T.space5), horizontalArrangement = Arrangement.spacedBy(T.composerGap, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            Glyph("face", T.space5, qColor("maya-accent")); TextLine(action, "button-lg", "on-maya")
        }
    }
}

@Composable
fun AuditBanner(text: String = copy("auditAccess")) {
    Row(Modifier.fillMaxWidth().background(qColor("surface-sunken"), RoundedCornerShape(T.radiusMd)).padding(horizontal = T.messagePadding, vertical = T.composerGap), horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) { Glyph("info", T.limitRadioSize, qColor("ink-muted")); TextLine(text, "label", "ink-muted") }
}

enum class SourceState { APPROVED, CANDIDATE, REVOKED }
@Composable
fun SourceRow(title: String, meta: String = "", scope: String = "public", state: SourceState = SourceState.APPROVED, onApprove: () -> Unit = {}, onRevoke: () -> Unit = {}, onRestore: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(T.radiusMd)).border(T.hairline, qColor("line"), RoundedCornerShape(T.radiusMd)).padding(horizontal = T.messagePadding, vertical = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(title, strong = true); TextLine(meta, "caption", "ink-muted") }
        Badge(if (scope == "public") copy("publicScope") else scope, if (scope == "public") "ink-muted" else "maya-ink")
        Button(copy(when (state) { SourceState.CANDIDATE -> "approve"; SourceState.REVOKED -> "restore"; SourceState.APPROVED -> "revoke" }), if (state == SourceState.CANDIDATE) ButtonVariant.SECONDARY else ButtonVariant.QUIET, onClick = when (state) { SourceState.CANDIDATE -> onApprove; SourceState.REVOKED -> onRestore; SourceState.APPROVED -> onRevoke })
    }
}

enum class NotificationKind { AI, MAYA, NOTE, APPROVED, REACTION, TEAM, SYSTEM }
@Composable
fun NotificationRow(text: String, kind: NotificationKind = NotificationKind.AI, name: String = "Maya", audience: String = "Kiln Club members", systemLabel: String = copy("requestUpdate"), time: String = "", unread: Boolean = false, onOpen: () -> Unit = {}) {
    val sender = when (kind) { NotificationKind.AI -> copy("aiAuthor", "name" to name); NotificationKind.MAYA -> name; NotificationKind.NOTE -> copy("noteAudience", "name" to name, "audience" to audience); NotificationKind.APPROVED -> copy("approvedNotification", "name" to name); NotificationKind.REACTION -> copy("reaction", "name" to name); NotificationKind.TEAM -> copy("teamNotification", "name" to name); NotificationKind.SYSTEM -> systemLabel }
    val category = when (kind) { NotificationKind.AI -> "ai"; NotificationKind.TEAM -> "team"; NotificationKind.SYSTEM -> "surface-sunken"; else -> "maya" }
    val ink = qColor(when (category) { "ai" -> "ai-ink"; "team" -> "team-ink"; "maya" -> "maya-accent"; else -> "ink-muted" })
    Column(Modifier.fillMaxWidth().background(qColor(if (unread) "surface" else "ground")).clickable(role = Role.Button, onClick = onOpen)) {
        Row(Modifier.padding(horizontal = T.space4, vertical = T.messagePadding), horizontalArrangement = Arrangement.spacedBy(T.space3)) {
            Box(Modifier.size(T.avatarSize).background(qColor(if (category == "surface-sunken") category else "$category-surface"), RoundedCornerShape(T.notificationRadius)), contentAlignment = Alignment.Center) {
                if (kind == NotificationKind.MAYA) BasicText(name.take(1), style = wordmarkStyle().copy(color = ink)) else Glyph(when (kind) { NotificationKind.AI -> "ring"; NotificationKind.NOTE -> "broadcast"; NotificationKind.APPROVED -> "approved"; NotificationKind.REACTION -> "heart"; NotificationKind.TEAM -> "team"; else -> "inbox" }, T.space4, ink)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(sender, "label"); TextLine(text) }
            TextLine(time, "data-sm", "ink-muted")
        }
        Hairline()
    }
}

@Composable
fun ShareCard(text: String, name: String = "Maya", handle: String = "@kilnfire", time: String? = null, verify: String, onVerify: () -> Unit = {}) {
    Column(Modifier.widthIn(max = T.shareSize).heightIn(min = T.shareSize).qShadow("shadow-plate", T.radiusXl).background(qColor("maya-surface"), RoundedCornerShape(T.radiusXl)).padding(T.sharePadding), verticalArrangement = Arrangement.spacedBy(T.shareGap)) {
        AuthorLabel(AuthorKind.HUMAN_CREATOR, name, onMaya = true); TextLine(text, "share-quote", "on-maya")
        Spacer(Modifier.weight(1f, fill = false))
        Hairline(color = qColor("maya-line")); TextLine(copy("shareReplied", "name" to name, "handle" to handle), "label", "on-maya"); SignedMarker(name, time, onMaya = true, onClick = onVerify); TextLine(copy("verifyAt", "url" to verify.uppercase()), "data-sm", "on-maya-muted")
    }
}

@Composable
fun CallChip(name: String = "Maya", time: String? = null, end: String? = null, recording: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(T.space2)) {
        Row(Modifier.height(T.callPersonHeight).qShadow("glow-maya", T.radiusPill).background(qColor("maya-surface"), CircleShape).padding(start = T.space2, end = T.messagePadding), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) { Seal(name.take(1), T.space6, true, onMaya = true); TextLine(copy("callAuthor", "name" to name), "control-body", "maya-accent", true) }
        Row(horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.height(T.callRecordingHeight).background(qColor("surface"), CircleShape).border(T.hairline, qColor("control-line"), CircleShape).padding(horizontal = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
                val ink = qColor(if (recording) "ink" else "ink-muted")
                Canvas(Modifier.size(T.space2)) { if (recording) drawCircle(ink) else drawCircle(ink, style = Stroke((T.hairline * 1.5f).toPx())) }
                TextLine(copy(if (recording) "agreedRecording" else "notRecording"), "label")
            }
            time?.let { TextLine(if (end != null) copy("timerOf", "time" to it, "end" to end) else it, "data-label", "ink-muted") }
        }
    }
}

enum class ReservedKind { FAN_AGENT, AI_CALL, AI_VIDEO }
@Composable
fun ReservedLabel(kind: ReservedKind = ReservedKind.FAN_AGENT, name: String = "Maya", handle: String = "@kilnfire") {
    Column(Modifier.fillMaxWidth().dashedBorder(qColor("control-line"), T.radiusMd).padding(horizontal = T.space3, vertical = T.composerGap).semantics { disabled() }, verticalArrangement = Arrangement.spacedBy(T.composerGap)) {
        Row(horizontalArrangement = Arrangement.spacedBy(T.authorGap), verticalAlignment = Alignment.CenterVertically) { Glyph(when (kind) { ReservedKind.FAN_AGENT -> "dashRing"; ReservedKind.AI_CALL -> "phone"; ReservedKind.AI_VIDEO -> "video" }, T.messagePadding, qColor("ink-muted")); TextLine(copy(when (kind) { ReservedKind.FAN_AGENT -> "reservedAssistant"; ReservedKind.AI_CALL -> "reservedCall"; ReservedKind.AI_VIDEO -> "reservedVideo" }, "name" to name, "handle" to handle), "caption", "ink-muted", true) }
        Badge(copy("reservedDisabled"))
    }
}

enum class CountdownTone { NEUTRAL, SOON, OVERDUE }
@Composable
fun Countdown(text: String, tone: CountdownTone = CountdownTone.NEUTRAL) {
    val ink = if (tone == CountdownTone.OVERDUE) "alert" else if (tone == CountdownTone.SOON) "ink" else "ink-muted"
    Row(Modifier.heightIn(min = T.countdownHeight).background(qColor("surface"), CircleShape).border(T.hairline, qColor(if (tone == CountdownTone.OVERDUE) "alert" else if (tone == CountdownTone.SOON) "control-line" else "line"), CircleShape).padding(horizontal = T.composerGap), horizontalArrangement = Arrangement.spacedBy(T.authorGap), verticalAlignment = Alignment.CenterVertically) { Glyph(if (tone == CountdownTone.OVERDUE) "alert" else "clock", T.authorLabelSize + T.hairline, qColor(ink)); TextLine(if (tone == CountdownTone.OVERDUE) copy("overduePrefix", "time" to text) else text.uppercase(), "data-sm", ink) }
}

@Composable
fun InsteadMenu(items: List<Pair<String, String>> = listOf(copy("insteadAI") to copy("insteadAIHelp"), copy("insteadGroup") to copy("insteadGroupHelp"), copy("insteadInfo") to copy("insteadInfoHelp"), copy("declineNoCharge") to copy("insteadDeclineHelp")), onSelect: (Int) -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(T.composerGap)) {
        TextLine(copy("instead").uppercase(), "data-sm", "ink-muted"); TextLine(copy("insteadExplanation"), "caption", "ink-muted")
        Panel(Modifier.fillMaxWidth(), radius = T.radiusMd, padding = 0.dp, gap = 0.dp) { items.forEachIndexed { index, (title, explanation) -> if (index > 0) Hairline(); Row(Modifier.fillMaxWidth().heightIn(min = T.buttonLg).clickable(role = Role.Button) { onSelect(index) }.padding(horizontal = T.messagePadding, vertical = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(title, "body-strong"); TextLine(explanation, "caption", "ink-muted") }; Glyph("chevron", T.space4, qColor("ink-muted")) } } }
    }
}

enum class TestState { PASS, FAIL, RUNNING }
data class BoundaryTest(val name: String, val state: TestState = TestState.PASS)
data class TestTranscript(val test: String, val fan: String, val ai: String, val why: String? = null)
@Composable
fun TestConsole(tests: List<BoundaryTest> = emptyList(), version: String = "V4 DRAFT", versionShort: String = "v4", transcript: TestTranscript? = null, onPublish: () -> Unit = {}) {
    val ready = tests.isNotEmpty() && tests.all { it.state == TestState.PASS }
    Panel(Modifier.fillMaxWidth(), padding = T.space4) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(copy("boundaryTests") + " · $version", "data-sm", "ink-muted", modifier = Modifier.weight(1f)); TextLine(copy("testPassCount", "passed" to tests.count { it.state == TestState.PASS }.toString(), "total" to tests.size.toString()), "data-sm", "ink-muted") }
        tests.forEachIndexed { index, test ->
            if (index > 0) Hairline()
            Row(Modifier.fillMaxWidth().heightIn(min = T.segmentHeight), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) { Glyph(when (test.state) { TestState.PASS -> "check"; TestState.FAIL -> "alert"; TestState.RUNNING -> "clock" }, T.messagePadding, qColor(when (test.state) { TestState.PASS -> "ai-ink"; TestState.FAIL -> "alert"; TestState.RUNNING -> "ink-muted" })); TextLine(test.name, modifier = Modifier.weight(1f)); TextLine(copy(when (test.state) { TestState.PASS -> "testPasses"; TestState.FAIL -> "testFails"; TestState.RUNNING -> "testRunning" }).uppercase(), "data-sm", if (test.state == TestState.FAIL) "alert" else "ink-muted") }
        }
        transcript?.let { item -> Column(Modifier.fillMaxWidth().background(qColor("ground"), RoundedCornerShape(T.radiusMd)).padding(T.space3), verticalArrangement = Arrangement.spacedBy(T.space2)) {
            TextLine(copy("transcript", "test" to item.test), "data-sm", "ink-muted")
            listOf(copy("testFan") to item.fan, copy("aiAuthor", "name" to "Maya") to item.ai).forEachIndexed { index, (who, text) -> Row(horizontalArrangement = Arrangement.spacedBy(T.composerGap)) { TextLine(who, "caption", if (index == 1) "ai-ink" else "ink-muted", true, Modifier.width(T.transcriptLabelWidth)); TextLine(text, modifier = Modifier.weight(1f)) } }
            item.why?.let { Hairline(); TextLine(it, "label", "ink-muted") }
        } }
        Button(copy("publishVersion", "version" to versionShort), disabled = !ready, onClick = onPublish)
        TextLine(if (ready) copy("publishingReady") else copy("publishingWait", "tests" to tests.filter { it.state != TestState.PASS }.joinToString { it.name.lowercase() }), "caption", "ink-muted")
    }
}

enum class VersionState { DRAFT, LIVE, RETIRED }
data class AgentVersion(val id: String, val state: VersionState = VersionState.RETIRED, val date: String = "", val changes: String = "")
@Composable
fun VersionList(versions: List<AgentVersion>, onRollback: (String) -> Unit = {}) {
    Panel(Modifier.fillMaxWidth(), radius = T.radiusMd, padding = 0.dp, gap = 0.dp) { versions.forEachIndexed { index, version -> if (index > 0) Hairline(); Row(Modifier.padding(horizontal = T.messagePadding, vertical = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) { TextLine(version.id.uppercase(), "data-label", if (version.state == VersionState.LIVE) "ai-ink" else "ink-muted", modifier = Modifier.width(T.versionIdWidth)); Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(version.changes); TextLine(version.date, "data-sm", "ink-muted") }; when (version.state) { VersionState.LIVE -> Badge(copy("versionLive"), "ai-ink"); VersionState.DRAFT -> Badge(copy("versionDraft")); VersionState.RETIRED -> Button(copy("rollBack", "version" to version.id), ButtonVariant.QUIET, onClick = { onRollback(version.id) }) } } } }
}

@Composable
fun DigestItem(text: String, name: String = "Maya", handle: String = "@kilnfire", time: String? = null, filed: Boolean = false, onFile: () -> Unit = {}) {
    Panel(Modifier.fillMaxWidth(), fill = "ai-surface", line = "ai-line", padding = T.space4) {
        Row(horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) { AuthorLabel(AuthorKind.AI, name, time = time); Spacer(Modifier.weight(1f)); TextLine(copy("digestTo", "handle" to handle.uppercase()), "data-sm", "ink-muted") }
        TextLine(text, "body")
        if (filed) Row(Modifier.heightIn(min = T.touchTarget), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.authorGap)) { Glyph("check", T.messagePadding, qColor("ink-muted")); TextLine(copy("digestFiled"), "caption", "ink-muted") } else Button(copy("neverSay"), ButtonVariant.QUIET, onClick = onFile)
    }
}

@Composable
fun EmailFrame(subject: String, text: String, kind: AuthorKind = AuthorKind.HUMAN_CREATOR, name: String = "Maya", from: String? = null, time: String? = null, cta: String = copy("emailRead", "brand" to QelvoraCopy.brandName), footer: String = copy("emailFooter", "name" to name), onOpen: () -> Unit = {}, onVerify: () -> Unit = {}) {
    val sender = from ?: copy("emailVia", "sender" to kind.label(name), "brand" to QelvoraCopy.brandName)
    val human = kind in listOf(AuthorKind.HUMAN_CREATOR, AuthorKind.HUMAN_BROADCAST)
    Panel(Modifier.fillMaxWidth(), fill = "ground", radius = T.radiusMd, padding = 0.dp, gap = 0.dp) {
        Column(Modifier.fillMaxWidth().background(qColor("surface")).padding(horizontal = T.space4, vertical = T.composerGap), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(copy("emailFrom", "from" to sender), "data-sm", "ink-muted"); TextLine(copy("emailSubject", "subject" to subject), "data-sm", "ink-muted") }
        Column(Modifier.padding(T.space6).background(qColor("surface"), RoundedCornerShape(T.radiusLg)).padding(T.welcomeGap), verticalArrangement = Arrangement.spacedBy(T.shareGap)) {
            BasicText(QelvoraCopy.brandName, style = wordmarkStyle().copy(color = qColor("ink"))); Hairline()
            Column(Modifier.fillMaxWidth().then(if (human) Modifier.background(qColor("maya-surface"), RoundedCornerShape(T.radiusTail, T.radiusLg, T.radiusLg, T.radiusLg)).padding(T.shareGap) else Modifier), verticalArrangement = Arrangement.spacedBy(T.composerGap)) { AuthorLabel(kind, name, time = time, onMaya = human); TextLine(text, if (human) "voice-lg" else "body", if (human) "on-maya" else "ink"); if (human || kind == AuthorKind.APPROVED_DRAFT) SignedMarker(name, onMaya = human, onClick = onVerify) }
            Button(cta, ButtonVariant.SECONDARY, onClick = onOpen); Hairline(); TextLine(footer, "caption", "ink-muted")
        }
    }
}
