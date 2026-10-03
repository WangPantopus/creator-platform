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
  private enum CodingKeys: String, CodingKey {
    case `title`
    case `text`
    case `origin`
    case `originReference`
    case `audience`
    case `rightsEvidence`
    case `expiresAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.origin = try container.decode(APIAgentSourceCreateOrigin.self, forKey: .origin)
    self.originReference = try container.decodeIfPresent(String.self, forKey: .originReference)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.rightsEvidence = try container.decode(String.self, forKey: .rightsEvidence)
    self.expiresAt = try container.decode(String?.self, forKey: .expiresAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(origin, forKey: .origin)
    try container.encodeIfPresent(originReference, forKey: .originReference)
    try container.encode(audience, forKey: .audience)
    try container.encode(rightsEvidence, forKey: .rightsEvidence)
    try container.encode(expiresAt, forKey: .expiresAt)
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

public typealias APICommerceCallTransportStatus = APIJSONValue

public enum APICommerceCommitmentState: String, Codable, Sendable {
  case `due` = "due"
  case `in_progress` = "in_progress"
  case `delivered` = "delivered"
  case `resolution_required` = "resolution_required"
  case `refund_pending` = "refund_pending"
  case `refunded` = "refunded"
  case `resolved` = "resolved"
}

public struct APICommerceCreatorEarnings: Codable, Sendable {
  public let `creatorId`: String
  public let `observedAt`: String
  public let `currencies`: [APICommerceCreatorEarningsCurrenciesItem]
  public let `ledger`: APICommerceCreatorEarningsLedger
  public init(creatorId: String, observedAt: String, currencies: [APICommerceCreatorEarningsCurrenciesItem], ledger: APICommerceCreatorEarningsLedger) {
    self.creatorId = creatorId
    self.observedAt = observedAt
    self.currencies = currencies
    self.ledger = ledger
  }
}

public struct APICommerceCreatorEarningsCurrenciesItem: Codable, Sendable {
  public let `currency`: String
  public let `capturedMinor`: String
  public let `requestMinor`: String
  public let `membershipMinor`: String
  public let `refundedMinor`: String
  public let `transferredMinor`: String?
  public let `reversedMinor`: String?
  public let `pendingPayouts`: Int
  public init(currency: String, capturedMinor: String, requestMinor: String, membershipMinor: String, refundedMinor: String, transferredMinor: String? = nil, reversedMinor: String? = nil, pendingPayouts: Int) {
    self.currency = currency
    self.capturedMinor = capturedMinor
    self.requestMinor = requestMinor
    self.membershipMinor = membershipMinor
    self.refundedMinor = refundedMinor
    self.transferredMinor = transferredMinor
    self.reversedMinor = reversedMinor
    self.pendingPayouts = pendingPayouts
  }
  private enum CodingKeys: String, CodingKey {
    case `currency`
    case `capturedMinor`
    case `requestMinor`
    case `membershipMinor`
    case `refundedMinor`
    case `transferredMinor`
    case `reversedMinor`
    case `pendingPayouts`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.capturedMinor = try container.decode(String.self, forKey: .capturedMinor)
    self.requestMinor = try container.decode(String.self, forKey: .requestMinor)
    self.membershipMinor = try container.decode(String.self, forKey: .membershipMinor)
    self.refundedMinor = try container.decode(String.self, forKey: .refundedMinor)
    self.transferredMinor = try container.decode(String?.self, forKey: .transferredMinor)
    self.reversedMinor = try container.decode(String?.self, forKey: .reversedMinor)
    self.pendingPayouts = try container.decode(Int.self, forKey: .pendingPayouts)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(currency, forKey: .currency)
    try container.encode(capturedMinor, forKey: .capturedMinor)
    try container.encode(requestMinor, forKey: .requestMinor)
    try container.encode(membershipMinor, forKey: .membershipMinor)
    try container.encode(refundedMinor, forKey: .refundedMinor)
    try container.encode(transferredMinor, forKey: .transferredMinor)
    try container.encode(reversedMinor, forKey: .reversedMinor)
    try container.encode(pendingPayouts, forKey: .pendingPayouts)
  }
}

public struct APICommerceCreatorEarningsLedger: Codable, Sendable {
  public let `currency`: String
  public let `entries`: [APICommerceCreatorEarningsLedgerEntriesItem]
  public let `nextCursor`: String?
  public init(currency: String, entries: [APICommerceCreatorEarningsLedgerEntriesItem], nextCursor: String? = nil) {
    self.currency = currency
    self.entries = entries
    self.nextCursor = nextCursor
  }
  private enum CodingKeys: String, CodingKey {
    case `currency`
    case `entries`
    case `nextCursor`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.entries = try container.decode([APICommerceCreatorEarningsLedgerEntriesItem].self, forKey: .entries)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(currency, forKey: .currency)
    try container.encode(entries, forKey: .entries)
    try container.encode(nextCursor, forKey: .nextCursor)
  }
}

public struct APICommerceCreatorEarningsLedgerEntriesItem: Codable, Sendable {
  public let `id`: String
  public let `packetId`: String?
  public let `kind`: String
  public let `amount`: String
  public let `currency`: String
  public let `createdAt`: String
  public init(id: String, packetId: String? = nil, kind: String, amount: String, currency: String, createdAt: String) {
    self.id = id
    self.packetId = packetId
    self.kind = kind
    self.amount = amount
    self.currency = currency
    self.createdAt = createdAt
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `packetId`
    case `kind`
    case `amount`
    case `currency`
    case `createdAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.kind = try container.decode(String.self, forKey: .kind)
    self.amount = try container.decode(String.self, forKey: .amount)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(packetId, forKey: .packetId)
    try container.encode(kind, forKey: .kind)
    try container.encode(amount, forKey: .amount)
    try container.encode(currency, forKey: .currency)
    try container.encode(createdAt, forKey: .createdAt)
  }
}

public struct APICommerceCreatorLedgerPage: Codable, Sendable {
  public let `currency`: String
  public let `entries`: [APICommerceCreatorLedgerPageEntriesItem]
  public let `nextCursor`: String?
  public init(currency: String, entries: [APICommerceCreatorLedgerPageEntriesItem], nextCursor: String? = nil) {
    self.currency = currency
    self.entries = entries
    self.nextCursor = nextCursor
  }
  private enum CodingKeys: String, CodingKey {
    case `currency`
    case `entries`
    case `nextCursor`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.entries = try container.decode([APICommerceCreatorLedgerPageEntriesItem].self, forKey: .entries)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(currency, forKey: .currency)
    try container.encode(entries, forKey: .entries)
    try container.encode(nextCursor, forKey: .nextCursor)
  }
}

public struct APICommerceCreatorLedgerPageEntriesItem: Codable, Sendable {
  public let `id`: String
  public let `packetId`: String?
  public let `kind`: String
  public let `amount`: String
  public let `currency`: String
  public let `createdAt`: String
  public init(id: String, packetId: String? = nil, kind: String, amount: String, currency: String, createdAt: String) {
    self.id = id
    self.packetId = packetId
    self.kind = kind
    self.amount = amount
    self.currency = currency
    self.createdAt = createdAt
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `packetId`
    case `kind`
    case `amount`
    case `currency`
    case `createdAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.kind = try container.decode(String.self, forKey: .kind)
    self.amount = try container.decode(String.self, forKey: .amount)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(packetId, forKey: .packetId)
    try container.encode(kind, forKey: .kind)
    try container.encode(amount, forKey: .amount)
    try container.encode(currency, forKey: .currency)
    try container.encode(createdAt, forKey: .createdAt)
  }
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

public struct APICommercePassBillingStatus: Codable, Sendable {
  public let `version`: Int
  public let `currency`: String
  public let `desiredRenewal`: Bool
  public let `processing`: Bool
  public let `effects`: [APICommercePassBillingStatusEffectsItem]
  public init(version: Int, currency: String, desiredRenewal: Bool, processing: Bool, effects: [APICommercePassBillingStatusEffectsItem]) {
    self.version = version
    self.currency = currency
    self.desiredRenewal = desiredRenewal
    self.processing = processing
    self.effects = effects
  }
}

public struct APICommercePassBillingStatusEffectsItem: Codable, Sendable {
  public let `id`: String
  public let `state`: APICommercePassBillingStatusEffectsItemState
  public let `operation`: APICommercePassBillingStatusEffectsItemOperation
  public init(id: String, state: APICommercePassBillingStatusEffectsItemState, operation: APICommercePassBillingStatusEffectsItemOperation) {
    self.id = id
    self.state = state
    self.operation = operation
  }
}

public enum APICommercePassBillingStatusEffectsItemState: String, Codable, Sendable {
  case `pending` = "pending"
  case `processing` = "processing"
  case `unknown` = "unknown"
}

public enum APICommercePassBillingStatusEffectsItemOperation: String, Codable, Sendable {
  case `start` = "start"
  case `activate_renewal` = "activate_renewal"
  case `cancel` = "cancel"
  case `compensate_cancel` = "compensate_cancel"
}

public struct APICommercePassPurchaseEffect: Codable, Sendable {
  public let `effectId`: String
  public let `processing`: Bool
  public let `clientSecret`: String?
  public init(effectId: String, processing: Bool, clientSecret: String? = nil) {
    self.effectId = effectId
    self.processing = processing
    self.clientSecret = clientSecret
  }
}

public struct APICommercePassPurchaseQuote: Codable, Sendable {
  public let `quoteId`: String
  public let `version`: Int
  public let `currency`: String
  public let `amount`: Int
  public let `monthlyAmount`: Int
  public let `slotCapacity`: Int
  public let `allowance`: Int
  public let `monthlyAllowance`: Int
  public let `termsVersion`: String
  public let `budgetPolicyVersion`: String
  public let `createdAt`: String
  public let `expiresAt`: String
  public let `periodEndsAt`: String
  public init(quoteId: String, version: Int, currency: String, amount: Int, monthlyAmount: Int, slotCapacity: Int, allowance: Int, monthlyAllowance: Int, termsVersion: String, budgetPolicyVersion: String, createdAt: String, expiresAt: String, periodEndsAt: String) {
    self.quoteId = quoteId
    self.version = version
    self.currency = currency
    self.amount = amount
    self.monthlyAmount = monthlyAmount
    self.slotCapacity = slotCapacity
    self.allowance = allowance
    self.monthlyAllowance = monthlyAllowance
    self.termsVersion = termsVersion
    self.budgetPolicyVersion = budgetPolicyVersion
    self.createdAt = createdAt
    self.expiresAt = expiresAt
    self.periodEndsAt = periodEndsAt
  }
}

public typealias APICommercePassPurchaseStatus = APIJSONValue

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

public struct APICommercePayoutOnboardingCommand: Codable, Sendable {
  public let `version`: Int
  public init(version: Int) {
    self.version = version
  }
}

public struct APICommercePayoutOnboardingResult: Codable, Sendable {
  public let `creatorId`: String
  public let `state`: APICommercePayoutOnboardingResultState
  public let `detailsDue`: Bool
  public let `version`: Int
  public let `url`: String?
  public let `expiresAt`: String?
  public init(creatorId: String, state: APICommercePayoutOnboardingResultState, detailsDue: Bool, version: Int, url: String? = nil, expiresAt: String? = nil) {
    self.creatorId = creatorId
    self.state = state
    self.detailsDue = detailsDue
    self.version = version
    self.url = url
    self.expiresAt = expiresAt
  }
  private enum CodingKeys: String, CodingKey {
    case `creatorId`
    case `state`
    case `detailsDue`
    case `version`
    case `url`
    case `expiresAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.state = try container.decode(APICommercePayoutOnboardingResultState.self, forKey: .state)
    self.detailsDue = try container.decode(Bool.self, forKey: .detailsDue)
    self.version = try container.decode(Int.self, forKey: .version)
    self.url = try container.decode(String?.self, forKey: .url)
    self.expiresAt = try container.decode(String?.self, forKey: .expiresAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(state, forKey: .state)
    try container.encode(detailsDue, forKey: .detailsDue)
    try container.encode(version, forKey: .version)
    try container.encode(url, forKey: .url)
    try container.encode(expiresAt, forKey: .expiresAt)
  }
}

public enum APICommercePayoutOnboardingResultState: String, Codable, Sendable {
  case `onboarding` = "onboarding"
  case `restricted` = "restricted"
  case `enabled` = "enabled"
}

public struct APICommercePoolEarnings: Codable, Sendable {
  public let `creatorId`: String
  public let `cycle`: String
  public let `observedAt`: String
  public let `closesAt`: String
  public let `fanCount`: Int
  public let `slotCount`: Int
  public let `historyLimited`: Bool
  public let `postedCycles`: [APICommercePoolEarningsPostedCyclesItem]
  public init(creatorId: String, cycle: String, observedAt: String, closesAt: String, fanCount: Int, slotCount: Int, historyLimited: Bool, postedCycles: [APICommercePoolEarningsPostedCyclesItem]) {
    self.creatorId = creatorId
    self.cycle = cycle
    self.observedAt = observedAt
    self.closesAt = closesAt
    self.fanCount = fanCount
    self.slotCount = slotCount
    self.historyLimited = historyLimited
    self.postedCycles = postedCycles
  }
}

public struct APICommercePoolEarningsPostedCyclesItem: Codable, Sendable {
  public let `cycle`: String
  public let `currency`: String
  public let `allocationMinor`: String
  public let `transferredMinor`: String?
  public let `reversedMinor`: String?
  public let `slotSeconds`: String
  public let `totalSlotSeconds`: String
  public let `pendingEffects`: Int
  public let `postedAt`: String
  public init(cycle: String, currency: String, allocationMinor: String, transferredMinor: String? = nil, reversedMinor: String? = nil, slotSeconds: String, totalSlotSeconds: String, pendingEffects: Int, postedAt: String) {
    self.cycle = cycle
    self.currency = currency
    self.allocationMinor = allocationMinor
    self.transferredMinor = transferredMinor
    self.reversedMinor = reversedMinor
    self.slotSeconds = slotSeconds
    self.totalSlotSeconds = totalSlotSeconds
    self.pendingEffects = pendingEffects
    self.postedAt = postedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `cycle`
    case `currency`
    case `allocationMinor`
    case `transferredMinor`
    case `reversedMinor`
    case `slotSeconds`
    case `totalSlotSeconds`
    case `pendingEffects`
    case `postedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.cycle = try container.decode(String.self, forKey: .cycle)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.allocationMinor = try container.decode(String.self, forKey: .allocationMinor)
    self.transferredMinor = try container.decode(String?.self, forKey: .transferredMinor)
    self.reversedMinor = try container.decode(String?.self, forKey: .reversedMinor)
    self.slotSeconds = try container.decode(String.self, forKey: .slotSeconds)
    self.totalSlotSeconds = try container.decode(String.self, forKey: .totalSlotSeconds)
    self.pendingEffects = try container.decode(Int.self, forKey: .pendingEffects)
    self.postedAt = try container.decode(String.self, forKey: .postedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(cycle, forKey: .cycle)
    try container.encode(currency, forKey: .currency)
    try container.encode(allocationMinor, forKey: .allocationMinor)
    try container.encode(transferredMinor, forKey: .transferredMinor)
    try container.encode(reversedMinor, forKey: .reversedMinor)
    try container.encode(slotSeconds, forKey: .slotSeconds)
    try container.encode(totalSlotSeconds, forKey: .totalSlotSeconds)
    try container.encode(pendingEffects, forKey: .pendingEffects)
    try container.encode(postedAt, forKey: .postedAt)
  }
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
  private enum CodingKeys: String, CodingKey {
    case `currency`
    case `amount`
    case `explicitNone`
    case `remindersOn`
    case `idempotencyKey`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.currency = try container.decode(String.self, forKey: .currency)
    self.amount = try container.decode(Int?.self, forKey: .amount)
    self.explicitNone = try container.decode(Bool.self, forKey: .explicitNone)
    self.remindersOn = try container.decode(Bool.self, forKey: .remindersOn)
    self.idempotencyKey = try container.decode(String.self, forKey: .idempotencyKey)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(currency, forKey: .currency)
    try container.encode(amount, forKey: .amount)
    try container.encode(explicitNone, forKey: .explicitNone)
    try container.encode(remindersOn, forKey: .remindersOn)
    try container.encode(idempotencyKey, forKey: .idempotencyKey)
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

public struct APIMediaCapabilities: Codable, Sendable {
  public let `mediaAvailable`: Bool
  public let `creatorMediaAvailable`: Bool
  public let `creatorMediaAudienceAvailable`: Bool
  public let `callsAvailable`: Bool
  public let `aiAudioAvailable`: APIMediaCapabilitiesAiAudioAvailable
  public let `callRecoveryAvailable`: Bool
  public let `reason`: APIMediaCapabilitiesReason
  public init(mediaAvailable: Bool, creatorMediaAvailable: Bool, creatorMediaAudienceAvailable: Bool, callsAvailable: Bool, aiAudioAvailable: APIMediaCapabilitiesAiAudioAvailable, callRecoveryAvailable: Bool, reason: APIMediaCapabilitiesReason) {
    self.mediaAvailable = mediaAvailable
    self.creatorMediaAvailable = creatorMediaAvailable
    self.creatorMediaAudienceAvailable = creatorMediaAudienceAvailable
    self.callsAvailable = callsAvailable
    self.aiAudioAvailable = aiAudioAvailable
    self.callRecoveryAvailable = callRecoveryAvailable
    self.reason = reason
  }
}

public struct APIMediaCapabilitiesAiAudioAvailable: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public enum APIMediaCapabilitiesReason: String, Codable, Sendable {
  case `media_unconfigured` = "media_unconfigured"
  case `licensed_ai_audio_and_provider_verification_required` = "licensed_ai_audio_and_provider_verification_required"
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `purpose`
    case `state`
    case `version`
    case `mimeType`
    case `bytes`
    case `uploadedBytes`
    case `durationMs`
    case `sha256`
    case `waveform`
    case `signedActId`
    case `expiresAt`
    case `failureCode`
    case `provenance`
    case `creatorId`
    case `objectId`
    case `ownerAccountId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.purpose = try container.decode(APIMediaCreatorMediaAssetPurpose.self, forKey: .purpose)
    self.state = try container.decode(APIMediaCreatorMediaAssetState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.mimeType = try container.decode(String.self, forKey: .mimeType)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.uploadedBytes = try container.decode(Int.self, forKey: .uploadedBytes)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.waveform = try container.decode([Double].self, forKey: .waveform)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.failureCode = try container.decode(String?.self, forKey: .failureCode)
    self.provenance = try container.decode([String: APIJSONValue]?.self, forKey: .provenance)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.objectId = try container.decode(String.self, forKey: .objectId)
    self.ownerAccountId = try container.decode(String.self, forKey: .ownerAccountId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(uploadedBytes, forKey: .uploadedBytes)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(waveform, forKey: .waveform)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(failureCode, forKey: .failureCode)
    try container.encode(provenance, forKey: .provenance)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(objectId, forKey: .objectId)
    try container.encode(ownerAccountId, forKey: .ownerAccountId)
  }
}

public enum APIMediaCreatorMediaAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
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
  public let `playbackFile`: APIMediaCreatorMediaPlaybackTicketPlaybackFile
  public init(asset: APIMediaCreatorMediaPlaybackTicketAsset, url: String, expiresAt: String, playbackFile: APIMediaCreatorMediaPlaybackTicketPlaybackFile) {
    self.asset = asset
    self.url = url
    self.expiresAt = expiresAt
    self.playbackFile = playbackFile
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `purpose`
    case `state`
    case `version`
    case `mimeType`
    case `bytes`
    case `uploadedBytes`
    case `durationMs`
    case `sha256`
    case `waveform`
    case `signedActId`
    case `expiresAt`
    case `failureCode`
    case `provenance`
    case `creatorId`
    case `objectId`
    case `ownerAccountId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.purpose = try container.decode(APIMediaCreatorMediaPlaybackTicketAssetPurpose.self, forKey: .purpose)
    self.state = try container.decode(APIMediaCreatorMediaPlaybackTicketAssetState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.mimeType = try container.decode(String.self, forKey: .mimeType)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.uploadedBytes = try container.decode(Int.self, forKey: .uploadedBytes)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.waveform = try container.decode([Double].self, forKey: .waveform)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.failureCode = try container.decode(String?.self, forKey: .failureCode)
    self.provenance = try container.decode([String: APIJSONValue]?.self, forKey: .provenance)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.objectId = try container.decode(String.self, forKey: .objectId)
    self.ownerAccountId = try container.decode(String.self, forKey: .ownerAccountId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(uploadedBytes, forKey: .uploadedBytes)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(waveform, forKey: .waveform)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(failureCode, forKey: .failureCode)
    try container.encode(provenance, forKey: .provenance)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(objectId, forKey: .objectId)
    try container.encode(ownerAccountId, forKey: .ownerAccountId)
  }
}

public enum APIMediaCreatorMediaPlaybackTicketAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
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

public struct APIMediaCreatorMediaPlaybackTicketPlaybackFile: Codable, Sendable {
  public let `variant`: APIMediaCreatorMediaPlaybackTicketPlaybackFileVariant
  public let `sha256`: String
  public let `bytes`: Int
  public init(variant: APIMediaCreatorMediaPlaybackTicketPlaybackFileVariant, sha256: String, bytes: Int) {
    self.variant = variant
    self.sha256 = sha256
    self.bytes = bytes
  }
}

public enum APIMediaCreatorMediaPlaybackTicketPlaybackFileVariant: String, Codable, Sendable {
  case `processed` = "processed"
  case `credentialed` = "credentialed"
}

public struct APIMediaCreatorMediaPolicyView: Codable, Sendable {
  public let `creatorId`: String
  public let `objectId`: String
  public let `purpose`: APIMediaCreatorMediaPolicyViewPurpose
  public let `maxBytes`: Int
  public let `maxDurationMs`: Int
  public init(creatorId: String, objectId: String, purpose: APIMediaCreatorMediaPolicyViewPurpose, maxBytes: Int, maxDurationMs: Int) {
    self.creatorId = creatorId
    self.objectId = objectId
    self.purpose = purpose
    self.maxBytes = maxBytes
    self.maxDurationMs = maxDurationMs
  }
}

public enum APIMediaCreatorMediaPolicyViewPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
  case `human_note` = "human_note"
}

public enum APIMediaCreatorMediaPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
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
  case `post_audio` = "post_audio"
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `purpose`
    case `state`
    case `version`
    case `mimeType`
    case `bytes`
    case `uploadedBytes`
    case `durationMs`
    case `sha256`
    case `waveform`
    case `signedActId`
    case `expiresAt`
    case `failureCode`
    case `provenance`
    case `creatorId`
    case `objectId`
    case `ownerAccountId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.purpose = try container.decode(APIMediaCreatorMediaUploadTicketAssetPurpose.self, forKey: .purpose)
    self.state = try container.decode(APIMediaCreatorMediaUploadTicketAssetState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.mimeType = try container.decode(String.self, forKey: .mimeType)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.uploadedBytes = try container.decode(Int.self, forKey: .uploadedBytes)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.waveform = try container.decode([Double].self, forKey: .waveform)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.failureCode = try container.decode(String?.self, forKey: .failureCode)
    self.provenance = try container.decode([String: APIJSONValue]?.self, forKey: .provenance)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.objectId = try container.decode(String.self, forKey: .objectId)
    self.ownerAccountId = try container.decode(String.self, forKey: .ownerAccountId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(uploadedBytes, forKey: .uploadedBytes)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(waveform, forKey: .waveform)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(failureCode, forKey: .failureCode)
    try container.encode(provenance, forKey: .provenance)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(objectId, forKey: .objectId)
    try container.encode(ownerAccountId, forKey: .ownerAccountId)
  }
}

public enum APIMediaCreatorMediaUploadTicketAssetPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `purpose`
    case `state`
    case `version`
    case `mimeType`
    case `bytes`
    case `uploadedBytes`
    case `durationMs`
    case `sha256`
    case `waveform`
    case `signedActId`
    case `expiresAt`
    case `failureCode`
    case `provenance`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.purpose = try container.decode(APIMediaMediaAssetPurpose.self, forKey: .purpose)
    self.state = try container.decode(APIMediaMediaAssetState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.mimeType = try container.decode(String.self, forKey: .mimeType)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.uploadedBytes = try container.decode(Int.self, forKey: .uploadedBytes)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.waveform = try container.decode([Double].self, forKey: .waveform)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.failureCode = try container.decode(String?.self, forKey: .failureCode)
    self.provenance = try container.decode([String: APIJSONValue]?.self, forKey: .provenance)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(uploadedBytes, forKey: .uploadedBytes)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(waveform, forKey: .waveform)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(failureCode, forKey: .failureCode)
    try container.encode(provenance, forKey: .provenance)
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

public struct APIMediaPlaybackFile: Codable, Sendable {
  public let `variant`: APIMediaPlaybackFileVariant
  public let `sha256`: String
  public let `bytes`: Int
  public init(variant: APIMediaPlaybackFileVariant, sha256: String, bytes: Int) {
    self.variant = variant
    self.sha256 = sha256
    self.bytes = bytes
  }
}

public enum APIMediaPlaybackFileVariant: String, Codable, Sendable {
  case `processed` = "processed"
  case `credentialed` = "credentialed"
}

public struct APIMediaPlaybackTicket: Codable, Sendable {
  public let `url`: String
  public let `expiresAt`: String
  public let `asset`: APIMediaPlaybackTicketAsset
  public let `playbackFile`: APIMediaPlaybackTicketPlaybackFile
  public init(url: String, expiresAt: String, asset: APIMediaPlaybackTicketAsset, playbackFile: APIMediaPlaybackTicketPlaybackFile) {
    self.url = url
    self.expiresAt = expiresAt
    self.asset = asset
    self.playbackFile = playbackFile
  }
}

public struct APIMediaPlaybackTicketAsset: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `purpose`: APIMediaPlaybackTicketAssetPurpose
  public let `state`: APIMediaPlaybackTicketAssetState
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
  public init(id: String, threadId: String, purpose: APIMediaPlaybackTicketAssetPurpose, state: APIMediaPlaybackTicketAssetState, version: Int, mimeType: String, bytes: Int, uploadedBytes: Int, durationMs: Int? = nil, sha256: String, waveform: [Double], signedActId: String? = nil, expiresAt: String, failureCode: String? = nil, provenance: [String: APIJSONValue]? = nil) {
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `purpose`
    case `state`
    case `version`
    case `mimeType`
    case `bytes`
    case `uploadedBytes`
    case `durationMs`
    case `sha256`
    case `waveform`
    case `signedActId`
    case `expiresAt`
    case `failureCode`
    case `provenance`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.purpose = try container.decode(APIMediaPlaybackTicketAssetPurpose.self, forKey: .purpose)
    self.state = try container.decode(APIMediaPlaybackTicketAssetState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.mimeType = try container.decode(String.self, forKey: .mimeType)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.uploadedBytes = try container.decode(Int.self, forKey: .uploadedBytes)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.waveform = try container.decode([Double].self, forKey: .waveform)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.failureCode = try container.decode(String?.self, forKey: .failureCode)
    self.provenance = try container.decode([String: APIJSONValue]?.self, forKey: .provenance)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(uploadedBytes, forKey: .uploadedBytes)
    try container.encode(durationMs, forKey: .durationMs)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(waveform, forKey: .waveform)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(failureCode, forKey: .failureCode)
    try container.encode(provenance, forKey: .provenance)
  }
}

public enum APIMediaPlaybackTicketAssetPurpose: String, Codable, Sendable {
  case `fan_attachment` = "fan_attachment"
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `human_note` = "human_note"
  case `human_reply` = "human_reply"
  case `call_recording` = "call_recording"
  case `ai_audio` = "ai_audio"
}

public enum APIMediaPlaybackTicketAssetState: String, Codable, Sendable {
  case `uploading` = "uploading"
  case `quarantined` = "quarantined"
  case `processing` = "processing"
  case `ready` = "ready"
  case `rejected` = "rejected"
  case `revoked` = "revoked"
  case `deleted` = "deleted"
}

public struct APIMediaPlaybackTicketPlaybackFile: Codable, Sendable {
  public let `variant`: APIMediaPlaybackTicketPlaybackFileVariant
  public let `sha256`: String
  public let `bytes`: Int
  public init(variant: APIMediaPlaybackTicketPlaybackFileVariant, sha256: String, bytes: Int) {
    self.variant = variant
    self.sha256 = sha256
    self.bytes = bytes
  }
}

public enum APIMediaPlaybackTicketPlaybackFileVariant: String, Codable, Sendable {
  case `processed` = "processed"
  case `credentialed` = "credentialed"
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
  private enum CodingKeys: String, CodingKey {
    case `assetId`
    case `version`
    case `sha256`
    case `bytes`
    case `mimeType`
    case `durationMs`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.assetId = try container.decode(String.self, forKey: .assetId)
    self.version = try container.decode(Int.self, forKey: .version)
    self.sha256 = try container.decode(String.self, forKey: .sha256)
    self.bytes = try container.decode(Int.self, forKey: .bytes)
    self.mimeType = try container.decode(APIMediaProcessedMediaEvidenceMimeType.self, forKey: .mimeType)
    self.durationMs = try container.decode(Int?.self, forKey: .durationMs)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(assetId, forKey: .assetId)
    try container.encode(version, forKey: .version)
    try container.encode(sha256, forKey: .sha256)
    try container.encode(bytes, forKey: .bytes)
    try container.encode(mimeType, forKey: .mimeType)
    try container.encode(durationMs, forKey: .durationMs)
  }
}

public enum APIMediaProcessedMediaEvidenceMimeType: String, Codable, Sendable {
  case `audio_mp4` = "audio/mp4"
  case `image_png` = "image/png"
}

public struct APIMediaThreadRecordingPolicy: Codable, Sendable {
  public let `creatorId`: String
  public let `fanId`: String
  public let `threadId`: String
  public let `purpose`: APIMediaThreadRecordingPolicyPurpose
  public let `maxBytes`: Int
  public let `maxDurationMs`: Int
  public init(creatorId: String, fanId: String, threadId: String, purpose: APIMediaThreadRecordingPolicyPurpose, maxBytes: Int, maxDurationMs: Int) {
    self.creatorId = creatorId
    self.fanId = fanId
    self.threadId = threadId
    self.purpose = purpose
    self.maxBytes = maxBytes
    self.maxDurationMs = maxDurationMs
  }
}

public enum APIMediaThreadRecordingPolicyPurpose: String, Codable, Sendable {
  case `human_reply` = "human_reply"
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

public struct APICallAdmissionReceipt: Codable, Sendable {
  public let `admitted`: APICallAdmissionReceiptAdmitted
  public init(admitted: APICallAdmissionReceiptAdmitted) {
    self.admitted = admitted
  }
}

public struct APICallAdmissionReceiptAdmitted: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APICallAdmissionRedemption: Codable, Sendable {
  public let `nonce`: String
  public init(nonce: String) {
    self.nonce = nonce
  }
}

public struct APICallAvailabilityCommand: Codable, Sendable {
  public let `timeZone`: String
  public let `windows`: [APICallAvailabilityCommandWindowsItem]
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(timeZone: String, windows: [APICallAvailabilityCommandWindowsItem], expectedVersion: Int, idempotencyKey: String) {
    self.timeZone = timeZone
    self.windows = windows
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICallAvailabilityCommandWindowsItem: Codable, Sendable {
  public let `startsAt`: String
  public let `endsAt`: String
  public init(startsAt: String, endsAt: String) {
    self.startsAt = startsAt
    self.endsAt = endsAt
  }
}

public struct APICallAvailability: Codable, Sendable {
  public let `creatorId`: String
  public let `version`: Int
  public let `timeZone`: String
  public let `windows`: [APICallAvailabilityWindowsItem]
  public init(creatorId: String, version: Int, timeZone: String, windows: [APICallAvailabilityWindowsItem]) {
    self.creatorId = creatorId
    self.version = version
    self.timeZone = timeZone
    self.windows = windows
  }
}

public struct APICallAvailabilityWindowsItem: Codable, Sendable {
  public let `startsAt`: String
  public let `endsAt`: String
  public init(startsAt: String, endsAt: String) {
    self.startsAt = startsAt
    self.endsAt = endsAt
  }
}

public typealias APICallAvailabilityView = APICallAvailabilityViewValue?

public struct APICallAvailabilityViewValue: Codable, Sendable {
  public let `creatorId`: String
  public let `version`: Int
  public let `timeZone`: String
  public let `windows`: [APICallAvailabilityViewValueWindowsItem]
  public init(creatorId: String, version: Int, timeZone: String, windows: [APICallAvailabilityViewValueWindowsItem]) {
    self.creatorId = creatorId
    self.version = version
    self.timeZone = timeZone
    self.windows = windows
  }
}

public struct APICallAvailabilityViewValueWindowsItem: Codable, Sendable {
  public let `startsAt`: String
  public let `endsAt`: String
  public init(startsAt: String, endsAt: String) {
    self.startsAt = startsAt
    self.endsAt = endsAt
  }
}

public struct APICallCallAdmission: Codable, Sendable {
  public let `token`: String
  public let `url`: String
  public let `nonce`: String
  public let `sessionId`: String
  public let `accountId`: String
  public let `expiresAt`: String
  public let `role`: APICallCallAdmissionRole
  public init(token: String, url: String, nonce: String, sessionId: String, accountId: String, expiresAt: String, role: APICallCallAdmissionRole) {
    self.token = token
    self.url = url
    self.nonce = nonce
    self.sessionId = sessionId
    self.accountId = accountId
    self.expiresAt = expiresAt
    self.role = role
  }
}

public enum APICallCallAdmissionRole: String, Codable, Sendable {
  case `creator` = "creator"
  case `fan` = "fan"
}

public enum APICallCallConsentPurpose: String, Codable, Sendable {
  case `recording` = "recording"
  case `summary` = "summary"
  case `content_reuse` = "content_reuse"
  case `ai_source` = "ai_source"
}

public struct APICallCallOffer: Codable, Sendable {
  public let `id`: String
  public let `commitmentId`: String
  public let `version`: Int
  public let `creatorTimeZone`: String
  public let `fanTimeZone`: String
  public let `expiresAt`: String
  public let `state`: APICallCallOfferState
  public let `selectedSessionId`: String?
  public let `slots`: [APICallCallOfferSlotsItem]
  public init(id: String, commitmentId: String, version: Int, creatorTimeZone: String, fanTimeZone: String, expiresAt: String, state: APICallCallOfferState, selectedSessionId: String? = nil, slots: [APICallCallOfferSlotsItem]) {
    self.id = id
    self.commitmentId = commitmentId
    self.version = version
    self.creatorTimeZone = creatorTimeZone
    self.fanTimeZone = fanTimeZone
    self.expiresAt = expiresAt
    self.state = state
    self.selectedSessionId = selectedSessionId
    self.slots = slots
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `commitmentId`
    case `version`
    case `creatorTimeZone`
    case `fanTimeZone`
    case `expiresAt`
    case `state`
    case `selectedSessionId`
    case `slots`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.commitmentId = try container.decode(String.self, forKey: .commitmentId)
    self.version = try container.decode(Int.self, forKey: .version)
    self.creatorTimeZone = try container.decode(String.self, forKey: .creatorTimeZone)
    self.fanTimeZone = try container.decode(String.self, forKey: .fanTimeZone)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.state = try container.decode(APICallCallOfferState.self, forKey: .state)
    self.selectedSessionId = try container.decode(String?.self, forKey: .selectedSessionId)
    self.slots = try container.decode([APICallCallOfferSlotsItem].self, forKey: .slots)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(commitmentId, forKey: .commitmentId)
    try container.encode(version, forKey: .version)
    try container.encode(creatorTimeZone, forKey: .creatorTimeZone)
    try container.encode(fanTimeZone, forKey: .fanTimeZone)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(state, forKey: .state)
    try container.encode(selectedSessionId, forKey: .selectedSessionId)
    try container.encode(slots, forKey: .slots)
  }
}

public enum APICallCallOfferState: String, Codable, Sendable {
  case `offered` = "offered"
  case `selected` = "selected"
  case `expired` = "expired"
  case `cancelled` = "cancelled"
}

public struct APICallCallOfferSlotsItem: Codable, Sendable {
  public let `id`: String
  public let `startsAt`: String
  public init(id: String, startsAt: String) {
    self.id = id
    self.startsAt = startsAt
  }
}

public typealias APICallCallOffers = [APICallCallOffersValueItem]

public struct APICallCallOffersValueItem: Codable, Sendable {
  public let `id`: String
  public let `commitmentId`: String
  public let `version`: Int
  public let `creatorTimeZone`: String
  public let `fanTimeZone`: String
  public let `expiresAt`: String
  public let `state`: APICallCallOffersValueItemState
  public let `selectedSessionId`: String?
  public let `slots`: [APICallCallOffersValueItemSlotsItem]
  public init(id: String, commitmentId: String, version: Int, creatorTimeZone: String, fanTimeZone: String, expiresAt: String, state: APICallCallOffersValueItemState, selectedSessionId: String? = nil, slots: [APICallCallOffersValueItemSlotsItem]) {
    self.id = id
    self.commitmentId = commitmentId
    self.version = version
    self.creatorTimeZone = creatorTimeZone
    self.fanTimeZone = fanTimeZone
    self.expiresAt = expiresAt
    self.state = state
    self.selectedSessionId = selectedSessionId
    self.slots = slots
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `commitmentId`
    case `version`
    case `creatorTimeZone`
    case `fanTimeZone`
    case `expiresAt`
    case `state`
    case `selectedSessionId`
    case `slots`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.commitmentId = try container.decode(String.self, forKey: .commitmentId)
    self.version = try container.decode(Int.self, forKey: .version)
    self.creatorTimeZone = try container.decode(String.self, forKey: .creatorTimeZone)
    self.fanTimeZone = try container.decode(String.self, forKey: .fanTimeZone)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.state = try container.decode(APICallCallOffersValueItemState.self, forKey: .state)
    self.selectedSessionId = try container.decode(String?.self, forKey: .selectedSessionId)
    self.slots = try container.decode([APICallCallOffersValueItemSlotsItem].self, forKey: .slots)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(commitmentId, forKey: .commitmentId)
    try container.encode(version, forKey: .version)
    try container.encode(creatorTimeZone, forKey: .creatorTimeZone)
    try container.encode(fanTimeZone, forKey: .fanTimeZone)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(state, forKey: .state)
    try container.encode(selectedSessionId, forKey: .selectedSessionId)
    try container.encode(slots, forKey: .slots)
  }
}

public enum APICallCallOffersValueItemState: String, Codable, Sendable {
  case `offered` = "offered"
  case `selected` = "selected"
  case `expired` = "expired"
  case `cancelled` = "cancelled"
}

public struct APICallCallOffersValueItemSlotsItem: Codable, Sendable {
  public let `id`: String
  public let `startsAt`: String
  public init(id: String, startsAt: String) {
    self.id = id
    self.startsAt = startsAt
  }
}

public struct APICallCallRevision: Codable, Sendable {
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(expectedVersion: Int, idempotencyKey: String) {
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APICallCallRoute: Codable, Sendable {
  public let `sessionId`: String
  public let `creatorId`: String
  public let `fanId`: String
  public init(sessionId: String, creatorId: String, fanId: String) {
    self.sessionId = sessionId
    self.creatorId = creatorId
    self.fanId = fanId
  }
}

public struct APICallCallSession: Codable, Sendable {
  public let `id`: String
  public let `commitmentId`: String
  public let `threadId`: String
  public let `creatorId`: String
  public let `fanId`: String
  public let `creatorName`: String
  public let `creatorAccountId`: String
  public let `fanAccountId`: String
  public let `mediaMode`: APICallCallSessionMediaMode
  public let `scheduledAt`: String
  public let `hardEndAt`: String
  public let `durationSeconds`: Int
  public let `graceSeconds`: Int
  public let `reconnectBudgetSeconds`: Int
  public let `connectedMilliseconds`: Int
  public let `reconnectUsedMilliseconds`: Int
  public let `reconnectExhaustedAt`: String?
  public let `state`: APICallCallSessionState
  public let `version`: Int
  public let `serverNow`: String
  public let `present`: [APICallCallSessionPresentItem]
  public let `recordingState`: APICallCallSessionRecordingState
  public let `consents`: [APICallCallSessionConsentsItem]
  public let `outcome`: APICallCallSessionOutcome?
  public let `reconciliation`: APICallCallSessionReconciliation
  public let `conversationEpoch`: Int?
  public let `packet`: APICallCallSessionPacket
  public let `summary`: String?
  public let `creatorSummaryNote`: String?
  public let `summaryState`: APICallCallSessionSummaryState?
  public let `summaryRevision`: Int?
  public let `summarySources`: APICallCallSessionSummarySources?
  public let `recordingOccurred`: Bool?
  public init(id: String, commitmentId: String, threadId: String, creatorId: String, fanId: String, creatorName: String, creatorAccountId: String, fanAccountId: String, mediaMode: APICallCallSessionMediaMode, scheduledAt: String, hardEndAt: String, durationSeconds: Int, graceSeconds: Int, reconnectBudgetSeconds: Int, connectedMilliseconds: Int, reconnectUsedMilliseconds: Int, reconnectExhaustedAt: String? = nil, state: APICallCallSessionState, version: Int, serverNow: String, present: [APICallCallSessionPresentItem], recordingState: APICallCallSessionRecordingState, consents: [APICallCallSessionConsentsItem], outcome: APICallCallSessionOutcome? = nil, reconciliation: APICallCallSessionReconciliation, conversationEpoch: Int? = nil, packet: APICallCallSessionPacket, summary: String? = nil, creatorSummaryNote: String? = nil, summaryState: APICallCallSessionSummaryState? = nil, summaryRevision: Int? = nil, summarySources: APICallCallSessionSummarySources? = nil, recordingOccurred: Bool? = nil) {
    self.id = id
    self.commitmentId = commitmentId
    self.threadId = threadId
    self.creatorId = creatorId
    self.fanId = fanId
    self.creatorName = creatorName
    self.creatorAccountId = creatorAccountId
    self.fanAccountId = fanAccountId
    self.mediaMode = mediaMode
    self.scheduledAt = scheduledAt
    self.hardEndAt = hardEndAt
    self.durationSeconds = durationSeconds
    self.graceSeconds = graceSeconds
    self.reconnectBudgetSeconds = reconnectBudgetSeconds
    self.connectedMilliseconds = connectedMilliseconds
    self.reconnectUsedMilliseconds = reconnectUsedMilliseconds
    self.reconnectExhaustedAt = reconnectExhaustedAt
    self.state = state
    self.version = version
    self.serverNow = serverNow
    self.present = present
    self.recordingState = recordingState
    self.consents = consents
    self.outcome = outcome
    self.reconciliation = reconciliation
    self.conversationEpoch = conversationEpoch
    self.packet = packet
    self.summary = summary
    self.creatorSummaryNote = creatorSummaryNote
    self.summaryState = summaryState
    self.summaryRevision = summaryRevision
    self.summarySources = summarySources
    self.recordingOccurred = recordingOccurred
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `commitmentId`
    case `threadId`
    case `creatorId`
    case `fanId`
    case `creatorName`
    case `creatorAccountId`
    case `fanAccountId`
    case `mediaMode`
    case `scheduledAt`
    case `hardEndAt`
    case `durationSeconds`
    case `graceSeconds`
    case `reconnectBudgetSeconds`
    case `connectedMilliseconds`
    case `reconnectUsedMilliseconds`
    case `reconnectExhaustedAt`
    case `state`
    case `version`
    case `serverNow`
    case `present`
    case `recordingState`
    case `consents`
    case `outcome`
    case `reconciliation`
    case `conversationEpoch`
    case `packet`
    case `summary`
    case `creatorSummaryNote`
    case `summaryState`
    case `summaryRevision`
    case `summarySources`
    case `recordingOccurred`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.commitmentId = try container.decode(String.self, forKey: .commitmentId)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorAccountId = try container.decode(String.self, forKey: .creatorAccountId)
    self.fanAccountId = try container.decode(String.self, forKey: .fanAccountId)
    self.mediaMode = try container.decode(APICallCallSessionMediaMode.self, forKey: .mediaMode)
    self.scheduledAt = try container.decode(String.self, forKey: .scheduledAt)
    self.hardEndAt = try container.decode(String.self, forKey: .hardEndAt)
    self.durationSeconds = try container.decode(Int.self, forKey: .durationSeconds)
    self.graceSeconds = try container.decode(Int.self, forKey: .graceSeconds)
    self.reconnectBudgetSeconds = try container.decode(Int.self, forKey: .reconnectBudgetSeconds)
    self.connectedMilliseconds = try container.decode(Int.self, forKey: .connectedMilliseconds)
    self.reconnectUsedMilliseconds = try container.decode(Int.self, forKey: .reconnectUsedMilliseconds)
    self.reconnectExhaustedAt = try container.decodeIfPresent(String.self, forKey: .reconnectExhaustedAt)
    self.state = try container.decode(APICallCallSessionState.self, forKey: .state)
    self.version = try container.decode(Int.self, forKey: .version)
    self.serverNow = try container.decode(String.self, forKey: .serverNow)
    self.present = try container.decode([APICallCallSessionPresentItem].self, forKey: .present)
    self.recordingState = try container.decode(APICallCallSessionRecordingState.self, forKey: .recordingState)
    self.consents = try container.decode([APICallCallSessionConsentsItem].self, forKey: .consents)
    self.outcome = try container.decode(APICallCallSessionOutcome?.self, forKey: .outcome)
    self.reconciliation = try container.decode(APICallCallSessionReconciliation.self, forKey: .reconciliation)
    self.conversationEpoch = try container.decodeIfPresent(Int.self, forKey: .conversationEpoch)
    self.packet = try container.decode(APICallCallSessionPacket.self, forKey: .packet)
    self.summary = try container.decode(String?.self, forKey: .summary)
    self.creatorSummaryNote = try container.decodeIfPresent(String.self, forKey: .creatorSummaryNote)
    self.summaryState = try container.decodeIfPresent(APICallCallSessionSummaryState.self, forKey: .summaryState)
    self.summaryRevision = try container.decodeIfPresent(Int.self, forKey: .summaryRevision)
    self.summarySources = try container.decodeIfPresent(APICallCallSessionSummarySources.self, forKey: .summarySources)
    self.recordingOccurred = try container.decodeIfPresent(Bool.self, forKey: .recordingOccurred)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(commitmentId, forKey: .commitmentId)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorAccountId, forKey: .creatorAccountId)
    try container.encode(fanAccountId, forKey: .fanAccountId)
    try container.encode(mediaMode, forKey: .mediaMode)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(hardEndAt, forKey: .hardEndAt)
    try container.encode(durationSeconds, forKey: .durationSeconds)
    try container.encode(graceSeconds, forKey: .graceSeconds)
    try container.encode(reconnectBudgetSeconds, forKey: .reconnectBudgetSeconds)
    try container.encode(connectedMilliseconds, forKey: .connectedMilliseconds)
    try container.encode(reconnectUsedMilliseconds, forKey: .reconnectUsedMilliseconds)
    try container.encodeIfPresent(reconnectExhaustedAt, forKey: .reconnectExhaustedAt)
    try container.encode(state, forKey: .state)
    try container.encode(version, forKey: .version)
    try container.encode(serverNow, forKey: .serverNow)
    try container.encode(present, forKey: .present)
    try container.encode(recordingState, forKey: .recordingState)
    try container.encode(consents, forKey: .consents)
    try container.encode(outcome, forKey: .outcome)
    try container.encode(reconciliation, forKey: .reconciliation)
    try container.encodeIfPresent(conversationEpoch, forKey: .conversationEpoch)
    try container.encode(packet, forKey: .packet)
    try container.encode(summary, forKey: .summary)
    try container.encodeIfPresent(creatorSummaryNote, forKey: .creatorSummaryNote)
    try container.encodeIfPresent(summaryState, forKey: .summaryState)
    try container.encodeIfPresent(summaryRevision, forKey: .summaryRevision)
    try container.encodeIfPresent(summarySources, forKey: .summarySources)
    try container.encodeIfPresent(recordingOccurred, forKey: .recordingOccurred)
  }
}

public enum APICallCallSessionMediaMode: String, Codable, Sendable {
  case `audio` = "audio"
  case `video` = "video"
}

public enum APICallCallSessionState: String, Codable, Sendable {
  case `scheduled` = "scheduled"
  case `waiting` = "waiting"
  case `connecting` = "connecting"
  case `connected` = "connected"
  case `reconnecting` = "reconnecting"
  case `ending` = "ending"
  case `ended` = "ended"
  case `cancelled` = "cancelled"
}

public enum APICallCallSessionPresentItem: String, Codable, Sendable {
  case `creator` = "creator"
  case `fan` = "fan"
}

public enum APICallCallSessionRecordingState: String, Codable, Sendable {
  case `off` = "off"
  case `starting` = "starting"
  case `on` = "on"
  case `stopping` = "stopping"
  case `blocked` = "blocked"
}

public struct APICallCallSessionConsentsItem: Codable, Sendable {
  public let `id`: String
  public let `actorAccountId`: String
  public let `role`: APICallCallSessionConsentsItemRole
  public let `purpose`: APICallCallSessionConsentsItemPurpose
  public let `granted`: Bool
  public let `at`: String
  public let `revokedAt`: String?
  public init(id: String, actorAccountId: String, role: APICallCallSessionConsentsItemRole, purpose: APICallCallSessionConsentsItemPurpose, granted: Bool, at: String, revokedAt: String? = nil) {
    self.id = id
    self.actorAccountId = actorAccountId
    self.role = role
    self.purpose = purpose
    self.granted = granted
    self.at = at
    self.revokedAt = revokedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `actorAccountId`
    case `role`
    case `purpose`
    case `granted`
    case `at`
    case `revokedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.actorAccountId = try container.decode(String.self, forKey: .actorAccountId)
    self.role = try container.decode(APICallCallSessionConsentsItemRole.self, forKey: .role)
    self.purpose = try container.decode(APICallCallSessionConsentsItemPurpose.self, forKey: .purpose)
    self.granted = try container.decode(Bool.self, forKey: .granted)
    self.at = try container.decode(String.self, forKey: .at)
    self.revokedAt = try container.decode(String?.self, forKey: .revokedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(actorAccountId, forKey: .actorAccountId)
    try container.encode(role, forKey: .role)
    try container.encode(purpose, forKey: .purpose)
    try container.encode(granted, forKey: .granted)
    try container.encode(at, forKey: .at)
    try container.encode(revokedAt, forKey: .revokedAt)
  }
}

public enum APICallCallSessionConsentsItemRole: String, Codable, Sendable {
  case `creator` = "creator"
  case `fan` = "fan"
}

public enum APICallCallSessionConsentsItemPurpose: String, Codable, Sendable {
  case `recording` = "recording"
  case `summary` = "summary"
  case `content_reuse` = "content_reuse"
  case `ai_source` = "ai_source"
}

public enum APICallCallSessionOutcome: String, Codable, Sendable {
  case `completed` = "completed"
  case `partial` = "partial"
  case `creator_no_show` = "creator_no_show"
  case `fan_no_show` = "fan_no_show"
  case `technical_failure` = "technical_failure"
}

public enum APICallCallSessionReconciliation: String, Codable, Sendable {
  case `pending` = "pending"
  case `complete` = "complete"
  case `blocked` = "blocked"
}

public struct APICallCallSessionPacket: Codable, Sendable {
  public let `summary`: String
  public let `attachmentIds`: [String]
  public init(summary: String, attachmentIds: [String]) {
    self.summary = summary
    self.attachmentIds = attachmentIds
  }
}

public enum APICallCallSessionSummaryState: String, Codable, Sendable {
  case `absent` = "absent"
  case `pending` = "pending"
  case `ready` = "ready"
  case `deleted` = "deleted"
  case `blocked` = "blocked"
}

public struct APICallCallSessionSummarySources: Codable, Sendable {
  public let `kind`: APICallCallSessionSummarySourcesKind
  public let `commitmentId`: String
  public let `noteRevision`: Int
  public init(kind: APICallCallSessionSummarySourcesKind, commitmentId: String, noteRevision: Int) {
    self.kind = kind
    self.commitmentId = commitmentId
    self.noteRevision = noteRevision
  }
}

public enum APICallCallSessionSummarySourcesKind: String, Codable, Sendable {
  case `packet_and_creator_note` = "packet_and_creator_note"
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
  public let `planRef`: APIContentDocumentPlanRef?
  public let `live`: APIContentDocumentLive?
  public init(kind: APIContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentDocumentPlanRef? = nil, live: APIContentDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
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

public struct APIContentDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
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
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
    case `serverTime`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIContentListItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
    self.serverTime = try container.decode(String.self, forKey: .serverTime)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
    try container.encode(serverTime, forKey: .serverTime)
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `creatorId`
    case `creatorName`
    case `creatorHandle`
    case `teamMember`
    case `displayText`
    case `version`
    case `state`
    case `authorKind`
    case `authorLabel`
    case `audienceLabel`
    case `signedActId`
    case `publishedAt`
    case `document`
    case `audienceCount`
    case `sourceState`
    case `quotedText`
    case `quotedHandle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorHandle = try container.decode(String.self, forKey: .creatorHandle)
    self.teamMember = try container.decode(String?.self, forKey: .teamMember)
    self.displayText = try container.decode(String.self, forKey: .displayText)
    self.version = try container.decode(Int.self, forKey: .version)
    self.state = try container.decode(String.self, forKey: .state)
    self.authorKind = try container.decode(APIContentListItemsItemAuthorKind.self, forKey: .authorKind)
    self.authorLabel = try container.decode(String.self, forKey: .authorLabel)
    self.audienceLabel = try container.decode(String.self, forKey: .audienceLabel)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.publishedAt = try container.decode(String?.self, forKey: .publishedAt)
    self.document = try container.decode(APIContentListItemsItemDocument.self, forKey: .document)
    self.audienceCount = try container.decode(Int?.self, forKey: .audienceCount)
    self.sourceState = try container.decode(APIContentListItemsItemSourceState.self, forKey: .sourceState)
    self.quotedText = try container.decode(String?.self, forKey: .quotedText)
    self.quotedHandle = try container.decode(String?.self, forKey: .quotedHandle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorHandle, forKey: .creatorHandle)
    try container.encode(teamMember, forKey: .teamMember)
    try container.encode(displayText, forKey: .displayText)
    try container.encode(version, forKey: .version)
    try container.encode(state, forKey: .state)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(authorLabel, forKey: .authorLabel)
    try container.encode(audienceLabel, forKey: .audienceLabel)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(publishedAt, forKey: .publishedAt)
    try container.encode(document, forKey: .document)
    try container.encode(audienceCount, forKey: .audienceCount)
    try container.encode(sourceState, forKey: .sourceState)
    try container.encode(quotedText, forKey: .quotedText)
    try container.encode(quotedHandle, forKey: .quotedHandle)
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
  public let `planRef`: APIContentListItemsItemDocumentPlanRef?
  public let `live`: APIContentListItemsItemDocumentLive?
  public init(kind: APIContentListItemsItemDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentListItemsItemDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentListItemsItemDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentListItemsItemDocumentPlanRef? = nil, live: APIContentListItemsItemDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentListItemsItemDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentListItemsItemDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentListItemsItemDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentListItemsItemDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentListItemsItemDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
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

public struct APIContentListItemsItemDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
    case `replayReady`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
    self.replayReady = try container.decode(Bool.self, forKey: .replayReady)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
    try container.encode(replayReady, forKey: .replayReady)
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
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIContentReplyListItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
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
  public let `tenure`: APIContentReplyListItemsItemTenure?
  public let `consent`: APIContentReplyListItemsItemConsent
  public let `reaction`: APIContentReplyListItemsItemReaction?
  public init(safetyState: APIContentReplyListItemsItemSafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, tenure: APIContentReplyListItemsItemTenure? = nil, consent: APIContentReplyListItemsItemConsent, reaction: APIContentReplyListItemsItemReaction? = nil) {
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
    self.tenure = tenure
    self.consent = consent
    self.reaction = reaction
  }
  private enum CodingKeys: String, CodingKey {
    case `safetyState`
    case `safetyReviewAvailable`
    case `read`
    case `id`
    case `contentId`
    case `fanId`
    case `handle`
    case `text`
    case `version`
    case `createdAt`
    case `tenure`
    case `consent`
    case `reaction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.safetyState = try container.decode(APIContentReplyListItemsItemSafetyState.self, forKey: .safetyState)
    self.safetyReviewAvailable = try container.decode(Bool.self, forKey: .safetyReviewAvailable)
    self.read = try container.decode(Bool.self, forKey: .read)
    self.id = try container.decode(String.self, forKey: .id)
    self.contentId = try container.decode(String.self, forKey: .contentId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.tenure = try container.decodeIfPresent(APIContentReplyListItemsItemTenure.self, forKey: .tenure)
    self.consent = try container.decode(APIContentReplyListItemsItemConsent.self, forKey: .consent)
    self.reaction = try container.decode(APIContentReplyListItemsItemReaction?.self, forKey: .reaction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(safetyState, forKey: .safetyState)
    try container.encode(safetyReviewAvailable, forKey: .safetyReviewAvailable)
    try container.encode(read, forKey: .read)
    try container.encode(id, forKey: .id)
    try container.encode(contentId, forKey: .contentId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(handle, forKey: .handle)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encodeIfPresent(tenure, forKey: .tenure)
    try container.encode(consent, forKey: .consent)
    try container.encode(reaction, forKey: .reaction)
  }
}

public enum APIContentReplyListItemsItemSafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentReplyListItemsItemTenure: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentReplyListItemsItemTenureBasis
  public let `historyComplete`: APIContentReplyListItemsItemTenureHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIContentReplyListItemsItemTenureBasis, historyComplete: APIContentReplyListItemsItemTenureHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentReplyListItemsItemTenureBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentReplyListItemsItemTenureHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentReplyListItemsItemTenureBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentReplyListItemsItemTenureHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
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
  public let `contentId`: String?
  public let `filter`: APIContentReplyPageFilter
  public init(cursor: String? = nil, limit: Int, contentId: String? = nil, filter: APIContentReplyPageFilter) {
    self.cursor = cursor
    self.limit = limit
    self.contentId = contentId
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

public struct APIContentTenureRecognition: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentTenureRecognitionBasis
  public let `historyComplete`: APIContentTenureRecognitionHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIContentTenureRecognitionBasis, historyComplete: APIContentTenureRecognitionHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentTenureRecognitionBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentTenureRecognitionHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentTenureRecognitionBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentTenureRecognitionHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `version`
    case `target_kind`
    case `target_id`
    case `text`
    case `handle`
    case `created_at`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.version = try container.decode(Int.self, forKey: .version)
    self.target_kind = try container.decode(APIContentThanksFeedValueItemTargetKind.self, forKey: .target_kind)
    self.target_id = try container.decode(String.self, forKey: .target_id)
    self.text = try container.decode(String.self, forKey: .text)
    self.handle = try container.decode(String?.self, forKey: .handle)
    self.created_at = try container.decode(String.self, forKey: .created_at)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(version, forKey: .version)
    try container.encode(target_kind, forKey: .target_kind)
    try container.encode(target_id, forKey: .target_id)
    try container.encode(text, forKey: .text)
    try container.encode(handle, forKey: .handle)
    try container.encode(created_at, forKey: .created_at)
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `creatorId`
    case `creatorName`
    case `creatorHandle`
    case `teamMember`
    case `displayText`
    case `version`
    case `state`
    case `authorKind`
    case `authorLabel`
    case `audienceLabel`
    case `signedActId`
    case `publishedAt`
    case `document`
    case `audienceCount`
    case `sourceState`
    case `quotedText`
    case `quotedHandle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorHandle = try container.decode(String.self, forKey: .creatorHandle)
    self.teamMember = try container.decode(String?.self, forKey: .teamMember)
    self.displayText = try container.decode(String.self, forKey: .displayText)
    self.version = try container.decode(Int.self, forKey: .version)
    self.state = try container.decode(String.self, forKey: .state)
    self.authorKind = try container.decode(APIContentViewAuthorKind.self, forKey: .authorKind)
    self.authorLabel = try container.decode(String.self, forKey: .authorLabel)
    self.audienceLabel = try container.decode(String.self, forKey: .audienceLabel)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.publishedAt = try container.decode(String?.self, forKey: .publishedAt)
    self.document = try container.decode(APIContentViewDocument.self, forKey: .document)
    self.audienceCount = try container.decode(Int?.self, forKey: .audienceCount)
    self.sourceState = try container.decode(APIContentViewSourceState.self, forKey: .sourceState)
    self.quotedText = try container.decode(String?.self, forKey: .quotedText)
    self.quotedHandle = try container.decode(String?.self, forKey: .quotedHandle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorHandle, forKey: .creatorHandle)
    try container.encode(teamMember, forKey: .teamMember)
    try container.encode(displayText, forKey: .displayText)
    try container.encode(version, forKey: .version)
    try container.encode(state, forKey: .state)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(authorLabel, forKey: .authorLabel)
    try container.encode(audienceLabel, forKey: .audienceLabel)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(publishedAt, forKey: .publishedAt)
    try container.encode(document, forKey: .document)
    try container.encode(audienceCount, forKey: .audienceCount)
    try container.encode(sourceState, forKey: .sourceState)
    try container.encode(quotedText, forKey: .quotedText)
    try container.encode(quotedHandle, forKey: .quotedHandle)
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
  public let `planRef`: APIContentViewDocumentPlanRef?
  public let `live`: APIContentViewDocumentLive?
  public init(kind: APIContentViewDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentViewDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentViewDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentViewDocumentPlanRef? = nil, live: APIContentViewDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentViewDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentViewDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentViewDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentViewDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentViewDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
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

public struct APIContentViewDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
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

public struct APINoteReplyPolicy: Codable, Sendable {
  public let `accountId`: String
  public let `creatorId`: String
  public let `limit`: APIJSONValue
  public let `confirmedDays`: Int?
  public let `milestone`: APIJSONValue?
  public let `basis`: APINoteReplyPolicyBasis?
  public let `historyComplete`: APINoteReplyPolicyHistoryComplete
  public let `longerRepliesActive`: Bool
  public let `checkedAt`: String
  public init(accountId: String, creatorId: String, limit: APIJSONValue, confirmedDays: Int? = nil, milestone: APIJSONValue? = nil, basis: APINoteReplyPolicyBasis? = nil, historyComplete: APINoteReplyPolicyHistoryComplete, longerRepliesActive: Bool, checkedAt: String) {
    self.accountId = accountId
    self.creatorId = creatorId
    self.limit = limit
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.longerRepliesActive = longerRepliesActive
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `accountId`
    case `creatorId`
    case `limit`
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `longerRepliesActive`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(String.self, forKey: .accountId)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.limit = try container.decode(APIJSONValue.self, forKey: .limit)
    self.confirmedDays = try container.decode(Int?.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APINoteReplyPolicyBasis?.self, forKey: .basis)
    self.historyComplete = try container.decode(APINoteReplyPolicyHistoryComplete.self, forKey: .historyComplete)
    self.longerRepliesActive = try container.decode(Bool.self, forKey: .longerRepliesActive)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(limit, forKey: .limit)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(longerRepliesActive, forKey: .longerRepliesActive)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APINoteReplyPolicyBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APINoteReplyPolicyHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
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
  public let `tenure`: APIPrivateNoteReplyTenure?
  public let `consent`: APIPrivateNoteReplyConsent
  public let `reaction`: APIPrivateNoteReplyReaction?
  public init(safetyState: APIPrivateNoteReplySafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, tenure: APIPrivateNoteReplyTenure? = nil, consent: APIPrivateNoteReplyConsent, reaction: APIPrivateNoteReplyReaction? = nil) {
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
    self.tenure = tenure
    self.consent = consent
    self.reaction = reaction
  }
  private enum CodingKeys: String, CodingKey {
    case `safetyState`
    case `safetyReviewAvailable`
    case `read`
    case `id`
    case `contentId`
    case `fanId`
    case `handle`
    case `text`
    case `version`
    case `createdAt`
    case `tenure`
    case `consent`
    case `reaction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.safetyState = try container.decode(APIPrivateNoteReplySafetyState.self, forKey: .safetyState)
    self.safetyReviewAvailable = try container.decode(Bool.self, forKey: .safetyReviewAvailable)
    self.read = try container.decode(Bool.self, forKey: .read)
    self.id = try container.decode(String.self, forKey: .id)
    self.contentId = try container.decode(String.self, forKey: .contentId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.tenure = try container.decodeIfPresent(APIPrivateNoteReplyTenure.self, forKey: .tenure)
    self.consent = try container.decode(APIPrivateNoteReplyConsent.self, forKey: .consent)
    self.reaction = try container.decode(APIPrivateNoteReplyReaction?.self, forKey: .reaction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(safetyState, forKey: .safetyState)
    try container.encode(safetyReviewAvailable, forKey: .safetyReviewAvailable)
    try container.encode(read, forKey: .read)
    try container.encode(id, forKey: .id)
    try container.encode(contentId, forKey: .contentId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(handle, forKey: .handle)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encodeIfPresent(tenure, forKey: .tenure)
    try container.encode(consent, forKey: .consent)
    try container.encode(reaction, forKey: .reaction)
  }
}

public enum APIPrivateNoteReplySafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIPrivateNoteReplyTenure: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIPrivateNoteReplyTenureBasis
  public let `historyComplete`: APIPrivateNoteReplyTenureHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIPrivateNoteReplyTenureBasis, historyComplete: APIPrivateNoteReplyTenureHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIPrivateNoteReplyTenureBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIPrivateNoteReplyTenureHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIPrivateNoteReplyTenureBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIPrivateNoteReplyTenureHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
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
  public let `planRef`: APISaveContentDocumentPlanRef?
  public let `live`: APISaveContentDocumentLive?
  public init(kind: APISaveContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APISaveContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APISaveContentDocumentQuote? = nil, packetId: String? = nil, planRef: APISaveContentDocumentPlanRef? = nil, live: APISaveContentDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APISaveContentDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APISaveContentDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APISaveContentDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APISaveContentDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APISaveContentDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
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

public struct APISaveContentDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
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
  private enum CodingKeys: String, CodingKey {
    case `text`
    case `version`
    case `sentMessageId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.sentMessageId = try container.decode(String?.self, forKey: .sentMessageId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(sentMessageId, forKey: .sentMessageId)
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `display_name`
    case `handle`
    case `verification`
    case `owned`
    case `roles`
    case `memberHandle`
    case `viewerAccountId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.display_name = try container.decode(String.self, forKey: .display_name)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.verification = try container.decode(String.self, forKey: .verification)
    self.owned = try container.decode(Bool.self, forKey: .owned)
    self.roles = try container.decode([APIStudioSessionCreatorsItemRolesItem].self, forKey: .roles)
    self.memberHandle = try container.decode(String?.self, forKey: .memberHandle)
    self.viewerAccountId = try container.decode(String.self, forKey: .viewerAccountId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(display_name, forKey: .display_name)
    try container.encode(handle, forKey: .handle)
    try container.encode(verification, forKey: .verification)
    try container.encode(owned, forKey: .owned)
    try container.encode(roles, forKey: .roles)
    try container.encode(memberHandle, forKey: .memberHandle)
    try container.encode(viewerAccountId, forKey: .viewerAccountId)
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
  private enum CodingKeys: String, CodingKey {
    case `account_id`
    case `roles`
    case `revoked_at`
    case `handle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.account_id = try container.decode(String.self, forKey: .account_id)
    self.roles = try container.decode([APIStudioTeamMembersItemRolesItem].self, forKey: .roles)
    self.revoked_at = try container.decode(String?.self, forKey: .revoked_at)
    self.handle = try container.decode(String?.self, forKey: .handle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(account_id, forKey: .account_id)
    try container.encode(roles, forKey: .roles)
    try container.encode(revoked_at, forKey: .revoked_at)
    try container.encode(handle, forKey: .handle)
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `account_id`
    case `handle`
    case `roles`
    case `expires_at`
    case `accepted_at`
    case `revoked_at`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.account_id = try container.decode(String.self, forKey: .account_id)
    self.handle = try container.decode(String?.self, forKey: .handle)
    self.roles = try container.decode([APIStudioTeamInvitationsItemRolesItem].self, forKey: .roles)
    self.expires_at = try container.decode(String.self, forKey: .expires_at)
    self.accepted_at = try container.decode(String?.self, forKey: .accepted_at)
    self.revoked_at = try container.decode(String?.self, forKey: .revoked_at)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(account_id, forKey: .account_id)
    try container.encode(handle, forKey: .handle)
    try container.encode(roles, forKey: .roles)
    try container.encode(expires_at, forKey: .expires_at)
    try container.encode(accepted_at, forKey: .accepted_at)
    try container.encode(revoked_at, forKey: .revoked_at)
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
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
    case `coverage`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIStudioThreadEntriesItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
    self.coverage = try container.decode(APIStudioThreadEntriesCoverage.self, forKey: .coverage)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
    try container.encode(coverage, forKey: .coverage)
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `creatorId`
    case `creatorName`
    case `creatorHandle`
    case `teamMember`
    case `displayText`
    case `version`
    case `state`
    case `authorKind`
    case `authorLabel`
    case `audienceLabel`
    case `signedActId`
    case `publishedAt`
    case `document`
    case `audienceCount`
    case `sourceState`
    case `quotedText`
    case `quotedHandle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorHandle = try container.decode(String.self, forKey: .creatorHandle)
    self.teamMember = try container.decode(String?.self, forKey: .teamMember)
    self.displayText = try container.decode(String.self, forKey: .displayText)
    self.version = try container.decode(Int.self, forKey: .version)
    self.state = try container.decode(String.self, forKey: .state)
    self.authorKind = try container.decode(APIContentReviewViewAuthorKind.self, forKey: .authorKind)
    self.authorLabel = try container.decode(String.self, forKey: .authorLabel)
    self.audienceLabel = try container.decode(String.self, forKey: .audienceLabel)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.publishedAt = try container.decode(String?.self, forKey: .publishedAt)
    self.document = try container.decode(APIContentReviewViewDocument.self, forKey: .document)
    self.audienceCount = try container.decode(Int?.self, forKey: .audienceCount)
    self.sourceState = try container.decode(APIContentReviewViewSourceState.self, forKey: .sourceState)
    self.quotedText = try container.decode(String?.self, forKey: .quotedText)
    self.quotedHandle = try container.decode(String?.self, forKey: .quotedHandle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorHandle, forKey: .creatorHandle)
    try container.encode(teamMember, forKey: .teamMember)
    try container.encode(displayText, forKey: .displayText)
    try container.encode(version, forKey: .version)
    try container.encode(state, forKey: .state)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(authorLabel, forKey: .authorLabel)
    try container.encode(audienceLabel, forKey: .audienceLabel)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(publishedAt, forKey: .publishedAt)
    try container.encode(document, forKey: .document)
    try container.encode(audienceCount, forKey: .audienceCount)
    try container.encode(sourceState, forKey: .sourceState)
    try container.encode(quotedText, forKey: .quotedText)
    try container.encode(quotedHandle, forKey: .quotedHandle)
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
  public let `planRef`: APIContentReviewViewDocumentPlanRef?
  public let `live`: APIContentReviewViewDocumentLive?
  public init(kind: APIContentReviewViewDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentReviewViewDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentReviewViewDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentReviewViewDocumentPlanRef? = nil, live: APIContentReviewViewDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentReviewViewDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentReviewViewDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentReviewViewDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentReviewViewDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentReviewViewDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
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

public struct APIContentReviewViewDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
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
  private enum CodingKeys: String, CodingKey {
    case `accountId`
    case `adultEligible`
    case `sessionId`
    case `expiresAt`
    case `mode`
    case `fan`
    case `creator`
    case `teams`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(String.self, forKey: .accountId)
    self.adultEligible = try container.decode(APISessionAdultEligible.self, forKey: .adultEligible)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.mode = try container.decode(APISessionMode.self, forKey: .mode)
    self.fan = try container.decode(APISessionFan?.self, forKey: .fan)
    self.creator = try container.decode(APISessionCreator?.self, forKey: .creator)
    self.teams = try container.decode([APISessionTeamsItem].self, forKey: .teams)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(adultEligible, forKey: .adultEligible)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(mode, forKey: .mode)
    try container.encode(fan, forKey: .fan)
    try container.encode(creator, forKey: .creator)
    try container.encode(teams, forKey: .teams)
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
  private enum CodingKeys: String, CodingKey {
    case `accountId`
    case `adultEligible`
    case `sessionId`
    case `expiresAt`
    case `mode`
    case `fan`
    case `creator`
    case `teams`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(String.self, forKey: .accountId)
    self.adultEligible = try container.decode(APIIdentityCompletionSessionAdultEligible.self, forKey: .adultEligible)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.mode = try container.decode(APIIdentityCompletionSessionMode.self, forKey: .mode)
    self.fan = try container.decode(APIIdentityCompletionSessionFan?.self, forKey: .fan)
    self.creator = try container.decode(APIIdentityCompletionSessionCreator?.self, forKey: .creator)
    self.teams = try container.decode([APIIdentityCompletionSessionTeamsItem].self, forKey: .teams)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(adultEligible, forKey: .adultEligible)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(mode, forKey: .mode)
    try container.encode(fan, forKey: .fan)
    try container.encode(creator, forKey: .creator)
    try container.encode(teams, forKey: .teams)
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
  public let `postUrl`: String?
  public let `expiresAt`: String
  public let `state`: APIProofState
  public let `reason`: String?
  public init(id: String, code: String, platform: APIProofPlatform, accountUrl: String, postUrl: String? = nil, expiresAt: String, state: APIProofState, reason: String? = nil) {
    self.id = id
    self.code = code
    self.platform = platform
    self.accountUrl = accountUrl
    self.postUrl = postUrl
    self.expiresAt = expiresAt
    self.state = state
    self.reason = reason
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `code`
    case `platform`
    case `accountUrl`
    case `postUrl`
    case `expiresAt`
    case `state`
    case `reason`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.code = try container.decode(String.self, forKey: .code)
    self.platform = try container.decode(APIProofPlatform.self, forKey: .platform)
    self.accountUrl = try container.decode(String.self, forKey: .accountUrl)
    self.postUrl = try container.decode(String?.self, forKey: .postUrl)
    self.expiresAt = try container.decode(String.self, forKey: .expiresAt)
    self.state = try container.decode(APIProofState.self, forKey: .state)
    self.reason = try container.decode(String?.self, forKey: .reason)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(code, forKey: .code)
    try container.encode(platform, forKey: .platform)
    try container.encode(accountUrl, forKey: .accountUrl)
    try container.encode(postUrl, forKey: .postUrl)
    try container.encode(expiresAt, forKey: .expiresAt)
    try container.encode(state, forKey: .state)
    try container.encode(reason, forKey: .reason)
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

public struct APITeamRolesUpdateInput: Codable, Sendable {
  public let `expectedRoles`: [APITeamRolesUpdateInputExpectedRolesItem]
  public let `roles`: [APITeamRolesUpdateInputRolesItem]
  public init(expectedRoles: [APITeamRolesUpdateInputExpectedRolesItem], roles: [APITeamRolesUpdateInputRolesItem]) {
    self.expectedRoles = expectedRoles
    self.roles = roles
  }
}

public enum APITeamRolesUpdateInputExpectedRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public enum APITeamRolesUpdateInputRolesItem: String, Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `signedActId`
    case `creatorName`
    case `actType`
    case `contentHash`
    case `verifiedAt`
    case `status`
    case `content`
    case `contentAvailable`
    case `explanation`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.signedActId = try container.decode(String.self, forKey: .signedActId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.actType = try container.decode(String.self, forKey: .actType)
    self.contentHash = try container.decode(String.self, forKey: .contentHash)
    self.verifiedAt = try container.decode(String.self, forKey: .verifiedAt)
    self.status = try container.decode(APIPublicSignatureStatus.self, forKey: .status)
    self.content = try container.decode(APIJSONValue?.self, forKey: .content)
    self.contentAvailable = try container.decode(Bool.self, forKey: .contentAvailable)
    self.explanation = try container.decode(String.self, forKey: .explanation)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(actType, forKey: .actType)
    try container.encode(contentHash, forKey: .contentHash)
    try container.encode(verifiedAt, forKey: .verifiedAt)
    try container.encode(status, forKey: .status)
    try container.encode(content, forKey: .content)
    try container.encode(contentAvailable, forKey: .contentAvailable)
    try container.encode(explanation, forKey: .explanation)
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
  public let `systemLink`: APIMessageSystemLink?
  public init(id: String, threadId: String, authorKind: APIMessageAuthorKind, text: String, deliveryState: APIMessageDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIMessageSystemLink? = nil) {
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
    self.systemLink = systemLink
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIMessageAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIMessageDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decodeIfPresent(String.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIMessageSystemLink.self, forKey: .systemLink)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encodeIfPresent(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
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

public struct APIMessageSystemLink: Codable, Sendable {
  public let `kind`: APIMessageSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIMessageSystemLinkLabel
  public init(kind: APIMessageSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIMessageSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIMessageSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIMessageSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
}

public struct APIAcceptedMessage: Codable, Sendable {
  public let `message`: APIAcceptedMessageMessage
  public let `generationId`: String?
  public init(message: APIAcceptedMessageMessage, generationId: String? = nil) {
    self.message = message
    self.generationId = generationId
  }
  private enum CodingKeys: String, CodingKey {
    case `message`
    case `generationId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.message = try container.decode(APIAcceptedMessageMessage.self, forKey: .message)
    self.generationId = try container.decode(String?.self, forKey: .generationId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(message, forKey: .message)
    try container.encode(generationId, forKey: .generationId)
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
  public let `systemLink`: APIAcceptedMessageMessageSystemLink?
  public init(id: String, threadId: String, authorKind: APIAcceptedMessageMessageAuthorKind, text: String, deliveryState: APIAcceptedMessageMessageDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIAcceptedMessageMessageSystemLink? = nil) {
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
    self.systemLink = systemLink
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIAcceptedMessageMessageAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIAcceptedMessageMessageDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decodeIfPresent(String.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIAcceptedMessageMessageSystemLink.self, forKey: .systemLink)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encodeIfPresent(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
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

public struct APIAcceptedMessageMessageSystemLink: Codable, Sendable {
  public let `kind`: APIAcceptedMessageMessageSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIAcceptedMessageMessageSystemLinkLabel
  public init(kind: APIAcceptedMessageMessageSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIAcceptedMessageMessageSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIAcceptedMessageMessageSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIAcceptedMessageMessageSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
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
  public let `systemLink`: APIFrameSystemLink?
  public init(threadId: String, cursor: Int, epoch: Int, kind: APIFrameKind, messageId: String, authorKind: APIFrameAuthorKind, text: String, generationId: String? = nil, sequence: Int, control: APIFrameControl? = nil, systemLink: APIFrameSystemLink? = nil) {
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
    self.systemLink = systemLink
  }
  private enum CodingKeys: String, CodingKey {
    case `threadId`
    case `cursor`
    case `epoch`
    case `kind`
    case `messageId`
    case `authorKind`
    case `text`
    case `generationId`
    case `sequence`
    case `control`
    case `systemLink`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.cursor = try container.decode(Int.self, forKey: .cursor)
    self.epoch = try container.decode(Int.self, forKey: .epoch)
    self.kind = try container.decode(APIFrameKind.self, forKey: .kind)
    self.messageId = try container.decode(String.self, forKey: .messageId)
    self.authorKind = try container.decode(APIFrameAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.generationId = try container.decode(String?.self, forKey: .generationId)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.control = try container.decodeIfPresent(APIFrameControl.self, forKey: .control)
    self.systemLink = try container.decodeIfPresent(APIFrameSystemLink.self, forKey: .systemLink)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(cursor, forKey: .cursor)
    try container.encode(epoch, forKey: .epoch)
    try container.encode(kind, forKey: .kind)
    try container.encode(messageId, forKey: .messageId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(generationId, forKey: .generationId)
    try container.encode(sequence, forKey: .sequence)
    try container.encodeIfPresent(control, forKey: .control)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
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

public struct APIFrameSystemLink: Codable, Sendable {
  public let `kind`: APIFrameSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIFrameSystemLinkLabel
  public init(kind: APIFrameSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIFrameSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIFrameSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIFrameSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
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
  public let `systemLink`: APIThreadTimelineMessagesItemSystemLink?
  public init(id: String, threadId: String, authorKind: APIThreadTimelineMessagesItemAuthorKind, text: String, deliveryState: APIThreadTimelineMessagesItemDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIThreadTimelineMessagesItemSystemLink? = nil) {
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
    self.systemLink = systemLink
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIThreadTimelineMessagesItemAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIThreadTimelineMessagesItemDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decodeIfPresent(String.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIThreadTimelineMessagesItemSystemLink.self, forKey: .systemLink)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encodeIfPresent(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
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

public struct APIThreadTimelineMessagesItemSystemLink: Codable, Sendable {
  public let `kind`: APIThreadTimelineMessagesItemSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIThreadTimelineMessagesItemSystemLinkLabel
  public init(kind: APIThreadTimelineMessagesItemSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIThreadTimelineMessagesItemSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIThreadTimelineMessagesItemSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIThreadTimelineMessagesItemSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
}

public struct APIConversationAgentReplyVersion: Codable, Sendable {
  public let `id`: String
  public let `hash`: String
  public init(id: String, hash: String) {
    self.id = id
    self.hash = hash
  }
}

public struct APIConversationAuditEntry: Codable, Sendable {
  public let `id`: String
  public let `readerAccountId`: String
  public let `role`: APIConversationAuditEntryRole
  public let `readAt`: String
  public init(id: String, readerAccountId: String, role: APIConversationAuditEntryRole, readAt: String) {
    self.id = id
    self.readerAccountId = readerAccountId
    self.role = role
    self.readAt = readAt
  }
}

public enum APIConversationAuditEntryRole: String, Codable, Sendable {
  case `creator` = "creator"
  case `triage` = "triage"
  case `ops` = "ops"
}

public struct APIConversationBeginConversation: Codable, Sendable {
  public let `creatorId`: String
  public let `policyVersion`: String
  public let `accessNoticeAccepted`: APIConversationBeginConversationAccessNoticeAccepted
  public let `idempotencyKey`: String
  public init(creatorId: String, policyVersion: String, accessNoticeAccepted: APIConversationBeginConversationAccessNoticeAccepted, idempotencyKey: String) {
    self.creatorId = creatorId
    self.policyVersion = policyVersion
    self.accessNoticeAccepted = accessNoticeAccepted
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIConversationBeginConversationAccessNoticeAccepted: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIConversationConsentInput: Codable, Sendable {
  public let `version`: String
  public let `accepted`: Bool
  public init(version: String, accepted: Bool) {
    self.version = version
    self.accepted = accepted
  }
}

public struct APIConversationConversationAccountPage: Codable, Sendable {
  public let `fan`: APIConversationConversationAccountPageFan
  public let `threads`: [APIConversationConversationAccountPageThreadsItem]
  public let `nextCursor`: String?
  public init(fan: APIConversationConversationAccountPageFan, threads: [APIConversationConversationAccountPageThreadsItem], nextCursor: String? = nil) {
    self.fan = fan
    self.threads = threads
    self.nextCursor = nextCursor
  }
  private enum CodingKeys: String, CodingKey {
    case `fan`
    case `threads`
    case `nextCursor`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.fan = try container.decode(APIConversationConversationAccountPageFan.self, forKey: .fan)
    self.threads = try container.decode([APIConversationConversationAccountPageThreadsItem].self, forKey: .threads)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(fan, forKey: .fan)
    try container.encode(threads, forKey: .threads)
    try container.encode(nextCursor, forKey: .nextCursor)
  }
}

public struct APIConversationConversationAccountPageFan: Codable, Sendable {
  public let `id`: String
  public let `handle`: String
  public let `intro`: String?
  public init(id: String, handle: String, intro: String? = nil) {
    self.id = id
    self.handle = handle
    self.intro = intro
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `handle`
    case `intro`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.intro = try container.decode(String?.self, forKey: .intro)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(handle, forKey: .handle)
    try container.encode(intro, forKey: .intro)
  }
}

public struct APIConversationConversationAccountPageThreadsItem: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `fanId`: String
  public let `name`: String
  public init(id: String, creatorId: String, fanId: String, name: String) {
    self.id = id
    self.creatorId = creatorId
    self.fanId = fanId
    self.name = name
  }
}

public enum APIConversationConversationAuthorship: String, Codable, Sendable {
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

public struct APIConversationConversationCallControl: Codable, Sendable {
  public let `idempotencyKey`: String
  public let `expectedEpoch`: Int
  public init(idempotencyKey: String, expectedEpoch: Int) {
    self.idempotencyKey = idempotencyKey
    self.expectedEpoch = expectedEpoch
  }
}

public struct APIConversationConversationCorrectionCommand: Codable, Sendable {
  public let `actType`: APIConversationConversationCorrectionCommandActType
  public let `subjectId`: String
  public let `content`: APIConversationConversationCorrectionCommandContent
  public init(actType: APIConversationConversationCorrectionCommandActType, subjectId: String, content: APIConversationConversationCorrectionCommandContent) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APIConversationConversationCorrectionCommandActType: String, Codable, Sendable {
  case `correction` = "correction"
}

public struct APIConversationConversationCorrectionCommandContent: Codable, Sendable {
  public let `kind`: APIConversationConversationCorrectionCommandContentKind
  public let `creatorId`: String
  public let `threadId`: String
  public let `fanId`: String
  public let `messageVersion`: Int
  public let `text`: String
  public init(kind: APIConversationConversationCorrectionCommandContentKind, creatorId: String, threadId: String, fanId: String, messageVersion: Int, text: String) {
    self.kind = kind
    self.creatorId = creatorId
    self.threadId = threadId
    self.fanId = fanId
    self.messageVersion = messageVersion
    self.text = text
  }
}

public enum APIConversationConversationCorrectionCommandContentKind: String, Codable, Sendable {
  case `conversation_correction` = "conversation_correction"
}

public struct APIConversationConversationCorrectionInput: Codable, Sendable {
  public let `command`: APIConversationConversationCorrectionInputCommand
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(command: APIConversationConversationCorrectionInputCommand, signedActId: String, idempotencyKey: String) {
    self.command = command
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIConversationConversationCorrectionInputCommand: Codable, Sendable {
  public let `actType`: APIConversationConversationCorrectionInputCommandActType
  public let `subjectId`: String
  public let `content`: APIConversationConversationCorrectionInputCommandContent
  public init(actType: APIConversationConversationCorrectionInputCommandActType, subjectId: String, content: APIConversationConversationCorrectionInputCommandContent) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APIConversationConversationCorrectionInputCommandActType: String, Codable, Sendable {
  case `correction` = "correction"
}

public struct APIConversationConversationCorrectionInputCommandContent: Codable, Sendable {
  public let `kind`: APIConversationConversationCorrectionInputCommandContentKind
  public let `creatorId`: String
  public let `threadId`: String
  public let `fanId`: String
  public let `messageVersion`: Int
  public let `text`: String
  public init(kind: APIConversationConversationCorrectionInputCommandContentKind, creatorId: String, threadId: String, fanId: String, messageVersion: Int, text: String) {
    self.kind = kind
    self.creatorId = creatorId
    self.threadId = threadId
    self.fanId = fanId
    self.messageVersion = messageVersion
    self.text = text
  }
}

public enum APIConversationConversationCorrectionInputCommandContentKind: String, Codable, Sendable {
  case `conversation_correction` = "conversation_correction"
}

public struct APIConversationConversationMessage: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIConversationConversationMessageAuthorKind
  public let `text`: String
  public let `deliveryState`: APIConversationConversationMessageDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public let `systemLink`: APIConversationConversationMessageSystemLink?
  public let `citations`: [String]
  public let `createdAt`: String
  public let `offTheRecord`: Bool
  public let `version`: Int
  public let `agentVersion`: APIConversationConversationMessageAgentVersion?
  public let `feedback`: APIConversationConversationMessageFeedback?
  public let `recording`: APIJSONValue?
  public let `correction`: APIConversationConversationMessageCorrection?
  public init(id: String, threadId: String, authorKind: APIConversationConversationMessageAuthorKind, text: String, deliveryState: APIConversationConversationMessageDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIConversationConversationMessageSystemLink? = nil, citations: [String], createdAt: String, offTheRecord: Bool, version: Int, agentVersion: APIConversationConversationMessageAgentVersion? = nil, feedback: APIConversationConversationMessageFeedback? = nil, recording: APIJSONValue? = nil, correction: APIConversationConversationMessageCorrection? = nil) {
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
    self.systemLink = systemLink
    self.citations = citations
    self.createdAt = createdAt
    self.offTheRecord = offTheRecord
    self.version = version
    self.agentVersion = agentVersion
    self.feedback = feedback
    self.recording = recording
    self.correction = correction
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
    case `citations`
    case `createdAt`
    case `offTheRecord`
    case `version`
    case `agentVersion`
    case `feedback`
    case `recording`
    case `correction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIConversationConversationMessageAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIConversationConversationMessageDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decode(String?.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIConversationConversationMessageSystemLink.self, forKey: .systemLink)
    self.citations = try container.decode([String].self, forKey: .citations)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.offTheRecord = try container.decode(Bool.self, forKey: .offTheRecord)
    self.version = try container.decode(Int.self, forKey: .version)
    self.agentVersion = try container.decodeIfPresent(APIConversationConversationMessageAgentVersion.self, forKey: .agentVersion)
    self.feedback = try container.decodeIfPresent(APIConversationConversationMessageFeedback.self, forKey: .feedback)
    self.recording = try container.decodeIfPresent(APIJSONValue.self, forKey: .recording)
    self.correction = try container.decodeIfPresent(APIConversationConversationMessageCorrection.self, forKey: .correction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
    try container.encode(citations, forKey: .citations)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encode(offTheRecord, forKey: .offTheRecord)
    try container.encode(version, forKey: .version)
    try container.encodeIfPresent(agentVersion, forKey: .agentVersion)
    try container.encodeIfPresent(feedback, forKey: .feedback)
    try container.encodeIfPresent(recording, forKey: .recording)
    try container.encodeIfPresent(correction, forKey: .correction)
  }
}

public enum APIConversationConversationMessageAuthorKind: String, Codable, Sendable {
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

public enum APIConversationConversationMessageDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct APIConversationConversationMessageSystemLink: Codable, Sendable {
  public let `kind`: APIConversationConversationMessageSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIConversationConversationMessageSystemLinkLabel
  public init(kind: APIConversationConversationMessageSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIConversationConversationMessageSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIConversationConversationMessageSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIConversationConversationMessageSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
}

public struct APIConversationConversationMessageAgentVersion: Codable, Sendable {
  public let `id`: String
  public let `hash`: String
  public init(id: String, hash: String) {
    self.id = id
    self.hash = hash
  }
}

public enum APIConversationConversationMessageFeedback: String, Codable, Sendable {
  case `helpful` = "helpful"
  case `not_helpful` = "not_helpful"
}

public struct APIConversationConversationMessageCorrection: Codable, Sendable {
  public let `originalMessageId`: String
  public let `originalVersion`: Int
  public init(originalMessageId: String, originalVersion: Int) {
    self.originalMessageId = originalMessageId
    self.originalVersion = originalVersion
  }
}

public struct APIConversationConversationPage: Codable, Sendable {
  public let `threadId`: String
  public let `creatorId`: String
  public let `fanId`: String
  public let `creatorName`: String
  public let `fanHandle`: String
  public let `control`: APIConversationConversationPageControl
  public let `epoch`: Int
  public let `cursor`: Int
  public let `revision`: Int
  public let `generationSequences`: [String: Int]
  public let `messages`: [APIConversationConversationPageMessagesItem]
  public let `before`: Int?
  public let `offTheRecord`: Bool
  public let `introShared`: Bool
  public let `consentCurrent`: Bool
  public let `canSend`: Bool
  public let `unavailableReason`: String?
  public let `feedbackPolicy`: APIConversationConversationPageFeedbackPolicy?
  public init(threadId: String, creatorId: String, fanId: String, creatorName: String, fanHandle: String, control: APIConversationConversationPageControl, epoch: Int, cursor: Int, revision: Int, generationSequences: [String: Int], messages: [APIConversationConversationPageMessagesItem], before: Int? = nil, offTheRecord: Bool, introShared: Bool, consentCurrent: Bool, canSend: Bool, unavailableReason: String? = nil, feedbackPolicy: APIConversationConversationPageFeedbackPolicy? = nil) {
    self.threadId = threadId
    self.creatorId = creatorId
    self.fanId = fanId
    self.creatorName = creatorName
    self.fanHandle = fanHandle
    self.control = control
    self.epoch = epoch
    self.cursor = cursor
    self.revision = revision
    self.generationSequences = generationSequences
    self.messages = messages
    self.before = before
    self.offTheRecord = offTheRecord
    self.introShared = introShared
    self.consentCurrent = consentCurrent
    self.canSend = canSend
    self.unavailableReason = unavailableReason
    self.feedbackPolicy = feedbackPolicy
  }
  private enum CodingKeys: String, CodingKey {
    case `threadId`
    case `creatorId`
    case `fanId`
    case `creatorName`
    case `fanHandle`
    case `control`
    case `epoch`
    case `cursor`
    case `revision`
    case `generationSequences`
    case `messages`
    case `before`
    case `offTheRecord`
    case `introShared`
    case `consentCurrent`
    case `canSend`
    case `unavailableReason`
    case `feedbackPolicy`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.fanHandle = try container.decode(String.self, forKey: .fanHandle)
    self.control = try container.decode(APIConversationConversationPageControl.self, forKey: .control)
    self.epoch = try container.decode(Int.self, forKey: .epoch)
    self.cursor = try container.decode(Int.self, forKey: .cursor)
    self.revision = try container.decode(Int.self, forKey: .revision)
    self.generationSequences = try container.decode([String: Int].self, forKey: .generationSequences)
    self.messages = try container.decode([APIConversationConversationPageMessagesItem].self, forKey: .messages)
    self.before = try container.decode(Int?.self, forKey: .before)
    self.offTheRecord = try container.decode(Bool.self, forKey: .offTheRecord)
    self.introShared = try container.decode(Bool.self, forKey: .introShared)
    self.consentCurrent = try container.decode(Bool.self, forKey: .consentCurrent)
    self.canSend = try container.decode(Bool.self, forKey: .canSend)
    self.unavailableReason = try container.decode(String?.self, forKey: .unavailableReason)
    self.feedbackPolicy = try container.decodeIfPresent(APIConversationConversationPageFeedbackPolicy.self, forKey: .feedbackPolicy)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(fanHandle, forKey: .fanHandle)
    try container.encode(control, forKey: .control)
    try container.encode(epoch, forKey: .epoch)
    try container.encode(cursor, forKey: .cursor)
    try container.encode(revision, forKey: .revision)
    try container.encode(generationSequences, forKey: .generationSequences)
    try container.encode(messages, forKey: .messages)
    try container.encode(before, forKey: .before)
    try container.encode(offTheRecord, forKey: .offTheRecord)
    try container.encode(introShared, forKey: .introShared)
    try container.encode(consentCurrent, forKey: .consentCurrent)
    try container.encode(canSend, forKey: .canSend)
    try container.encode(unavailableReason, forKey: .unavailableReason)
    try container.encodeIfPresent(feedbackPolicy, forKey: .feedbackPolicy)
  }
}

public enum APIConversationConversationPageControl: String, Codable, Sendable {
  case `ai_active` = "ai_active"
  case `human_active` = "human_active"
  case `ai_paused` = "ai_paused"
  case `closed` = "closed"
  case `blocked` = "blocked"
}

public struct APIConversationConversationPageMessagesItem: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIConversationConversationPageMessagesItemAuthorKind
  public let `text`: String
  public let `deliveryState`: APIConversationConversationPageMessagesItemDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public let `systemLink`: APIConversationConversationPageMessagesItemSystemLink?
  public let `citations`: [String]
  public let `createdAt`: String
  public let `offTheRecord`: Bool
  public let `version`: Int
  public let `agentVersion`: APIConversationConversationPageMessagesItemAgentVersion?
  public let `feedback`: APIConversationConversationPageMessagesItemFeedback?
  public let `recording`: APIJSONValue?
  public let `correction`: APIConversationConversationPageMessagesItemCorrection?
  public init(id: String, threadId: String, authorKind: APIConversationConversationPageMessagesItemAuthorKind, text: String, deliveryState: APIConversationConversationPageMessagesItemDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIConversationConversationPageMessagesItemSystemLink? = nil, citations: [String], createdAt: String, offTheRecord: Bool, version: Int, agentVersion: APIConversationConversationPageMessagesItemAgentVersion? = nil, feedback: APIConversationConversationPageMessagesItemFeedback? = nil, recording: APIJSONValue? = nil, correction: APIConversationConversationPageMessagesItemCorrection? = nil) {
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
    self.systemLink = systemLink
    self.citations = citations
    self.createdAt = createdAt
    self.offTheRecord = offTheRecord
    self.version = version
    self.agentVersion = agentVersion
    self.feedback = feedback
    self.recording = recording
    self.correction = correction
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
    case `citations`
    case `createdAt`
    case `offTheRecord`
    case `version`
    case `agentVersion`
    case `feedback`
    case `recording`
    case `correction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIConversationConversationPageMessagesItemAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIConversationConversationPageMessagesItemDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decode(String?.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIConversationConversationPageMessagesItemSystemLink.self, forKey: .systemLink)
    self.citations = try container.decode([String].self, forKey: .citations)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.offTheRecord = try container.decode(Bool.self, forKey: .offTheRecord)
    self.version = try container.decode(Int.self, forKey: .version)
    self.agentVersion = try container.decodeIfPresent(APIConversationConversationPageMessagesItemAgentVersion.self, forKey: .agentVersion)
    self.feedback = try container.decodeIfPresent(APIConversationConversationPageMessagesItemFeedback.self, forKey: .feedback)
    self.recording = try container.decodeIfPresent(APIJSONValue.self, forKey: .recording)
    self.correction = try container.decodeIfPresent(APIConversationConversationPageMessagesItemCorrection.self, forKey: .correction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
    try container.encode(citations, forKey: .citations)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encode(offTheRecord, forKey: .offTheRecord)
    try container.encode(version, forKey: .version)
    try container.encodeIfPresent(agentVersion, forKey: .agentVersion)
    try container.encodeIfPresent(feedback, forKey: .feedback)
    try container.encodeIfPresent(recording, forKey: .recording)
    try container.encodeIfPresent(correction, forKey: .correction)
  }
}

public enum APIConversationConversationPageMessagesItemAuthorKind: String, Codable, Sendable {
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

public enum APIConversationConversationPageMessagesItemDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct APIConversationConversationPageMessagesItemSystemLink: Codable, Sendable {
  public let `kind`: APIConversationConversationPageMessagesItemSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIConversationConversationPageMessagesItemSystemLinkLabel
  public init(kind: APIConversationConversationPageMessagesItemSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIConversationConversationPageMessagesItemSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIConversationConversationPageMessagesItemSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIConversationConversationPageMessagesItemSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
}

public struct APIConversationConversationPageMessagesItemAgentVersion: Codable, Sendable {
  public let `id`: String
  public let `hash`: String
  public init(id: String, hash: String) {
    self.id = id
    self.hash = hash
  }
}

public enum APIConversationConversationPageMessagesItemFeedback: String, Codable, Sendable {
  case `helpful` = "helpful"
  case `not_helpful` = "not_helpful"
}

public struct APIConversationConversationPageMessagesItemCorrection: Codable, Sendable {
  public let `originalMessageId`: String
  public let `originalVersion`: Int
  public init(originalMessageId: String, originalVersion: Int) {
    self.originalMessageId = originalMessageId
    self.originalVersion = originalVersion
  }
}

public struct APIConversationConversationPageFeedbackPolicy: Codable, Sendable {
  public let `version`: String
  public let `notice`: String
  public init(version: String, notice: String) {
    self.version = version
    self.notice = notice
  }
}

public struct APIConversationConversationRecordingCommand: Codable, Sendable {
  public let `actType`: APIConversationConversationRecordingCommandActType
  public let `subjectId`: String
  public let `content`: APIConversationConversationRecordingCommandContent
  public init(actType: APIConversationConversationRecordingCommandActType, subjectId: String, content: APIConversationConversationRecordingCommandContent) {
    self.actType = actType
    self.subjectId = subjectId
    self.content = content
  }
}

public enum APIConversationConversationRecordingCommandActType: String, Codable, Sendable {
  case `reply` = "reply"
}

public struct APIConversationConversationRecordingCommandContent: Codable, Sendable {
  public let `mediaAssetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `mimeType`: APIConversationConversationRecordingCommandContentMimeType
  public let `durationMs`: Int
  public let `bytes`: Int
  public init(mediaAssetId: String, version: Int, sha256: String, mimeType: APIConversationConversationRecordingCommandContentMimeType, durationMs: Int, bytes: Int) {
    self.mediaAssetId = mediaAssetId
    self.version = version
    self.sha256 = sha256
    self.mimeType = mimeType
    self.durationMs = durationMs
    self.bytes = bytes
  }
}

public enum APIConversationConversationRecordingCommandContentMimeType: String, Codable, Sendable {
  case `audio_mp4` = "audio/mp4"
}

public struct APIConversationConversationRecordingInput: Codable, Sendable {
  public let `evidence`: APIConversationConversationRecordingInputEvidence
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(evidence: APIConversationConversationRecordingInputEvidence, signedActId: String, idempotencyKey: String) {
    self.evidence = evidence
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIConversationConversationRecordingInputEvidence: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `mimeType`: APIConversationConversationRecordingInputEvidenceMimeType
  public let `durationMs`: Int
  public let `bytes`: Int
  public init(assetId: String, version: Int, sha256: String, mimeType: APIConversationConversationRecordingInputEvidenceMimeType, durationMs: Int, bytes: Int) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.mimeType = mimeType
    self.durationMs = durationMs
    self.bytes = bytes
  }
}

public enum APIConversationConversationRecordingInputEvidenceMimeType: String, Codable, Sendable {
  case `audio_mp4` = "audio/mp4"
}

public struct APIConversationConversationRecordingResult: Codable, Sendable {
  public let `messageId`: String
  public let `threadId`: String
  public let `signedActId`: String
  public init(messageId: String, threadId: String, signedActId: String) {
    self.messageId = messageId
    self.threadId = threadId
    self.signedActId = signedActId
  }
}

public typealias APIConversationConversationRecordingView = APIJSONValue

public struct APIConversationConversationTimeline: Codable, Sendable {
  public let `threadId`: String
  public let `creatorId`: String
  public let `fanId`: String
  public let `control`: APIConversationConversationTimelineControl
  public let `epoch`: Int
  public let `cursor`: Int
  public let `generationSequences`: [String: Int]
  public let `messages`: [APIConversationConversationTimelineMessagesItem]
  public init(threadId: String, creatorId: String, fanId: String, control: APIConversationConversationTimelineControl, epoch: Int, cursor: Int, generationSequences: [String: Int], messages: [APIConversationConversationTimelineMessagesItem]) {
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

public enum APIConversationConversationTimelineControl: String, Codable, Sendable {
  case `ai_active` = "ai_active"
  case `human_active` = "human_active"
  case `ai_paused` = "ai_paused"
  case `closed` = "closed"
  case `blocked` = "blocked"
}

public struct APIConversationConversationTimelineMessagesItem: Codable, Sendable {
  public let `id`: String
  public let `threadId`: String
  public let `authorKind`: APIConversationConversationTimelineMessagesItemAuthorKind
  public let `text`: String
  public let `deliveryState`: APIConversationConversationTimelineMessagesItemDeliveryState
  public let `controlEpoch`: Int
  public let `sequence`: Int
  public let `signedActId`: String?
  public let `member`: String?
  public let `authorAccountId`: String?
  public let `systemLink`: APIConversationConversationTimelineMessagesItemSystemLink?
  public let `citations`: [String]
  public let `createdAt`: String
  public let `offTheRecord`: Bool
  public let `version`: Int
  public let `agentVersion`: APIConversationConversationTimelineMessagesItemAgentVersion?
  public let `feedback`: APIConversationConversationTimelineMessagesItemFeedback?
  public let `recording`: APIJSONValue?
  public let `correction`: APIConversationConversationTimelineMessagesItemCorrection?
  public init(id: String, threadId: String, authorKind: APIConversationConversationTimelineMessagesItemAuthorKind, text: String, deliveryState: APIConversationConversationTimelineMessagesItemDeliveryState, controlEpoch: Int, sequence: Int, signedActId: String? = nil, member: String? = nil, authorAccountId: String? = nil, systemLink: APIConversationConversationTimelineMessagesItemSystemLink? = nil, citations: [String], createdAt: String, offTheRecord: Bool, version: Int, agentVersion: APIConversationConversationTimelineMessagesItemAgentVersion? = nil, feedback: APIConversationConversationTimelineMessagesItemFeedback? = nil, recording: APIJSONValue? = nil, correction: APIConversationConversationTimelineMessagesItemCorrection? = nil) {
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
    self.systemLink = systemLink
    self.citations = citations
    self.createdAt = createdAt
    self.offTheRecord = offTheRecord
    self.version = version
    self.agentVersion = agentVersion
    self.feedback = feedback
    self.recording = recording
    self.correction = correction
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `threadId`
    case `authorKind`
    case `text`
    case `deliveryState`
    case `controlEpoch`
    case `sequence`
    case `signedActId`
    case `member`
    case `authorAccountId`
    case `systemLink`
    case `citations`
    case `createdAt`
    case `offTheRecord`
    case `version`
    case `agentVersion`
    case `feedback`
    case `recording`
    case `correction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.threadId = try container.decode(String.self, forKey: .threadId)
    self.authorKind = try container.decode(APIConversationConversationTimelineMessagesItemAuthorKind.self, forKey: .authorKind)
    self.text = try container.decode(String.self, forKey: .text)
    self.deliveryState = try container.decode(APIConversationConversationTimelineMessagesItemDeliveryState.self, forKey: .deliveryState)
    self.controlEpoch = try container.decode(Int.self, forKey: .controlEpoch)
    self.sequence = try container.decode(Int.self, forKey: .sequence)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.member = try container.decode(String?.self, forKey: .member)
    self.authorAccountId = try container.decodeIfPresent(String.self, forKey: .authorAccountId)
    self.systemLink = try container.decodeIfPresent(APIConversationConversationTimelineMessagesItemSystemLink.self, forKey: .systemLink)
    self.citations = try container.decode([String].self, forKey: .citations)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.offTheRecord = try container.decode(Bool.self, forKey: .offTheRecord)
    self.version = try container.decode(Int.self, forKey: .version)
    self.agentVersion = try container.decodeIfPresent(APIConversationConversationTimelineMessagesItemAgentVersion.self, forKey: .agentVersion)
    self.feedback = try container.decodeIfPresent(APIConversationConversationTimelineMessagesItemFeedback.self, forKey: .feedback)
    self.recording = try container.decodeIfPresent(APIJSONValue.self, forKey: .recording)
    self.correction = try container.decodeIfPresent(APIConversationConversationTimelineMessagesItemCorrection.self, forKey: .correction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(threadId, forKey: .threadId)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(text, forKey: .text)
    try container.encode(deliveryState, forKey: .deliveryState)
    try container.encode(controlEpoch, forKey: .controlEpoch)
    try container.encode(sequence, forKey: .sequence)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(member, forKey: .member)
    try container.encodeIfPresent(authorAccountId, forKey: .authorAccountId)
    try container.encodeIfPresent(systemLink, forKey: .systemLink)
    try container.encode(citations, forKey: .citations)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encode(offTheRecord, forKey: .offTheRecord)
    try container.encode(version, forKey: .version)
    try container.encodeIfPresent(agentVersion, forKey: .agentVersion)
    try container.encodeIfPresent(feedback, forKey: .feedback)
    try container.encodeIfPresent(recording, forKey: .recording)
    try container.encodeIfPresent(correction, forKey: .correction)
  }
}

public enum APIConversationConversationTimelineMessagesItemAuthorKind: String, Codable, Sendable {
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

public enum APIConversationConversationTimelineMessagesItemDeliveryState: String, Codable, Sendable {
  case `accepted` = "accepted"
  case `generating` = "generating"
  case `delivered` = "delivered"
  case `failed` = "failed"
  case `interrupted` = "interrupted"
}

public struct APIConversationConversationTimelineMessagesItemSystemLink: Codable, Sendable {
  public let `kind`: APIConversationConversationTimelineMessagesItemSystemLinkKind
  public let `creatorId`: String
  public let `contentId`: String
  public let `contentVersion`: Int
  public let `label`: APIConversationConversationTimelineMessagesItemSystemLinkLabel
  public init(kind: APIConversationConversationTimelineMessagesItemSystemLinkKind, creatorId: String, contentId: String, contentVersion: Int, label: APIConversationConversationTimelineMessagesItemSystemLinkLabel) {
    self.kind = kind
    self.creatorId = creatorId
    self.contentId = contentId
    self.contentVersion = contentVersion
    self.label = label
  }
}

public enum APIConversationConversationTimelineMessagesItemSystemLinkKind: String, Codable, Sendable {
  case `published_answer` = "published_answer"
}

public enum APIConversationConversationTimelineMessagesItemSystemLinkLabel: String, Codable, Sendable {
  case `Answered_publicly_` = "Answered publicly."
}

public struct APIConversationConversationTimelineMessagesItemAgentVersion: Codable, Sendable {
  public let `id`: String
  public let `hash`: String
  public init(id: String, hash: String) {
    self.id = id
    self.hash = hash
  }
}

public enum APIConversationConversationTimelineMessagesItemFeedback: String, Codable, Sendable {
  case `helpful` = "helpful"
  case `not_helpful` = "not_helpful"
}

public struct APIConversationConversationTimelineMessagesItemCorrection: Codable, Sendable {
  public let `originalMessageId`: String
  public let `originalVersion`: Int
  public init(originalMessageId: String, originalVersion: Int) {
    self.originalMessageId = originalMessageId
    self.originalVersion = originalVersion
  }
}

public struct APIConversationConversationUsage: Codable, Sendable {
  public let `timezone`: APIConversationConversationUsageTimezone
  public let `days`: [APIConversationConversationUsageDaysItem]
  public let `modeAvailable`: Bool
  public let `measurement`: String
  public init(timezone: APIConversationConversationUsageTimezone, days: [APIConversationConversationUsageDaysItem], modeAvailable: Bool, measurement: String) {
    self.timezone = timezone
    self.days = days
    self.modeAvailable = modeAvailable
    self.measurement = measurement
  }
}

public enum APIConversationConversationUsageTimezone: String, Codable, Sendable {
  case `UTC` = "UTC"
}

public struct APIConversationConversationUsageDaysItem: Codable, Sendable {
  public let `day`: String
  public let `seconds`: Double
  public let `companionSeconds`: Double
  public init(day: String, seconds: Double, companionSeconds: Double) {
    self.day = day
    self.seconds = seconds
    self.companionSeconds = companionSeconds
  }
}

public struct APIConversationMemoryDecision: Codable, Sendable {
  public let `expectedRevision`: Int
  public let `action`: APIConversationMemoryDecisionAction
  public let `text`: String?
  public init(expectedRevision: Int, action: APIConversationMemoryDecisionAction, text: String? = nil) {
    self.expectedRevision = expectedRevision
    self.action = action
    self.text = text
  }
}

public enum APIConversationMemoryDecisionAction: String, Codable, Sendable {
  case `accept` = "accept"
  case `delete` = "delete"
  case `edit` = "edit"
  case `resolve` = "resolve"
}

public struct APIConversationMemoryItem: Codable, Sendable {
  public let `id`: String
  public let `kind`: APIConversationMemoryItemKind
  public let `text`: String
  public let `provenanceMessageId`: String
  public let `sensitiveCategory`: String?
  public let `state`: APIConversationMemoryItemState
  public let `editedByFan`: Bool
  public let `createdAt`: String
  public init(id: String, kind: APIConversationMemoryItemKind, text: String, provenanceMessageId: String, sensitiveCategory: String? = nil, state: APIConversationMemoryItemState, editedByFan: Bool, createdAt: String) {
    self.id = id
    self.kind = kind
    self.text = text
    self.provenanceMessageId = provenanceMessageId
    self.sensitiveCategory = sensitiveCategory
    self.state = state
    self.editedByFan = editedByFan
    self.createdAt = createdAt
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `kind`
    case `text`
    case `provenanceMessageId`
    case `sensitiveCategory`
    case `state`
    case `editedByFan`
    case `createdAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.kind = try container.decode(APIConversationMemoryItemKind.self, forKey: .kind)
    self.text = try container.decode(String.self, forKey: .text)
    self.provenanceMessageId = try container.decode(String.self, forKey: .provenanceMessageId)
    self.sensitiveCategory = try container.decode(String?.self, forKey: .sensitiveCategory)
    self.state = try container.decode(APIConversationMemoryItemState.self, forKey: .state)
    self.editedByFan = try container.decode(Bool.self, forKey: .editedByFan)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(kind, forKey: .kind)
    try container.encode(text, forKey: .text)
    try container.encode(provenanceMessageId, forKey: .provenanceMessageId)
    try container.encode(sensitiveCategory, forKey: .sensitiveCategory)
    try container.encode(state, forKey: .state)
    try container.encode(editedByFan, forKey: .editedByFan)
    try container.encode(createdAt, forKey: .createdAt)
  }
}

public enum APIConversationMemoryItemKind: String, Codable, Sendable {
  case `fact` = "fact"
  case `summary` = "summary"
  case `open_loop` = "open_loop"
}

public enum APIConversationMemoryItemState: String, Codable, Sendable {
  case `proposed` = "proposed"
  case `remembered` = "remembered"
  case `resolved` = "resolved"
}

public struct APIConversationMemoryProposal: Codable, Sendable {
  public let `kind`: APIConversationMemoryProposalKind
  public let `text`: String
  public let `semanticKey`: String
  public let `provenanceMessageId`: String
  public let `expectedRevision`: Int
  public let `sensitiveCategory`: String?
  public init(kind: APIConversationMemoryProposalKind, text: String, semanticKey: String, provenanceMessageId: String, expectedRevision: Int, sensitiveCategory: String? = nil) {
    self.kind = kind
    self.text = text
    self.semanticKey = semanticKey
    self.provenanceMessageId = provenanceMessageId
    self.expectedRevision = expectedRevision
    self.sensitiveCategory = sensitiveCategory
  }
}

public enum APIConversationMemoryProposalKind: String, Codable, Sendable {
  case `fact` = "fact"
  case `summary` = "summary"
  case `open_loop` = "open_loop"
}

public struct APIConversationProviderPolicy: Codable, Sendable {
  public let `version`: String
  public let `providers`: [APIConversationProviderPolicyProvidersItem]
  public let `verified`: Bool
  public init(version: String, providers: [APIConversationProviderPolicyProvidersItem], verified: Bool) {
    self.version = version
    self.providers = providers
    self.verified = verified
  }
}

public struct APIConversationProviderPolicyProvidersItem: Codable, Sendable {
  public let `name`: String
  public let `termsUrl`: String
  public let `noTraining`: Bool
  public let `noRetention`: Bool
  public init(name: String, termsUrl: String, noTraining: Bool, noRetention: Bool) {
    self.name = name
    self.termsUrl = termsUrl
    self.noTraining = noTraining
    self.noRetention = noRetention
  }
}

public struct APIConversationReplyFeedbackInput: Codable, Sendable {
  public let `messageVersion`: Int
  public let `agentVersion`: APIConversationReplyFeedbackInputAgentVersion
  public let `rating`: APIConversationReplyFeedbackInputRating?
  public let `consent`: APIConversationReplyFeedbackInputConsent?
  public let `policyVersion`: String?
  public init(messageVersion: Int, agentVersion: APIConversationReplyFeedbackInputAgentVersion, rating: APIConversationReplyFeedbackInputRating? = nil, consent: APIConversationReplyFeedbackInputConsent? = nil, policyVersion: String? = nil) {
    self.messageVersion = messageVersion
    self.agentVersion = agentVersion
    self.rating = rating
    self.consent = consent
    self.policyVersion = policyVersion
  }
  private enum CodingKeys: String, CodingKey {
    case `messageVersion`
    case `agentVersion`
    case `rating`
    case `consent`
    case `policyVersion`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.messageVersion = try container.decode(Int.self, forKey: .messageVersion)
    self.agentVersion = try container.decode(APIConversationReplyFeedbackInputAgentVersion.self, forKey: .agentVersion)
    self.rating = try container.decode(APIConversationReplyFeedbackInputRating?.self, forKey: .rating)
    self.consent = try container.decodeIfPresent(APIConversationReplyFeedbackInputConsent.self, forKey: .consent)
    self.policyVersion = try container.decodeIfPresent(String.self, forKey: .policyVersion)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(messageVersion, forKey: .messageVersion)
    try container.encode(agentVersion, forKey: .agentVersion)
    try container.encode(rating, forKey: .rating)
    try container.encodeIfPresent(consent, forKey: .consent)
    try container.encodeIfPresent(policyVersion, forKey: .policyVersion)
  }
}

public struct APIConversationReplyFeedbackInputAgentVersion: Codable, Sendable {
  public let `id`: String
  public let `hash`: String
  public init(id: String, hash: String) {
    self.id = id
    self.hash = hash
  }
}

public enum APIConversationReplyFeedbackInputRating: String, Codable, Sendable {
  case `helpful` = "helpful"
  case `not_helpful` = "not_helpful"
}

public struct APIConversationReplyFeedbackInputConsent: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIConversationReplyFeedbackPolicy: Codable, Sendable {
  public let `version`: String
  public let `notice`: String
  public init(version: String, notice: String) {
    self.version = version
    self.notice = notice
  }
}

public enum APIConversationReplyFeedbackRating: String, Codable, Sendable {
  case `helpful` = "helpful"
  case `not_helpful` = "not_helpful"
}

public struct APIConversationTeamReply: Codable, Sendable {
  public let `text`: String
  public let `idempotencyKey`: String
  public init(text: String, idempotencyKey: String) {
    self.text = text
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIConversationThreadPreferences: Codable, Sendable {
  public let `offTheRecord`: Bool
  public let `introShared`: Bool
  public let `expectedRevision`: Int
  public init(offTheRecord: Bool, introShared: Bool, expectedRevision: Int) {
    self.offTheRecord = offTheRecord
    self.introShared = introShared
    self.expectedRevision = expectedRevision
  }
}

public struct APIConversationTranslation: Codable, Sendable {
  public let `messageId`: String
  public let `originalVersion`: Int
  public let `language`: String
  public let `text`: String
  public let `provider`: String
  public let `label`: APIConversationTranslationLabel
  public init(messageId: String, originalVersion: Int, language: String, text: String, provider: String, label: APIConversationTranslationLabel) {
    self.messageId = messageId
    self.originalVersion = originalVersion
    self.language = language
    self.text = text
    self.provider = provider
    self.label = label
  }
}

public enum APIConversationTranslationLabel: String, Codable, Sendable {
  case `Translated___original_available` = "Translated · original available"
}

public typealias APIContentContentAudience = APIJSONValue

public struct APIContentContentConsentResult: Codable, Sendable {
  public let `version`: Int
  public let `share_text`: Bool
  public let `show_handle`: Bool
  public init(version: Int, share_text: Bool, show_handle: Bool) {
    self.version = version
    self.share_text = share_text
    self.show_handle = show_handle
  }
}

public struct APIContentContentDocument: Codable, Sendable {
  public let `kind`: APIContentContentDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentContentDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentContentDocumentQuote?
  public let `packetId`: String?
  public let `planRef`: APIContentContentDocumentPlanRef?
  public let `live`: APIContentContentDocumentLive?
  public init(kind: APIContentContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentContentDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentContentDocumentPlanRef? = nil, live: APIContentContentDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentContentDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentContentDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentContentDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentContentDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentContentDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
  }
}

public enum APIContentContentDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentContentDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentContentDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentContentDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentContentDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentContentDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentContentDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
  }
}

public struct APIContentContentDocumentLive: Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
  }
}

public struct APIContentContentEffectsResult: Codable, Sendable {
  public let `processed`: Int
  public init(processed: Int) {
    self.processed = processed
  }
}

public typealias APIContentContentKey = String

public struct APIContentContentList: Codable, Sendable {
  public let `items`: [APIContentContentListItemsItem]
  public let `nextCursor`: String?
  public let `serverTime`: String
  public init(items: [APIContentContentListItemsItem], nextCursor: String? = nil, serverTime: String) {
    self.items = items
    self.nextCursor = nextCursor
    self.serverTime = serverTime
  }
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
    case `serverTime`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIContentContentListItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
    self.serverTime = try container.decode(String.self, forKey: .serverTime)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
    try container.encode(serverTime, forKey: .serverTime)
  }
}

public struct APIContentContentListItemsItem: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `creatorHandle`: String
  public let `teamMember`: String?
  public let `displayText`: String
  public let `version`: Int
  public let `state`: String
  public let `authorKind`: APIContentContentListItemsItemAuthorKind
  public let `authorLabel`: String
  public let `audienceLabel`: String
  public let `signedActId`: String?
  public let `publishedAt`: String?
  public let `document`: APIContentContentListItemsItemDocument
  public let `audienceCount`: Int?
  public let `sourceState`: APIContentContentListItemsItemSourceState
  public let `quotedText`: String?
  public let `quotedHandle`: String?
  public init(id: String, creatorId: String, creatorName: String, creatorHandle: String, teamMember: String? = nil, displayText: String, version: Int, state: String, authorKind: APIContentContentListItemsItemAuthorKind, authorLabel: String, audienceLabel: String, signedActId: String? = nil, publishedAt: String? = nil, document: APIContentContentListItemsItemDocument, audienceCount: Int? = nil, sourceState: APIContentContentListItemsItemSourceState, quotedText: String? = nil, quotedHandle: String? = nil) {
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `creatorId`
    case `creatorName`
    case `creatorHandle`
    case `teamMember`
    case `displayText`
    case `version`
    case `state`
    case `authorKind`
    case `authorLabel`
    case `audienceLabel`
    case `signedActId`
    case `publishedAt`
    case `document`
    case `audienceCount`
    case `sourceState`
    case `quotedText`
    case `quotedHandle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorHandle = try container.decode(String.self, forKey: .creatorHandle)
    self.teamMember = try container.decode(String?.self, forKey: .teamMember)
    self.displayText = try container.decode(String.self, forKey: .displayText)
    self.version = try container.decode(Int.self, forKey: .version)
    self.state = try container.decode(String.self, forKey: .state)
    self.authorKind = try container.decode(APIContentContentListItemsItemAuthorKind.self, forKey: .authorKind)
    self.authorLabel = try container.decode(String.self, forKey: .authorLabel)
    self.audienceLabel = try container.decode(String.self, forKey: .audienceLabel)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.publishedAt = try container.decode(String?.self, forKey: .publishedAt)
    self.document = try container.decode(APIContentContentListItemsItemDocument.self, forKey: .document)
    self.audienceCount = try container.decode(Int?.self, forKey: .audienceCount)
    self.sourceState = try container.decode(APIContentContentListItemsItemSourceState.self, forKey: .sourceState)
    self.quotedText = try container.decode(String?.self, forKey: .quotedText)
    self.quotedHandle = try container.decode(String?.self, forKey: .quotedHandle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorHandle, forKey: .creatorHandle)
    try container.encode(teamMember, forKey: .teamMember)
    try container.encode(displayText, forKey: .displayText)
    try container.encode(version, forKey: .version)
    try container.encode(state, forKey: .state)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(authorLabel, forKey: .authorLabel)
    try container.encode(audienceLabel, forKey: .audienceLabel)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(publishedAt, forKey: .publishedAt)
    try container.encode(document, forKey: .document)
    try container.encode(audienceCount, forKey: .audienceCount)
    try container.encode(sourceState, forKey: .sourceState)
    try container.encode(quotedText, forKey: .quotedText)
    try container.encode(quotedHandle, forKey: .quotedHandle)
  }
}

public enum APIContentContentListItemsItemAuthorKind: String, Codable, Sendable {
  case `human_broadcast` = "human_broadcast"
  case `human_creator` = "human_creator"
  case `team` = "team"
}

public struct APIContentContentListItemsItemDocument: Codable, Sendable {
  public let `kind`: APIContentContentListItemsItemDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentContentListItemsItemDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentContentListItemsItemDocumentQuote?
  public let `packetId`: String?
  public let `planRef`: APIContentContentListItemsItemDocumentPlanRef?
  public let `live`: APIContentContentListItemsItemDocumentLive?
  public init(kind: APIContentContentListItemsItemDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentContentListItemsItemDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentContentListItemsItemDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentContentListItemsItemDocumentPlanRef? = nil, live: APIContentContentListItemsItemDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentContentListItemsItemDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentContentListItemsItemDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentContentListItemsItemDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentContentListItemsItemDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentContentListItemsItemDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
  }
}

public enum APIContentContentListItemsItemDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentContentListItemsItemDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentContentListItemsItemDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentContentListItemsItemDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentContentListItemsItemDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentContentListItemsItemDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentContentListItemsItemDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
  }
}

public struct APIContentContentListItemsItemDocumentLive: Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
  }
}

public enum APIContentContentListItemsItemSourceState: String, Codable, Sendable {
  case `not_requested` = "not_requested"
  case `candidate_pending` = "candidate_pending"
  case `candidate` = "candidate"
  case `revocation_pending` = "revocation_pending"
  case `revoked` = "revoked"
}

public struct APIContentContentLiveCatalog: Codable, Sendable {
  public let `available`: Bool
  public let `items`: [APIContentContentLiveCatalogItemsItem]
  public init(available: Bool, items: [APIContentContentLiveCatalogItemsItem]) {
    self.available = available
    self.items = items
  }
}

public struct APIContentContentLiveCatalogItemsItem: Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
    case `replayReady`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
    self.replayReady = try container.decode(Bool.self, forKey: .replayReady)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
    try container.encode(replayReady, forKey: .replayReady)
  }
}

public struct APIContentContentMedia: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentContentMediaKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentContentMediaKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentContentMediaKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentContentMuteCommand: Codable, Sendable {
  public let `muted`: Bool
  public init(muted: Bool) {
    self.muted = muted
  }
}

public struct APIContentContentPage: Codable, Sendable {
  public let `cursor`: String?
  public let `limit`: Int
  public let `state`: APIContentContentPageState?
  public let `query`: String?
  public init(cursor: String? = nil, limit: Int, state: APIContentContentPageState? = nil, query: String? = nil) {
    self.cursor = cursor
    self.limit = limit
    self.state = state
    self.query = query
  }
}

public enum APIContentContentPageState: String, Codable, Sendable {
  case `draft` = "draft"
  case `media_pending` = "media_pending"
  case `scheduled` = "scheduled"
  case `published` = "published"
  case `unpublished` = "unpublished"
  case `archived` = "archived"
}

public struct APIContentContentPreference: Codable, Sendable {
  public let `accountId`: String
  public let `muted`: Bool
  public init(accountId: String, muted: Bool) {
    self.accountId = accountId
    self.muted = muted
  }
}

public struct APIContentContentReactionResult: Codable, Sendable {
  public let `replyId`: String
  public let `kind`: String
  public let `signedActId`: String
  public init(replyId: String, kind: String, signedActId: String) {
    self.replyId = replyId
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIContentContentReplyList: Codable, Sendable {
  public let `items`: [APIContentContentReplyListItemsItem]
  public let `nextCursor`: String?
  public init(items: [APIContentContentReplyListItemsItem], nextCursor: String? = nil) {
    self.items = items
    self.nextCursor = nextCursor
  }
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIContentContentReplyListItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
  }
}

public struct APIContentContentReplyListItemsItem: Codable, Sendable {
  public let `safetyState`: APIContentContentReplyListItemsItemSafetyState
  public let `safetyReviewAvailable`: Bool
  public let `read`: Bool
  public let `id`: String
  public let `contentId`: String
  public let `fanId`: String
  public let `handle`: String
  public let `text`: String
  public let `version`: Int
  public let `createdAt`: String
  public let `tenure`: APIContentContentReplyListItemsItemTenure?
  public let `consent`: APIContentContentReplyListItemsItemConsent
  public let `reaction`: APIContentContentReplyListItemsItemReaction?
  public init(safetyState: APIContentContentReplyListItemsItemSafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, tenure: APIContentContentReplyListItemsItemTenure? = nil, consent: APIContentContentReplyListItemsItemConsent, reaction: APIContentContentReplyListItemsItemReaction? = nil) {
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
    self.tenure = tenure
    self.consent = consent
    self.reaction = reaction
  }
  private enum CodingKeys: String, CodingKey {
    case `safetyState`
    case `safetyReviewAvailable`
    case `read`
    case `id`
    case `contentId`
    case `fanId`
    case `handle`
    case `text`
    case `version`
    case `createdAt`
    case `tenure`
    case `consent`
    case `reaction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.safetyState = try container.decode(APIContentContentReplyListItemsItemSafetyState.self, forKey: .safetyState)
    self.safetyReviewAvailable = try container.decode(Bool.self, forKey: .safetyReviewAvailable)
    self.read = try container.decode(Bool.self, forKey: .read)
    self.id = try container.decode(String.self, forKey: .id)
    self.contentId = try container.decode(String.self, forKey: .contentId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.tenure = try container.decodeIfPresent(APIContentContentReplyListItemsItemTenure.self, forKey: .tenure)
    self.consent = try container.decode(APIContentContentReplyListItemsItemConsent.self, forKey: .consent)
    self.reaction = try container.decode(APIContentContentReplyListItemsItemReaction?.self, forKey: .reaction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(safetyState, forKey: .safetyState)
    try container.encode(safetyReviewAvailable, forKey: .safetyReviewAvailable)
    try container.encode(read, forKey: .read)
    try container.encode(id, forKey: .id)
    try container.encode(contentId, forKey: .contentId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(handle, forKey: .handle)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encodeIfPresent(tenure, forKey: .tenure)
    try container.encode(consent, forKey: .consent)
    try container.encode(reaction, forKey: .reaction)
  }
}

public enum APIContentContentReplyListItemsItemSafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentContentReplyListItemsItemTenure: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentContentReplyListItemsItemTenureBasis
  public let `historyComplete`: APIContentContentReplyListItemsItemTenureHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIContentContentReplyListItemsItemTenureBasis, historyComplete: APIContentContentReplyListItemsItemTenureHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentContentReplyListItemsItemTenureBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentContentReplyListItemsItemTenureHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentContentReplyListItemsItemTenureBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentContentReplyListItemsItemTenureHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public struct APIContentContentReplyListItemsItemConsent: Codable, Sendable {
  public let `shareText`: Bool
  public let `showHandle`: Bool
  public let `version`: Int
  public init(shareText: Bool, showHandle: Bool, version: Int) {
    self.shareText = shareText
    self.showHandle = showHandle
    self.version = version
  }
}

public struct APIContentContentReplyListItemsItemReaction: Codable, Sendable {
  public let `kind`: String
  public let `signedActId`: String
  public init(kind: String, signedActId: String) {
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIContentContentReplyPage: Codable, Sendable {
  public let `cursor`: String?
  public let `limit`: Int
  public let `contentId`: String?
  public let `filter`: APIContentContentReplyPageFilter
  public init(cursor: String? = nil, limit: Int, contentId: String? = nil, filter: APIContentContentReplyPageFilter) {
    self.cursor = cursor
    self.limit = limit
    self.contentId = contentId
    self.filter = filter
  }
}

public enum APIContentContentReplyPageFilter: String, Codable, Sendable {
  case `all` = "all"
  case `unread` = "unread"
  case `reacted` = "reacted"
  case `flagged` = "flagged"
}

public struct APIContentContentReplyReadResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `read`: APIContentContentReplyReadResultRead
  public init(id: String, version: Int, read: APIContentContentReplyReadResultRead) {
    self.id = id
    self.version = version
    self.read = read
  }
}

public struct APIContentContentReplyReadResultRead: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIContentContentReplyReviewResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `safetyState`: APIContentContentReplyReviewResultSafetyState
  public init(id: String, version: Int, safetyState: APIContentContentReplyReviewResultSafetyState) {
    self.id = id
    self.version = version
    self.safetyState = safetyState
  }
}

public enum APIContentContentReplyReviewResultSafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentContentResult: Codable, Sendable {
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

public struct APIContentContentRevisionResult: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public init(id: String, version: Int) {
    self.id = id
    self.version = version
  }
}

public struct APIContentContentScheduledResult: Codable, Sendable {
  public let `published`: Int
  public init(published: Int) {
    self.published = published
  }
}

public struct APIContentContentTenureRecognition: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentContentTenureRecognitionBasis
  public let `historyComplete`: APIContentContentTenureRecognitionHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIContentContentTenureRecognitionBasis, historyComplete: APIContentContentTenureRecognitionHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentContentTenureRecognitionBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentContentTenureRecognitionHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentContentTenureRecognitionBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentContentTenureRecognitionHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public typealias APIContentContentThanksFeed = [APIContentContentThanksFeedValueItem]

public struct APIContentContentThanksFeedValueItem: Codable, Sendable {
  public let `id`: String
  public let `version`: Int
  public let `target_kind`: APIContentContentThanksFeedValueItemTargetKind
  public let `target_id`: String
  public let `text`: String
  public let `handle`: String?
  public let `created_at`: String
  public init(id: String, version: Int, target_kind: APIContentContentThanksFeedValueItemTargetKind, target_id: String, text: String, handle: String? = nil, created_at: String) {
    self.id = id
    self.version = version
    self.target_kind = target_kind
    self.target_id = target_id
    self.text = text
    self.handle = handle
    self.created_at = created_at
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `version`
    case `target_kind`
    case `target_id`
    case `text`
    case `handle`
    case `created_at`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.version = try container.decode(Int.self, forKey: .version)
    self.target_kind = try container.decode(APIContentContentThanksFeedValueItemTargetKind.self, forKey: .target_kind)
    self.target_id = try container.decode(String.self, forKey: .target_id)
    self.text = try container.decode(String.self, forKey: .text)
    self.handle = try container.decode(String?.self, forKey: .handle)
    self.created_at = try container.decode(String.self, forKey: .created_at)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(version, forKey: .version)
    try container.encode(target_kind, forKey: .target_kind)
    try container.encode(target_id, forKey: .target_id)
    try container.encode(text, forKey: .text)
    try container.encode(handle, forKey: .handle)
    try container.encode(created_at, forKey: .created_at)
  }
}

public enum APIContentContentThanksFeedValueItemTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public struct APIContentContentThanksQuery: Codable, Sendable {
  public let `targetKind`: APIContentContentThanksQueryTargetKind
  public let `targetId`: String
  public init(targetKind: APIContentContentThanksQueryTargetKind, targetId: String) {
    self.targetKind = targetKind
    self.targetId = targetId
  }
}

public enum APIContentContentThanksQueryTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public typealias APIContentContentThanksView = APIContentContentThanksViewValue?

public struct APIContentContentThanksViewValue: Codable, Sendable {
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

public struct APIContentContentVersionCommand: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public init(version: Int, idempotencyKey: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIContentContentView: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `creatorHandle`: String
  public let `teamMember`: String?
  public let `displayText`: String
  public let `version`: Int
  public let `state`: String
  public let `authorKind`: APIContentContentViewAuthorKind
  public let `authorLabel`: String
  public let `audienceLabel`: String
  public let `signedActId`: String?
  public let `publishedAt`: String?
  public let `document`: APIContentContentViewDocument
  public let `audienceCount`: Int?
  public let `sourceState`: APIContentContentViewSourceState
  public let `quotedText`: String?
  public let `quotedHandle`: String?
  public init(id: String, creatorId: String, creatorName: String, creatorHandle: String, teamMember: String? = nil, displayText: String, version: Int, state: String, authorKind: APIContentContentViewAuthorKind, authorLabel: String, audienceLabel: String, signedActId: String? = nil, publishedAt: String? = nil, document: APIContentContentViewDocument, audienceCount: Int? = nil, sourceState: APIContentContentViewSourceState, quotedText: String? = nil, quotedHandle: String? = nil) {
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
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `creatorId`
    case `creatorName`
    case `creatorHandle`
    case `teamMember`
    case `displayText`
    case `version`
    case `state`
    case `authorKind`
    case `authorLabel`
    case `audienceLabel`
    case `signedActId`
    case `publishedAt`
    case `document`
    case `audienceCount`
    case `sourceState`
    case `quotedText`
    case `quotedHandle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.creatorName = try container.decode(String.self, forKey: .creatorName)
    self.creatorHandle = try container.decode(String.self, forKey: .creatorHandle)
    self.teamMember = try container.decode(String?.self, forKey: .teamMember)
    self.displayText = try container.decode(String.self, forKey: .displayText)
    self.version = try container.decode(Int.self, forKey: .version)
    self.state = try container.decode(String.self, forKey: .state)
    self.authorKind = try container.decode(APIContentContentViewAuthorKind.self, forKey: .authorKind)
    self.authorLabel = try container.decode(String.self, forKey: .authorLabel)
    self.audienceLabel = try container.decode(String.self, forKey: .audienceLabel)
    self.signedActId = try container.decode(String?.self, forKey: .signedActId)
    self.publishedAt = try container.decode(String?.self, forKey: .publishedAt)
    self.document = try container.decode(APIContentContentViewDocument.self, forKey: .document)
    self.audienceCount = try container.decode(Int?.self, forKey: .audienceCount)
    self.sourceState = try container.decode(APIContentContentViewSourceState.self, forKey: .sourceState)
    self.quotedText = try container.decode(String?.self, forKey: .quotedText)
    self.quotedHandle = try container.decode(String?.self, forKey: .quotedHandle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(creatorName, forKey: .creatorName)
    try container.encode(creatorHandle, forKey: .creatorHandle)
    try container.encode(teamMember, forKey: .teamMember)
    try container.encode(displayText, forKey: .displayText)
    try container.encode(version, forKey: .version)
    try container.encode(state, forKey: .state)
    try container.encode(authorKind, forKey: .authorKind)
    try container.encode(authorLabel, forKey: .authorLabel)
    try container.encode(audienceLabel, forKey: .audienceLabel)
    try container.encode(signedActId, forKey: .signedActId)
    try container.encode(publishedAt, forKey: .publishedAt)
    try container.encode(document, forKey: .document)
    try container.encode(audienceCount, forKey: .audienceCount)
    try container.encode(sourceState, forKey: .sourceState)
    try container.encode(quotedText, forKey: .quotedText)
    try container.encode(quotedHandle, forKey: .quotedHandle)
  }
}

public enum APIContentContentViewAuthorKind: String, Codable, Sendable {
  case `human_broadcast` = "human_broadcast"
  case `human_creator` = "human_creator"
  case `team` = "team"
}

public struct APIContentContentViewDocument: Codable, Sendable {
  public let `kind`: APIContentContentViewDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentContentViewDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentContentViewDocumentQuote?
  public let `packetId`: String?
  public let `planRef`: APIContentContentViewDocumentPlanRef?
  public let `live`: APIContentContentViewDocumentLive?
  public init(kind: APIContentContentViewDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentContentViewDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentContentViewDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentContentViewDocumentPlanRef? = nil, live: APIContentContentViewDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentContentViewDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentContentViewDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentContentViewDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentContentViewDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentContentViewDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
  }
}

public enum APIContentContentViewDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentContentViewDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentContentViewDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentContentViewDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentContentViewDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentContentViewDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentContentViewDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
  }
}

public struct APIContentContentViewDocumentLive: Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
  }
}

public enum APIContentContentViewSourceState: String, Codable, Sendable {
  case `not_requested` = "not_requested"
  case `candidate_pending` = "candidate_pending"
  case `candidate` = "candidate"
  case `revocation_pending` = "revocation_pending"
  case `revoked` = "revoked"
}

public struct APIContentContentWithdrawResult: Codable, Sendable {
  public let `id`: String
  public let `withdrawn`: APIContentContentWithdrawResultWithdrawn
  public init(id: String, withdrawn: APIContentContentWithdrawResultWithdrawn) {
    self.id = id
    self.withdrawn = withdrawn
  }
}

public struct APIContentContentWithdrawResultWithdrawn: Codable, Sendable {
  public let value: Bool = true
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == true else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected true") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(true) }
}

public struct APIContentNoteReplyPolicy: Codable, Sendable {
  public let `accountId`: String
  public let `creatorId`: String
  public let `limit`: APIJSONValue
  public let `confirmedDays`: Int?
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentNoteReplyPolicyBasis?
  public let `historyComplete`: APIContentNoteReplyPolicyHistoryComplete
  public let `longerRepliesActive`: Bool
  public let `checkedAt`: String
  public init(accountId: String, creatorId: String, limit: APIJSONValue, confirmedDays: Int? = nil, milestone: APIJSONValue? = nil, basis: APIContentNoteReplyPolicyBasis? = nil, historyComplete: APIContentNoteReplyPolicyHistoryComplete, longerRepliesActive: Bool, checkedAt: String) {
    self.accountId = accountId
    self.creatorId = creatorId
    self.limit = limit
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.longerRepliesActive = longerRepliesActive
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `accountId`
    case `creatorId`
    case `limit`
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `longerRepliesActive`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.accountId = try container.decode(String.self, forKey: .accountId)
    self.creatorId = try container.decode(String.self, forKey: .creatorId)
    self.limit = try container.decode(APIJSONValue.self, forKey: .limit)
    self.confirmedDays = try container.decode(Int?.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentNoteReplyPolicyBasis?.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentNoteReplyPolicyHistoryComplete.self, forKey: .historyComplete)
    self.longerRepliesActive = try container.decode(Bool.self, forKey: .longerRepliesActive)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountId, forKey: .accountId)
    try container.encode(creatorId, forKey: .creatorId)
    try container.encode(limit, forKey: .limit)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(longerRepliesActive, forKey: .longerRepliesActive)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentNoteReplyPolicyBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentNoteReplyPolicyHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public struct APIContentPrivateNoteReply: Codable, Sendable {
  public let `safetyState`: APIContentPrivateNoteReplySafetyState
  public let `safetyReviewAvailable`: Bool
  public let `read`: Bool
  public let `id`: String
  public let `contentId`: String
  public let `fanId`: String
  public let `handle`: String
  public let `text`: String
  public let `version`: Int
  public let `createdAt`: String
  public let `tenure`: APIContentPrivateNoteReplyTenure?
  public let `consent`: APIContentPrivateNoteReplyConsent
  public let `reaction`: APIContentPrivateNoteReplyReaction?
  public init(safetyState: APIContentPrivateNoteReplySafetyState, safetyReviewAvailable: Bool, read: Bool, id: String, contentId: String, fanId: String, handle: String, text: String, version: Int, createdAt: String, tenure: APIContentPrivateNoteReplyTenure? = nil, consent: APIContentPrivateNoteReplyConsent, reaction: APIContentPrivateNoteReplyReaction? = nil) {
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
    self.tenure = tenure
    self.consent = consent
    self.reaction = reaction
  }
  private enum CodingKeys: String, CodingKey {
    case `safetyState`
    case `safetyReviewAvailable`
    case `read`
    case `id`
    case `contentId`
    case `fanId`
    case `handle`
    case `text`
    case `version`
    case `createdAt`
    case `tenure`
    case `consent`
    case `reaction`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.safetyState = try container.decode(APIContentPrivateNoteReplySafetyState.self, forKey: .safetyState)
    self.safetyReviewAvailable = try container.decode(Bool.self, forKey: .safetyReviewAvailable)
    self.read = try container.decode(Bool.self, forKey: .read)
    self.id = try container.decode(String.self, forKey: .id)
    self.contentId = try container.decode(String.self, forKey: .contentId)
    self.fanId = try container.decode(String.self, forKey: .fanId)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.createdAt = try container.decode(String.self, forKey: .createdAt)
    self.tenure = try container.decodeIfPresent(APIContentPrivateNoteReplyTenure.self, forKey: .tenure)
    self.consent = try container.decode(APIContentPrivateNoteReplyConsent.self, forKey: .consent)
    self.reaction = try container.decode(APIContentPrivateNoteReplyReaction?.self, forKey: .reaction)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(safetyState, forKey: .safetyState)
    try container.encode(safetyReviewAvailable, forKey: .safetyReviewAvailable)
    try container.encode(read, forKey: .read)
    try container.encode(id, forKey: .id)
    try container.encode(contentId, forKey: .contentId)
    try container.encode(fanId, forKey: .fanId)
    try container.encode(handle, forKey: .handle)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(createdAt, forKey: .createdAt)
    try container.encodeIfPresent(tenure, forKey: .tenure)
    try container.encode(consent, forKey: .consent)
    try container.encode(reaction, forKey: .reaction)
  }
}

public enum APIContentPrivateNoteReplySafetyState: String, Codable, Sendable {
  case `pending` = "pending"
  case `allowed` = "allowed"
  case `flagged` = "flagged"
}

public struct APIContentPrivateNoteReplyTenure: Codable, Sendable {
  public let `confirmedDays`: Int
  public let `milestone`: APIJSONValue?
  public let `basis`: APIContentPrivateNoteReplyTenureBasis
  public let `historyComplete`: APIContentPrivateNoteReplyTenureHistoryComplete
  public let `checkedAt`: String
  public init(confirmedDays: Int, milestone: APIJSONValue? = nil, basis: APIContentPrivateNoteReplyTenureBasis, historyComplete: APIContentPrivateNoteReplyTenureHistoryComplete, checkedAt: String) {
    self.confirmedDays = confirmedDays
    self.milestone = milestone
    self.basis = basis
    self.historyComplete = historyComplete
    self.checkedAt = checkedAt
  }
  private enum CodingKeys: String, CodingKey {
    case `confirmedDays`
    case `milestone`
    case `basis`
    case `historyComplete`
    case `checkedAt`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.confirmedDays = try container.decode(Int.self, forKey: .confirmedDays)
    self.milestone = try container.decode(APIJSONValue?.self, forKey: .milestone)
    self.basis = try container.decode(APIContentPrivateNoteReplyTenureBasis.self, forKey: .basis)
    self.historyComplete = try container.decode(APIContentPrivateNoteReplyTenureHistoryComplete.self, forKey: .historyComplete)
    self.checkedAt = try container.decode(String.self, forKey: .checkedAt)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(confirmedDays, forKey: .confirmedDays)
    try container.encode(milestone, forKey: .milestone)
    try container.encode(basis, forKey: .basis)
    try container.encode(historyComplete, forKey: .historyComplete)
    try container.encode(checkedAt, forKey: .checkedAt)
  }
}

public enum APIContentPrivateNoteReplyTenureBasis: String, Codable, Sendable {
  case `confirmed_stripe_paid_periods` = "confirmed_stripe_paid_periods"
  case `confirmed_paid_periods` = "confirmed_paid_periods"
}

public struct APIContentPrivateNoteReplyTenureHistoryComplete: Codable, Sendable {
  public let value: Bool = false
  public init() {}
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    guard try container.decode(Bool.self) == false else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected false") }
  }
  public func encode(to encoder: Encoder) throws { var container = encoder.singleValueContainer(); try container.encode(false) }
}

public struct APIContentPrivateNoteReplyConsent: Codable, Sendable {
  public let `shareText`: Bool
  public let `showHandle`: Bool
  public let `version`: Int
  public init(shareText: Bool, showHandle: Bool, version: Int) {
    self.shareText = shareText
    self.showHandle = showHandle
    self.version = version
  }
}

public struct APIContentPrivateNoteReplyReaction: Codable, Sendable {
  public let `kind`: String
  public let `signedActId`: String
  public init(kind: String, signedActId: String) {
    self.kind = kind
    self.signedActId = signedActId
  }
}

public struct APIContentPublishContent: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `signedActId`: String
  public init(version: Int, idempotencyKey: String, signedActId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.signedActId = signedActId
  }
}

public struct APIContentQuoteConsent: Codable, Sendable {
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

public struct APIContentReactToReply: Codable, Sendable {
  public let `version`: Int
  public let `kind`: APIContentReactToReplyKind
  public let `signedActId`: String
  public let `idempotencyKey`: String
  public init(version: Int, kind: APIContentReactToReplyKind, signedActId: String, idempotencyKey: String) {
    self.version = version
    self.kind = kind
    self.signedActId = signedActId
    self.idempotencyKey = idempotencyKey
  }
}

public enum APIContentReactToReplyKind: String, Codable, Sendable {
  case `heart` = "heart"
  case `thanks` = "thanks"
  case `helpful` = "helpful"
}

public struct APIContentReplyToNote: Codable, Sendable {
  public let `text`: String
  public let `idempotencyKey`: String
  public init(text: String, idempotencyKey: String) {
    self.text = text
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIContentSaveContent: Codable, Sendable {
  public let `id`: String
  public let `expectedVersion`: Int
  public let `document`: APIContentSaveContentDocument
  public let `idempotencyKey`: String
  public init(id: String, expectedVersion: Int, document: APIContentSaveContentDocument, idempotencyKey: String) {
    self.id = id
    self.expectedVersion = expectedVersion
    self.document = document
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIContentSaveContentDocument: Codable, Sendable {
  public let `kind`: APIContentSaveContentDocumentKind
  public let `title`: String
  public let `text`: String
  public let `audience`: APIJSONValue
  public let `media`: [APIContentSaveContentDocumentMediaItem]
  public let `nameToken`: Bool
  public let `showAudienceCount`: Bool
  public let `aiUseIntent`: Bool
  public let `scheduledAt`: String?
  public let `quote`: APIContentSaveContentDocumentQuote?
  public let `packetId`: String?
  public let `planRef`: APIContentSaveContentDocumentPlanRef?
  public let `live`: APIContentSaveContentDocumentLive?
  public init(kind: APIContentSaveContentDocumentKind, title: String, text: String, audience: APIJSONValue, media: [APIContentSaveContentDocumentMediaItem], nameToken: Bool, showAudienceCount: Bool, aiUseIntent: Bool, scheduledAt: String? = nil, quote: APIContentSaveContentDocumentQuote? = nil, packetId: String? = nil, planRef: APIContentSaveContentDocumentPlanRef? = nil, live: APIContentSaveContentDocumentLive? = nil) {
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
    self.planRef = planRef
    self.live = live
  }
  private enum CodingKeys: String, CodingKey {
    case `kind`
    case `title`
    case `text`
    case `audience`
    case `media`
    case `nameToken`
    case `showAudienceCount`
    case `aiUseIntent`
    case `scheduledAt`
    case `quote`
    case `packetId`
    case `planRef`
    case `live`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.kind = try container.decode(APIContentSaveContentDocumentKind.self, forKey: .kind)
    self.title = try container.decode(String.self, forKey: .title)
    self.text = try container.decode(String.self, forKey: .text)
    self.audience = try container.decode(APIJSONValue.self, forKey: .audience)
    self.media = try container.decode([APIContentSaveContentDocumentMediaItem].self, forKey: .media)
    self.nameToken = try container.decode(Bool.self, forKey: .nameToken)
    self.showAudienceCount = try container.decode(Bool.self, forKey: .showAudienceCount)
    self.aiUseIntent = try container.decode(Bool.self, forKey: .aiUseIntent)
    self.scheduledAt = try container.decode(String?.self, forKey: .scheduledAt)
    self.quote = try container.decode(APIContentSaveContentDocumentQuote?.self, forKey: .quote)
    self.packetId = try container.decode(String?.self, forKey: .packetId)
    self.planRef = try container.decodeIfPresent(APIContentSaveContentDocumentPlanRef.self, forKey: .planRef)
    self.live = try container.decodeIfPresent(APIContentSaveContentDocumentLive.self, forKey: .live)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(kind, forKey: .kind)
    try container.encode(title, forKey: .title)
    try container.encode(text, forKey: .text)
    try container.encode(audience, forKey: .audience)
    try container.encode(media, forKey: .media)
    try container.encode(nameToken, forKey: .nameToken)
    try container.encode(showAudienceCount, forKey: .showAudienceCount)
    try container.encode(aiUseIntent, forKey: .aiUseIntent)
    try container.encode(scheduledAt, forKey: .scheduledAt)
    try container.encode(quote, forKey: .quote)
    try container.encode(packetId, forKey: .packetId)
    try container.encodeIfPresent(planRef, forKey: .planRef)
    try container.encodeIfPresent(live, forKey: .live)
  }
}

public enum APIContentSaveContentDocumentKind: String, Codable, Sendable {
  case `note` = "note"
  case `post` = "post"
  case `public_answer` = "public_answer"
  case `quote_reply` = "quote_reply"
  case `live` = "live"
  case `replay` = "replay"
}

public struct APIContentSaveContentDocumentMediaItem: Codable, Sendable {
  public let `assetId`: String
  public let `version`: Int
  public let `sha256`: String
  public let `kind`: APIContentSaveContentDocumentMediaItemKind
  public let `alt`: String
  public init(assetId: String, version: Int, sha256: String, kind: APIContentSaveContentDocumentMediaItemKind, alt: String) {
    self.assetId = assetId
    self.version = version
    self.sha256 = sha256
    self.kind = kind
    self.alt = alt
  }
}

public enum APIContentSaveContentDocumentMediaItemKind: String, Codable, Sendable {
  case `photo` = "photo"
  case `voice` = "voice"
  case `video` = "video"
}

public struct APIContentSaveContentDocumentQuote: Codable, Sendable {
  public let `replyId`: String
  public let `consentVersion`: Int
  public init(replyId: String, consentVersion: Int) {
    self.replyId = replyId
    self.consentVersion = consentVersion
  }
}

public struct APIContentSaveContentDocumentPlanRef: Codable, Sendable {
  public let `id`: String
  public let `revision`: Int
  public let `hash`: String
  public init(id: String, revision: Int, hash: String) {
    self.id = id
    self.revision = revision
    self.hash = hash
  }
}

public struct APIContentSaveContentDocumentLive: Codable, Sendable {
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
  private enum CodingKeys: String, CodingKey {
    case `sessionId`
    case `startsAt`
    case `endsAt`
    case `replayContentId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.sessionId = try container.decode(String.self, forKey: .sessionId)
    self.startsAt = try container.decode(String.self, forKey: .startsAt)
    self.endsAt = try container.decode(String.self, forKey: .endsAt)
    self.replayContentId = try container.decode(String?.self, forKey: .replayContentId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sessionId, forKey: .sessionId)
    try container.encode(startsAt, forKey: .startsAt)
    try container.encode(endsAt, forKey: .endsAt)
    try container.encode(replayContentId, forKey: .replayContentId)
  }
}

public struct APIContentThanksCommand: Codable, Sendable {
  public let `targetKind`: APIContentThanksCommandTargetKind
  public let `targetId`: String
  public let `text`: String
  public let `shareWithCreatorDigest`: Bool
  public let `showIdentity`: Bool
  public let `withdrawn`: Bool
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(targetKind: APIContentThanksCommandTargetKind, targetId: String, text: String, shareWithCreatorDigest: Bool, showIdentity: Bool, withdrawn: Bool, expectedVersion: Int, idempotencyKey: String) {
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

public enum APIContentThanksCommandTargetKind: String, Codable, Sendable {
  case `content` = "content"
  case `message` = "message"
}

public struct APIStudioContentVersionCommand: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public init(version: Int, idempotencyKey: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIStudioStudioAudiences: Codable, Sendable {
  public let `audienceCountsAvailable`: Bool
  public let `tiers`: [APIStudioStudioAudiencesTiersItem]
  public let `groups`: [APIStudioStudioAudiencesGroupsItem]
  public init(audienceCountsAvailable: Bool, tiers: [APIStudioStudioAudiencesTiersItem], groups: [APIStudioStudioAudiencesGroupsItem]) {
    self.audienceCountsAvailable = audienceCountsAvailable
    self.tiers = tiers
    self.groups = groups
  }
}

public struct APIStudioStudioAudiencesTiersItem: Codable, Sendable {
  public let `id`: String
  public let `name`: String
  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public struct APIStudioStudioAudiencesGroupsItem: Codable, Sendable {
  public let `id`: String
  public let `name`: String
  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public typealias APIStudioStudioCommerceProjection = APIJSONValue

public struct APIStudioStudioControlCommand: Codable, Sendable {
  public let `idempotencyKey`: String
  public init(idempotencyKey: String) {
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIStudioStudioCorrection: Codable, Sendable {
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

public struct APIStudioStudioDraftVersion: Codable, Sendable {
  public let `version`: Int
  public init(version: Int) {
    self.version = version
  }
}

public struct APIStudioStudioInvitation: Codable, Sendable {
  public let `id`: String
  public let `roles`: [APIStudioStudioInvitationRolesItem]
  public let `creatorId`: String?
  public let `accountId`: String?
  public let `expiresAt`: String?
  public let `accepted`: Bool?
  public init(id: String, roles: [APIStudioStudioInvitationRolesItem], creatorId: String? = nil, accountId: String? = nil, expiresAt: String? = nil, accepted: Bool? = nil) {
    self.id = id
    self.roles = roles
    self.creatorId = creatorId
    self.accountId = accountId
    self.expiresAt = expiresAt
    self.accepted = accepted
  }
}

public enum APIStudioStudioInvitationRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioInvite: Codable, Sendable {
  public let `handle`: String
  public let `roles`: [APIStudioStudioInviteRolesItem]
  public init(handle: String, roles: [APIStudioStudioInviteRolesItem]) {
    self.handle = handle
    self.roles = roles
  }
}

public enum APIStudioStudioInviteRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioQueueQuery: Codable, Sendable {
  public let `cursor`: String?
  public let `filter`: APIStudioStudioQueueQueryFilter
  public let `limit`: Int
  public init(cursor: String? = nil, filter: APIStudioStudioQueueQueryFilter, limit: Int) {
    self.cursor = cursor
    self.filter = filter
    self.limit = limit
  }
}

public enum APIStudioStudioQueueQueryFilter: String, Codable, Sendable {
  case `all` = "all"
  case `due` = "due"
  case `decide` = "decide"
  case `more_info` = "more_info"
}

public struct APIStudioStudioReplyDraft: Codable, Sendable {
  public let `text`: String
  public let `version`: Int
  public let `sentMessageId`: String?
  public init(text: String, version: Int, sentMessageId: String? = nil) {
    self.text = text
    self.version = version
    self.sentMessageId = sentMessageId
  }
  private enum CodingKeys: String, CodingKey {
    case `text`
    case `version`
    case `sentMessageId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.text = try container.decode(String.self, forKey: .text)
    self.version = try container.decode(Int.self, forKey: .version)
    self.sentMessageId = try container.decode(String?.self, forKey: .sentMessageId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(text, forKey: .text)
    try container.encode(version, forKey: .version)
    try container.encode(sentMessageId, forKey: .sentMessageId)
  }
}

public struct APIStudioStudioRevision: Codable, Sendable {
  public let `revision`: Int
  public init(revision: Int) {
    self.revision = revision
  }
}

public struct APIStudioStudioSaveReplyDraft: Codable, Sendable {
  public let `text`: String
  public let `expectedVersion`: Int
  public let `idempotencyKey`: String
  public init(text: String, expectedVersion: Int, idempotencyKey: String) {
    self.text = text
    self.expectedVersion = expectedVersion
    self.idempotencyKey = idempotencyKey
  }
}

public struct APIStudioStudioSendReplyDraft: Codable, Sendable {
  public let `version`: Int
  public let `idempotencyKey`: String
  public let `signedActId`: String
  public init(version: Int, idempotencyKey: String, signedActId: String) {
    self.version = version
    self.idempotencyKey = idempotencyKey
    self.signedActId = signedActId
  }
}

public struct APIStudioStudioSession: Codable, Sendable {
  public let `creators`: [APIStudioStudioSessionCreatorsItem]
  public let `invitations`: [APIStudioStudioSessionInvitationsItem]
  public let `serverTime`: String
  public init(creators: [APIStudioStudioSessionCreatorsItem], invitations: [APIStudioStudioSessionInvitationsItem], serverTime: String) {
    self.creators = creators
    self.invitations = invitations
    self.serverTime = serverTime
  }
}

public struct APIStudioStudioSessionCreatorsItem: Codable, Sendable {
  public let `id`: String
  public let `display_name`: String
  public let `handle`: String
  public let `verification`: String
  public let `owned`: Bool
  public let `roles`: [APIStudioStudioSessionCreatorsItemRolesItem]
  public let `memberHandle`: String?
  public let `viewerAccountId`: String
  public init(id: String, display_name: String, handle: String, verification: String, owned: Bool, roles: [APIStudioStudioSessionCreatorsItemRolesItem], memberHandle: String? = nil, viewerAccountId: String) {
    self.id = id
    self.display_name = display_name
    self.handle = handle
    self.verification = verification
    self.owned = owned
    self.roles = roles
    self.memberHandle = memberHandle
    self.viewerAccountId = viewerAccountId
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `display_name`
    case `handle`
    case `verification`
    case `owned`
    case `roles`
    case `memberHandle`
    case `viewerAccountId`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.display_name = try container.decode(String.self, forKey: .display_name)
    self.handle = try container.decode(String.self, forKey: .handle)
    self.verification = try container.decode(String.self, forKey: .verification)
    self.owned = try container.decode(Bool.self, forKey: .owned)
    self.roles = try container.decode([APIStudioStudioSessionCreatorsItemRolesItem].self, forKey: .roles)
    self.memberHandle = try container.decode(String?.self, forKey: .memberHandle)
    self.viewerAccountId = try container.decode(String.self, forKey: .viewerAccountId)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(display_name, forKey: .display_name)
    try container.encode(handle, forKey: .handle)
    try container.encode(verification, forKey: .verification)
    try container.encode(owned, forKey: .owned)
    try container.encode(roles, forKey: .roles)
    try container.encode(memberHandle, forKey: .memberHandle)
    try container.encode(viewerAccountId, forKey: .viewerAccountId)
  }
}

public enum APIStudioStudioSessionCreatorsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioSessionInvitationsItem: Codable, Sendable {
  public let `id`: String
  public let `creatorId`: String
  public let `creatorName`: String
  public let `roles`: [APIStudioStudioSessionInvitationsItemRolesItem]
  public let `expiresAt`: String
  public init(id: String, creatorId: String, creatorName: String, roles: [APIStudioStudioSessionInvitationsItemRolesItem], expiresAt: String) {
    self.id = id
    self.creatorId = creatorId
    self.creatorName = creatorName
    self.roles = roles
    self.expiresAt = expiresAt
  }
}

public enum APIStudioStudioSessionInvitationsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioTeam: Codable, Sendable {
  public let `members`: [APIStudioStudioTeamMembersItem]
  public let `invitations`: [APIStudioStudioTeamInvitationsItem]
  public init(members: [APIStudioStudioTeamMembersItem], invitations: [APIStudioStudioTeamInvitationsItem]) {
    self.members = members
    self.invitations = invitations
  }
}

public struct APIStudioStudioTeamMembersItem: Codable, Sendable {
  public let `account_id`: String
  public let `roles`: [APIStudioStudioTeamMembersItemRolesItem]
  public let `revoked_at`: String?
  public let `handle`: String?
  public init(account_id: String, roles: [APIStudioStudioTeamMembersItemRolesItem], revoked_at: String? = nil, handle: String? = nil) {
    self.account_id = account_id
    self.roles = roles
    self.revoked_at = revoked_at
    self.handle = handle
  }
  private enum CodingKeys: String, CodingKey {
    case `account_id`
    case `roles`
    case `revoked_at`
    case `handle`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.account_id = try container.decode(String.self, forKey: .account_id)
    self.roles = try container.decode([APIStudioStudioTeamMembersItemRolesItem].self, forKey: .roles)
    self.revoked_at = try container.decode(String?.self, forKey: .revoked_at)
    self.handle = try container.decode(String?.self, forKey: .handle)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(account_id, forKey: .account_id)
    try container.encode(roles, forKey: .roles)
    try container.encode(revoked_at, forKey: .revoked_at)
    try container.encode(handle, forKey: .handle)
  }
}

public enum APIStudioStudioTeamMembersItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioTeamInvitationsItem: Codable, Sendable {
  public let `id`: String
  public let `account_id`: String
  public let `handle`: String?
  public let `roles`: [APIStudioStudioTeamInvitationsItemRolesItem]
  public let `expires_at`: String
  public let `accepted_at`: String?
  public let `revoked_at`: String?
  public init(id: String, account_id: String, handle: String? = nil, roles: [APIStudioStudioTeamInvitationsItemRolesItem], expires_at: String, accepted_at: String? = nil, revoked_at: String? = nil) {
    self.id = id
    self.account_id = account_id
    self.handle = handle
    self.roles = roles
    self.expires_at = expires_at
    self.accepted_at = accepted_at
    self.revoked_at = revoked_at
  }
  private enum CodingKeys: String, CodingKey {
    case `id`
    case `account_id`
    case `handle`
    case `roles`
    case `expires_at`
    case `accepted_at`
    case `revoked_at`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.id = try container.decode(String.self, forKey: .id)
    self.account_id = try container.decode(String.self, forKey: .account_id)
    self.handle = try container.decode(String?.self, forKey: .handle)
    self.roles = try container.decode([APIStudioStudioTeamInvitationsItemRolesItem].self, forKey: .roles)
    self.expires_at = try container.decode(String.self, forKey: .expires_at)
    self.accepted_at = try container.decode(String?.self, forKey: .accepted_at)
    self.revoked_at = try container.decode(String?.self, forKey: .revoked_at)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(account_id, forKey: .account_id)
    try container.encode(handle, forKey: .handle)
    try container.encode(roles, forKey: .roles)
    try container.encode(expires_at, forKey: .expires_at)
    try container.encode(accepted_at, forKey: .accepted_at)
    try container.encode(revoked_at, forKey: .revoked_at)
  }
}

public enum APIStudioStudioTeamInvitationsItemRolesItem: String, Codable, Sendable {
  case `triage` = "triage"
  case `drafter` = "drafter"
  case `publisher` = "publisher"
  case `scheduler` = "scheduler"
}

public struct APIStudioStudioThreadEntries: Codable, Sendable {
  public let `items`: [APIStudioStudioThreadEntriesItemsItem]
  public let `nextCursor`: String?
  public let `coverage`: APIStudioStudioThreadEntriesCoverage
  public init(items: [APIStudioStudioThreadEntriesItemsItem], nextCursor: String? = nil, coverage: APIStudioStudioThreadEntriesCoverage) {
    self.items = items
    self.nextCursor = nextCursor
    self.coverage = coverage
  }
  private enum CodingKeys: String, CodingKey {
    case `items`
    case `nextCursor`
    case `coverage`
  }
  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.items = try container.decode([APIStudioStudioThreadEntriesItemsItem].self, forKey: .items)
    self.nextCursor = try container.decode(String?.self, forKey: .nextCursor)
    self.coverage = try container.decode(APIStudioStudioThreadEntriesCoverage.self, forKey: .coverage)
  }
  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(items, forKey: .items)
    try container.encode(nextCursor, forKey: .nextCursor)
    try container.encode(coverage, forKey: .coverage)
  }
}

public struct APIStudioStudioThreadEntriesItemsItem: Codable, Sendable {
  public let `fanId`: String
  public let `handle`: String
  public let `sources`: [APIStudioStudioThreadEntriesItemsItemSourcesItem]
  public let `updatedAt`: String
  public init(fanId: String, handle: String, sources: [APIStudioStudioThreadEntriesItemsItemSourcesItem], updatedAt: String) {
    self.fanId = fanId
    self.handle = handle
    self.sources = sources
    self.updatedAt = updatedAt
  }
}

public enum APIStudioStudioThreadEntriesItemsItemSourcesItem: String, Codable, Sendable {
  case `note_reply` = "note_reply"
  case `request` = "request"
}

public enum APIStudioStudioThreadEntriesCoverage: String, Codable, Sendable {
  case `notes_and_requests` = "notes_and_requests"
}

public enum ReadCreatorMediaPolicyPurpose: String, Codable, Sendable {
  case `source_audio` = "source_audio"
  case `interview_audio` = "interview_audio"
  case `post_photo` = "post_photo"
  case `post_audio` = "post_audio"
  case `human_note` = "human_note"
}

public struct CreatorAPIError: Error, Sendable { public let status: Int; public let body: Data }
public struct CreatorAPIBinaryResponse: Sendable {
  public let body: Data
  public let status: Int
  public let contentType: String?
  public let contentRange: String?
  public let acceptRanges: String?
}

private final class CreatorAPIRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

public actor CreatorAPIClient {
  private let baseURL: URL
  private let session: URLSession
  private let token: @Sendable () async throws -> String?
  private let maximumResponseBytes: Int
  private let timeoutSeconds: TimeInterval
  public init(baseURL: URL, session: URLSession = .shared, maximumResponseBytes: Int = 268_435_456, timeoutSeconds: TimeInterval = 30, token: @escaping @Sendable () async throws -> String?) {
    self.baseURL = baseURL; self.session = session; self.maximumResponseBytes = maximumResponseBytes; self.timeoutSeconds = timeoutSeconds; self.token = token
  }
  private func request<Response: Decodable & Sendable>(_ path: String, method: String, body: Data? = nil, authenticated: Bool, query: [URLQueryItem] = [], headers: [String: String] = [:], contentType: String = "application/json") async throws -> Response {
    let response = try await requestBytes(path, method: method, body: body, authenticated: authenticated, query: query, headers: headers, accept: "application/json", contentType: contentType)
    return try JSONDecoder().decode(Response.self, from: response.body)
  }
  private func requestBytes(_ path: String, method: String, body: Data? = nil, authenticated: Bool, query: [URLQueryItem] = [], headers: [String: String] = [:], accept: String = "application/octet-stream", contentType: String = "application/octet-stream") async throws -> CreatorAPIBinaryResponse {
    try Task.checkCancellation()
    guard (1...268_435_456).contains(maximumResponseBytes), timeoutSeconds > 0, timeoutSeconds <= 30 else { throw URLError(.badURL) }
    guard var url = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw URLError(.badURL) }
    url.percentEncodedPath = path
    if !query.isEmpty {
      let encodedQuery = query.compactMap { item in item.value.map { segment(item.name) + "=" + segment($0) } }.joined(separator: "&")
      url.percentEncodedQuery = encodedQuery.isEmpty ? nil : encodedQuery
    }
    guard let target = url.url else { throw URLError(.badURL) }
    var request = URLRequest(url: target)
    request.httpMethod = method; request.httpBody = body; request.timeoutInterval = timeoutSeconds
    request.setValue(accept, forHTTPHeaderField: "Accept")
    if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    if authenticated, let value = try await token() { request.setValue("Bearer \(value)", forHTTPHeaderField: "Authorization") }
    try Task.checkCancellation()
    let (bytes, response) = try await session.bytes(for: request, delegate: CreatorAPIRedirectGuard())
    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    let maximum = (200..<300).contains(response.statusCode) ? maximumResponseBytes : min(maximumResponseBytes, 8192)
    if response.expectedContentLength > Int64(maximum) { throw URLError(.dataLengthExceedsMaximum) }
    var data = Data()
    for try await byte in bytes {
      try Task.checkCancellation()
      guard data.count < maximum else { throw URLError(.dataLengthExceedsMaximum) }
      data.append(byte)
    }
    try Task.checkCancellation()
    guard (200..<300).contains(response.statusCode) else { throw CreatorAPIError(status: response.statusCode, body: data) }
    return CreatorAPIBinaryResponse(body: data, status: response.statusCode, contentType: response.value(forHTTPHeaderField: "Content-Type"), contentRange: response.value(forHTTPHeaderField: "Content-Range"), acceptRanges: response.value(forHTTPHeaderField: "Accept-Ranges"))
  }
  private func segment(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
  public func creatorEarningsLedger(creatorId: String, currency: String, cursor: String? = nil) async throws -> APICommerceCreatorLedgerPage {
    try await request("/v1/commerce/creators/\(segment(creatorId))/earnings", method: "GET", authenticated: true, query: [URLQueryItem(name: "currency", value: currency), URLQueryItem(name: "cursor", value: cursor)])
  }
  public func creatorPayoutOnboarding(creatorId: String, xCommerceAccountId: String? = nil, body: APICommercePayoutOnboardingCommand) async throws -> APICommercePayoutOnboardingResult {
    try await request("/v1/commerce/creators/\(segment(creatorId))/payout-onboarding", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-commerce-account-id": xCommerceAccountId].compactMapValues { $0 })
  }
  public func contentList(creatorId: String, cursor: String? = nil, limit: Int? = nil, state: String? = nil, query: String? = nil) async throws -> APIContentList {
    try await request("/v1/content/\(segment(creatorId))", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: limit.map { String($0) }), URLQueryItem(name: "state", value: state), URLQueryItem(name: "query", value: query)])
  }
  public func studioContentList(creatorId: String, cursor: String? = nil, limit: Int? = nil, state: String? = nil, query: String? = nil) async throws -> APIContentList {
    try await request("/v1/content/\(segment(creatorId))/studio", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: limit.map { String($0) }), URLQueryItem(name: "state", value: state), URLQueryItem(name: "query", value: query)])
  }
  public func studioLiveCatalog(creatorId: String) async throws -> APIContentLiveCatalog {
    try await request("/v1/content/\(segment(creatorId))/studio/live", method: "GET", authenticated: true)
  }
  public func saveContent(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APISaveContent) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/drafts", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func contentReplies(creatorId: String, cursor: String? = nil, limit: Int? = nil, filter: String? = nil, contentId: String? = nil) async throws -> APIContentReplyList {
    try await request("/v1/content/\(segment(creatorId))/replies", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: limit.map { String($0) }), URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "contentId", value: contentId)])
  }
  public func studioContentReplies(creatorId: String, cursor: String? = nil, limit: Int? = nil, filter: String? = nil, contentId: String? = nil) async throws -> APIContentReplyList {
    try await request("/v1/content/\(segment(creatorId))/studio/replies", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: limit.map { String($0) }), URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "contentId", value: contentId)])
  }
  public func contentReplyConsent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIQuoteConsent) async throws -> APIContentConsentResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/consent", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func contentReplyReaction(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIReactToReply) async throws -> APIContentReactionResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/reaction", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func withdrawContentReply(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentWithdrawResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/withdraw", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func contentPreference(creatorId: String) async throws -> APIContentPreference {
    try await request("/v1/content/\(segment(creatorId))/mute", method: "GET", authenticated: true)
  }
  public func muteContent(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APIContentMuteCommand) async throws -> APIContentMuteCommand {
    try await request("/v1/content/\(segment(creatorId))/mute", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func noteReplyPolicy(creatorId: String) async throws -> APINoteReplyPolicy {
    try await request("/v1/content/\(segment(creatorId))/reply-policy", method: "GET", authenticated: true)
  }
  public func myContentThanks(creatorId: String) async throws -> APIContentThanksView {
    try await request("/v1/content/\(segment(creatorId))/thanks", method: "GET", authenticated: true)
  }
  public func saveContentThanks(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APIThanksCommand) async throws -> APIContentRevisionResult {
    try await request("/v1/content/\(segment(creatorId))/thanks", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioThanksFeed(creatorId: String) async throws -> APIContentThanksFeed {
    try await request("/v1/content/\(segment(creatorId))/studio/thanks", method: "GET", authenticated: true)
  }
  public func runScheduledContent(creatorId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIContentScheduledResult {
    try await request("/v1/content/\(segment(creatorId))/studio/scheduled/run", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func runContentEffects(creatorId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIContentEffectsResult {
    try await request("/v1/content/\(segment(creatorId))/studio/effects/run", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
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
  public func publishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIPublishContent) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/publish", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func teamPublishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/team-publish", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func unpublishContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/unpublish", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func archiveContent(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/archive", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func replyToNote(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIReplyToNote) async throws -> APIContentReplyReviewResult {
    try await request("/v1/content/\(segment(creatorId))/\(segment(id))/replies", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func contentReplyReview(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentReplyReviewResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/review", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func contentReplyRead(creatorId: String, id: String, xQelvoraExpectedAccount: String? = nil, body: APIContentVersionCommand) async throws -> APIContentReplyReadResult {
    try await request("/v1/content/\(segment(creatorId))/replies/\(segment(id))/read", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioThreadEntries(creatorId: String, cursor: String? = nil, limit: Int? = nil) async throws -> APIStudioThreadEntries {
    try await request("/v1/studio/\(segment(creatorId))/threads", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: limit.map { String($0) })])
  }
  public func studioSession() async throws -> APIStudioSession {
    try await request("/v1/studio/session", method: "GET", authenticated: true)
  }
  public func acceptStudioInvitation(id: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIDone {
    try await request("/v1/studio/invitations/\(segment(id))/accept", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func inviteStudioMember(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioInvite) async throws -> APIStudioInvitation {
    try await request("/v1/studio/\(segment(creatorId))/team/invite", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
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
  public func submitStudioCorrection(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioCorrection) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/corrections", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioQueue(creatorId: String, cursor: String? = nil, filter: String? = nil, limit: Int? = nil) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/queue", method: "GET", authenticated: true, query: [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "filter", value: filter), URLQueryItem(name: "limit", value: limit.map { String($0) })])
  }
  public func studioPacket(creatorId: String, packetId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))", method: "GET", authenticated: true)
  }
  public func studioDecidePacket(creatorId: String, packetId: String, xQelvoraExpectedAccount: String? = nil, body: APICommerceDecidePacket) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/decide", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioPacketDeliveries(creatorId: String, packetId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/deliveries", method: "GET", authenticated: true)
  }
  public func studioDeliverPacket(creatorId: String, packetId: String, xQelvoraExpectedAccount: String? = nil, body: APICommerceFulfillmentCommand) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/packets/\(segment(packetId))/deliver", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioThread(creatorId: String, fanId: String) async throws -> APIStudioCommerceProjection {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))", method: "GET", authenticated: true)
  }
  public func studioTakeover(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioControlCommand) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/takeover", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioHandback(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioControlCommand) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/handback", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioPause(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioControlCommand) async throws -> APIFrame {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/pause", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioHumanReply(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIHumanReply) async throws -> APIMessage {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/reply", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func studioReplyDraft(creatorId: String, fanId: String) async throws -> APIStudioReplyDraft {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/draft", method: "GET", authenticated: true)
  }
  public func saveStudioReplyDraft(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioSaveReplyDraft) async throws -> APIStudioDraftVersion {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/draft", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func sendStudioReplyDraft(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil, body: APIStudioSendReplyDraft) async throws -> APIMessage {
    try await request("/v1/studio/\(segment(creatorId))/threads/\(segment(fanId))/send-draft", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
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
  public func updateTeamMemberRoles(creatorId: String, accountId: String, xExpectedAccountId: String, body: APITeamRolesUpdateInput) async throws -> APIDone {
    try await request("/v1/identity/\(segment(creatorId))/team/\(segment(accountId))/roles", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["X-Expected-Account-Id": xExpectedAccountId].compactMapValues { $0 })
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
  public func readThread(creatorId: String, fanId: String) async throws -> APIConversationConversationTimeline {
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
  public func deliverConversationRecording(creatorId: String, fanId: String, body: APIConversationConversationRecordingInput) async throws -> APIConversationConversationRecordingResult {
    try await request("/v1/conversations/\(segment(creatorId))/\(segment(fanId))/recordings", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func readThreadMedia(creatorId: String, fanId: String, assetId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIMediaMediaAsset {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/media/\(segment(assetId))", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func threadMediaPlayback(creatorId: String, fanId: String, assetId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIMediaPlaybackTicket {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/media/\(segment(assetId))/playback", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func playThreadMedia(creatorId: String, fanId: String, assetId: String, ticket: String, range: String? = nil, xQelvoraExpectedAccount: String? = nil, expectedAccountId: String? = nil) async throws -> CreatorAPIBinaryResponse {
    try await requestBytes("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/media/\(segment(assetId))/play", method: "GET", authenticated: true, query: [URLQueryItem(name: "ticket", value: ticket), URLQueryItem(name: "expectedAccountId", value: expectedAccountId)], headers: ["Range": range, "x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func readMediaCapabilities() async throws -> APIMediaCapabilities {
    try await request("/v1/w6/capabilities", method: "GET", authenticated: false)
  }
  public func readCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func joinCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APICallCallAdmission {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/join", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func setCallConsent(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallConsentCommand) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/consent", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func endCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallEndCall) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/end", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func saveCallSummaryNote(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallCallSummaryNote) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/summary-note", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func deleteCallSummary(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallCallRevision) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/delete-summary", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func cancelCallSession(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallCallRevision) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/cancel", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func readCallOffers(creatorId: String, fanId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APICallCallOffers {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/call-offers", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func selectCallOffer(creatorId: String, fanId: String, offerId: String, xQelvoraExpectedAccount: String? = nil, body: APICallSelectTime) async throws -> APICallCallSession {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/call-offers/\(segment(offerId))/select", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func readAccountCallRoute(sessionId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APICallCallRoute {
    try await request("/v1/w6/calls/\(segment(sessionId))/route", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func redeemCallAdmission(creatorId: String, fanId: String, sessionId: String, xQelvoraExpectedAccount: String? = nil, body: APICallAdmissionRedemption) async throws -> APICallAdmissionReceipt {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/calls/\(segment(sessionId))/redeem", method: "POST", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func readCreatorMediaPolicy(creatorId: String, objectId: String, purpose: ReadCreatorMediaPolicyPurpose) async throws -> APIMediaCreatorMediaPolicyView {
    try await request("/v1/w6/creators/\(segment(creatorId))/media-policy", method: "GET", authenticated: true, query: [URLQueryItem(name: "objectId", value: objectId), URLQueryItem(name: "purpose", value: purpose.rawValue)])
  }
  public func readAudienceCreatorMedia(creatorId: String, assetId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIMediaCreatorMediaAsset {
    try await request("/v1/w6/creators/\(segment(creatorId))/audience-media/\(segment(assetId))", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func audienceCreatorMediaPlayback(creatorId: String, assetId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APIMediaCreatorMediaPlaybackTicket {
    try await request("/v1/w6/creators/\(segment(creatorId))/audience-media/\(segment(assetId))/playback", method: "POST", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func playAudienceCreatorMedia(creatorId: String, assetId: String, ticket: String, range: String? = nil, xQelvoraExpectedAccount: String? = nil, expectedAccountId: String? = nil) async throws -> CreatorAPIBinaryResponse {
    try await requestBytes("/v1/w6/creators/\(segment(creatorId))/audience-media/\(segment(assetId))/play", method: "GET", authenticated: true, query: [URLQueryItem(name: "ticket", value: ticket), URLQueryItem(name: "expectedAccountId", value: expectedAccountId)], headers: ["Range": range, "x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func readCreatorCallAvailability(creatorId: String, xQelvoraExpectedAccount: String? = nil) async throws -> APICallAvailabilityView {
    try await request("/v1/w6/creators/\(segment(creatorId))/call-availability", method: "GET", authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func saveCreatorCallAvailability(creatorId: String, xQelvoraExpectedAccount: String? = nil, body: APICallAvailabilityCommand) async throws -> APICallAvailability {
    try await request("/v1/w6/creators/\(segment(creatorId))/call-availability", method: "PUT", body: JSONEncoder().encode(body), authenticated: true, headers: ["x-qelvora-expected-account": xQelvoraExpectedAccount].compactMapValues { $0 })
  }
  public func beginCreatorMedia(creatorId: String, body: APIMediaCreatorMediaUploadRequest) async throws -> APIMediaCreatorMediaUploadTicket {
    try await request("/v1/w6/creators/\(segment(creatorId))/media", method: "POST", body: JSONEncoder().encode(body), authenticated: true)
  }
  public func readCreatorMedia(creatorId: String, assetId: String) async throws -> APIMediaCreatorMediaAsset {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))", method: "GET", authenticated: true)
  }
  public func revokeCreatorMedia(creatorId: String, assetId: String) async throws -> APIMediaMediaRevocation {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))", method: "DELETE", authenticated: true)
  }
  public func resumeCreatorMedia(creatorId: String, assetId: String) async throws -> APIMediaCreatorMediaUploadTicket {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))/resume", method: "POST", authenticated: true)
  }
  public func uploadCreatorMediaChunk(creatorId: String, assetId: String, ticket: String, uploadOffset: Int, body: Data) async throws -> APIMediaCreatorMediaAsset {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))/upload", method: "PUT", body: body, authenticated: true, query: [URLQueryItem(name: "ticket", value: ticket)], headers: ["Upload-Offset": String(uploadOffset)].compactMapValues { $0 }, contentType: "application/octet-stream")
  }
  public func finishCreatorMedia(creatorId: String, assetId: String) async throws -> APIMediaCreatorMediaAsset {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))/finish", method: "POST", authenticated: true)
  }
  public func creatorMediaPlayback(creatorId: String, assetId: String) async throws -> APIMediaCreatorMediaPlaybackTicket {
    try await request("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))/playback", method: "POST", authenticated: true)
  }
  public func playCreatorMedia(creatorId: String, assetId: String, ticket: String, range: String? = nil) async throws -> CreatorAPIBinaryResponse {
    try await requestBytes("/v1/w6/creators/\(segment(creatorId))/media/\(segment(assetId))/play", method: "GET", authenticated: true, query: [URLQueryItem(name: "ticket", value: ticket)], headers: ["Range": range].compactMapValues { $0 })
  }
  public func readFanCreatorMedia(creatorId: String, fanId: String, assetId: String) async throws -> APIMediaCreatorMediaAsset {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/creator-media/\(segment(assetId))", method: "GET", authenticated: true)
  }
  public func fanCreatorMediaPlayback(creatorId: String, fanId: String, assetId: String) async throws -> APIMediaCreatorMediaPlaybackTicket {
    try await request("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/creator-media/\(segment(assetId))/playback", method: "POST", authenticated: true)
  }
  public func playFanCreatorMedia(creatorId: String, fanId: String, assetId: String, ticket: String, range: String? = nil) async throws -> CreatorAPIBinaryResponse {
    try await requestBytes("/v1/w6/threads/\(segment(creatorId))/\(segment(fanId))/creator-media/\(segment(assetId))/play", method: "GET", authenticated: true, query: [URLQueryItem(name: "ticket", value: ticket)], headers: ["Range": range].compactMapValues { $0 })
  }
}

public enum ApplicationDestination {
  public static func requiresFanProfile(_ value: String) -> Bool {
    !isPermitted(value) || value.components(separatedBy: "?")[0].range(of: "^/(?:identity/account|status|ops(?:/.*)?)$", options: .regularExpression) == nil
  }
  public static func isPermitted(_ value: String) -> Bool {
    if value.count > 2048 || value.contains("%") || value.contains("\\") || value.contains("#") || value.rangeOfCharacter(from: .whitespacesAndNewlines) != nil { return false }
    let parts = value.components(separatedBy: "?")
    guard parts.count <= 2, parts[0].range(of: "^/(?:home|discover|requests(?:/[a-f0-9-]{36})?|you(?:/spending)?|identity/account|ops(?:/(?:audits|metrics|cases/[a-f0-9-]{36}))?|status|notifications(?:/settings)?|invite/[a-f0-9-]{36}|share/[a-f0-9-]{36}|onboarding/handle|studio(?:/(?:workspace|setup|notes|requests|threads|ai(?:/(?:overview|sources|style|rules|test|versions|license|interview|onboard))?|more|impact|insights|measurement|launch|activation)|/[a-f0-9-]{36}/(?:notes|replies|compose(?:/[a-f0-9-]{36})?|post(?:/[a-f0-9-]{36})?|publish|team|thanks|requests|packets/[a-f0-9-]{36}|threads(?:/[a-f0-9-]{36})?|ai|more))?|commerce/(?:requests|spending|access|packet|checkout|status|pass|membership|offers|earnings|pool)|media/voice|calls/[a-f0-9-]{36}(?:/[a-f0-9-]{36}/[a-f0-9-]{36})?|support(?:/(?:privacy|reports|access|feedback|cases/[a-f0-9-]{36}))?|trust(?:/(?:privacy|reports|crisis|cases/[a-f0-9-]{36}))?|content/[a-f0-9-]{36}/[a-f0-9-]{36}|creators/[a-z0-9_]{3,30}(?:/(?:chat|posts|requests|access)|/posts/[a-f0-9-]{36})?|threads/[a-f0-9-]{36}/[a-f0-9-]{36}|verify/[a-f0-9-]{36})$", options: .regularExpression) != nil else { return false }
    if parts.count == 1 { return true }
    let scopes = ["context": "^/creators/", "creatorId": "^(?:/commerce/|/support$|/you$|/media/voice$)", "fanId": "^/you$", "packetId": "^/commerce/", "offer": "^/calls/[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}$", "messageId": "^/support$", "quote": "^/studio/[a-f0-9-]{36}/(?:compose|post|publish)$", "packet": "^/studio/[a-f0-9-]{36}/publish$", "objectId": "^/media/voice$", "kind": "^/support$"]
    let literalValues = ["offer": "1", "kind": "verification"]
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
