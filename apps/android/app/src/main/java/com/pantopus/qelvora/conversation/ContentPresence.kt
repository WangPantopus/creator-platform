package com.pantopus.qelvora.conversation

import android.os.SystemClock
import androidx.compose.runtime.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.generated.QelvoraTokens as T
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

/** C4 is read-time Content authority, never a stored message or offline body. */
sealed class ContentPresenceItem {
    data class Note(val value: APIThreadPresenceNote) : ContentPresenceItem()
    data class Reaction(val value: APIThreadPresenceReaction) : ContentPresenceItem()
    val id: String get() = when (this) { is Note -> "note:${value.id}"; is Reaction -> "reaction:${value.id}" }
    val occurredAt: String get() = when (this) { is Note -> value.occurredAt; is Reaction -> value.occurredAt }
    val authorLabel: String get() = when (this) { is Note -> value.authorLabel; is Reaction -> value.authorLabel }
    val accessibleLabel: String get() = when (this) { is Note -> value.authorLabel + ". " + value.text; is Reaction -> value.authorLabel }
    val creatorName: String get() = when (this) { is Note -> value.creatorName; is Reaction -> value.creatorName }
    val signedActId: String get() = when (this) { is Note -> value.signedActId; is Reaction -> value.signedActId }
    val destination: String get() = when (this) { is Note -> "/content/${value.creatorId}/${value.id}"; is Reaction -> "/content/${value.creatorId}/${value.noteId}" }
    val glyph: String get() = if (this is Note) "broadcast" else "heart"
    companion object {
        fun decode(json: Json, raw: JsonElement, creatorId: String): ContentPresenceItem {
            fun uuid(value: String) = runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)
            val item = when (raw.jsonObject["authorKind"]?.jsonPrimitive?.content) {
                "human_broadcast" -> {
                    val n = json.decodeFromJsonElement<APIThreadPresenceNote>(raw)
                    require(n.creatorId == creatorId && uuid(n.id) && n.version > 0 && n.audience.label.length in 1..200 && n.text.length <= 20000)
                    Note(n)
                }
                "human_reaction" -> {
                    val r = json.decodeFromJsonElement<APIThreadPresenceReaction>(raw)
                    require(r.creatorId == creatorId && r.id == r.replyId && uuid(r.id) && uuid(r.noteId))
                    Reaction(r)
                }
                else -> error("Invalid content presence")
            }
            require(uuid(item.signedActId) && item.authorLabel.length in 1..300 && item.creatorName.length in 1..80)
            Instant.parse(item.occurredAt)
            return item
        }
    }
}

data class ContentPresencePage(val items: List<ContentPresenceItem>, val nextBefore: String?) {
    companion object {
        fun validCursor(value: String) = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z~[0-9a-f-]{36}$").matches(value)
        fun decode(json: Json, raw: JsonElement, creatorId: String): ContentPresencePage {
            val page = json.decodeFromJsonElement<APIThreadPresencePage>(raw)
            require(page.items.size <= 50 && (page.nextBefore == null || validCursor(page.nextBefore)))
            Instant.parse(page.serverTime)
            val items = page.items.map { ContentPresenceItem.decode(json, it, creatorId) }
            require(items.map { it.id }.distinct().size == items.size)
            return ContentPresencePage(items, page.nextBefore)
        }
    }
}

/** Entire loaded windows are re-authorized; empty candidate pages still page.
 * Bodies stay in memory and expire after five seconds, including network time. */
@Stable
class ContentPresenceFeed(private val client: ConversationClient, private val creatorId: String) {
    var items by mutableStateOf<List<ContentPresenceItem>>(emptyList()); private set
    var nextBefore by mutableStateOf<String?>(null); private set
    var unavailable by mutableStateOf(false); private set
    var loading by mutableStateOf(false); private set
    var pages by mutableStateOf(1); private set
    var retry by mutableStateOf(0); private set
    private val cursors = mutableListOf<String?>(null)
    private var generation = 0
    private var deadline = 0L
    val canReadEarlier get() = nextBefore != null
    fun earlier() {
        val next = nextBefore ?: return
        if (loading || cursors.contains(next)) return
        cursors.add(next)
        // Retain the head plus four older pages, without limiting how far the
        // final opaque cursor can advance through history.
        if (cursors.size > 5) cursors.removeAt(1)
        pages++
    }
    fun refresh() { retry++ }
    fun conceal() { generation++; items = emptyList(); nextBefore = null; deadline = 0; loading = false }
    fun expire() { if (deadline != 0L && SystemClock.elapsedRealtime() >= deadline) { items = emptyList(); nextBefore = null; deadline = 0; unavailable = true } }
    suspend fun run(active: Boolean) {
        conceal()
        if (!active) return
        val run = generation
        try {
            while (run == generation) {
                currentCoroutineContext().ensureActive()
                loading = true
                val started = SystemClock.elapsedRealtime()
                try {
                    val collected = mutableListOf<ContentPresenceItem>()
                    var cursor: String? = null
                    val seen = mutableSetOf<String>()
                    for (before in cursors.toList()) {
                        require(SystemClock.elapsedRealtime() - started < 5000)
                        val page = client.contentPresence(creatorId, before)
                        currentCoroutineContext().ensureActive()
                        if (run != generation) return
                        require(page.nextBefore == null || page.nextBefore != before)
                        // A changing head can overlap a retained older page.
                        collected.addAll(page.items.filter { seen.add(it.id) })
                        cursor = page.nextBefore
                    }
                    require(cursor == null || !cursors.contains(cursor))
                    currentCoroutineContext().ensureActive()
                    if (run != generation) return
                    require(SystemClock.elapsedRealtime() - started < 5000)
                    items = collected; nextBefore = cursor; unavailable = false; deadline = started + 5000
                } catch (failure: Exception) {
                    if (failure is CancellationException) throw failure
                    if (run != generation) return
                    items = emptyList(); nextBefore = null; deadline = 0; unavailable = true
                }
                loading = false
                delay(2000)
            }
        } finally { if (run == generation) conceal() }
    }
}

data class ContentTimelineItem(val id: String, val at: Instant, val message: ConversationMessage? = null, val content: ContentPresenceItem? = null) {
    companion object {
        fun merge(messages: List<ConversationMessage>, content: List<ContentPresenceItem>): List<ContentTimelineItem> =
            (messages.map { ContentTimelineItem("message:${it.id}", runCatching { Instant.parse(it.createdAt) }.getOrDefault(Instant.MIN), message = it) }
                + content.map { ContentTimelineItem("content:${it.id}", Instant.parse(it.occurredAt), content = it) })
                .sortedWith(compareBy<ContentTimelineItem> { it.at }.thenBy { it.id })
    }
}

@Composable
fun ContentPresenceRow(item: ContentPresenceItem, open: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("content-presence-${item.id}").background(qColor("maya-surface"), RoundedCornerShape(T.radiusMd)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.fillMaxWidth().heightIn(min = T.touchTarget).clickable(role = Role.Button) { open(item.destination) }.semantics { contentDescription = item.accessibleLabel }.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.clearAndSetSemantics {}) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Glyph(item.glyph, T.space4, qColor("maya-accent")); BasicText(item.authorLabel, style = qText("label").copy(color = qColor("maya-accent"))) }
            if (item is ContentPresenceItem.Note) BasicText(item.value.text, style = qText("body").copy(color = qColor("on-maya")))
            }
        }
        SignedMarker(item.creatorName, onMaya = true) { open("/verify/${item.signedActId}") }
    }
}
