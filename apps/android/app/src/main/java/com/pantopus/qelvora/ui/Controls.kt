package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens

enum class ButtonVariant { AI, MAYA, SECONDARY, QUIET }

@Composable
fun Button(title: String, variant: ButtonVariant = ButtonVariant.AI, size: String = "regular", block: Boolean = false, initial: String = "M", disabled: Boolean = false, disabledReason: String? = null, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    val shape = RoundedCornerShape(QelvoraTokens.radiusLg)
    val fill = when (variant) { ButtonVariant.AI -> qColor("ai-ink"); ButtonVariant.MAYA -> qColor("maya-surface"); else -> Color.Transparent }
    val ink = qColor(when (variant) { ButtonVariant.AI -> "on-ai"; ButtonVariant.MAYA -> "on-maya"; else -> "ink" })
    Column(verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space1)) {
        var controlModifier = modifier.heightIn(min = if (variant == ButtonVariant.QUIET) QelvoraTokens.touchTarget else if (size == "lg") QelvoraTokens.buttonLg else QelvoraTokens.space12)
        if (block) controlModifier = controlModifier.fillMaxWidth()
        controlModifier = Modifier.alpha(if (disabled) .55f else 1f).then(controlModifier).background(fill, shape)
        if (variant in listOf(ButtonVariant.SECONDARY, ButtonVariant.MAYA)) controlModifier = controlModifier.border(1.dp, qColor(if (variant == ButtonVariant.MAYA) "maya-line" else "control-line"), shape)
        Row(controlModifier.clickable(enabled = !disabled, role = Role.Button, onClick = onClick).padding(horizontal = if (variant == ButtonVariant.QUIET) QelvoraTokens.space3 else QelvoraTokens.space5), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2 + QelvoraTokens.space1 / 2), verticalAlignment = Alignment.CenterVertically) {
            if (block) Spacer(Modifier.weight(1f))
            if (variant == ButtonVariant.MAYA) Seal(initial, QelvoraTokens.welcomeGap, onMaya = true)
            BasicText(title, style = qText(if (size == "lg") "button-lg" else "body-strong").copy(color = ink))
            if (block) Spacer(Modifier.weight(1f))
        }
        if (disabled && disabledReason != null) BasicText(disabledReason, style = qText("caption").copy(color = qColor("ink-muted")))
    }
}

@Composable
fun SignedMarker(name: String = "Maya", time: String? = null, extra: String? = null, onMaya: Boolean = false, onClick: () -> Unit = {}) {
    val ink = qColor(if (onMaya) "maya-accent" else "maya-ink")
    val cut = qColor(if (onMaya) "maya-surface" else "surface")
    Row(Modifier.heightIn(min = QelvoraTokens.touchTarget).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = QelvoraCopy.text("signedBy", mapOf("name" to name)) + ". " + QelvoraCopy.text("openVerification") }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.authorGap)) {
        Glyph("sealCheck", 13.dp, ink, cut)
        BasicText(QelvoraCopy.text("signedBy", mapOf("name" to name)), style = qText("caption", true).copy(color = ink, textDecoration = TextDecoration.Underline))
        if (time != null) BasicText("· $time", style = qText("data-sm").copy(color = qColor(if (onMaya) "on-maya-muted" else "ink-muted")))
        if (extra != null) BasicText("· $extra", style = qText("data-sm").copy(color = qColor(if (onMaya) "on-maya-muted" else "ink-muted")))
    }
}

@Composable
fun ContextCard(source: String = "From Instagram", title: String, onRemove: () -> Unit = {}) {
    val ink = qColor("ink-muted")
    Row(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(QelvoraTokens.radiusMd)).border(1.dp, qColor("line"), RoundedCornerShape(QelvoraTokens.radiusMd)).padding(start = QelvoraTokens.space3, end = QelvoraTokens.space1, top = QelvoraTokens.space2, bottom = QelvoraTokens.space2), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space3), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space1 / 2)) { BasicText(source.uppercase(), style = qText("data-sm").copy(color = ink)); BasicText(title, style = qText("context-body").copy(color = qColor("ink"))) }
        Box(Modifier.size(QelvoraTokens.touchTarget).clickable(role = Role.Button, onClick = onRemove).semantics { contentDescription = QelvoraCopy.text("removeContext") }, contentAlignment = Alignment.Center) {
            Glyph("close", QelvoraTokens.glyphSize, ink)
        }
    }
}
