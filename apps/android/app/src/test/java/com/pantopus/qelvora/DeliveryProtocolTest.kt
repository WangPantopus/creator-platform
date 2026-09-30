package com.pantopus.qelvora

import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.ui.*
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Test

class DeliveryProtocolTest {
    private fun frame(cursor: Long, epoch: Long = 0, kind: APIFrameKind = APIFrameKind.SENTENCE, sequence: Long = 1, thread: String = "thread-a") = APIFrame(thread, cursor, epoch, kind, "message-a", if (kind == APIFrameKind.CONTROL) APIFrameAuthorKind.SYSTEM else APIFrameAuthorKind.AI, "Sentence", if (kind == APIFrameKind.CONTROL) null else "generation-a", sequence, if (kind == APIFrameKind.CONTROL) APIFrameControl.HUMAN_ACTIVE else null)
    @Test fun reorderedBoundaryComesFirst() { val gate = ThreadDeliveryGate("thread-a"); assertTrue(gate.receive(frame(2, 1)).isEmpty()); assertEquals(listOf(APIFrameKind.CONTROL, APIFrameKind.SENTENCE), gate.receive(frame(1, 1, APIFrameKind.CONTROL)).map { it.kind }); assertEquals(2L, gate.cursor) }
    @Test fun staleAIDropsAfterTakeover() { val gate = ThreadDeliveryGate("thread-a"); gate.receive(frame(1,1,APIFrameKind.CONTROL)); assertTrue(gate.receive(frame(2)).isEmpty()); assertEquals(2L,gate.cursor) }
    @Test fun duplicateCursorAndSequenceAreNotPaintedTwice() { val gate = ThreadDeliveryGate("thread-a"); assertEquals(1,gate.receive(frame(1)).size); assertTrue(gate.receive(frame(1)).isEmpty()); assertTrue(gate.receive(frame(2)).isEmpty()) }
    @Test fun reconnectRetainsMissingBoundary() { val gate = ThreadDeliveryGate("thread-a",4,2); assertTrue(gate.receive(frame(6,3)).isEmpty()); assertEquals(4L,gate.cursor); assertEquals(listOf(5L,6L),gate.receive(frame(5,3,APIFrameKind.CONTROL)).map { it.cursor }) }
    @Test fun wrongThreadIsRejected() { val gate = ThreadDeliveryGate("thread-a"); try { gate.receive(frame(1,thread="thread-b")); fail("Expected refusal") } catch (_: IllegalArgumentException) {} }
    @Test fun generationGapRetainsRenderedCursor() { val gate = ThreadDeliveryGate("thread-a"); try { gate.receive(frame(1,sequence=3)); fail("Expected replay") } catch (_: IllegalStateException) {}; assertEquals(0L,gate.cursor) }
    @Test fun checkpointResumesGenerationAfterProcessRecreation() {
        val gate = ThreadDeliveryGate("thread-a")
        gate.receive(frame(1, sequence=1)); gate.receive(frame(2, sequence=2))
        val restored = ThreadDeliveryGate(Json.decodeFromString<ThreadDeliveryCheckpoint>(Json.encodeToString(gate.checkpoint())))
        assertTrue(restored.receive(frame(2, sequence=2)).isEmpty())
        assertEquals(listOf(3L),restored.receive(frame(3, sequence=3)).map { it.sequence })
        assertEquals(3L,restored.cursor)
    }
    @Test fun rejectedDrainRetainsEarlierValidSentence() {
        val gate = ThreadDeliveryGate("thread-a")
        assertTrue(gate.receive(frame(2,sequence=3)).isEmpty())
        try { gate.receive(frame(1,sequence=1)); fail("Expected replay") } catch (_: IllegalStateException) {}
        assertEquals(0L,gate.cursor)
        assertEquals(listOf(1L,2L),gate.receive(frame(2,sequence=2)).map { it.cursor })
    }
    @Test fun fixedAuthorLabelsAndRegistry() { assertEquals("Maya's AI",AuthorKind.AI.label()); assertEquals("Prepared by AI · approved by Maya",AuthorKind.APPROVED_DRAFT.label()); assertEquals("Maya's team · Priya",AuthorKind.TEAM.label()); val all = NativeComponentRegistry.implemented + NativeComponentRegistry.pending; assertEquals(53,all.size); assertEquals(53,all.toSet().size) }
}
