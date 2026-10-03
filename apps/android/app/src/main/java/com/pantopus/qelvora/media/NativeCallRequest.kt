package com.pantopus.qelvora.media

import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Only the actual issuer-bound capture owns a client. UI projections and OS
 * state grant no authority and may not read replacement credentials. */
internal class NativeCallRequest private constructor(private val capture: FanSessionRequestCapture) {
    val accountId get() = capture.expectedAccountId
    val destination get() = capture.destination
    suspend fun current(): Boolean = capture.isCurrent()
    private suspend fun requireCurrent() { if (!current()) throw CancellationException("Call request changed") }
    private fun document(value: APICallCallSession, route: CallRoute, selected: Boolean = false): JSONObject {
        require(UUID.fromString(value.creatorId) == route.creator && UUID.fromString(value.fanId) == route.fan)
        if (!selected) require(UUID.fromString(value.id) == route.session)
        return JSONObject(Json.encodeToString(value))
    }
    suspend fun read(route: CallRoute): JSONObject {
        requireCurrent()
        val value = capture.client.readCallSession(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId)
        requireCurrent(); return document(value, route)
    }
    suspend fun action(route: CallRoute, name: String, body: JSONObject): JSONObject {
        requireCurrent()
        val value = when (name) {
            "consent" -> capture.client.setCallConsent(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId, Json.decodeFromString<APICallConsentCommand>(body.toString()))
            "end" -> capture.client.endCallSession(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId, Json.decodeFromString<APICallEndCall>(body.toString()))
            "delete-summary" -> capture.client.deleteCallSummary(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId, Json.decodeFromString<APICallCallRevision>(body.toString()))
            else -> error("Unsupported call action")
        }
        requireCurrent(); return document(value, route)
    }
    suspend fun join(route: CallRoute): JSONObject {
        requireCurrent()
        val value = capture.client.joinCallSession(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId)
        requireCurrent(); return JSONObject(Json.encodeToString(value))
    }
    suspend fun redeem(route: CallRoute, nonce: String): Boolean {
        requireCurrent()
        val value = capture.client.redeemCallAdmission(route.creator.toString(), route.fan.toString(), route.session.toString(), accountId, APICallAdmissionRedemption(nonce))
        requireCurrent(); return value.admitted.value
    }
    suspend fun offers(route: CallRoute): JSONArray {
        requireCurrent()
        val value = capture.client.readCallOffers(route.creator.toString(), route.fan.toString(), accountId)
        requireCurrent(); return JSONArray(Json.encodeToString(value))
    }
    suspend fun select(route: CallRoute, offerId: String, body: JSONObject): JSONObject {
        requireCurrent()
        val value = capture.client.selectCallOffer(route.creator.toString(), route.fan.toString(), offerId, accountId, Json.decodeFromString<APICallSelectTime>(body.toString()))
        requireCurrent(); return document(value, route, selected = true)
    }
    companion object {
        suspend fun capture(baseURL: String?, model: FanSession, maximumResponseBytes: Int = 268_435_456, timeoutMs: Int = 30_000): NativeCallRequest? {
            if (baseURL == null) return null
            return model.captureRequest(model.destination, maximumResponseBytes, timeoutMs)?.let(::NativeCallRequest)
        }
    }
}
