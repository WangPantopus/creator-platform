import Foundation
import SwiftUI
import CoreTransferable
import UniformTypeIdentifiers

private struct TrustItems<T: Decodable>: Decodable { let items: [T] }
private struct TrustCase: Decodable, Identifiable { let id: String; let number: Int; let kind: String; let state: String; let version: Int }
private struct TrustNotice: Decodable, Identifiable { let id: String; let type: String; let reason: String }
private struct TrustTask: Decodable, Identifiable { let domain: String; let state: String; let error_code: String?; var id: String { domain } }
private struct TrustRetained: Decodable, Identifiable { let domain: String?; let category: String; let until: String?; let reason: String; var id: String { (domain ?? "trust") + ":" + category } }
private struct TrustJob: Decodable, Identifiable { let id: String; let kind: String; let scope: String; let state: String; let created_at: String; let tasks: [TrustTask]?; let retained: [TrustRetained]? }
private struct TrustExport: Transferable { let data: Data; static var transferRepresentation: some TransferRepresentation { DataRepresentation(exportedContentType: .json) { $0.data } } }
private struct TrustCapability: Decodable { let localDevelopment: Bool; let actorVerification: String; let verificationMethod: String? }
private struct TrustAccess: Decodable { let case_id: String; let action: String; let purpose: String; let created_at: String }
private struct TrustHelp: Decodable { struct Resource: Decodable { let region: String; let name: String; let url: String; let phone: String? }; let emergencyMessage: String; let resources: [Resource] }
private struct TrustAck: Decodable { let id: String?; let number: Int?; let saved: Bool? }
private struct TrustFailure: Decodable { struct Detail: Decodable { let message: String; let correlationId: String? }; let error: Detail }

/// W8 client shares W1's secure session storage and never persists a second credential.
public struct TrustClient: Sendable {
    public let baseURL: URL
    public let token: @Sendable () async throws -> String?
    public init(baseURL: URL, token: (@Sendable () async throws -> String?)? = nil) { self.baseURL = baseURL; self.token = token ?? { try await SecureSessionStorage(issuer: baseURL).read() } }
    fileprivate func request<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try JSONDecoder().decode(T.self, from: await bytes(path, body: body))
    }
    fileprivate func bytes(_ path: String, body: Data? = nil) async throws -> Data {
        guard let url = URL(string: "/v1/trust/" + path, relativeTo: baseURL) else { throw URLError(.badURL) }
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"; request.httpBody = body; request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Correlation-Id")
        // Public help must remain reachable when secure account storage is unavailable.
        let needsAccount = body != nil || !["capabilities", "help", "status"].contains(path)
        if needsAccount, let token = try await token() { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let failure = try? JSONDecoder().decode(TrustFailure.self, from: data)
            throw TrustClientError(message: failure?.error.message ?? "Reconnect and try again.", reference: failure?.error.correlationId)
        }
        guard data.count <= 32 * 1024 * 1024 else { throw TrustClientError(message: "This export exceeds the native download limit. Open Your data on the web.", reference: nil) }
        return data
    }
}
private struct TrustClientError: LocalizedError { let message: String; let reference: String?; var errorDescription: String? { message + (reference.map { " Reference " + $0 } ?? "") } }

/// Support/privacy composition uses established controls; final phone composition remains a recorded design gap.
public struct TrustFanFeature: View {
    private let client: TrustClient?
    @State private var route: String
    @State private var cases: [TrustCase] = []
    @State private var notices: [TrustNotice] = []
    @State private var jobs: [TrustJob] = []
    @State private var selectedJob: TrustJob?
    @State private var capability: TrustCapability?
    @State private var kind = "support"
    @State private var reason = ""
    @State private var creatorID = ""
    @State private var messageID = ""
    @State private var requestID = ""
    @State private var threadID = ""
    @State private var scope = "account"
    @State private var proof = ""
    @State private var commandKey = UUID().uuidString
    @State private var busy = false
    @State private var error = ""
    @State private var result = ""
    @State private var confirmingDelete = false
    @State private var exportPayload: TrustExport?
    @State private var history: [TrustAccess] = []
    @State private var help: TrustHelp?
    @State private var useful = "unanswered"
    @State private var authorship = "unanswered"
    @State private var feedbackComment = ""
    @State private var feedbackConsent = false
    @Environment(\.colorScheme) private var scheme
    public init(baseURL: URL?, destination: String = "/support", token: (@Sendable () async throws -> String?)? = nil) {
        client = baseURL.map { TrustClient(baseURL: $0, token: token) }; _route = State(initialValue: destination)
        let query = URLComponents(string: destination)?.queryItems ?? []
        let creator = query.first { $0.name == "creatorId" }?.value ?? "", message = query.first { $0.name == "messageId" }?.value ?? ""
        if UUID(uuidString: creator) != nil && UUID(uuidString: message) != nil { _creatorID = State(initialValue: creator); _messageID = State(initialValue: message); _kind = State(initialValue: "ai_report") }
        let request = query.first { $0.name == "requestId" }?.value ?? ""
        if UUID(uuidString: request) != nil { _requestID = State(initialValue: request) }
    }
    public static func registration(baseURL: URL?) -> FanFeatureRegistration { FanFeatureRegistration(matches: { $0.hasPrefix("/support") || $0.hasPrefix("/trust") }, allowsSignedOut: { $0.hasPrefix("/trust") }, screen: { model in
        let account = model.session?.accountId
        return AnyView(TrustFanFeature(baseURL: baseURL, destination: model.destination, token: {
            let credential = try await SecureSessionStorage(issuer: baseURL).read()
            // A task from the old screen must never pick up the next account's
            // credential after an asynchronous secure-storage read.
            guard account != nil, await MainActor.run(body: { model.session?.accountId }) == account else { throw TrustClientError(message: "Your account changed. Reopen this screen before continuing.", reference: nil) }
            return credential
        }).id(account ?? "signed-out"))
    }) }
    private var title: String { route.contains("privacy") ? "Your data" : route.contains("access") ? "Case access history" : route.contains("feedback") ? "Optional product feedback" : route.hasPrefix("/trust") ? "Crisis help protocol" : "Help and reports" }
    public var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            Text(title).qText("display-md")
            Text("Reports are available without paid access. Case evidence is limited to what you report.").qText("body")
            HStack { Button("Support", variant: .quiet) { route = "/support" }; Button("Your data", variant: .quiet) { route = "/support/privacy" } }
            HStack { Button("Access history", variant: .quiet) { route = "/support/access" }; Button("Feedback", variant: .quiet) { route = "/support/feedback" } }
            Button("Crisis help", variant: .quiet) { route = "/trust/crisis" }
            if busy { ProgressView().accessibilityLabel("Loading") }
            if !error.isEmpty { Notice(tone: .error, title: "Could not complete", children: error) }
            if !result.isEmpty { Notice(title: "Saved", children: result) }
            if route.contains("privacy") { privacy } else if route.contains("access") { accessHistory } else if route.contains("feedback") { feedback } else if route.hasPrefix("/trust") { crisisHelp } else { support }
            Button("Refresh", variant: .secondary, block: true, disabled: busy) { Task { await load() } }
        }.padding(16) }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
        .task(id: route) { await load() }
        .onChange(of: [kind, reason, creatorID, messageID, requestID, threadID, scope, proof]) { _, _ in commandKey = UUID().uuidString }
        .confirmationDialog("Delete this data scope?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            SwiftUI.Button("Request deletion", role: .destructive) { Task { await privacyCommand("delete") } }
            SwiftUI.Button("Keep data", role: .cancel) {}
        } message: { Text("Access closes immediately. Purging waits for every domain. Retained records are disclosed in job progress. Store subscriptions must be canceled separately.") }
    }
    private var support: some View { VStack(alignment: .leading, spacing: 16) {
        Picker("Report type", selection: $kind) { Text("Support request").tag("support"); Text("Report AI message").tag("ai_report"); Text("Abuse report").tag("abuse"); Text("Block creator").tag("block"); Text("Crisis help").tag("crisis") }.pickerStyle(.menu)
        if kind == "ai_report" || kind == "abuse" || kind == "block" { field("Creator ID", $creatorID) }
        if kind == "ai_report" { field("AI message ID", $messageID) }
        if kind == "support" { field("Request ID (optional)", $requestID) }
        if kind == "crisis" { crisisHelp }
        field("What happened?", $reason, multiline: true)
        Button(kind == "block" ? "Block creator" : "Send report", variant: .secondary, block: true, disabled: busy || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 12 || (kind == "support" && !requestID.isEmpty && UUID(uuidString: requestID) == nil) || (kind == "block" && UUID(uuidString: creatorID) == nil) || (kind == "ai_report" && (UUID(uuidString: creatorID) == nil || UUID(uuidString: messageID) == nil))) { Task { await report() } }
        Text("Your cases").qText("title")
        ForEach(cases) { item in VStack(alignment: .leading, spacing: 8) { Text("CASE-\(item.number) · \(item.kind.replacingOccurrences(of: "_", with: " ")) · \(item.state)").qText("body-strong"); if item.state == "resolved" { Button("Appeal CASE-\(item.number)", variant: .secondary, disabled: busy || reason.count < 12) { Task { await appeal(item) } } } } }
        Text("Trust inbox").qText("title")
        ForEach(notices) { item in VStack(alignment: .leading, spacing: 8) { Text(item.type.replacingOccurrences(of: "_", with: " ")).qText("label"); Text(item.reason).qText("body") } }
    } }
    private var crisisHelp: some View { VStack(alignment: .leading, spacing: 16) {
        Text(help?.emergencyMessage ?? "If you are in immediate danger, contact local emergency services. An AI cannot provide emergency help.").qText("body-strong")
        Text("Reports do not require paid access. Urgent cases need a staffed safety responder. This service does not claim continuous emergency monitoring or a guaranteed response time.").qText("body")
        if let help { if help.resources.isEmpty { Text("Regional help resources are not configured in this environment.").qText("caption") }; ForEach(Array(help.resources.enumerated()), id: \.offset) { _, item in if let url = URL(string: item.url), url.scheme == "https" { Link(item.name + " · " + item.region, destination: url) }; if let phone = item.phone { Text(phone).qText("body") } } }
    } }
    private var accessHistory: some View { VStack(alignment: .leading, spacing: 16) {
        Text("These records show when an authorized operations account opened your case evidence and its purpose. Opening a case does not mean someone read every word.").qText("body")
        if history.isEmpty && !busy { Text("No case accesses yet.").qText("caption") }
        ForEach(Array(history.enumerated()), id: \.offset) { _, item in VStack(alignment: .leading, spacing: 8) { Text(item.action.replacingOccurrences(of: "_", with: " ") + " · " + item.created_at).qText("caption"); Text(item.purpose).qText("body") } }
    } }
    private var feedback: some View { VStack(alignment: .leading, spacing: 16) {
        Text("Your answers help evaluate usefulness and clear authorship. They do not affect access, ranking or payment. Feedback is retained for 90 days and included in account deletion.").qText("body")
        Picker("Was the conversation useful?", selection: $useful) { Text("Choose an answer").tag("unanswered"); Text("Yes").tag("yes"); Text("No").tag("no") }
        Picker("Was it clear who wrote each message?", selection: $authorship) { Text("Choose an answer").tag("unanswered"); Text("Yes").tag("yes"); Text("No").tag("no") }
        field("Anything to improve? (optional)", $feedbackComment, multiline: true)
        SwiftUI.Toggle("I agree to share these answers for product feedback.", isOn: $feedbackConsent)
        Button("Send feedback", variant: .secondary, block: true, disabled: busy || !feedbackConsent || useful == "unanswered" || authorship == "unanswered") { Task { if await perform("feedback", ["consent": true, "cohort": "unspecified", "useful": useful == "yes", "authorshipClear": authorship == "yes", "comment": String(feedbackComment.prefix(2000))]) != nil { result = "Your feedback is saved."; feedbackConsent = false; feedbackComment = "" } } }
    } }
    private var privacy: some View { VStack(alignment: .leading, spacing: 16) {
        Text("Export and deletion are separate from canceling store billing. A job finishes only after every data domain acknowledges it.").qText("body")
        Link("Manage Apple subscriptions", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
        Picker("Data scope", selection: $scope) { Text("Account").tag("account"); Text("Creator").tag("creator"); Text("Conversation").tag("thread") }.pickerStyle(.menu).frame(minHeight: 44).contentShape(Rectangle())
        if scope != "account" { field("Creator ID", $creatorID) }; if scope == "thread" { field("Conversation ID", $threadID) }
        if capability?.localDevelopment == true { Text("Synthetic local account: type LOCAL DEVELOPMENT to confirm.").qText("caption"); field("Local confirmation", $proof) }
        else if capability?.verificationMethod == "current_session" { Text("Your sign-in must be recent. Continue with Pantopus again if asked to verify your account.").qText("caption") }
        else if capability?.actorVerification == "configured" { field("Account verification receipt", $proof) }
        else { Text("Fresh account verification must be connected before requesting data changes.").qText("caption") }
        Button("Request export", variant: .secondary, block: true, disabled: privacyDisabled) { Task { await privacyCommand("export") } }
        Button("Request deletion", variant: .secondary, block: true, disabled: privacyDisabled) { confirmingDelete = true }
        ForEach(jobs) { job in
            Text("Requested " + job.created_at).qText("caption")
            Button(job.kind + " · " + job.scope + " · " + job.state.replacingOccurrences(of: "_", with: " "), variant: .quiet, block: true, disabled: busy) { Task { await jobDetail(job.id) } }
                .accessibilityLabel(job.kind + ", " + job.scope + ", " + job.state.replacingOccurrences(of: "_", with: " ") + ", requested " + job.created_at + ", job " + job.id)
                .accessibilityIdentifier("privacy-job-" + job.id)
        }
        if let selectedJob { jobProgress(selectedJob) }
    } }
    @ViewBuilder private func jobProgress(_ job: TrustJob) -> some View {
        Text("Job " + job.id).qText("caption")
        ForEach(job.tasks ?? []) { task in Text(taskDescription(task)).qText("body") }
        ForEach(job.retained ?? []) { item in retainedRecord(item) }
        if job.state != "complete" { Button("Retry incomplete domains", variant: .secondary, block: true, disabled: busy) { Task { await retry(job.id) } } }
        if job.state == "complete" && job.kind == "export" {
            Button("Prepare export", variant: .secondary, block: true, disabled: busy) { Task { await download(job.id) } }
            if let exportPayload { ShareLink("Share your export", item: exportPayload, preview: SharePreview("Your creator data")) }
        }
    }
    private func taskDescription(_ task: TrustTask) -> String {
        let failure = task.error_code.map { " · " + $0.replacingOccurrences(of: "_", with: " ") } ?? ""
        return task.domain + ": " + task.state.replacingOccurrences(of: "_", with: " ") + failure
    }
    private func retainedRecord(_ item: TrustRetained) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Retained: " + item.category.replacingOccurrences(of: "_", with: " ")).qText("label")
            Text(item.reason).qText("body")
            if let until = item.until { Text("Until " + until).qText("caption") }
        }
    }
    private var privacyDisabled: Bool { busy || capability?.actorVerification != "configured" || (capability?.localDevelopment == true ? proof != "LOCAL DEVELOPMENT" : capability?.verificationMethod != "current_session" && proof.isEmpty) || (scope != "account" && UUID(uuidString: creatorID) == nil) || (scope == "thread" && UUID(uuidString: threadID) == nil) }
    private func field(_ title: String, _ value: Binding<String>, multiline: Bool = false) -> some View { VStack(alignment: .leading, spacing: 8) { Text(title).qText("label"); TextField(title, text: value, axis: multiline ? .vertical : .horizontal).textFieldStyle(.roundedBorder).qDisableAutoCapitalization().autocorrectionDisabled().lineLimit(multiline ? 3...8 : 1...1).frame(minHeight: 44).contentShape(Rectangle()).accessibilityLabel(title) } }
    // Public crisis help never waits on capability or account data: a restored or
    // degraded host can refuse those while help stays available. A failed capability
    // read clears the old value so data requests cannot submit on stale verification.
    private func load() async {
        guard let client else { error = "The trust service is not configured."; return }
        busy = true; defer { busy = false }
        var failure: Error?
        do { help = try await client.request("help") } catch { failure = error }
        if route.contains("privacy") { do { capability = try await client.request("capabilities") } catch { capability = nil; failure = failure ?? error } }
        do {
            if route.hasPrefix("/trust") || route.contains("feedback") { }
            else if route.contains("access") { let page: TrustItems<TrustAccess> = try await client.request("access-history"); history = page.items }
            else if route.contains("privacy") {
                exportPayload = nil
                let page: TrustItems<TrustJob> = try await client.request("privacy/jobs")
                jobs = page.items
                if let selectedId = selectedJob?.id, jobs.contains(where: { $0.id == selectedId }) {
                    let detail: TrustJob = try await client.request("privacy/jobs/" + selectedId)
                    selectedJob = detail
                    jobs = jobs.map { $0.id == selectedId ? detail : $0 }
                } else { selectedJob = nil }
            } else { let page: TrustItems<TrustCase> = try await client.request("my-cases"); let inbox: TrustItems<TrustNotice> = try await client.request("inbox"); cases = page.items; notices = inbox.items }
        } catch { cases = []; notices = []; jobs = []; history = []; selectedJob = nil; exportPayload = nil; failure = failure ?? error }
        error = failure?.localizedDescription ?? ""
    }
    private func perform(_ path: String, _ input: [String: Any]) async -> TrustAck? { guard let client, !busy else { return nil }; busy = true; defer { busy = false }; do { let ack: TrustAck = try await client.request(path, body: JSONSerialization.data(withJSONObject: input)); error = ""; commandKey = UUID().uuidString; return ack } catch { self.error = error.localizedDescription; return nil } }
    private func report() async {
        if kind == "block" { if await perform("blocks", ["creatorId": creatorID.lowercased(), "reason": reason, "idempotencyKey": commandKey]) != nil { result = "Your block is saved. Enforcement in connected domains follows their current denial checks."; reason = ""; await load() }; return }
        var input: [String: Any] = ["kind": kind, "reason": reason, "idempotencyKey": commandKey]; if kind != "support" && !creatorID.isEmpty { input["creatorId"] = creatorID.lowercased() }; if kind == "ai_report" { input["messageId"] = messageID.lowercased() }; if kind == "support" && !requestID.isEmpty { input["requestId"] = requestID.lowercased() }; if let ack = await perform("reports", input) { result = "CASE-\(ack.number ?? 0) is saved. No provider action is implied."; reason = ""; await load() }
    }
    private func appeal(_ item: TrustCase) async { if await perform("cases/" + item.id + "/appeals", ["version": item.version, "reason": reason, "idempotencyKey": commandKey]) != nil { result = "Your appeal is saved for a different reviewer."; reason = ""; await load() } }
    private func privacyCommand(_ kind: String) async { var input: [String: Any] = ["kind": kind, "scope": scope, "proof": capability?.verificationMethod == "current_session" ? "CURRENT_SESSION" : proof, "idempotencyKey": commandKey]; if scope != "account" { input["creatorId"] = creatorID.lowercased() }; if scope == "thread" { input["threadId"] = threadID.lowercased() }; if let ack = await perform("privacy/jobs", input) { result = "Request saved; inspect each domain's progress."; await load(); if let id = ack.id { await jobDetail(id) } } }
    private func jobDetail(_ id: String) async {
        guard let client, !busy else { return }
        busy = true; defer { busy = false }
        exportPayload = nil
        do {
            let detail: TrustJob = try await client.request("privacy/jobs/" + id)
            selectedJob = detail
            jobs = jobs.map { $0.id == id ? detail : $0 }
            error = ""
        } catch { selectedJob = nil; self.error = error.localizedDescription }
    }
    private func download(_ id: String) async { guard let client, !busy else { return }; busy = true; defer { busy = false }; do { exportPayload = TrustExport(data: try await client.bytes("privacy/jobs/" + id + "/download")); error = "" } catch { exportPayload = nil; self.error = error.localizedDescription } }
    private func retry(_ id: String) async { if await perform("privacy/jobs/" + id + "/retry", [:]) != nil { result = "Incomplete domains queued again."; await jobDetail(id) } }
}
