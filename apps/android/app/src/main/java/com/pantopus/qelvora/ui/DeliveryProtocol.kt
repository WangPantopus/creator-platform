package com.pantopus.qelvora.ui

import com.pantopus.qelvora.generated.APIFrame
import com.pantopus.qelvora.generated.APIFrameKind
import kotlinx.serialization.Serializable

/** Persist atomically with the rendered timeline; a bare cursor cannot resume a generation. */
@Serializable
data class ThreadDeliveryCheckpoint(val threadId: String, val cursor: Long, val epoch: Long, val generationSequences: Map<String, Long>)

/** One instance per thread. The cursor is suitable for an ordered reconnect request. */
class ThreadDeliveryGate(private val threadId: String, cursor: Long = 0, epoch: Long = 0, generationSequences: Map<String, Long> = emptyMap()) {
    init { require(cursor >= 0 && epoch >= 0 && generationSequences.values.all { it >= 0 }) }
    var cursor: Long = cursor; private set
    var epoch: Long = epoch; private set
    private val pending = mutableMapOf<Long, APIFrame>()
    private val generations = generationSequences.toMutableMap()

    constructor(checkpoint: ThreadDeliveryCheckpoint) : this(checkpoint.threadId, checkpoint.cursor, checkpoint.epoch, checkpoint.generationSequences)

    @Synchronized
    fun checkpoint() = ThreadDeliveryCheckpoint(threadId, cursor, epoch, generations.toMap())

    @Synchronized
    fun receive(frame: APIFrame): List<APIFrame> {
        require(frame.threadId == threadId) { "Wrong thread channel" }
        if (frame.cursor <= cursor) return emptyList()
        check(pending.size < 1024 || pending.containsKey(frame.cursor)) { "Replay required" }
        pending[frame.cursor] = frame
        var stagedCursor = cursor
        var stagedEpoch = epoch
        val stagedGenerations = generations.toMutableMap()
        val consumed = mutableListOf<Long>()
        val visible = mutableListOf<APIFrame>()
        while (true) {
            val next = pending[stagedCursor + 1] ?: break
            if (next.epoch > stagedEpoch && next.kind != APIFrameKind.CONTROL) break
            val generation = next.generationId
            if (next.epoch >= stagedEpoch && next.kind == APIFrameKind.SENTENCE && generation != null) {
                val last = stagedGenerations[generation] ?: 0
                check(next.sequence <= last || next.sequence == last + 1) { "Generation replay required" }
                if (next.sequence <= last) { consumed += next.cursor; stagedCursor = next.cursor; continue }
                stagedGenerations[generation] = next.sequence
            }
            consumed += next.cursor; stagedCursor = next.cursor
            if (next.epoch < stagedEpoch) continue
            if (next.kind == APIFrameKind.CONTROL) stagedEpoch = next.epoch
            visible += next
        }
        consumed.forEach { pending.remove(it) }
        cursor = stagedCursor; epoch = stagedEpoch
        generations.clear(); generations.putAll(stagedGenerations)
        return visible
    }
}
