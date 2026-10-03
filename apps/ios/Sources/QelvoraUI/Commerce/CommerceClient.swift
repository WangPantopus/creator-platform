import Foundation

struct CommerceOverview: Decodable, Sendable {
    struct Fan: Decodable, Sendable { let id: String; let handle: String }
    struct Creator: Decodable, Identifiable, Sendable { let id: String; let handle: String; let display_name: String }
    struct Policy: Decodable, Sendable { let currency: String; let limitOptions: [Int64]; let passEnabled: Bool }
    struct Capabilities: Decodable, Sendable { let paymentsAvailable: Bool; let membershipAvailable: Bool; let nativeReplyPurchase: Bool; let storePurchasesAvailable: Bool? }
    struct Exposure: Decodable, Sendable { let captured: Int64; let held: Int64; let total: Int64; let currency: String; let refunded: Int64?; let month: String? }
    struct Tier: Decodable, Sendable { struct Catalog: Decodable, Sendable { struct StoreProduct: Decodable, Sendable { let productId: String }; let apple: StoreProduct? }; let id: String; let state: String; let catalog: Catalog }
    let fan: Fan?; let creators: [Creator]; let packets: [CommercePacket]; let modes: [CommerceMode]
    let limits: [CommerceLimit]; let memberships: [CommerceMembership]; let slots: [CommerceSlot]
    let pass: [CommercePass]; let passChoices: CommercePassChoices; let spendingNotices: [CommerceSpendingNotice]
    let policy: Policy; let capabilities: Capabilities; let exposure: Exposure?
    let tiers: [Tier]
}
struct CommerceMode: Decodable, Identifiable, Sendable {
    let id: String; let creator_id: String; let title: String; let kind: String; let amount: String?
    let public_amount: String?; let currency: String; let weekly_limit: Int; let used: Int; let reserved: Int
    let decision_hours: Int; let delivery_hours: Int; let shareable: Bool; let state: String; let version: Int
}
struct CommerceLimit: Decodable, Sendable {
    let currency: String; let amount: String?; let explicit_none: Bool; let pending_amount: String?
    let pending_none: Bool?; let effective_at: String?; let reminders_on: Bool; let version: Int
}
struct CommerceAccess: Decodable, Sendable {
    struct Allowance: Decodable, Sendable { let available: Int; let unit: String }
    struct Source: Decodable, Sendable { let id: String; let source: String; let validUntil: String }
    let version: String; let creatorId: String; let fanId: String; let validUntil: String?
    let capabilities: [String]; let allowance: Allowance; let sources: [Source]
}
struct CommerceMembership: Decodable, Identifiable, Sendable {
    let id: String; let creator_id: String; let name: String; let provider: String
    let state: String; let period_end: String; let cancel_at_end: Bool
}
struct CommerceSpendingNotice: Decodable, Identifiable, Sendable { let id: String; let threshold: Int; let created_at: String }
struct CommercePass: Decodable, Identifiable, Sendable { let id: String; let state: String; let version: Int; let slot_capacity: Int; let cycle_start: String; let cycle_end: String; let allowance: Int; let used: Int; let reserved: Int }
struct CommercePassChoices: Decodable, Sendable { struct Creator: Decodable, Identifiable, Sendable { let id: String; let display_name: String }; let creators: [Creator]; let replaceableSlotIds: [String] }
struct CommerceSlot: Decodable, Identifiable, Sendable {
    let id: String; let creator_id: String; let cycle_start: String; let display_name: String; let state: String; let position: Int; let ends_at: String
}
struct CommercePacket: Decodable, Identifiable, Sendable {
    struct Snapshot: Decodable, Sendable { let title: String; let mode: String; let amount: Int64; let currency: String; let decisionHours: Int; let deliveryHours: Int; let shareable: Bool }
    struct Disclosure: Decodable, Sendable { let summary: String? }
    let id: String; let creator_id: String; let fan_id: String; let snapshot: Snapshot
    let state: String; let payment_state: String; let version: Int; let created_at: String
    let decision_at: String?; let hold_expires_at: String?; let question: String?; let disclosure: Disclosure
    let commitment_state: String?; let delivered_at: String?
}
struct CommerceDetail: Decodable, Sendable {
    struct CallTransport: Decodable, Sendable { let state: String; let authorKind: String; let recordedAt: String? }
    struct Ledger: Decodable, Sendable { let kind: String; let amount: String; let currency: String }
    struct Commitment: Decodable, Sendable {
        struct Evidence: Decodable, Sendable { let signedActId: String?; let authorKind: String? }
        let id: String; let state: String; let version: Int; let due_at: String; let delivered_at: String?
        let accept_act_id: String?; let evidence: Evidence?
    }
    struct Share: Decodable, Sendable { let version: Int; let fan_choice: Bool; let revoked_at: String? }
    let packet: CommercePacket; let commitment: Commitment?; let share: Share?; let ledger: [Ledger]; let callTransport: CallTransport?
}
struct CommerceFailure: Error { let message: String; let status: Int; var code: String? = nil }
private struct CommerceErrorEnvelope: Decodable { struct Failure: Decodable { let message: String; let code: String? }; let error: Failure }

/// The genuine issuer supplies the original client and cancellable view capture.
/// Expected IDs only refuse replacement; they supply no financial authority.
@MainActor struct CommerceClient {
    private let model: FanSession
    private let accountId: String
    private let sessionId: String
    private let destination: String
    init(model: FanSession, accountId: String, sessionId: String, destination: String) {
        self.model = model; self.accountId = accountId; self.sessionId = sessionId; self.destination = destination
    }
    private var ready: Bool {
        model.session?.accountId == accountId && model.session?.sessionId == sessionId && model.destination == destination &&
        !model.checkingSession && !model.busy && model.error.isEmpty && !model.purgingPrivateState && !model.localPurgeFailed
    }
    func request<T: Decodable & Sendable>(_ path: String, body: Data? = nil) async throws -> T {
        try Task.checkCancellation()
        guard ready, let original = await model.captureRequest(from: destination, maximumResponseBytes: 4_194_304, timeoutSeconds: 15),
              original.expectedAccountId == accountId, original.sessionId == sessionId, ready else {
            throw CommerceFailure(message: "Refresh your account before continuing. Your input is kept.", status: 503)
        }
        do {
            let response = try await original.commerceBytes("/v1/commerce/" + path, body: body)
            try Task.checkCancellation()
            guard await original.isCurrent(), ready else { throw CancellationError() }
            let value = try JSONDecoder().decode(T.self, from: response.body)
            guard await original.isCurrent(), ready else { throw CancellationError() }
            return value
        } catch {
            try Task.checkCancellation()
            guard await original.isCurrent(), ready else { throw CancellationError() }
            if let failure = error as? CreatorAPIError {
                let detail = try? JSONDecoder().decode(CommerceErrorEnvelope.self, from: failure.body).error
                throw CommerceFailure(message: detail?.message ?? "This action is unavailable. Your input is kept.", status: failure.status, code: detail?.code)
            }
            throw error
        }
    }
}

enum CommerceAmount {
    static func digits(_ currency: String) -> Int { let format = NumberFormatter(); format.numberStyle = .currency; format.currencyCode = currency; return format.maximumFractionDigits }
    static func display(_ value: Int64, _ currency: String) -> String {
        let format = NumberFormatter(); format.numberStyle = .currency; format.currencyCode = currency
        return format.string(from: NSDecimalNumber(value: value).dividing(by: NSDecimalNumber(decimal: pow(Decimal(10), digits(currency))))) ?? "\(value) \(currency)"
    }
    static func input(_ value: Int64, _ currency: String) -> String {
        NSDecimalNumber(value: value).dividing(by: NSDecimalNumber(decimal: pow(Decimal(10), digits(currency)))).stringValue
    }
    static func parse(_ text: String, _ currency: String) throws -> Int64 {
        let digits = digits(currency)
        guard text.range(of: "^\\d+(?:\\.\\d{0,\(digits)})?$", options: .regularExpression) != nil,
              let value = Decimal(string: text, locale: Locale(identifier: "en_US_POSIX")) else { throw CommerceFailure(message: "Enter a valid amount.", status: 400) }
        let scaled = value * pow(Decimal(10), digits)
        guard scaled <= Decimal(9_007_199_254_740_991), scaled >= 0 else { throw CommerceFailure(message: "This amount is too large.", status: 400) }
        return NSDecimalNumber(decimal: scaled).int64Value
    }
}
