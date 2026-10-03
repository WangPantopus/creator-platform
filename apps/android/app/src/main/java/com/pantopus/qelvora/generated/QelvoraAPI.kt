// Generated from packages/api/generated/openapi.json. Do not edit.
package com.pantopus.qelvora.generated

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Required
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.ensureActive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

typealias APIAgentAgentAudience = JsonElement

@Serializable
data class APIAgentCorrectionRequest(
  val `expectedRevision`: Long,
  val `paraphrasedPrompt`: String,
  val `rule`: String,
  val `unacceptableAnswer`: String
)

@Serializable
data class APIAgentDraftConfig(
  val `mode`: APIAgentDraftConfigMode,
  val `tone`: APIAgentDraftConfigTone,
  val `styleCard`: String,
  val `examples`: List<APIAgentDraftConfigExamplesItem>,
  val `rules`: List<String>,
  val `neverReveal`: List<String>,
  val `handoff`: String,
  val `dailyCostCapMicros`: Long,
  val `sessionNudgeMinutes`: Long,
  val `usefulnessCriteria`: String,
  val `styleCriteria`: String
)

@Serializable
enum class APIAgentDraftConfigMode {
  @SerialName("expert") EXPERT,
  @SerialName("companion") COMPANION,
  @SerialName("blend") BLEND
}

@Serializable
enum class APIAgentDraftConfigTone {
  @SerialName("Plainer") PLAINER,
  @SerialName("As written") AS_WRITTEN,
  @SerialName("Warmer") WARMER
}

@Serializable
data class APIAgentDraftConfigExamplesItem(
  val `id`: String,
  val `text`: String,
  val `fixed`: Boolean,
  val `approved`: Boolean
)

@Serializable
data class APIAgentDraftWrite(
  val `expectedRevision`: Long,
  val `configuration`: APIAgentDraftWriteConfiguration
)

@Serializable
data class APIAgentDraftWriteConfiguration(
  val `mode`: APIAgentDraftWriteConfigurationMode,
  val `tone`: APIAgentDraftWriteConfigurationTone,
  val `styleCard`: String,
  val `examples`: List<APIAgentDraftWriteConfigurationExamplesItem>,
  val `rules`: List<String>,
  val `neverReveal`: List<String>,
  val `handoff`: String,
  val `dailyCostCapMicros`: Long,
  val `sessionNudgeMinutes`: Long,
  val `usefulnessCriteria`: String,
  val `styleCriteria`: String
)

@Serializable
enum class APIAgentDraftWriteConfigurationMode {
  @SerialName("expert") EXPERT,
  @SerialName("companion") COMPANION,
  @SerialName("blend") BLEND
}

@Serializable
enum class APIAgentDraftWriteConfigurationTone {
  @SerialName("Plainer") PLAINER,
  @SerialName("As written") AS_WRITTEN,
  @SerialName("Warmer") WARMER
}

@Serializable
data class APIAgentDraftWriteConfigurationExamplesItem(
  val `id`: String,
  val `text`: String,
  val `fixed`: Boolean,
  val `approved`: Boolean
)

@Serializable
data class APIAgentEvaluationRequest(
  val `expectedRevision`: Long
)

@Serializable
data class APIAgentExample(
  val `id`: String,
  val `text`: String,
  val `fixed`: Boolean,
  val `approved`: Boolean
)

@Serializable
data class APIAgentInterviewWrite(
  val `expectedRevision`: Long,
  val `story`: String,
  val `boundaries`: String,
  val `audioConsent`: Boolean
)

@Serializable
data class APIAgentLicenseRequest(
  val `proofReference`: String,
  val `counselVersion`: String,
  val `permittedUses`: List<APIAgentLicenseRequestPermittedUsesItem>,
  val `termEndsAt`: String,
  val `voiceConsentReference`: String? = null,
  val `estateOptInReference`: String? = null
)

@Serializable
enum class APIAgentLicenseRequestPermittedUsesItem {
  @SerialName("text_ai") TEXT_AI,
  @SerialName("ai_voice") AI_VOICE,
  @SerialName("sponsored_mentions") SPONSORED_MENTIONS
}

@Serializable
enum class APIAgentMode {
  @SerialName("expert") EXPERT,
  @SerialName("companion") COMPANION,
  @SerialName("blend") BLEND
}

@Serializable
data class APIAgentPreviewRequest(
  val `expectedRevision`: Long,
  val `message`: String
)

@Serializable
data class APIAgentPublishRequest(
  val `expectedRevision`: Long,
  val `evaluationId`: String,
  val `changes`: String
)

typealias APIAgentRevision = Long

@Serializable
data class APIAgentSourceAction(
  val `expectedRevision`: Long,
  val `action`: APIAgentSourceActionAction,
  val `rightsConfirmed`: Boolean? = null
)

@Serializable
enum class APIAgentSourceActionAction {
  @SerialName("approve") APPROVE,
  @SerialName("revoke") REVOKE,
  @SerialName("retry") RETRY,
  @SerialName("cancel") CANCEL,
  @SerialName("restore") RESTORE
}

@Serializable
data class APIAgentSourceCreate(
  val `title`: String,
  val `text`: String,
  val `origin`: APIAgentSourceCreateOrigin,
  val `originReference`: String? = null,
  val `audience`: JsonElement,
  val `rightsEvidence`: String,
  @Required
  val `expiresAt`: String? = null
)

@Serializable
enum class APIAgentSourceCreateOrigin {
  @SerialName("manual_text") MANUAL_TEXT,
  @SerialName("manual_upload") MANUAL_UPLOAD,
  @SerialName("interview") INTERVIEW,
  @SerialName("youtube_caption") YOUTUBE_CAPTION,
  @SerialName("platform_export") PLATFORM_EXPORT
}

@Serializable
data class APIAgentSponsorWrite(
  val `brand`: String,
  val `aliases`: List<String>,
  val `expiresAt`: String,
  val `active`: Boolean
)

@Serializable
data class APIAgentStatusWrite(
  val `text`: String,
  val `expiresAt`: String
)

typealias APICommerceCallTransportStatus = JsonElement

@Serializable
enum class APICommerceCommitmentState {
  @SerialName("due") DUE,
  @SerialName("in_progress") IN_PROGRESS,
  @SerialName("delivered") DELIVERED,
  @SerialName("resolution_required") RESOLUTION_REQUIRED,
  @SerialName("refund_pending") REFUND_PENDING,
  @SerialName("refunded") REFUNDED,
  @SerialName("resolved") RESOLVED
}

@Serializable
data class APICommerceCreatorEarnings(
  val `creatorId`: String,
  val `observedAt`: String,
  val `currencies`: List<APICommerceCreatorEarningsCurrenciesItem>,
  val `ledger`: APICommerceCreatorEarningsLedger
)

@Serializable
data class APICommerceCreatorEarningsCurrenciesItem(
  val `currency`: String,
  val `capturedMinor`: String,
  val `requestMinor`: String,
  val `membershipMinor`: String,
  val `refundedMinor`: String,
  @Required
  val `transferredMinor`: String? = null,
  @Required
  val `reversedMinor`: String? = null,
  val `pendingPayouts`: Long
)

@Serializable
data class APICommerceCreatorEarningsLedger(
  val `currency`: String,
  val `entries`: List<APICommerceCreatorEarningsLedgerEntriesItem>,
  @Required
  val `nextCursor`: String? = null
)

@Serializable
data class APICommerceCreatorEarningsLedgerEntriesItem(
  val `id`: String,
  @Required
  val `packetId`: String? = null,
  val `kind`: String,
  val `amount`: String,
  val `currency`: String,
  val `createdAt`: String
)

@Serializable
data class APICommerceCreatorLedgerPage(
  val `currency`: String,
  val `entries`: List<APICommerceCreatorLedgerPageEntriesItem>,
  @Required
  val `nextCursor`: String? = null
)

@Serializable
data class APICommerceCreatorLedgerPageEntriesItem(
  val `id`: String,
  @Required
  val `packetId`: String? = null,
  val `kind`: String,
  val `amount`: String,
  val `currency`: String,
  val `createdAt`: String
)

typealias APICommerceCurrency = String

@Serializable
data class APICommerceDecidePacket(
  val `action`: APICommerceDecidePacketAction,
  val `version`: Long,
  val `idempotencyKey`: String,
  val `signedActId`: String? = null,
  val `text`: String? = null,
  val `proposedModeId`: String? = null
)

@Serializable
enum class APICommerceDecidePacketAction {
  @SerialName("ai_answer") AI_ANSWER,
  @SerialName("approve_draft") APPROVE_DRAFT,
  @SerialName("reply_myself") REPLY_MYSELF,
  @SerialName("voice_note") VOICE_NOTE,
  @SerialName("offer_times") OFFER_TIMES,
  @SerialName("group_offer") GROUP_OFFER,
  @SerialName("more_info") MORE_INFO,
  @SerialName("decline") DECLINE
}

@Serializable
enum class APICommerceDecisionAction {
  @SerialName("ai_answer") AI_ANSWER,
  @SerialName("approve_draft") APPROVE_DRAFT,
  @SerialName("reply_myself") REPLY_MYSELF,
  @SerialName("voice_note") VOICE_NOTE,
  @SerialName("offer_times") OFFER_TIMES,
  @SerialName("group_offer") GROUP_OFFER,
  @SerialName("more_info") MORE_INFO,
  @SerialName("decline") DECLINE
}

@Serializable
data class APICommerceDisclosure(
  val `summary`: String,
  val `includeSummary`: Boolean,
  val `messageIds`: List<String>,
  val `attachmentIds`: List<String>,
  val `wholeThread`: Boolean,
  val `identity`: APICommerceDisclosureIdentity,
  val `accessNoticeVersion`: String
)

@Serializable
enum class APICommerceDisclosureIdentity {
  @SerialName("handle") HANDLE,
  @SerialName("shared_intro") SHARED_INTRO
}

@Serializable
data class APICommerceFulfillmentCommand(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `messageId`: String
)

typealias APICommerceIdempotencyKey = String

typealias APICommerceMinorUnits = Long

@Serializable
enum class APICommerceModeKind {
  @SerialName("written_reply") WRITTEN_REPLY,
  @SerialName("voice_note") VOICE_NOTE,
  @SerialName("audio_call") AUDIO_CALL,
  @SerialName("video_call") VIDEO_CALL,
  @SerialName("group_answer") GROUP_ANSWER,
  @SerialName("guaranteed_review") GUARANTEED_REVIEW
}

@Serializable
data class APICommerceMoney(
  val `amount`: Long,
  val `currency`: String
)

@Serializable
data class APICommerceMoreInfoReply(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `text`: String
)

@Serializable
data class APICommerceOfferChoice(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `accept`: Boolean
)

@Serializable
enum class APICommercePacketState {
  @SerialName("draft") DRAFT,
  @SerialName("submitting") SUBMITTING,
  @SerialName("submitted") SUBMITTED,
  @SerialName("more_info") MORE_INFO,
  @SerialName("offer_pending") OFFER_PENDING,
  @SerialName("accepting") ACCEPTING,
  @SerialName("accepted") ACCEPTED,
  @SerialName("releasing") RELEASING,
  @SerialName("declined") DECLINED,
  @SerialName("expired") EXPIRED,
  @SerialName("withdrawn") WITHDRAWN
}

@Serializable
data class APICommercePassBillingStatus(
  val `version`: Long,
  val `currency`: String,
  val `desiredRenewal`: Boolean,
  val `processing`: Boolean,
  val `effects`: List<APICommercePassBillingStatusEffectsItem>
)

@Serializable
data class APICommercePassBillingStatusEffectsItem(
  val `id`: String,
  val `state`: APICommercePassBillingStatusEffectsItemState,
  val `operation`: APICommercePassBillingStatusEffectsItemOperation
)

@Serializable
enum class APICommercePassBillingStatusEffectsItemState {
  @SerialName("pending") PENDING,
  @SerialName("processing") PROCESSING,
  @SerialName("unknown") UNKNOWN
}

@Serializable
enum class APICommercePassBillingStatusEffectsItemOperation {
  @SerialName("start") START,
  @SerialName("activate_renewal") ACTIVATE_RENEWAL,
  @SerialName("cancel") CANCEL,
  @SerialName("compensate_cancel") COMPENSATE_CANCEL
}

@Serializable
data class APICommercePassPurchaseEffect(
  val `effectId`: String,
  val `processing`: Boolean,
  val `clientSecret`: String? = null
)

@Serializable
data class APICommercePassPurchaseQuote(
  val `quoteId`: String,
  val `version`: Long,
  val `currency`: String,
  val `amount`: Long,
  val `monthlyAmount`: Long,
  val `slotCapacity`: Long,
  val `allowance`: Long,
  val `monthlyAllowance`: Long,
  val `termsVersion`: String,
  val `budgetPolicyVersion`: String,
  val `createdAt`: String,
  val `expiresAt`: String,
  val `periodEndsAt`: String
)

typealias APICommercePassPurchaseStatus = JsonElement

@Serializable
enum class APICommercePaymentState {
  @SerialName("authorization_pending") AUTHORIZATION_PENDING,
  @SerialName("requires_action") REQUIRES_ACTION,
  @SerialName("requires_capture") REQUIRES_CAPTURE,
  @SerialName("unknown") UNKNOWN,
  @SerialName("capturing") CAPTURING,
  @SerialName("captured") CAPTURED,
  @SerialName("releasing") RELEASING,
  @SerialName("released") RELEASED,
  @SerialName("refund_pending") REFUND_PENDING,
  @SerialName("refunded") REFUNDED,
  @SerialName("failed") FAILED
}

@Serializable
data class APICommercePayoutOnboardingCommand(
  val `version`: Long
)

@Serializable
data class APICommercePayoutOnboardingResult(
  val `creatorId`: String,
  val `state`: APICommercePayoutOnboardingResultState,
  val `detailsDue`: Boolean,
  val `version`: Long,
  @Required
  val `url`: String? = null,
  @Required
  val `expiresAt`: String? = null
)

@Serializable
enum class APICommercePayoutOnboardingResultState {
  @SerialName("onboarding") ONBOARDING,
  @SerialName("restricted") RESTRICTED,
  @SerialName("enabled") ENABLED
}

@Serializable
data class APICommercePoolEarnings(
  val `creatorId`: String,
  val `cycle`: String,
  val `observedAt`: String,
  val `closesAt`: String,
  val `fanCount`: Long,
  val `slotCount`: Long,
  val `historyLimited`: Boolean,
  val `postedCycles`: List<APICommercePoolEarningsPostedCyclesItem>
)

@Serializable
data class APICommercePoolEarningsPostedCyclesItem(
  val `cycle`: String,
  val `currency`: String,
  val `allocationMinor`: String,
  @Required
  val `transferredMinor`: String? = null,
  @Required
  val `reversedMinor`: String? = null,
  val `slotSeconds`: String,
  val `totalSlotSeconds`: String,
  val `pendingEffects`: Long,
  val `postedAt`: String
)

@Serializable
data class APICommerceReauthorizePacket(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `paymentMethodId`: String
)

@Serializable
data class APICommerceShareChoice(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `enabled`: Boolean,
  val `handleDisplay`: APICommerceShareChoiceHandleDisplay
)

@Serializable
enum class APICommerceShareChoiceHandleDisplay {
  @SerialName("hidden") HIDDEN,
  @SerialName("handle") HANDLE
}

@Serializable
data class APICommerceSpendLimitCommand(
  val `currency`: String,
  @Required
  val `amount`: Long? = null,
  val `explicitNone`: Boolean,
  val `remindersOn`: Boolean,
  val `idempotencyKey`: String
)

@Serializable
data class APICommerceSubmitPacket(
  val `creatorId`: String,
  val `fanId`: String,
  val `modeId`: String,
  val `modeVersion`: Long,
  val `visibility`: APICommerceSubmitPacketVisibility,
  val `disclosure`: APICommerceSubmitPacketDisclosure,
  val `paymentMethodId`: String,
  val `idempotencyKey`: String
)

@Serializable
enum class APICommerceSubmitPacketVisibility {
  @SerialName("private") PRIVATE,
  @SerialName("public") PUBLIC
}

@Serializable
data class APICommerceSubmitPacketDisclosure(
  val `summary`: String,
  val `includeSummary`: Boolean,
  val `messageIds`: List<String>,
  val `attachmentIds`: List<String>,
  val `wholeThread`: Boolean,
  val `identity`: APICommerceSubmitPacketDisclosureIdentity,
  val `accessNoticeVersion`: String
)

@Serializable
enum class APICommerceSubmitPacketDisclosureIdentity {
  @SerialName("handle") HANDLE,
  @SerialName("shared_intro") SHARED_INTRO
}

@Serializable
data class APICommerceVersionCommand(
  val `version`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIMediaCapabilities(
  val `mediaAvailable`: Boolean,
  val `creatorMediaAvailable`: Boolean,
  val `creatorMediaAudienceAvailable`: Boolean,
  val `callsAvailable`: Boolean,
  val `aiAudioAvailable`: APIMediaCapabilitiesAiAudioAvailable,
  val `callRecoveryAvailable`: Boolean,
  val `reason`: APIMediaCapabilitiesReason
)

@Serializable(with = APIMediaCapabilitiesAiAudioAvailableSerializer::class)
object APIMediaCapabilitiesAiAudioAvailable { const val value: Boolean = false }
object APIMediaCapabilitiesAiAudioAvailableSerializer : KSerializer<APIMediaCapabilitiesAiAudioAvailable> {
  override val descriptor = PrimitiveSerialDescriptor("APIMediaCapabilitiesAiAudioAvailable", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIMediaCapabilitiesAiAudioAvailable {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIMediaCapabilitiesAiAudioAvailable
  }
  override fun serialize(encoder: Encoder, value: APIMediaCapabilitiesAiAudioAvailable) { encoder.encodeBoolean(false) }
}

@Serializable
enum class APIMediaCapabilitiesReason {
  @SerialName("media_unconfigured") MEDIA_UNCONFIGURED,
  @SerialName("licensed_ai_audio_and_provider_verification_required") LICENSED_AI_AUDIO_AND_PROVIDER_VERIFICATION_REQUIRED
}

@Serializable
data class APIMediaCreatorMediaAsset(
  val `id`: String,
  val `purpose`: APIMediaCreatorMediaAssetPurpose,
  val `state`: APIMediaCreatorMediaAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  @Required
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  @Required
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  @Required
  val `failureCode`: String? = null,
  @Required
  val `provenance`: Map<String, JsonElement>? = null,
  val `creatorId`: String,
  val `objectId`: String,
  val `ownerAccountId`: String
)

@Serializable
enum class APIMediaCreatorMediaAssetPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
enum class APIMediaCreatorMediaAssetState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
data class APIMediaCreatorMediaPlaybackTicket(
  val `asset`: APIMediaCreatorMediaPlaybackTicketAsset,
  val `url`: String,
  val `expiresAt`: String,
  val `playbackFile`: APIMediaCreatorMediaPlaybackTicketPlaybackFile
)

@Serializable
data class APIMediaCreatorMediaPlaybackTicketAsset(
  val `id`: String,
  val `purpose`: APIMediaCreatorMediaPlaybackTicketAssetPurpose,
  val `state`: APIMediaCreatorMediaPlaybackTicketAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  @Required
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  @Required
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  @Required
  val `failureCode`: String? = null,
  @Required
  val `provenance`: Map<String, JsonElement>? = null,
  val `creatorId`: String,
  val `objectId`: String,
  val `ownerAccountId`: String
)

@Serializable
enum class APIMediaCreatorMediaPlaybackTicketAssetPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
enum class APIMediaCreatorMediaPlaybackTicketAssetState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
data class APIMediaCreatorMediaPlaybackTicketPlaybackFile(
  val `variant`: APIMediaCreatorMediaPlaybackTicketPlaybackFileVariant,
  val `sha256`: String,
  val `bytes`: Long
)

@Serializable
enum class APIMediaCreatorMediaPlaybackTicketPlaybackFileVariant {
  @SerialName("processed") PROCESSED,
  @SerialName("credentialed") CREDENTIALED
}

@Serializable
data class APIMediaCreatorMediaPolicyView(
  val `creatorId`: String,
  val `objectId`: String,
  val `purpose`: APIMediaCreatorMediaPolicyViewPurpose,
  val `maxBytes`: Long,
  val `maxDurationMs`: Long
)

@Serializable
enum class APIMediaCreatorMediaPolicyViewPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
enum class APIMediaCreatorMediaPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
data class APIMediaCreatorMediaUploadRequest(
  val `purpose`: APIMediaCreatorMediaUploadRequestPurpose,
  val `mimeType`: APIMediaCreatorMediaUploadRequestMimeType,
  val `bytes`: Long,
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `idempotencyKey`: String,
  val `objectId`: String
)

@Serializable
enum class APIMediaCreatorMediaUploadRequestPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
enum class APIMediaCreatorMediaUploadRequestMimeType {
  @SerialName("audio/webm") AUDIO_WEBM,
  @SerialName("audio/mp4") AUDIO_MP4,
  @SerialName("audio/ogg") AUDIO_OGG,
  @SerialName("audio/wav") AUDIO_WAV,
  @SerialName("image/jpeg") IMAGE_JPEG,
  @SerialName("image/png") IMAGE_PNG
}

@Serializable
data class APIMediaCreatorMediaUploadTicket(
  val `asset`: APIMediaCreatorMediaUploadTicketAsset,
  val `url`: String,
  val `expiresAt`: String,
  val `chunkBytes`: Long
)

@Serializable
data class APIMediaCreatorMediaUploadTicketAsset(
  val `id`: String,
  val `purpose`: APIMediaCreatorMediaUploadTicketAssetPurpose,
  val `state`: APIMediaCreatorMediaUploadTicketAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  @Required
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  @Required
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  @Required
  val `failureCode`: String? = null,
  @Required
  val `provenance`: Map<String, JsonElement>? = null,
  val `creatorId`: String,
  val `objectId`: String,
  val `ownerAccountId`: String
)

@Serializable
enum class APIMediaCreatorMediaUploadTicketAssetPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

@Serializable
enum class APIMediaCreatorMediaUploadTicketAssetState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
data class APIMediaMediaAsset(
  val `id`: String,
  val `threadId`: String,
  val `purpose`: APIMediaMediaAssetPurpose,
  val `state`: APIMediaMediaAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  @Required
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  @Required
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  @Required
  val `failureCode`: String? = null,
  @Required
  val `provenance`: Map<String, JsonElement>? = null
)

@Serializable
enum class APIMediaMediaAssetPurpose {
  @SerialName("fan_attachment") FAN_ATTACHMENT,
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("human_note") HUMAN_NOTE,
  @SerialName("human_reply") HUMAN_REPLY,
  @SerialName("call_recording") CALL_RECORDING,
  @SerialName("ai_audio") AI_AUDIO
}

@Serializable
enum class APIMediaMediaAssetState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
enum class APIMediaMediaPurpose {
  @SerialName("fan_attachment") FAN_ATTACHMENT,
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("human_note") HUMAN_NOTE,
  @SerialName("human_reply") HUMAN_REPLY,
  @SerialName("call_recording") CALL_RECORDING,
  @SerialName("ai_audio") AI_AUDIO
}

@Serializable
data class APIMediaMediaRevocation(
  val `state`: APIMediaMediaRevocationState,
  val `deletion`: APIMediaMediaRevocationDeletion
)

@Serializable
enum class APIMediaMediaRevocationState {
  @SerialName("revoked") REVOKED
}

@Serializable
enum class APIMediaMediaRevocationDeletion {
  @SerialName("pending") PENDING
}

@Serializable
data class APIMediaMediaSign(
  val `signedActId`: String,
  val `version`: Long,
  val `idempotencyKey`: String
)

@Serializable
enum class APIMediaMediaState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
data class APIMediaPlaybackFile(
  val `variant`: APIMediaPlaybackFileVariant,
  val `sha256`: String,
  val `bytes`: Long
)

@Serializable
enum class APIMediaPlaybackFileVariant {
  @SerialName("processed") PROCESSED,
  @SerialName("credentialed") CREDENTIALED
}

@Serializable
data class APIMediaPlaybackTicket(
  val `url`: String,
  val `expiresAt`: String,
  val `asset`: APIMediaPlaybackTicketAsset,
  val `playbackFile`: APIMediaPlaybackTicketPlaybackFile
)

@Serializable
data class APIMediaPlaybackTicketAsset(
  val `id`: String,
  val `threadId`: String,
  val `purpose`: APIMediaPlaybackTicketAssetPurpose,
  val `state`: APIMediaPlaybackTicketAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  @Required
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  @Required
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  @Required
  val `failureCode`: String? = null,
  @Required
  val `provenance`: Map<String, JsonElement>? = null
)

@Serializable
enum class APIMediaPlaybackTicketAssetPurpose {
  @SerialName("fan_attachment") FAN_ATTACHMENT,
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("human_note") HUMAN_NOTE,
  @SerialName("human_reply") HUMAN_REPLY,
  @SerialName("call_recording") CALL_RECORDING,
  @SerialName("ai_audio") AI_AUDIO
}

@Serializable
enum class APIMediaPlaybackTicketAssetState {
  @SerialName("uploading") UPLOADING,
  @SerialName("quarantined") QUARANTINED,
  @SerialName("processing") PROCESSING,
  @SerialName("ready") READY,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED,
  @SerialName("deleted") DELETED
}

@Serializable
data class APIMediaPlaybackTicketPlaybackFile(
  val `variant`: APIMediaPlaybackTicketPlaybackFileVariant,
  val `sha256`: String,
  val `bytes`: Long
)

@Serializable
enum class APIMediaPlaybackTicketPlaybackFileVariant {
  @SerialName("processed") PROCESSED,
  @SerialName("credentialed") CREDENTIALED
}

@Serializable
data class APIMediaProcessedMediaEvidence(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `bytes`: Long,
  val `mimeType`: APIMediaProcessedMediaEvidenceMimeType,
  @Required
  val `durationMs`: Long? = null
)

@Serializable
enum class APIMediaProcessedMediaEvidenceMimeType {
  @SerialName("audio/mp4") AUDIO_MP4,
  @SerialName("image/png") IMAGE_PNG
}

@Serializable
data class APIMediaThreadRecordingPolicy(
  val `creatorId`: String,
  val `fanId`: String,
  val `threadId`: String,
  val `purpose`: APIMediaThreadRecordingPolicyPurpose,
  val `maxBytes`: Long,
  val `maxDurationMs`: Long
)

@Serializable
enum class APIMediaThreadRecordingPolicyPurpose {
  @SerialName("human_reply") HUMAN_REPLY
}

@Serializable
data class APIMediaUploadRequest(
  val `purpose`: APIMediaUploadRequestPurpose,
  val `mimeType`: APIMediaUploadRequestMimeType,
  val `bytes`: Long,
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `idempotencyKey`: String
)

@Serializable
enum class APIMediaUploadRequestPurpose {
  @SerialName("fan_attachment") FAN_ATTACHMENT,
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("human_note") HUMAN_NOTE,
  @SerialName("human_reply") HUMAN_REPLY,
  @SerialName("call_recording") CALL_RECORDING,
  @SerialName("ai_audio") AI_AUDIO
}

@Serializable
enum class APIMediaUploadRequestMimeType {
  @SerialName("audio/webm") AUDIO_WEBM,
  @SerialName("audio/mp4") AUDIO_MP4,
  @SerialName("audio/ogg") AUDIO_OGG,
  @SerialName("audio/wav") AUDIO_WAV,
  @SerialName("image/jpeg") IMAGE_JPEG,
  @SerialName("image/png") IMAGE_PNG
}

@Serializable
data class APICallAdmissionReceipt(
  val `admitted`: APICallAdmissionReceiptAdmitted
)

@Serializable(with = APICallAdmissionReceiptAdmittedSerializer::class)
object APICallAdmissionReceiptAdmitted { const val value: Boolean = true }
object APICallAdmissionReceiptAdmittedSerializer : KSerializer<APICallAdmissionReceiptAdmitted> {
  override val descriptor = PrimitiveSerialDescriptor("APICallAdmissionReceiptAdmitted", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APICallAdmissionReceiptAdmitted {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APICallAdmissionReceiptAdmitted
  }
  override fun serialize(encoder: Encoder, value: APICallAdmissionReceiptAdmitted) { encoder.encodeBoolean(true) }
}

@Serializable
data class APICallAdmissionRedemption(
  val `nonce`: String
)

@Serializable
data class APICallAvailabilityCommand(
  val `timeZone`: String,
  val `windows`: List<APICallAvailabilityCommandWindowsItem>,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APICallAvailabilityCommandWindowsItem(
  val `startsAt`: String,
  val `endsAt`: String
)

@Serializable
data class APICallAvailability(
  val `creatorId`: String,
  val `version`: Long,
  val `timeZone`: String,
  val `windows`: List<APICallAvailabilityWindowsItem>
)

@Serializable
data class APICallAvailabilityWindowsItem(
  val `startsAt`: String,
  val `endsAt`: String
)

typealias APICallAvailabilityView = APICallAvailabilityViewValue?

@Serializable
data class APICallAvailabilityViewValue(
  val `creatorId`: String,
  val `version`: Long,
  val `timeZone`: String,
  val `windows`: List<APICallAvailabilityViewValueWindowsItem>
)

@Serializable
data class APICallAvailabilityViewValueWindowsItem(
  val `startsAt`: String,
  val `endsAt`: String
)

@Serializable
data class APICallCallAdmission(
  val `token`: String,
  val `url`: String,
  val `nonce`: String,
  val `sessionId`: String,
  val `accountId`: String,
  val `expiresAt`: String,
  val `role`: APICallCallAdmissionRole
)

@Serializable
enum class APICallCallAdmissionRole {
  @SerialName("creator") CREATOR,
  @SerialName("fan") FAN
}

@Serializable
enum class APICallCallConsentPurpose {
  @SerialName("recording") RECORDING,
  @SerialName("summary") SUMMARY,
  @SerialName("content_reuse") CONTENT_REUSE,
  @SerialName("ai_source") AI_SOURCE
}

@Serializable
data class APICallCallOfferContext(
  val `commitmentId`: String,
  val `threadId`: String,
  val `authorizationVersion`: Long,
  val `creatorName`: String,
  val `durationSeconds`: Long,
  val `mediaMode`: APICallCallOfferContextMediaMode
)

@Serializable
enum class APICallCallOfferContextMediaMode {
  @SerialName("audio") AUDIO,
  @SerialName("video") VIDEO
}

@Serializable
data class APICallCallOfferReceipt(
  val `id`: String,
  val `version`: Double,
  val `slots`: List<APICallCallOfferReceiptSlotsItem>,
  val `expiresAt`: String,
  val `creatorTimeZone`: String,
  val `fanTimeZone`: String,
  val `acceptance`: APICallCallOfferReceiptAcceptance
)

@Serializable
data class APICallCallOfferReceiptSlotsItem(
  val `id`: String,
  val `startsAt`: String
)

@Serializable
enum class APICallCallOfferReceiptAcceptance {
  @SerialName("accepted_by_commerce") ACCEPTED_BY_COMMERCE
}

@Serializable
data class APICallCallOffer(
  val `id`: String,
  val `commitmentId`: String,
  val `version`: Long,
  val `creatorTimeZone`: String,
  val `fanTimeZone`: String,
  val `expiresAt`: String,
  val `state`: APICallCallOfferState,
  @Required
  val `selectedSessionId`: String? = null,
  val `slots`: List<APICallCallOfferSlotsItem>
)

@Serializable
enum class APICallCallOfferState {
  @SerialName("offered") OFFERED,
  @SerialName("selected") SELECTED,
  @SerialName("expired") EXPIRED,
  @SerialName("cancelled") CANCELLED
}

@Serializable
data class APICallCallOfferSlotsItem(
  val `id`: String,
  val `startsAt`: String
)

typealias APICallCallOffers = List<APICallCallOffersValueItem>

@Serializable
data class APICallCallOffersValueItem(
  val `id`: String,
  val `commitmentId`: String,
  val `version`: Long,
  val `creatorTimeZone`: String,
  val `fanTimeZone`: String,
  val `expiresAt`: String,
  val `state`: APICallCallOffersValueItemState,
  @Required
  val `selectedSessionId`: String? = null,
  val `slots`: List<APICallCallOffersValueItemSlotsItem>
)

@Serializable
enum class APICallCallOffersValueItemState {
  @SerialName("offered") OFFERED,
  @SerialName("selected") SELECTED,
  @SerialName("expired") EXPIRED,
  @SerialName("cancelled") CANCELLED
}

@Serializable
data class APICallCallOffersValueItemSlotsItem(
  val `id`: String,
  val `startsAt`: String
)

@Serializable
data class APICallCallRevision(
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APICallCallRoute(
  val `sessionId`: String,
  val `creatorId`: String,
  val `fanId`: String
)

@Serializable
data class APICallCallSession(
  val `id`: String,
  val `commitmentId`: String,
  val `threadId`: String,
  val `creatorId`: String,
  val `fanId`: String,
  val `creatorName`: String,
  val `creatorAccountId`: String,
  val `fanAccountId`: String,
  val `mediaMode`: APICallCallSessionMediaMode,
  val `scheduledAt`: String,
  val `hardEndAt`: String,
  val `durationSeconds`: Long,
  val `graceSeconds`: Long,
  val `reconnectBudgetSeconds`: Long,
  val `connectedMilliseconds`: Long,
  val `reconnectUsedMilliseconds`: Long,
  val `reconnectExhaustedAt`: String? = null,
  val `state`: APICallCallSessionState,
  val `version`: Long,
  val `serverNow`: String,
  val `present`: List<APICallCallSessionPresentItem>,
  val `recordingState`: APICallCallSessionRecordingState,
  val `consents`: List<APICallCallSessionConsentsItem>,
  @Required
  val `outcome`: APICallCallSessionOutcome? = null,
  val `reconciliation`: APICallCallSessionReconciliation,
  val `conversationEpoch`: Long? = null,
  val `packet`: APICallCallSessionPacket,
  @Required
  val `summary`: String? = null,
  val `creatorSummaryNote`: String? = null,
  val `summaryState`: APICallCallSessionSummaryState? = null,
  val `summaryRevision`: Long? = null,
  val `summarySources`: APICallCallSessionSummarySources? = null,
  val `recordingOccurred`: Boolean? = null
)

@Serializable
enum class APICallCallSessionMediaMode {
  @SerialName("audio") AUDIO,
  @SerialName("video") VIDEO
}

@Serializable
enum class APICallCallSessionState {
  @SerialName("scheduled") SCHEDULED,
  @SerialName("waiting") WAITING,
  @SerialName("connecting") CONNECTING,
  @SerialName("connected") CONNECTED,
  @SerialName("reconnecting") RECONNECTING,
  @SerialName("ending") ENDING,
  @SerialName("ended") ENDED,
  @SerialName("cancelled") CANCELLED
}

@Serializable
enum class APICallCallSessionPresentItem {
  @SerialName("creator") CREATOR,
  @SerialName("fan") FAN
}

@Serializable
enum class APICallCallSessionRecordingState {
  @SerialName("off") OFF,
  @SerialName("starting") STARTING,
  @SerialName("on") ON,
  @SerialName("stopping") STOPPING,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APICallCallSessionConsentsItem(
  val `id`: String,
  val `actorAccountId`: String,
  val `role`: APICallCallSessionConsentsItemRole,
  val `purpose`: APICallCallSessionConsentsItemPurpose,
  val `granted`: Boolean,
  val `at`: String,
  @Required
  val `revokedAt`: String? = null
)

@Serializable
enum class APICallCallSessionConsentsItemRole {
  @SerialName("creator") CREATOR,
  @SerialName("fan") FAN
}

@Serializable
enum class APICallCallSessionConsentsItemPurpose {
  @SerialName("recording") RECORDING,
  @SerialName("summary") SUMMARY,
  @SerialName("content_reuse") CONTENT_REUSE,
  @SerialName("ai_source") AI_SOURCE
}

@Serializable
enum class APICallCallSessionOutcome {
  @SerialName("completed") COMPLETED,
  @SerialName("partial") PARTIAL,
  @SerialName("creator_no_show") CREATOR_NO_SHOW,
  @SerialName("fan_no_show") FAN_NO_SHOW,
  @SerialName("technical_failure") TECHNICAL_FAILURE
}

@Serializable
enum class APICallCallSessionReconciliation {
  @SerialName("pending") PENDING,
  @SerialName("complete") COMPLETE,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APICallCallSessionPacket(
  val `summary`: String,
  val `attachmentIds`: List<String>
)

@Serializable
enum class APICallCallSessionSummaryState {
  @SerialName("absent") ABSENT,
  @SerialName("pending") PENDING,
  @SerialName("ready") READY,
  @SerialName("deleted") DELETED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APICallCallSessionSummarySources(
  val `kind`: APICallCallSessionSummarySourcesKind,
  val `commitmentId`: String,
  val `noteRevision`: Long
)

@Serializable
enum class APICallCallSessionSummarySourcesKind {
  @SerialName("packet_and_creator_note") PACKET_AND_CREATOR_NOTE
}

@Serializable
data class APICallCallSummaryNote(
  val `note`: String,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APICallConsentCommand(
  val `purpose`: APICallConsentCommandPurpose,
  val `granted`: Boolean,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
enum class APICallConsentCommandPurpose {
  @SerialName("recording") RECORDING,
  @SerialName("summary") SUMMARY,
  @SerialName("content_reuse") CONTENT_REUSE,
  @SerialName("ai_source") AI_SOURCE
}

@Serializable
data class APICallEndCall(
  val `expectedVersion`: Long,
  val `fanChoice`: APICallEndCallFanChoice? = null,
  val `idempotencyKey`: String
)

@Serializable
enum class APICallEndCallFanChoice {
  @SerialName("end_by_choice") END_BY_CHOICE,
  @SerialName("technical_problem") TECHNICAL_PROBLEM
}

@Serializable
data class APICallOfferTimes(
  val `commitmentId`: String,
  val `startsAt`: List<String>,
  val `creatorTimeZone`: String,
  val `fanTimeZone`: String,
  val `expiresAt`: String,
  val `expectedAuthorizationVersion`: Long,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APICallSelectTime(
  val `slotId`: String,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
enum class APICallSessionOutcome {
  @SerialName("completed") COMPLETED,
  @SerialName("partial") PARTIAL,
  @SerialName("creator_no_show") CREATOR_NO_SHOW,
  @SerialName("fan_no_show") FAN_NO_SHOW,
  @SerialName("technical_failure") TECHNICAL_FAILURE
}

@Serializable
enum class APICallSessionState {
  @SerialName("scheduled") SCHEDULED,
  @SerialName("waiting") WAITING,
  @SerialName("connecting") CONNECTING,
  @SerialName("connected") CONNECTED,
  @SerialName("reconnecting") RECONNECTING,
  @SerialName("ending") ENDING,
  @SerialName("ended") ENDED,
  @SerialName("cancelled") CANCELLED
}

typealias APIContentAudience = JsonElement

@Serializable
data class APIContentConsentResult(
  val `version`: Long,
  val `share_text`: Boolean,
  val `show_handle`: Boolean
)

@Serializable
data class APIContentDocument(
  val `kind`: APIContentDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentDocumentPlanRef? = null,
  val `live`: APIContentDocumentLive? = null
)

@Serializable
enum class APIContentDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
data class APIContentEffectsResult(
  val `processed`: Long
)

typealias APIContentKey = String

@Serializable
data class APIContentList(
  val `items`: List<APIContentListItemsItem>,
  @Required
  val `nextCursor`: String? = null,
  val `serverTime`: String
)

@Serializable
data class APIContentListItemsItem(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  @Required
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentListItemsItemAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `publishedAt`: String? = null,
  val `document`: APIContentListItemsItemDocument,
  @Required
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentListItemsItemSourceState,
  @Required
  val `quotedText`: String? = null,
  @Required
  val `quotedHandle`: String? = null
)

@Serializable
enum class APIContentListItemsItemAuthorKind {
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("team") TEAM
}

@Serializable
data class APIContentListItemsItemDocument(
  val `kind`: APIContentListItemsItemDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentListItemsItemDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentListItemsItemDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentListItemsItemDocumentPlanRef? = null,
  val `live`: APIContentListItemsItemDocumentLive? = null
)

@Serializable
enum class APIContentListItemsItemDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentListItemsItemDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentListItemsItemDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentListItemsItemDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentListItemsItemDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentListItemsItemDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentListItemsItemDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
enum class APIContentListItemsItemSourceState {
  @SerialName("not_requested") NOT_REQUESTED,
  @SerialName("candidate_pending") CANDIDATE_PENDING,
  @SerialName("candidate") CANDIDATE,
  @SerialName("revocation_pending") REVOCATION_PENDING,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIContentLiveCatalog(
  val `available`: Boolean,
  val `items`: List<APIContentLiveCatalogItemsItem>
)

@Serializable
data class APIContentLiveCatalogItemsItem(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null,
  val `replayReady`: Boolean
)

@Serializable
data class APIContentMedia(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentMediaKind,
  val `alt`: String
)

@Serializable
enum class APIContentMediaKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentMuteCommand(
  val `muted`: Boolean
)

@Serializable
data class APIContentPage(
  val `cursor`: String? = null,
  val `limit`: Long,
  val `state`: APIContentPageState? = null,
  val `query`: String? = null
)

@Serializable
enum class APIContentPageState {
  @SerialName("draft") DRAFT,
  @SerialName("media_pending") MEDIA_PENDING,
  @SerialName("scheduled") SCHEDULED,
  @SerialName("published") PUBLISHED,
  @SerialName("unpublished") UNPUBLISHED,
  @SerialName("archived") ARCHIVED
}

@Serializable
data class APIContentPreference(
  val `accountId`: String,
  val `muted`: Boolean
)

@Serializable
data class APIContentReactionResult(
  val `replyId`: String,
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentReplyList(
  val `items`: List<APIContentReplyListItemsItem>,
  @Required
  val `nextCursor`: String? = null
)

@Serializable
data class APIContentReplyListItemsItem(
  val `safetyState`: APIContentReplyListItemsItemSafetyState,
  val `safetyReviewAvailable`: Boolean,
  val `read`: Boolean,
  val `id`: String,
  val `contentId`: String,
  val `fanId`: String,
  val `handle`: String,
  val `text`: String,
  val `version`: Long,
  val `createdAt`: String,
  val `tenure`: APIContentReplyListItemsItemTenure? = null,
  val `consent`: APIContentReplyListItemsItemConsent,
  @Required
  val `reaction`: APIContentReplyListItemsItemReaction? = null
)

@Serializable
enum class APIContentReplyListItemsItemSafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentReplyListItemsItemTenure(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIContentReplyListItemsItemTenureBasis,
  val `historyComplete`: APIContentReplyListItemsItemTenureHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIContentReplyListItemsItemTenureBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentReplyListItemsItemTenureHistoryCompleteSerializer::class)
object APIContentReplyListItemsItemTenureHistoryComplete { const val value: Boolean = false }
object APIContentReplyListItemsItemTenureHistoryCompleteSerializer : KSerializer<APIContentReplyListItemsItemTenureHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentReplyListItemsItemTenureHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentReplyListItemsItemTenureHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentReplyListItemsItemTenureHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentReplyListItemsItemTenureHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIContentReplyListItemsItemConsent(
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `version`: Long
)

@Serializable
data class APIContentReplyListItemsItemReaction(
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentReplyPage(
  val `cursor`: String? = null,
  val `limit`: Long,
  val `contentId`: String? = null,
  val `filter`: APIContentReplyPageFilter
)

@Serializable
enum class APIContentReplyPageFilter {
  @SerialName("all") ALL,
  @SerialName("unread") UNREAD,
  @SerialName("reacted") REACTED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentReplyReadResult(
  val `id`: String,
  val `version`: Long,
  val `read`: APIContentReplyReadResultRead
)

@Serializable(with = APIContentReplyReadResultReadSerializer::class)
object APIContentReplyReadResultRead { const val value: Boolean = true }
object APIContentReplyReadResultReadSerializer : KSerializer<APIContentReplyReadResultRead> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentReplyReadResultRead", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentReplyReadResultRead {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIContentReplyReadResultRead
  }
  override fun serialize(encoder: Encoder, value: APIContentReplyReadResultRead) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIContentReplyReviewResult(
  val `id`: String,
  val `version`: Long,
  val `safetyState`: APIContentReplyReviewResultSafetyState
)

@Serializable
enum class APIContentReplyReviewResultSafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentResult(
  val `id`: String,
  val `version`: Long,
  val `state`: String,
  val `signedActId`: String? = null
)

@Serializable
data class APIContentRevisionResult(
  val `id`: String,
  val `version`: Long
)

@Serializable
data class APIContentScheduledResult(
  val `published`: Long
)

@Serializable
data class APIContentTenureRecognition(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIContentTenureRecognitionBasis,
  val `historyComplete`: APIContentTenureRecognitionHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIContentTenureRecognitionBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentTenureRecognitionHistoryCompleteSerializer::class)
object APIContentTenureRecognitionHistoryComplete { const val value: Boolean = false }
object APIContentTenureRecognitionHistoryCompleteSerializer : KSerializer<APIContentTenureRecognitionHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentTenureRecognitionHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentTenureRecognitionHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentTenureRecognitionHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentTenureRecognitionHistoryComplete) { encoder.encodeBoolean(false) }
}

typealias APIContentThanksFeed = List<APIContentThanksFeedValueItem>

@Serializable
data class APIContentThanksFeedValueItem(
  val `id`: String,
  val `version`: Long,
  val `target_kind`: APIContentThanksFeedValueItemTargetKind,
  val `target_id`: String,
  val `text`: String,
  @Required
  val `handle`: String? = null,
  val `created_at`: String
)

@Serializable
enum class APIContentThanksFeedValueItemTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

@Serializable
data class APIContentThanksQuery(
  val `targetKind`: APIContentThanksQueryTargetKind,
  val `targetId`: String
)

@Serializable
enum class APIContentThanksQueryTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

typealias APIContentThanksView = APIContentThanksViewValue?

@Serializable
data class APIContentThanksViewValue(
  val `id`: String,
  val `version`: Long,
  val `text`: String,
  val `shareWithCreatorDigest`: Boolean,
  val `showIdentity`: Boolean,
  val `withdrawn`: Boolean
)

@Serializable
data class APIContentVersionCommand(
  val `version`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIContentView(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  @Required
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentViewAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `publishedAt`: String? = null,
  val `document`: APIContentViewDocument,
  @Required
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentViewSourceState,
  @Required
  val `quotedText`: String? = null,
  @Required
  val `quotedHandle`: String? = null
)

@Serializable
enum class APIContentViewAuthorKind {
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("team") TEAM
}

@Serializable
data class APIContentViewDocument(
  val `kind`: APIContentViewDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentViewDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentViewDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentViewDocumentPlanRef? = null,
  val `live`: APIContentViewDocumentLive? = null
)

@Serializable
enum class APIContentViewDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentViewDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentViewDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentViewDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentViewDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentViewDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentViewDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
enum class APIContentViewSourceState {
  @SerialName("not_requested") NOT_REQUESTED,
  @SerialName("candidate_pending") CANDIDATE_PENDING,
  @SerialName("candidate") CANDIDATE,
  @SerialName("revocation_pending") REVOCATION_PENDING,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIContentWithdrawResult(
  val `id`: String,
  val `withdrawn`: APIContentWithdrawResultWithdrawn
)

@Serializable(with = APIContentWithdrawResultWithdrawnSerializer::class)
object APIContentWithdrawResultWithdrawn { const val value: Boolean = true }
object APIContentWithdrawResultWithdrawnSerializer : KSerializer<APIContentWithdrawResultWithdrawn> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentWithdrawResultWithdrawn", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentWithdrawResultWithdrawn {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIContentWithdrawResultWithdrawn
  }
  override fun serialize(encoder: Encoder, value: APIContentWithdrawResultWithdrawn) { encoder.encodeBoolean(true) }
}

@Serializable
data class APINoteReplyPolicy(
  val `accountId`: String,
  val `creatorId`: String,
  val `limit`: JsonElement,
  @Required
  val `confirmedDays`: Long? = null,
  @Required
  val `milestone`: JsonElement? = null,
  @Required
  val `basis`: APINoteReplyPolicyBasis? = null,
  val `historyComplete`: APINoteReplyPolicyHistoryComplete,
  val `longerRepliesActive`: Boolean,
  val `checkedAt`: String
)

@Serializable
enum class APINoteReplyPolicyBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APINoteReplyPolicyHistoryCompleteSerializer::class)
object APINoteReplyPolicyHistoryComplete { const val value: Boolean = false }
object APINoteReplyPolicyHistoryCompleteSerializer : KSerializer<APINoteReplyPolicyHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APINoteReplyPolicyHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APINoteReplyPolicyHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APINoteReplyPolicyHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APINoteReplyPolicyHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIPrivateNoteReply(
  val `safetyState`: APIPrivateNoteReplySafetyState,
  val `safetyReviewAvailable`: Boolean,
  val `read`: Boolean,
  val `id`: String,
  val `contentId`: String,
  val `fanId`: String,
  val `handle`: String,
  val `text`: String,
  val `version`: Long,
  val `createdAt`: String,
  val `tenure`: APIPrivateNoteReplyTenure? = null,
  val `consent`: APIPrivateNoteReplyConsent,
  @Required
  val `reaction`: APIPrivateNoteReplyReaction? = null
)

@Serializable
enum class APIPrivateNoteReplySafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIPrivateNoteReplyTenure(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIPrivateNoteReplyTenureBasis,
  val `historyComplete`: APIPrivateNoteReplyTenureHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIPrivateNoteReplyTenureBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIPrivateNoteReplyTenureHistoryCompleteSerializer::class)
object APIPrivateNoteReplyTenureHistoryComplete { const val value: Boolean = false }
object APIPrivateNoteReplyTenureHistoryCompleteSerializer : KSerializer<APIPrivateNoteReplyTenureHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIPrivateNoteReplyTenureHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIPrivateNoteReplyTenureHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIPrivateNoteReplyTenureHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIPrivateNoteReplyTenureHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIPrivateNoteReplyConsent(
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `version`: Long
)

@Serializable
data class APIPrivateNoteReplyReaction(
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIPublishContent(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `signedActId`: String
)

@Serializable
data class APIQuoteConsent(
  val `version`: Long,
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `idempotencyKey`: String
)

@Serializable
data class APIReactToReply(
  val `version`: Long,
  val `kind`: APIReactToReplyKind,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
enum class APIReactToReplyKind {
  @SerialName("heart") HEART,
  @SerialName("thanks") THANKS,
  @SerialName("helpful") HELPFUL
}

@Serializable
data class APIReplyToNote(
  val `text`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APISaveContent(
  val `id`: String,
  val `expectedVersion`: Long,
  val `document`: APISaveContentDocument,
  val `idempotencyKey`: String
)

@Serializable
data class APISaveContentDocument(
  val `kind`: APISaveContentDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APISaveContentDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APISaveContentDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APISaveContentDocumentPlanRef? = null,
  val `live`: APISaveContentDocumentLive? = null
)

@Serializable
enum class APISaveContentDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APISaveContentDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APISaveContentDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APISaveContentDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APISaveContentDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APISaveContentDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APISaveContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
data class APIThanksCommand(
  val `targetKind`: APIThanksCommandTargetKind,
  val `targetId`: String,
  val `text`: String,
  val `shareWithCreatorDigest`: Boolean,
  val `showIdentity`: Boolean,
  val `withdrawn`: Boolean,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
enum class APIThanksCommandTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

@Serializable
data class APIStudioInvite(
  val `handle`: String,
  val `roles`: List<APIStudioInviteRolesItem>
)

@Serializable
enum class APIStudioInviteRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioQueueQuery(
  val `cursor`: String? = null,
  val `filter`: APIStudioQueueQueryFilter,
  val `limit`: Long
)

@Serializable
enum class APIStudioQueueQueryFilter {
  @SerialName("all") ALL,
  @SerialName("due") DUE,
  @SerialName("decide") DECIDE,
  @SerialName("more_info") MORE_INFO
}

@Serializable
data class APIStudioSaveReplyDraft(
  val `text`: String,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIStudioSendReplyDraft(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `signedActId`: String
)

@Serializable
data class APIStudioCorrection(
  val `idempotencyKey`: String,
  val `expectedRevision`: Long,
  val `paraphrasedPrompt`: String,
  val `rule`: String,
  val `unacceptableAnswer`: String
)

@Serializable
data class APIStudioRevision(
  val `revision`: Long
)

@Serializable
data class APIStudioDraftVersion(
  val `version`: Long
)

@Serializable
data class APIStudioReplyDraft(
  val `text`: String,
  val `version`: Long,
  @Required
  val `sentMessageId`: String? = null
)

@Serializable
data class APIStudioSession(
  val `creators`: List<APIStudioSessionCreatorsItem>,
  val `invitations`: List<APIStudioSessionInvitationsItem>,
  val `serverTime`: String
)

@Serializable
data class APIStudioSessionCreatorsItem(
  val `id`: String,
  val `display_name`: String,
  val `handle`: String,
  val `verification`: String,
  val `owned`: Boolean,
  val `roles`: List<APIStudioSessionCreatorsItemRolesItem>,
  @Required
  val `memberHandle`: String? = null,
  val `viewerAccountId`: String
)

@Serializable
enum class APIStudioSessionCreatorsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioSessionInvitationsItem(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `roles`: List<APIStudioSessionInvitationsItemRolesItem>,
  val `expiresAt`: String
)

@Serializable
enum class APIStudioSessionInvitationsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioAudiences(
  val `audienceCountsAvailable`: Boolean,
  val `tiers`: List<APIStudioAudiencesTiersItem>,
  val `groups`: List<APIStudioAudiencesGroupsItem>
)

@Serializable
data class APIStudioAudiencesTiersItem(
  val `id`: String,
  val `name`: String
)

@Serializable
data class APIStudioAudiencesGroupsItem(
  val `id`: String,
  val `name`: String
)

@Serializable
data class APIStudioInvitation(
  val `id`: String,
  val `roles`: List<APIStudioInvitationRolesItem>,
  val `creatorId`: String? = null,
  val `accountId`: String? = null,
  val `expiresAt`: String? = null,
  val `accepted`: Boolean? = null
)

@Serializable
enum class APIStudioInvitationRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

typealias APIStudioCommerceProjection = JsonElement

@Serializable
data class APIStudioTeam(
  val `members`: List<APIStudioTeamMembersItem>,
  val `invitations`: List<APIStudioTeamInvitationsItem>
)

@Serializable
data class APIStudioTeamMembersItem(
  val `account_id`: String,
  val `roles`: List<APIStudioTeamMembersItemRolesItem>,
  @Required
  val `revoked_at`: String? = null,
  @Required
  val `handle`: String? = null
)

@Serializable
enum class APIStudioTeamMembersItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioTeamInvitationsItem(
  val `id`: String,
  val `account_id`: String,
  @Required
  val `handle`: String? = null,
  val `roles`: List<APIStudioTeamInvitationsItemRolesItem>,
  val `expires_at`: String,
  @Required
  val `accepted_at`: String? = null,
  @Required
  val `revoked_at`: String? = null
)

@Serializable
enum class APIStudioTeamInvitationsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioControlCommand(
  val `idempotencyKey`: String
)

@Serializable
data class APIStudioThreadEntries(
  val `items`: List<APIStudioThreadEntriesItemsItem>,
  @Required
  val `nextCursor`: String? = null,
  val `coverage`: APIStudioThreadEntriesCoverage
)

@Serializable
data class APIStudioThreadEntriesItemsItem(
  val `fanId`: String,
  val `handle`: String,
  val `sources`: List<APIStudioThreadEntriesItemsItemSourcesItem>,
  val `updatedAt`: String
)

@Serializable
enum class APIStudioThreadEntriesItemsItemSourcesItem {
  @SerialName("note_reply") NOTE_REPLY,
  @SerialName("request") REQUEST
}

@Serializable
enum class APIStudioThreadEntriesCoverage {
  @SerialName("notes_and_requests") NOTES_AND_REQUESTS
}

@Serializable
data class APIContentReview(
  val `command`: APIContentReviewCommand,
  val `view`: APIContentReviewView
)

@Serializable
data class APIContentReviewCommand(
  val `actType`: APIContentReviewCommandActType,
  val `subjectId`: String,
  val `content`: JsonElement
)

@Serializable
enum class APIContentReviewCommandActType {
  @SerialName("reply") REPLY,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("broadcast") BROADCAST,
  @SerialName("reaction") REACTION,
  @SerialName("accept") ACCEPT,
  @SerialName("correction") CORRECTION
}

@Serializable
data class APIContentReviewView(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  @Required
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentReviewViewAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `publishedAt`: String? = null,
  val `document`: APIContentReviewViewDocument,
  @Required
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentReviewViewSourceState,
  @Required
  val `quotedText`: String? = null,
  @Required
  val `quotedHandle`: String? = null
)

@Serializable
enum class APIContentReviewViewAuthorKind {
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("team") TEAM
}

@Serializable
data class APIContentReviewViewDocument(
  val `kind`: APIContentReviewViewDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentReviewViewDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentReviewViewDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentReviewViewDocumentPlanRef? = null,
  val `live`: APIContentReviewViewDocumentLive? = null
)

@Serializable
enum class APIContentReviewViewDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentReviewViewDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentReviewViewDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentReviewViewDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentReviewViewDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentReviewViewDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentReviewViewDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
enum class APIContentReviewViewSourceState {
  @SerialName("not_requested") NOT_REQUESTED,
  @SerialName("candidate_pending") CANDIDATE_PENDING,
  @SerialName("candidate") CANDIDATE,
  @SerialName("revocation_pending") REVOCATION_PENDING,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIConsentEnvelope(
  val `id`: String,
  val `schemaVersion`: Double,
  val `actorAccountId`: String,
  val `occurredAt`: String,
  val `purpose`: String,
  val `policyVersion`: String,
  val `decision`: APIConsentEnvelopeDecision,
  val `scope`: APIConsentEnvelopeScope
)

@Serializable
enum class APIConsentEnvelopeDecision {
  @SerialName("grant") GRANT,
  @SerialName("withdraw") WITHDRAW
}

@Serializable
data class APIConsentEnvelopeScope(
  val `creatorId`: String? = null,
  val `threadId`: String? = null,
  val `subjectId`: String? = null
)

@Serializable
data class APICompleteIdentity(
  val `continuationId`: String,
  val `code`: String,
  val `state`: String? = null
)

@Serializable
data class APIFanProfileInput(
  val `handle`: String,
  val `intro`: String
)

@Serializable
data class APIFanProfile(
  val `id`: String,
  val `handle`: String,
  val `intro`: String,
  val `version`: Long
)

@Serializable
data class APICreatorProfileInput(
  val `handle`: String,
  val `displayName`: String
)

@Serializable
data class APICreatorProfile(
  val `id`: String,
  val `handle`: String,
  val `displayName`: String,
  val `verification`: APICreatorProfileVerification,
  val `version`: Long
)

@Serializable
enum class APICreatorProfileVerification {
  @SerialName("pending") PENDING,
  @SerialName("verified") VERIFIED,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APISession(
  val `accountId`: String,
  val `adultEligible`: APISessionAdultEligible,
  val `sessionId`: String,
  val `expiresAt`: String,
  val `mode`: APISessionMode,
  @Required
  val `fan`: APISessionFan? = null,
  @Required
  val `creator`: APISessionCreator? = null,
  val `teams`: List<APISessionTeamsItem>
)

@Serializable(with = APISessionAdultEligibleSerializer::class)
object APISessionAdultEligible { const val value: Boolean = true }
object APISessionAdultEligibleSerializer : KSerializer<APISessionAdultEligible> {
  override val descriptor = PrimitiveSerialDescriptor("APISessionAdultEligible", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APISessionAdultEligible {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APISessionAdultEligible
  }
  override fun serialize(encoder: Encoder, value: APISessionAdultEligible) { encoder.encodeBoolean(true) }
}

@Serializable
enum class APISessionMode {
  @SerialName("development") DEVELOPMENT,
  @SerialName("pantopus") PANTOPUS
}

@Serializable
data class APISessionFan(
  val `id`: String,
  val `handle`: String,
  val `intro`: String,
  val `version`: Long
)

@Serializable
data class APISessionCreator(
  val `id`: String,
  val `handle`: String,
  val `displayName`: String,
  val `verification`: APISessionCreatorVerification,
  val `version`: Long
)

@Serializable
enum class APISessionCreatorVerification {
  @SerialName("pending") PENDING,
  @SerialName("verified") VERIFIED,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APISessionTeamsItem(
  val `creatorId`: String,
  val `roles`: List<APISessionTeamsItemRolesItem>
)

@Serializable
enum class APISessionTeamsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIIdentityCompletion(
  val `token`: String,
  val `returnTo`: String,
  val `session`: APIIdentityCompletionSession
)

@Serializable
data class APIIdentityCompletionSession(
  val `accountId`: String,
  val `adultEligible`: APIIdentityCompletionSessionAdultEligible,
  val `sessionId`: String,
  val `expiresAt`: String,
  val `mode`: APIIdentityCompletionSessionMode,
  @Required
  val `fan`: APIIdentityCompletionSessionFan? = null,
  @Required
  val `creator`: APIIdentityCompletionSessionCreator? = null,
  val `teams`: List<APIIdentityCompletionSessionTeamsItem>
)

@Serializable(with = APIIdentityCompletionSessionAdultEligibleSerializer::class)
object APIIdentityCompletionSessionAdultEligible { const val value: Boolean = true }
object APIIdentityCompletionSessionAdultEligibleSerializer : KSerializer<APIIdentityCompletionSessionAdultEligible> {
  override val descriptor = PrimitiveSerialDescriptor("APIIdentityCompletionSessionAdultEligible", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIIdentityCompletionSessionAdultEligible {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIIdentityCompletionSessionAdultEligible
  }
  override fun serialize(encoder: Encoder, value: APIIdentityCompletionSessionAdultEligible) { encoder.encodeBoolean(true) }
}

@Serializable
enum class APIIdentityCompletionSessionMode {
  @SerialName("development") DEVELOPMENT,
  @SerialName("pantopus") PANTOPUS
}

@Serializable
data class APIIdentityCompletionSessionFan(
  val `id`: String,
  val `handle`: String,
  val `intro`: String,
  val `version`: Long
)

@Serializable
data class APIIdentityCompletionSessionCreator(
  val `id`: String,
  val `handle`: String,
  val `displayName`: String,
  val `verification`: APIIdentityCompletionSessionCreatorVerification,
  val `version`: Long
)

@Serializable
enum class APIIdentityCompletionSessionCreatorVerification {
  @SerialName("pending") PENDING,
  @SerialName("verified") VERIFIED,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIIdentityCompletionSessionTeamsItem(
  val `creatorId`: String,
  val `roles`: List<APIIdentityCompletionSessionTeamsItemRolesItem>
)

@Serializable
enum class APIIdentityCompletionSessionTeamsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APISessionToken(
  val `token`: String,
  val `expiresAt`: String
)

@Serializable
data class APIDone(
  val `done`: APIDoneDone
)

@Serializable(with = APIDoneDoneSerializer::class)
object APIDoneDone { const val value: Boolean = true }
object APIDoneDoneSerializer : KSerializer<APIDoneDone> {
  override val descriptor = PrimitiveSerialDescriptor("APIDoneDone", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIDoneDone {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIDoneDone
  }
  override fun serialize(encoder: Encoder, value: APIDoneDone) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIProofInput(
  val `platform`: APIProofInputPlatform,
  val `accountUrl`: String
)

@Serializable
enum class APIProofInputPlatform {
  @SerialName("instagram") INSTAGRAM,
  @SerialName("youtube") YOUTUBE
}

@Serializable
data class APIProofSubmit(
  val `postUrl`: String
)

@Serializable
data class APIProof(
  val `id`: String,
  val `code`: String,
  val `platform`: APIProofPlatform,
  val `accountUrl`: String,
  @Required
  val `postUrl`: String? = null,
  val `expiresAt`: String,
  val `state`: APIProofState,
  @Required
  val `reason`: String? = null
)

@Serializable
enum class APIProofPlatform {
  @SerialName("instagram") INSTAGRAM,
  @SerialName("youtube") YOUTUBE
}

@Serializable
enum class APIProofState {
  @SerialName("challenge") CHALLENGE,
  @SerialName("pending") PENDING,
  @SerialName("approved") APPROVED,
  @SerialName("rejected") REJECTED,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APITeamInvite(
  val `accountId`: String,
  val `roles`: List<APITeamInviteRolesItem>
)

@Serializable
enum class APITeamInviteRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APITeamRolesUpdateInput(
  val `expectedRoles`: List<APITeamRolesUpdateInputExpectedRolesItem>,
  val `roles`: List<APITeamRolesUpdateInputRolesItem>
)

@Serializable
enum class APITeamRolesUpdateInputExpectedRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
enum class APITeamRolesUpdateInputRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APITeamInvitation(
  val `id`: String,
  val `creatorId`: String,
  val `accountId`: String,
  val `roles`: List<APITeamInvitationRolesItem>,
  val `expiresAt`: String,
  val `accepted`: Boolean
)

@Serializable
enum class APITeamInvitationRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIPasskeyOptions(
  val `challengeId`: String,
  val `options`: JsonElement
)

@Serializable
data class APIPasskeyRegistration(
  val `challengeId`: String,
  val `credential`: JsonElement
)

@Serializable
data class APIPasskeyRevocation(
  val `credentialId`: String
)

@Serializable
data class APIPasskeys(
  val `credentials`: List<APIPasskeysCredentialsItem>,
  val `recoveryRequired`: Boolean
)

@Serializable
data class APIPasskeysCredentialsItem(
  val `id`: String,
  val `createdAt`: String,
  val `revoked`: Boolean
)

@Serializable
data class APIPublicSignature(
  val `signedActId`: String,
  val `creatorName`: String,
  val `actType`: String,
  val `contentHash`: String,
  val `verifiedAt`: String,
  val `status`: APIPublicSignatureStatus,
  @Required
  val `content`: JsonElement? = null,
  val `contentAvailable`: Boolean,
  val `explanation`: String
)

@Serializable
enum class APIPublicSignatureStatus {
  @SerialName("valid") VALID,
  @SerialName("key_revoked") KEY_REVOKED,
  @SerialName("creator_revoked") CREATOR_REVOKED,
  @SerialName("withdrawn") WITHDRAWN
}

@Serializable
enum class APIAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIThreadControl {
  @SerialName("ai_active") AI_ACTIVE,
  @SerialName("human_active") HUMAN_ACTIVE,
  @SerialName("ai_paused") AI_PAUSED,
  @SerialName("closed") CLOSED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APISendMessage(
  val `text`: String,
  val `idempotencyKey`: String,
  val `clientSequence`: Long
)

@Serializable
data class APIHumanReply(
  val `text`: String,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APIControlCommand(
  val `idempotencyKey`: String
)

@Serializable
data class APISignedActCommand(
  val `actType`: APISignedActCommandActType,
  val `subjectId`: String,
  val `content`: JsonElement
)

@Serializable
enum class APISignedActCommandActType {
  @SerialName("reply") REPLY,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("broadcast") BROADCAST,
  @SerialName("reaction") REACTION,
  @SerialName("accept") ACCEPT,
  @SerialName("correction") CORRECTION
}

@Serializable
data class APIBeginSignedAct(
  val `fanId`: String? = null,
  val `command`: APIBeginSignedActCommand
)

@Serializable
data class APIBeginSignedActCommand(
  val `actType`: APIBeginSignedActCommandActType,
  val `subjectId`: String,
  val `content`: JsonElement
)

@Serializable
enum class APIBeginSignedActCommandActType {
  @SerialName("reply") REPLY,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("broadcast") BROADCAST,
  @SerialName("reaction") REACTION,
  @SerialName("accept") ACCEPT,
  @SerialName("correction") CORRECTION
}

@Serializable
data class APIIdentityContinue(
  val `returnTo`: String
)

@Serializable
data class APIIdentityRedirect(
  val `redirectUrl`: String,
  val `continuationId`: String? = null
)

@Serializable
data class APIIdentityCapabilities(
  val `signInAvailable`: Boolean,
  val `localAccountsAllowed`: APIIdentityCapabilitiesLocalAccountsAllowed,
  val `mode`: APIIdentityCapabilitiesMode? = null,
  val `developmentActors`: List<APIIdentityCapabilitiesDevelopmentActorsItem>? = null
)

@Serializable(with = APIIdentityCapabilitiesLocalAccountsAllowedSerializer::class)
object APIIdentityCapabilitiesLocalAccountsAllowed { const val value: Boolean = false }
object APIIdentityCapabilitiesLocalAccountsAllowedSerializer : KSerializer<APIIdentityCapabilitiesLocalAccountsAllowed> {
  override val descriptor = PrimitiveSerialDescriptor("APIIdentityCapabilitiesLocalAccountsAllowed", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIIdentityCapabilitiesLocalAccountsAllowed {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIIdentityCapabilitiesLocalAccountsAllowed
  }
  override fun serialize(encoder: Encoder, value: APIIdentityCapabilitiesLocalAccountsAllowed) { encoder.encodeBoolean(false) }
}

@Serializable
enum class APIIdentityCapabilitiesMode {
  @SerialName("development") DEVELOPMENT,
  @SerialName("pantopus") PANTOPUS,
  @SerialName("unconfigured") UNCONFIGURED
}

@Serializable
data class APIIdentityCapabilitiesDevelopmentActorsItem(
  val `id`: String,
  val `label`: String
)

@Serializable
data class APISignedChallenge(
  val `challengeId`: String,
  val `publicKey`: APISignedChallengePublicKey
)

@Serializable
data class APISignedChallengePublicKey(
  val `challenge`: String,
  val `rpId`: String,
  val `timeout`: Long,
  val `userVerification`: APISignedChallengePublicKeyUserVerification,
  val `allowCredentials`: List<APISignedChallengePublicKeyAllowCredentialsItem>
)

@Serializable
enum class APISignedChallengePublicKeyUserVerification {
  @SerialName("required") REQUIRED
}

@Serializable
data class APISignedChallengePublicKeyAllowCredentialsItem(
  val `id`: String,
  val `type`: APISignedChallengePublicKeyAllowCredentialsItemType
)

@Serializable
enum class APISignedChallengePublicKeyAllowCredentialsItemType {
  @SerialName("public-key") PUBLIC_KEY
}

@Serializable
data class APIVerifySignedAct(
  val `challengeId`: String,
  val `assertion`: APIVerifySignedActAssertion
)

@Serializable
data class APIVerifySignedActAssertion(
  val `id`: String,
  val `rawId`: String,
  val `type`: APIVerifySignedActAssertionType,
  val `response`: APIVerifySignedActAssertionResponse,
  val `clientExtensionResults`: Map<String, JsonElement>,
  val `authenticatorAttachment`: APIVerifySignedActAssertionAuthenticatorAttachment? = null
)

@Serializable
enum class APIVerifySignedActAssertionType {
  @SerialName("public-key") PUBLIC_KEY
}

@Serializable
data class APIVerifySignedActAssertionResponse(
  val `clientDataJSON`: String,
  val `authenticatorData`: String,
  val `signature`: String,
  val `userHandle`: String? = null
)

@Serializable
enum class APIVerifySignedActAssertionAuthenticatorAttachment {
  @SerialName("platform") PLATFORM,
  @SerialName("cross-platform") CROSS_PLATFORM
}

@Serializable
data class APISignedActResult(
  val `signedActId`: String
)

@Serializable
data class APIError(
  val `error`: APIErrorError
)

@Serializable
data class APIErrorError(
  val `code`: String,
  val `message`: String,
  val `requestId`: String
)

@Serializable
data class APIHealth(
  val `status`: APIHealthStatus,
  val `ready`: Boolean,
  val `identity`: APIHealthIdentity,
  val `database`: APIHealthDatabase,
  val `featureEnabled`: Boolean
)

@Serializable
enum class APIHealthStatus {
  @SerialName("ok") OK
}

@Serializable
enum class APIHealthIdentity {
  @SerialName("configured") CONFIGURED,
  @SerialName("unconfigured") UNCONFIGURED
}

@Serializable
enum class APIHealthDatabase {
  @SerialName("configured") CONFIGURED,
  @SerialName("unconfigured") UNCONFIGURED
}

@Serializable
data class APIMessage(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIMessageAuthorKind,
  val `text`: String,
  val `deliveryState`: APIMessageDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIMessageSystemLink? = null
)

@Serializable
enum class APIMessageAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIMessageDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIMessageSystemLink(
  val `kind`: APIMessageSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIMessageSystemLinkLabel
)

@Serializable
enum class APIMessageSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIMessageSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIAcceptedMessage(
  val `message`: APIAcceptedMessageMessage,
  @Required
  val `generationId`: String? = null
)

@Serializable
data class APIAcceptedMessageMessage(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIAcceptedMessageMessageAuthorKind,
  val `text`: String,
  val `deliveryState`: APIAcceptedMessageMessageDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIAcceptedMessageMessageSystemLink? = null
)

@Serializable
enum class APIAcceptedMessageMessageAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIAcceptedMessageMessageDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIAcceptedMessageMessageSystemLink(
  val `kind`: APIAcceptedMessageMessageSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIAcceptedMessageMessageSystemLinkLabel
)

@Serializable
enum class APIAcceptedMessageMessageSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIAcceptedMessageMessageSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIFrame(
  val `threadId`: String,
  val `cursor`: Long,
  val `epoch`: Long,
  val `kind`: APIFrameKind,
  val `messageId`: String,
  val `authorKind`: APIFrameAuthorKind,
  val `text`: String,
  @Required
  val `generationId`: String? = null,
  val `sequence`: Long,
  val `control`: APIFrameControl? = null,
  val `systemLink`: APIFrameSystemLink? = null
)

@Serializable
enum class APIFrameKind {
  @SerialName("accepted") ACCEPTED,
  @SerialName("sentence") SENTENCE,
  @SerialName("control") CONTROL,
  @SerialName("delivered") DELIVERED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
enum class APIFrameAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIFrameControl {
  @SerialName("ai_active") AI_ACTIVE,
  @SerialName("human_active") HUMAN_ACTIVE,
  @SerialName("ai_paused") AI_PAUSED,
  @SerialName("closed") CLOSED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APIFrameSystemLink(
  val `kind`: APIFrameSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIFrameSystemLinkLabel
)

@Serializable
enum class APIFrameSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIFrameSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APISubscribe(
  val `kind`: APISubscribeKind,
  val `creatorId`: String,
  val `fanId`: String,
  val `cursor`: Long
)

@Serializable
enum class APISubscribeKind {
  @SerialName("subscribe") SUBSCRIBE
}

@Serializable
data class APIThreadTimeline(
  val `threadId`: String,
  val `creatorId`: String,
  val `fanId`: String,
  val `control`: APIThreadTimelineControl,
  val `epoch`: Long,
  val `cursor`: Long,
  val `generationSequences`: Map<String, Long>,
  val `messages`: List<APIThreadTimelineMessagesItem>
)

@Serializable
enum class APIThreadTimelineControl {
  @SerialName("ai_active") AI_ACTIVE,
  @SerialName("human_active") HUMAN_ACTIVE,
  @SerialName("ai_paused") AI_PAUSED,
  @SerialName("closed") CLOSED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APIThreadTimelineMessagesItem(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIThreadTimelineMessagesItemAuthorKind,
  val `text`: String,
  val `deliveryState`: APIThreadTimelineMessagesItemDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIThreadTimelineMessagesItemSystemLink? = null
)

@Serializable
enum class APIThreadTimelineMessagesItemAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIThreadTimelineMessagesItemDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIThreadTimelineMessagesItemSystemLink(
  val `kind`: APIThreadTimelineMessagesItemSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIThreadTimelineMessagesItemSystemLinkLabel
)

@Serializable
enum class APIThreadTimelineMessagesItemSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIThreadTimelineMessagesItemSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIConversationAgentReplyVersion(
  val `id`: String,
  val `hash`: String
)

@Serializable
data class APIConversationAuditEntry(
  val `id`: String,
  val `readerAccountId`: String,
  val `role`: APIConversationAuditEntryRole,
  val `readAt`: String
)

@Serializable
enum class APIConversationAuditEntryRole {
  @SerialName("creator") CREATOR,
  @SerialName("triage") TRIAGE,
  @SerialName("ops") OPS
}

@Serializable
data class APIConversationBeginConversation(
  val `creatorId`: String,
  val `policyVersion`: String,
  val `accessNoticeAccepted`: APIConversationBeginConversationAccessNoticeAccepted,
  val `idempotencyKey`: String
)

@Serializable(with = APIConversationBeginConversationAccessNoticeAcceptedSerializer::class)
object APIConversationBeginConversationAccessNoticeAccepted { const val value: Boolean = true }
object APIConversationBeginConversationAccessNoticeAcceptedSerializer : KSerializer<APIConversationBeginConversationAccessNoticeAccepted> {
  override val descriptor = PrimitiveSerialDescriptor("APIConversationBeginConversationAccessNoticeAccepted", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIConversationBeginConversationAccessNoticeAccepted {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIConversationBeginConversationAccessNoticeAccepted
  }
  override fun serialize(encoder: Encoder, value: APIConversationBeginConversationAccessNoticeAccepted) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIConversationConsentInput(
  val `version`: String,
  val `accepted`: Boolean
)

@Serializable
data class APIConversationConversationAccountPage(
  val `fan`: APIConversationConversationAccountPageFan,
  val `threads`: List<APIConversationConversationAccountPageThreadsItem>,
  @Required
  val `nextCursor`: String? = null
)

@Serializable
data class APIConversationConversationAccountPageFan(
  val `id`: String,
  val `handle`: String,
  @Required
  val `intro`: String? = null
)

@Serializable
data class APIConversationConversationAccountPageThreadsItem(
  val `id`: String,
  val `creatorId`: String,
  val `fanId`: String,
  val `name`: String
)

@Serializable
enum class APIConversationConversationAuthorship {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
data class APIConversationConversationCallControl(
  val `idempotencyKey`: String,
  val `expectedEpoch`: Long
)

@Serializable
data class APIConversationConversationCorrectionCommand(
  val `actType`: APIConversationConversationCorrectionCommandActType,
  val `subjectId`: String,
  val `content`: APIConversationConversationCorrectionCommandContent
)

@Serializable
enum class APIConversationConversationCorrectionCommandActType {
  @SerialName("correction") CORRECTION
}

@Serializable
data class APIConversationConversationCorrectionCommandContent(
  val `kind`: APIConversationConversationCorrectionCommandContentKind,
  val `creatorId`: String,
  val `threadId`: String,
  val `fanId`: String,
  val `messageVersion`: Long,
  val `text`: String
)

@Serializable
enum class APIConversationConversationCorrectionCommandContentKind {
  @SerialName("conversation_correction") CONVERSATION_CORRECTION
}

@Serializable
data class APIConversationConversationCorrectionInput(
  val `command`: APIConversationConversationCorrectionInputCommand,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APIConversationConversationCorrectionInputCommand(
  val `actType`: APIConversationConversationCorrectionInputCommandActType,
  val `subjectId`: String,
  val `content`: APIConversationConversationCorrectionInputCommandContent
)

@Serializable
enum class APIConversationConversationCorrectionInputCommandActType {
  @SerialName("correction") CORRECTION
}

@Serializable
data class APIConversationConversationCorrectionInputCommandContent(
  val `kind`: APIConversationConversationCorrectionInputCommandContentKind,
  val `creatorId`: String,
  val `threadId`: String,
  val `fanId`: String,
  val `messageVersion`: Long,
  val `text`: String
)

@Serializable
enum class APIConversationConversationCorrectionInputCommandContentKind {
  @SerialName("conversation_correction") CONVERSATION_CORRECTION
}

@Serializable
data class APIConversationConversationMessage(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIConversationConversationMessageAuthorKind,
  val `text`: String,
  val `deliveryState`: APIConversationConversationMessageDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIConversationConversationMessageSystemLink? = null,
  val `citations`: List<String>,
  val `createdAt`: String,
  val `offTheRecord`: Boolean,
  val `version`: Long,
  val `agentVersion`: APIConversationConversationMessageAgentVersion? = null,
  val `feedback`: APIConversationConversationMessageFeedback? = null,
  val `recording`: JsonElement? = null,
  val `correction`: APIConversationConversationMessageCorrection? = null
)

@Serializable
enum class APIConversationConversationMessageAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIConversationConversationMessageDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIConversationConversationMessageSystemLink(
  val `kind`: APIConversationConversationMessageSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIConversationConversationMessageSystemLinkLabel
)

@Serializable
enum class APIConversationConversationMessageSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIConversationConversationMessageSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIConversationConversationMessageAgentVersion(
  val `id`: String,
  val `hash`: String
)

@Serializable
enum class APIConversationConversationMessageFeedback {
  @SerialName("helpful") HELPFUL,
  @SerialName("not_helpful") NOT_HELPFUL
}

@Serializable
data class APIConversationConversationMessageCorrection(
  val `originalMessageId`: String,
  val `originalVersion`: Long
)

@Serializable
data class APIConversationConversationPage(
  val `threadId`: String,
  val `creatorId`: String,
  val `fanId`: String,
  val `creatorName`: String,
  val `fanHandle`: String,
  val `control`: APIConversationConversationPageControl,
  val `epoch`: Long,
  val `cursor`: Long,
  val `revision`: Long,
  val `generationSequences`: Map<String, Long>,
  val `messages`: List<APIConversationConversationPageMessagesItem>,
  @Required
  val `before`: Long? = null,
  val `offTheRecord`: Boolean,
  val `introShared`: Boolean,
  val `consentCurrent`: Boolean,
  val `canSend`: Boolean,
  @Required
  val `unavailableReason`: String? = null,
  val `feedbackPolicy`: APIConversationConversationPageFeedbackPolicy? = null
)

@Serializable
enum class APIConversationConversationPageControl {
  @SerialName("ai_active") AI_ACTIVE,
  @SerialName("human_active") HUMAN_ACTIVE,
  @SerialName("ai_paused") AI_PAUSED,
  @SerialName("closed") CLOSED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APIConversationConversationPageMessagesItem(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIConversationConversationPageMessagesItemAuthorKind,
  val `text`: String,
  val `deliveryState`: APIConversationConversationPageMessagesItemDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIConversationConversationPageMessagesItemSystemLink? = null,
  val `citations`: List<String>,
  val `createdAt`: String,
  val `offTheRecord`: Boolean,
  val `version`: Long,
  val `agentVersion`: APIConversationConversationPageMessagesItemAgentVersion? = null,
  val `feedback`: APIConversationConversationPageMessagesItemFeedback? = null,
  val `recording`: JsonElement? = null,
  val `correction`: APIConversationConversationPageMessagesItemCorrection? = null
)

@Serializable
enum class APIConversationConversationPageMessagesItemAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIConversationConversationPageMessagesItemDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIConversationConversationPageMessagesItemSystemLink(
  val `kind`: APIConversationConversationPageMessagesItemSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIConversationConversationPageMessagesItemSystemLinkLabel
)

@Serializable
enum class APIConversationConversationPageMessagesItemSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIConversationConversationPageMessagesItemSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIConversationConversationPageMessagesItemAgentVersion(
  val `id`: String,
  val `hash`: String
)

@Serializable
enum class APIConversationConversationPageMessagesItemFeedback {
  @SerialName("helpful") HELPFUL,
  @SerialName("not_helpful") NOT_HELPFUL
}

@Serializable
data class APIConversationConversationPageMessagesItemCorrection(
  val `originalMessageId`: String,
  val `originalVersion`: Long
)

@Serializable
data class APIConversationConversationPageFeedbackPolicy(
  val `version`: String,
  val `notice`: String
)

@Serializable
data class APIConversationConversationRecordingCommand(
  val `actType`: APIConversationConversationRecordingCommandActType,
  val `subjectId`: String,
  val `content`: APIConversationConversationRecordingCommandContent
)

@Serializable
enum class APIConversationConversationRecordingCommandActType {
  @SerialName("reply") REPLY
}

@Serializable
data class APIConversationConversationRecordingCommandContent(
  val `mediaAssetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `mimeType`: APIConversationConversationRecordingCommandContentMimeType,
  val `durationMs`: Long,
  val `bytes`: Long
)

@Serializable
enum class APIConversationConversationRecordingCommandContentMimeType {
  @SerialName("audio/mp4") AUDIO_MP4
}

@Serializable
data class APIConversationConversationRecordingInput(
  val `evidence`: APIConversationConversationRecordingInputEvidence,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APIConversationConversationRecordingInputEvidence(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `mimeType`: APIConversationConversationRecordingInputEvidenceMimeType,
  val `durationMs`: Long,
  val `bytes`: Long
)

@Serializable
enum class APIConversationConversationRecordingInputEvidenceMimeType {
  @SerialName("audio/mp4") AUDIO_MP4
}

@Serializable
data class APIConversationConversationRecordingResult(
  val `messageId`: String,
  val `threadId`: String,
  val `signedActId`: String
)

typealias APIConversationConversationRecordingView = JsonElement

@Serializable
data class APIConversationConversationTimeline(
  val `threadId`: String,
  val `creatorId`: String,
  val `fanId`: String,
  val `control`: APIConversationConversationTimelineControl,
  val `epoch`: Long,
  val `cursor`: Long,
  val `generationSequences`: Map<String, Long>,
  val `messages`: List<APIConversationConversationTimelineMessagesItem>
)

@Serializable
enum class APIConversationConversationTimelineControl {
  @SerialName("ai_active") AI_ACTIVE,
  @SerialName("human_active") HUMAN_ACTIVE,
  @SerialName("ai_paused") AI_PAUSED,
  @SerialName("closed") CLOSED,
  @SerialName("blocked") BLOCKED
}

@Serializable
data class APIConversationConversationTimelineMessagesItem(
  val `id`: String,
  val `threadId`: String,
  val `authorKind`: APIConversationConversationTimelineMessagesItemAuthorKind,
  val `text`: String,
  val `deliveryState`: APIConversationConversationTimelineMessagesItemDeliveryState,
  val `controlEpoch`: Long,
  val `sequence`: Long,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `member`: String? = null,
  val `authorAccountId`: String? = null,
  val `systemLink`: APIConversationConversationTimelineMessagesItemSystemLink? = null,
  val `citations`: List<String>,
  val `createdAt`: String,
  val `offTheRecord`: Boolean,
  val `version`: Long,
  val `agentVersion`: APIConversationConversationTimelineMessagesItemAgentVersion? = null,
  val `feedback`: APIConversationConversationTimelineMessagesItemFeedback? = null,
  val `recording`: JsonElement? = null,
  val `correction`: APIConversationConversationTimelineMessagesItemCorrection? = null
)

@Serializable
enum class APIConversationConversationTimelineMessagesItemAuthorKind {
  @SerialName("fan") FAN,
  @SerialName("ai") AI,
  @SerialName("approved_draft") APPROVED_DRAFT,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("human_call") HUMAN_CALL,
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_reaction") HUMAN_REACTION,
  @SerialName("team") TEAM,
  @SerialName("system") SYSTEM
}

@Serializable
enum class APIConversationConversationTimelineMessagesItemDeliveryState {
  @SerialName("accepted") ACCEPTED,
  @SerialName("generating") GENERATING,
  @SerialName("delivered") DELIVERED,
  @SerialName("failed") FAILED,
  @SerialName("interrupted") INTERRUPTED
}

@Serializable
data class APIConversationConversationTimelineMessagesItemSystemLink(
  val `kind`: APIConversationConversationTimelineMessagesItemSystemLinkKind,
  val `creatorId`: String,
  val `contentId`: String,
  val `contentVersion`: Long,
  val `label`: APIConversationConversationTimelineMessagesItemSystemLinkLabel
)

@Serializable
enum class APIConversationConversationTimelineMessagesItemSystemLinkKind {
  @SerialName("published_answer") PUBLISHED_ANSWER
}

@Serializable
enum class APIConversationConversationTimelineMessagesItemSystemLinkLabel {
  @SerialName("Answered publicly.") ANSWERED_PUBLICLY_
}

@Serializable
data class APIConversationConversationTimelineMessagesItemAgentVersion(
  val `id`: String,
  val `hash`: String
)

@Serializable
enum class APIConversationConversationTimelineMessagesItemFeedback {
  @SerialName("helpful") HELPFUL,
  @SerialName("not_helpful") NOT_HELPFUL
}

@Serializable
data class APIConversationConversationTimelineMessagesItemCorrection(
  val `originalMessageId`: String,
  val `originalVersion`: Long
)

@Serializable
data class APIConversationConversationUsage(
  val `timezone`: APIConversationConversationUsageTimezone,
  val `days`: List<APIConversationConversationUsageDaysItem>,
  val `modeAvailable`: Boolean,
  val `measurement`: String
)

@Serializable
enum class APIConversationConversationUsageTimezone {
  @SerialName("UTC") UTC
}

@Serializable
data class APIConversationConversationUsageDaysItem(
  val `day`: String,
  val `seconds`: Double,
  val `companionSeconds`: Double
)

@Serializable
data class APIConversationMemoryDecision(
  val `expectedRevision`: Long,
  val `action`: APIConversationMemoryDecisionAction,
  val `text`: String? = null
)

@Serializable
enum class APIConversationMemoryDecisionAction {
  @SerialName("accept") ACCEPT,
  @SerialName("delete") DELETE,
  @SerialName("edit") EDIT,
  @SerialName("resolve") RESOLVE
}

@Serializable
data class APIConversationMemoryItem(
  val `id`: String,
  val `kind`: APIConversationMemoryItemKind,
  val `text`: String,
  val `provenanceMessageId`: String,
  @Required
  val `sensitiveCategory`: String? = null,
  val `state`: APIConversationMemoryItemState,
  val `editedByFan`: Boolean,
  val `createdAt`: String
)

@Serializable
enum class APIConversationMemoryItemKind {
  @SerialName("fact") FACT,
  @SerialName("summary") SUMMARY,
  @SerialName("open_loop") OPEN_LOOP
}

@Serializable
enum class APIConversationMemoryItemState {
  @SerialName("proposed") PROPOSED,
  @SerialName("remembered") REMEMBERED,
  @SerialName("resolved") RESOLVED
}

@Serializable
data class APIConversationMemoryProposal(
  val `kind`: APIConversationMemoryProposalKind,
  val `text`: String,
  val `semanticKey`: String,
  val `provenanceMessageId`: String,
  val `expectedRevision`: Long,
  val `sensitiveCategory`: String? = null
)

@Serializable
enum class APIConversationMemoryProposalKind {
  @SerialName("fact") FACT,
  @SerialName("summary") SUMMARY,
  @SerialName("open_loop") OPEN_LOOP
}

@Serializable
data class APIConversationProviderPolicy(
  val `version`: String,
  val `providers`: List<APIConversationProviderPolicyProvidersItem>,
  val `verified`: Boolean
)

@Serializable
data class APIConversationProviderPolicyProvidersItem(
  val `name`: String,
  val `termsUrl`: String,
  val `noTraining`: Boolean,
  val `noRetention`: Boolean
)

@Serializable
data class APIConversationReplyFeedbackInput(
  val `messageVersion`: Long,
  val `agentVersion`: APIConversationReplyFeedbackInputAgentVersion,
  @Required
  val `rating`: APIConversationReplyFeedbackInputRating? = null,
  val `consent`: APIConversationReplyFeedbackInputConsent? = null,
  val `policyVersion`: String? = null
)

@Serializable
data class APIConversationReplyFeedbackInputAgentVersion(
  val `id`: String,
  val `hash`: String
)

@Serializable
enum class APIConversationReplyFeedbackInputRating {
  @SerialName("helpful") HELPFUL,
  @SerialName("not_helpful") NOT_HELPFUL
}

@Serializable(with = APIConversationReplyFeedbackInputConsentSerializer::class)
object APIConversationReplyFeedbackInputConsent { const val value: Boolean = true }
object APIConversationReplyFeedbackInputConsentSerializer : KSerializer<APIConversationReplyFeedbackInputConsent> {
  override val descriptor = PrimitiveSerialDescriptor("APIConversationReplyFeedbackInputConsent", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIConversationReplyFeedbackInputConsent {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIConversationReplyFeedbackInputConsent
  }
  override fun serialize(encoder: Encoder, value: APIConversationReplyFeedbackInputConsent) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIConversationReplyFeedbackPolicy(
  val `version`: String,
  val `notice`: String
)

@Serializable
enum class APIConversationReplyFeedbackRating {
  @SerialName("helpful") HELPFUL,
  @SerialName("not_helpful") NOT_HELPFUL
}

@Serializable
data class APIConversationTeamReply(
  val `text`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APIConversationThreadPreferences(
  val `offTheRecord`: Boolean,
  val `introShared`: Boolean,
  val `expectedRevision`: Long
)

@Serializable
data class APIConversationTranslation(
  val `messageId`: String,
  val `originalVersion`: Long,
  val `language`: String,
  val `text`: String,
  val `provider`: String,
  val `label`: APIConversationTranslationLabel
)

@Serializable
enum class APIConversationTranslationLabel {
  @SerialName("Translated · original available") TRANSLATED___ORIGINAL_AVAILABLE
}

typealias APIContentContentAudience = JsonElement

@Serializable
data class APIContentContentConsentResult(
  val `version`: Long,
  val `share_text`: Boolean,
  val `show_handle`: Boolean
)

@Serializable
data class APIContentContentDocument(
  val `kind`: APIContentContentDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentContentDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentContentDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentContentDocumentPlanRef? = null,
  val `live`: APIContentContentDocumentLive? = null
)

@Serializable
enum class APIContentContentDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentContentDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentContentDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentContentDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentContentDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentContentDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
data class APIContentContentEffectsResult(
  val `processed`: Long
)

typealias APIContentContentKey = String

@Serializable
data class APIContentContentList(
  val `items`: List<APIContentContentListItemsItem>,
  @Required
  val `nextCursor`: String? = null,
  val `serverTime`: String
)

@Serializable
data class APIContentContentListItemsItem(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  @Required
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentContentListItemsItemAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `publishedAt`: String? = null,
  val `document`: APIContentContentListItemsItemDocument,
  @Required
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentContentListItemsItemSourceState,
  @Required
  val `quotedText`: String? = null,
  @Required
  val `quotedHandle`: String? = null
)

@Serializable
enum class APIContentContentListItemsItemAuthorKind {
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("team") TEAM
}

@Serializable
data class APIContentContentListItemsItemDocument(
  val `kind`: APIContentContentListItemsItemDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentContentListItemsItemDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentContentListItemsItemDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentContentListItemsItemDocumentPlanRef? = null,
  val `live`: APIContentContentListItemsItemDocumentLive? = null
)

@Serializable
enum class APIContentContentListItemsItemDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentContentListItemsItemDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentContentListItemsItemDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentContentListItemsItemDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentContentListItemsItemDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentContentListItemsItemDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentContentListItemsItemDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
enum class APIContentContentListItemsItemSourceState {
  @SerialName("not_requested") NOT_REQUESTED,
  @SerialName("candidate_pending") CANDIDATE_PENDING,
  @SerialName("candidate") CANDIDATE,
  @SerialName("revocation_pending") REVOCATION_PENDING,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIContentContentLiveCatalog(
  val `available`: Boolean,
  val `items`: List<APIContentContentLiveCatalogItemsItem>
)

@Serializable
data class APIContentContentLiveCatalogItemsItem(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null,
  val `replayReady`: Boolean
)

@Serializable
data class APIContentContentMedia(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentContentMediaKind,
  val `alt`: String
)

@Serializable
enum class APIContentContentMediaKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentContentMuteCommand(
  val `muted`: Boolean
)

@Serializable
data class APIContentContentPage(
  val `cursor`: String? = null,
  val `limit`: Long,
  val `state`: APIContentContentPageState? = null,
  val `query`: String? = null
)

@Serializable
enum class APIContentContentPageState {
  @SerialName("draft") DRAFT,
  @SerialName("media_pending") MEDIA_PENDING,
  @SerialName("scheduled") SCHEDULED,
  @SerialName("published") PUBLISHED,
  @SerialName("unpublished") UNPUBLISHED,
  @SerialName("archived") ARCHIVED
}

@Serializable
data class APIContentContentPreference(
  val `accountId`: String,
  val `muted`: Boolean
)

@Serializable
data class APIContentContentReactionResult(
  val `replyId`: String,
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentContentReplyList(
  val `items`: List<APIContentContentReplyListItemsItem>,
  @Required
  val `nextCursor`: String? = null
)

@Serializable
data class APIContentContentReplyListItemsItem(
  val `safetyState`: APIContentContentReplyListItemsItemSafetyState,
  val `safetyReviewAvailable`: Boolean,
  val `read`: Boolean,
  val `id`: String,
  val `contentId`: String,
  val `fanId`: String,
  val `handle`: String,
  val `text`: String,
  val `version`: Long,
  val `createdAt`: String,
  val `tenure`: APIContentContentReplyListItemsItemTenure? = null,
  val `consent`: APIContentContentReplyListItemsItemConsent,
  @Required
  val `reaction`: APIContentContentReplyListItemsItemReaction? = null
)

@Serializable
enum class APIContentContentReplyListItemsItemSafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentContentReplyListItemsItemTenure(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIContentContentReplyListItemsItemTenureBasis,
  val `historyComplete`: APIContentContentReplyListItemsItemTenureHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIContentContentReplyListItemsItemTenureBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentContentReplyListItemsItemTenureHistoryCompleteSerializer::class)
object APIContentContentReplyListItemsItemTenureHistoryComplete { const val value: Boolean = false }
object APIContentContentReplyListItemsItemTenureHistoryCompleteSerializer : KSerializer<APIContentContentReplyListItemsItemTenureHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentContentReplyListItemsItemTenureHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentContentReplyListItemsItemTenureHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentContentReplyListItemsItemTenureHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentContentReplyListItemsItemTenureHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIContentContentReplyListItemsItemConsent(
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `version`: Long
)

@Serializable
data class APIContentContentReplyListItemsItemReaction(
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentContentReplyPage(
  val `cursor`: String? = null,
  val `limit`: Long,
  val `contentId`: String? = null,
  val `filter`: APIContentContentReplyPageFilter
)

@Serializable
enum class APIContentContentReplyPageFilter {
  @SerialName("all") ALL,
  @SerialName("unread") UNREAD,
  @SerialName("reacted") REACTED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentContentReplyReadResult(
  val `id`: String,
  val `version`: Long,
  val `read`: APIContentContentReplyReadResultRead
)

@Serializable(with = APIContentContentReplyReadResultReadSerializer::class)
object APIContentContentReplyReadResultRead { const val value: Boolean = true }
object APIContentContentReplyReadResultReadSerializer : KSerializer<APIContentContentReplyReadResultRead> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentContentReplyReadResultRead", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentContentReplyReadResultRead {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIContentContentReplyReadResultRead
  }
  override fun serialize(encoder: Encoder, value: APIContentContentReplyReadResultRead) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIContentContentReplyReviewResult(
  val `id`: String,
  val `version`: Long,
  val `safetyState`: APIContentContentReplyReviewResultSafetyState
)

@Serializable
enum class APIContentContentReplyReviewResultSafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentContentResult(
  val `id`: String,
  val `version`: Long,
  val `state`: String,
  val `signedActId`: String? = null
)

@Serializable
data class APIContentContentRevisionResult(
  val `id`: String,
  val `version`: Long
)

@Serializable
data class APIContentContentScheduledResult(
  val `published`: Long
)

@Serializable
data class APIContentContentTenureRecognition(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIContentContentTenureRecognitionBasis,
  val `historyComplete`: APIContentContentTenureRecognitionHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIContentContentTenureRecognitionBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentContentTenureRecognitionHistoryCompleteSerializer::class)
object APIContentContentTenureRecognitionHistoryComplete { const val value: Boolean = false }
object APIContentContentTenureRecognitionHistoryCompleteSerializer : KSerializer<APIContentContentTenureRecognitionHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentContentTenureRecognitionHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentContentTenureRecognitionHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentContentTenureRecognitionHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentContentTenureRecognitionHistoryComplete) { encoder.encodeBoolean(false) }
}

typealias APIContentContentThanksFeed = List<APIContentContentThanksFeedValueItem>

@Serializable
data class APIContentContentThanksFeedValueItem(
  val `id`: String,
  val `version`: Long,
  val `target_kind`: APIContentContentThanksFeedValueItemTargetKind,
  val `target_id`: String,
  val `text`: String,
  @Required
  val `handle`: String? = null,
  val `created_at`: String
)

@Serializable
enum class APIContentContentThanksFeedValueItemTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

@Serializable
data class APIContentContentThanksQuery(
  val `targetKind`: APIContentContentThanksQueryTargetKind,
  val `targetId`: String
)

@Serializable
enum class APIContentContentThanksQueryTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

typealias APIContentContentThanksView = APIContentContentThanksViewValue?

@Serializable
data class APIContentContentThanksViewValue(
  val `id`: String,
  val `version`: Long,
  val `text`: String,
  val `shareWithCreatorDigest`: Boolean,
  val `showIdentity`: Boolean,
  val `withdrawn`: Boolean
)

@Serializable
data class APIContentContentVersionCommand(
  val `version`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIContentContentView(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  @Required
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentContentViewAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  @Required
  val `signedActId`: String? = null,
  @Required
  val `publishedAt`: String? = null,
  val `document`: APIContentContentViewDocument,
  @Required
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentContentViewSourceState,
  @Required
  val `quotedText`: String? = null,
  @Required
  val `quotedHandle`: String? = null
)

@Serializable
enum class APIContentContentViewAuthorKind {
  @SerialName("human_broadcast") HUMAN_BROADCAST,
  @SerialName("human_creator") HUMAN_CREATOR,
  @SerialName("team") TEAM
}

@Serializable
data class APIContentContentViewDocument(
  val `kind`: APIContentContentViewDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentContentViewDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentContentViewDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentContentViewDocumentPlanRef? = null,
  val `live`: APIContentContentViewDocumentLive? = null
)

@Serializable
enum class APIContentContentViewDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentContentViewDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentContentViewDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentContentViewDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentContentViewDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentContentViewDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentContentViewDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
enum class APIContentContentViewSourceState {
  @SerialName("not_requested") NOT_REQUESTED,
  @SerialName("candidate_pending") CANDIDATE_PENDING,
  @SerialName("candidate") CANDIDATE,
  @SerialName("revocation_pending") REVOCATION_PENDING,
  @SerialName("revoked") REVOKED
}

@Serializable
data class APIContentContentWithdrawResult(
  val `id`: String,
  val `withdrawn`: APIContentContentWithdrawResultWithdrawn
)

@Serializable(with = APIContentContentWithdrawResultWithdrawnSerializer::class)
object APIContentContentWithdrawResultWithdrawn { const val value: Boolean = true }
object APIContentContentWithdrawResultWithdrawnSerializer : KSerializer<APIContentContentWithdrawResultWithdrawn> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentContentWithdrawResultWithdrawn", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentContentWithdrawResultWithdrawn {
    if (decoder.decodeBoolean() != true) throw SerializationException("Expected true")
    return APIContentContentWithdrawResultWithdrawn
  }
  override fun serialize(encoder: Encoder, value: APIContentContentWithdrawResultWithdrawn) { encoder.encodeBoolean(true) }
}

@Serializable
data class APIContentNoteReplyPolicy(
  val `accountId`: String,
  val `creatorId`: String,
  val `limit`: JsonElement,
  @Required
  val `confirmedDays`: Long? = null,
  @Required
  val `milestone`: JsonElement? = null,
  @Required
  val `basis`: APIContentNoteReplyPolicyBasis? = null,
  val `historyComplete`: APIContentNoteReplyPolicyHistoryComplete,
  val `longerRepliesActive`: Boolean,
  val `checkedAt`: String
)

@Serializable
enum class APIContentNoteReplyPolicyBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentNoteReplyPolicyHistoryCompleteSerializer::class)
object APIContentNoteReplyPolicyHistoryComplete { const val value: Boolean = false }
object APIContentNoteReplyPolicyHistoryCompleteSerializer : KSerializer<APIContentNoteReplyPolicyHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentNoteReplyPolicyHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentNoteReplyPolicyHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentNoteReplyPolicyHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentNoteReplyPolicyHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIContentPrivateNoteReply(
  val `safetyState`: APIContentPrivateNoteReplySafetyState,
  val `safetyReviewAvailable`: Boolean,
  val `read`: Boolean,
  val `id`: String,
  val `contentId`: String,
  val `fanId`: String,
  val `handle`: String,
  val `text`: String,
  val `version`: Long,
  val `createdAt`: String,
  val `tenure`: APIContentPrivateNoteReplyTenure? = null,
  val `consent`: APIContentPrivateNoteReplyConsent,
  @Required
  val `reaction`: APIContentPrivateNoteReplyReaction? = null
)

@Serializable
enum class APIContentPrivateNoteReplySafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
}

@Serializable
data class APIContentPrivateNoteReplyTenure(
  val `confirmedDays`: Long,
  @Required
  val `milestone`: JsonElement? = null,
  val `basis`: APIContentPrivateNoteReplyTenureBasis,
  val `historyComplete`: APIContentPrivateNoteReplyTenureHistoryComplete,
  val `checkedAt`: String
)

@Serializable
enum class APIContentPrivateNoteReplyTenureBasis {
  @SerialName("confirmed_stripe_paid_periods") CONFIRMED_STRIPE_PAID_PERIODS,
  @SerialName("confirmed_paid_periods") CONFIRMED_PAID_PERIODS
}

@Serializable(with = APIContentPrivateNoteReplyTenureHistoryCompleteSerializer::class)
object APIContentPrivateNoteReplyTenureHistoryComplete { const val value: Boolean = false }
object APIContentPrivateNoteReplyTenureHistoryCompleteSerializer : KSerializer<APIContentPrivateNoteReplyTenureHistoryComplete> {
  override val descriptor = PrimitiveSerialDescriptor("APIContentPrivateNoteReplyTenureHistoryComplete", PrimitiveKind.BOOLEAN)
  override fun deserialize(decoder: Decoder): APIContentPrivateNoteReplyTenureHistoryComplete {
    if (decoder.decodeBoolean() != false) throw SerializationException("Expected false")
    return APIContentPrivateNoteReplyTenureHistoryComplete
  }
  override fun serialize(encoder: Encoder, value: APIContentPrivateNoteReplyTenureHistoryComplete) { encoder.encodeBoolean(false) }
}

@Serializable
data class APIContentPrivateNoteReplyConsent(
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `version`: Long
)

@Serializable
data class APIContentPrivateNoteReplyReaction(
  val `kind`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentPublishContent(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `signedActId`: String
)

@Serializable
data class APIContentQuoteConsent(
  val `version`: Long,
  val `shareText`: Boolean,
  val `showHandle`: Boolean,
  val `idempotencyKey`: String
)

@Serializable
data class APIContentReactToReply(
  val `version`: Long,
  val `kind`: APIContentReactToReplyKind,
  val `signedActId`: String,
  val `idempotencyKey`: String
)

@Serializable
enum class APIContentReactToReplyKind {
  @SerialName("heart") HEART,
  @SerialName("thanks") THANKS,
  @SerialName("helpful") HELPFUL
}

@Serializable
data class APIContentReplyToNote(
  val `text`: String,
  val `idempotencyKey`: String
)

@Serializable
data class APIContentSaveContent(
  val `id`: String,
  val `expectedVersion`: Long,
  val `document`: APIContentSaveContentDocument,
  val `idempotencyKey`: String
)

@Serializable
data class APIContentSaveContentDocument(
  val `kind`: APIContentSaveContentDocumentKind,
  val `title`: String,
  val `text`: String,
  val `audience`: JsonElement,
  val `media`: List<APIContentSaveContentDocumentMediaItem>,
  val `nameToken`: Boolean,
  val `showAudienceCount`: Boolean,
  val `aiUseIntent`: Boolean,
  @Required
  val `scheduledAt`: String? = null,
  @Required
  val `quote`: APIContentSaveContentDocumentQuote? = null,
  @Required
  val `packetId`: String? = null,
  val `planRef`: APIContentSaveContentDocumentPlanRef? = null,
  val `live`: APIContentSaveContentDocumentLive? = null
)

@Serializable
enum class APIContentSaveContentDocumentKind {
  @SerialName("note") NOTE,
  @SerialName("post") POST,
  @SerialName("public_answer") PUBLIC_ANSWER,
  @SerialName("quote_reply") QUOTE_REPLY,
  @SerialName("live") LIVE,
  @SerialName("replay") REPLAY
}

@Serializable
data class APIContentSaveContentDocumentMediaItem(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `kind`: APIContentSaveContentDocumentMediaItemKind,
  val `alt`: String
)

@Serializable
enum class APIContentSaveContentDocumentMediaItemKind {
  @SerialName("photo") PHOTO,
  @SerialName("voice") VOICE,
  @SerialName("video") VIDEO
}

@Serializable
data class APIContentSaveContentDocumentQuote(
  val `replyId`: String,
  val `consentVersion`: Long
)

@Serializable
data class APIContentSaveContentDocumentPlanRef(
  val `id`: String,
  val `revision`: Long,
  val `hash`: String
)

@Serializable
data class APIContentSaveContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
  @Required
  val `replayContentId`: String? = null
)

@Serializable
data class APIContentThanksCommand(
  val `targetKind`: APIContentThanksCommandTargetKind,
  val `targetId`: String,
  val `text`: String,
  val `shareWithCreatorDigest`: Boolean,
  val `showIdentity`: Boolean,
  val `withdrawn`: Boolean,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
enum class APIContentThanksCommandTargetKind {
  @SerialName("content") CONTENT,
  @SerialName("message") MESSAGE
}

@Serializable
data class APIStudioContentVersionCommand(
  val `version`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIStudioStudioAudiences(
  val `audienceCountsAvailable`: Boolean,
  val `tiers`: List<APIStudioStudioAudiencesTiersItem>,
  val `groups`: List<APIStudioStudioAudiencesGroupsItem>
)

@Serializable
data class APIStudioStudioAudiencesTiersItem(
  val `id`: String,
  val `name`: String
)

@Serializable
data class APIStudioStudioAudiencesGroupsItem(
  val `id`: String,
  val `name`: String
)

typealias APIStudioStudioCommerceProjection = JsonElement

@Serializable
data class APIStudioStudioControlCommand(
  val `idempotencyKey`: String
)

@Serializable
data class APIStudioStudioCorrection(
  val `idempotencyKey`: String,
  val `expectedRevision`: Long,
  val `paraphrasedPrompt`: String,
  val `rule`: String,
  val `unacceptableAnswer`: String
)

@Serializable
data class APIStudioStudioDraftVersion(
  val `version`: Long
)

@Serializable
data class APIStudioStudioInvitation(
  val `id`: String,
  val `roles`: List<APIStudioStudioInvitationRolesItem>,
  val `creatorId`: String? = null,
  val `accountId`: String? = null,
  val `expiresAt`: String? = null,
  val `accepted`: Boolean? = null
)

@Serializable
enum class APIStudioStudioInvitationRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioInvite(
  val `handle`: String,
  val `roles`: List<APIStudioStudioInviteRolesItem>
)

@Serializable
enum class APIStudioStudioInviteRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioQueueQuery(
  val `cursor`: String? = null,
  val `filter`: APIStudioStudioQueueQueryFilter,
  val `limit`: Long
)

@Serializable
enum class APIStudioStudioQueueQueryFilter {
  @SerialName("all") ALL,
  @SerialName("due") DUE,
  @SerialName("decide") DECIDE,
  @SerialName("more_info") MORE_INFO
}

@Serializable
data class APIStudioStudioReplyDraft(
  val `text`: String,
  val `version`: Long,
  @Required
  val `sentMessageId`: String? = null
)

@Serializable
data class APIStudioStudioRevision(
  val `revision`: Long
)

@Serializable
data class APIStudioStudioSaveReplyDraft(
  val `text`: String,
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

@Serializable
data class APIStudioStudioSendReplyDraft(
  val `version`: Long,
  val `idempotencyKey`: String,
  val `signedActId`: String
)

@Serializable
data class APIStudioStudioSession(
  val `creators`: List<APIStudioStudioSessionCreatorsItem>,
  val `invitations`: List<APIStudioStudioSessionInvitationsItem>,
  val `serverTime`: String
)

@Serializable
data class APIStudioStudioSessionCreatorsItem(
  val `id`: String,
  val `display_name`: String,
  val `handle`: String,
  val `verification`: String,
  val `owned`: Boolean,
  val `roles`: List<APIStudioStudioSessionCreatorsItemRolesItem>,
  @Required
  val `memberHandle`: String? = null,
  val `viewerAccountId`: String
)

@Serializable
enum class APIStudioStudioSessionCreatorsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioSessionInvitationsItem(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `roles`: List<APIStudioStudioSessionInvitationsItemRolesItem>,
  val `expiresAt`: String
)

@Serializable
enum class APIStudioStudioSessionInvitationsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioTeam(
  val `members`: List<APIStudioStudioTeamMembersItem>,
  val `invitations`: List<APIStudioStudioTeamInvitationsItem>
)

@Serializable
data class APIStudioStudioTeamMembersItem(
  val `account_id`: String,
  val `roles`: List<APIStudioStudioTeamMembersItemRolesItem>,
  @Required
  val `revoked_at`: String? = null,
  @Required
  val `handle`: String? = null
)

@Serializable
enum class APIStudioStudioTeamMembersItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioTeamInvitationsItem(
  val `id`: String,
  val `account_id`: String,
  @Required
  val `handle`: String? = null,
  val `roles`: List<APIStudioStudioTeamInvitationsItemRolesItem>,
  val `expires_at`: String,
  @Required
  val `accepted_at`: String? = null,
  @Required
  val `revoked_at`: String? = null
)

@Serializable
enum class APIStudioStudioTeamInvitationsItemRolesItem {
  @SerialName("triage") TRIAGE,
  @SerialName("drafter") DRAFTER,
  @SerialName("publisher") PUBLISHER,
  @SerialName("scheduler") SCHEDULER
}

@Serializable
data class APIStudioStudioThreadEntries(
  val `items`: List<APIStudioStudioThreadEntriesItemsItem>,
  @Required
  val `nextCursor`: String? = null,
  val `coverage`: APIStudioStudioThreadEntriesCoverage
)

@Serializable
data class APIStudioStudioThreadEntriesItemsItem(
  val `fanId`: String,
  val `handle`: String,
  val `sources`: List<APIStudioStudioThreadEntriesItemsItemSourcesItem>,
  val `updatedAt`: String
)

@Serializable
enum class APIStudioStudioThreadEntriesItemsItemSourcesItem {
  @SerialName("note_reply") NOTE_REPLY,
  @SerialName("request") REQUEST
}

@Serializable
enum class APIStudioStudioThreadEntriesCoverage {
  @SerialName("notes_and_requests") NOTES_AND_REQUESTS
}

@Serializable
enum class ReadCreatorMediaPolicyPurpose {
  @SerialName("source_audio") SOURCE_AUDIO,
  @SerialName("interview_audio") INTERVIEW_AUDIO,
  @SerialName("post_photo") POST_PHOTO,
  @SerialName("post_audio") POST_AUDIO,
  @SerialName("human_note") HUMAN_NOTE
}

class CreatorAPIError(val status: Int, val body: String): Exception("API request refused ($status)")
data class CreatorAPIBinaryResponse(val body: ByteArray, val status: Int, val contentType: String?, val contentRange: String?, val acceptRanges: String?)

// Existing app dependency; share connection/thread pools across captured clients.
private object CreatorAPITransport {
  val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build()
}

class CreatorAPIClient(private val baseURL: String, private val maximumResponseBytes: Int = 268_435_456, private val timeoutMs: Int = 30_000, private val expectedAccountId: String? = null, private val expectedSessionId: String? = null, private val token: suspend () -> String?) {
  private val json = Json { ignoreUnknownKeys = false }
  /** W8 private transport on this original client, with denial-only pins. */
  suspend fun trustBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null, binary: Boolean = false): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/trust/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576)
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId),
      accept = if (binary) "application/octet-stream" else "application/json", contentType = "application/json")
  }
  /** W4 JSON transport on this original client, with denial-only session pins. */
  suspend fun commerceBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/commerce/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576)
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId, "x-commerce-account-id" to expectedAccountId),
      accept = "application/json", contentType = "application/json")
  }
  /** W5 JSON transport on this original client, with denial-only session pins. */
  suspend fun contentBytes(path: String, expectedAccountId: String, expectedSessionId: String, body: ByteArray? = null, query: List<Pair<String, String?>> = emptyList()): CreatorAPIBinaryResponse {
    require(path.matches(Regex("^/v1/content/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$")) && expectedAccountId.isNotEmpty() && expectedSessionId.isNotEmpty() && (body?.size ?: 0) <= 1_048_576 && query.size <= 4 && query.map { it.first }.toSet().size == query.size && query.all { it.first in setOf("contentId", "cursor", "targetKind", "targetId") && (it.second?.toByteArray(Charsets.UTF_8)?.size ?: 0) <= 1024 })
    return requestBytes(path, if (body == null) "GET" else "POST", body, authenticated = true, query = query,
      headers = mapOf("X-Expected-Account-Id" to expectedAccountId, "X-Expected-Session-Id" to expectedSessionId),
      accept = "application/json", contentType = "application/json")
  }
  private suspend fun request(path: String, method: String, body: String? = null, authenticated: Boolean, query: List<Pair<String, String?>> = emptyList(), headers: Map<String, String> = emptyMap()): String =
    requestBytes(path, method, body?.toByteArray(Charsets.UTF_8), authenticated, query, headers, "application/json", "application/json").body.toString(Charsets.UTF_8)
  private suspend fun requestBytes(path: String, method: String, body: ByteArray? = null, authenticated: Boolean, query: List<Pair<String, String?>> = emptyList(), headers: Map<String, String> = emptyMap(), accept: String = "application/octet-stream", contentType: String = "application/octet-stream"): CreatorAPIBinaryResponse {
    require(maximumResponseBytes in 1..268_435_456 && timeoutMs in 1..30_000)
    // One original budget includes token loading, dispatch and the complete body.
    // Cancellation closes this exact Call; a coroutine timer alone cannot stop blocking reads.
    return try { withTimeout(timeoutMs.toLong()) {
      val request = withContext(Dispatchers.IO) {
        kotlinx.coroutines.currentCoroutineContext().ensureActive()
        val encodedQuery = query.filter { it.second != null }.joinToString("&") { segment(it.first) + "=" + segment(it.second!!) }
        val builder = Request.Builder().url(baseURL.trimEnd('/') + path + (if (encodedQuery.isEmpty()) "" else "?" + encodedQuery)).header("Accept", accept)
        headers.forEach { (name, value) -> builder.header(name, value) }
        // Captured original pins are denial preconditions, never identity.
        if (authenticated) {
          expectedAccountId?.let { builder.header("X-Expected-Account-Id", it) }
          expectedSessionId?.let { builder.header("X-Expected-Session-Id", it) }
          token()?.let { builder.header("Authorization", "Bearer $it") }
        }
        val requestBody = body?.toRequestBody(contentType.toMediaType())
          ?: if (method in setOf("POST", "PUT", "PATCH", "PROPPATCH", "REPORT")) byteArrayOf().toRequestBody(null) else null
        kotlinx.coroutines.currentCoroutineContext().ensureActive()
        builder.method(method, requestBody).build()
      }
      val call = CreatorAPITransport.client.newBuilder()
        .connectTimeout(minOf(15000, timeoutMs).toLong(), TimeUnit.MILLISECONDS)
        .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .writeTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .callTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        .build().newCall(request)
      suspendCancellableCoroutine { continuation ->
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
          override fun onFailure(call: Call, error: IOException) { continuation.resumeWith(Result.failure(error)) }
          override fun onResponse(call: Call, response: Response) {
            try {
              val result = response.use {
                val status = response.code
                val maximum = if (status in 200..299) maximumResponseBytes else minOf(maximumResponseBytes, 8192)
                check((response.body?.contentLength() ?: -1) <= maximum.toLong())
                val payload = response.body?.byteStream()?.use { stream ->
                  val output = java.io.ByteArrayOutputStream()
                  val buffer = ByteArray(8192)
                  while (true) {
                    if (!continuation.isActive) throw java.io.InterruptedIOException("API request cancelled")
                    val count = stream.read(buffer); if (count < 0) break
                    check(output.size() + count <= maximum); output.write(buffer, 0, count)
                  }
                  output.toByteArray()
                } ?: byteArrayOf()
                if (!continuation.isActive) throw java.io.InterruptedIOException("API request cancelled")
                if (status !in 200..299) throw CreatorAPIError(status, payload.toString(Charsets.UTF_8))
                CreatorAPIBinaryResponse(payload, status, response.header("Content-Type"), response.header("Content-Range"), response.header("Accept-Ranges"))
              }
              continuation.resumeWith(Result.success(result))
            } catch (error: Exception) { continuation.resumeWith(Result.failure(error)) }
          }
        })
      }
    } } catch (expired: kotlinx.coroutines.TimeoutCancellationException) {
      // A genuine parent cancellation must keep its original cancellation meaning.
      kotlinx.coroutines.currentCoroutineContext().ensureActive()
      throw java.net.SocketTimeoutException("API request timed out").apply { initCause(expired) }
    }
  }
  private fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
  suspend fun creatorEarningsLedger(creatorId: String, currency: String, cursor: String? = null): APICommerceCreatorLedgerPage = json.decodeFromString(request("/v1/commerce/creators/${segment(creatorId)}/earnings", "GET", authenticated = true, query = listOf("currency" to currency, "cursor" to cursor)))
  suspend fun creatorPayoutOnboarding(creatorId: String, xCommerceAccountId: String? = null, body: APICommercePayoutOnboardingCommand): APICommercePayoutOnboardingResult = json.decodeFromString(request("/v1/commerce/creators/${segment(creatorId)}/payout-onboarding", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-commerce-account-id" to xCommerceAccountId).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentList(creatorId: String, cursor: String? = null, limit: Long? = null, state: String? = null, query: String? = null): APIContentList = json.decodeFromString(request("/v1/content/${segment(creatorId)}", "GET", authenticated = true, query = listOf("cursor" to cursor, "limit" to limit?.toString(), "state" to state, "query" to query)))
  suspend fun studioContentList(creatorId: String, cursor: String? = null, limit: Long? = null, state: String? = null, query: String? = null): APIContentList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio", "GET", authenticated = true, query = listOf("cursor" to cursor, "limit" to limit?.toString(), "state" to state, "query" to query)))
  suspend fun studioLiveCatalog(creatorId: String): APIContentLiveCatalog = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/live", "GET", authenticated = true))
  suspend fun saveContent(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APISaveContent): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/drafts", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentReplies(creatorId: String, cursor: String? = null, limit: Long? = null, filter: String? = null, contentId: String? = null): APIContentReplyList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies", "GET", authenticated = true, query = listOf("cursor" to cursor, "limit" to limit?.toString(), "filter" to filter, "contentId" to contentId)))
  suspend fun studioContentReplies(creatorId: String, cursor: String? = null, limit: Long? = null, filter: String? = null, contentId: String? = null): APIContentReplyList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/replies", "GET", authenticated = true, query = listOf("cursor" to cursor, "limit" to limit?.toString(), "filter" to filter, "contentId" to contentId)))
  suspend fun contentReplyConsent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIQuoteConsent): APIContentConsentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/consent", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentReplyReaction(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIReactToReply): APIContentReactionResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/reaction", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun withdrawContentReply(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentWithdrawResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/withdraw", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentPreference(creatorId: String): APIContentPreference = json.decodeFromString(request("/v1/content/${segment(creatorId)}/mute", "GET", authenticated = true))
  suspend fun muteContent(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APIContentMuteCommand): APIContentMuteCommand = json.decodeFromString(request("/v1/content/${segment(creatorId)}/mute", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun noteReplyPolicy(creatorId: String): APINoteReplyPolicy = json.decodeFromString(request("/v1/content/${segment(creatorId)}/reply-policy", "GET", authenticated = true))
  suspend fun myContentThanks(creatorId: String): APIContentThanksView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/thanks", "GET", authenticated = true))
  suspend fun saveContentThanks(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APIThanksCommand): APIContentRevisionResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/thanks", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioThanksFeed(creatorId: String): APIContentThanksFeed = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/thanks", "GET", authenticated = true))
  suspend fun runScheduledContent(creatorId: String, xQelvoraExpectedAccount: String? = null): APIContentScheduledResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/scheduled/run", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun runContentEffects(creatorId: String, xQelvoraExpectedAccount: String? = null): APIContentEffectsResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/effects/run", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentView(creatorId: String, id: String): APIContentView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}", "GET", authenticated = true))
  suspend fun studioContentView(creatorId: String, id: String): APIContentView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/studio", "GET", authenticated = true))
  suspend fun reviewContent(creatorId: String, id: String): APIContentReview = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/review", "GET", authenticated = true))
  suspend fun publishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIPublishContent): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/publish", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun teamPublishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/team-publish", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun unpublishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/unpublish", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun archiveContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/archive", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun replyToNote(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIReplyToNote): APIContentReplyReviewResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/replies", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentReplyReview(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentReplyReviewResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/review", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun contentReplyRead(creatorId: String, id: String, xQelvoraExpectedAccount: String? = null, body: APIContentVersionCommand): APIContentReplyReadResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/read", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioThreadEntries(creatorId: String, cursor: String? = null, limit: Long? = null): APIStudioThreadEntries = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads", "GET", authenticated = true, query = listOf("cursor" to cursor, "limit" to limit?.toString())))
  suspend fun studioSession(): APIStudioSession = json.decodeFromString(request("/v1/studio/session", "GET", authenticated = true))
  suspend fun acceptStudioInvitation(id: String, xQelvoraExpectedAccount: String? = null): APIDone = json.decodeFromString(request("/v1/studio/invitations/${segment(id)}/accept", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun inviteStudioMember(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioInvite): APIStudioInvitation = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/team/invite", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioTeam(creatorId: String): APIStudioTeam = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/team", "GET", authenticated = true))
  suspend fun studioAudiences(creatorId: String): APIStudioAudiences = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/audiences", "GET", authenticated = true))
  suspend fun studioCorrectionRevision(creatorId: String): APIStudioRevision = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/corrections", "GET", authenticated = true))
  suspend fun submitStudioCorrection(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioCorrection): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/corrections", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioQueue(creatorId: String, cursor: String? = null, filter: String? = null, limit: Long? = null): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/queue", "GET", authenticated = true, query = listOf("cursor" to cursor, "filter" to filter, "limit" to limit?.toString())))
  suspend fun studioPacket(creatorId: String, packetId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}", "GET", authenticated = true))
  suspend fun studioDecidePacket(creatorId: String, packetId: String, xQelvoraExpectedAccount: String? = null, body: APICommerceDecidePacket): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/decide", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioPacketDeliveries(creatorId: String, packetId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/deliveries", "GET", authenticated = true))
  suspend fun studioDeliverPacket(creatorId: String, packetId: String, xQelvoraExpectedAccount: String? = null, body: APICommerceFulfillmentCommand): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/deliver", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioThread(creatorId: String, fanId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}", "GET", authenticated = true))
  suspend fun studioTakeover(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioControlCommand): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/takeover", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioHandback(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioControlCommand): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/handback", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioPause(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioControlCommand): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/pause", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioHumanReply(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIHumanReply): APIMessage = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/reply", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun studioReplyDraft(creatorId: String, fanId: String): APIStudioReplyDraft = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/draft", "GET", authenticated = true))
  suspend fun saveStudioReplyDraft(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioSaveReplyDraft): APIStudioDraftVersion = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/draft", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun sendStudioReplyDraft(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null, body: APIStudioSendReplyDraft): APIMessage = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/send-draft", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun health(): APIHealth = json.decodeFromString(request("/health", "GET", authenticated = false))
  suspend fun identityCapabilities(): APIIdentityCapabilities = json.decodeFromString(request("/v1/identity/capabilities", "GET", authenticated = false))
  suspend fun continueWithPantopus(body: APIIdentityContinue): APIIdentityRedirect = json.decodeFromString(request("/v1/identity/continue", "POST", body = json.encodeToString(body), authenticated = false))
  suspend fun completeIdentity(body: APICompleteIdentity): APIIdentityCompletion = json.decodeFromString(request("/v1/identity/complete", "POST", body = json.encodeToString(body), authenticated = false))
  suspend fun identitySession(): APISession = json.decodeFromString(request("/v1/identity/session", "GET", authenticated = true))
  suspend fun refreshSession(): APISessionToken = json.decodeFromString(request("/v1/identity/refresh", "POST", authenticated = true))
  suspend fun logout(): APIDone = json.decodeFromString(request("/v1/identity/logout", "POST", authenticated = true))
  suspend fun revokeSessions(): APIDone = json.decodeFromString(request("/v1/identity/revoke-sessions", "POST", authenticated = true))
  suspend fun saveFanProfile(body: APIFanProfileInput): APIFanProfile = json.decodeFromString(request("/v1/identity/fan-profile", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun saveCreatorProfile(body: APICreatorProfileInput): APICreatorProfile = json.decodeFromString(request("/v1/identity/creator-profile", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun creatorProof(creatorId: String): APIProof = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/proof", "GET", authenticated = true))
  suspend fun beginCreatorProof(creatorId: String, body: APIProofInput): APIProof = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/proof", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun submitCreatorProof(proofId: String, body: APIProofSubmit): APIProof = json.decodeFromString(request("/v1/identity/proof/${segment(proofId)}/submit", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun passkeys(): APIPasskeys = json.decodeFromString(request("/v1/identity/passkeys", "GET", authenticated = true))
  suspend fun beginPasskey(): APIPasskeyOptions = json.decodeFromString(request("/v1/identity/passkeys/begin", "POST", authenticated = true))
  suspend fun registerPasskey(body: APIPasskeyRegistration): APIDone = json.decodeFromString(request("/v1/identity/passkeys/register", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun recoverPasskeys(): APIDone = json.decodeFromString(request("/v1/identity/passkeys/recovery", "POST", authenticated = true))
  suspend fun revokePasskey(body: APIPasskeyRevocation): APIDone = json.decodeFromString(request("/v1/identity/passkeys/revoke", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun cancelPasskey(challengeId: String): APIDone = json.decodeFromString(request("/v1/identity/passkeys/${segment(challengeId)}/cancel", "POST", authenticated = true))
  suspend fun inviteTeamMember(creatorId: String, body: APITeamInvite): APITeamInvitation = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/team/invite", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun acceptTeamInvitation(invitationId: String): APIDone = json.decodeFromString(request("/v1/identity/team/${segment(invitationId)}/accept", "POST", authenticated = true))
  suspend fun removeTeamMember(creatorId: String, accountId: String): APIDone = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/team/${segment(accountId)}/remove", "POST", authenticated = true))
  suspend fun updateTeamMemberRoles(creatorId: String, accountId: String, xExpectedAccountId: String, body: APITeamRolesUpdateInput): APIDone = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/team/${segment(accountId)}/roles", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("X-Expected-Account-Id" to xExpectedAccountId).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun cancelSignedAct(challengeId: String): APIDone = json.decodeFromString(request("/v1/identity/signed-acts/${segment(challengeId)}/cancel", "POST", authenticated = true))
  suspend fun publicSignature(signedActId: String): APIPublicSignature = json.decodeFromString(request("/v1/identity/signed-acts/${segment(signedActId)}", "GET", authenticated = false))
  suspend fun beginSignedAct(creatorId: String, body: APIBeginSignedAct): APISignedChallenge = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/signed-acts/begin", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun verifySignedAct(body: APIVerifySignedAct): APISignedActResult = json.decodeFromString(request("/v1/identity/signed-acts/verify", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun readThread(creatorId: String, fanId: String): APIConversationConversationTimeline = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}", "GET", authenticated = true))
  suspend fun sendMessage(creatorId: String, fanId: String, body: APISendMessage): APIAcceptedMessage = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/messages", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun takeover(creatorId: String, fanId: String, body: APIControlCommand): APIFrame = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/takeover", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun handback(creatorId: String, fanId: String, body: APIControlCommand): APIFrame = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/handback", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun sendHumanReply(creatorId: String, fanId: String, body: APIHumanReply): APIMessage = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/human-replies", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun deliverConversationRecording(creatorId: String, fanId: String, body: APIConversationConversationRecordingInput): APIConversationConversationRecordingResult = json.decodeFromString(request("/v1/conversations/${segment(creatorId)}/${segment(fanId)}/recordings", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun readThreadMedia(creatorId: String, fanId: String, assetId: String, xQelvoraExpectedAccount: String? = null): APIMediaMediaAsset = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/media/${segment(assetId)}", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun threadMediaPlayback(creatorId: String, fanId: String, assetId: String, xQelvoraExpectedAccount: String? = null): APIMediaPlaybackTicket = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/media/${segment(assetId)}/playback", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun playThreadMedia(creatorId: String, fanId: String, assetId: String, ticket: String, range: String? = null, xQelvoraExpectedAccount: String? = null, expectedAccountId: String? = null): CreatorAPIBinaryResponse = requestBytes("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/media/${segment(assetId)}/play", "GET", authenticated = true, query = listOf("ticket" to ticket, "expectedAccountId" to expectedAccountId), headers = listOf("Range" to range, "x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap())
  suspend fun readMediaCapabilities(): APIMediaCapabilities = json.decodeFromString(request("/v1/w6/capabilities", "GET", authenticated = false))
  suspend fun readCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun joinCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null): APICallCallAdmission = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/join", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun setCallConsent(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallConsentCommand): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/consent", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun endCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallEndCall): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/end", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun saveCallSummaryNote(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallCallSummaryNote): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/summary-note", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun deleteCallSummary(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallCallRevision): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/delete-summary", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun cancelCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallCallRevision): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/cancel", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun readCallOffers(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = null): APICallCallOffers = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/call-offers", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun selectCallOffer(creatorId: String, fanId: String, offerId: String, xQelvoraExpectedAccount: String? = null, body: APICallSelectTime): APICallCallSession = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/call-offers/${segment(offerId)}/select", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun readAccountCallRoute(sessionId: String, xQelvoraExpectedAccount: String? = null): APICallCallRoute = json.decodeFromString(request("/v1/w6/calls/${segment(sessionId)}/route", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun redeemCallAdmission(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = null, body: APICallAdmissionRedemption): APICallAdmissionReceipt = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/calls/${segment(sessionId)}/redeem", "POST", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun readCreatorMediaPolicy(creatorId: String, objectId: String, purpose: ReadCreatorMediaPolicyPurpose): APIMediaCreatorMediaPolicyView = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media-policy", "GET", authenticated = true, query = listOf("objectId" to objectId, "purpose" to json.decodeFromString<String>(json.encodeToString(purpose)))))
  suspend fun readAudienceCreatorMedia(creatorId: String, assetId: String, xQelvoraExpectedAccount: String? = null): APIMediaCreatorMediaAsset = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/audience-media/${segment(assetId)}", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun audienceCreatorMediaPlayback(creatorId: String, assetId: String, xQelvoraExpectedAccount: String? = null): APIMediaCreatorMediaPlaybackTicket = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/audience-media/${segment(assetId)}/playback", "POST", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun playAudienceCreatorMedia(creatorId: String, assetId: String, ticket: String, range: String? = null, xQelvoraExpectedAccount: String? = null, expectedAccountId: String? = null): CreatorAPIBinaryResponse = requestBytes("/v1/w6/creators/${segment(creatorId)}/audience-media/${segment(assetId)}/play", "GET", authenticated = true, query = listOf("ticket" to ticket, "expectedAccountId" to expectedAccountId), headers = listOf("Range" to range, "x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap())
  suspend fun readCreatorCallAvailability(creatorId: String, xQelvoraExpectedAccount: String? = null): APICallAvailabilityView = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/call-availability", "GET", authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun saveCreatorCallAvailability(creatorId: String, xQelvoraExpectedAccount: String? = null, body: APICallAvailabilityCommand): APICallAvailability = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/call-availability", "PUT", body = json.encodeToString(body), authenticated = true, headers = listOf("x-qelvora-expected-account" to xQelvoraExpectedAccount).mapNotNull { (name, value) -> value?.let { name to it } }.toMap()))
  suspend fun beginCreatorMedia(creatorId: String, body: APIMediaCreatorMediaUploadRequest): APIMediaCreatorMediaUploadTicket = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun readCreatorMedia(creatorId: String, assetId: String): APIMediaCreatorMediaAsset = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}", "GET", authenticated = true))
  suspend fun revokeCreatorMedia(creatorId: String, assetId: String): APIMediaMediaRevocation = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}", "DELETE", authenticated = true))
  suspend fun resumeCreatorMedia(creatorId: String, assetId: String): APIMediaCreatorMediaUploadTicket = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}/resume", "POST", authenticated = true))
  suspend fun uploadCreatorMediaChunk(creatorId: String, assetId: String, ticket: String, uploadOffset: Long, body: ByteArray): APIMediaCreatorMediaAsset = json.decodeFromString(requestBytes("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}/upload", "PUT", body = body, authenticated = true, query = listOf("ticket" to ticket), headers = listOf("Upload-Offset" to uploadOffset.toString()).mapNotNull { (name, value) -> value?.let { name to it } }.toMap(), accept = "application/json").body.toString(Charsets.UTF_8))
  suspend fun finishCreatorMedia(creatorId: String, assetId: String): APIMediaCreatorMediaAsset = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}/finish", "POST", authenticated = true))
  suspend fun creatorMediaPlayback(creatorId: String, assetId: String): APIMediaCreatorMediaPlaybackTicket = json.decodeFromString(request("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}/playback", "POST", authenticated = true))
  suspend fun playCreatorMedia(creatorId: String, assetId: String, ticket: String, range: String? = null): CreatorAPIBinaryResponse = requestBytes("/v1/w6/creators/${segment(creatorId)}/media/${segment(assetId)}/play", "GET", authenticated = true, query = listOf("ticket" to ticket), headers = listOf("Range" to range).mapNotNull { (name, value) -> value?.let { name to it } }.toMap())
  suspend fun readFanCreatorMedia(creatorId: String, fanId: String, assetId: String): APIMediaCreatorMediaAsset = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/creator-media/${segment(assetId)}", "GET", authenticated = true))
  suspend fun fanCreatorMediaPlayback(creatorId: String, fanId: String, assetId: String): APIMediaCreatorMediaPlaybackTicket = json.decodeFromString(request("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/creator-media/${segment(assetId)}/playback", "POST", authenticated = true))
  suspend fun playFanCreatorMedia(creatorId: String, fanId: String, assetId: String, ticket: String, range: String? = null): CreatorAPIBinaryResponse = requestBytes("/v1/w6/threads/${segment(creatorId)}/${segment(fanId)}/creator-media/${segment(assetId)}/play", "GET", authenticated = true, query = listOf("ticket" to ticket), headers = listOf("Range" to range).mapNotNull { (name, value) -> value?.let { name to it } }.toMap())
}

object ApplicationDestination {
  fun requiresFanProfile(value: String): Boolean = !isPermitted(value) || !Regex("^/(?:identity/account|status|ops(?:/.*)?)$").matches(value.substringBefore('?'))
  fun isPermitted(value: String): Boolean {
    if (value.length > 2048 || value.contains('%') || value.contains('\\') || value.contains('#') || value.any { it.isWhitespace() }) return false
    val parts = value.split('?')
    if (parts.size > 2 || !Regex("^/(?:home|discover|requests(?:/[a-f0-9-]{36})?|you(?:/spending)?|identity/account|ops(?:/(?:audits|metrics|cases/[a-f0-9-]{36}))?|status|notifications(?:/settings)?|invite/[a-f0-9-]{36}|share/[a-f0-9-]{36}|onboarding/handle|studio(?:/calls/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}|/(?:workspace|setup|notes|requests|threads|ai(?:/(?:overview|sources|style|rules|test|versions|license|interview|onboard))?|more|impact|insights|measurement|launch|activation)|/[a-f0-9-]{36}/(?:notes|replies|compose(?:/[a-f0-9-]{36})?|post(?:/[a-f0-9-]{36})?|publish|team|thanks|requests|packets/[a-f0-9-]{36}|threads(?:/[a-f0-9-]{36})?|ai|more))?|commerce/(?:requests|spending|access|packet|checkout|status|pass|membership|offers|earnings|pool)|media/voice|calls/[a-f0-9-]{36}(?:/[a-f0-9-]{36}/[a-f0-9-]{36})?|support(?:/(?:privacy|reports|access|feedback|cases/[a-f0-9-]{36}))?|trust(?:/(?:privacy|reports|crisis|cases/[a-f0-9-]{36}))?|content/[a-f0-9-]{36}/[a-f0-9-]{36}|creators/[a-z0-9_]{3,30}(?:/(?:chat|posts|requests|access)|/posts/[a-f0-9-]{36})?|threads/[a-f0-9-]{36}/[a-f0-9-]{36}|verify/[a-f0-9-]{36})$").matches(parts[0])) return false
    if (parts.size == 1) return true
    val scopes = mapOf("context" to "^/creators/", "creatorId" to "^(?:/commerce/|/support$|/you$|/media/voice$)", "fanId" to "^/you$", "packetId" to "^/commerce/", "offer" to "^/calls/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$", "messageId" to "^/support$", "quote" to "^/studio/[a-f0-9-]{36}/(?:compose|post|publish)$", "packet" to "^/studio/[a-f0-9-]{36}/publish$", "objectId" to "^/media/voice$", "kind" to "^/support$")
    val literalValues = mapOf("offer" to "1", "kind" to "verification")
    val fields = parts[1].split('&')
    if (fields.size > 2) return false
    val names = mutableSetOf<String>()
    return fields.all { field ->
      val pair = field.split('=')
      pair.size == 2 && names.add(pair[0]) && scopes[pair[0]]?.let { Regex(it).containsMatchIn(parts[0]) } == true && (literalValues[pair[0]]?.let { pair[1] == it } ?: runCatching { java.util.UUID.fromString(pair[1]).toString() == pair[1] }.getOrDefault(false))
    }
  }
}
