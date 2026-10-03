package com.pantopus.qelvora.commerce

import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.generated.CreatorAPIError
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class CommerceFan(val id: String, val handle: String)
@Serializable data class CommerceCreator(val id: String, val handle: String, val display_name: String)
@Serializable data class CommercePolicy(val currency: String, val limitOptions: List<Long>, val passEnabled: Boolean)
@Serializable data class CommerceCapabilities(val paymentsAvailable: Boolean, val membershipAvailable: Boolean, val nativeReplyPurchase: Boolean,val storePurchasesAvailable:Boolean=false)
@Serializable data class CommerceStoreProduct(val productId:String,val basePlanId:String?=null)
@Serializable data class CommerceTierCatalog(val apple:CommerceStoreProduct?=null,val google:CommerceStoreProduct?=null)
@Serializable data class CommerceTier(val id:String,val creator_id:String,val name:String,val state:String="active",val catalog:CommerceTierCatalog)
@Serializable data class CommerceExposure(val captured: Long, val held: Long, val total: Long, val currency: String, val refunded: Long? = null, val month: String? = null)
@Serializable data class CommerceMode(val id: String, val creator_id: String, val title: String, val kind: String, val amount: String?, val public_amount: String?, val currency: String, val weekly_limit: Int, val used: Int, val reserved: Int, val delivery_hours: Int, val decision_hours: Int, val state: String, val shareable: Boolean, val version: Int)
@Serializable data class CommerceLimit(val currency: String, val amount: String?, val explicit_none: Boolean, val pending_amount: String?, val effective_at: String?, val reminders_on: Boolean, val version: Int, val pending_none: Boolean? = null)
@Serializable data class CommerceAllowance(val available: Int, val unit: String)
@Serializable data class CommerceAccessSource(val id: String, val source: String, val validUntil: String)
@Serializable data class CommerceAccess(val version: String, val creatorId: String, val fanId: String, val validUntil: String?, val capabilities: List<String>, val allowance: CommerceAllowance, val sources: List<CommerceAccessSource>)
@Serializable data class CommerceMembership(val id: String, val creator_id: String, val name: String, val provider: String, val state: String, val period_end: String, val cancel_at_end: Boolean)
@Serializable data class CommercePass(val id:String,val state:String,val version:Int,val slot_capacity:Int,val cycle_start:String,val cycle_end:String,val allowance:Int,val used:Int,val reserved:Int)
@Serializable data class CommercePassCandidate(val id:String,val display_name:String)
@Serializable data class CommercePassChoices(val creators:List<CommercePassCandidate> = emptyList(),val replaceableSlotIds:List<String> = emptyList())
@Serializable data class CommerceSpendingNotice(val id:String,val threshold:Int,val created_at:String)
@Serializable data class CommerceSlot(val id: String, val creator_id:String,val cycle_start:String,val display_name: String, val state: String, val position: Int, val ends_at: String)
@Serializable data class CommerceSnapshot(val title: String, val mode: String, val amount: Long, val currency: String, val decisionHours: Int, val deliveryHours: Int, val shareable: Boolean)
@Serializable data class CommerceDisclosure(val summary: String? = null)
@Serializable data class CommercePacket(val id: String, val creator_id: String, val fan_id: String, val snapshot: CommerceSnapshot, val state: String, val payment_state: String, val version: Int, val created_at: String, val decision_at: String?, val hold_expires_at: String?, val question: String? = null, val disclosure: CommerceDisclosure, val commitment_state: String? = null, val delivered_at: String? = null)
@Serializable data class CommerceDeliveryEvidence(val signedActId: String? = null, val authorKind: String? = null)
@Serializable data class CommerceCommitment(val id: String, val state: String, val version: Int, val due_at: String, val delivered_at: String?, val accept_act_id: String? = null, val evidence: CommerceDeliveryEvidence? = null)
@Serializable data class CommerceShare(val version: Int, val fan_choice: Boolean, val revoked_at: String?)
@Serializable data class CommerceLedger(val kind: String, val amount: String, val currency: String)
@Serializable data class CommerceCallTransport(val state: String, val authorKind: String, val recordedAt: String? = null)
@Serializable data class CommerceDetail(val packet: CommercePacket, val commitment: CommerceCommitment?, val share: CommerceShare?, val ledger: List<CommerceLedger> = emptyList(), val callTransport: CommerceCallTransport? = null)
@Serializable data class CommerceOverview(val fan: CommerceFan?, val creators: List<CommerceCreator>, val packets: List<CommercePacket>, val modes: List<CommerceMode>, val limits: List<CommerceLimit>, val memberships: List<CommerceMembership>, val slots: List<CommerceSlot>, val policy: CommercePolicy, val capabilities: CommerceCapabilities, val exposure: CommerceExposure?,val pass:List<CommercePass> = emptyList(),val passChoices:CommercePassChoices = CommercePassChoices(),val spendingNotices:List<CommerceSpendingNotice> = emptyList(),val tiers:List<CommerceTier> = emptyList())
class CommerceFailure(val status: Int, override val message: String, val code: String? = null) : Exception(message)

/** Reuses the genuine issuer's original client/cancellable capture. Pins deny
 * replacement; neither stored credentials nor local state grant entitlements. */
class CommerceClient(private val model: FanSession, private val accountId: String, private val sessionId: String, private val destination: String) {
    private val json = Json { ignoreUnknownKeys = true }
    private fun ready(): Boolean = model.session?.accountId == accountId && model.session?.sessionId == sessionId && model.destination == destination &&
        !model.checkingSession && !model.busy && model.error.isEmpty() && !model.purgingPrivateState && !model.localPurgeFailed
    suspend fun request(path: String, body: JsonObject? = null): JsonElement {
        currentCoroutineContext().ensureActive()
        if (!ready()) throw CommerceFailure(503, "Refresh your account before continuing. Your input is kept.")
        val original = model.captureRequest(destination, maximumResponseBytes = 4_194_304, timeoutMs = 15_000)
            ?: throw CommerceFailure(503, "Refresh your account before continuing. Your input is kept.")
        if (original.expectedAccountId != accountId || original.sessionId != sessionId || !ready()) throw CancellationException("Your original account view changed.")
        try {
            val response = original.commerceBytes("/v1/commerce/$path", body = body?.toString()?.toByteArray(Charsets.UTF_8))
            currentCoroutineContext().ensureActive()
            if (!original.isCurrent() || !ready()) throw CancellationException("Your original account view changed.")
            val value = json.parseToJsonElement(response.body.toString(Charsets.UTF_8))
            if (!original.isCurrent() || !ready()) throw CancellationException("Your original account view changed.")
            return value
        } catch (failure: Exception) {
            currentCoroutineContext().ensureActive()
            if (!original.isCurrent() || !ready()) throw CancellationException("Your original account view changed.")
            if (failure is CreatorAPIError) {
                val detail = runCatching { json.parseToJsonElement(failure.body).jsonObject["error"]?.jsonObject }.getOrNull()
                throw CommerceFailure(failure.status, detail?.get("message")?.jsonPrimitive?.content ?: "This action is unavailable. Your input is kept.", detail?.get("code")?.jsonPrimitive?.content)
            }
            throw failure
        }
    }
    suspend fun overview(): CommerceOverview = json.decodeFromJsonElement(request("overview"))
    suspend fun detail(id: String): CommerceDetail = json.decodeFromJsonElement(request("packets/$id"))
    suspend fun access(creatorId: String, fanId: String): CommerceAccess = json.decodeFromJsonElement(request("creators/$creatorId/fans/$fanId/access"))
}
fun commerceMoney(amount: Long, currency: String): String = NumberFormat.getCurrencyInstance().apply { this.currency = Currency.getInstance(currency) }.format(BigDecimal.valueOf(amount).movePointLeft(Currency.getInstance(currency).defaultFractionDigits))
fun commerceMinor(text: String, currency: String): Long {
    val digits = Currency.getInstance(currency).defaultFractionDigits
    if (!Regex("^\\d+(?:\\.\\d{0,$digits})?$").matches(text)) throw CommerceFailure(400, "Enter a valid amount.")
    val amount = try { text.toBigDecimal().movePointRight(digits).longValueExact() } catch (_: ArithmeticException) { throw CommerceFailure(400, "This amount is too large.") }
    if (amount !in 0..9007199254740991L) throw CommerceFailure(400, "This amount is too large.")
    return amount
}
