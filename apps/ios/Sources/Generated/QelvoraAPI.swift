// Generated from packages/api/generated/openapi.json. Do not edit.
import Foundation

public enum APIJSONValue: Codable, Sendable {
  case string(String), number(Double), boolean(Bool), array([APIJSONValue]), object([String: APIJSONValue]), null
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() { self = .null }
    else if let value = try? container.decode(Bool.self) { self = .boolean(value) }
    else if let value = try? container.decode(Double.self) { self = .number(value) }
    else if let value = try? container.decode(String.self) { self = .string(value) }
    else if let value = try? container.decode([APIJSONValue].self) { self = .array(value) }
    else { self = .object(try container.decode([String: APIJSONValue].self)) }
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
      case .string(let value): try container.encode(value)
      case .number(let value): try container.encode(value)
      case .boolean(let value): try container.encode(value)
      case .array(let value): try container.encode(value)
      case .object(let value): try container.encode(value)
      case .null: try container.encodeNil()
    }
  }
}

public typealias APIAgentAgentAudience = APIJSONValue

public struct APIAgentCorrectionRequest: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `paraphrasedPrompt`: String
  public let `rule`: String
  public let `unacceptableAnswer`: String
  public init(expectedRevision: Int, paraphrasedPrompt: String, rule: String, unacceptableAnswer: String) {
    self.expectedRevision = expectedRevision
    self.paraphrasedPrompt = paraphrasedPrompt
    self.rule = rule
    self.unacceptableAnswer = unacceptableAnswer
  }
}

public struct APIAgentDraftConfig: Codable, Sendable {
  public let `mode`: APIAgentDraftConfigMode
  public let `tone`: APIAgentDraftConfigTone
  public let `styleCard`: String
  public let `examples`: [APIAgentDraftConfigExamplesItem]
  public let `rules`: [String]
  public let `neverReveal`: [String]
  public let `handoff`: String
  public let `dailyCostCapMicros`: Int
  public let `sessionNudgeMinutes`: Int
  public let `usefulnessCriteria`: String
  public let `styleCriteria`: String
  public init(mode: APIAgentDraftConfigMode, tone: APIAgentDraftConfigTone, styleCard: String, examples: [APIAgentDraftConfigExamplesItem], rules: [String], neverReveal: [String], handoff: String, dailyCostCapMicros: Int, sessionNudgeMinutes: Int, usefulnessCriteria: String, styleCriteria: String) {
    self.mode = mode
    self.tone = tone
    self.styleCard = styleCard
    self.examples = examples
    self.rules = rules
    self.neverReveal = neverReveal
    self.handoff = handoff
    self.dailyCostCapMicros = dailyCostCapMicros
    self.sessionNudgeMinutes = sessionNudgeMinutes
    self.usefulnessCriteria = usefulnessCriteria
    self.styleCriteria = styleCriteria
  }
}

public enum APIAgentDraftConfigMode: String, Codable, Sendable {
  case `expert` = "expert"
  case `companion` = "companion"
  case `blend` = "blend"
}

public enum APIAgentDraftConfigTone: String, Codable, Sendable {
  case `Plainer` = "Plainer"
  case `As_written` = "As written"
  case `Warmer` = "Warmer"
}

public struct APIAgentDraftConfigExamplesItem: Codable, Sendable {
  public let `id`: String
  public let `text`: String
  public let `fixed`: Bool
  public let `approved`: Bool
  public init(id: String, text: String, fixed: Bool, approved: Bool) {
    self.id = id
    self.text = text
    self.fixed = fixed
    self.approved = approved
  }
}

public struct APIAgentDraftWrite: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `configuration`: APIAgentDraftWriteConfiguration
  public init(expectedRevision: Int, configuration: APIAgentDraftWriteConfiguration) {
    self.expectedRevision = expectedRevision
    self.configuration = configuration
  }
}

public struct APIAgentDraftWriteConfiguration: Codable, Sendable {
  public let `mode`: APIAgentDraftWriteConfigurationMode
  public let `tone`: APIAgentDraftWriteConfigurationTone
  public let `styleCard`: String
  public let `examples`: [APIAgentDraftWriteConfigurationExamplesItem]
  public let `rules`: [String]
  public let `neverReveal`: [String]
  public let `handoff`: String
  public let `dailyCostCapMicros`: Int
  public let `sessionNudgeMinutes`: Int
  public let `usefulnessCriteria`: String
  public let `styleCriteria`: String
  public init(mode: APIAgentDraftWriteConfigurationMode, tone: APIAgentDraftWriteConfigurationTone, styleCard: String, examples: [APIAgentDraftWriteConfigurationExamplesItem], rules: [String], neverReveal: [String], handoff: String, dailyCostCapMicros: Int, sessionNudgeMinutes: Int, usefulnessCriteria: String, styleCriteria: String) {
    self.mode = mode
    self.tone = tone
    self.styleCard = styleCard
    self.examples = examples
    self.rules = rules
    self.neverReveal = neverReveal
    self.handoff = handoff
    self.dailyCostCapMicros = dailyCostCapMicros
    self.sessionNudgeMinutes = sessionNudgeMinutes
    self.usefulnessCriteria = usefulnessCriteria
    self.styleCriteria = styleCriteria
  }
}

public enum APIAgentDraftWriteConfigurationMode: String, Codable, Sendable {
  case `expert` = "expert"
  case `companion` = "companion"
  case `blend` = "blend"
}

public enum APIAgentDraftWriteConfigurationTone: String, Codable, Sendable {
  case `Plainer` = "Plainer"
  case `As_written` = "As written"
  case `Warmer` = "Warmer"
}

public struct APIAgentDraftWriteConfigurationExamplesItem: Codable, Sendable {
  public let `id`: String
  public let `text`: String
  public let `fixed`: Bool
  public let `approved`: Bool
  public init(id: String, text: String, fixed: Bool, approved: Bool) {
    self.id = id
    self.text = text
    self.fixed = fixed
    self.approved = approved
  }
}

public struct APIAgentEvaluationRequest: Codable, Sendable {
  public let `expectedRevision`: Int
  public init(expectedRevision: Int) {
    self.expectedRevision = expectedRevision
  }
}

public struct APIAgentExample: Codable, Sendable {
  public let `id`: String
  public let `text`: String
  public let `fixed`: Bool
  public let `approved`: Bool
  public init(id: String, text: String, fixed: Bool, approved: Bool) {
    self.id = id
    self.text = text
    self.fixed = fixed
    self.approved = approved
  }
}

public struct APIAgentInterviewWrite: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `story`: String
  public let `boundaries`: String
  public let `audioConsent`: Bool
  public init(expectedRevision: Int, story: String, boundaries: String, audioConsent: Bool) {
    self.expectedRevision = expectedRevision
    self.story = story
    self.boundaries = boundaries
    self.audioConsent = audioConsent
  }
}

public struct APIAgentLicenseRequest: Codable, Sendable {
  public let `proofReference`: String
  public let `counselVersion`: String
  public let `permittedUses`: [APIAgentLicenseRequestPermittedUsesItem]
  public let `termEndsAt`: String
  public let `voiceConsentReference`: String?
  public let `estateOptInReference`: String?
  public init(proofReference: String, counselVersion: String, permittedUses: [APIAgentLicenseRequestPermittedUsesItem], termEndsAt: String, voiceConsentReference: String? = nil, estateOptInReference: String? = nil) {
    self.proofReference = proofReference
    self.counselVersion = counselVersion
    self.permittedUses = permittedUses
    self.termEndsAt = termEndsAt
    self.voiceConsentReference = voiceConsentReference
    self.estateOptInReference = estateOptInReference
  }
}

public enum APIAgentLicenseRequestPermittedUsesItem: String, Codable, Sendable {
  case `text_ai` = "text_ai"
  case `ai_voice` = "ai_voice"
  case `sponsored_mentions` = "sponsored_mentions"
}

public enum APIAgentMode: String, Codable, Sendable {
  case `expert` = "expert"
  case `companion` = "companion"
  case `blend` = "blend"
}

public struct APIAgentPreviewRequest: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `message`: String
  public init(expectedRevision: Int, message: String) {
    self.expectedRevision = expectedRevision
    self.message = message
  }
}

public struct APIAgentPublishRequest: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `evaluationId`: String
  public let `changes`: String
  public init(expectedRevision: Int, evaluationId: String, changes: String) {
    self.expectedRevision = expectedRevision
    self.evaluationId = evaluationId
    self.changes = changes
  }
}

public typealias APIAgentRevision = Int

public struct APIAgentSourceAction: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `action`: APIAgentSourceActionAction
  public let `rightsConfirmed`: Bool?
  public init(expectedRevision: Int, action: APIAgentSourceActionAction, rightsConfirmed: Bool? = nil) {
    self.expectedRevision = expectedRevision
    self.action = action
    self.rightsConfirmed = rightsConfirmed
  }
}

public enum APIAgentSourceActionAction: String, Codable, Sendable {
  case `approve` = "approve"
  case `revoke` = "revoke"
  case `retry` = "retry"
  case `cancel` = "cancel"
  case `restore` = "restore"
}

public struct APIAgentSourceCreate: Codable, Sendable {
  public let `title`: String
  public let `text`: String
  public let `origin`: APIAgentSourceCreateOrigin
  public let `originReference`: String?
  public let `audience`: APIJSONValue
  public let `rightsEvidence`: String
  public let `expiresAt`: String?
  public init(title: String, text: String, origin: APIAgentSourceCreateOrigin, originReference: String? = nil, audience: APIJSONValue, rightsEvidence: String, expiresAt: String? = nil) {
    self.title = title
    self.text = text
    self.origin = origin
    self.originReference = originReference
    self.audience = audience
    self.rightsEvidence = rightsEvidence
    self.expiresAt = expiresAt
  }
}

public enum APIAgentSourceCreateOrigin: String, Codable, Sendable {
  case `manual_text` = "manual_text"
  case `manual_upload` = "manual_upload"
  case `interview` = "interview"
  case `youtube_caption` = "youtube_caption"
  case `platform_export` = "platform_export"
}

public struct APIAgentSponsorWrite: Codable, Sendable {
  public let `brand`: String
  public let `aliases`: [String]
  public let `expiresAt`: String
  public let `active`: Bool
  public init(brand: String, aliases: [String], expiresAt: String, active: Bool) {
    self.brand = brand
    self.aliases = aliases
    self.expiresAt = expiresAt
    self.active = active
  }
}

public struct APIAgentStatusWrite: Codable, Sendable {
  public let `text`: String
  public let `expiresAt`: String
  public init(text: String, expiresAt: String) {
    self.text = text
    self.expiresAt = expiresAt
  }
}

public enum APICommerceCommitmentState: String, Codable, Sendable {
  case `due` = "due"
  case `in_progress` = "in_progress"
  case `delivered` = "delivered"
  case `resolution_required` = "resolution_required"
  case `refund_pending` = "refund_pending"
  case `refunded` = "refunded"
  case `resolved` = "resolved"
}

public typealias APICommerceCurrency = String

public struct APICommerceDecidePacket: Codable, Sendable {
  public let `action`: APICommerceDecidePacketAction
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `signedActId`: String?
  public let `text`: String?
  public let `proposedModeId`: String?
  public init(action: APICommerceDecidePacketAction, version: Int, idempotencyKey: String, signedActId: String? = nil, text: String? = nil, proposedModeId: String? = nil) {
    self.action = action
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.signedActId = signedActId
    self.text = text
    self.proposedModeId = proposedModeId
  }
}

public enum APICommerceDecidePacketAction: String, Codable, Sendable {
  case `ai_answer` = "ai_answer"
  case `approve_draft` = "approve_draft"
  case `reply_myself` = "reply_myself"
  case `voice_note` = "voice_note"
  case `offer_times` = "offer_times"
  case `group_offer` = "group_offer"
  case `more_info` = "more_info"
  case `decline` = "decline"
}

public enum APICommerceDecisionAction: String, Codable, Sendable {
  case `ai_answer` = "ai_answer"
  case `approve_draft` = "approve_draft"
  case `reply_myself` = "reply_myself"
  case `voice_note` = "voice_note"
  case `offer_times` = "offer_times"
  case `group_offer` = "group_offer"
  case `more_info` = "more_info"
  case `decline` = "decline"
}

public struct APICommerceDisclosure: Codable, Sendable {
  public let `summary`: String
  public let `includeSummary`: Bool
  public let `messageIds`: [String]
  public let `attachmentIds`: [String]
  public let `wholeThread`: Bool
  public let `identity`: APICommerceDisclosureIdentity
  public let `accessNoticeVersion`: String
  public init(summary: String, includeSummary: Bool, messageIds: [String], attachmentIds: [String], wholeThread: Bool, identity: APICommerceDisclosureIdentity, accessNoticeVersion: String) {
    self.summary = summary
    self.includeSummary = includeSummary
    self.messageIds = messageIds
    self.attachmentIds = attachmentIds
    self.wholeThread = wholeThread
    self.identity = identity
    self.accessNoticeVersion = accessNoticeVersion
  }
}

public enum APICommerceDisclosureIdentity: String, Codable, Sendable {
  case `handle` = "handle"
  case `shared_intro` = "shared_intro"
}

public struct APICommerceFulfillmentCommand: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `messageId`: String
  public init(version: Int, idempotencyKey: String, messageId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.messageId = messageId
  }
}

public typealias APICommerceIdempotencyKey = String

public typealias APICommerceMinorUnits = Int

public enum APICommerceModeKind: String, Codable, Sendable {
  case `written_reply` = "written_reply"
  case `voice_note` = "voice_note"
  case `audio_call` = "audio_call"
  case `video_call` = "video_call"
  case `group_answer` = "group_answer"
  case `guaranteed_review` = "guaranteed_review"
}

public struct APICommerceMoney: Codable, Sendable {
  public let `amount`: Int
  public let `currency`: String
  public init(amount: Int, currency: String) {
    self.amount = amount
    self.currency = currency
  }
}

public struct APICommerceMoreInfoReply: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `text`: String
  public init(version: Int, idempotencyKey: String, text: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.text = text
  }
}

public struct APICommerceOfferChoice: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `accept`: Bool
  public init(version: Int, idempotencyKey: String, accept: Bool) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.accept = accept
  }
}

public enum APICommercePacketState: String, Codable, Sendable {
  case `draft` = "draft"
  case `submitting` = "submitting"
  case `submitted` = "submitted"
  case `more_info` = "more_info"
  case `offer_pending` = "offer_pending"
  case `accepting` = "accepting"
  case `accepted` = "accepted"
  case `releasing` = "releasing"
  case `declined` = "declined"
  case `expired` = "expired"
  case `withdrawn` = "withdrawn"
}

public enum APICommercePaymentState: String, Codable, Sendable {
  case `authorization_pending` = "authorization_pending"
  case `requires_action` = "requires_action"
  case `requires_capture` = "requires_capture"
  case `unknown` = "unknown"
  case `capturing` = "capturing"
  case `captured` = "captured"
  case `releasing` = "releasing"
  case `released` = "released"
  case `refund_pending` = "refund_pending"
  case `refunded` = "refunded"
  case `failed` = "failed"
}

public struct APICommerceReauthorizePacket: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `paymentMethodId`: String
  public init(version: Int, idempotencyKey: String, paymentMethodId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.paymentMethodId = paymentMethodId
  }
}

public struct APICommerceShareChoice: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `enabled`: Bool
  public let `handleDisplay`: APICommerceShareChoiceHandleDisplay
  public init(version: Int, idempotencyKey: String, enabled: Bool, handleDisplay: APICommerceShareChoiceHandleDisplay) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.enabled = enabled
    self.handleDisplay = handleDisplay
  }
}

public enum APICommerceShareChoiceHandleDisplay: String, Codable, Sendable {
  case `hidden` = "hidden"
  case `handle` = "handle"
}

public struct APICommerceSpendLimitCommand: Codable, Sendable {
  public let `currency`: String
  public let `amount`: Int?
  public let `explicitNone`: Bool
  public let `remindersOn`: Bool
  public let `idempotencyKey`: String
  public init(currency: String, amount: Int? = nil, explicitNone: Bool, remindersOn: Bool, idempotencyKey: String) {
    self.currency = currency
    self.amount = amount
    self.explicitNone = explicitNone
    self.remindersOn = remindersOn
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICommerceSubmitPacket: Codable, Sendable {
  public let `creatorId`: String
  public let `fanId`: String
  public let `modeId`: String
  public let `modeVersion`: Int
  public let `visibility`: APICommerceSubmitPacketVisibility
  public let `disclosure`: APICommerceSubmitPacketDisclosure
  public let `paymentMethodId`: String
  public let `idempotencyKey`: String
  public init(creatorId: String, fanId: String, modeId: String, modeVersion: Int, visibility: APICommerceSubmitPacketVisibility, disclosure: APICommerceSubmitPacketDisclosure, paymentMethodId: String, idempotencyKey: String) {
    self.creatorId = creatorId
    self.fanId = fanId
    self.modeId = modeId
    self.modeVersion = modeVersion
    self.visibility = visibility
    self.disclosure = disclosure
    self.paymentMethodId = paymentMethodId
    self.idempotencyKey = idempotencyKey
  }
}

public enum APICommerceSubmitPacketVisibility: String, Codable, Sendable {
  case `private` = "private"
  case `public` = "public"
}

public struct APICommerceSubmitPacketDisclosure: Codable, Sendable {
  public let `summary`: String
  public let `includeSummary`: Bool
  public let `messageIds`: [String]
  public let `attachmentIds`: [String]
  public let `wholeThread`: Bool
  public let `identity`: APICommerceSubmitPacketDisclosureIdentity
  public let `accessNoticeVersion`: String
  public init(summary: String, includeSummary: Bool, messageIds: [String], attachmentIds: [String], wholeThread: Bool, identity: APICommerceSubmitPacketDisclosureIdentity, accessNoticeVersion: String) {
    self.summary = summary
    self.includeSummary = includeSummary
    self.messageIds = messageIds
    self.attachmentIds = attachmentIds
    self.wholeThread = wholeThread
    self.identity = identity
    self.accessNoticeVersion = accessNoticeVersion
  }
}

public enum APICommerceSubmitPacketDisclosureIdentity: String, Codable, Sendable {
  case `handle` = "handle"
  case `shared_intro` = "shared_intro"
}

public struct APICommerceVersionCommand: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public init(version: Int, idempotencyKey: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIMediaCreatorMediaAsset: Codable, Sendable {
  public let `id`: String
  public let `purpose`: APIMediaCreatorMediaAssetPurpose
  public let `state`: APIMediaCreatorMediaAssetState
  public let `version`: Int
  public let `mimeType`: String
  public let `bytes`: Int
  public let `uploadedBytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `waveform`: [Double]
  public let `signedActId`: String?
  public let `expiresAt`: String
  public let `failureCode`: String?
  public let `provenance`: [String: APIJSONValue]?
  public let `creatorId`: String
  public let `objectId`: String
  public let `ownerAccountId`: String
  public init(id: String, purpose: APIMediaCreatorMediaAssetPurpose, state: APIMediaCreatorMediaAssetState, version: Int, mimeType: String, bytes: Int, uploadedBytes: Int, durationMs: Int? = nil, sha256: String, waveform: [Double], signedActId: String? = nil, expiresAt: String, failureCode: String? = nil, provenance: [String: APIJSONValue]? = nil, creatorId: String, objectId: String, ownerAccountId: String) {
    self.id = id
    self.purpose = purpose
    self.state = state
    self.version = version
    self.mimeType = mimeType
    self.bytes = bytes
    self.uploadedBytes = uploadedBytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.waveform = waveform
    self.signedActId = signedActId
    self.expiresAt = expiresAt
    self.failureCode = failureCode
    self.provenance = provenance
    self.creatorId = creatorId
    self.objectId = objectId
    self.ownerAccountId = ownerAccountId
  }
}

public enum APIMediaCreatorMediaAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
}

public enum APIMediaCreatorMediaAssetState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public struct APIMediaCreatorMediaPlaybackTicket: Codable, Sendable {
  public let `asset`: APIMediaCreatorMediaPlaybackTicketAsset
  public let `url`: String
  public let `expiresAt`: String
  public init(asset: APIMediaCreatorMediaPlaybackTicketAsset, url: String, expiresAt: String) {
    self.asset = asset
    self.url = url
    self.expiresAt = expiresAt
  }
}

public struct APIMediaCreatorMediaPlaybackTicketAsset: Codable, Sendable {
  public let `id`: String
  public let `purpose`: APIMediaCreatorMediaPlaybackTicketAssetPurpose
  public let `state`: APIMediaCreatorMediaPlaybackTicketAssetState
  public let `version`: Int
  public let `mimeType`: String
  public let `bytes`: Int
  public let `uploadedBytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `waveform`: [Double]
  public let `signedActId`: String?
  public let `expiresAt`: String
  public let `failureCode`: String?
  public let `provenance`: [String: APIJSONValue]?
  public let `creatorId`: String
  public let `objectId`: String
  public let `ownerAccountId`: String
  public init(id: String, purpose: APIMediaCreatorMediaPlaybackTicketAssetPurpose, state: APIMediaCreatorMediaPlaybackTicketAssetState, version: Int, mimeType: String, bytes: Int, uploadedBytes: Int, durationMs: Int? = nil, sha256: String, waveform: [Double], signedActId: String? = nil, expiresAt: String, failureCode: String? = nil, provenance: [String: APIJSONValue]? = nil, creatorId: String, objectId: String, ownerAccountId: String) {
    self.id = id
    self.purpose = purpose
    self.state = state
    self.version = version
    self.mimeType = mimeType
    self.bytes = bytes
    self.uploadedBytes = uploadedBytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.waveform = waveform
    self.signedActId = signedActId
    self.expiresAt = expiresAt
    self.failureCode = failureCode
    self.provenance = provenance
    self.creatorId = creatorId
    self.objectId = objectId
    self.ownerAccountId = ownerAccountId
  }
}

public enum APIMediaCreatorMediaPlaybackTicketAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
}

public enum APIMediaCreatorMediaPlaybackTicketAssetState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public enum APIMediaCreatorMediaPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
}

public struct APIMediaCreatorMediaUploadRequest: Codable, Sendable {
  public let `purpose`: APIMediaCreatorMediaUploadRequestPurpose
  public let `mimeType`: APIMediaCreatorMediaUploadRequestMimeType
  public let `bytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `idempotencyKey`: String
  public let `objectId`: String
  public init(purpose: APIMediaCreatorMediaUploadRequestPurpose, mimeType: APIMediaCreatorMediaUploadRequestMimeType, bytes: Int, durationMs: Int? = nil, sha256: String, idempotencyKey: String, objectId: String) {
    self.purpose = purpose
    self.mimeType = mimeType
    self.bytes = bytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.idempotencyKey = idempotencyKey
    self.objectId = objectId
  }
}

public enum APIMediaCreatorMediaUploadRequestPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
}

public enum APIMediaCreatorMediaUploadRequestMimeType: String, Codable, Sendable {
  case `audio_webm` = "audio/webm"
  case `audio_mp4` = "audio/mp4"
  case `audio_ogg` = "audio/ogg"
  case `audio_wav` = "audio/wav"
  case `image_jpeg` = "image/jpeg"
  case `image_png` = "image/png"
}

public struct APIMediaCreatorMediaUploadTicket: Codable, Sendable {
  public let `asset`: APIMediaCreatorMediaUploadTicketAsset
  public let `url`: String
  public let `expiresAt`: String
  public let `chunkBytes`: Int
  public init(asset: APIMediaCreatorMediaUploadTicketAsset, url: String, expiresAt: String, chunkBytes: Int) {
    self.asset = asset
    self.url = url
    self.expiresAt = expiresAt
    self.chunkBytes = chunkBytes
  }
}

public struct APIMediaCreatorMediaUploadTicketAsset: Codable, Sendable {
  public let `id`: String
  public let `purpose`: APIMediaCreatorMediaUploadTicketAssetPurpose
  public let `state`: APIMediaCreatorMediaUploadTicketAssetState
  public let `version`: Int
  public let `mimeType`: String
  public let `bytes`: Int
  public let `uploadedBytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `waveform`: [Double]
  public let `signedActId`: String?
  public let `expiresAt`: String
  public let `failureCode`: String?
  public let `provenance`: [String: APIJSONValue]?
  public let `creatorId`: String
  public let `objectId`: String
  public let `ownerAccountId`: String
  public init(id: String, purpose: APIMediaCreatorMediaUploadTicketAssetPurpose, state: APIMediaCreatorMediaUploadTicketAssetState, version: Int, mimeType: String, bytes: Int, uploadedBytes: Int, durationMs: Int? = nil, sha256: String, waveform: [Double], signedActId: String? = nil, expiresAt: String, failureCode: String? = nil, provenance: [String: APIJSONValue]? = nil, creatorId: String, objectId: String, ownerAccountId: String) {
    self.id = id
    self.purpose = purpose
    self.state = state
    self.version = version
    self.mimeType = mimeType
    self.bytes = bytes
    self.uploadedBytes = uploadedBytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.waveform = waveform
    self.signedActId = signedActId
    self.expiresAt = expiresAt
    self.failureCode = failureCode
    self.provenance = provenance
    self.creatorId = creatorId
    self.objectId = objectId
    self.ownerAccountId = ownerAccountId
  }
}

public enum APIMediaCreatorMediaUploadTicketAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
}

public enum APIMediaCreatorMediaUploadTicketAssetState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public struct APIMediaMediaAsset: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `purpose`: APIMediaMediaAssetPurpose
  public let `state`: APIMediaMediaAssetState
  public let `version`: Int
  public let `mimeType`: String
  public let `bytes`: Int
  public let `uploadedBytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `waveform`: [Double]
  public let `signedActId`: String?
  public let `expiresAt`: String
  public let `failureCode`: String?
  public let `provenance`: [String: APIJSONValue]?
  public init(id: String, threadId: String, purpose: APIMediaMediaAssetPurpose, state: APIMediaMediaAssetState, version: Int, mimeType: String, bytes: Int, uploadedBytes: Int, durationMs: Int? = nil, sha256: String, waveform: [Double], signedActId: String? = nil, expiresAt: String, failureCode: String? = nil, provenance: [String: APIJSONValue]? = nil) {
    self.id = id
    self.threadId = threadId
    self.purpose = purpose
    self.state = state
    self.version = version
    self.mimeType = mimeType
    self.bytes = bytes
    self.uploadedBytes = uploadedBytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.waveform = waveform
    self.signedActId = signedActId
    self.expiresAt = expiresAt
    self.failureCode = failureCode
    self.provenance = provenance
  }
}

public enum APIMediaMediaAssetPurpose: String, Codable, Sendable {
  case `fan_attachment` = "fan_attachment"
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
  case `human_reply` = "human_reply"
  case `call_recording` = "call_recording"
  case `ai_audio` = "ai_audio"
}

public enum APIMediaMediaAssetState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public enum APIMediaMediaPurpose: String, Codable, Sendable {
  case `fan_attachment` = "fan_attachment"
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
  case `human_reply` = "human_reply"
  case `call_recording` = "call_recording"
  case `ai_audio` = "ai_audio"
}

public struct APIMediaMediaRevocation: Codable, Sendable {
  public let `state`: APIMediaMediaRevocationState
  public let `deletion`: APIMediaMediaRevocationDeletion
  public init(state: APIMediaMediaRevocationState, deletion: APIMediaMediaRevocationDeletion) {
    self.state = state
    self.deletion = deletion
  }
}

public enum APIMediaMediaRevocationState: String, Codable, Sendable {
  case `revoked` = "revoked"
}

public enum APIMediaMediaRevocationDeletion: String, Codable, Sendable {
  case `pending` = "pending"
}

public struct APIMediaMediaSign: Codable, Sendable {
  public let `signedActId`: String
  public let `version`: Int
  public let `idempotencyKey`: String
  public init(signedActId: String, version: Int, idempotencyKey: String) {
    self.signedActId = signedActId
    self.version = version
    self.idempotencyKey = idempotencyKey
  }
}

public enum APIMediaMediaState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public struct APIMediaProcessedMediaEvidence: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `bytes`: Int
  public let `mimeType`: APIMediaProcessedMediaEvidenceMimeType
  public let `durationMs`: Int?
  public init(assetId: String, version: Int, sha256: String, bytes: Int, mimeType: APIMediaProcessedMediaEvidenceMimeType, durationMs: Int? = nil) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.bytes = bytes
    self.mimeType = mimeType
    self.durationMs = durationMs
  }
}

public enum APIMediaProcessedMediaEvidenceMimeType: String, Codable, Sendable {
  case `audio_mp4` = "audio/mp4"
  case `image_png` = "image/png"
}

public struct APIMediaUploadRequest: Codable, Sendable {
  public let `purpose`: APIMediaUploadRequestPurpose
  public let `mimeType`: APIMediaUploadRequestMimeType
  public let `bytes`: Int
  public let `durationMs`: Int?
  public let `sha256`: String
  public let `idempotencyKey`: String
  public init(purpose: APIMediaUploadRequestPurpose, mimeType: APIMediaUploadRequestMimeType, bytes: Int, durationMs: Int? = nil, sha256: String, idempotencyKey: String) {
    self.purpose = purpose
    self.mimeType = mimeType
    self.bytes = bytes
    self.durationMs = durationMs
    self.sha256 = sha256
    self.idempotencyKey = idempotencyKey
  }
}

public enum APIMediaUploadRequestPurpose: String, Codable, Sendable {
  case `fan_attachment` = "fan_attachment"
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
  case `human_reply` = "human_reply"
  case `call_recording` = "call_recording"
  case `ai_audio` = "ai_audio"
}

public enum APIMediaUploadRequestMimeType: String, Codable, Sendable {
  case `audio_webm` = "audio/webm"
  case `audio_mp4` = "audio/mp4"
  case `audio_ogg` = "audio/ogg"
  case `audio_wav` = "audio/wav"
  case `image_jpeg` = "image/jpeg"
  case `image_png` = "image/png"
}

public enum APICallCallConsentPurpose: String, Codable, Sendable {
  case `recording` = "recording"
  case `summary` = "summary"
  case `content_reuse` = "content_reuse"
  case `ai_source` = "ai_source"
}

public struct APICallCallRevision: Codable, Sendable {
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(expectedVersion: Int, idempotencyKey: String) {
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICallCallSummaryNote: Codable, Sendable {
  public let `note`: String
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(note: String, expectedVersion: Int, idempotencyKey: String) {
    self.note = note
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICallConsentCommand: Codable, Sendable {
  public let `purpose`: APICallConsentCommandPurpose
  public let `granted`: Bool
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(purpose: APICallConsentCommandPurpose, granted: Bool, expectedVersion: Int, idempotencyKey: String) {
    self.purpose = purpose
    self.granted = granted
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public enum APICallConsentCommandPurpose: String, Codable, Sendable {
  case `recording` = "recording"
  case `summary` = "summary"
  case `content_reuse` = "content_reuse"
  case `ai_source` = "ai_source"
}

public struct APICallEndCall: Codable, Sendable {
  public let `expectedVersion`: Int
  public let `fanChoice`: APICallEndCallFanChoice?
  public let `idempotencyKey`: String
  public init(expectedVersion: Int, fanChoice: APICallEndCallFanChoice? = nil, idempotencyKey: String) {
    self.expectedVersion = expectedVersion
    self.fanChoice = fanChoice
    self.idempotencyKey = idempotencyKey
  }
}

public enum APICallEndCallFanChoice: String, Codable, Sendable {
  case `end_by_choice` = "end_by_choice"
  case `technical_problem` = "technical_problem"
}

public struct APICallOfferTimes: Codable, Sendable {
  public let `commitmentId`: String
  public let `startsAt`: [String]
  public let `creatorTimeZone`: String
  public let `fanTimeZone`: String
  public let `expiresAt`: String
  public let `expectedAuthorizationVersion`: Int
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(commitmentId: String, startsAt: [String], creatorTimeZone: String, fanTimeZone: String, expiresAt: String, expectedAuthorizationVersion: Int, signedActId: String, idempotencyKey: String) {
    self.commitmentId = commitmentId
    self.startsAt = startsAt
    self.creatorTimeZone = creatorTimeZone
    self.fanTimeZone = fanTimeZone
    self.expiresAt = expiresAt
    self.expectedAuthorizationVersion = expectedAuthorizationVersion
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICallSelectTime: Codable, Sendable {
  public let `slotId`: String
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(slotId: String, expectedVersion: Int, idempotencyKey: String) {
    self.slotId = slotId
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public enum APICallSessionOutcome: String, Codable, Sendable {
  case `completed` = "completed"
  case `partial` = "partial"
  case `creator_no_show` = "creator_no_show"
  case `fan_no_show` = "fan_no_show"
  case `technical_failure` = "technical_failure"
}

public enum APICallSessionState: String, Codable, Sendable {
  case `scheduled` = "scheduled"
  case `waiting` = "waiting"
  case `connecting` = "connecting"
  case `connected` = "connected"
  case `reconnecting` = "reconnecting"
  case `ending` = "ending"
  case `ended` = "ended"
  case `cancelled` = "cancelled"
}

public typealias APIContentAudience = APIJSONValue

public struct APIContentConsentResult: Codable, Sendable {
  public let `version`: Int
  public let `share_text`: Bool
  public let `show_handle`: Bool
  public init(version: Int, share_text: Bool, show_handle: Bool) {
    self.version = version
    self.share_text = share_text
    self.show_handle = show_handle
  }
}

public struct APIContentDocument: Codable, Sendable {
  public let `kind`: APIContentDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentDocumentQuote?
  public let `packetId`: String?
  public let `live`: APIContentDocumentLive?
  public init(kind: APIContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentDocumentQuote? = nil, packetId: String? = nil, live: APIContentDocumentLive? = nil) {
    self.kind = kind
    self.title = title
    self.text = text
    self.audience = audience
    self.media = media
    self.nameToken = nameToken
    self.showAudienceCount = showAudienceCount
    self.aiUseIntent = aiUseIntent
    self.scheduledAt = scheduledAt
    self.quote = quote
    self.packetId = packetId
    self.live = live
  }
}

public enum APIContentDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentDocumentLive: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
  }
}

public struct APIContentEffectsResult: Codable, Sendable {
  public let `processed`: Int
  public init(processed: Int) {
    self.processed = processed
  }
}

public typealias APIContentKey = String

public struct APIContentList: Codable, Sendable {
  public let `items`: [APIContentListItemsItem]
  public let `nextCursor`: String?
  public let `serverTime`: String
  public init(items: [APIContentListItemsItem], nextCursor: String? = nil, serverTime: String) {
    self.items = items
    self.nextCursor = nextCursor
    self.serverTime = serverTime
  }
}

public struct APIContentListItemsItem: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `creatorHandle`: String
  public let `teamMember`: String?
  public let `displayText`: String
  public let `version`: Int
  public let `state`: String
  public let `authorKind`: APIContentListItemsItemAuthorKind
  public let `authorLabel`: String
  public let `audienceLabel`: String
  public let `signedActId`: String?
  public let `publishedAt`: String?
  public let `document`: APIContentListItemsItemDocument
  public let `audienceCount`: Int?
  public let `sourceState`: APIContentListItemsItemSourceState
  public let `quotedText`: String?
  public let `quotedHandle`: String?
  public init(id: String, creatorId: String, creatorName: String, creatorHandle: String, teamMember: String? = nil, displayText: String, version: Int, state: String, authorKind: APIContentListItemsItemAuthorKind, authorLabel: String, audienceLabel: String, signedActId: String? = nil, publishedAt: String? = nil, document: APIContentListItemsItemDocument, audienceCount: Int? = nil, sourceState: APIContentListItemsItemSourceState, quotedText: String? = nil, quotedHandle: String? = nil) {
    self.id = id
    self.creatorId = creatorId
    self.creatorName = creatorName
    self.creatorHandle = creatorHandle
    self.teamMember = teamMember
    self.displayText = displayText
    self.version = version
    self.state = state
    self.authorKind = authorKind
    self.authorLabel = authorLabel
    self.audienceLabel = audienceLabel
    self.signedActId = signedActId
    self.publishedAt = publishedAt
    self.document = document
    self.audienceCount = audienceCount
    self.sourceState = sourceState
    self.quotedText = quotedText
    self.quotedHandle = quotedHandle
  }
}

public enum APIContentListItemsItemAuthorKind: String, Codable, Sendable {
  case `human_broadcast` = "human_broadcast"
  case `human_creator` = "human_creator"
  case `team` = "team"
}

public struct APIContentListItemsItemDocument: Codable, Sendable {
  public let `kind`: APIContentListItemsItemDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentListItemsItemDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentListItemsItemDocumentQuote?
  public let `packetId`: String?
  public let `live`: APIContentListItemsItemDocumentLive?
  public init(kind: APIContentListItemsItemDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentListItemsItemDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentListItemsItemDocumentQuote? = nil, packetId: String? = nil, live: APIContentListItemsItemDocumentLive? = nil) {
    self.kind = kind
    self.title = title
    self.text = text
    self.audience = audience
    self.media = media
    self.nameToken = nameToken
    self.showAudienceCount = showAudienceCount
    self.aiUseIntent = aiUseIntent
    self.scheduledAt = scheduledAt
    self.quote = quote
    self.packetId = packetId
    self.live = live
  }
}

public enum APIContentListItemsItemDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentListItemsItemDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentListItemsItemDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentListItemsItemDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentListItemsItemDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentListItemsItemDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentListItemsItemDocumentLive: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
  }
}

public enum APIContentListItemsItemSourceState: String, Codable, Sendable {
  case `not_requested` = "not_requested"
  case `candidate_pending` = "candidate_pending"
  case `candidate` = "candidate"
  case `revocation_pending` = "revocation_pending"
  case `revoked` = "revoked"
}

public struct APIContentLiveCatalog: Codable, Sendable {
  public let `available`: Bool
  public let `items`: [APIContentLiveCatalogItemsItem]
  public init(available: Bool, items: [APIContentLiveCatalogItemsItem]) {
    self.available = available
    self.items = items
  }
}

public struct APIContentLiveCatalogItemsItem: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public let `replayReady`: Bool
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil, replayReady: Bool) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
    self.replayReady = replayReady
  }
}

public struct APIContentMedia: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentMediaKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentMediaKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentMediaKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentMuteCommand: Codable, Sendable {
  public let `muted`: Bool
  public init(muted: Bool) {
    self.muted = muted
  }
}

public struct APIContentPage: Codable, Sendable {
  public let `cursor`: String?
  public let `limit`: Int
  public let `state`: APIContentPageState?
  public let `query`: String?
  public init(cursor: String? = nil, limit: Int, state: APIContentPageState? = nil, query: String? = nil) {
    self.cursor = cursor
    self.limit = limit
    self.state = state
    self.query = query
  }
}

public enum APIContentPageState: String, Codable, Sendable {
  case `draft` = "draft"
  case `media_pending` = "media_pending"
  case `scheduled` = "scheduled"
  case `published` = "published"
  case `unpublished` = "unpublished"
  case `archived` = "archived"
}

public struct APIContentPreference: Codable, Sendable {
  public let `accountId`: String
  public let `muted`: Bool
  public init(accountId: String, muted: Bool) {
    self.accountId = accountId
    self.muted = muted
  }
}

public struct APIContentReactionResult: Codable, Sendable {
  public let `replyId`: String
  public let `kind`: String
  public let `signedActId`: String
  public init(replyId: String, kind: String, signedActId: String) {
    self.replyId = replyId
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIContentReplyList: Codable, Sendable {
  public let `items`: [APIContentReplyListItemsItem]
  public let `nextCursor`: String?
  public init(items: [APIContentReplyListItemsItem], nextCursor: String? = nil) {
    self.items = items
    self.nextCursor = nextCursor
  }
}

public struct APIContentReplyListItemsItem: Codable, Sendable {
  public let `safetyState`: APIContentReplyListItemsItemSafetyState
  public let `safetyReviewAvailable`: Bool
  public let `read`: Bool
  public let `id`: String
  public let `contentId`: String
  public let `fanId`: String
  public let `handle`: String
  public let `text`: String
  public let `version`: Int
  public let `createdAt`: String
  public let `consent`: APIContentReplyListItemsItemConsent
  public let `reaction`: APIContentReplyListItemsItemReaction?
  public init(safetyState: APIContentReplyListItemsItemSafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, consent: APIContentReplyListItemsItemConsent, reaction: APIContentReplyListItemsItemReaction? = nil) {
    self.safetyState = safetyState
    self.safetyReviewAvailable = safetyReviewAvailable
    self.read = read
    self.id = id
    self.contentId = contentId
    self.fanId = fanId
    self.handle = handle
    self.text = text
    self.version = version
    self.createdAt = createdAt
    self.consent = consent
    self.reaction = reaction
  }
}

public enum APIContentReplyListItemsItemSafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentReplyListItemsItemConsent: Codable, Sendable {
  public let `shareText`: Bool
  public let `showHandle`: Bool
  public let `version`: Int
  public init(shareText: Bool, showHandle: Bool, version: Int) {
    self.shareText = shareText
    self.showHandle = showHandle
    self.version = version
  }
}

public struct APIContentReplyListItemsItemReaction: Codable, Sendable {
  public let `kind`: String
  public let `signedActId`: String
  public init(kind: String, signedActId: String) {
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIContentReplyPage: Codable, Sendable {
  public let `cursor`: String?
  public let `limit`: Int
  public let `filter`: APIContentReplyPageFilter
  public init(cursor: String? = nil, limit: Int, filter: APIContentReplyPageFilter) {
    self.cursor = cursor
    self.limit = limit
    self.filter = filter
  }
}

public enum APIContentReplyPageFilter: String, Codable, Sendable {
  case `all` = "all"
  case `unread` = "unread"
  case `reacted` = "reacted"
  case `flagged` = "flagged"
}

public struct APIContentReplyReadResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `read`: APIContentReplyReadResultRead
  public init(id: String, version: Int, read: APIContentReplyReadResultRead) {
    self.id = id
    self.version = version
    self.read = read
  }
}

public struct APIContentReplyReadResultRead: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIContentReplyReviewResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `safetyState`: APIContentReplyReviewResultSafetyState
  public init(id: String, version: Int, safetyState: APIContentReplyReviewResultSafetyState) {
    self.id = id
    self.version = version
    self.safetyState = safetyState
  }
}

public enum APIContentReplyReviewResultSafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `state`: String
  public let `signedActId`: String?
  public init(id: String, version: Int, state: String, signedActId: String? = nil) {
    self.id = id
    self.version = version
    self.state = state
    self.signedActId = signedActId
  }
}

public struct APIContentRevisionResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public init(id: String, version: Int) {
    self.id = id
    self.version = version
  }
}

public struct APIContentScheduledResult: Codable, Sendable {
  public let `published`: Int
  public init(published: Int) {
    self.published = published
  }
}

public typealias APIContentThanksFeed = [APIContentThanksFeedValueItem]

public struct APIContentThanksFeedValueItem: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `target_kind`: APIContentThanksFeedValueItemTargetKind
  public let `target_id`: String
  public let `text`: String
  public let `handle`: String?
  public let `created_at`: String
  public init(id: String, version: Int, target_kind: APIContentThanksFeedValueItemTargetKind, target_id: String, text: String, handle: String? = nil, created_at: String) {
    self.id = id
    self.version = version
    self.target_kind = target_kind
    self.target_id = target_id
    self.text = text
    self.handle = handle
    self.created_at = created_at
  }
}

public enum APIContentThanksFeedValueItemTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public struct APIContentThanksQuery: Codable, Sendable {
  public let `targetKind`: APIContentThanksQueryTargetKind
  public let `targetId`: String
  public init(targetKind: APIContentThanksQueryTargetKind, targetId: String) {
    self.targetKind = targetKind
    self.targetId = targetId
  }
}

public enum APIContentThanksQueryTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public typealias APIContentThanksView = APIContentThanksViewValue?

public struct APIContentThanksViewValue: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `text`: String
  public let `shareWithCreatorDigest`: Bool
  public let `showIdentity`: Bool
  public let `withdrawn`: Bool
  public init(id: String, version: Int, text: String, shareWithCreatorDigest: Bool, showIdentity: Bool, withdrawn: Bool) {
    self.id = id
    self.version = version
    self.text = text
    self.shareWithCreatorDigest = shareWithCreatorDigest
    self.showIdentity = showIdentity
    self.withdrawn = withdrawn
  }
}

public struct APIContentVersionCommand: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public init(version: Int, idempotencyKey: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIContentView: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `creatorHandle`: String
  public let `teamMember`: String?
  public let `displayText`: String
  public let `version`: Int
  public let `state`: String
  public let `authorKind`: APIContentViewAuthorKind
  public let `authorLabel`: String
  public let `audienceLabel`: String
  public let `signedActId`: String?
  public let `publishedAt`: String?
  public let `document`: APIContentViewDocument
  public let `audienceCount`: Int?
  public let `sourceState`: APIContentViewSourceState
  public let `quotedText`: String?
  public let `quotedHandle`: String?
  public init(id: String, creatorId: String, creatorName: String, creatorHandle: String, teamMember: String? = nil, displayText: String, version: Int, state: String, authorKind: APIContentViewAuthorKind, authorLabel: String, audienceLabel: String, signedActId: String? = nil, publishedAt: String? = nil, document: APIContentViewDocument, audienceCount: Int? = nil, sourceState: APIContentViewSourceState, quotedText: String? = nil, quotedHandle: String? = nil) {
    self.id = id
    self.creatorId = creatorId
    self.creatorName = creatorName
    self.creatorHandle = creatorHandle
    self.teamMember = teamMember
    self.displayText = displayText
    self.version = version
    self.state = state
    self.authorKind = authorKind
    self.authorLabel = authorLabel
    self.audienceLabel = audienceLabel
    self.signedActId = signedActId
    self.publishedAt = publishedAt
    self.document = document
    self.audienceCount = audienceCount
    self.sourceState = sourceState
    self.quotedText = quotedText
    self.quotedHandle = quotedHandle
  }
}

public enum APIContentViewAuthorKind: String, Codable, Sendable {
  case `human_broadcast` = "human_broadcast"
  case `human_creator` = "human_creator"
  case `team` = "team"
}

public struct APIContentViewDocument: Codable, Sendable {
  public let `kind`: APIContentViewDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentViewDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentViewDocumentQuote?
  public let `packetId`: String?
  public let `live`: APIContentViewDocumentLive?
  public init(kind: APIContentViewDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentViewDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentViewDocumentQuote? = nil, packetId: String? = nil, live: APIContentViewDocumentLive? = nil) {
    self.kind = kind
    self.title = title
    self.text = text
    self.audience = audience
    self.media = media
    self.nameToken = nameToken
    self.showAudienceCount = showAudienceCount
    self.aiUseIntent = aiUseIntent
    self.scheduledAt = scheduledAt
    self.quote = quote
    self.packetId = packetId
    self.live = live
  }
}

public enum APIContentViewDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentViewDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentViewDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentViewDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentViewDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentViewDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentViewDocumentLive: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
  }
}

public enum APIContentViewSourceState: String, Codable, Sendable {
  case `not_requested` = "not_requested"
  case `candidate_pending` = "candidate_pending"
  case `candidate` = "candidate"
  case `revocation_pending` = "revocation_pending"
  case `revoked` = "revoked"
}

public struct APIContentWithdrawResult: Codable, Sendable {
  public let `id`: String
  public let `withdrawn`: APIContentWithdrawResultWithdrawn
  public init(id: String, withdrawn: APIContentWithdrawResultWithdrawn) {
    self.id = id
    self.withdrawn = withdrawn
  }
}

public struct APIContentWithdrawResultWithdrawn: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIPrivateNoteReply: Codable, Sendable {
  public let `safetyState`: APIPrivateNoteReplySafetyState
  public let `safetyReviewAvailable`: Bool
  public let `read`: Bool
  public let `id`: String
  public let `contentId`: String
  public let `fanId`: String
  public let `handle`: String
  public let `text`: String
  public let `version`: Int
  public let `createdAt`: String
  public let `consent`: APIPrivateNoteReplyConsent
  public let `reaction`: APIPrivateNoteReplyReaction?
  public init(safetyState: APIPrivateNoteReplySafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, consent: APIPrivateNoteReplyConsent, reaction: APIPrivateNoteReplyReaction? = nil) {
    self.safetyState = safetyState
    self.safetyReviewAvailable = safetyReviewAvailable
    self.read = read
    self.id = id
    self.contentId = contentId
    self.fanId = fanId
    self.handle = handle
    self.text = text
    self.version = version
    self.createdAt = createdAt
    self.consent = consent
    self.reaction = reaction
  }
}

public enum APIPrivateNoteReplySafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIPrivateNoteReplyConsent: Codable, Sendable {
  public let `shareText`: Bool
  public let `showHandle`: Bool
  public let `version`: Int
  public init(shareText: Bool, showHandle: Bool, version: Int) {
    self.shareText = shareText
    self.showHandle = showHandle
    self.version = version
  }
}

public struct APIPrivateNoteReplyReaction: Codable, Sendable {
  public let `kind`: String
  public let `signedActId`: String
  public init(kind: String, signedActId: String) {
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIPublishContent: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `signedActId`: String
  public init(version: Int, idempotencyKey: String, signedActId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.signedActId = signedActId
  }
}

public struct APIQuoteConsent: Codable, Sendable {
  public let `version`: Int
  public let `shareText`: Bool
  public let `showHandle`: Bool
  public let `idempotencyKey`: String
  public init(version: Int, shareText: Bool, showHandle: Bool, idempotencyKey: String) {
    self.version = version
    self.shareText = shareText
    self.showHandle = showHandle
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIReactToReply: Codable, Sendable {
  public let `version`: Int
  public let `kind`: APIReactToReplyKind
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(version: Int, kind: APIReactToReplyKind, signedActId: String, idempotencyKey: String) {
    self.version = version
    self.kind = kind
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public enum APIReactToReplyKind: String, Codable, Sendable {
  case `heart` = "heart"
  case `thanks` = "thanks"
  case `helpful` = "helpful"
}

public struct APIReplyToNote: Codable, Sendable {
  public let `text`: String
  public let `idempotencyKey`: String
  public init(text: String, idempotencyKey: String) {
    self.text = text
    self.idempotencyKey = idempotencyKey
  }
}

public struct APISaveContent: Codable, Sendable {
  public let `id`: String
  public let `expectedVersion`: Int
  public let `document`: APISaveContentDocument
  public let `idempotencyKey`: String
  public init(id: String, expectedVersion: Int, document: APISaveContentDocument, idempotencyKey: String) {
    self.id = id
    self.expectedVersion = expectedVersion
    self.document = document
    self.idempotencyKey = idempotencyKey
  }
}

public struct APISaveContentDocument: Codable, Sendable {
  public let `kind`: APISaveContentDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APISaveContentDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APISaveContentDocumentQuote?
  public let `packetId`: String?
  public let `live`: APISaveContentDocumentLive?
  public init(kind: APISaveContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APISaveContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APISaveContentDocumentQuote? = nil, packetId: String? = nil, live: APISaveContentDocumentLive? = nil) {
    self.kind = kind
    self.title = title
    self.text = text
    self.audience = audience
    self.media = media
    self.nameToken = nameToken
    self.showAudienceCount = showAudienceCount
    self.aiUseIntent = aiUseIntent
    self.scheduledAt = scheduledAt
    self.quote = quote
    self.packetId = packetId
    self.live = live
  }
}

public enum APISaveContentDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APISaveContentDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APISaveContentDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APISaveContentDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APISaveContentDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APISaveContentDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APISaveContentDocumentLive: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
  }
}

public struct APIThanksCommand: Codable, Sendable {
  public let `targetKind`: APIThanksCommandTargetKind
  public let `targetId`: String
  public let `text`: String
  public let `shareWithCreatorDigest`: Bool
  public let `showIdentity`: Bool
  public let `withdrawn`: Bool
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(targetKind: APIThanksCommandTargetKind, targetId: String, text: String, shareWithCreatorDigest: Bool, showIdentity: Bool, withdrawn: Bool, expectedVersion: Int, idempotencyKey: String) {
    self.targetKind = targetKind
    self.targetId = targetId
    self.text = text
    self.shareWithCreatorDigest = shareWithCreatorDigest
    self.showIdentity = showIdentity
    self.withdrawn = withdrawn
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public enum APIThanksCommandTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public struct APIStudioInvite: Codable, Sendable {
  public let `handle`: String
  public let `roles`: [APIStudioInviteRolesItem]
  public init(handle: String, roles: [APIStudioInviteRolesItem]) {
    self.handle = handle
    self.roles = roles
  }
}

public enum APIStudioInviteRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioQueueQuery: Codable, Sendable {
  public let `cursor`: String?
  public let `filter`: APIStudioQueueQueryFilter
  public let `limit`: Int
  public init(cursor: String? = nil, filter: APIStudioQueueQueryFilter, limit: Int) {
    self.cursor = cursor
    self.filter = filter
    self.limit = limit
  }
}

public enum APIStudioQueueQueryFilter: String, Codable, Sendable {
  case `all` = "all"
  case `due` = "due"
  case `decide` = "decide"
  case `more_info` = "more_info"
}

public struct APIStudioSaveReplyDraft: Codable, Sendable {
  public let `text`: String
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(text: String, expectedVersion: Int, idempotencyKey: String) {
    self.text = text
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIStudioSendReplyDraft: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `signedActId`: String
  public init(version: Int, idempotencyKey: String, signedActId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.signedActId = signedActId
  }
}

public struct APIStudioCorrection: Codable, Sendable {
  public let `idempotencyKey`: String
  public let `expectedRevision`: Int
  public let `paraphrasedPrompt`: String
  public let `rule`: String
  public let `unacceptableAnswer`: String
  public init(idempotencyKey: String, expectedRevision: Int, paraphrasedPrompt: String, rule: String, unacceptableAnswer: String) {
    self.idempotencyKey = idempotencyKey
    self.expectedRevision = expectedRevision
    self.paraphrasedPrompt = paraphrasedPrompt
    self.rule = rule
    self.unacceptableAnswer = unacceptableAnswer
  }
}

public struct APIStudioRevision: Codable, Sendable {
  public let `revision`: Int
  public init(revision: Int) {
    self.revision = revision
  }
}

public struct APIStudioDraftVersion: Codable, Sendable {
  public let `version`: Int
  public init(version: Int) {
    self.version = version
  }
}

public struct APIStudioReplyDraft: Codable, Sendable {
  public let `text`: String
  public let `version`: Int
  public let `sentMessageId`: String?
  public init(text: String, version: Int, sentMessageId: String? = nil) {
    self.text = text
    self.version = version
    self.sentMessageId = sentMessageId
  }
}

public struct APIStudioSession: Codable, Sendable {
  public let `creators`: [APIStudioSessionCreatorsItem]
  public let `invitations`: [APIStudioSessionInvitationsItem]
  public let `serverTime`: String
  public init(creators: [APIStudioSessionCreatorsItem], invitations: [APIStudioSessionInvitationsItem], serverTime: String) {
    self.creators = creators
    self.invitations = invitations
    self.serverTime = serverTime
  }
}

public struct APIStudioSessionCreatorsItem: Codable, Sendable {
  public let `id`: String
  public let `display_name`: String
  public let `handle`: String
  public let `verification`: String
  public let `owned`: Bool
  public let `roles`: [APIStudioSessionCreatorsItemRolesItem]
  public let `memberHandle`: String?
  public let `viewerAccountId`: String
  public init(id: String, display_name: String, handle: String, verification: String, owned: Bool, roles: [APIStudioSessionCreatorsItemRolesItem], memberHandle: String? = nil, viewerAccountId: String) {
    self.id = id
    self.display_name = display_name
    self.handle = handle
    self.verification = verification
    self.owned = owned
    self.roles = roles
    self.memberHandle = memberHandle
    self.viewerAccountId = viewerAccountId
  }
}

public enum APIStudioSessionCreatorsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioSessionInvitationsItem: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `roles`: [APIStudioSessionInvitationsItemRolesItem]
  public let `expiresAt`: String
  public init(id: String, creatorId: String, creatorName: String, roles: [APIStudioSessionInvitationsItemRolesItem], expiresAt: String) {
    self.id = id
    self.creatorId = creatorId
    self.creatorName = creatorName
    self.roles = roles
    self.expiresAt = expiresAt
  }
}

public enum APIStudioSessionInvitationsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioAudiences: Codable, Sendable {
  public let `audienceCountsAvailable`: Bool
  public let `tiers`: [APIStudioAudiencesTiersItem]
  public let `groups`: [APIStudioAudiencesGroupsItem]
  public init(audienceCountsAvailable: Bool, tiers: [APIStudioAudiencesTiersItem], groups: [APIStudioAudiencesGroupsItem]) {
    self.audienceCountsAvailable = audienceCountsAvailable
    self.tiers = tiers
    self.groups = groups
  }
}

public struct APIStudioAudiencesTiersItem: Codable, Sendable {
  public let `id`: String
  public let `name`: String
  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public struct APIStudioAudiencesGroupsItem: Codable, Sendable {
  public let `id`: String
  public let `name`: String
  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public struct APIStudioInvitation: Codable, Sendable {
  public let `id`: String
  public let `roles`: [APIStudioInvitationRolesItem]
  public let `creatorId`: String?
  public let `accountId`: String?
  public let `expiresAt`: String?
  public let `accepted`: Bool?
  public init(id: String, roles: [APIStudioInvitationRolesItem], creatorId: String? = nil, accountId: String? = nil, expiresAt: String? = nil, accepted: Bool? = nil) {
    self.id = id
    self.roles = roles
    self.creatorId = creatorId
    self.accountId = accountId
    self.expiresAt = expiresAt
    self.accepted = accepted
  }
}

public enum APIStudioInvitationRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public typealias APIStudioCommerceProjection = APIJSONValue

public struct APIStudioTeam: Codable, Sendable {
  public let `members`: [APIStudioTeamMembersItem]
  public let `invitations`: [APIStudioTeamInvitationsItem]
  public init(members: [APIStudioTeamMembersItem], invitations: [APIStudioTeamInvitationsItem]) {
    self.members = members
    self.invitations = invitations
  }
}

public struct APIStudioTeamMembersItem: Codable, Sendable {
  public let `account_id`: String
  public let `roles`: [APIStudioTeamMembersItemRolesItem]
  public let `revoked_at`: String?
  public let `handle`: String?
  public init(account_id: String, roles: [APIStudioTeamMembersItemRolesItem], revoked_at: String? = nil, handle: String? = nil) {
    self.account_id = account_id
    self.roles = roles
    self.revoked_at = revoked_at
    self.handle = handle
  }
}

public enum APIStudioTeamMembersItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioTeamInvitationsItem: Codable, Sendable {
  public let `id`: String
  public let `account_id`: String
  public let `handle`: String?
  public let `roles`: [APIStudioTeamInvitationsItemRolesItem]
  public let `expires_at`: String
  public let `accepted_at`: String?
  public let `revoked_at`: String?
  public init(id: String, account_id: String, handle: String? = nil, roles: [APIStudioTeamInvitationsItemRolesItem], expires_at: String, accepted_at: String? = nil, revoked_at: String? = nil) {
    self.id = id
    self.account_id = account_id
    self.handle = handle
    self.roles = roles
    self.expires_at = expires_at
    self.accepted_at = accepted_at
    self.revoked_at = revoked_at
  }
}

public enum APIStudioTeamInvitationsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioControlCommand: Codable, Sendable {
  public let `idempotencyKey`: String
  public init(idempotencyKey: String) {
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIStudioThreadEntries: Codable, Sendable {
  public let `items`: [APIStudioThreadEntriesItemsItem]
  public let `nextCursor`: String?
  public let `coverage`: APIStudioThreadEntriesCoverage
  public init(items: [APIStudioThreadEntriesItemsItem], nextCursor: String? = nil, coverage: APIStudioThreadEntriesCoverage) {
    self.items = items
    self.nextCursor = nextCursor
    self.coverage = coverage
  }
}

public struct APIStudioThreadEntriesItemsItem: Codable, Sendable {
  public let `fanId`: String
  public let `handle`: String
  public let `sources`: [APIStudioThreadEntriesItemsItemSourcesItem]
  public let `updatedAt`: String
  public init(fanId: String, handle: String, sources: [APIStudioThreadEntriesItemsItemSourcesItem], updatedAt: String) {
    self.fanId = fanId
    self.handle = handle
    self.sources = sources
    self.updatedAt = updatedAt
  }
}

public enum APIStudioThreadEntriesItemsItemSourcesItem: String, Codable, Sendable {
  case `note_reply` = "note_reply"
  case `request` = "request"
}

public enum APIStudioThreadEntriesCoverage: String, Codable, Sendable {
  case `notes_and_requests` = "notes_and_requests"
}

public struct APIContentReview: Codable, Sendable {
  public let `command`: APIContentReviewCommand
  public let `view`: APIContentReviewView
  public init(command: APIContentReviewCommand, view: APIContentReviewView) {
    self.command = command
    self.view = view
  }
}

public struct APIContentReviewCommand: Codable, Sendable {
  public let `actType`: APIContentReviewCommandActType
  public let `subjectId`: String
  public let `content`: APIJSONValue
  public init(actType: APIContentReviewCommandActType, subjectId: String, content: APIJSONValue) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APIContentReviewCommandActType: String, Codable, Sendable {
  case `reply` = "reply"
  case `approved_draft` = "approved_draft"
  case `broadcast` = "broadcast"
  case `reaction` = "reaction"
  case `accept` = "accept"
  case `correction` = "correction"
}

public struct APIContentReviewView: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `creatorHandle`: String
  public let `teamMember`: String?
  public let `displayText`: String
  public let `version`: Int
  public let `state`: String
  public let `authorKind`: APIContentReviewViewAuthorKind
  public let `authorLabel`: String
  public let `audienceLabel`: String
  public let `signedActId`: String?
  public let `publishedAt`: String?
  public let `document`: APIContentReviewViewDocument
  public let `audienceCount`: Int?
  public let `sourceState`: APIContentReviewViewSourceState
  public let `quotedText`: String?
  public let `quotedHandle`: String?
  public init(id: String, creatorId: String, creatorName: String, creatorHandle: String, teamMember: String? = nil, displayText: String, version: Int, state: String, authorKind: APIContentReviewViewAuthorKind, authorLabel: String, audienceLabel: String, signedActId: String? = nil, publishedAt: String? = nil, document: APIContentReviewViewDocument, audienceCount: Int? = nil, sourceState: APIContentReviewViewSourceState, quotedText: String? = nil, quotedHandle: String? = nil) {
    self.id = id
    self.creatorId = creatorId
    self.creatorName = creatorName
    self.creatorHandle = creatorHandle
    self.teamMember = teamMember
    self.displayText = displayText
    self.version = version
    self.state = state
    self.authorKind = authorKind
    self.authorLabel = authorLabel
    self.audienceLabel = audienceLabel
    self.signedActId = signedActId
    self.publishedAt = publishedAt
    self.document = document
    self.audienceCount = audienceCount
    self.sourceState = sourceState
    self.quotedText = quotedText
    self.quotedHandle = quotedHandle
  }
}

public enum APIContentReviewViewAuthorKind: String, Codable, Sendable {
  case `human_broadcast` = "human_broadcast"
  case `human_creator` = "human_creator"
  case `team` = "team"
}

public struct APIContentReviewViewDocument: Codable, Sendable {
  public let `kind`: APIContentReviewViewDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentReviewViewDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentReviewViewDocumentQuote?
  public let `packetId`: String?
  public let `live`: APIContentReviewViewDocumentLive?
  public init(kind: APIContentReviewViewDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentReviewViewDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentReviewViewDocumentQuote? = nil, packetId: String? = nil, live: APIContentReviewViewDocumentLive? = nil) {
    self.kind = kind
    self.title = title
    self.text = text
    self.audience = audience
    self.media = media
    self.nameToken = nameToken
    self.showAudienceCount = showAudienceCount
    self.aiUseIntent = aiUseIntent
    self.scheduledAt = scheduledAt
    self.quote = quote
    self.packetId = packetId
    self.live = live
  }
}

public enum APIContentReviewViewDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentReviewViewDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentReviewViewDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentReviewViewDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentReviewViewDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentReviewViewDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentReviewViewDocumentLive: Codable, Sendable {
  public let `sessionId`: String
  public let `startsAt`: String
  public let `endsAt`: String
  public let `replayContentId`: String?
  public init(sessionId: String, startsAt: String, endsAt: String, replayContentId: String? = nil) {
    self.sessionId = sessionId
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.replayContentId = replayContentId
  }
}

public enum APIContentReviewViewSourceState: String, Codable, Sendable {
  case `not_requested` = "not_requested"
  case `candidate_pending` = "candidate_pending"
  case `candidate` = "candidate"
  case `revocation_pending` = "revocation_pending"
  case `revoked` = "revoked"
}

public struct APIConsentEnvelope: Codable, Sendable {
  public let `id`: String
  public let `schemaVersion`: Double
  public let `actorAccountId`: String
  public let `occurredAt`: String
  public let `purpose`: String
  public let `policyVersion`: String
  public let `decision`: APIConsentEnvelopeDecision
  public let `scope`: APIConsentEnvelopeScope
  public init(id: String, schemaVersion: Double, actorAccountId: String, occurredAt: String, purpose: String, policyVersion: String, decision: APIConsentEnvelopeDecision, scope: APIConsentEnvelopeScope) {
    self.id = id
    self.schemaVersion = schemaVersion
    self.actorAccountId = actorAccountId
    self.occurredAt = occurredAt
    self.purpose = purpose
    self.policyVersion = policyVersion
    self.decision = decision
    self.scope = scope
  }
}

public enum APIConsentEnvelopeDecision: String, Codable, Sendable {
  case `grant` = "grant"
  case `withdraw` = "withdraw"
}

public struct APIConsentEnvelopeScope: Codable, Sendable {
  public let `creatorId`: String?
  public let `threadId`: String?
  public let `subjectId`: String?
  public init(creatorId: String? = nil, threadId: String? = nil, subjectId: String? = nil) {
    self.creatorId = creatorId
    self.threadId = threadId
    self.subjectId = subjectId
  }
}

public struct APICompleteIdentity: Codable, Sendable {
  public let `continuationId`: String
  public let `code`: String
  public let `state`: String?
  public init(continuationId: String, code: String, state: String? = nil) {
    self.continuationId = continuationId
    self.code = code
    self.state = state
  }
}

public struct APIFanProfileInput: Codable, Sendable {
  public let `handle`: String
  public let `intro`: String
  public init(handle: String, intro: String) {
    self.handle = handle
    self.intro = intro
  }
}

public struct APIFanProfile: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `intro`: String
  public let `version`: Int
  public init(id: String, handle: String, intro: String, version: Int) {
    self.id = id
    self.handle = handle
    self.intro = intro
    self.version = version
  }
}

public struct APICreatorProfileInput: Codable, Sendable {
  public let `handle`: String
  public let `displayName`: String
  public init(handle: String, displayName: String) {
    self.handle = handle
    self.displayName = displayName
  }
}

public struct APICreatorProfile: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `displayName`: String
  public let `verification`: APICreatorProfileVerification
  public let `version`: Int
  public init(id: String, handle: String, displayName: String, verification: APICreatorProfileVerification, version: Int) {
    self.id = id
    self.handle = handle
    self.displayName = displayName
    self.verification = verification
    self.version = version
  }
}

public enum APICreatorProfileVerification: String, Codable, Sendable {
  case `pending` = "pending"
  case `verified` = "verified"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
}

public struct APISession: Codable, Sendable {
  public let `accountId`: String
  public let `adultEligible`: APISessionAdultEligible
  public let `sessionId`: String
  public let `expiresAt`: String
  public let `mode`: APISessionMode
  public let `fan`: APISessionFan?
  public let `creator`: APISessionCreator?
  public let `teams`: [APISessionTeamsItem]
  public init(accountId: String, adultEligible: APISessionAdultEligible, sessionId: String, expiresAt: String, mode: APISessionMode, fan: APISessionFan? = nil, creator: APISessionCreator? = nil, teams: [APISessionTeamsItem]) {
    self.accountId = accountId
    self.adultEligible = adultEligible
    self.sessionId = sessionId
    self.expiresAt = expiresAt
    self.mode = mode
    self.fan = fan
    self.creator = creator
    self.teams = teams
  }
}

public struct APISessionAdultEligible: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public enum APISessionMode: String, Codable, Sendable {
  case `development` = "development"
  case `pantopus` = "pantopus"
}

public struct APISessionFan: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `intro`: String
  public let `version`: Int
  public init(id: String, handle: String, intro: String, version: Int) {
    self.id = id
    self.handle = handle
    self.intro = intro
    self.version = version
  }
}

public struct APISessionCreator: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `displayName`: String
  public let `verification`: APISessionCreatorVerification
  public let `version`: Int
  public init(id: String, handle: String, displayName: String, verification: APISessionCreatorVerification, version: Int) {
    self.id = id
    self.handle = handle
    self.displayName = displayName
    self.verification = verification
    self.version = version
  }
}

public enum APISessionCreatorVerification: String, Codable, Sendable {
  case `pending` = "pending"
  case `verified` = "verified"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
}

public struct APISessionTeamsItem: Codable, Sendable {
  public let `creatorId`: String
  public let `roles`: [APISessionTeamsItemRolesItem]
  public init(creatorId: String, roles: [APISessionTeamsItemRolesItem]) {
    self.creatorId = creatorId
    self.roles = roles
  }
}

public enum APISessionTeamsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIIdentityCompletion: Codable, Sendable {
  public let `token`: String
  public let `returnTo`: String
  public let `session`: APIIdentityCompletionSession
  public init(token: String, returnTo: String, session: APIIdentityCompletionSession) {
    self.token = token
    self.returnTo = returnTo
    self.session = session
  }
}

public struct APIIdentityCompletionSession: Codable, Sendable {
  public let `accountId`: String
  public let `adultEligible`: APIIdentityCompletionSessionAdultEligible
  public let `sessionId`: String
  public let `expiresAt`: String
  public let `mode`: APIIdentityCompletionSessionMode
  public let `fan`: APIIdentityCompletionSessionFan?
  public let `creator`: APIIdentityCompletionSessionCreator?
  public let `teams`: [APIIdentityCompletionSessionTeamsItem]
  public init(accountId: String, adultEligible: APIIdentityCompletionSessionAdultEligible, sessionId: String, expiresAt: String, mode: APIIdentityCompletionSessionMode, fan: APIIdentityCompletionSessionFan? = nil, creator: APIIdentityCompletionSessionCreator? = nil, teams: [APIIdentityCompletionSessionTeamsItem]) {
    self.accountId = accountId
    self.adultEligible = adultEligible
    self.sessionId = sessionId
    self.expiresAt = expiresAt
    self.mode = mode
    self.fan = fan
    self.creator = creator
    self.teams = teams
  }
}

public struct APIIdentityCompletionSessionAdultEligible: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public enum APIIdentityCompletionSessionMode: String, Codable, Sendable {
  case `development` = "development"
  case `pantopus` = "pantopus"
}

public struct APIIdentityCompletionSessionFan: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `intro`: String
  public let `version`: Int
  public init(id: String, handle: String, intro: String, version: Int) {
    self.id = id
    self.handle = handle
    self.intro = intro
    self.version = version
  }
}

public struct APIIdentityCompletionSessionCreator: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `displayName`: String
  public let `verification`: APIIdentityCompletionSessionCreatorVerification
  public let `version`: Int
  public init(id: String, handle: String, displayName: String, verification: APIIdentityCompletionSessionCreatorVerification, version: Int) {
    self.id = id
    self.handle = handle
    self.displayName = displayName
    self.verification = verification
    self.version = version
  }
}

public enum APIIdentityCompletionSessionCreatorVerification: String, Codable, Sendable {
  case `pending` = "pending"
  case `verified` = "verified"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
}

public struct APIIdentityCompletionSessionTeamsItem: Codable, Sendable {
  public let `creatorId`: String
  public let `roles`: [APIIdentityCompletionSessionTeamsItemRolesItem]
  public init(creatorId: String, roles: [APIIdentityCompletionSessionTeamsItemRolesItem]) {
    self.creatorId = creatorId
    self.roles = roles
  }
}

public enum APIIdentityCompletionSessionTeamsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APISessionToken: Codable, Sendable {
  public let `token`: String
  public let `expiresAt`: String
  public init(token: String, expiresAt: String) {
    self.token = token
    self.expiresAt = expiresAt
  }
}

public struct APIDone: Codable, Sendable {
  public let `done`: APIDoneDone
  public init(done: APIDoneDone) {
    self.done = done
  }
}

public struct APIDoneDone: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIProofInput: Codable, Sendable {
  public let `platform`: APIProofInputPlatform
  public let `accountUrl`: String
  public init(platform: APIProofInputPlatform, accountUrl: String) {
    self.platform = platform
    self.accountUrl = accountUrl
  }
}

public enum APIProofInputPlatform: String, Codable, Sendable {
  case `instagram` = "instagram"
  case `youtube` = "youtube"
}

public struct APIProofSubmit: Codable, Sendable {
  public let `postUrl`: String
  public init(postUrl: String) {
    self.postUrl = postUrl
  }
}

public struct APIProof: Codable, Sendable {
  public let `id`: String
  public let `code`: String
  public let `platform`: APIProofPlatform
  public let `accountUrl`: String
  public let `expiresAt`: String
  public let `state`: APIProofState
  public let `reason`: String?
  public init(id: String, code: String, platform: APIProofPlatform, accountUrl: String, expiresAt: String, state: APIProofState, reason: String? = nil) {
    self.id = id
    self.code = code
    self.platform = platform
    self.accountUrl = accountUrl
    self.expiresAt = expiresAt
    self.state = state
    self.reason = reason
  }
}

public enum APIProofPlatform: String, Codable, Sendable {
  case `instagram` = "instagram"
  case `youtube` = "youtube"
}

public enum APIProofState: String, Codable, Sendable {
  case `challenge` = "challenge"
  case `pending` = "pending"
  case `approved` = "approved"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
}

public struct APITeamInvite: Codable, Sendable {
  public let `accountId`: String
  public let `roles`: [APITeamInviteRolesItem]
  public init(accountId: String, roles: [APITeamInviteRolesItem]) {
    self.accountId = accountId
    self.roles = roles
  }
}

public enum APITeamInviteRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APITeamInvitation: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `accountId`: String
  public let `roles`: [APITeamInvitationRolesItem]
  public let `expiresAt`: String
  public let `accepted`: Bool
  public init(id: String, creatorId: String, accountId: String, roles: [APITeamInvitationRolesItem], expiresAt: String, accepted: Bool) {
    self.id = id
    self.creatorId = creatorId
    self.accountId = accountId
    self.roles = roles
    self.expiresAt = expiresAt
    self.accepted = accepted
  }
}

public enum APITeamInvitationRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIPasskeyOptions: Codable, Sendable {
  public let `challengeId`: String
  public let `options`: APIJSONValue
  public init(challengeId: String, options: APIJSONValue) {
    self.challengeId = challengeId
    self.options = options
  }
}

public struct APIPasskeyRegistration: Codable, Sendable {
  public let `challengeId`: String
  public let `credential`: APIJSONValue
  public init(challengeId: String, credential: APIJSONValue) {
    self.challengeId = challengeId
    self.credential = credential
  }
}

public struct APIPasskeyRevocation: Codable, Sendable {
  public let `credentialId`: String
  public init(credentialId: String) {
    self.credentialId = credentialId
  }
}

public struct APIPasskeys: Codable, Sendable {
  public let `credentials`: [APIPasskeysCredentialsItem]
  public let `recoveryRequired`: Bool
  public init(credentials: [APIPasskeysCredentialsItem], recoveryRequired: Bool) {
    self.credentials = credentials
    self.recoveryRequired = recoveryRequired
  }
}

public struct APIPasskeysCredentialsItem: Codable, Sendable {
  public let `id`: String
  public let `createdAt`: String
  public let `revoked`: Bool
  public init(id: String, createdAt: String, revoked: Bool) {
    self.id = id
    self.createdAt = createdAt
    self.revoked = revoked
  }
}

public struct APIPublicSignature: Codable, Sendable {
  public let `signedActId`: String
  public let `creatorName`: String
  public let `actType`: String
  public let `contentHash`: String
  public let `verifiedAt`: String
  public let `status`: APIPublicSignatureStatus
  public let `content`: APIJSONValue?
  public let `contentAvailable`: Bool
  public let `explanation`: String
  public init(signedActId: String, creatorName: String, actType: String, contentHash: String, verifiedAt: String, status: APIPublicSignatureStatus, content: APIJSONValue? = nil, contentAvailable: Bool, explanation: String) {
    self.signedActId = signedActId
    self.creatorName = creatorName
    self.actType = actType
    self.contentHash = contentHash
    self.verifiedAt = verifiedAt
    self.status = status
    self.content = content
    self.contentAvailable = contentAvailable
    self.explanation = explanation
  }
}

public enum APIPublicSignatureStatus: String, Codable, Sendable {
  case `valid` = "valid"
  case `key_revoked` = "key_revoked"
  case `creator_revoked` = "creator_revoked"
  case `withdrawn` = "withdrawn"
}

public enum APIAuthorKind: String, Codable, Sendable {
  case `fan` = "fan"
  case `ai` = "ai"
  case `approved_draft` = "approved_draft"
  case `human_creator` = "human_creator"
  case `human_call` = "human_call"
  case `human_broadcast` = "human_broadcast"
  case `human_reaction` = "human_reaction"
  case `team` = "team"
  case `system` = "system"
}

public enum APIThreadControl: String, Codable, Sendable {
  case `ai_active` = "ai_active"
  case `human_active` = "human_active"
  case `ai_paused` = "ai_paused"
  case `closed` = "closed"
  case `blocked` = "blocked"
}

public struct APISendMessage: Codable, Sendable {
  public let `text`: String
  public let `idempotencyKey`: String
  public let `clientSequence`: Int
  public init(text: String, idempotencyKey: String, clientSequence: Int) {
    self.text = text
    self.idempotencyKey = idempotencyKey
    self.clientSequence = clientSequence
  }
}

public struct APIHumanReply: Codable, Sendable {
  public let `text`: String
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(text: String, signedActId: String, idempotencyKey: String) {
    self.text = text
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIControlCommand: Codable, Sendable {
  public let `idempotencyKey`: String
  public init(idempotencyKey: String) {
    self.idempotencyKey = idempotencyKey
  }
}

public struct APISignedActCommand: Codable, Sendable {
  public let `actType`: APISignedActCommandActType
  public let `subjectId`: String
  public let `content`: APIJSONValue
  public init(actType: APISignedActCommandActType, subjectId: String, content: APIJSONValue) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APISignedActCommandActType: String, Codable, Sendable {
  case `reply` = "reply"
  case `approved_draft` = "approved_draft"
  case `broadcast` = "broadcast"
  case `reaction` = "reaction"
  case `accept` = "accept"
  case `correction` = "correction"
}

public struct APIBeginSignedAct: Codable, Sendable {
  public let `fanId`: String?
  public let `command`: APIBeginSignedActCommand
  public init(fanId: String? = nil, command: APIBeginSignedActCommand) {
    self.fanId = fanId
    self.command = command
  }
}

public struct APIBeginSignedActCommand: Codable, Sendable {
  public let `actType`: APIBeginSignedActCommandActType
  public let `subjectId`: String
  public let `content`: APIJSONValue
  public init(actType: APIBeginSignedActCommandActType, subjectId: String, content: APIJSONValue) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APIBeginSignedActCommandActType: String, Codable, Sendable {
  case `reply` = "reply"
  case `approved_draft` = "approved_draft"
  case `broadcast` = "broadcast"
  case `reaction` = "reaction"
  case `accept` = "accept"
  case `correction` = "correction"
}

public struct APIIdentityContinue: Codable, Sendable {
  public let `returnTo`: String
  public init(returnTo: String) {
    self.returnTo = returnTo
  }
}

public struct APIIdentityRedirect: Codable, Sendable {
  public let `redirectUrl`: String
  public let `continuationId`: String?
  public init(redirectUrl: String, continuationId: String? = nil) {
    self.redirectUrl = redirectUrl
    self.continuationId = continuationId
  }
}

public struct APIIdentityCapabilities: Codable, Sendable {
  public let `signInAvailable`: Bool
  public let `localAccountsAllowed`: APIIdentityCapabilitiesLocalAccountsAllowed
  public let `mode`: APIIdentityCapabilitiesMode?
  public let `developmentActors`: [APIIdentityCapabilitiesDevelopmentActorsItem]?
  public init(signInAvailable: Bool, localAccountsAllowed: APIIdentityCapabilitiesLocalAccountsAllowed, mode: APIIdentityCapabilitiesMode? = nil, developmentActors: [APIIdentityCapabilitiesDevelopmentActorsItem]? = nil) {
    self.signInAvailable = signInAvailable
    self.localAccountsAllowed = localAccountsAllowed
    self.mode = mode
    self.developmentActors = developmentActors
  }
}

public struct APIIdentityCapabilitiesLocalAccountsAllowed: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public enum APIIdentityCapabilitiesMode: String, Codable, Sendable {
  case `development` = "development"
  case `pantopus` = "pantopus"
  case `unconfigured` = "unconfigured"
}

public struct APIIdentityCapabilitiesDevelopmentActorsItem: Codable, Sendable {
  public let `id`: String
  public let `label`: String
  public init(id: String, label: String) {
    self.id = id
    self.label = label
  }
}

public struct APISignedChallenge: Codable, Sendable {
  public let `challengeId`: String
  public let `publicKey`: APISignedChallengePublicKey
  public init(challengeId: String, publicKey: APISignedChallengePublicKey) {
    self.challengeId = challengeId
    self.publicKey = publicKey
  }
}

public struct APISignedChallengePublicKey: Codable, Sendable {
  public let `challenge`: String
  public let `rpId`: String
  public let `timeout`: Int
  public let `userVerification`: APISignedChallengePublicKeyUserVerification
  public let `allowCredentials`: [APISignedChallengePublicKeyAllowCredentialsItem]
  public init(challenge: String, rpId: String, timeout: Int, userVerification: APISignedChallengePublicKeyUserVerification, allowCredentials: [APISignedChallengePublicKeyAllowCredentialsItem]) {
    self.challenge = challenge
    self.rpId = rpId
    self.timeout = timeout
    self.userVerification = userVerification
    self.allowCredentials = allowCredentials
  }
}

public enum APISignedChallengePublicKeyUserVerification: String, Codable, Sendable {
  case `required` = "required"
}

public struct APISignedChallengePublicKeyAllowCredentialsItem: Codable, Sendable {
  public let `id`: String
  public let `type`: APISignedChallengePublicKeyAllowCredentialsItemType
  public init(id: String, type: APISignedChallengePublicKeyAllowCredentialsItemType) {
    self.id = id
    self.type = type
  }
}

public enum APISignedChallengePublicKeyAllowCredentialsItemType: String, Codable, Sendable {
  case `public_key` = "public-key"
}

public struct APIVerifySignedAct: Codable, Sendable {
  public let `challengeId`: String
  public let `assertion`: APIVerifySignedActAssertion
  public init(challengeId: String, assertion: APIVerifySignedActAssertion) {
    self.challengeId = challengeId
    self.assertion = assertion
  }
}

public struct APIVerifySignedActAssertion: Codable, Sendable {
  public let `id`: String
  public let `rawId`: String
  public let `type`: APIVerifySignedActAssertionType
  public let `response`: APIVerifySignedActAssertionResponse
  public let `clientExtensionResults`: [String: APIJSONValue]
  public let `authenticatorAttachment`: APIVerifySignedActAssertionAuthenticatorAttachment?
  public init(id: String, rawId: String, type: APIVerifySignedActAssertionType, response: APIVerifySignedActAssertionResponse, clientExtensionResults: [String: APIJSONValue], authenticatorAttachment: APIVerifySignedActAssertionAuthenticatorAttachment? = nil) {
    self.id = id
    self.rawId = rawId
    self.type = type
    self.response = response
    self.clientExtensionResults = clientExtensionResults
    self.authenticatorAttachment = authenticatorAttachment
  }
}

public enum APIVerifySignedActAssertionType: String, Codable, Sendable {
  case `public_key` = "public-key"
}

public struct APIVerifySignedActAssertionResponse: Codable, Sendable {
  public let `clientDataJSON`: String
  public let `authenticatorData`: String
  public let `signature`: String
  public let `userHandle`: String?
  public init(clientDataJSON: String, authenticatorData: String, signature: String, userHandle: String? = nil) {
    self.clientDataJSON = clientDataJSON
    self.authenticatorData = authenticatorData
    self.signature = signature
    self.userHandle = userHandle
  }
}

public enum APIVerifySignedActAssertionAuthenticatorAttachment: String, Codable, Sendable {
  case `platform` = "platform"
  case `cross_platform` = "cross-platform"
}

public struct APISignedActResult: Codable, Sendable {
  public let `signedActId`: String
  public init(signedActId: String) {
    self.signedActId = signedActId
  }
}

public struct APIError: Codable, Sendable {
  public let `error`: APIErrorError
  public init(error: APIErrorError) {
    self.error = error
  }
}

public struct APIErrorError: Codable, Sendable {
  public let `code`: String
  public let `message`: String
  public let `requestId`: String
  public init(code: String, message: String, requestId: String) {
    self.code = code
    self.message = message
    self.requestId = requestId
  }
}

public struct APIHealth: Codable, Sendable {
  public let `status`: APIHealthStatus
  public let `ready`: Bool
  public let `identity`: APIHealthIdentity
  public let `database`: APIHealthDatabase
  public let `featureEnabled`: Bool
  public init(status: APIHealthStatus, ready: Bool, identity: APIHealthIdentity, database: APIHealthDatabase, featureEnabled: Bool) {
    self.status = status
    self.ready = ready
    self.identity = identity
    self.database = database
    self.featureEnabled = featureEnabled
  }
}

public enum APIHealthStatus: String, Codable, Sendable {
  case `ok` = "ok"
}

public enum APIHealthIdentity: String, Codable, Sendable {
  case `configured` = "configured"
  case `unconfigured` = "unconfigured"
}

public enum APIHealthDatabase: String, Codable, Sendable {
  case `configured` = "configured"
  case `unconfigured` = "unconfigured"
}

public struct APIMessage: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIMessageAuthorKind
  public let `text`: String
  public let `deliveryState`: APIMessageDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public init(id: String, threadId: String, authorKind: APIMessageAuthorKind, text: String, deliveryState: APIMessageDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil) {
    self.id = id
    self.threadId = threadId
    self.authorKind = authorKind
    self.text = text
    self.deliveryState = deliveryState
    self.controlEpoch = controlEpoch
    self.sequence = sequence
    self.signedActId = signedActId
    self.member = member
    self.authorAccountId = authorAccountId
  }
}

public enum APIMessageAuthorKind: String, Codable, Sendable {
  case `fan` = "fan"
  case `ai` = "ai"
  case `approved_draft` = "approved_draft"
  case `human_creator` = "human_creator"
  case `human_call` = "human_call"
  case `human_broadcast` = "human_broadcast"
  case `human_reaction` = "human_reaction"
  case `team` = "team"
  case `system` = "system"
}

public enum APIMessageDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct APIAcceptedMessage: Codable, Sendable {
  public let `message`: APIAcceptedMessageMessage
  public let `generationId`: String
  public init(message: APIAcceptedMessageMessage, generationId: String) {
    self.message = message
    self.generationId = generationId
  }
}

public struct APIAcceptedMessageMessage: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIAcceptedMessageMessageAuthorKind
  public let `text`: String
  public let `deliveryState`: APIAcceptedMessageMessageDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public init(id: String, threadId: String, authorKind: APIAcceptedMessageMessageAuthorKind, text: String, deliveryState: APIAcceptedMessageMessageDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil) {
    self.id = id
    self.threadId = threadId
    self.authorKind = authorKind
    self.text = text
    self.deliveryState = deliveryState
    self.controlEpoch = controlEpoch
    self.sequence = sequence
    self.signedActId = signedActId
    self.member = member
    self.authorAccountId = authorAccountId
  }
}

public enum APIAcceptedMessageMessageAuthorKind: String, Codable, Sendable {
  case `fan` = "fan"
  case `ai` = "ai"
  case `approved_draft` = "approved_draft"
  case `human_creator` = "human_creator"
  case `human_call` = "human_call"
  case `human_broadcast` = "human_broadcast"
  case `human_reaction` = "human_reaction"
  case `team` = "team"
  case `system` = "system"
}

public enum APIAcceptedMessageMessageDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct APIFrame: Codable, Sendable {
  public let `threadId`: String
  public let `cursor`: Int
  public let `epoch`: Int
  public let `kind`: APIFrameKind
  public let `messageId`: String
  public let `authorKind`: APIFrameAuthorKind
  public let `text`: String
  public let `generationId`: String?
  public let `sequence`: Int
  public let `control`: APIFrameControl?
  public init(threadId: String, cursor: Int, epoch: Int, kind: APIFrameKind, messageId: String, authorKind: APIFrameAuthorKind, text: String, generationId: String? = nil, sequence: Int, control: APIFrameControl? = nil) {
    self.threadId = threadId
    self.cursor = cursor
    self.epoch = epoch
    self.kind = kind
    self.messageId = messageId
    self.authorKind = authorKind
    self.text = text
    self.generationId = generationId
    self.sequence = sequence
    self.control = control
  }
}

public enum APIFrameKind: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `sentence` = "sentence"
  case `control` = "control"
  case `delivered` = "delivered"
  case `interrupted` = "interrupted"
}

public enum APIFrameAuthorKind: String, Codable, Sendable {
  case `fan` = "fan"
  case `ai` = "ai"
  case `approved_draft` = "approved_draft"
  case `human_creator` = "human_creator"
  case `human_call` = "human_call"
  case `human_broadcast` = "human_broadcast"
  case `human_reaction` = "human_reaction"
  case `team` = "team"
  case `system` = "system"
}

public enum APIFrameControl: String, Codable, Sendable {
  case `ai_active` = "ai_active"
  case `human_active` = "human_active"
  case `ai_paused` = "ai_paused"
  case `closed` = "closed"
  case `blocked` = "blocked"
}

public struct APISubscribe: Codable, Sendable {
  public let `kind`: APISubscribeKind
  public let `creatorId`: String
  public let `fanId`: String
  public let `cursor`: Int
  public init(kind: APISubscribeKind, creatorId: String, fanId: String, cursor: Int) {
    self.kind = kind
    self.creatorId = creatorId
    self.fanId = fanId
    self.cursor = cursor
  }
}

public enum APISubscribeKind: String, Codable, Sendable {
  case `subscribe` = "subscribe"
}

public struct APIThreadTimeline: Codable, Sendable {
  public let `threadId`: String
  public let `creatorId`: String
  public let `fanId`: String
  public let `control`: APIThreadTimelineControl
  public let `epoch`: Int
  public let `cursor`: Int
  public let `generationSequences`: [String: Int]
  public let `messages`: [APIThreadTimelineMessagesItem]
  public init(threadId: String, creatorId: String, fanId: String, control: APIThreadTimelineControl, epoch: Int, cursor: Int, generationSequences: [String: Int], messages: [APIThreadTimelineMessagesItem]) {
    self.threadId = threadId
    self.creatorId = creatorId
    self.fanId = fanId
    self.control = control
    self.epoch = epoch
    self.cursor = cursor
    self.generationSequences = generationSequences
    self.messages = messages
  }
}

public enum APIThreadTimelineControl: String, Codable, Sendable {
  case `ai_active` = "ai_active"
  case `human_active` = "human_active"
  case `ai_paused` = "ai_paused"
  case `closed` = "closed"
  case `blocked` = "blocked"
}

public struct APIThreadTimelineMessagesItem: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIThreadTimelineMessagesItemAuthorKind
  public let `text`: String
  public let `deliveryState`: APIThreadTimelineMessagesItemDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public init(id: String, threadId: String, authorKind: APIThreadTimelineMessagesItemAuthorKind, text: String, deliveryState: APIThreadTimelineMessagesItemDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil) {
    self.id = id
    self.threadId = threadId
    self.authorKind = authorKind
    self.text = text
    self.deliveryState = deliveryState
    self.controlEpoch = controlEpoch
    self.sequence = sequence
    self.signedActId = signedActId
    self.member = member
    self.authorAccountId = authorAccountId
  }
}

public enum APIThreadTimelineMessagesItemAuthorKind: String, Codable, Sendable {
  case `fan` = "fan"
  case `ai` = "ai"
  case `approved_draft` = "approved_draft"
  case `human_creator` = "human_creator"
  case `human_call` = "human_call"
  case `human_broadcast` = "human_broadcast"
  case `human_reaction` = "human_reaction"
  case `team` = "team"
  case `system` = "system"
}

public enum APIThreadTimelineMessagesItemDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct CreatorAPIError: Error, Sendable { public let status: Int; public let body: Data }

public actor CreatorAPIClient {
  private let baseURL: URL
  private let session: URLSession
  private let token: @Sendable () async throws -> String?
  public init(baseURL: URL, session: URLSession = .shared, token: @escaping @Sendable () async throws -> String?) { self.baseURL = baseURL; self.session = session; self.token = token }
  private func request<Response: Decodable & Sendable>(_ path: String, method: String, body: Data? = nil, query: [String: String] = [:], expectedAccount: String? = nil, authenticated: Bool) async throws -> Response {
    guard var url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }
    url.percentEncodedPath = path
    url.queryItems = query.isEmpty ? nil : query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    var request = URLRequest(url: url.url!)
    request.httpMethod = method; request.httpBody = body
    if let expectedAccount { request.setValue(expectedAccount, forHTTPHeaderField: "x-qelvora-expected-account") }
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
    if authenticated, let value = try await token() { request.setValue("Bearer \(value)", forHTTPHeaderField: "Authorization") }
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    guard (200..<300).contains(response.statusCode) else { throw CreatorAPIError(status: response.statusCode, body: data) }
    return try JSONDecoder().decode(Response.self, from: data)
  }
  private func segment(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
  public func contentList(creatorId: String, query: [String: String] = [:]) async throws -> APIContentList {
    try await request("/v1/content/\(segment(creatorId))", method: "GET", query: query, authenticated: true)
  }
  public func studioContentList(creatorId: String, query: [String: String] = [:]) async throws -> APIContentList {
    try await request("/v1/content/\(segment(creatorId))/studio", method: "GET", query: query, authenticated: true)
  }
  public func studioLiveCatalog(creatorId: String) async throws -> APIContentLiveCatalog {
    try await request("/v1/content/\(segment(creatorId))/studio/live", method: "GET", authenticated: true)
  }
  public func saveContent(creatorId: String, body: APISaveContent, expectedAccount: String? = nil) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/drafts", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentReplies(creatorId: String, query: [String: String] = [:]) async throws -> APIContentReplyList {
    try await request("/v1/content/\(segment(creatorId))/replies", method: "GET", query: query, authenticated: true)
  }
  public func studioContentReplies(creatorId: String, query: [String: String] = [:]) async throws -> APIContentReplyList {
    try await request("/v1/content/\(segment(creatorId))/studio/replies", method: "GET", query: query, authenticated: true)
  }
  public func contentReplyConsent(creatorId: String, id: String, body: APIQuoteConsent, expectedAccount: String? = nil) async throws -> APIContentConsentResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/consent", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentReplyReaction(creatorId: String, id: String, body: APIReactToReply, expectedAccount: String? = nil) async throws -> APIContentReactionResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/reaction", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func withdrawContentReply(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentWithdrawResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/withdraw", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentPreference(creatorId: String) async throws -> APIContentPreference {
    try await request("/v1/content/\(segment(creatorId))/mute", method: "GET", authenticated: true)
  }
  public func muteContent(creatorId: String, body: APIContentMuteCommand, expectedAccount: String? = nil) async throws -> APIContentMuteCommand {
    try await request("/v1/content/\(segment(creatorId))/mute", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func myContentThanks(creatorId: String) async throws -> APIContentThanksView {
    try await request("/v1/content/\(segment(creatorId))/thanks", method: "GET", authenticated: true)
  }
  public func saveContentThanks(creatorId: String, body: APIThanksCommand, expectedAccount: String? = nil) async throws -> APIContentRevisionResult {
    try await request("/v1/content/\(segment(creatorId))/thanks", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioThanksFeed(creatorId: String) async throws -> APIContentThanksFeed {
    try await request("/v1/content/\(segment(creatorId))/studio/thanks", method: "GET", authenticated: true)
  }
  public func runScheduledContent(creatorId: String, expectedAccount: String? = nil) async throws -> APIContentScheduledResult {
    try await request("/v1/content/\(segment(creatorId))/studio/scheduled/run", method: "POST", expectedAccount: expectedAccount, authenticated: true)
  }
  public func runContentEffects(creatorId: String, expectedAccount: String? = nil) async throws -> APIContentEffectsResult {
    try await request("/v1/content/\(segment(creatorId))/studio/effects/run", method: "POST", expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentView(creatorId: String, id: String) async throws -> APIContentView {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))", method: "GET", authenticated: true)
  }
  public func studioContentView(creatorId: String, id: String) async throws -> APIContentView {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/studio", method: "GET", authenticated: true)
  }
  public func reviewContent(creatorId: String, id: String) async throws -> APIContentReview {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/review", method: "GET", authenticated: true)
  }
  public func publishContent(creatorId: String, id: String, body: APIPublishContent, expectedAccount: String? = nil) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/publish", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func teamPublishContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/team-publish", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func unpublishContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/unpublish", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func archiveContent(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/archive", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func replyToNote(creatorId: String, id: String, body: APIReplyToNote, expectedAccount: String? = nil) async throws -> APIContentReplyReviewResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/replies", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentReplyReview(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentReplyReviewResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/review", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func contentReplyRead(creatorId: String, id: String, body: APIContentVersionCommand, expectedAccount: String? = nil) async throws -> APIContentReplyReadResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/read", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioThreadEntries(creatorId: String, query: [String: String] = [:]) async throws -> APIStudioThreadEntries {
    try await request("/v1/studio/\(segment(creatorId))/threads", method: "GET", query: query, authenticated: true)
  }
  public func studioSession() async throws -> APIStudioSession {
    try await request("/v1/studio/session", method: "GET", authenticated: true)
  }
  public func acceptStudioInvitation(id: String, expectedAccount: String? = nil) async throws -> APIDone {
    try await request("/v1/studio/invitations/\(segment(id))/accept", method: "POST", expectedAccount: expectedAccount, authenticated: true)
  }
  public func inviteStudioMember(creatorId: String, body: APIStudioInvite, expectedAccount: String? = nil) async throws -> APIStudioInvitation {
    try await request("/v1/studio/\(segment(creatorId))/team/invite", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioTeam(creatorId: String) async throws -> APIStudioTeam {
    try await request("/v1/studio/\(segment(creatorId))/team", method: "GET", authenticated: true)
  }
  public func studioAudiences(creatorId: String) async throws -> APIStudioAudiences {
    try await request("/v1/studio/\(segment(creatorId))/audiences", method: "GET", authenticated: true)
  }
  public func studioCorrectionRevision(creatorId: String) async throws -> APIStudioRevision {
    try await request("/v1/studio/\(segment(creatorId))/corrections", method: "GET", authenticated: true)
  }
  public func submitStudioCorrection(creatorId: String, body: APIStudioCorrection, expectedAccount: String? = nil) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/corrections", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioQueue(creatorId: String, query: [String: String] = [:]) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/queue", method: "GET", query: query, authenticated: true)
  }
  public func studioPacket(creatorId: String, packetId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))", method: "GET", authenticated: true)
  }
  public func studioDecidePacket(creatorId: String, packetId: String, body: APICommerceDecidePacket, expectedAccount: String? = nil) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/decide", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioPacketDeliveries(creatorId: String, packetId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/deliveries", method: "GET", authenticated: true)
  }
  public func studioDeliverPacket(creatorId: String, packetId: String, body: APICommerceFulfillmentCommand, expectedAccount: String? = nil) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/deliver", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioThread(creatorId: String, fanId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))", method: "GET", authenticated: true)
  }
  public func studioTakeover(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = nil) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/takeover", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioHandback(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = nil) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/handback", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioPause(creatorId: String, fanId: String, body: APIStudioControlCommand, expectedAccount: String? = nil) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/pause", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioHumanReply(creatorId: String, fanId: String, body: APIHumanReply, expectedAccount: String? = nil) async throws -> APIMessage {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/reply", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func studioReplyDraft(creatorId: String, fanId: String) async throws -> APIStudioReplyDraft {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/draft", method: "GET", authenticated: true)
  }
  public func saveStudioReplyDraft(creatorId: String, fanId: String, body: APIStudioSaveReplyDraft, expectedAccount: String? = nil) async throws -> APIStudioDraftVersion {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/draft", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func sendStudioReplyDraft(creatorId: String, fanId: String, body: APIStudioSendReplyDraft, expectedAccount: String? = nil) async throws -> APIMessage {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/send-draft", method: "POST", body: JSONEncoder().encode(body), expectedAccount: expectedAccount, authenticated: true)
  }
  public func health() async throws -> APIHealth {
    try await request("/health", method: "GET", authenticated: false)
  }
  public func identityCapabilities() async throws -> APIIdentityCapabilities {
    try await request("/v1/identity/capabilities", method: "GET", authenticated: false)
  }
  public func continueWithPantopus(body: APIIdentityContinue) async throws -> APIIdentityRedirect {
    try await request("/v1/identity/continue", method: "POST", body: JSONEncoder().encode(body), authenticated: false)
  }
  public func completeIdentity(body: APICompleteIdentity) async throws -> APIIdentityCompletion {
    try await request("/v1/identity/complete", method: "POST", body: JSONEncoder().encode(body), authenticated: false)
  }
  public func identitySession() async throws -> APISession {
    try await request("/v1/identity/session", method: "GET", authenticated: true)
  }
  public func refreshSession() async throws -> APISessionToken {
    try await request("/v1/identity/refresh", method: "POST", authenticated: true)
  }
  public func logout() async throws -> APIDone {
    try await request("/v1/identity/logout", method: "POST", authenticated: true)
  }
  public func revokeSessions() async throws -> APIDone {
    try await request("/v1/identity/revoke-sessions", method: "POST", authenticated: true)
  }
  public func saveFanProfile(body: APIFanProfileInput) async throws -> APIFanProfile {
    try await request("/v1/identity/fan-profile", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func saveCreatorProfile(body: APICreatorProfileInput) async throws -> APICreatorProfile {
    try await request("/v1/identity/creator-profile", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func creatorProof(creatorId: String) async throws -> APIProof {
    try await request("/v1/identity/\(segment(creatorId))/proof", method: "GET", authenticated: true)
  }
  public func beginCreatorProof(creatorId: String, body: APIProofInput) async throws -> APIProof {
    try await request("/v1/identity/\(segment(creatorId))/proof", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func submitCreatorProof(proofId: String, body: APIProofSubmit) async throws -> APIProof {
    try await request("/v1/identity/proof/\(segment(proofId))/submit", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func passkeys() async throws -> APIPasskeys {
    try await request("/v1/identity/passkeys", method: "GET", authenticated: true)
  }
  public func beginPasskey() async throws -> APIPasskeyOptions {
    try await request("/v1/identity/passkeys/begin", method: "POST", authenticated: true)
  }
  public func registerPasskey(body: APIPasskeyRegistration) async throws -> APIDone {
    try await request("/v1/identity/passkeys/register", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func recoverPasskeys() async throws -> APIDone {
    try await request("/v1/identity/passkeys/recovery", method: "POST", authenticated: true)
  }
  public func revokePasskey(body: APIPasskeyRevocation) async throws -> APIDone {
    try await request("/v1/identity/passkeys/revoke", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func cancelPasskey(challengeId: String) async throws -> APIDone {
    try await request("/v1/identity/passkeys/\(segment(challengeId))/cancel", method: "POST", authenticated: true)
  }
  public func inviteTeamMember(creatorId: String, body: APITeamInvite) async throws -> APITeamInvitation {
    try await request("/v1/identity/\(segment(creatorId))/team/invite", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func acceptTeamInvitation(invitationId: String) async throws -> APIDone {
    try await request("/v1/identity/team/\(segment(invitationId))/accept", method: "POST", authenticated: true)
  }
  public func removeTeamMember(creatorId: String, accountId: String) async throws -> APIDone {
    try await request("/v1/identity/\(segment(creatorId))/team/\(segment(accountId))/remove", method: "POST", authenticated: true)
  }
  public func cancelSignedAct(challengeId: String) async throws -> APIDone {
    try await request("/v1/identity/signed-acts/\(segment(challengeId))/cancel", method: "POST", authenticated: true)
  }
  public func publicSignature(signedActId: String) async throws -> APIPublicSignature {
    try await request("/v1/identity/signed-acts/\(segment(signedActId))", method: "GET", authenticated: false)
  }
  public func beginSignedAct(creatorId: String, body: APIBeginSignedAct) async throws -> APISignedChallenge {
    try await request("/v1/identity/\(segment(creatorId))/signed-acts/begin", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func verifySignedAct(body: APIVerifySignedAct) async throws -> APISignedActResult {
    try await request("/v1/identity/signed-acts/verify", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func readThread(creatorId: String, fanId: String) async throws -> APIThreadTimeline {
    try await request("/v1/threads/\(segment(creatorId))/\(segment(fanId))", method: "GET", authenticated: true)
  }
  public func sendMessage(creatorId: String, fanId: String, body: APISendMessage) async throws -> APIAcceptedMessage {
    try await request("/v1/threads/\(segment(creatorId))/\(segment(fanId))/messages", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func takeover(creatorId: String, fanId: String, body: APIControlCommand) async throws -> APIFrame {
    try await request("/v1/threads/\(segment(creatorId))/\(segment(fanId))/takeover", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func handback(creatorId: String, fanId: String, body: APIControlCommand) async throws -> APIFrame {
    try await request("/v1/threads/\(segment(creatorId))/\(segment(fanId))/handback", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func sendHumanReply(creatorId: String, fanId: String, body: APIHumanReply) async throws -> APIMessage {
    try await request("/v1/threads/\(segment(creatorId))/\(segment(fanId))/human-replies", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
}

public enum ApplicationDestination {
  public static func isPermitted(_ value: String) -> Bool {
    if value.count > 2048 || value.contains("%") || value.contains("\\") || value.contains("#") || value.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return false }
    let parts = value.components(separatedBy: "?")
    guard parts.count <= 2, parts[0].range(of: "^/(?:home|discover|requests(?:/[a-f0-9-]{36})?|you(?:/spending)?|identity/account|notifications(?:/settings)?|invite/[a-f0-9-]{36}|share/[a-f0-9-]{36}|onboarding/handle|studio(?:/(?:workspace|setup|notes|requests|threads|ai(?:/license)?|more|impact|insights|measurement|launch|activation)|/[a-f0-9-]{36}/(?:notes|replies|compose(?:/[a-f0-9-]{36})?|post(?:/[a-f0-9-]{36})?|publish|team|thanks|requests|packets/[a-f0-9-]{36}|threads(?:/[a-f0-9-]{36})?|ai|more))?|commerce/(?:requests|spending|access|packet|checkout|status|pass|membership|offers|earnings|pool)|media/voice|calls/[a-f0-9-]{36}(?:/[a-f0-9-]{36}/[a-f0-9-]{36})?|support(?:/(?:privacy|reports|access|feedback|cases/[a-f0-9-]{36}))?|trust(?:/(?:privacy|reports|crisis|cases/[a-f0-9-]{36}))?|content/[a-f0-9-]{36}/[a-f0-9-]{36}|creators/[a-z0-9_]{3,30}(?:/(?:chat|posts|requests|access)|/posts/[a-f0-9-]{36})?|threads/[a-f0-9-]{36}/[a-f0-9-]{36}|verify/[a-f0-9-]{36})$", options: .regularExpression) != nil else { return false }
    if parts.count == 1 { return true }
    let scopes = ["context": "^/creators/", "creatorId": "^(?:/commerce/|/support$)", "packetId": "^/commerce/", "offer": "^/calls/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$", "messageId": "^/support$", "quote": "^/studio/[a-f0-9-]{36}/(?:compose|post|publish)$", "packet": "^/studio/[a-f0-9-]{36}/publish$"]
    let literalValues = ["offer": "1"]
    let fields = parts[1].components(separatedBy: "&")
    guard fields.count <= 2 else { return false }
    var names = Set<String>()
    for field in fields {
      let pair = field.components(separatedBy: "=")
      guard pair.count == 2, names.insert(pair[0]).inserted, let scope = scopes[pair[0]], parts[0].range(of: scope, options: .regularExpression) != nil else { return false }
      if let expected = literalValues[pair[0]] {
        guard pair[1] == expected else { return false }
      } else {
        guard let id = UUID(uuidString: pair[1]), id.uuidString.lowercased() == pair[1] else { return false }
      }
    }
    return true
  }
}
