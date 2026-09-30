@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens

@Composable
fun Message(kind: MessageKind = MessageKind.AI, children: String = "", name: String = "Maya", member: String = "Priya", time: String? = null, delivery: Delivery? = null, treatment: DraftTreatment = DraftTreatment.SPLIT, citation: (@Composable () -> Unit)? = null, live: Boolean = false, meta: String? = null, after: (@Composable () -> Unit)? = null, actions: Boolean = true, sponsor: String? = null, onRetry: () -> Unit = {}, onHelped: () -> Unit = {}, onReport: () -> Unit = {}, onVerify: () -> Unit = {}) {
    val fan = kind == MessageKind.FAN
    val bubble = if (fan) RoundedCornerShape(QelvoraTokens.radiusLg, QelvoraTokens.radiusLg, QelvoraTokens.radiusTail, QelvoraTokens.radiusLg) else if (kind == MessageKind.HUMAN_CREATOR) RoundedCornerShape(QelvoraTokens.radiusTail, QelvoraTokens.space4, QelvoraTokens.space4, QelvoraTokens.space4) else RoundedCornerShape(QelvoraTokens.radiusTail, QelvoraTokens.radiusLg, QelvoraTokens.radiusLg, QelvoraTokens.radiusLg)
    Box(Modifier.fillMaxWidth(), contentAlignment = if (fan) Alignment.TopEnd else Alignment.TopStart) {
        Column(Modifier.widthIn(max = if (fan) QelvoraTokens.fanMessageMaxWidth else QelvoraTokens.messageMaxWidth), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.authorGap), horizontalAlignment = if (fan) Alignment.End else Alignment.Start) {
            when (kind) {
                MessageKind.FAN -> {
                    BasicText(children, Modifier.background(qColor("surface-sunken"), bubble).alpha(if (delivery == Delivery.PENDING) .6f else 1f).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space2 + QelvoraTokens.space1 / 2), qText("body").copy(color = qColor("ink")))
                    if (delivery == Delivery.PENDING) BasicText(QelvoraCopy.text("sending"), style = qText("caption").copy(color = qColor("ink-muted")))
                    else if (delivery == Delivery.FAILED) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2)) { BasicText(QelvoraCopy.text("notSent"), style = qText("caption", true).copy(color = qColor("alert"))); Button(QelvoraCopy.text("retry"), ButtonVariant.QUIET, onClick = onRetry) }
                    else if (meta != null) BasicText(meta, style = qText("data-sm").copy(color = qColor("ink-muted")))
                    after?.invoke()
                }
                MessageKind.AI -> {
                    AuthorLabel(time = time, name = name)
                    Column(Modifier.fillMaxWidth().background(qColor("ai-surface"), bubble).border(1.dp, qColor("ai-line"), bubble).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space3)) {
                        if (sponsor != null) BasicText(QelvoraCopy.text("sponsorDisclosure", mapOf("name" to name, "brand" to sponsor)), style = qText("caption").copy(color = qColor("ink-muted")))
                        if (delivery == Delivery.ACCEPTED) {
                            val ai = qColor("ai-ink")
                            Canvas(Modifier.size(QelvoraTokens.space6, QelvoraTokens.authorGap).semantics { contentDescription = QelvoraCopy.text("aiWriting", mapOf("name" to name)) }) { repeat(3) { drawCircle(ai.copy(alpha = .35f), radius = QelvoraTokens.authorGap.toPx()/2, center = Offset(it * 10.dp.toPx() + 3.dp.toPx(), this.size.height/2)) } }
                        } else BasicText(children + if (delivery == Delivery.STREAMING) " ▏" else "", style = qText("body").copy(color = qColor("ink")))
                        citation?.invoke()
                        if (delivery == Delivery.INTERRUPTED) BasicText(QelvoraCopy.text("interrupted").uppercase(), Modifier.border(1.dp, qColor("line"), RoundedCornerShape(QelvoraTokens.radiusPill)).padding(horizontal = QelvoraTokens.space2, vertical = QelvoraTokens.space1 / 2), qText("data-sm").copy(color = qColor("ink-muted")))
                    }
                    if (actions) Row(horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space1)) { Button(QelvoraCopy.text("thisHelped"), ButtonVariant.QUIET, onClick = onHelped); Button(QelvoraCopy.text("report"), ButtonVariant.QUIET, onClick = onReport) }
                }
                MessageKind.TEAM -> { AuthorLabel(AuthorKind.TEAM, name, member = member, time = time); BasicText(children, Modifier.fillMaxWidth().background(qColor("team-surface"), bubble).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3), qText("body").copy(color = qColor("ink"))) }
                MessageKind.HUMAN_CREATOR -> Column(Modifier.fillMaxWidth().then(if (live) Modifier.qShadow("glow-maya", QelvoraTokens.space4) else Modifier).qShadow("shadow-plate", QelvoraTokens.space4).background(qColor("maya-surface"), bubble).padding(horizontal = QelvoraTokens.space4, vertical = QelvoraTokens.messagePadding), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space2 + QelvoraTokens.space1 / 2)) { AuthorLabel(AuthorKind.HUMAN_CREATOR, name, time = time, onMaya = true); BasicText(children, style = qText("voice-lg").copy(color = qColor("on-maya"))); SignedMarker(name, onMaya = true, onClick = onVerify) }
                MessageKind.APPROVED_DRAFT -> {
                    when (treatment) {
                        DraftTreatment.SPLIT -> Column(Modifier.fillMaxWidth().clip(bubble).border(QelvoraTokens.hairline, qColor("maya-line"), bubble)) {
                            Column(Modifier.fillMaxWidth().background(qColor("ai-surface")).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.composerGap)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.authorGap), verticalAlignment = Alignment.CenterVertically) { Mark(); TextLine(copy("preparedByAI"), "caption", "ai-ink", true) }
                                TextLine(children, "body")
                            }
                            FlowRow(Modifier.fillMaxWidth().background(qColor("maya-surface")).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.composerGap), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space1)) {
                                Row(Modifier.heightIn(min = QelvoraTokens.space6), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2), verticalAlignment = Alignment.CenterVertically) { Seal(initial = name.take(1), onMaya = true); TextLine(copy("approvedBy", "name" to name), "caption", "maya-accent", true) }
                                SignedMarker(name, time, onMaya = true, onClick = onVerify)
                            }
                        }
                        DraftTreatment.GRADIENT -> Column(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(qColor("ai-ink"), qColor("maya-ink"))), bubble).padding(QelvoraTokens.hairline * 1.5f)) {
                            Column(Modifier.fillMaxWidth().background(qColor("ai-surface"), RoundedCornerShape(QelvoraTokens.radiusTail - QelvoraTokens.hairline, QelvoraTokens.radiusLg - QelvoraTokens.hairline, QelvoraTokens.radiusLg - QelvoraTokens.hairline, QelvoraTokens.radiusLg - QelvoraTokens.hairline)).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space2)) {
                                AuthorLabel(AuthorKind.APPROVED_DRAFT, name, time = time)
                                TextLine(children, "body")
                                SignedMarker(name, time, onClick = onVerify)
                            }
                        }
                        DraftTreatment.STACKED -> Column(Modifier.fillMaxWidth().clip(bubble).background(qColor("ai-surface")).border(QelvoraTokens.hairline, qColor("line"), bubble)) {
                            Column(Modifier.fillMaxWidth().background(qColor("ground")).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space2)) {
                                Row(Modifier.heightIn(min = QelvoraTokens.space5), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2), verticalAlignment = Alignment.CenterVertically) { Glyph("ring", QelvoraTokens.authorLabelSize + QelvoraTokens.hairline, qColor("ai-ink")); TextLine(copy("preparedByAI"), "caption", "ai-ink", true) }
                                Row(Modifier.heightIn(min = QelvoraTokens.space5), horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.space2), verticalAlignment = Alignment.CenterVertically) { Seal(name.take(1), QelvoraTokens.authorLabelSize + QelvoraTokens.hairline); TextLine(copy("approvedBy", "name" to name), "caption", "maya-ink", true); time?.let { TextLine("· $it", "data-sm", "ink-muted") } }
                            }
                            Hairline()
                            Column(Modifier.padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3)) { TextLine(children, "body"); SignedMarker(name, time, onClick = onVerify) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun Note(children: String, name: String = "Maya", audience: String = "Kiln Club members", audienceSize: String? = null, time: String? = null, media: String? = null, reply: Boolean = true, replyId: String = "qelvora-note-reply", retracted: Boolean = false, onVerify: () -> Unit = {}) {
    var replyText by remember { mutableStateOf("") }
    val shape = RoundedCornerShape(QelvoraTokens.space4, QelvoraTokens.radiusTail, QelvoraTokens.space4, QelvoraTokens.space4)
    if (retracted) { BasicText(QelvoraCopy.text("noteRemoved", mapOf("name" to name)), Modifier.fillMaxWidth().dashedBorder(qColor("line"), QelvoraTokens.radiusLg).padding(QelvoraTokens.messagePadding), qText("label").copy(color = qColor("ink-muted"))); return }
    val ground = qColor("ground"); val foldInk = androidx.compose.ui.graphics.Color.White.copy(alpha = QelvoraTokens.noteFoldOpacity)
    Box(Modifier.fillMaxWidth().qShadow("shadow-plate", QelvoraTokens.space4).clip(shape).background(qColor("maya-surface"))) {
        Column {
            Box(Modifier.fillMaxWidth().padding(start = QelvoraTokens.space4, end = QelvoraTokens.welcomeBottom, top = QelvoraTokens.authorLabelSize, bottom = QelvoraTokens.authorLabelSize)) { AuthorLabel(AuthorKind.HUMAN_BROADCAST, name, audience, time = time, onMaya = true) }
            Column(Modifier.fillMaxWidth().padding(QelvoraTokens.space4), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.messagePadding)) {
                BasicText(children, style = qText("voice-lg").copy(color = qColor("on-maya")))
                if (media != null) Row(Modifier.fillMaxWidth().height(QelvoraTokens.noteMediaHeight).dashedBorder(androidx.compose.ui.graphics.Color.White.copy(alpha = QelvoraTokens.noteMediaOpacity), QelvoraTokens.segmentRadius), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { Glyph("image", QelvoraTokens.limitRadioSize, qColor("on-maya-muted")); Spacer(Modifier.width(QelvoraTokens.space2)); BasicText(media, style = qText("label").copy(color = qColor("on-maya-muted"))) }
                SignedMarker(name, extra = audienceSize?.let { "$it members" }, onMaya = true, onClick = onVerify)
            }
            if (reply) Column(Modifier.fillMaxWidth().background(ground).padding(QelvoraTokens.space4), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.authorGap)) {
                BasicText(QelvoraCopy.text("noteReplyLabel", mapOf("name" to name)), style = qText("caption", true).copy(color = qColor("ink-muted")))
                val fieldInk = qColor("ink"); val fieldMuted = qColor("ink-muted")
                BasicTextField(replyText, { replyText = it }, Modifier.fillMaxWidth().heightIn(min = QelvoraTokens.touchTarget).background(qColor("surface"), RoundedCornerShape(QelvoraTokens.radiusMd)).border(1.dp, qColor("control-line"), RoundedCornerShape(QelvoraTokens.radiusMd)).padding(horizontal = QelvoraTokens.messagePadding, vertical = QelvoraTokens.space3).semantics { contentDescription = QelvoraCopy.text("noteReplyLabel", mapOf("name" to name)) }, textStyle = qText("body").copy(color = fieldInk), decorationBox = { field -> if (replyText.isEmpty()) BasicText(QelvoraCopy.text("writeReply"), style = qText("body").copy(color = fieldMuted)); field() })
                BasicText(QelvoraCopy.text("noteReplies", mapOf("name" to name)), style = qText("caption").copy(color = qColor("ink-muted")))
            }
        }
        Canvas(Modifier.size(QelvoraTokens.noteFold).align(Alignment.TopEnd)) { val fold = Path().apply { moveTo(0f,0f); lineTo(size.width,0f); lineTo(size.width,size.height); close() }; drawPath(fold,ground); val underside = Path().apply { moveTo(0f,0f); lineTo(0f,size.height); lineTo(size.width,size.height); close() }; drawPath(underside,foldInk) }
    }
}
