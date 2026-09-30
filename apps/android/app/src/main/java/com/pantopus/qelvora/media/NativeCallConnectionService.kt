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
    /** Returns only after actual provider media connection, not after a room token/ringing UI. */
    suspend fun connect(sessionId: UUID)
    suspend fun end(sessionId: UUID)
}
/** W1 registers the authorized phone account and manifest; W7 delivers genuine incoming call signals. */
class NativeCallConnectionService : ConnectionService() {
    companion object { @Volatile var delegate: NativeCallDelegate? = null }
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    override fun onCreateIncomingConnection(manager: PhoneAccountHandle?, request: ConnectionRequest?): Connection {
        val id = runCatching { UUID.fromString(request?.extras?.getString("sessionId")) }.getOrNull()
        val adapter = delegate
        if (id == null || adapter == null) return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR))
        return object : Connection() {
            init {
                connectionProperties = PROPERTY_SELF_MANAGED
                setInitializing()
                tasks.launch {
                    try { if (withTimeout(5_000) { adapter.authorize(id) }) setRinging() else fail() }
                    catch (_: Exception) { fail() }
                }
            }
            private fun fail() { setDisconnected(DisconnectCause(DisconnectCause.ERROR)); destroy() }
            override fun onAnswer() {
                tasks.launch {
                    try {
                        check(withTimeout(5_000) { adapter.authorize(id) })
                        withTimeout(5_000) { adapter.connect(id) }; setActive()
                    } catch (_: Exception) { fail() }
                }
            }
            override fun onDisconnect() { tasks.launch { try { withTimeout(5_000) { adapter.end(id) } } finally { setDisconnected(DisconnectCause(DisconnectCause.LOCAL)); destroy() } } }
            override fun onReject() { onDisconnect() }
        }
    }
    override fun onDestroy() { tasks.cancel(); super.onDestroy() }
}
