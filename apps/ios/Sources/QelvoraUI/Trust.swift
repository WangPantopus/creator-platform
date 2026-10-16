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
private struct TrustExport: Transferable {
    let data: Data
    let capture: FanSessionRequestCapture
    let model: FanSession
    @MainActor private func canShare() async -> Bool {
        guard await capture.isCurrent() else { return false }
        return model.session != nil && !model.checkingSession && !model.busy && model.error.isEmpty && !model.purgingPrivateState && !model.localPurgeFailed
    }
    static var transferRepresentation: some TransferRepresentation { DataRepresentation(exportedContentType: .json) { item in
        try Task.checkCancellation(); guard await item.canShare() else { throw CancellationError() }; return item.data
    } }
}
private struct TrustCapability: Decodable { let localDevelopment: Bool; let actorVerification: String; let verificationMethod: String? }
private struct TrustAccess: Decodable { let case_id: String; let action: String; let purpose: String; let created_at: String }
private struct TrustHelp: Decodable { struct Resource: Decodable { let region: String; let name: String; let url: String; let phone: String? }; let emergencyMessage: String; let resources: [Resource] }
private struct TrustAck: Decodable { let id: String?; let number: Int?; let saved: Bool? }
private struct TrustFailure: Decodable { struct Detail: Decodable { let message: String; let correlationId: String? }; let error: Detail }
/// The person's conversations, by creator name (`GET /v1/conversations/account`).
private struct TrustConversation: Decodable, Identifiable, Sendable { let id: String; let creatorId: String; let name: String }
private struct TrustConversationPage: Decodable, Sendable { let threads: [TrustConversation]; let nextCursor: String? }

private final class TrustPublicRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}

/// Private requests use only W1's genuine original capture. Public help has no credential.
@MainActor public struct TrustClient {
    public let baseURL: URL
    private let capture: FanSessionRequestCapture?
    public init(baseURL: URL, capture: FanSessionRequestCapture? = nil) { self.baseURL = baseURL; self.capture = capture }
    fileprivate func request<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try JSONDecoder().decode(T.self, from: await bytes(path, body: body))
    }
    fileprivate func bytes(_ path: String, body: Data? = nil, binary: Bool = false) async throws -> Data {
        if body != nil || !["capabilities", "help", "status"].contains(path) {
            guard let capture else { throw TrustClientError(message: QelvoraCopy.text("nativeRefreshYourAccountBeforeContinuing2"), reference: nil) }
            do { return try await capture.trustBytes("/v1/trust/" + path, body: body, binary: binary).body }
            catch let failure as CreatorAPIError {
                let detail = try? JSONDecoder().decode(TrustFailure.self, from: failure.body)
                throw TrustClientError(message: detail?.error.message ?? QelvoraCopy.text("nativeReconnectAndTryAgain"), reference: detail?.error.correlationId)
            }
        }
        guard let url = URL(string: "/v1/trust/" + path, relativeTo: baseURL) else { throw URLError(.badURL) }
        var request = URLRequest(url: url); request.httpMethod = "GET"; request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Correlation-Id")
        let configuration = URLSessionConfiguration.ephemeral; configuration.urlCache = nil
        let session = URLSession(configuration: configuration); defer { session.invalidateAndCancel() }
        let (stream, response) = try await session.bytes(for: request, delegate: TrustPublicRedirectGuard())
        var data = Data()
        for try await byte in stream {
            try Task.checkCancellation()
            guard data.count < 1_048_576 else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let failure = try? JSONDecoder().decode(TrustFailure.self, from: data)
            throw TrustClientError(message: failure?.error.message ?? QelvoraCopy.text("nativeReconnectAndTryAgain"), reference: failure?.error.correlationId)
        }
        return data
    }
}
private struct TrustClientError: LocalizedError { let message: String; let reference: String?; var errorDescription: String? { reference.map { QelvoraCopy.text("nativeMessageReferenceReference", values: ["message": message, "reference": $0]) } ?? message } }

/// Support/privacy composition uses established controls; final phone composition remains a recorded design gap.
public struct TrustFanFeature: View {
    private let client: TrustClient?
    @ObservedObject private var model: FanSession
    private var route: String { model.destination }
    private var privateVisible: Bool { model.session != nil && !model.busy && model.error.isEmpty && !model.purgingPrivateState && !model.localPurgeFailed }
    private var privateReady: Bool { privateVisible && !model.checkingSession }
    private var privateDisabled: Bool { busy || !privateReady }
    @State private var operation: Task<Void, Never>?
    @State private var refreshOperation: Task<Void, Never>?
    @State private var workEpoch = 0
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
    /// The pickers' choices: nil until loaded; memory only, cleared with the account view.
    @State private var conversations: [TrustConversation]?
    @State private var conversationsFailed = false
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    public init(baseURL: URL?, model: FanSession) {
        client = baseURL.map { TrustClient(baseURL: $0) }; self.model = model
        let query = URLComponents(string: model.destination)?.queryItems ?? []
        let creator = query.first { $0.name == "creatorId" }?.value ?? "", message = query.first { $0.name == "messageId" }?.value ?? ""
        // Opened from a thread or a message: that creator is already chosen (as on Android).
        if UUID(uuidString: creator) != nil { _creatorID = State(initialValue: creator.lowercased()) }
        if UUID(uuidString: creator) != nil && UUID(uuidString: message) != nil { _messageID = State(initialValue: message); _kind = State(initialValue: "ai_report") }
        let request = query.first { $0.name == "requestId" }?.value ?? ""
        if UUID(uuidString: request) != nil { _requestID = State(initialValue: request) }
    }
    public static func registration(baseURL: URL?) -> FanFeatureRegistration { FanFeatureRegistration(matches: { $0.hasPrefix("/support") || $0.hasPrefix("/trust") }, allowsSignedOut: { $0.hasPrefix("/trust") }, screen: { model in
        return AnyView(TrustFanFeature(baseURL: baseURL, model: model).id([model.session?.accountId ?? "signed-out", model.session?.sessionId ?? "no-session"]))
    }) }
    private var title: String { route.contains("privacy") ? QelvoraCopy.text("nativeYourData") : route.contains("access") ? QelvoraCopy.text("nativeCaseAccessHistory") : route.contains("feedback") ? QelvoraCopy.text("nativeOptionalProductFeedback") : route.hasPrefix("/trust") ? QelvoraCopy.text("nativeCrisisHelpProtocol") : QelvoraCopy.text("nativeHelpAndReports") }
    public var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) {
            Text(title).qText("display-md")
            Text(QelvoraCopy.text("nativeReportsAreAvailableWithoutPaid")).qText("body")
            navigation
            if busy { ProgressView().accessibilityLabel(QelvoraCopy.text("nativeLoading")) }
            if !error.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativeCouldNotComplete"), children: error) }
            if privateVisible && !result.isEmpty { Notice(title: QelvoraCopy.text("nativeSaved"), children: result) }
            if !privateVisible && !route.hasPrefix("/trust") { Notice(title: QelvoraCopy.text("nativeAccountUnavailable"), children: QelvoraCopy.text("nativeRefreshYourAccountBeforeContinuingUnsaved")) }
            if route.contains("privacy") { privacy } else if route.contains("access") { accessHistory } else if route.contains("feedback") { feedback } else if route.hasPrefix("/trust") { crisisHelp } else { support }
            Button(QelvoraCopy.text("nativeRefresh"), variant: .secondary, block: true, disabled: busy || model.checkingSession || model.busy) { refreshOperation?.cancel(); refreshOperation = Task { await model.refresh() } }
        }.padding(16) }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
        .task(id: route + (privateReady ? "|ready" : "|unavailable")) { await load() }
        .onChange(of: privateReady) { _, ready in if !ready { operation?.cancel(); suspendPrivateResults(keepConfirmation: privateVisible && model.checkingSession) } }
        .onChange(of: model.error) { _, error in if !error.isEmpty { operation?.cancel(); clearPrivateResults() } }
        .onChange(of: route) { _, _ in operation?.cancel(); clearPrivateResults() }
        .onDisappear { operation?.cancel(); refreshOperation?.cancel(); clearPrivateResults() }
        .onChange(of: [kind, reason, creatorID, messageID, requestID, threadID, scope, proof]) { _, _ in commandKey = UUID().uuidString }
        .confirmationDialog(QelvoraCopy.text("nativeDeleteThisDataScope"), isPresented: $confirmingDelete, titleVisibility: .visible) {
            SwiftUI.Button(QelvoraCopy.text("nativeRequestDeletion"), role: .destructive) { run { await privacyCommand("delete") } }.disabled(privateDisabled)
            SwiftUI.Button(QelvoraCopy.text("nativeKeepData"), role: .cancel) {}
        } message: { Text(QelvoraCopy.text("nativeAccessClosesImmediatelyPurging")) }
    }
    @ViewBuilder private var navigation: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                Button(QelvoraCopy.text("nativeSupport"), variant: .quiet, block: true) { model.open("/support") }
                Button(QelvoraCopy.text("nativeYourData"), variant: .quiet, block: true) { model.open("/support/privacy") }
                Button(QelvoraCopy.text("nativeAccessHistory"), variant: .quiet, block: true) { model.open("/support/access") }
                Button(QelvoraCopy.text("nativeFeedback"), variant: .quiet, block: true) { model.open("/support/feedback") }
                Button(QelvoraCopy.text("nativeCrisisHelp"), variant: .quiet, block: true) { model.open("/trust/crisis") }
            }
        } else {
            HStack { Button(QelvoraCopy.text("nativeSupport"), variant: .quiet) { model.open("/support") }; Button(QelvoraCopy.text("nativeYourData"), variant: .quiet) { model.open("/support/privacy") } }
            HStack { Button(QelvoraCopy.text("nativeAccessHistory"), variant: .quiet) { model.open("/support/access") }; Button(QelvoraCopy.text("nativeFeedback"), variant: .quiet) { model.open("/support/feedback") } }
            Button(QelvoraCopy.text("nativeCrisisHelp"), variant: .quiet) { model.open("/trust/crisis") }
        }
    }
    private var support: some View { VStack(alignment: .leading, spacing: 16) {
        Picker(QelvoraCopy.text("nativeReportType"), selection: $kind) { Text(QelvoraCopy.text("nativeSupportRequest")).tag("support"); Text(QelvoraCopy.text("nativeReportAIMessage")).tag("ai_report"); Text(QelvoraCopy.text("nativeAbuseReport")).tag("abuse"); Text(QelvoraCopy.text("nativeBlockCreator")).tag("block"); Text(QelvoraCopy.text("nativeCrisisHelp")).tag("crisis") }.pickerStyle(.menu)
        if kind == "ai_report" || kind == "abuse" || kind == "block" { conversationPicker(thread: false) }
        if kind == "ai_report" { field(QelvoraCopy.text("nativeAIMessageID"), $messageID) }
        if kind == "support" { field(QelvoraCopy.text("nativeRequestIDOptional"), $requestID) }
        if kind == "crisis" { crisisHelp }
        field(QelvoraCopy.text("nativeWhatHappened"), $reason, multiline: true)
        Button(kind == "block" ? QelvoraCopy.text("nativeBlockCreator") : QelvoraCopy.text("nativeSendReport"), variant: .secondary, block: true, disabled: privateDisabled || reason.trimmingCharacters(in: .whitespacesAndNewlines).count < 12 || (kind == "support" && !requestID.isEmpty && UUID(uuidString: requestID) == nil) || (kind == "block" && UUID(uuidString: creatorID) == nil) || (kind == "ai_report" && (UUID(uuidString: creatorID) == nil || UUID(uuidString: messageID) == nil))) { run { await report() } }
        Text(QelvoraCopy.text("nativeYourCases")).qText("title")
        if privateVisible { ForEach(cases) { item in VStack(alignment: .leading, spacing: 8) { Text(QelvoraCopy.text("nativeCASENumberKindState", values: ["number": String(item.number), "kind": item.kind.replacingOccurrences(of: "_", with: " "), "state": item.state])).qText("body-strong"); if item.state == "resolved" { Button(QelvoraCopy.text("nativeAppealCASENumber", values: ["number": String(item.number)]), variant: .secondary, disabled: privateDisabled || reason.count < 12) { run { await appeal(item) } } } } }
        Text(QelvoraCopy.text("nativeTrustInbox")).qText("title")
        ForEach(notices) { item in VStack(alignment: .leading, spacing: 8) { Text(item.type.replacingOccurrences(of: "_", with: " ")).qText("label"); Text(item.reason).qText("body") } } }
    } }
    private var crisisHelp: some View { VStack(alignment: .leading, spacing: 16) {
        Text(help?.emergencyMessage ?? QelvoraCopy.text("nativeIfYouAreInImmediateDanger")).qText("body-strong")
        Text(QelvoraCopy.text("nativeReportsDoNotRequirePaidAccess")).qText("body")
        if let help { if help.resources.isEmpty { Text(QelvoraCopy.text("nativeRegionalHelpResourcesAreNotConfigured")).qText("caption") }; ForEach(Array(help.resources.enumerated()), id: \.offset) { _, item in if let url = URL(string: item.url), url.scheme == "https" { Link(item.name + " · " + item.region, destination: url) }; if let phone = item.phone { Text(phone).qText("body") } } }
    } }
    private var accessHistory: some View { VStack(alignment: .leading, spacing: 16) {
        Text(QelvoraCopy.text("nativeTheseRecordsShowWhenAnAuthorized")).qText("body")
        if privateVisible { if history.isEmpty && !busy { Text(QelvoraCopy.text("nativeNoCaseAccessesYet")).qText("caption") }
        ForEach(Array(history.enumerated()), id: \.offset) { _, item in VStack(alignment: .leading, spacing: 8) { Text(item.action.replacingOccurrences(of: "_", with: " ") + " · " + item.created_at).qText("caption"); Text(item.purpose).qText("body") } } }
    } }
    private var feedback: some View { VStack(alignment: .leading, spacing: 16) {
        Text(QelvoraCopy.text("nativeYourAnswersHelpEvaluateUsefulness")).qText("body")
        Picker(QelvoraCopy.text("nativeWasTheConversationUseful"), selection: $useful) { Text(QelvoraCopy.text("nativeChooseAnAnswer")).tag("unanswered"); Text(QelvoraCopy.text("nativeYes")).tag("yes"); Text(QelvoraCopy.text("nativeNo")).tag("no") }
        Picker(QelvoraCopy.text("nativeWasItClearWhoWroteEach"), selection: $authorship) { Text(QelvoraCopy.text("nativeChooseAnAnswer")).tag("unanswered"); Text(QelvoraCopy.text("nativeYes")).tag("yes"); Text(QelvoraCopy.text("nativeNo")).tag("no") }
        field(QelvoraCopy.text("nativeAnythingToImproveOptional"), $feedbackComment, multiline: true)
        SwiftUI.Toggle(QelvoraCopy.text("nativeIAgreeToShareTheseAnswers"), isOn: $feedbackConsent)
        Button(QelvoraCopy.text("nativeSendFeedback"), variant: .secondary, block: true, disabled: privateDisabled || !feedbackConsent || useful == "unanswered" || authorship == "unanswered") { run { if await perform("feedback", ["consent": true, "cohort": "unspecified", "useful": useful == "yes", "authorshipClear": authorship == "yes", "comment": String(feedbackComment.prefix(2000))]) != nil { result = QelvoraCopy.text("nativeYourFeedbackIsSaved"); feedbackConsent = false; feedbackComment = "" } } }
    } }
    private var privacy: some View { VStack(alignment: .leading, spacing: 16) {
        Text(QelvoraCopy.text("nativeExportAndDeletionAreSeparate")).qText("body")
        Link(QelvoraCopy.text("nativeManageAppleSubscriptions"), destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
        privacyScope
        privacyVerification
        Button(QelvoraCopy.text("nativeRequestExport"), variant: .secondary, block: true, disabled: privacyDisabled) { run { await privacyCommand("export") } }
        Button(QelvoraCopy.text("nativeRequestDeletion"), variant: .secondary, block: true, disabled: privacyDisabled) { confirmingDelete = true }
        privacyJobs
    } }
    @ViewBuilder private var privacyScope: some View {
        Picker(QelvoraCopy.text("nativeDataScope"), selection: $scope) { Text(QelvoraCopy.text("nativeAccount")).tag("account"); Text(QelvoraCopy.text("pickerCreator")).tag("creator"); Text(QelvoraCopy.text("nativeConversation")).tag("thread") }.pickerStyle(.menu).frame(minHeight: 44).contentShape(Rectangle())
        if scope != "account" { conversationPicker(thread: scope == "thread") }
    }
    @ViewBuilder private var privacyVerification: some View {
        if capability?.localDevelopment == true { Text(QelvoraCopy.text("nativeSyntheticLocalAccountTypeLOCAL")).qText("caption"); field(QelvoraCopy.text("nativeLocalConfirmation"), $proof) }
        else if capability?.verificationMethod == "current_session" { Text(QelvoraCopy.text("nativeYourSignInMustBeRecent")).qText("caption") }
        else if capability?.actorVerification == "configured" { field(QelvoraCopy.text("nativeAccountVerificationReceipt"), $proof) }
        else { Text(QelvoraCopy.text("nativeFreshAccountVerificationMust")).qText("caption") }
    }
    @ViewBuilder private var privacyJobs: some View {
        if privateVisible {
            ForEach(jobs) { job in privacyJobRow(job) }
            if let selectedJob { jobProgress(selectedJob) }
        }
    }
    @ViewBuilder private func privacyJobRow(_ job: TrustJob) -> some View {
        let state = job.state.replacingOccurrences(of: "_", with: " ")
        let title = job.kind + " · " + job.scope + " · " + state
        let label = QelvoraCopy.text("nativeKindScopeStateRequestedCreatedat", values: ["kind": job.kind, "scope": job.scope, "state": state, "createdAt": job.created_at, "id": job.id])
        Text(QelvoraCopy.text("nativeRequestedTime", values: ["time": job.created_at])).qText("caption")
        Button(title, variant: .quiet, block: true, disabled: privateDisabled) { run { await jobDetail(job.id) } }
            .accessibilityLabel(label)
            .accessibilityIdentifier("privacy-job-" + job.id)
    }
    @ViewBuilder private func jobProgress(_ job: TrustJob) -> some View {
        Text(QelvoraCopy.text("nativeJobId", values: ["id": job.id])).qText("caption")
        ForEach(job.tasks ?? []) { task in Text(taskDescription(task)).qText("body") }
        ForEach(job.retained ?? []) { item in retainedRecord(item) }
        if job.state != "complete" { Button(QelvoraCopy.text("nativeRetryIncompleteDomains"), variant: .secondary, block: true, disabled: privateDisabled) { run { await retry(job.id) } } }
        if job.state == "complete" && job.kind == "export" {
            Button(QelvoraCopy.text("nativePrepareExport"), variant: .secondary, block: true, disabled: privateDisabled) { run { await download(job.id) } }
            if privateReady, let exportPayload { ShareLink(QelvoraCopy.text("nativeShareYourExport"), item: exportPayload, preview: SharePreview(QelvoraCopy.text("nativeYourCreatorData"))) }
        }
    }
    private func taskDescription(_ task: TrustTask) -> String {
        let failure = task.error_code.map { " · " + $0.replacingOccurrences(of: "_", with: " ") } ?? ""
        return task.domain + ": " + task.state.replacingOccurrences(of: "_", with: " ") + failure
    }
    private func retainedRecord(_ item: TrustRetained) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Retained: \(item.category.replacingOccurrences(of: "_", with: " "))").qText("label")
            Text(item.reason).qText("body")
            if let until = item.until { Text(QelvoraCopy.text("nativeUntilDate", values: ["date": until])).qText("caption") }
        }
    }
    private var privacyDisabled: Bool { privateDisabled || capability?.actorVerification != "configured" || (capability?.localDevelopment == true ? proof != "LOCAL DEVELOPMENT" : capability?.verificationMethod != "current_session" && proof.isEmpty) || (scope != "account" && UUID(uuidString: creatorID) == nil) || (scope == "thread" && UUID(uuidString: threadID) == nil) }
    private func field(_ title: String, _ value: Binding<String>, multiline: Bool = false) -> some View { VStack(alignment: .leading, spacing: 8) { Text(title).qText("label"); TextField(title, text: value, axis: multiline ? .vertical : .horizontal).textFieldStyle(.roundedBorder).qDisableAutoCapitalization().autocorrectionDisabled().lineLimit(multiline ? 3...8 : 1...1).frame(minHeight: 44).contentShape(Rectangle()).accessibilityLabel(title) } }
    private func run(_ action: @escaping @MainActor () async -> Void) {
        guard privateReady else { return }
        operation?.cancel(); operation = Task { await action() }
    }
    private func clearPrivateResults() {
        suspendPrivateResults()
        cases = []; notices = []; jobs = []; history = []; selectedJob = nil
        capability = nil; conversations = nil; conversationsFailed = false
    }
    /// WP 7.4 P5: a creator or a conversation is picked by the creator's name,
    /// never typed as an id. Nothing is chosen until the person chooses; a
    /// screen opened from a thread arrives with that creator chosen.
    @ViewBuilder private func conversationPicker(thread: Bool) -> some View {
        let title = QelvoraCopy.text(thread ? "pickerConversation" : "pickerCreator")
        VStack(alignment: .leading, spacing: 8) {
            Text(title).qText("label")
            if conversationsFailed {
                Text(QelvoraCopy.text("pickerConversationsFailed")).qText("body")
                Button(QelvoraCopy.text("growthTryAgain"), variant: .secondary, disabled: privateDisabled) { run { await loadConversations() } }
            } else if let conversations {
                if conversations.isEmpty { Text(QelvoraCopy.text("pickerNoConversations")).qText("body") }
                else {
                    Picker(title, selection: thread ? $threadID : $creatorID) {
                        Text(QelvoraCopy.text(thread ? "pickerChooseConversation" : "pickerChooseCreator")).tag("")
                        if thread { ForEach(conversations) { item in Text(item.name).tag(item.id) } }
                        else { ForEach(uniqueCreators(conversations), id: \.creatorId) { item in Text(item.name).tag(item.creatorId) } }
                    }.pickerStyle(.menu).frame(minHeight: 44).contentShape(Rectangle()).accessibilityIdentifier(thread ? "picker-conversation" : "picker-creator")
                }
            } else { ProgressView().accessibilityLabel(QelvoraCopy.text("nativeLoading")) }
        }
        .onChange(of: threadID) { _, id in if let match = conversations?.first(where: { $0.id == id }) { creatorID = match.creatorId } }
    }
    private func uniqueCreators(_ items: [TrustConversation]) -> [TrustConversation] {
        var seen = Set<String>(); return items.filter { seen.insert($0.creatorId).inserted }
    }
    /// Every page of the person's conversations (at most 20 pages of 50).
    private func loadConversations() async {
        guard let client, let account = model.session?.accountId, privateReady else { return }
        conversationsFailed = false
        let api = W3ConversationClient(baseURL: client.baseURL, expectedAccountId: account)
        do {
            var all: [TrustConversation] = [], cursor: String?
            for _ in 0..<20 {
                let page: TrustConversationPage = try await api.request("account" + (cursor.map { "?cursor=" + $0 } ?? ""))
                all += page.threads; cursor = page.nextCursor
                if cursor == nil { break }
            }
            guard !Task.isCancelled, privateReady, model.session?.accountId == account else { return }
            conversations = all
            // An id this screen cannot name is never sent: a choice not among the
            // person's conversations is cleared, and they choose again.
            if !creatorID.isEmpty && !all.contains(where: { $0.creatorId == creatorID.lowercased() }) { creatorID = "" }
            if !threadID.isEmpty && !all.contains(where: { $0.id == threadID.lowercased() }) { threadID = "" }
        } catch {
            guard !Task.isCancelled, privateReady, model.session?.accountId == account else { return }
            conversations = nil; conversationsFailed = true
        }
    }
    // The generic confirmation holds no authority; the action remains disabled
    // and requires a fresh capture while a same-session check is in flight.
    private func suspendPrivateResults(keepConfirmation: Bool = false) { workEpoch += 1; busy = false; exportPayload = nil; if !keepConfirmation { confirmingDelete = false }; result = ""; error = "" }
    private func beginWork() -> Int { workEpoch += 1; busy = true; return workEpoch }
    private func finishWork(_ epoch: Int) { if workEpoch == epoch { busy = false } }
    private func capture() async throws -> FanSessionRequestCapture {
        guard privateReady, client != nil,
              let capture = await model.captureRequest(from: route, maximumResponseBytes: 32 * 1024 * 1024, timeoutSeconds: 15),
              privateReady, !Task.isCancelled else { throw CancellationError() }
        return capture
    }
    private func capturedClient() async throws -> TrustClient {
        guard let client else { throw CancellationError() }
        return TrustClient(baseURL: client.baseURL, capture: try await capture())
    }
    // Public crisis help never waits on capability or account data: a restored or
    // degraded host can refuse those while help stays available. A failed capability
    // read clears the old value so data requests cannot submit on stale verification.
    private func load() async {
        guard let client else { error = QelvoraCopy.text("nativeTheTrustServiceIsNotConfigured"); return }
        let epoch = beginWork(); defer { finishWork(epoch) }
        var failure: Error?
        do { let value: TrustHelp = try await client.request("help"); guard !Task.isCancelled, workEpoch == epoch else { return }; help = value } catch { guard !Task.isCancelled, workEpoch == epoch else { return }; failure = error }
        guard privateReady, !Task.isCancelled, workEpoch == epoch else { return }
        if route.contains("privacy") { do { let value: TrustCapability = try await client.request("capabilities"); guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; capability = value } catch { guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; capability = nil; failure = failure ?? error } }
        do {
            let client = try await capturedClient()
            guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }
            if route.hasPrefix("/trust") || route.contains("feedback") { }
            else if route.contains("access") { let page: TrustItems<TrustAccess> = try await client.request("access-history"); guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; history = page.items }
            else if route.contains("privacy") {
                exportPayload = nil
                let page: TrustItems<TrustJob> = try await client.request("privacy/jobs")
                guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }
                jobs = page.items
                if let selectedId = selectedJob?.id, jobs.contains(where: { $0.id == selectedId }) {
                    let detail: TrustJob = try await client.request("privacy/jobs/" + selectedId)
                    guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }
                    selectedJob = detail
                    jobs = jobs.map { $0.id == selectedId ? detail : $0 }
                } else { selectedJob = nil }
            } else { let page: TrustItems<TrustCase> = try await client.request("my-cases"); guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; let inbox: TrustItems<TrustNotice> = try await client.request("inbox"); guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; cases = page.items; notices = inbox.items }
        } catch { guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }; cases = []; notices = []; jobs = []; history = []; selectedJob = nil; exportPayload = nil; failure = failure ?? error }
        guard !Task.isCancelled, privateReady, workEpoch == epoch else { return }
        error = failure?.localizedDescription ?? ""
        if !route.hasPrefix("/trust") && !route.contains("access") && !route.contains("feedback") { await loadConversations() }
    }
    /// A command with local consequences (`accepted`) finishes once sent, even if
    /// a routine session check cancels this screen's work meanwhile: the server
    /// may already have accepted it. Only showing the answer depends on the
    /// checks after it.
    private func perform(_ path: String, _ input: [String: Any], accepted: (@MainActor () async -> Void)? = nil) async -> TrustAck? {
        guard !privateDisabled else { return nil }
        let epoch = beginWork(); defer { finishWork(epoch) }
        do {
            let client = try await capturedClient(), body = try JSONSerialization.data(withJSONObject: input)
            let ack: TrustAck
            if let accepted {
                // Unstructured: a cancelled screen task cannot cancel it.
                ack = try await Task { let value: TrustAck = try await client.request(path, body: body); await accepted(); return value }.value
            } else { ack = try await client.request(path, body: body) }
            try Task.checkCancellation(); guard privateReady, workEpoch == epoch else { return nil }; error = ""; commandKey = UUID().uuidString; return ack }
        catch { if !Task.isCancelled && privateReady && workEpoch == epoch { self.error = error.localizedDescription }; return nil }
    }
    private func report() async {
        if kind == "block" { if await perform("blocks", ["creatorId": creatorID.lowercased(), "reason": reason, "idempotencyKey": commandKey]) != nil { result = QelvoraCopy.text("nativeYourBlockIsSavedEnforcementIn"); reason = ""; await load() }; return }
        var input: [String: Any] = ["kind": kind, "reason": reason, "idempotencyKey": commandKey]; if kind != "support" && !creatorID.isEmpty { input["creatorId"] = creatorID.lowercased() }; if kind == "ai_report" { input["messageId"] = messageID.lowercased() }; if kind == "support" && !requestID.isEmpty { input["requestId"] = requestID.lowercased() }; if let ack = await perform("reports", input) { result = QelvoraCopy.text("nativeCASENumberIsSavedNoProvider", values: ["number": String(ack.number ?? 0)]); reason = ""; await load() }
    }
    private func appeal(_ item: TrustCase) async { if await perform("cases/" + item.id + "/appeals", ["version": item.version, "reason": reason, "idempotencyKey": commandKey]) != nil { result = QelvoraCopy.text("nativeYourAppealIsSavedForA"); reason = ""; await load() } }
    private func privacyCommand(_ kind: String) async {
        guard let origin = client?.baseURL.absoluteString, let account = model.session?.accountId else { return }
        let deletionScope = scope, creator = creatorID.lowercased(), thread = threadID.lowercased()
        var input: [String: Any] = ["kind": kind, "scope": deletionScope, "proof": capability?.verificationMethod == "current_session" ? "CURRENT_SESSION" : proof, "idempotencyKey": commandKey]
        if deletionScope != "account" { input["creatorId"] = creator }
        if deletionScope == "thread" { input["threadId"] = thread }
        // An accepted deletion removes the original account's matching drafts
        // even if the account view changes before the answer is shown.
        let purge = PurgeOutcome()
        let ack = await perform("privacy/jobs", input, accepted: kind != "delete" ? nil : {
            do { try await W3DraftStorage.shared.purge(origin: origin, account: account, creator: deletionScope == "account" ? nil : creator, thread: deletionScope == "thread" ? thread : nil) }
            catch { purge.failed = true }
        })
        if purge.failed { await model.purge(); return }
        if let ack {
            result = QelvoraCopy.text("nativeRequestSavedInspectEachDomains"); await load()
            if let id = ack.id { await jobDetail(id) }
        }
    }

    private func jobDetail(_ id: String) async {
        guard !privateDisabled else { return }
        let epoch = beginWork(); defer { finishWork(epoch) }
        exportPayload = nil
        do {
            let client = try await capturedClient()
            let detail: TrustJob = try await client.request("privacy/jobs/" + id)
            try Task.checkCancellation(); guard privateReady, workEpoch == epoch else { return }
            selectedJob = detail
            jobs = jobs.map { $0.id == id ? detail : $0 }
            error = ""
        } catch { if !Task.isCancelled && privateReady && workEpoch == epoch { selectedJob = nil; self.error = error.localizedDescription } }
    }
    private func download(_ id: String) async {
        guard !privateDisabled else { return }
        let epoch = beginWork(); defer { finishWork(epoch) }
        do { let capture = try await capture(); guard let client else { return }; let original = TrustClient(baseURL: client.baseURL, capture: capture); let payload = try await original.bytes("privacy/jobs/" + id + "/download", binary: true); try Task.checkCancellation(); guard privateReady, workEpoch == epoch else { return }; exportPayload = TrustExport(data: payload, capture: capture, model: model); error = "" }
        catch { if !Task.isCancelled && privateReady && workEpoch == epoch { exportPayload = nil; self.error = error.localizedDescription } }
    }
    private func retry(_ id: String) async { if await perform("privacy/jobs/" + id + "/retry", [:]) != nil { result = QelvoraCopy.text("nativeIncompleteDomainsQueuedAgain"); await jobDetail(id) } }
}
@MainActor private final class PurgeOutcome { var failed = false }
