package com.pantopus.qelvora.media

import com.pantopus.qelvora.identity.FanSession
import kotlinx.coroutines.CancellationException
import java.net.URL

/** Client lifetime protection only. The backend authorizes the real held request.
 * Never read a replacement credential for an operation opened by another session.
 */
internal class NativeCallRequest private constructor(
    private val model: FanSession,
    private val credential: String,
    val accountId: String,
    private val sessionId: String,
    private val destination: String,
    private val client: NativeMediaClient,
) {
    fun current(): Boolean = model.destination == destination &&
        model.session?.accountId == accountId && model.session?.sessionId == sessionId &&
        runCatching { model.currentToken() == credential }.getOrDefault(false)

    private fun requireCurrent() {
        if (!current()) throw CancellationException("The call request's session or destination changed")
    }

    suspend fun request(path: String, method: String = "GET", bytes: ByteArray? = null): ByteArray {
        requireCurrent()
        val result = client.request(path, method, bytes, expectedAccountId = accountId)
        requireCurrent()
        return result
    }

    companion object {
        fun capture(baseURL: String?, model: FanSession): NativeCallRequest? {
            val origin = baseURL ?: return null
            val session = model.session ?: return null
            val credential = runCatching { model.currentToken() }.getOrNull() ?: return null
            val destination = model.destination
            return NativeCallRequest(model, credential, session.accountId, session.sessionId,
                destination, NativeMediaClient(URL(origin)) { credential }).takeIf { it.current() }
        }
    }
}
