package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.BasicText
import com.pantopus.qelvora.R
import com.pantopus.qelvora.generated.QelvoraTokens

@Composable
fun Seal(initial: String = "M", size: Dp = 18.dp, live: Boolean = false, onMaya: Boolean = false) {
    val fill = qColor(if (onMaya) "maya-accent" else "seal-fill"); val ink = qColor(if (onMaya) "on-maya-accent" else "seal-ink"); val accent = qColor("maya-accent"); val ground = qColor("ground")
    Box(Modifier.size(size).clearAndSetSemantics {}, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            if (live) { drawCircle(accent, radius = this.size.width / 2 + 4.dp.toPx()); drawCircle(ground, radius = this.size.width / 2 + 3.dp.toPx()) }
            drawCircle(fill)
        }
        BasicText(initial, style = TextStyle(color = ink, fontFamily = FontFamily(Font(R.font.newsreader_italic, style = FontStyle.Italic)), fontSize = (size.value * 0.62f).sp))
    }
}

@Composable
fun Mark(kind: AuthorKind = AuthorKind.AI, size: Dp? = null, initial: String = "M", live: Boolean = false, onMaya: Boolean = false) {
    val side = size ?: if (kind in listOf(AuthorKind.HUMAN_CREATOR, AuthorKind.HUMAN_BROADCAST, AuthorKind.APPROVED_DRAFT)) 16.dp else 14.dp
    if (kind == AuthorKind.HUMAN_CREATOR) { Seal(initial, side, live, onMaya); return }
    Glyph(when(kind) {
        AuthorKind.AI -> "ring"
        AuthorKind.APPROVED_DRAFT -> "approved"
        AuthorKind.HUMAN_BROADCAST -> "broadcast"
        AuthorKind.HUMAN_REACTION -> "heart"
        AuthorKind.TEAM -> "team"
        AuthorKind.CORRECTION -> "correction"
        AuthorKind.HUMAN_CREATOR -> error("unreachable")
    }, side, qColor(kind.colorToken(onMaya)))
}

@Composable
fun AuthorLabel(kind: AuthorKind = AuthorKind.AI, name: String = "Maya", audience: String = "Kiln Club members", member: String = "Priya", time: String? = null, onMaya: Boolean = false) {
    Row(Modifier.clearAndSetSemantics { contentDescription = kind.label(name, audience, member) + (time?.let { " at $it" } ?: "") }, horizontalArrangement = Arrangement.spacedBy(QelvoraTokens.authorGap), verticalAlignment = Alignment.CenterVertically) {
        Mark(kind, initial = name.take(1), onMaya = onMaya)
        val ai = qColor("ai-ink"); val creator = qColor(kind.colorToken(onMaya))
        val label = buildAnnotatedString {
            if (kind == AuthorKind.APPROVED_DRAFT) { withStyle(SpanStyle(color = ai)) { append(copy("preparedByAI")) }; withStyle(SpanStyle(color = creator)) { append(" · " + copy("approvedBy", "name" to name)) } }
            else withStyle(SpanStyle(color = creator)) { append(kind.label(name, audience, member)) }
        }
        BasicText(label, style = qText("caption", strong = true))
        if (time != null) BasicText("· $time", style = qText("data-sm").copy(color = qColor(if (onMaya) "on-maya-muted" else "ink-muted")))
    }
}
