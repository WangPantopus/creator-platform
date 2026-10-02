package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T

@Composable
fun AccessLines(name: String = "Maya", can: String = copy("accessDefaultCan", "name" to name), included: String = copy("accessDefaultIncluded"), byRequest: String = copy("accessDefaultRequest", "name" to name), changes: String = copy("accessDefaultChanges")) {
    Column(verticalArrangement = Arrangement.spacedBy(T.space3)) {
        listOf("accessLabelCan" to can, "accessLabelIncluded" to included, "accessLabelRequest" to byRequest, "accessLabelChanges" to changes).forEach { (key, value) ->
            Row(horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(copy(key).uppercase(), "signing-label", "ink-muted", modifier = Modifier.width(T.accessTermWidth)); TextLine(value, modifier = Modifier.weight(1f)) }
        }
    }
}

data class RequestMode(val title: String, val meta: String? = null, val price: String? = null, val selected: Boolean = false, val disabled: Boolean = false)
@Composable
fun ModeList(modes: List<RequestMode>, legend: String = copy("howAnswers", "name" to "Maya"), onSelect: (Int) -> Unit = {}) {
    var selected by remember(modes) { mutableIntStateOf(modes.indexOfFirst { it.selected }) }
    val shape = RoundedCornerShape(T.radiusLg)
    Column(Modifier.fillMaxWidth().background(qColor("surface"), shape).border(T.hairline, qColor("line"), shape).selectableGroup().semantics { contentDescription = legend }) {
        modes.forEachIndexed { index, mode ->
            if (index > 0) Hairline()
            // A radio selection is neutral. Creator color denotes an authored act, never a selected setting.
            Row(Modifier.fillMaxWidth().then(if (index == selected) Modifier.border(T.hairline, qColor("ink"), if (modes.size == 1) shape else RoundedCornerShape(0.dp)) else Modifier).selectable(index == selected, enabled = !mode.disabled, role = Role.RadioButton) { selected = index; onSelect(index) }.padding(horizontal = T.messagePadding, vertical = T.space4), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space3)) {
                SelectionDot(index == selected, mode.disabled)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(mode.title, "body-strong", if (mode.disabled) "ink-muted" else "ink"); mode.meta?.let { TextLine(it, "caption", "ink-muted") } }
                mode.price?.let { TextLine(it, "data-md", if (mode.disabled) "ink-muted" else "ink") }
            }
        }
    }
}

@Composable internal fun SelectionDot(selected: Boolean, disabled: Boolean = false) {
    val color = qColor(if (disabled) "ink-muted" else "ink")
    Canvas(Modifier.size(T.checkboxSize)) { drawCircle(color, style = Stroke(T.hairline.toPx())); if (selected) drawCircle(color, radius = size.minDimension / 4) }
}

data class IncludeItem(val label: String, val help: String? = null, val checked: Boolean = false)
@Composable
fun IncludeList(summary: String = "", items: List<IncludeItem> = emptyList(), edited: Boolean = false, notice: Boolean = true, name: String = "Maya", onSummary: (String) -> Unit = {}, onInclude: (Int, Boolean) -> Unit = { _, _ -> }, onSummaryIncluded: (Boolean) -> Unit = {}) {
    var summaryText by remember(summary) { mutableStateOf(summary) }
    val included = remember(items) { items.map { it.checked }.toMutableStateList() }
    var summaryIncluded by remember { mutableStateOf(true) }
    val shape = RoundedCornerShape(T.radiusLg)
    Column(Modifier.fillMaxWidth().background(qColor("surface"), shape).border(T.hairline, qColor("line"), shape)) {
        Row(Modifier.heightIn(min = T.includeRowHeight).toggleable(summaryIncluded, role = Role.Checkbox) { summaryIncluded = it; onSummaryIncluded(it) }.padding(T.messagePadding), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) {
            Box(Modifier.size(T.checkboxSize).background(if (summaryIncluded) qColor("ink") else qColor("surface"), RoundedCornerShape(T.radiusTail)).border(T.hairline, qColor("control-line"), RoundedCornerShape(T.radiusTail)), contentAlignment = Alignment.Center) { if (summaryIncluded) Glyph("check", T.space4, qColor("surface")) }
            TextLine(copy("summaryQuestion"), "body-strong", modifier = Modifier.weight(1f)); if (edited || summaryText != summary) Badge(copy("editedByYou"))
        }
        BasicTextField(summaryText, { summaryText = it; onSummary(it) }, Modifier.fillMaxWidth().padding(horizontal = T.messagePadding).background(qColor("ground"), RoundedCornerShape(T.segmentRadius)).border(T.hairline, qColor("line"), RoundedCornerShape(T.segmentRadius)).padding(T.space3).semantics { contentDescription = copy("summary") }, textStyle = qText("summary").copy(color = qColor("ink")), minLines = 4)
        Spacer(Modifier.height(T.messagePadding))
        items.forEachIndexed { index, item ->
            Hairline()
            Row(Modifier.fillMaxWidth().heightIn(min = T.includeRowHeight).toggleable(included[index], role = Role.Checkbox) { included[index] = it; onInclude(index, it) }.padding(horizontal = T.messagePadding, vertical = T.composerGap), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) {
                Box(Modifier.size(T.checkboxSize).background(if (included[index]) qColor("ink") else qColor("surface"), RoundedCornerShape(T.radiusTail)).border(T.hairline, qColor("control-line"), RoundedCornerShape(T.radiusTail)), contentAlignment = Alignment.Center) { if (included[index]) Glyph("check", T.space4, qColor("surface")) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(item.label); item.help?.let { TextLine(it, "caption", "ink-muted") } }
            }
        }
        if (notice) { Hairline(); TextLine(copy("packetAccess", "name" to name), "caption", "ink-muted", modifier = Modifier.padding(T.messagePadding)) }
    }
}

@Composable internal fun Badge(text: String, ink: String = "ink-muted") { TextLine(text.uppercase(), "data-sm", ink, modifier = Modifier.border(T.hairline, qColor(ink), CircleShape).padding(horizontal = T.space2, vertical = T.waveBarWidth)) }

@Composable
fun TermsBlock(name: String = "Maya", price: String = "$25.00", deadline: String = "48 h", draftNote: Boolean = true) {
    val shape = RoundedCornerShape(T.radiusLg)
    Column(Modifier.background(qColor("surface"), shape).border(T.hairline, qColor("line"), shape)) {
        listOf(copy("ifAccepts", "name" to name) to price, copy("ifDeclines", "deadline" to deadline) to "$0.00").forEach { (label, value) ->
            Row(Modifier.fillMaxWidth().padding(horizontal = T.messagePadding, vertical = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(label.uppercase(), "mono-caption", "ink-muted", modifier = Modifier.weight(1f)); TextLine(value, "mono-caption") }
            Hairline()
        }
        Column(Modifier.padding(horizontal = T.messagePadding, vertical = T.space3), verticalArrangement = Arrangement.spacedBy(T.authorGap)) { TextLine(copy("chargeRule", "name" to name, "deadline" to deadline)); TextLine(copy("pendingHold"), "caption", "ink-muted"); if (draftNote) TextLine(copy("draftNotice", "name" to name), "caption", "ink-muted") }
    }
}

@Composable
fun EtaLine(name: String = "Maya", range: String = "1 to 2 days", ahead: Int? = null) {
    Row(horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) { Glyph("clock", T.space4, qColor("ink-muted")); TextLine(copy("decisionEta", "name" to name, "range" to range) + (ahead?.let { copy("requestsAhead", "count" to it.toString()) } ?: ""), "label", "ink-muted") }
}

enum class RequestStepState { DONE, CURRENT, TODO }
data class RequestStep(val label: String, val time: String? = null, val state: RequestStepState = RequestStepState.TODO)
@Composable
fun RequestStatus(reqId: String = "REQ-0412", mode: String = copy("writtenReply"), price: String = "$25", steps: List<RequestStep> = emptyList(), outcome: String? = null, content: (@Composable () -> Unit)? = null) {
    Panel(Modifier.fillMaxWidth().semantics { contentDescription = copy("requestStatus") }) {
        Row(horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) { TextLine(reqId, "data-sm", "ink-muted"); Box(Modifier.weight(1f).height(T.hairline).background(qColor("line"))); TextLine("$mode · $price", "data-sm", "ink-muted") }
        Column {
            steps.forEach { step ->
                Row(Modifier.fillMaxWidth().padding(vertical = T.authorGap), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.Top) {
                    val dotInk = qColor(if (step.state == RequestStepState.TODO) "control-line" else if (step.state == RequestStepState.CURRENT) "maya-ink" else "ink")
                    val surface = qColor("surface")
                    Canvas(Modifier.size(T.space4, T.space5)) {
                        val radius = T.requestDotSize.toPx() / 2
                        val center = androidx.compose.ui.geometry.Offset(T.requestDotInset.toPx() + radius, (T.space1 + T.hairline).toPx() + radius)
                        if (step.state == RequestStepState.CURRENT) { drawCircle(dotInk, radius + T.space1.toPx(), center); drawCircle(surface, radius + T.requestDotInset.toPx(), center) }
                        if (step.state != RequestStepState.TODO) drawCircle(dotInk, radius, center)
                        drawCircle(dotInk, radius, center, style = Stroke(T.requestDotStroke.toPx()))
                    }
                    TextLine(step.label, "control-body", if (step.state == RequestStepState.TODO) "ink-muted" else "ink", step.state == RequestStepState.CURRENT, Modifier.weight(1f)); step.time?.let { TextLine(it, "data-sm", "ink-muted") }
                }
            }
        }
        outcome?.let { TextLine(it, modifier = Modifier.fillMaxWidth().background(qColor("ground"), RoundedCornerShape(T.radiusMd)).padding(horizontal = T.messagePadding, vertical = T.space3)) }
        content?.invoke()
    }
}

@Composable
fun Receipt(name: String = "Maya", reqId: String = "REQ-0412", title: String = copy("receiptTitle", "name" to name), rows: List<Pair<String, String>> = emptyList(), label: String = copy("writtenBy", "name" to name), onVerify: () -> Unit = {}) {
    Panel(Modifier.widthIn(max = T.receiptMaxWidth).fillMaxWidth(), radius = T.receiptRadius, padding = 0.dp) {
        Column(Modifier.padding(horizontal = T.receiptPaddingX, vertical = T.receiptPaddingY), verticalArrangement = Arrangement.spacedBy(T.space4)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { TextLine("${QelvoraCopy.brandName} · ${copy("receipt")}", "data-sm", "ink-muted"); TextLine(reqId, "data-sm", "ink-muted") }
            TextLine(title, "receipt-title")
            rows.forEach { (key, value) -> Column { Row(Modifier.fillMaxWidth().padding(vertical = T.space2), horizontalArrangement = Arrangement.spacedBy(T.space3)) { TextLine(key, "mono-caption", "ink-muted", modifier = Modifier.weight(1f)); TextLine(value, "mono-caption") }; val line = qColor("line"); Canvas(Modifier.fillMaxWidth().height(T.hairline)) { drawLine(line, androidx.compose.ui.geometry.Offset.Zero, androidx.compose.ui.geometry.Offset(size.width, 0f), T.hairline.toPx(), pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(T.space1.toPx(), T.space1.toPx()))) } } }
            Row(Modifier.heightIn(min = T.touchTarget).clickable(role = Role.Button, onClick = onVerify).semantics { contentDescription = copy("signedBy", "name" to name) + ". " + copy("openVerification") }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) { Glyph("sealCheck", T.space8 - T.space1 / 2, qColor("maya-ink")); Column(verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(copy("signedBy", "name" to name), "label", "maya-ink"); TextLine(label, "caption", "ink-muted") } }
        }
    }
}

@Composable
fun SpendLimit(options: List<String> = listOf("$30", "$60", "$120", copy("noLimit")), selected: String? = null, onSelect: (String) -> Unit = {}) {
    SpendLimit(options, selected, remindersOn = null, onSelect = onSelect)
}

@Composable
fun SpendLimit(options: List<String> = listOf("$30", "$60", "$120", copy("noLimit")), selected: String? = null, remindersOn: Boolean?, onSelect: (String) -> Unit = {}) {
    var current by remember(selected) { mutableStateOf(selected) }
    Column(verticalArrangement = Arrangement.spacedBy(T.space3)) {
        TextLine(copy("spendLimit"), "body-strong")
        Column(Modifier.selectableGroup().semantics { contentDescription = copy("monthlyLimitLegend") }, verticalArrangement = Arrangement.spacedBy(T.space2)) {
            options.chunked(2).forEach { pair -> Row(horizontalArrangement = Arrangement.spacedBy(T.space2)) { pair.forEach { option -> Row(Modifier.weight(1f).border(T.hairline, qColor(if (current == option) "ink" else "control-line"), RoundedCornerShape(T.radiusMd)).selectable(current == option, role = Role.RadioButton) { current = option; onSelect(option) }.padding(T.space3), horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) { SelectionDot(current == option); TextLine(option, "data-md") } }; if (pair.size == 1) Spacer(Modifier.weight(1f)) } }
        }
        TextLine(copy(when (remindersOn) { true -> "limitReminders"; false -> "limitRemindersOff"; null -> "limitRemindersUnknown" }), "caption", "ink-muted")
    }
}
