package com.pantopus.qelvora.media

import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import kotlinx.coroutines.*
import java.util.UUID

interface NativeCallDelegate {
    suspend fun authorize(sessionId: UUID): Boolean
    /** Cancellable; returns only after actual provider media connection. */
    suspend fun connect(sessionId: UUID)
    /** Drain pending/connected transport; this must not manufacture settlement or fan-choice evidence. */
    suspend fun end(sessionId: UUID)
    /** Telecom calls this only after SDK connection and authorization bookends. */
    fun connected(sessionId: UUID)
}
/** W6 owns Telecom lifetime; W7 must supply genuine incoming call signals. */
class NativeCallConnectionService : ConnectionService() {
    companion object {
        @Volatile var delegate: NativeCallDelegate? = null
        // Main-thread transport admission survives a ConnectionService recreation.
        private val unsettled = mutableSetOf<UUID>()
        private val endings = mutableMapOf<UUID, () -> Unit>()
        internal fun claim(adapter: NativeCallDelegate) {
            check(delegate == null && unsettled.isEmpty() && endings.isEmpty())
            delegate = adapter
        }
        internal fun endOwned(id: UUID, adapter: NativeCallDelegate): Boolean {
            if (delegate !== adapter) return false
            val finish = endings[id] ?: return false
            finish(); return true
        }
        internal fun releaseDrained(adapter: NativeCallDelegate) {
            if (delegate === adapter && unsettled.isEmpty() && endings.isEmpty()) delegate = null
        }
    }
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val active = mutableSetOf<IncomingConnection>()
    private var destroying = false
    override fun onCreateIncomingConnection(manager: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val id = runCatching { UUID.fromString(request?.extras?.getString("sessionId")) }.getOrNull()
        val adapter = delegate
        if (id == null || adapter == null) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        if (destroying || active.isNotEmpty() || unsettled.isNotEmpty()) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.BUSY))
        return IncomingConnection(id, adapter, false).also { active.add(it); endings[id] = { it.finish(DisconnectCause.LOCAL) }; it.start() }
    }
    override fun onCreateOutgoingConnection(manager: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val id = runCatching { UUID.fromString(request?.extras?.getString("sessionId")) }.getOrNull()
        val adapter = delegate
        if (id == null || adapter == null) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        if (destroying || active.isNotEmpty() || unsettled.isNotEmpty()) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.BUSY))
        return IncomingConnection(id, adapter, true).also { active.add(it); endings[id] = { it.finish(DisconnectCause.LOCAL) }; it.start() }
    }
    private inner class IncomingConnection(
        private val id: UUID,
        private val adapter: NativeCallDelegate,
        private val outgoing: Boolean,
    ) : Connection() {
        private var closed = false
        private var connectionAttempted = false
        private var initialization: Job? = null
        private var answer: Job? = null
        private fun current() = !closed && !destroying && delegate === adapter
        fun start() {
            connectionProperties = PROPERTY_SELF_MANAGED
            setAudioModeIsVoip(true)
            setInitializing()
            // Dispatch rather than starting inline before the Job is retained.
            initialization = tasks.launch(start = CoroutineStart.LAZY) {
                try {
                    check(withTimeout(5_000) { adapter.authorize(id) })
                    ensureActive()
                    check(current())
                    if (outgoing) { setDialing(); onAnswer() } else setRinging()
                } catch (_: Exception) { finish(DisconnectCause.ERROR) }
            }
            initialization?.start()
        }
        override fun onAnswer() {
            if (!current() || answer != null || state == STATE_ACTIVE) return
            answer = tasks.launch(start = CoroutineStart.LAZY) {
                try {
                    initialization?.join()
                    ensureActive()
                    check(current())
                    check(withTimeout(5_000) { adapter.authorize(id) })
                    ensureActive()
                    check(current())
                    connectionAttempted = true
                    unsettled.add(id)
                    withTimeout(20_000) { adapter.connect(id) }
                    ensureActive()
                    check(current())
                    // A revocation while the SDK connects cannot activate Telecom.
                    check(withTimeout(5_000) { adapter.authorize(id) })
                    ensureActive()
                    check(current())
                    setActive()
                    adapter.connected(id)
                } catch (_: Exception) { finish(DisconnectCause.ERROR) }
            }
            answer?.start()
        }
        override fun onAnswer(videoState: Int) { onAnswer() }
        override fun onDisconnect() { finish(DisconnectCause.LOCAL) }
        override fun onReject() { finish(DisconnectCause.REJECTED) }
        override fun onAbort() { finish(DisconnectCause.CANCELED) }
        fun finish(reason: Int) {
            if (closed) return
            closed = true
            initialization?.cancel()
            val pending = answer
            pending?.cancel()
            setDisconnected(DisconnectCause(reason))
            destroy()
            if (!connectionAttempted) {
                tasks.launch(NonCancellable) {
                    try {
                        adapter.end(id)
                        active.remove(this@IncomingConnection); endings.remove(id)
                        releaseDrained(adapter)
                    } catch (_: Exception) { /* Keep admission closed until the actual drain completes. */ }
                }
                return
            }
            // Service teardown must not cancel transport cleanup. Keep admission
            // blocked if drain fails; never let a late connect activate a new call.
            tasks.launch(NonCancellable) {
                try {
                    try {
                        withTimeout(5_000) { pending?.join() }
                    } finally {
                        withTimeout(5_000) { adapter.end(id) }
                    }
                    unsettled.remove(id)
                    active.remove(this@IncomingConnection)
                    endings.remove(id)
                    if (delegate === adapter) delegate = null
                } catch (_: Exception) {
                    // Provider/server reconciliation must confirm an uncertain drain.
                }
            }
        }
    }
    override fun onDestroy() {
        destroying = true
        active.toList().forEach { it.finish(DisconnectCause.ERROR) }
        tasks.cancel()
        super.onDestroy()
    }
}
