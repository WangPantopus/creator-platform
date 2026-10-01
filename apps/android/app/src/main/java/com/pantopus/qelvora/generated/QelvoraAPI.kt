// Generated from packages/api/generated/openapi.json. Do not edit.
package com.pantopus.qelvora.generated

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
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
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

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
data class APIMediaCreatorMediaAsset(
  val `id`: String,
  val `purpose`: APIMediaCreatorMediaAssetPurpose,
  val `state`: APIMediaCreatorMediaAssetState,
  val `version`: Long,
  val `mimeType`: String,
  val `bytes`: Long,
  val `uploadedBytes`: Long,
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  val `failureCode`: String? = null,
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
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  val `failureCode`: String? = null,
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
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  val `failureCode`: String? = null,
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
  val `durationMs`: Long? = null,
  val `sha256`: String,
  val `waveform`: List<Double>,
  val `signedActId`: String? = null,
  val `expiresAt`: String,
  val `failureCode`: String? = null,
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
data class APIMediaProcessedMediaEvidence(
  val `assetId`: String,
  val `version`: Long,
  val `sha256`: String,
  val `bytes`: Long,
  val `mimeType`: APIMediaProcessedMediaEvidenceMimeType,
  val `durationMs`: Long? = null
)

@Serializable
enum class APIMediaProcessedMediaEvidenceMimeType {
  @SerialName("audio/mp4") AUDIO_MP4,
  @SerialName("image/png") IMAGE_PNG
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
enum class APICallCallConsentPurpose {
  @SerialName("recording") RECORDING,
  @SerialName("summary") SUMMARY,
  @SerialName("content_reuse") CONTENT_REUSE,
  @SerialName("ai_source") AI_SOURCE
}

@Serializable
data class APICallCallRevision(
  val `expectedVersion`: Long,
  val `idempotencyKey`: String
)

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
  val `scheduledAt`: String? = null,
  val `quote`: APIContentDocumentQuote? = null,
  val `packetId`: String? = null,
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
data class APIContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
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
  val `nextCursor`: String? = null,
  val `serverTime`: String
)

@Serializable
data class APIContentListItemsItem(
  val `id`: String,
  val `creatorId`: String,
  val `creatorName`: String,
  val `creatorHandle`: String,
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentListItemsItemAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  val `signedActId`: String? = null,
  val `publishedAt`: String? = null,
  val `document`: APIContentListItemsItemDocument,
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentListItemsItemSourceState,
  val `quotedText`: String? = null,
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
  val `scheduledAt`: String? = null,
  val `quote`: APIContentListItemsItemDocumentQuote? = null,
  val `packetId`: String? = null,
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
data class APIContentListItemsItemDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
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
  val `consent`: APIContentReplyListItemsItemConsent,
  val `reaction`: APIContentReplyListItemsItemReaction? = null
)

@Serializable
enum class APIContentReplyListItemsItemSafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
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

typealias APIContentThanksFeed = List<APIContentThanksFeedValueItem>

@Serializable
data class APIContentThanksFeedValueItem(
  val `id`: String,
  val `version`: Long,
  val `target_kind`: APIContentThanksFeedValueItemTargetKind,
  val `target_id`: String,
  val `text`: String,
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
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentViewAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  val `signedActId`: String? = null,
  val `publishedAt`: String? = null,
  val `document`: APIContentViewDocument,
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentViewSourceState,
  val `quotedText`: String? = null,
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
  val `scheduledAt`: String? = null,
  val `quote`: APIContentViewDocumentQuote? = null,
  val `packetId`: String? = null,
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
data class APIContentViewDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
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
  val `consent`: APIPrivateNoteReplyConsent,
  val `reaction`: APIPrivateNoteReplyReaction? = null
)

@Serializable
enum class APIPrivateNoteReplySafetyState {
  @SerialName("pending") PENDING,
  @SerialName("allowed") ALLOWED,
  @SerialName("flagged") FLAGGED
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
  val `scheduledAt`: String? = null,
  val `quote`: APISaveContentDocumentQuote? = null,
  val `packetId`: String? = null,
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
data class APISaveContentDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
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
  val `revoked_at`: String? = null,
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
  val `handle`: String? = null,
  val `roles`: List<APIStudioTeamInvitationsItemRolesItem>,
  val `expires_at`: String,
  val `accepted_at`: String? = null,
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
  val `teamMember`: String? = null,
  val `displayText`: String,
  val `version`: Long,
  val `state`: String,
  val `authorKind`: APIContentReviewViewAuthorKind,
  val `authorLabel`: String,
  val `audienceLabel`: String,
  val `signedActId`: String? = null,
  val `publishedAt`: String? = null,
  val `document`: APIContentReviewViewDocument,
  val `audienceCount`: Long? = null,
  val `sourceState`: APIContentReviewViewSourceState,
  val `quotedText`: String? = null,
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
  val `scheduledAt`: String? = null,
  val `quote`: APIContentReviewViewDocumentQuote? = null,
  val `packetId`: String? = null,
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
data class APIContentReviewViewDocumentLive(
  val `sessionId`: String,
  val `startsAt`: String,
  val `endsAt`: String,
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
  val `fan`: APISessionFan? = null,
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
  val `fan`: APIIdentityCompletionSessionFan? = null,
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
  val `expiresAt`: String,
  val `state`: APIProofState,
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
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null
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
data class APIAcceptedMessage(
  val `message`: APIAcceptedMessageMessage,
  val `generationId`: String
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
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null
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
data class APIFrame(
  val `threadId`: String,
  val `cursor`: Long,
  val `epoch`: Long,
  val `kind`: APIFrameKind,
  val `messageId`: String,
  val `authorKind`: APIFrameAuthorKind,
  val `text`: String,
  val `generationId`: String? = null,
  val `sequence`: Long,
  val `control`: APIFrameControl? = null
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
  val `signedActId`: String? = null,
  val `member`: String? = null,
  val `authorAccountId`: String? = null
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

class CreatorAPIError(val status: Int, val body: String): Exception("API request refused ($status)")

class CreatorAPIClient(private val baseURL: String, private val token: suspend () -> String?) {
  private val json = Json { ignoreUnknownKeys = false }
  private suspend fun request(path: String, method: String, body: String? = null, query: Map<String, String> = emptyMap(), expectedAccount: String? = null, authenticated: Boolean): String = withContext(Dispatchers.IO) {
    val connection = URL(baseURL.trimEnd('/') + path + if (query.isEmpty()) "" else query.toSortedMap().entries.joinToString(prefix = "?", separator = "&") { segment(it.key) + "=" + segment(it.value) }).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = method
      connection.connectTimeout = 15000; connection.readTimeout = 30000
      connection.setRequestProperty("Accept", "application/json")
      expectedAccount?.let { connection.setRequestProperty("x-qelvora-expected-account", it) }
      if (authenticated) token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
      if (body != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.bufferedWriter().use { it.write(body) } }
      val status = connection.responseCode
      val payload = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
      if (status !in 200..299) throw CreatorAPIError(status, payload)
      payload
    } finally { connection.disconnect() }
  }
  private fun segment(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
  suspend fun contentList(creatorId: String, query: Map<String, String> = emptyMap()): APIContentList = json.decodeFromString(request("/v1/content/${segment(creatorId)}", "GET", query = query, authenticated = true))
  suspend fun studioContentList(creatorId: String, query: Map<String, String> = emptyMap()): APIContentList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio", "GET", query = query, authenticated = true))
  suspend fun studioLiveCatalog(creatorId: String): APIContentLiveCatalog = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/live", "GET", authenticated = true))
  suspend fun saveContent(creatorId: String, body: APISaveContent, expectedAccount: String? = null): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/drafts", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentReplies(creatorId: String, query: Map<String, String> = emptyMap()): APIContentReplyList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies", "GET", query = query, authenticated = true))
  suspend fun studioContentReplies(creatorId: String, query: Map<String, String> = emptyMap()): APIContentReplyList = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/replies", "GET", query = query, authenticated = true))
  suspend fun contentReplyConsent(creatorId: String, id: String, body: APIQuoteConsent, expectedAccount: String? = null): APIContentConsentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/consent", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentReplyReaction(creatorId: String, id: String, body: APIReactToReply, expectedAccount: String? = null): APIContentReactionResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/reaction", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun withdrawContentReply(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentWithdrawResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/withdraw", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentPreference(creatorId: String): APIContentPreference = json.decodeFromString(request("/v1/content/${segment(creatorId)}/mute", "GET", authenticated = true))
  suspend fun muteContent(creatorId: String, body: APIContentMuteCommand, expectedAccount: String? = null): APIContentMuteCommand = json.decodeFromString(request("/v1/content/${segment(creatorId)}/mute", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun myContentThanks(creatorId: String): APIContentThanksView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/thanks", "GET", authenticated = true))
  suspend fun saveContentThanks(creatorId: String, body: APIThanksCommand, expectedAccount: String? = null): APIContentRevisionResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/thanks", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioThanksFeed(creatorId: String): APIContentThanksFeed = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/thanks", "GET", authenticated = true))
  suspend fun runScheduledContent(creatorId: String, expectedAccount: String? = null): APIContentScheduledResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/scheduled/run", "POST", expectedAccount = expectedAccount, authenticated = true))
  suspend fun runContentEffects(creatorId: String, expectedAccount: String? = null): APIContentEffectsResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/studio/effects/run", "POST", expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentView(creatorId: String, id: String): APIContentView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}", "GET", authenticated = true))
  suspend fun studioContentView(creatorId: String, id: String): APIContentView = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/studio", "GET", authenticated = true))
  suspend fun reviewContent(creatorId: String, id: String): APIContentReview = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/review", "GET", authenticated = true))
  suspend fun publishContent(creatorId: String, id: String, body: APIPublishContent, expectedAccount: String? = null): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/publish", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun teamPublishContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/team-publish", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun unpublishContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/unpublish", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun archiveContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/archive", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun replyToNote(creatorId: String, id: String, body: APIReplyToNote, expectedAccount: String? = null): APIContentReplyReviewResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/${segment(id)}/replies", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentReplyReview(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentReplyReviewResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/review", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun contentReplyRead(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = null): APIContentReplyReadResult = json.decodeFromString(request("/v1/content/${segment(creatorId)}/replies/${segment(id)}/read", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioThreadEntries(creatorId: String, query: Map<String, String> = emptyMap()): APIStudioThreadEntries = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads", "GET", query = query, authenticated = true))
  suspend fun studioSession(): APIStudioSession = json.decodeFromString(request("/v1/studio/session", "GET", authenticated = true))
  suspend fun acceptStudioInvitation(id: String, expectedAccount: String? = null): APIDone = json.decodeFromString(request("/v1/studio/invitations/${segment(id)}/accept", "POST", expectedAccount = expectedAccount, authenticated = true))
  suspend fun inviteStudioMember(creatorId: String, body: APIStudioInvite, expectedAccount: String? = null): APIStudioInvitation = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/team/invite", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioTeam(creatorId: String): APIStudioTeam = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/team", "GET", authenticated = true))
  suspend fun studioAudiences(creatorId: String): APIStudioAudiences = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/audiences", "GET", authenticated = true))
  suspend fun studioCorrectionRevision(creatorId: String): APIStudioRevision = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/corrections", "GET", authenticated = true))
  suspend fun submitStudioCorrection(creatorId: String, body: APIStudioCorrection, expectedAccount: String? = null): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/corrections", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioQueue(creatorId: String, query: Map<String, String> = emptyMap()): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/queue", "GET", query = query, authenticated = true))
  suspend fun studioPacket(creatorId: String, packetId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}", "GET", authenticated = true))
  suspend fun studioDecidePacket(creatorId: String, packetId: String, body: APICommerceDecidePacket, expectedAccount: String? = null): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/decide", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioPacketDeliveries(creatorId: String, packetId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/deliveries", "GET", authenticated = true))
  suspend fun studioDeliverPacket(creatorId: String, packetId: String, body: APICommerceFulfillmentCommand, expectedAccount: String? = null): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/packets/${segment(packetId)}/deliver", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioThread(creatorId: String, fanId: String): APIStudioCommerceProjection = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}", "GET", authenticated = true))
  suspend fun studioTakeover(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = null): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/takeover", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioHandback(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = null): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/handback", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioPause(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = null): APIFrame = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/pause", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioHumanReply(creatorId: String, fanId: String, body: APIHumanReply, expectedAccount: String? = null): APIMessage = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/reply", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun studioReplyDraft(creatorId: String, fanId: String): APIStudioReplyDraft = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/draft", "GET", authenticated = true))
  suspend fun saveStudioReplyDraft(creatorId: String, fanId: String, body: APIStudioSaveReplyDraft, expectedAccount: String? = null): APIStudioDraftVersion = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/draft", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
  suspend fun sendStudioReplyDraft(creatorId: String, fanId: String, body: APIStudioSendReplyDraft, expectedAccount: String? = null): APIMessage = json.decodeFromString(request("/v1/studio/${segment(creatorId)}/threads/${segment(fanId)}/send-draft", "POST", body = json.encodeToString(body), expectedAccount = expectedAccount, authenticated = true))
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
  suspend fun cancelSignedAct(challengeId: String): APIDone = json.decodeFromString(request("/v1/identity/signed-acts/${segment(challengeId)}/cancel", "POST", authenticated = true))
  suspend fun publicSignature(signedActId: String): APIPublicSignature = json.decodeFromString(request("/v1/identity/signed-acts/${segment(signedActId)}", "GET", authenticated = false))
  suspend fun beginSignedAct(creatorId: String, body: APIBeginSignedAct): APISignedChallenge = json.decodeFromString(request("/v1/identity/${segment(creatorId)}/signed-acts/begin", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun verifySignedAct(body: APIVerifySignedAct): APISignedActResult = json.decodeFromString(request("/v1/identity/signed-acts/verify", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun readThread(creatorId: String, fanId: String): APIThreadTimeline = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}", "GET", authenticated = true))
  suspend fun sendMessage(creatorId: String, fanId: String, body: APISendMessage): APIAcceptedMessage = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/messages", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun takeover(creatorId: String, fanId: String, body: APIControlCommand): APIFrame = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/takeover", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun handback(creatorId: String, fanId: String, body: APIControlCommand): APIFrame = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/handback", "POST", body = json.encodeToString(body), authenticated = true))
  suspend fun sendHumanReply(creatorId: String, fanId: String, body: APIHumanReply): APIMessage = json.decodeFromString(request("/v1/threads/${segment(creatorId)}/${segment(fanId)}/human-replies", "POST", body = json.encodeToString(body), authenticated = true))
}

object ApplicationDestination {
  fun isPermitted(value: String): Boolean {
    if (value.length > 2048 || value.contains('%') || value.contains('\\') || value.contains('#') || value.any { it.isWhitespace() }) return false
    val parts = value.split('?')
    if (parts.size > 2 || !Regex("^/(?:home|discover|requests(?:/[a-f0-9-]{36})?|you(?:/spending)?|identity/account|notifications(?:/settings)?|invite/[a-f0-9-]{36}|share/[a-f0-9-]{36}|onboarding/handle|studio(?:/(?:workspace|setup|notes|requests|threads|ai(?:/license)?|more|impact|insights|measurement|launch|activation)|/[a-f0-9-]{36}/(?:notes|replies|compose(?:/[a-f0-9-]{36})?|post(?:/[a-f0-9-]{36})?|publish|team|thanks|requests|packets/[a-f0-9-]{36}|threads(?:/[a-f0-9-]{36})?|ai|more))?|commerce/(?:requests|spending|access|packet|checkout|status|pass|membership|offers|earnings|pool)|media/voice|calls/[a-f0-9-]{36}(?:/[a-f0-9-]{36}/[a-f0-9-]{36})?|support(?:/(?:privacy|reports|access|feedback|cases/[a-f0-9-]{36}))?|trust(?:/(?:privacy|reports|crisis|cases/[a-f0-9-]{36}))?|content/[a-f0-9-]{36}/[a-f0-9-]{36}|creators/[a-z0-9_]{3,30}(?:/(?:chat|posts|requests|access)|/posts/[a-f0-9-]{36})?|threads/[a-f0-9-]{36}/[a-f0-9-]{36}|verify/[a-f0-9-]{36})$").matches(parts[0])) return false
    if (parts.size == 1) return true
    val scopes = mapOf("context" to "^/creators/", "creatorId" to "^(?:/commerce/|/support$)", "packetId" to "^/commerce/", "offer" to "^/calls/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$", "messageId" to "^/support$", "quote" to "^/studio/[a-f0-9-]{36}/(?:compose|post|publish)$", "packet" to "^/studio/[a-f0-9-]{36}/publish$")
    val literalValues = mapOf("offer" to "1")
    val fields = parts[1].split('&')
    if (fields.size > 2) return false
    val names = mutableSetOf<String>()
    return fields.all { field ->
      val pair = field.split('=')
      pair.size == 2 && names.add(pair[0]) && scopes[pair[0]]?.let { Regex(it).containsMatchIn(parts[0]) } == true && (literalValues[pair[0]]?.let { pair[1] == it } ?: runCatching { java.util.UUID.fromString(pair[1]).toString() == pair[1] }.getOrDefault(false))
    }
  }
}
