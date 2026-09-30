package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.round
import kotlin.math.min
import androidx.core.graphics.PathParser
import com.pantopus.qelvora.generated.QelvoraTokens
import kotlinx.serialization.json.*

/** Exact source SVG commands; generated assets own path geometry and color references. */
@Composable
fun Glyph(name: String, size: Dp = QelvoraTokens.space4, ink: Color = qColor("ink"), cut: Color = qColor("surface")) {
    val context = LocalContext.current
    val shapes = remember(context) { context.assets.open("Glyphs.json").bufferedReader().use { Json.parseToJsonElement(it.readText()).jsonObject } }
    val glyph = requireNotNull(shapes[name]) { "Unknown glyph: $name" }.jsonObject
    val box = glyph.getValue("box").jsonArray.map { it.jsonPrimitive.float }
    val aspect = glyph.getValue("aspect").jsonPrimitive.float
    val night = LocalNight.current
    fun resolve(value: String): Color {
        if (value == "currentColor") return ink
        if (value.contains("qv-cut")) return cut
        val token = Regex("var\\(--([a-z-]+)").find(value)?.groupValues?.get(1)
        return if (token != null) QelvoraTokens.color(token, night) else ink
    }
    Canvas(Modifier.size(round(size.value * aspect).dp, size).clearAndSetSemantics {}) {
        fun JsonObject.number(key: String, fallback: Float = 0f) = this[key]?.jsonPrimitive?.floatOrNull ?: fallback
        val scale = min(this.size.width / box[2], this.size.height / box[3])
        withTransform({ translate((this@Canvas.size.width - box[2] * scale) / 2, (this@Canvas.size.height - box[3] * scale) / 2); scale(scale, scale, Offset.Zero) }) {
            for (element in glyph.getValue("shapes").jsonArray) {
                val shape = element.jsonObject
                val fill = shape["fill"]?.jsonPrimitive?.content?.takeUnless { it == "none" }?.let(::resolve)
                val stroke = shape["stroke"]?.jsonPrimitive?.content?.takeUnless { it == "none" }?.let(::resolve)
                val dash = shape["strokeDasharray"]?.jsonPrimitive?.content?.split(Regex("[ ,]+"))?.mapNotNull { it.toFloatOrNull() }?.toFloatArray()
                val strokeStyle = Stroke(shape.number("strokeWidth", 1.5f), cap = if (shape["strokeLinecap"]?.jsonPrimitive?.content == "round") StrokeCap.Round else StrokeCap.Butt, join = if (shape["strokeLinejoin"]?.jsonPrimitive?.content == "round") StrokeJoin.Round else StrokeJoin.Miter, pathEffect = dash?.let { PathEffect.dashPathEffect(it) })
                when (shape.getValue("kind").jsonPrimitive.content) {
                    "path" -> {
                        val path = requireNotNull(PathParser.createPathFromPathData(shape.getValue("d").jsonPrimitive.content)).asComposePath()
                        if (fill != null) drawPath(path, fill)
                        if (stroke != null) drawPath(path, stroke, style = strokeStyle)
                    }
                    "circle" -> {
                        val center = Offset(shape.number("cx"), shape.number("cy")); val radius = shape.number("r")
                        if (fill != null) drawCircle(fill, radius, center)
                        if (stroke != null) drawCircle(stroke, radius, center, style = strokeStyle)
                    }
                    "rect" -> {
                        val top = Offset(shape.number("x"), shape.number("y")); val bounds = Size(shape.number("width"), shape.number("height")); val radius = CornerRadius(shape.number("rx"))
                        if (fill != null) drawRoundRect(fill, top, bounds, radius)
                        if (stroke != null) drawRoundRect(stroke, top, bounds, radius, style = strokeStyle)
                    }
                    else -> error("Unsupported SVG shape")
                }
            }
        }
    }
}
