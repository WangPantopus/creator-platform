import Foundation
import SwiftUI

struct W3ComparisonPolicy: Decodable, Sendable { let version: String; let notice: String; let processorPolicyVersion: String }
struct W3ComparisonConsent: Decodable, Sendable { let policy: W3ComparisonPolicy?; let allowed: Bool; let consentedAt: String?; let expiresAt: String? }
struct W3ComparisonResult: Decodable, Sendable { let included: Bool }

/// A live, separate-purpose choice. No choice or notice is persisted by the app.
struct W3ComparisonChoice: View {
    let client: W3ConversationClient
    let root: String
    var messageId: String? = nil
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
                Notice(tone: .error, title: "Comparison status", children: failure)
                Button("Refresh comparison choice", variant: .secondary, disabled: busy) { operation = Task { await refresh() } }
            }
            if available == false { Text("AI comparisons are not available yet.").qText("body") }
            if choice == nil && available != false && failure.isEmpty { Text("Loading your comparison choice…").qText("body") }
            if let choice {
                Text(choice.allowed ? "Allowed for this creator" : "Off · optional").qText("data-sm")
                Text(choice.policy?.notice ?? "The current comparison notice is unavailable. No new questions can be included.").qText("body")
                if choice.allowed, let expiry = choice.expiresAt { Text("Your choice ends " + expiry).qText("caption") }
                if busy { Text("Saving your comparison choice or checking this question…").qText("body").accessibilityAddTraits(.updatesFrequently) }
                if !status.isEmpty { Text(status).qText("body").accessibilityAddTraits(.updatesFrequently) }
                if choice.allowed {
                    if messageId != nil { Button("Include this question", variant: .ai, block: true, disabled: busy) { run("include") } }
                    Button("Withdraw comparison choice", variant: .secondary, block: true, disabled: busy) { run("withdraw") }
                } else if choice.policy != nil {
                    Button("Allow questions for AI comparisons", variant: .ai, block: true, disabled: busy) { run("allow") }
                }
            }
        }
        .task(id: "\(root)-\(scenePhase)") { if scenePhase == .active { await refresh() } else { conceal() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
        .onDisappear { conceal() }
    }
    private func conceal() {
        revision += 1; operation?.cancel(); operation = nil
        choice = nil; available = nil; failure = ""; status = ""; busy = false
    }
    private func current(_ ticket: Int) -> Bool { revision == ticket && scenePhase == .active && !Task.isCancelled }
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
        } catch { if current(ticket) { failure = (error as? W3Failure)?.message ?? "Reconnect to view your comparison choice." } }
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
                    status = result.included ? "A general version of this question is saved for AI comparisons. You can withdraw your choice in Me and privacy." : "This question was not included. It did not pass the comparison privacy checks."
                } else {
                    var body: [String: Any] = ["action": action]
                    if action == "allow" { guard let policy = choice.policy else { return }; body["policyVersion"] = policy.version; body["consent"] = true }
                    let fresh: W3ComparisonConsent = try await client.request(root + "/comparison-consent", body: JSONSerialization.data(withJSONObject: body))
                    guard current(ticket) else { return }
                    self.choice = fresh
                    status = action == "withdraw" ? "Your comparison choice is withdrawn. Saved comparison questions and text have been removed. Affected exports remain unavailable while their files are removed." : "Your comparison choice is saved. Choose a question in the conversation to include it."
                }
            } catch { if current(ticket) { failure = (error as? W3Failure)?.message ?? "The result could not be confirmed. Refresh your choice before continuing." } }
        }
    }
}
