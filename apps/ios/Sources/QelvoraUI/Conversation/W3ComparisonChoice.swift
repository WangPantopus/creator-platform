import Foundation
import SwiftUI

struct W3ComparisonPolicy: Decodable, Sendable { let version: String; let notice: String; let processorPolicyVersion: String }
struct W3ComparisonConsent: Decodable, Sendable { let policy: W3ComparisonPolicy?; let allowed: Bool; let consentedAt: String?; let expiresAt: String? }
struct W3ComparisonResult: Decodable, Sendable { let included: Bool }

/// A live, separate-purpose choice. No choice or notice is persisted by the app.
/// When comparisons are off, or turn off while it is open, it shows nothing and
/// calls `onUnavailable` so the screen that opened it can close it (WP 7.4 P11).
struct W3ComparisonChoice: View {
    let client: W3ConversationClient
    let root: String
    var messageId: String? = nil
    var onUnavailable: () -> Void = {}
    @Environment(\.scenePhase) private var scenePhase
    @State private var choice: W3ComparisonConsent?
    @State private var available: Bool?
    @State private var failure = ""
    @State private var status = ""
    @State private var busy = false
    @State private var revision = 0
    @State private var operation: Task<Void, Never>?
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !failure.isEmpty {
                Notice(tone: .error, title: QelvoraCopy.text("nativeComparisonStatus"), children: failure)
                Button(QelvoraCopy.text("nativeRefreshComparisonChoice"), variant: .secondary, disabled: busy) { operation = Task { await refresh() } }
            }
            if choice == nil && available != false && failure.isEmpty { Text(QelvoraCopy.text("nativeLoadingYourComparisonChoice")).qText("body") }
            if let choice {
                Text(choice.allowed ? QelvoraCopy.text("nativeAllowedForThisCreator") : QelvoraCopy.text("nativeOffOptional")).qText("data-sm")
                Text(choice.policy?.notice ?? QelvoraCopy.text("nativeTheCurrentComparisonNoticeIs")).qText("body")
                if choice.allowed, let expiry = choice.expiresAt { Text(QelvoraCopy.text("nativeYourChoiceEndsDate", values: ["date": expiry])).qText("caption") }
                if busy { Text(QelvoraCopy.text("nativeSavingYourComparisonChoiceOr")).qText("body").accessibilityAddTraits(.updatesFrequently) }
                if !status.isEmpty { Text(status).qText("body").accessibilityAddTraits(.updatesFrequently) }
                if choice.allowed {
                    if messageId != nil { Button(QelvoraCopy.text("nativeIncludeThisQuestion"), variant: .ai, block: true, disabled: busy) { run("include") } }
                    Button(QelvoraCopy.text("nativeWithdrawComparisonChoice"), variant: .secondary, block: true, disabled: busy) { run("withdraw") }
                } else if choice.policy != nil {
                    Button(QelvoraCopy.text("nativeAllowQuestionsForAIComparisons"), variant: .ai, block: true, disabled: busy) { run("allow") }
                }
            }
        }
        .task(id: "\(root)-\(scenePhase)") { if scenePhase == .active { await refresh() } else { conceal() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
        .onDisappear { conceal() }
        .onChange(of: available) { _, value in if value == false { onUnavailable() } }
    }
    private func conceal() {
        revision += 1; operation?.cancel(); operation = nil
        choice = nil; available = nil; failure = ""; status = ""; busy = false
    }
    private func current(_ ticket: Int) -> Bool { revision == ticket && scenePhase == .active && !Task.isCancelled }
    /// The server's answer when comparisons are off: the choice closes and nothing is said.
    private func unavailable(_ error: any Error) -> Bool {
        guard (error as? W3Failure)?.code == "comparison_unavailable" else { return false }
        choice = nil; failure = ""; status = ""; available = false
        return true
    }
    private func refresh() async {
        revision += 1
        let ticket = revision; choice = nil; available = nil; failure = ""; status = ""
        do {
            let caps: W3Capabilities = try await client.request("capabilities", publicRead: true)
            guard current(ticket) else { return }
            available = caps.comparisonsAvailable == true
            if available == true {
                let fresh: W3ComparisonConsent = try await client.request(root + "/comparison-consent")
                if current(ticket) { choice = fresh }
            }
        } catch { if current(ticket) && !unavailable(error) { failure = (error as? W3Failure)?.message ?? QelvoraCopy.text("nativeReconnectToViewYourComparison") } }
    }
    private func run(_ action: String) {
        guard !busy, scenePhase == .active, let choice else { return }
        let ticket = revision; busy = true; status = ""; failure = ""
        operation = Task {
            defer { if current(ticket) { busy = false } }
            do {
                if action == "include" {
                    guard let messageId, choice.allowed else { return }
                    let result: W3ComparisonResult = try await client.request(root + "/messages/" + messageId + "/comparison", body: Data("{}".utf8))
                    guard current(ticket) else { return }
                    status = result.included ? QelvoraCopy.text("nativeAGeneralVersionOfThisQuestion") : QelvoraCopy.text("nativeThisQuestionWasNotIncludedIt")
                } else {
                    var body: [String: Any] = ["action": action]
                    if action == "allow" { guard let policy = choice.policy else { return }; body["policyVersion"] = policy.version; body["consent"] = true }
                    let fresh: W3ComparisonConsent = try await client.request(root + "/comparison-consent", body: JSONSerialization.data(withJSONObject: body))
                    guard current(ticket) else { return }
                    self.choice = fresh
                    status = action == "withdraw" ? QelvoraCopy.text("nativeYourComparisonChoiceIsWithdrawn") : QelvoraCopy.text("nativeYourComparisonChoiceIsSavedChoose")
                }
            } catch { if current(ticket) && !unavailable(error) { failure = (error as? W3Failure)?.message ?? QelvoraCopy.text("nativeTheResultCouldNotBeConfirmed") } }
        }
    }
}
