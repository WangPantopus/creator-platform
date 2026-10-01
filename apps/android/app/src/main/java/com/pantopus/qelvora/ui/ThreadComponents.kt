package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T

internal fun copy(key: String, vararg values: Pair<String, String>) = QelvoraCopy.text(key, mapOf(*values))

@Composable internal fun Hairline(modifier: Modifier = Modifier, color: Color = qColor("line")) { Box(modifier.fillMaxWidth().height(T.hairline).background(color)) }

@Composable internal fun TextLine(text: String, style: String = "control-body", ink: String = "ink", strong: Boolean = false, modifier: Modifier = Modifier) {
    BasicText(text, modifier, qText(style, strong).copy(color = qColor(ink)))
}

@Composable internal fun IconButton(glyph: String, label: String, ink: Color = qColor("ink-muted"), onClick: () -> Unit) {
    Box(Modifier.size(T.touchTarget).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label }, contentAlignment = Alignment.Center) { Glyph(glyph, T.glyphSize, ink) }
}

@Composable internal fun Panel(modifier: Modifier = Modifier, fill: String = "surface", line: String = "line", radius: Dp = T.radiusLg, padding: Dp = T.messagePadding, gap: Dp = T.space3, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.background(qColor(fill), RoundedCornerShape(radius)).border(T.hairline, qColor(line), RoundedCornerShape(radius)).padding(padding), verticalArrangement = Arrangement.spacedBy(gap), content = content)
}

internal fun Modifier.dashedBorder(color: Color, radius: Dp, width: Dp = T.hairline): Modifier = this.then(Modifier.drawDashedBorder(color, radius, width))
private fun Modifier.drawDashedBorder(color: Color, radius: Dp, width: Dp) = this.drawWithContent {
    drawContent()
    val inset = width.toPx() / 2
    drawRoundRect(color, topLeft = Offset(inset, inset), size = Size(size.width - inset * 2, size.height - inset * 2), cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius.toPx()), style = Stroke(width.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(T.space1.toPx(), T.space1.toPx()))))
}

@Composable
fun Avatar(initial: String = "M", live: Boolean = false) {
    val shape = RoundedCornerShape(T.avatarRadius)
    val fill = qColor("maya-surface"); val accent = qColor("maya-accent"); val ground = qColor("ground")
    Box(Modifier.size(T.avatarSize).then(if (live) Modifier.shadow(T.space5, shape, ambientColor = accent, spotColor = accent).border(T.space1, accent, shape).border(T.space3 / 4, ground, shape) else Modifier).background(fill, shape), contentAlignment = Alignment.Center) {
        BasicText(initial, style = wordmarkStyle().copy(color = accent))
    }
}

enum class IdentityState { AI, HUMAN, TEAM, PAUSED, UPDATING }
@Composable
fun IdentityStrip(state: IdentityState = IdentityState.AI, name: String = "Maya") {
    val human = state == IdentityState.HUMAN
    val fill = qColor(if (human) "maya-surface" else if (state in listOf(IdentityState.PAUSED, IdentityState.UPDATING)) "surface-sunken" else "surface")
    val ink = qColor(if (human) "on-maya" else "ink")
    val leadInk = qColor(when (state) { IdentityState.HUMAN -> "maya-accent"; IdentityState.TEAM -> "team-ink"; IdentityState.PAUSED -> "ink-muted"; else -> "ai-ink" })
    val text = when (state) {
        IdentityState.AI -> copy("identityStrip", "name" to name)
        IdentityState.HUMAN -> copy("takeover", "name" to name) + copy("humanStripRest")
        IdentityState.TEAM -> copy("teamStripLead", "name" to name) + copy("teamStripRest", "name" to name)
        IdentityState.PAUSED -> copy("aiPaused", "name" to name)
        IdentityState.UPDATING -> copy("updatingAI", "name" to name) + copy("requestsStillWork")
    }
    Column(Modifier.background(fill).semantics { liveRegion = LiveRegionMode.Polite }) {
        Row(Modifier.fillMaxWidth().heightIn(min = T.stripMinHeight).padding(horizontal = T.space4, vertical = T.composerGap), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) {
            if (human) Seal(name.take(1), T.glyphSize, true, onMaya = true) else Box(Modifier.size(T.glyphSize).border(T.hairline, leadInk, RoundedCornerShape(T.stripBoxRadius)), contentAlignment = Alignment.Center) { Glyph(when (state) { IdentityState.TEAM -> "team"; IdentityState.PAUSED -> "pause"; else -> "ring" }, T.space3, leadInk) }
            BasicText(text, style = qText("label").copy(color = ink, fontWeight = FontWeight.Normal))
        }
        Hairline(color = qColor(if (human) "maya-line" else "line"))
    }
}

@Composable
fun ThreadHeader(name: String = "Maya", subtitle: String = copy("officialAISubtitle"), live: Boolean = false, onBack: () -> Unit = {}, onAbout: () -> Unit = {}) {
    Column(Modifier.background(qColor("ground"))) {
        Row(Modifier.fillMaxWidth().padding(start = T.space1, end = T.space3, top = T.composerGap, bottom = T.composerGap), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space3)) {
            IconButton("back", copy("back"), qColor("ink"), onBack)
            Avatar(name.take(1), live)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(name, "title"); TextLine(if (live) copy("inConversation") else subtitle, "data-sm", if (live) "maya-ink" else "ink-muted") }
            IconButton("info", copy("aboutConversation"), onClick = onAbout)
        }
        Hairline()
    }
}

enum class SystemLineVariant { PLAIN, PRESENCE, DATE }
@Composable
fun SystemLine(text: String = "", variant: SystemLineVariant = SystemLineVariant.PLAIN, name: String = "Maya", time: String? = null) {
    val line = qColor("line")
    Row(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space3)) {
        if (variant != SystemLineVariant.DATE) Box(Modifier.weight(1f).height(T.hairline).background(line))
        if (variant == SystemLineVariant.PRESENCE) {
            Row(Modifier.background(qColor("maya-surface"), CircleShape).padding(start = T.authorGap, end = T.space3, top = T.authorGap, bottom = T.authorGap), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space2)) {
                Seal(name.take(1), T.limitRadioSize, onMaya = true)
                TextLine(copy("takeover", "name" to name), "caption", "maya-accent", true)
                time?.let { TextLine(it, "data-sm", "on-maya-muted") }
            }
        } else TextLine(text, if (variant == SystemLineVariant.DATE) "data-sm" else "label", "ink-muted")
        Box(Modifier.weight(1f).height(T.hairline).background(line))
    }
}

@Composable
fun ReactionChip(name: String = "Maya") {
    Row(Modifier.background(qColor("maya-surface"), CircleShape).padding(start = T.authorGap, end = T.space3, top = T.authorGap, bottom = T.authorGap), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
        Seal(name.take(1), T.glyphSize, onMaya = true); Glyph("heart", T.authorLabelSize + T.hairline, qColor("maya-accent")); TextLine(copy("reaction", "name" to name), "caption", "on-maya", true)
    }
}

@Composable
fun CitationChip(title: String = copy("source"), meta: String = "", stamp: String? = null, unavailable: Boolean = false, onOpen: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(T.chipRadius)).border(T.hairline, qColor("ai-line"), RoundedCornerShape(T.chipRadius)).clickable(enabled = !unavailable, role = Role.Button, onClick = onOpen).padding(horizontal = T.composerGap, vertical = T.space2), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
        if (!unavailable) Box(Modifier.size(T.citationStampWidth, T.citationStampHeight).background(qColor("ai-surface"), RoundedCornerShape(T.skeletonRadius)), contentAlignment = Alignment.Center) { if (stamp != null) TextLine(stamp, "data-sm", "ai-ink") else Glyph("play", T.space3, qColor("ai-ink")) }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) { TextLine(title, "caption", if (unavailable) "ink-muted" else "ink", true); TextLine(if (unavailable) copy("sourceUnavailable") else meta, "data-sm", "ink-muted") }
        if (!unavailable) Glyph("chevron", T.space4, qColor("ink-muted"))
    }
}

enum class MemoryVariant { SAVED, ASK }
@Composable
fun MemoryChip(text: String, variant: MemoryVariant = MemoryVariant.SAVED, onRemember: () -> Unit = {}, onForget: () -> Unit = {}, onEdit: () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(T.space2)) {
        Panel(fill = "ai-surface", line = "ai-line", radius = T.radiusMd) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space2)) {
                Glyph("bookmark", T.space4, qColor("ai-ink"))
                TextLine(if (variant == MemoryVariant.ASK) copy("sensitiveMemory") else copy("remembered", "text" to text), "caption", "ai-ink", true, Modifier.weight(1f))
                if (variant == MemoryVariant.SAVED) Button(copy("edit"), ButtonVariant.QUIET, onClick = onEdit)
            }
            if (variant == MemoryVariant.ASK) { TextLine(text); Row(horizontalArrangement = Arrangement.spacedBy(T.space2)) { Button(copy("remember"), ButtonVariant.SECONDARY, onClick = onRemember); Button(copy("dontRemember"), ButtonVariant.QUIET, onClick = onForget) } }
        }
        if (variant == MemoryVariant.SAVED) Button(copy("dontRememberThis"), ButtonVariant.QUIET, onClick = onForget)
    }
}

@Composable
fun Correction(text: String, name: String = "Maya", aiText: String = "", aiTime: String? = null, time: String? = null, onVerify: () -> Unit = {}) {
    Column(Modifier.widthIn(max = T.messageMaxWidth), verticalArrangement = Arrangement.spacedBy(T.authorGap)) {
        AuthorLabel(AuthorKind.AI, name, time = aiTime)
        val bubble = RoundedCornerShape(T.radiusTail, T.radiusLg, T.radiusLg, T.radiusLg)
        Column(Modifier.clip(bubble).border(T.hairline, qColor("ai-line"), bubble)) {
            TextLine(aiText, "body", modifier = Modifier.fillMaxWidth().background(qColor("ai-surface")).padding(horizontal = T.messagePadding, vertical = T.space3))
            Column(Modifier.fillMaxWidth().background(qColor("maya-surface")).padding(horizontal = T.messagePadding, vertical = T.space3), verticalArrangement = Arrangement.spacedBy(T.composerGap)) { AuthorLabel(AuthorKind.CORRECTION, name, onMaya = true); TextLine(text, "voice-md", "on-maya"); SignedMarker(name, time, onMaya = true, onClick = onVerify) }
        }
    }
}

enum class VoiceKind { HUMAN, AI }
@Composable
fun VoiceNote(kind: VoiceKind = VoiceKind.HUMAN, name: String = "Maya", time: String? = null, duration: String = "0:42", transcript: String? = null, playing: Boolean = false, playbackAvailable: Boolean = false, onPlayPause: () -> Unit = {}, onVerify: () -> Unit = {}) {
    val human = kind == VoiceKind.HUMAN
    val ink = qColor(if (human) "maya-accent" else "ai-ink")
    Column(Modifier.widthIn(max = T.skeletonWidth), verticalArrangement = Arrangement.spacedBy(T.authorGap)) {
        if (!human) AuthorLabel(AuthorKind.AI, name, time = time)
        Panel(fill = if (human) "maya-surface" else "ai-surface", line = if (human) "maya-line" else "ai-line") {
            if (human) AuthorLabel(AuthorKind.HUMAN_CREATOR, name, time = time, onMaya = true) else TextLine(copy("aiVoiceDisclosure", "name" to name), "caption", "ai-ink", true)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.composerGap)) {
                Box(Modifier.size(T.touchTarget).background(ink, CircleShape).clickable(enabled = playbackAvailable, role = Role.Button, onClick = onPlayPause).semantics { contentDescription = copy(if (playing) "pauseVoiceNote" else "playVoiceNote") }, contentAlignment = Alignment.Center) { Glyph(if (playing) "pause" else "play", T.space4, qColor(if (human) "on-maya-accent" else "on-ai")) }
                val bars = listOf(8,14,22,12,18,26,16,10,20,24,14,8,18,22,12,16,26,20,10,14,18,8,12,20,16,10)
                Canvas(Modifier.weight(1f).height(T.welcomeGap)) { val total = bars.size * T.waveBarWidth.toPx() + (bars.size - 1) * T.waveGap.toPx(); val scale = size.width / total; bars.forEachIndexed { index, value -> val h = value.dp.toPx(); drawRoundRect(ink.copy(alpha = .55f), Offset(index * (T.waveBarWidth.toPx() + T.waveGap.toPx()) * scale, (size.height-h)/2), Size(T.waveBarWidth.toPx()*scale,h), androidx.compose.ui.geometry.CornerRadius(T.waveRadius.toPx())) } }
                BasicText(duration, style = qText("mono-caption").copy(color = ink))
            }
            transcript?.let { TextLine(it, if (human) "transcript-human" else "transcript-ai", if (human) "on-maya" else "ink") }
            if (human) SignedMarker(name, extra = copy("recordedBy", "name" to name), onMaya = true, onClick = onVerify)
        }
    }
}

@Composable
fun StepIn(name: String = "Maya", disabled: Boolean = false, note: String? = null, onClick: () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(T.space1)) {
        val shape = RoundedCornerShape(T.radiusPill)
        Row(Modifier.height(T.touchTarget).background(qColor(if (disabled) "surface-sunken" else "maya-surface"), shape).border(T.hairline, qColor(if (disabled) "surface-sunken" else "maya-line"), shape).clickable(enabled = !disabled, role = Role.Button, onClick = onClick).padding(start = T.stripBoxRadius, end = T.space4), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
            Seal(name.take(1), T.space8 - T.hairline * 2, onMaya = true)
            TextLine(copy("stepIn", "name" to name), "control-body", if (disabled) "ink-muted" else "on-maya", true)
        }
        if (disabled) TextLine(note ?: copy("fullyBooked", "name" to name), "caption", "ink-muted")
    }
}

enum class ComposerState { AI, TRIAL, PAUSED, ENDED, HUMAN, CAPACITY_ZERO }
@Composable
fun Composer(state: ComposerState = ComposerState.AI, name: String = "Maya", trialLeft: String = "18 H", backDate: String = "Monday", onSend: (String) -> Unit = {}, onAttach: () -> Unit = {}, onStepIn: () -> Unit = {}, onJoin: () -> Unit = {}) {
    var text by remember { mutableStateOf("") }
    val human = state == ComposerState.HUMAN
    val topLine = qColor(if (human) "maya-line" else "line")
    Column(Modifier.fillMaxWidth().background(qColor("ground")).drawWithContent { drawContent(); drawLine(topLine, Offset.Zero, Offset(size.width, 0f), T.hairline.toPx()) }.padding(start = T.space4, end = T.space4, top = T.space3, bottom = T.welcomeGap), verticalArrangement = Arrangement.spacedBy(T.composerGap)) {
        if (state == ComposerState.PAUSED) { TextLine(copy("aiPausedBack", "name" to name, "date" to backDate), "label", "ink-muted"); StepIn(name, onClick = onStepIn) }
        else if (state == ComposerState.ENDED) {
            Panel(Modifier.fillMaxWidth(), radius = T.radiusMd) {
                TextLine(copy("freeConversationEnded"), "body-strong")
                AccessLines(name, can = copy("endCan", "name" to name), included = copy("endIncluded"), changes = copy("endChanges", "name" to name))
                Button(copy("joinClub"), ButtonVariant.SECONDARY, block = true, onClick = onJoin)
            }
            StepIn(name, onClick = onStepIn)
        } else {
            if (state == ComposerState.TRIAL) TextLine(copy("freeConversationCountdown", "left" to trialLeft), "mono-caption", "ink-muted")
            if (!human) StepIn(name, disabled = state == ComposerState.CAPACITY_ZERO, onClick = onStepIn)
            val placeholder = copy(if (human) "replyToCreator" else "messageAI", "name" to name)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(T.space2)) {
                IconButton("plus", copy("attachPhoto"), qColor("ink-muted"), onAttach)
                BasicTextField(text, { text = it }, Modifier.weight(1f).heightIn(min = T.composerInputHeight).background(qColor("surface"), RoundedCornerShape(T.radiusLg)).border(T.hairline, qColor(if (human) "maya-line" else "control-line"), RoundedCornerShape(T.radiusLg)).padding(T.space3).semantics { contentDescription = placeholder }, textStyle = qText("body").copy(color = qColor("ink")), decorationBox = { inner -> if (text.isEmpty()) TextLine(placeholder, "body", "ink-muted"); inner() })
                Box(Modifier.size(T.space12).then(if (human) Modifier.qShadow("glow-maya", T.radiusLg) else Modifier).background(qColor(if (human) "maya-surface" else "ai-ink"), RoundedCornerShape(T.radiusLg)).clickable(enabled = text.isNotBlank(), role = Role.Button) { onSend(text) }.semantics { contentDescription = copy(if (human) "sendToCreator" else "sendToAI", "name" to name) }, contentAlignment = Alignment.Center) { Glyph("send", T.glyphSize, qColor(if (human) "maya-accent" else "on-ai")) }
            }
        }
    }
}
