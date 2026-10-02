import Foundation
import SwiftUI

struct W3Message: Decodable, Identifiable, Sendable {
    let id: String; let threadId: String; let authorKind: APIMessageAuthorKind
    let text: String; let deliveryState: APIMessageDeliveryState; let controlEpoch: Int
    let sequence: Int; let signedActId: String?; let citations: [String]
    let createdAt: String; let member: String?; let offTheRecord: Bool; let version: Int
    let agentVersion: W3AgentVersion?; let feedback: String?
    let correction: W3Correction?
    let recording: W3Recording?
    func authorLabel(name: String) -> String {
        if correction != nil { return QelvoraCopy.text("correctionAuthor", values: ["name": name]) }
        if let kind = AuthorKind(rawValue: authorKind.rawValue) { return kind.label(name: name, audience: "audience details unavailable", member: member ?? "Authorized team member") }
        if authorKind == .fan { return "You" }
        if authorKind == .human_call { return QelvoraCopy.text("callAuthor", values: ["name":name]) }
        return "Conversation update"
    }
}
struct W3Page: Decodable, Sendable {
    let threadId: String; let creatorId: String; let fanId: String; let creatorName: String; let fanHandle: String
    let control: APIThreadControl; let epoch: Int; let cursor: Int; let revision: Int
    let generationSequences: [String: Int]; let messages: [W3Message]; let before: Int?
    let offTheRecord: Bool; let introShared: Bool; let consentCurrent: Bool; let canSend: Bool; let unavailableReason: String?
    let feedbackPolicy: W3FeedbackPolicy?
}
struct W3AgentVersion: Codable, Sendable { let id: String; let hash: String }
struct W3Correction: Decodable, Sendable { let originalMessageId: String; let originalVersion: Int }
struct W3FeedbackPolicy: Decodable, Sendable { let version: String; let notice: String }
struct W3FeedbackInput: Encodable { let messageVersion: Int; let agentVersion: W3AgentVersion; let rating: String?; let consent: Bool?; let policyVersion: String?
    enum CodingKeys: String, CodingKey { case messageVersion, agentVersion, rating, consent, policyVersion }
    func encode(to encoder: any Encoder) throws { var values = encoder.container(keyedBy: CodingKeys.self); try values.encode(messageVersion, forKey: .messageVersion); try values.encode(agentVersion, forKey: .agentVersion); if let rating { try values.encode(rating, forKey: .rating) } else { try values.encodeNil(forKey: .rating) }; try values.encodeIfPresent(consent, forKey: .consent); try values.encodeIfPresent(policyVersion, forKey: .policyVersion) }
}
struct W3FeedbackResult: Decodable, Sendable { let rating: String? }
struct W3Provider: Decodable, Sendable { let name: String; let termsUrl: String; let noTraining: Bool; let noRetention: Bool }
struct W3Policy: Decodable, Sendable { let version: String; let reference: String?; let providers: [W3Provider]; let verified: Bool }
struct W3Capabilities: Decodable, Sendable { let providers: W3Policy?; let consentAvailable: Bool; let generationAvailable: Bool; let accessDisclosure: String; let developmentSynthetic: Bool? }
struct W3Memory: Decodable, Identifiable, Sendable {
    let id: String; let kind: String; let text: String; let provenanceMessageId: String
    let sensitiveCategory: String?; let state: String; let editedByFan: Bool; let createdAt: String
}
struct W3MemoryView: Decodable, Sendable { let revision: Int; let offTheRecord: Bool; let introShared: Bool; let items: [W3Memory] }
struct W3Audit: Decodable, Identifiable, Sendable { let id: String; let readerAccountId: String; let role: String; let readAt: String }
struct W3Failure: Error, Sendable { let message: String; let status: Int }
private struct W3ErrorEnvelope: Decodable { struct Failure: Decodable { let message: String; let code: String? }; let error: Failure }
struct W3Status: Decodable, Sendable { let accepted: Bool }
struct W3StatusQuery: Encodable { let idempotencyKey: String }
struct W3Preferences: Encodable { let offTheRecord: Bool; let introShared: Bool; let expectedRevision: Int }
struct W3Decision: Encodable { let expectedRevision: Int; let action: String; let text: String? }
struct W3Consent: Encodable { let version: String; let accepted: Bool }
struct W3Begin: Encodable { let creatorId: String; let policyVersion: String; let accessNoticeAccepted: Bool; let idempotencyKey: String }
struct W3Presence: Encodable { let clientId: String; let active: Bool }
struct W3Usage: Decodable, Sendable {
    struct Day: Decodable, Sendable { let day: String; let seconds: Double; let companionSeconds: Double }
    let timezone: String; let days: [Day]; let modeAvailable: Bool; let measurement: String
}

/// W1's OS credential store supplies account authority; no model credential reaches a fan client.
actor W3ConversationClient {
    let baseURL: URL
    private let credentials: SecureSessionStorage
    private let session: URLSession
    private let expectedAccountId: String?
    init(baseURL: URL, expectedAccountId: String? = nil) {
        self.baseURL = baseURL; credentials = SecureSessionStorage(issuer: baseURL)
        self.expectedAccountId = expectedAccountId
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }
    func request<T: Decodable & Sendable>(_ path: String, body: Data? = nil, publicRead: Bool = false) async throws -> T {
        try JSONDecoder().decode(T.self, from: await requestData(path, body: body, publicRead: publicRead))
    }
    func requestData(_ path: String, body: Data? = nil, publicRead: Bool = false) async throws -> Data {
        guard let components = URLComponents(string: path) else { throw URLError(.badURL) }
        var target = URLComponents(url: baseURL.appendingPathComponent("v1/conversations/" + components.path), resolvingAgainstBaseURL: false)!
        target.queryItems = components.queryItems
        var request = URLRequest(url: target.url!)
        request.httpMethod = body == nil ? "GET" : "POST"; request.httpBody = body; request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(UUID().uuidString.lowercased(), forHTTPHeaderField: "X-Correlation-Id")
        let requestCredential = publicRead ? nil : try await credentials.read()
        if !publicRead {
            guard let accountId = expectedAccountId, UUID(uuidString: accountId) != nil else { throw W3Failure(message: "Reopen this page with your current account.", status: 401) }
            guard let token = requestCredential else { throw W3Failure(message: "Your session ended. Continue with Pantopus again.", status: 401) }
            request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
            request.setValue(accountId, forHTTPHeaderField: "X-Expected-Account-Id")
        }
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        if !publicRead { guard try await credentials.read() == requestCredential else { throw W3Failure(message:"Your account changed. Open this conversation again.", status:401) } }
        guard data.count <= 1_000_000 else { throw W3Failure(message:"This conversation response is too large. Refresh to try again.",status:503) }
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else {
            let error = try? JSONDecoder().decode(W3ErrorEnvelope.self, from: data).error
            throw W3Failure(message: error?.message ?? "Reconnect to refresh. Your input is kept.", status: error?.code == "session_account_changed" ? 401 : response.statusCode)
        }
        return data
    }
    func realtime(page: W3Page) async throws -> W3Realtime.Lease {
        guard let accountId = expectedAccountId else { throw W3Failure(message: "Reopen this page with your current account.", status: 401) }
        return try await W3Realtime.shared.subscribe(baseURL: baseURL, accountId: accountId, page: page)
    }

}

@MainActor
final class W3ThreadModel: ObservableObject {
    struct Pending { let key: String; let text: String; let clientSequence: Int; let destination: String; var uncertain = false; var rejected = false }
    @Published var page: W3Page?; @Published var older: [W3Message] = []; @Published var before: Int?
    @Published var draft = ""; @Published var failure = ""; @Published var busy = false; @Published var offline = true
    @Published var pending: Pending?
    let client: W3ConversationClient; let creatorId: String; let fanId: String
    private let accountId: String
    private let sessionId: String
    private var offlineContext: Int?
    private var offlineShowing = false
    private var renewingOffline = false
    private var privacyClock: Task<Void,Never>?
    private var lastRenew = ContinuousClock.now
    private var lifecycle = 0
    private var active = false
    private var transportReady = false
    private var authorizationDenied = false
    private var connectionRun: UUID?
    private var activeLease: UUID?
    private var resumeActivated = false
    private let presenceId = UUID().uuidString.lowercased()
    private var storageScope: String { client.baseURL.absoluteString + "/" + root }
    var root: String { creatorId + "/" + fanId }
    private var gate: ThreadDeliveryGate?
    init(baseURL: URL, creatorId: String, fanId: String, accountId: String, sessionId: String) { self.sessionId = sessionId; client = W3ConversationClient(baseURL: baseURL, expectedAccountId: accountId); self.creatorId = creatorId; self.fanId = fanId; self.accountId = accountId }
    func refresh() async {
        let run = lifecycle
        guard active else { return }
        do {
            if !resumeActivated {
                await W3ResumeStorage.shared.activate(accountId: accountId)
                resumeActivated = true
            }
            if offlineContext == nil { offlineContext = await W3OfflineStorage.shared.activate(origin: client.baseURL.absoluteString, account: accountId, session: sessionId, root: root) }
            let fresh: W3Page = try await client.request(root)
            guard !Task.isCancelled, active, run == lifecycle else { return }
            guard page == nil || (fresh.cursor >= page!.cursor && fresh.epoch >= page!.epoch && fresh.revision >= page!.revision) else { return }
            offlineShowing = false
            page = fresh; if before == nil && older.isEmpty { before = fresh.before }
            gate = ThreadDeliveryGate(threadID: fresh.threadId, cursor: fresh.cursor, epoch: fresh.epoch, generationSequences: fresh.generationSequences)
            await W3ResumeStorage.shared.save(accountId: accountId, scope: storageScope, cursor: fresh.cursor, epoch: fresh.epoch)
            offline = !transportReady; authorizationDenied = false; failure = ""
            if let pending { let status: W3Status = try await client.request(root + "/messages/status", body: JSONEncoder().encode(W3StatusQuery(idempotencyKey: pending.key))); if status.accepted && self.pending?.key == pending.key { self.pending = nil; if draft.trimmingCharacters(in: .whitespacesAndNewlines) == pending.text { draft = "" } } }
        } catch { if active && run == lifecycle { failed(error) } }
    }
    private func conceal() { page = nil; older = []; before = nil; gate = nil }
    private func showOffline() async {
        offlineShowing = true
        let run = lifecycle
        guard let context = offlineContext, let saved = await W3OfflineStorage.shared.read(context), active, offlineShowing, run == lifecycle,
              page == nil || (saved.page.cursor >= page!.cursor && saved.page.epoch >= page!.epoch && saved.page.revision >= page!.revision) else { if run == lifecycle && offlineShowing { conceal() }; return }
        page = saved.page; older = []; before = nil; gate = nil
    }
    private func renewOffline() async {
        guard active, transportReady, !renewingOffline, let current = page, !current.offTheRecord, current.consentCurrent, let context = offlineContext else { return }
        renewingOffline = true; defer { renewingOffline = false }
        let started = ContinuousClock.now
        do {
            let data = try await client.requestData(root + "/offline")
            let snapshot = try JSONDecoder().decode(W3OfflineSnapshot.self,from:data)
            guard active, transportReady, offlineContext == context, page?.cursor == snapshot.page.cursor, page?.revision == snapshot.page.revision, page?.epoch == snapshot.page.epoch else { return }
            if !(try await W3OfflineStorage.shared.save(data,generation:context,started:started)), offlineContext == context { offlineContext = nil }
        } catch { await W3OfflineStorage.shared.purge(context); if offlineContext == context { offlineContext = nil } }
    }
    func setActive(_ value: Bool) {
        if active != value { lifecycle += 1 }
        active = value
        if !value {
            transportReady = false; offline = true; offlineShowing = false; conceal()
            privacyClock?.cancel(); privacyClock = nil
            let oldContext = offlineContext; offlineContext = nil
            if let oldContext { Task { await W3OfflineStorage.shared.purge(oldContext) } }
        } else if privacyClock == nil {
            privacyClock = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for:.milliseconds(100))
                    guard !Task.isCancelled, let self, self.active else { return }
                    if self.offlineShowing, let context = self.offlineContext,
                       !(await W3OfflineStorage.shared.current(context)) { await W3OfflineStorage.shared.purge(context); self.conceal(); self.offlineShowing = false; self.offlineContext = nil }
                    if self.lastRenew.duration(to:.now) >= .seconds(2) {
                        self.lastRenew = .now
                        if self.offlineContext == nil { self.offlineContext = await W3OfflineStorage.shared.activate(origin:self.client.baseURL.absoluteString,account:self.accountId,session:self.sessionId,root:self.root) }
                        Task { [weak self] in await self?.renewOffline() }
                    }
                }
            }
        }
    }
    func connect() async {
        let run = UUID(); connectionRun = run
        var delay = 1.0
        defer { if connectionRun == run { transportReady = false; offline = true } }
        while active && !Task.isCancelled {
            transportReady = false; offline = true
            await refresh()
            if authorizationDenied || Task.isCancelled || !active { return }
            if let page {
                do {
                    // The current authorized page covers all earlier cursors.
                    // Persisted metadata cannot authorize replay of old content.
                    let lease = try await client.realtime(page: page)
                    activeLease = lease.id
                    await withTaskCancellationHandler {
                        do {
                            for try await event in lease.events {
                                guard active, !Task.isCancelled, connectionRun == run else { break }
                                switch event {
                                case .connected:
                                    transportReady = true; delay = 1
                                    await refresh()
                                case .frame(let frame):
                                    if try !(gate?.receive(frame).isEmpty ?? true) { await refresh() }
                                }
                                if authorizationDenied { break }
                            }
                        } catch { if !Task.isCancelled { failed(error) } }
                    } onCancel: { Task { await W3Realtime.shared.release(lease.id) } }
                    await W3Realtime.shared.release(lease.id)
                    if activeLease == lease.id { activeLease = nil }
                } catch { if !Task.isCancelled { failed(error) } }
            }
            transportReady = false; offline = true
            if authorizationDenied || Task.isCancelled || !active { return }
            await showOffline()
            do { try await Task.sleep(for: .seconds(delay + Double.random(in: 0...0.5))) }
            catch { return }
            delay = min(15, delay * 2)
        }
    }
    func send(retry: Bool = false) async {
        guard active, !busy, !offline, let page, page.canSend, page.generationSequences.isEmpty else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard retry ? pending != nil : !text.isEmpty else { return }
        let item = retry ? pending! : Pending(key: UUID().uuidString.lowercased(), text: text, clientSequence: (page.messages.last?.sequence ?? 0) + 1, destination: page.control == .human_active ? "fan-replies" : "messages")
        pending = item; busy = true; defer { busy = false }
        do {
            let body = try JSONEncoder().encode(APISendMessage(text: item.text, idempotencyKey: item.key, clientSequence: item.clientSequence))
            if item.destination == "fan-replies" { let _: APIMessage = try await client.request(root + "/fan-replies", body: body) }
            else { let _: APIAcceptedMessage = try await client.request(root + "/messages", body: body) }
            pending = nil; if !retry { draft = "" }; await refresh()
        } catch { let status = (error as? W3Failure)?.status; pending?.uncertain = status == nil || status! >= 500 || status == 409; pending?.rejected = !(pending?.uncertain ?? true); failed(error) }
    }
    func earlier() async {
        guard active, !offline, let before, !busy else { return }; busy = true; defer { busy = false }
        do { let previous: W3Page = try await client.request(root + "?before=" + String(before)); let current = Set(older.map(\.id)); older = (previous.messages.filter { !current.contains($0.id) } + older).prefix(250).map { $0 }; self.before = previous.before }
        catch { failed(error) }
    }
    func presence(active: Bool) async {
        guard page != nil else { return }
        let _: W3Usage? = try? await client.request(root + "/presence", body: JSONEncoder().encode(W3Presence(clientId: presenceId, active: active)))
    }
    func forget(_ message: W3Message) async {
        guard !busy, !offline, let page else { return }; busy = true; defer { busy = false }
        do { let body = try JSONSerialization.data(withJSONObject:["expectedRevision":page.revision]); let _: W3Page = try await client.request(root + "/messages/" + message.id + "/dont-remember",body:body); await refresh() }
        catch { failed(error) }
    }
    func feedback(_ message: W3Message, rating: String?) async {
        guard active, !busy, !offline, let version = message.agentVersion, rating == nil || page?.feedbackPolicy != nil else { return }
        let policy = page?.feedbackPolicy
        busy = true; defer { busy = false }
        do {
            let body = try JSONEncoder().encode(W3FeedbackInput(messageVersion: message.version, agentVersion: version, rating: rating, consent: rating == nil ? nil : true, policyVersion: rating == nil ? nil : policy?.version))
            let _: W3FeedbackResult = try await client.request(root + "/messages/" + message.id + "/feedback", body: body)
            let refreshed: W3Message = try await client.request(root + "/messages/" + message.id)
            older = older.map { $0.id == refreshed.id ? refreshed : $0 }
            await refresh()
        } catch { failed(error) }
    }
    private func failed(_ error: Error) {
        transportReady = false; offline = true
        if let id = activeLease { Task { await W3Realtime.shared.release(id) } }
        Task { [weak self] in await self?.showOffline() }
        if let failure = error as? W3Failure {
            self.failure = failure.message
            if [401,403,404].contains(failure.status) { offlineShowing = false; let oldContext = offlineContext; offlineContext = nil; if let oldContext { Task { await W3OfflineStorage.shared.purge(oldContext) } }; authorizationDenied = true; page = nil; older = []; before = nil; draft = ""; pending = nil; gate = nil; resumeActivated = false; Task { await W3ResumeStorage.shared.remove(accountId: accountId, scope: storageScope) } }
        } else { offline = true; failure = "Reconnect to refresh. Your input is kept on this screen." }
    }
}
