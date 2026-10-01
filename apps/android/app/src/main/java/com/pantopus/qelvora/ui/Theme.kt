@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package com.pantopus.qelvora.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.unit.sp
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import com.pantopus.qelvora.R
import com.pantopus.qelvora.generated.QelvoraTokens

val LocalNight = staticCompositionLocalOf { false }
private val sans = FontFamily(Font(R.font.geist), Font(R.font.geist_italic, style = FontStyle.Italic))
private val serif = FontFamily(Font(R.font.newsreader), Font(R.font.newsreader_italic, style = FontStyle.Italic))
private val mono = FontFamily(Font(R.font.geist_mono))
private val families = java.util.concurrent.ConcurrentHashMap<String, FontFamily>()
private fun nativeFamily(family: String, size: Float, weight: Int, italic: Boolean = false): FontFamily = families.getOrPut("$family:$size:$weight:$italic") {
    val resource = when (family) { "serif" -> if (italic) R.font.newsreader_italic else R.font.newsreader; "mono" -> R.font.geist_mono; else -> if (italic) R.font.geist_italic else R.font.geist }
    FontFamily(Font(resource, weight = FontWeight(weight), style = if (italic) FontStyle.Italic else FontStyle.Normal, variationSettings = FontVariation.Settings(FontVariation.Setting("opsz", size), FontVariation.weight(weight))))
}

@Composable
fun QelvoraTheme(night: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalNight provides night, content = content)
}

@Composable
fun qColor(name: String): Color = QelvoraTokens.color(name, LocalNight.current)

/** Rasterize the CSS shadow once per measured size; spread and blur do not alter layout. */
@Composable
fun Modifier.qShadow(name: String, radius: Dp = QelvoraTokens.radiusLg): Modifier {
    val shadow = QelvoraTokens.shadow(name, LocalNight.current)
    return this.drawWithCache {
        val blur = shadow.blur.toPx() / 2
        val spread = shadow.spread.toPx()
        val pad = kotlin.math.ceil(blur * 3 + kotlin.math.abs(spread)).toInt()
        val bitmap = android.graphics.Bitmap.createBitmap((size.width.toInt() + pad * 2).coerceAtLeast(1), (size.height.toInt() + pad * 2).coerceAtLeast(1), android.graphics.Bitmap.Config.ARGB_8888)
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = shadow.color.toArgb(); if (blur > 0) maskFilter = android.graphics.BlurMaskFilter(blur, android.graphics.BlurMaskFilter.Blur.NORMAL) }
        val rounded = (radius.toPx() + spread).coerceAtLeast(0f)
        android.graphics.Canvas(bitmap).drawRoundRect(pad - spread, pad - spread, pad + size.width + spread, pad + size.height + spread, rounded, rounded, paint)
        onDrawBehind { drawIntoCanvas { it.nativeCanvas.drawBitmap(bitmap, shadow.x.toPx() - pad, shadow.y.toPx() - pad, null) } }
    }
}

fun qText(name: String, strong: Boolean = false): TextStyle {
    val style = requireNotNull(QelvoraTokens.textStyles[name]) { "Unknown text style: $name" }
    return TextStyle(
        fontFamily = nativeFamily(style.family, style.size, if (strong) 600 else style.weight),
        fontSize = style.size.sp,
        lineHeight = style.lineHeight.sp,
        fontWeight = FontWeight(if (strong) 600 else style.weight),
        letterSpacing = (style.letterSpacing * style.size).sp,
    )
}

fun welcomeTitleStyle() = TextStyle(fontFamily = nativeFamily("serif", QelvoraTokens.welcomeTitle.value, 400), fontSize = QelvoraTokens.welcomeTitle.value.sp, lineHeight = QelvoraTokens.welcomeTitleLine.value.sp, fontWeight = FontWeight.Normal, letterSpacing = (QelvoraTokens.welcomeTitle.value * -0.025f).sp)
fun wordmarkStyle() = TextStyle(fontFamily = nativeFamily("serif", QelvoraTokens.welcomeWordmark.value, 400, true), fontSize = QelvoraTokens.welcomeWordmark.value.sp, fontStyle = FontStyle.Italic)

enum class AuthorKind(val wire: String) {
    AI("ai"), APPROVED_DRAFT("approved_draft"), HUMAN_CREATOR("human_creator"), HUMAN_BROADCAST("human_broadcast"), HUMAN_REACTION("human_reaction"), TEAM("team"), CORRECTION("correction");
    fun label(name: String = "Maya", audience: String = "Kiln Club members", member: String = "Priya"): String {
        val values = mapOf("name" to name, "audience" to audience, "member" to member)
        return when (this) {
            HUMAN_CREATOR -> name
            else -> com.pantopus.qelvora.generated.QelvoraCopy.text(when (this) {
                AI -> "aiAuthor"; APPROVED_DRAFT -> "approvedAuthor"; HUMAN_BROADCAST -> "noteAudience"; HUMAN_REACTION -> "reaction"; TEAM -> "teamAuthor"; CORRECTION -> "correctionAuthor"; HUMAN_CREATOR -> error("unreachable")
            }, values)
        }
    }
    fun colorToken(onMaya: Boolean = false) = when (this) { AI -> "ai-ink"; TEAM -> "team-ink"; else -> if (onMaya) "maya-accent" else "maya-ink" }
}

enum class MessageKind(val wire: String) { FAN("fan"), AI("ai"), TEAM("team"), HUMAN_CREATOR("human_creator"), APPROVED_DRAFT("approved_draft") }
enum class Delivery { PENDING, FAILED, ACCEPTED, STREAMING, INTERRUPTED }
enum class DraftTreatment { SPLIT, GRADIENT, STACKED }
