package com.pantopus.qelvora.conversation

import android.util.Log
import com.pantopus.qelvora.BuildConfig
import com.pantopus.qelvora.generated.APIFrame
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.buffer
import kotlinx.serialization.json.*
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.net.URI
import java.util.UUID
import java.util.concurrent.TimeUnit

sealed interface ConversationRealtimeEvent {
    data object Connected : ConversationRealtimeEvent
    data class Frame(val value: APIFrame) : ConversationRealtimeEvent
}

/** One connection per origin/account/credential, multiplexing at most 64 live
 * subscriptions. Credentials and frame buffers are memory-only. Overflow forces
 * a fresh authorized snapshot/replay rather than dropping a control boundary. */
internal object ConversationRealtime {
    // Fixed diagnostic classes only. Never include credentials, frame content,
    // account/thread identifiers, URLs, server reasons or exception messages.
    private fun trace(reason: String) { if (BuildConfig.DEBUG) Log.d("QelvoraRealtime", reason) }
    private data class Key(val origin: String, val account: String)
    private data class Subscription(
        val creatorId: String, val fanId: String, val threadId: String,
        val cursor: Long, val emit: (ConversationRealtimeEvent) -> Boolean,
        val fail: (Throwable) -> Unit
    )
    private val connections = mutableMapOf<Key, Connection>()
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private val json = Json { ignoreUnknownKeys = true }

    fun purge() = synchronized(connections) {
        connections.values.toList().forEach {
            it.stop(ConversationFailure(401, "Your session ended. Continue with Pantopus again."))
        }
    }

    fun frames(baseURL: String, accountId: String, credential: () -> String?,
               page: ConversationPage, cursor: Long): Flow<ConversationRealtimeEvent> = callbackFlow {
        val uri = URI(baseURL)
        require(uri.scheme in listOf("http", "https") && uri.host != null && uri.userInfo == null)
        val origin = URI(uri.scheme, null, uri.host, uri.port, null, null, null).toString()
        val key = Key(origin, accountId)
        val token = credential() ?: throw ConversationFailure(401, "Your session ended. Continue with Pantopus again.")
        val id = UUID.randomUUID().toString()
        val connection = synchronized(connections) {
            val previous = connections[key]
            if (previous != null && previous.token != token) previous.stop(ConversationFailure(401, "Your account changed. Open this conversation again."))
            val current = connections[key] ?: Connection(key, token, credential).also { connections[key] = it }
            current.add(id, Subscription(page.creatorId, page.fanId, page.threadId, cursor,
                { trySend(it).isSuccess }, { close(it) }))
            current
        }
        awaitClose { synchronized(connections) { connection.remove(id) } }
    }.buffer(64)

    private class Connection(val key: Key, val token: String, val credential: () -> String?) : WebSocketListener() {
        private val subscriptions = mutableMapOf<String, Subscription>()
        private var socket: WebSocket? = null
        private var open = false
        private var stopped = false

        fun add(id: String, subscription: Subscription) {
            if (stopped || subscriptions.size >= 64) {
                subscription.fail(ConversationFailure(503, "Reconnect to refresh this conversation.")); return
            }
            subscriptions[id] = subscription
            if (socket == null) {
                socket = http.newWebSocket(Request.Builder().url(key.origin + "/v1/realtime")
                    .header("Authorization", "Bearer $token")
                    .header("X-Expected-Account-Id", key.account).build(), this)
            } else if (open) subscribe(subscription)
        }
        private fun send(command: JsonObject): Boolean {
            val current = socket ?: return false
            if (current.queueSize() > 65536 || !current.send(command.toString())) {
                stop(ConversationFailure(503, "Reconnect to refresh this conversation.")); return false
            }
            return true
        }
        private fun subscribe(subscription: Subscription) {
            if (send(buildJsonObject {
                put("kind", "subscribe"); put("creatorId", subscription.creatorId)
                put("fanId", subscription.fanId); put("cursor", subscription.cursor)
            }) && !subscription.emit(ConversationRealtimeEvent.Connected))
                stop(ConversationFailure(503, "Reconnect to refresh this conversation."))
        }
        fun remove(id: String) {
            val removed = subscriptions.remove(id) ?: return
            if (subscriptions.isEmpty()) stop(null)
            // C04 currently publishes subscribe only. Reconnect remaining owners
            // rather than retain an abandoned private channel or invent a command.
            else if (subscriptions.values.none { it.threadId == removed.threadId }) stop(null)
        }
        fun stop(failure: Throwable?) {
            if (stopped) return
            stopped = true; open = false
            if (connections[key] === this) connections.remove(key)
            socket?.cancel(); socket = null
            val previous = subscriptions.values.toList(); subscriptions.clear()
            previous.forEach { it.fail(failure ?: ConversationFailure(503, "Reconnect to refresh this conversation.")) }
        }
        override fun onOpen(webSocket: WebSocket, response: Response) = synchronized(connections) {
            if (stopped) { webSocket.cancel(); return@synchronized }
            if (credential() != token) { stop(ConversationFailure(401, "Your account changed. Open this conversation again.")); return@synchronized }
            open = true
            subscriptions.values.toList().forEach { subscribe(it) }
        }
        override fun onMessage(webSocket: WebSocket, text: String) = synchronized(connections) {
            if (stopped) return@synchronized
            if (credential() != token) { stop(ConversationFailure(401, "Your account changed. Open this conversation again.")); return@synchronized }
            if (text.length > 1_000_000) { stop(ConversationFailure(503, "Reconnect to refresh this conversation.")); return@synchronized }
            val frame = runCatching { json.decodeFromString<APIFrame>(text) }.getOrNull()
            if (frame == null || subscriptions.values.none { it.threadId == frame.threadId }) {
                trace(if (frame == null) "frame_decode_failed" else "frame_owner_missing")
                stop(ConversationFailure(503, "Reconnect to refresh this conversation.")); return@synchronized
            }
            if (subscriptions.values.filter { it.threadId == frame.threadId }.any { !it.emit(ConversationRealtimeEvent.Frame(frame)) })
                stop(ConversationFailure(503, "Reconnect to refresh this conversation."))
        }
        override fun onMessage(webSocket: WebSocket, bytes: ByteString) = synchronized(connections) {
            stop(ConversationFailure(503, "Reconnect to refresh this conversation."))
        }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) = synchronized(connections) {
            trace("socket_closing_code_$code")
            trace(when (reason) {
                "Reconnect with current authority" -> "server_authority_deadline"
                "Conversation unavailable" -> "server_batch_refused"
                "Subscription refused" -> "server_subscription_refused"
                else -> "server_close_other"
            })
            stop(ConversationFailure(if (code == 1008) 401 else 503, "Reconnect to refresh this conversation."))
        }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = synchronized(connections) {
            trace(if (response?.code == 401) "socket_authentication_failed" else "socket_transport_failed")
            stop(ConversationFailure(if (response?.code == 401) 401 else 503, "Reconnect to refresh this conversation."))
        }
    }
}
