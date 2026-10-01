package com.pantopus.qelvora.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import androidx.core.content.res.ResourcesCompat
import androidx.compose.ui.graphics.toArgb
import com.pantopus.qelvora.R
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.FilterOutputStream
import java.util.UUID

private val growthReplyRenderLock = Mutex()
private const val growthReplyCacheLimit = 128L * 1024 * 1024

/** Only the W7 private reply cache is exposed, through explicit read grants. */
class GrowthReplyFileProvider : FileProvider() {
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        val name = uri.lastPathSegment ?: throw FileNotFoundException()
        if (mode != "r" || uri.pathSegments.size != 2 || uri.pathSegments[0] != "replies" ||
            !name.matches(Regex("reply-v[1-9][0-9]*-[a-f0-9-]{36}\\.pdf"))) throw FileNotFoundException()
        val file = File(requireNotNull(context).cacheDir, "growth-replies/$name")
        if (!file.isFile || System.currentTimeMillis() - file.lastModified() >= 86_400_000) throw FileNotFoundException()
        return super.openFile(uri, mode) ?: throw FileNotFoundException()
    }
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw SecurityException("Read-only reply export")
}

internal fun sameGrowthReplyExport(a: JSONObject, b: JSONObject) =
    listOf("id", "text", "sourceHash", "authorLabel", "authorKind", "verificationURL", "version")
        .all { a.get(it) == b.get(it) }

/** Each document owns its canvas. No UI thread drawing or shared PDF state. */
internal suspend fun growthReplyDocument(context: Context, source: JSONObject): File {
    // withContext can cancel while returning a completed file. Keep its owned
    // path outside that dispatch so the caller cannot lose cleanup custody.
    var created: File? = null
    try {
        return withContext(Dispatchers.IO) {
            check(growthReplyRenderLock.tryLock())
            try {
                val id = source.getString("id")
                UUID.fromString(id)
                val text = source.getString("text")
                val author = source.getString("authorLabel")
                val kind = source.getString("authorKind")
                val version = source.getInt("version")
                val verification = Uri.parse(source.getString("verificationURL"))
                require(text.length <= 128000 && author.length <= 512 && version > 0 &&
                    kind in listOf("human_creator", "approved_draft") && verification.scheme == "https" &&
                    !verification.host.isNullOrEmpty() && verification.userInfo == null &&
                    verification.path == "/share/$id" && verification.query == null && verification.fragment == null)
                val job = currentCoroutineContext()
                job.ensureActive()
                val directory = File(context.cacheDir, "growth-replies")
                require(directory.isDirectory || directory.mkdirs())
                val files = requireNotNull(directory.listFiles())
                files.filter { System.currentTimeMillis() - it.lastModified() >= 86_400_000 }.forEach { require(it.delete()) }
                val retained = requireNotNull(directory.listFiles())
                val used = retained.sumOf { it.length() }
                require(retained.size < 32 && used < growthReplyCacheLimit)
                val remaining = growthReplyCacheLimit - used
                val file = File(directory, "reply-v$version-${UUID.randomUUID()}.pdf")
                created = file
                var complete = false
                try {
                    val approved = kind == "approved_draft"
                    val ink = QelvoraTokens.color(if (approved) "ai-ink" else "on-maya", false).toArgb()
                    fun paint(name: String): TextPaint {
                        val style = requireNotNull(QelvoraTokens.textStyles[name])
                        return TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                            color = ink
                            textSize = style.size
                            typeface = requireNotNull(ResourcesCompat.getFont(context, if (style.family == "serif") R.font.newsreader else R.font.geist))
                            setFontVariationSettings("'opsz' ${style.size}, 'wght' ${style.weight}")
                        }
                    }
                    fun layout(value: String, name: String): StaticLayout {
                        val style = requireNotNull(QelvoraTokens.textStyles[name])
                        val p = paint(name)
                        val natural = p.fontMetrics.descent - p.fontMetrics.ascent
                        return StaticLayout.Builder.obtain(value, 0, value.length, p, 358)
                            .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(true)
                            .setLineSpacing((style.lineHeight - natural).coerceAtLeast(0f), 1f).build()
                    }
                    val header = layout(author, "label")
                    val footer = layout(QelvoraCopy.text("growthVerifyThisImmutableVersion", mapOf(
                        "value1" to version.toString(), "value2" to verification.toString())), "caption")
                    val body = layout(text, if (approved) "body" else "voice-md")
                    val top = 16 + header.height + 16
                    val bottom = 844 - 16 - footer.height - 16
                    require(bottom - top >= 96)
                    fun draw(canvas: Canvas, value: StaticLayout, x: Float, y: Float) {
                        canvas.save()
                        try { canvas.translate(x, y); value.draw(canvas) } finally { canvas.restore() }
                    }
                    val document = PdfDocument()
                    try {
                        var first = 0
                        var pages = 0
                        while (first < body.lineCount) {
                            job.ensureActive()
                            require(pages < 8192)
                            val start = body.getLineTop(first)
                            var after = first + 1
                            require(body.getLineBottom(first) - start <= bottom - top)
                            while (after < body.lineCount && body.getLineBottom(after) - start <= bottom - top) after++
                            val page = document.startPage(PdfDocument.PageInfo.Builder(390, 844, ++pages).create())
                            try {
                                page.canvas.drawColor(QelvoraTokens.color(if (approved) "ai-surface" else "maya-surface", false).toArgb())
                                draw(page.canvas, header, 16f, 16f)
                                draw(page.canvas, footer, 16f, (844 - 16 - footer.height).toFloat())
                                page.canvas.save()
                                try {
                                    page.canvas.clipRect(16f, top.toFloat(), 374f, (top + body.getLineBottom(after - 1) - start).toFloat())
                                    draw(page.canvas, body, 16f, (top - start).toFloat())
                                } finally { page.canvas.restore() }
                            } finally { document.finishPage(page) }
                            first = after
                        }
                        job.ensureActive()
                        file.outputStream().use { output ->
                            val bounded = object : FilterOutputStream(output) {
                                var bytes = 0L
                                override fun write(value: Int) { job.ensureActive(); require(++bytes <= remaining); out.write(value) }
                                override fun write(values: ByteArray, start: Int, length: Int) {
                                    job.ensureActive(); bytes += length; require(bytes <= remaining); out.write(values, start, length)
                                }
                            }
                            document.writeTo(bounded)
                        }
                    } finally { document.close() }
                    job.ensureActive()
                    complete = true
                    file
                } finally { if (!complete) file.delete() }
            } finally { growthReplyRenderLock.unlock() }
        }
    } catch (failure: Throwable) {
        created?.delete()
        throw failure
    }
}
