package com.pantopus.qelvora.conversation

import com.pantopus.qelvora.generated.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

@Serializable data class ConversationMessage(
    val id: String, val threadId: String, val authorKind: APIMessageAuthorKind, val text: String,
    val deliveryState: APIMessageDeliveryState, val controlEpoch: Long, val sequence: Long,
    val signedActId: String? = null, val citations: List<String>, val createdAt: String,
    val member: String? = null, val offTheRecord: Boolean, val version: Long,
    val agentVersion: ConversationAgentVersion? = null, val feedback: String? = null,
    val correction: ConversationCorrection? = null,
    val recording: ConversationRecording? = null,
    val authorAccountId: String? = null,
    val systemLink: ConversationSystemLink? = null
)
@Serializable data class ConversationSystemLink(val kind: String, val creatorId: String, val contentId: String, val contentVersion: Long, val label: String)
fun ConversationMessage.publicAnswerDestination(creatorId: String): String? {
    val link = systemLink ?: return null
    if (authorKind != APIMessageAuthorKind.SYSTEM || deliveryState != APIMessageDeliveryState.DELIVERED ||
        signedActId != null || authorAccountId != null || text != "Answered publicly." ||
        link.kind != "published_answer" || link.label != text || link.creatorId != creatorId || link.contentVersion <= 0) return null
    val valid = runCatching {
        UUID.fromString(link.creatorId).toString().equals(link.creatorId, ignoreCase = true) &&
        UUID.fromString(link.contentId).toString().equals(link.contentId, ignoreCase = true)
    }.getOrDefault(false)
    return if (valid) "/content/${link.creatorId}/${link.contentId}" else null
}
@Serializable data class ConversationCorrection(val originalMessageId: String, val originalVersion: Long)
@Serializable data class ConversationAgentVersion(val id: String, val hash: String)
@Serializable data class ConversationFeedbackPolicy(val version: String, val notice: String)
fun ConversationMessage.authorLabel(name: String): String = if (correction != null) QelvoraCopy.text("correctionAuthor",mapOf("name" to name)) else when(authorKind) {
    APIMessageAuthorKind.FAN -> "You"
    APIMessageAuthorKind.AI -> QelvoraCopy.text("aiAuthor",mapOf("name" to name))
    APIMessageAuthorKind.APPROVED_DRAFT -> QelvoraCopy.text("approvedAuthor",mapOf("name" to name))
    APIMessageAuthorKind.TEAM -> QelvoraCopy.text("teamAuthor",mapOf("name" to name,"member" to (member ?: "Authorized team member")))
    APIMessageAuthorKind.HUMAN_CREATOR -> name
    APIMessageAuthorKind.HUMAN_CALL -> QelvoraCopy.text("callAuthor",mapOf("name" to name))
    APIMessageAuthorKind.HUMAN_BROADCAST -> "Note from $name"
    APIMessageAuthorKind.HUMAN_REACTION -> QelvoraCopy.text("reaction",mapOf("name" to name))
    APIMessageAuthorKind.SYSTEM -> "Conversation update"
}
@Serializable data class ConversationPage(
    val threadId: String, val creatorId: String, val fanId: String, val creatorName: String, val fanHandle: String,
    val control: APIThreadControl, val epoch: Long, val cursor: Long, val revision: Long,
    val generationSequences: Map<String, Long>, val messages: List<ConversationMessage>, val before: Long? = null,
    val offTheRecord: Boolean, val introShared: Boolean, val consentCurrent: Boolean, val canSend: Boolean,
    val unavailableReason: String? = null, val feedbackPolicy: ConversationFeedbackPolicy? = null
)
@Serializable data class ConversationProvider(val name: String, val termsUrl: String, val noTraining: Boolean, val noRetention: Boolean)
@Serializable data class ConversationPolicy(val version: String, val providers: List<ConversationProvider>, val verified: Boolean)
@Serializable data class ConversationCapabilities(val providers: ConversationPolicy? = null, val consentAvailable: Boolean, val generationAvailable: Boolean, val accessDisclosure: String)
@Serializable data class ConversationMemory(val id: String, val kind: String, val text: String, val provenanceMessageId: String, val sensitiveCategory: String? = null, val state: String, val editedByFan: Boolean, val createdAt: String)
@Serializable data class ConversationMemories(val revision: Long, val offTheRecord: Boolean, val introShared: Boolean, val items: List<ConversationMemory>)
@Serializable data class ConversationAudit(val id: String, val readerAccountId: String, val role: String, val readAt: String)
@Serializable data class ConversationUsage(val timezone: String, val days: List<ConversationUsageDay>, val modeAvailable: Boolean, val measurement: String)
@Serializable data class ConversationUsageDay(val day: String, val seconds: Double, val companionSeconds: Double)
class ConversationFailure(val status: Int, override val message: String) : Exception(message)

/** Uses W1's encrypted credential supplier and disables HTTP response caching. */
class ConversationClient(private val baseURL: String, private val token: () -> String?, private val expectedAccountId: String?) {
    val json = Json { ignoreUnknownKeys = true }
    suspend fun request(path: String, body: JsonObject? = null, publicRead: Boolean = false): JsonElement = withContext(Dispatchers.IO) {
        if (!publicRead && expectedAccountId == null) throw ConversationFailure(401, "Reopen this page with your current account.")
        val credential = if (publicRead) null else token() ?: throw ConversationFailure(401, "Your session ended. Continue with Pantopus again.")
        val connection = URL(baseURL.trimEnd('/') + "/v1/conversations/" + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 10000; connection.readTimeout = 15000; connection.useCaches = false
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-Correlation-Id", UUID.randomUUID().toString())
            credential?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (!publicRead) connection.setRequestProperty("X-Expected-Account-Id", expectedAccountId)
            if (body != null) {
                connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { stream ->
                val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
                while(true) { val count=stream.read(buffer);if(count<0) break;if(output.size()+count>1_000_000) throw ConversationFailure(503,"This conversation response is too large. Refresh to try again.");output.write(buffer,0,count) }
                output.toString("UTF-8")
            }.orEmpty()
            coroutineContext.ensureActive()
            if (!publicRead && token() != credential) throw ConversationFailure(401,"Your account changed. Open this conversation again.")
            val value = runCatching { json.parseToJsonElement(text) }.getOrNull()
            if (status !in 200..299) {
                val error = value?.jsonObject?.get("error")?.jsonObject
                throw ConversationFailure(if (error?.get("code")?.jsonPrimitive?.content == "session_account_changed") 401 else status, error?.get("message")?.jsonPrimitive?.content ?: "This conversation is unavailable. Your input is kept.")
            }
            value ?: throw ConversationFailure(503, "Reconnect to refresh this conversation.")
        } finally { connection.disconnect() }
    }
    suspend fun page(path: String): ConversationPage = json.decodeFromJsonElement(request(path))
    suspend fun replay(path: String, cursor: Long): List<APIFrame> = json.decodeFromJsonElement(request("$path/events?cursor=$cursor"))
    fun frames(page: ConversationPage, cursor: Long) = ConversationRealtime.frames(
        baseURL, expectedAccountId ?: throw ConversationFailure(401, "Reopen this page with your current account."), token, page, cursor)
}
