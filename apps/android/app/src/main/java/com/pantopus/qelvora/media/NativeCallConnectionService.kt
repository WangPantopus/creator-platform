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
}
/** W1 registers the authorized phone account and manifest; W7 delivers genuine incoming call signals. */
class NativeCallConnectionService : ConnectionService() {
    companion object {
        @Volatile var delegate: NativeCallDelegate? = null
        // Main-thread transport admission survives a ConnectionService recreation.
        private val unsettled = mutableSetOf<UUID>()
    }
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val active = mutableSetOf<IncomingConnection>()
    private var destroying = false
    override fun onCreateIncomingConnection(manager: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val id = runCatching { UUID.fromString(request?.extras?.getString("sessionId")) }.getOrNull()
        val adapter = delegate
        if (id == null || adapter == null) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        if (destroying || active.isNotEmpty() || unsettled.isNotEmpty()) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.BUSY))
        return IncomingConnection(id, adapter).also { active.add(it); it.start() }
    }
    private inner class IncomingConnection(
        private val id: UUID,
        private val adapter: NativeCallDelegate,
    ) : Connection() {
        private var closed = false
        private var connectionAttempted = false
        private var initialization: Job? = null
        private var answer: Job? = null
        private fun current() = !closed && !destroying && delegate === adapter
        fun start() {
            connectionProperties = PROPERTY_SELF_MANAGED
            setInitializing()
            // Dispatch rather than starting inline before the Job is retained.
            initialization = tasks.launch(start = CoroutineStart.LAZY) {
                try {
                    check(withTimeout(5_000) { adapter.authorize(id) })
                    ensureActive()
                    check(current())
                    setRinging()
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
                    withTimeout(5_000) { adapter.connect(id) }
                    ensureActive()
                    check(current())
                    // A revocation while the SDK connects cannot activate Telecom.
                    check(withTimeout(5_000) { adapter.authorize(id) })
                    ensureActive()
                    check(current())
                    setActive()
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
                active.remove(this)
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
