import Foundation
import SwiftUI

private struct ContentDocumentView: Decodable, Sendable { let kind: String; let title: String; let text: String; let media: [ContentAttachmentValue] }
private struct ContentViewValue: Decodable, Sendable { let id: String; let version: Int; let creatorName: String; let displayText: String; let teamMember: String?; let authorLabel: String; let audienceLabel: String; let audienceCount: Int?; let signedActId: String?; let publishedAt: String?; let document: ContentDocumentView; let quotedText: String?; let quotedHandle: String? }
private struct ContentReaction: Decodable, Sendable { let kind: String; let signedActId: String }
private struct ContentConsent: Decodable, Sendable { let shareText: Bool; let showHandle: Bool; let version: Int }
private struct ContentReply: Decodable, Identifiable, Sendable { let safetyState:String?; let safetyReviewAvailable:Bool?; let id: String; let contentId: String; let version: Int; let text: String; let createdAt: String; let consent: ContentConsent; let reaction: ContentReaction? }
private struct ContentReplyPage: Decodable, Sendable { let items: [ContentReply]; let nextCursor: String? }
private struct ContentThanks: Decodable, Sendable { let version: Int; let text: String; let shareWithCreatorDigest: Bool; let showIdentity: Bool; let withdrawn: Bool }
private struct ContentPreference: Decodable, Sendable {let accountId:String;let muted:Bool}
private struct ContentReplyPolicy: Decodable, Sendable {
    let accountId: String; let creatorId: String; let limit: Int
    let confirmedDays: Int?; let milestone: Int?; let basis: String?
    let historyComplete: Bool; let longerRepliesActive: Bool; let checkedAt: String
    func validate(accountId: String, creatorId: String) throws {
        guard self.accountId == accountId, self.creatorId == creatorId else {
            throw ContentFailure(status: 403, code: "content_account_changed")
        }
        let milestone = confirmedDays.map { $0 >= 365 ? 365 : $0 >= 100 ? 100 : $0 >= 50 ? 50 : 0 }.flatMap { $0 == 0 ? nil : $0 }
        let expectedLimit = !longerRepliesActive || milestone == nil ? 4000 : milestone == 365 ? 12000 : milestone == 100 ? 8000 : 6000
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard !historyComplete, confirmedDays == nil || confirmedDays! >= 0,
              self.milestone == milestone, limit == expectedLimit,
              basis == nil || ["confirmed_stripe_paid_periods", "confirmed_paid_periods"].contains(basis!),
              confirmedDays == nil || basis != nil, formatter.date(from: checkedAt) != nil else {
            throw ContentFailure(status: 503, code: "reply_policy_unconfigured")
        }
    }
}
private struct ContentReceipt: Decodable, Sendable { let version: Int? }
private struct ContentFailure: Error { var status: Int = 0; var code: String? = nil
    var accountChanged: Bool { ["content_account_changed", "session_account_changed", "session_changed"].contains(code ?? "") }
    var authorityDenied: Bool { status == 401 || status == 403 || accountChanged }
}
private struct ContentErrorEnvelope: Decodable { struct Failure: Decodable { let code: String? }; let error: Failure }

private func contentFailureCopy(_ error: Error, action: Bool = false) -> String {
    let failure = error as? ContentFailure
    let key: String
    if failure?.accountChanged == true { key = "w5ContentAccountChanged" }
    else if failure?.status == 401 { key = "w5ContentSessionEnded" }
    else if ["reply_changed", "consent_changed", "thanks_changed"].contains(failure?.code ?? "") { key = "w5ContentChanged" }
    else if failure?.code == "idempotency_conflict" { key = "w5ContentDuplicateChanged" }
    else if failure?.code == "reply_withdrawn" { key = "w5ContentReplyWithdrawn" }
    else if failure?.code == "fan_profile_required" { key = "w5ContentFanProfileRequired" }
    else if [403, 404].contains(failure?.status ?? 0) || failure?.code?.hasSuffix("_unconfigured") == true { key = "w5ContentAccessUnavailable" }
    else if action && failure?.code == "invalid_request" { key = "w5ContentInvalidRequest" }
    else { key = action ? "w5ContentActionUnconfirmed" : "w5ContentRefreshUnavailable" }
    return QelvoraCopy.text(key)
}

private actor ContentClient {
    let baseURL: URL
    private let storage: SecureSessionStorage
    init(baseURL: URL) { self.baseURL = baseURL; storage = SecureSessionStorage(issuer: baseURL) }
    func request<T: Decodable & Sendable>(_ path: String, body: Data? = nil, expectedAccountId:String? = nil) async throws -> T {
        guard let token = try await storage.read() else { throw ContentFailure(status: 401) }
        guard let url = URL(string: "v1/content/" + path, relativeTo: baseURL) else { throw URLError(.badURL) }
        var request = URLRequest(url: url); request.httpMethod = body == nil ? "GET" : "POST"; request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData; request.timeoutInterval = 15
        if let expectedAccountId {request.setValue(expectedAccountId,forHTTPHeaderField:"x-qelvora-expected-account")}
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let failure = try? JSONDecoder().decode(ContentErrorEnvelope.self, from: data).error
            throw ContentFailure(status: (response as? HTTPURLResponse)?.statusCode ?? 0, code: failure?.code)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

public enum ContentFanFeature {
    public static func matches(_ destination: String) -> Bool {
        let parts = destination.split(separator: "/")
        return parts.count == 3 && parts[0] == "content" && UUID(uuidString: String(parts[1])) != nil && UUID(uuidString: String(parts[2])) != nil
    }
    @MainActor public static func registration(baseURL: URL?) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: matches, screen: { session in AnyView(ContentFanScreen(baseURL: baseURL, session: session).id(session.destination)) })
    }
}

private struct ContentFanScreen: View {
    let baseURL: URL?
    @ObservedObject var session: FanSession
    @State private var content: ContentViewValue?
    @State private var replies: [ContentReply] = []
    @State private var nextCursor: String?
    @State private var replyDepth = 1
    @State private var replyText = ""
    @State private var replyPolicy: ContentReplyPolicy?
    @State private var thanks: ContentThanks?
    @State private var thanksText = ""
    @State private var shareDigest = false
    @State private var showIdentity = false
    @State private var error = ""
    @State private var busy = false
    @State private var signature: String?
    @State private var signatureStatus = ""
    @State private var viewerAccountId:String?
    @State private var loadGeneration=0
    @State private var currentAccess = false
    @State private var muted: Bool?
    @State private var replyAccess = false
    @State private var thanksAccess = false
    @State private var loading = false
    @State private var checkedAt: TimeInterval = 0
    @State private var retryKeys: [String: String] = [:]
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scene
    private var creatorId: String { String(session.destination.split(separator: "/")[1]) }
    private var contentId: String { String(session.destination.split(separator: "/")[2]) }
    private var replyLimit: Int { replyPolicy?.limit ?? 4000 }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !error.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("w5ContentStatus"), children: error) }
                if !currentAccess {
                    Text(QelvoraCopy.text("w5ContentCheckingAccess")).qText("body")
                    Button(QelvoraCopy.text("w5ContentCheckCurrentAccess"), variant: .secondary, disabled: busy) { Task { await load(refreshThanks: false) } }
                } else {
                if let content {
                    if content.document.kind == "note" {
                        Note(children: content.displayText, name: content.creatorName, audience: content.audienceLabel, time: content.publishedAt, reply: false, onVerify: { signature = content.signedActId })
                    } else {
                        Text(content.authorLabel).qText("label"); Text(content.document.title).qText("display-md").accessibilityAddTraits(.isHeader)
                        if let quote = content.quotedText { Text(quote).qText("body"); if let handle = content.quotedHandle { Text("@" + handle).qText("caption") } }
                        Text(content.displayText).qText("body")
                        if content.signedActId != nil { Button("Signed", variant: .quiet) { signature = content.signedActId } }
                    }
                    if let count = content.audienceCount { Text("Audience size · \(count)").qText("caption") }
                    if content.displayText != content.document.text { DisclosureGroup(content.signedActId == nil ? "Original text" : "Signed original") { Text(content.document.text).qText("body") } }
                    attachments(for: content)
                    if content.document.kind == "note" {
                        Text("Your private replies").qText("display-md").accessibilityAddTraits(.isHeader)
                        Text("Only you, the creator, and their permitted team can read your replies. A Note is a broadcast.").qText("caption")
                        if replyPolicy?.milestone != nil, let days = replyPolicy?.confirmedDays {
                            Text(QelvoraCopy.text("contentConfirmedTenure", values: ["days": String(days)])).qText("caption")
                        }
                        if replyPolicy == nil { Text(QelvoraCopy.text("contentReplyPolicyUnavailable")).qText("caption") }
                        TextField("Reply privately", text: Binding(get: { replyText }, set: { value in
                            if value.utf16.count <= replyLimit || value.utf16.count < replyText.utf16.count { replyText = value }
                        }), axis: .vertical).qText("body").lineLimit(3...8).accessibilityLabel("Private reply")
                        Text(QelvoraCopy.text("contentReplyLimit", values: ["used": String(replyText.utf16.count), "limit": String(replyLimit)])).qText("caption")
                        if replyText.utf16.count > replyLimit { Text(QelvoraCopy.text("contentReplyOverLimit")).qText("caption") }
                        Button("Send private reply", variant: .secondary, block: true, disabled: busy || !replyAccess || replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || replyText.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count > replyLimit) { Task { await sendReply() } }
                        ForEach(replies.filter { $0.contentId == contentId }) { reply in
                            VStack(alignment: .leading, spacing: 12) {
                                Text(reply.text).qText("body")
                                if reply.safetyState != "allowed" { Text(reply.safetyState == "flagged" ? "This reply is withheld for safety review." : "Waiting for safety review. It has not reached the creator’s feed.").qText("caption") }
                                if reply.safetyState == "pending",reply.safetyReviewAvailable == true { Button("Retry safety review",variant:.quiet,disabled:busy) { Task { if await mutate("replies/"+reply.id+"/review",["version":reply.version,"idempotencyKey":UUID().uuidString]) { await load(refreshThanks:false) } } } }
                                if let reaction = reply.reaction { Text(content.creatorName + " reacted · " + reaction.kind).qText("caption"); Button("Verify reaction", variant: .quiet) { signature = reaction.signedActId } }
                                Button("Withdraw private reply", variant: .quiet, disabled: busy) { Task { await withdraw(reply) } }
                                Toggle("Allow this reply to be quoted", isOn: Binding(get: { reply.consent.shareText }, set: { value in Task { await consent(reply, text: value, handle: value && reply.consent.showHandle) } })).disabled(busy)
                                Toggle("Show my handle on the quote", isOn: Binding(get: { reply.consent.showHandle }, set: { value in Task { await consent(reply, text: true, handle: value) } })).disabled(busy || !reply.consent.shareText)
                            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 16))
                        }
                        if nextCursor != nil { Button("Older replies", variant: .secondary, disabled: busy || replyDepth >= 5) { Task { await older() } } }
                        if let muted { Button(muted ? "Unmute Notes from this creator" : "Mute Notes from this creator", variant: .quiet, disabled: busy) { Task { if await mutate("mute", ["muted": !muted]) { await load(refreshThanks:false) } } } }
                    }
                    Text("This helped").qText("display-md").accessibilityAddTraits(.isHeader)
                    TextField("Thanks · optional", text: $thanksText, axis: .vertical).qText("body").lineLimit(2...6)
                    Toggle("Share this text with the creator’s digest", isOn: $shareDigest).disabled(busy || !thanksAccess).onChange(of: shareDigest) { _, value in if !value { showIdentity = false } }
                    Toggle("Include my handle", isOn: $showIdentity).disabled(busy || !thanksAccess || !shareDigest)
                    Button(thanks != nil && thanks?.withdrawn == false ? "Update Thanks" : "This helped", variant: .secondary, block: true, disabled: busy || !thanksAccess) { Task { await saveThanks(withdraw: false) } }
                    if thanks != nil && thanks?.withdrawn == false { Button("Withdraw Thanks", variant: .quiet, disabled: busy || !thanksAccess) { Task { await saveThanks(withdraw: true) } } }
                } else {
                    Text("Content unavailable").qText("display-md"); Button("Refresh", variant: .secondary, disabled: busy) { Task { await load() } }
                    ForEach(replies.filter { $0.contentId == contentId }) { reply in
                        VStack(alignment: .leading,spacing:12) {
                            Text(reply.text).qText("body")
                            if reply.consent.shareText || reply.consent.showHandle { Button("Withdraw quote permission", variant:.quiet,disabled:busy) { Task { await consent(reply,text:false,handle:false) } } }
                            Button("Withdraw private reply",variant:.quiet,disabled:busy) { Task { await withdraw(reply) } }
                        }.padding(16).background(qColor("surface",scheme))
                    }
                    if nextCursor != nil { Button("Older replies",variant:.secondary,disabled:busy || replyDepth >= 5) { Task { await older() } } }
                    if thanks != nil && thanks?.withdrawn == false { Button("Withdraw Thanks",variant:.quiet,disabled:busy || !thanksAccess) { Task { await saveThanks(withdraw:true) } } }
                    if let muted { Button(muted ? "Unmute Notes from this creator" : "Mute Notes from this creator",variant:.quiet,disabled:busy) { Task { if await mutate("mute",["muted": !muted]) { await load(refreshThanks:false) } } } }
                }
                }
            }.padding(16)
        }.task {
            var refreshStarted = ProcessInfo.processInfo.systemUptime
            await load()
            while !Task.isCancelled {
                // Count the read time inside the refresh interval; the separate
                // five-second authority expiry still conceals stale content.
                let remaining = max(0.25, 2 - (ProcessInfo.processInfo.systemUptime - refreshStarted))
                try? await Task.sleep(for: .seconds(remaining))
                refreshStarted = ProcessInfo.processInfo.systemUptime
                if !busy { await load(refreshThanks: false) }
            }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                if ProcessInfo.processInfo.systemUptime - checkedAt >= 5 { suspendAccess() }
            }
        }
        .onChange(of: scene) { _, value in
            if value == .active { Task { await load(refreshThanks: false) } }
            else { suspendAccess() }
        }
        .sheet(isPresented: Binding(get: { signature != nil }, set: { if !$0 { signature = nil; signatureStatus = "" } })) {
            VStack(spacing: 16) { Text("Signature").qText("display-md"); Text(signatureStatus.isEmpty ? "Checking current signature…" : signatureStatus).qText("body"); Button("Done", variant: .secondary) { signature = nil; signatureStatus = "" } }.padding(24).task { await verify() }
        }
    }
    @ViewBuilder private func attachments(for content: ContentViewValue) -> some View {
        if let baseURL, let viewerAccountId, content.version > 0 {
            if content.document.media.count <= 10 {
                ForEach(content.document.media) { attachment in
                    NativeContentAttachmentView(session: session, destination: session.destination, baseURL: baseURL, accountId: viewerAccountId, creatorId: creatorId, objectId: content.id, contentKind: content.document.kind, creatorName: content.creatorName, attachment: attachment)
                        .id("\(viewerAccountId):\(content.id):\(content.version):\(attachment.id)")
                }
            } else {
                Text("Attachment information is unavailable. Refresh current access.").qText("caption")
            }
        }
    }
    private func contentReset() { content = nil }
    @MainActor private func suspendAccess() {
        currentAccess = false; replyAccess = false; thanksAccess = false; replyPolicy = nil; signature = nil; signatureStatus = ""
    }
    @MainActor private func clearAuthority() {
        suspendAccess(); content = nil; replies = []; thanks = nil; nextCursor = nil
        viewerAccountId = nil; muted = nil; replyText = ""; thanksText = ""; shareDigest = false; showIdentity = false; retryKeys = [:]
    }
    @MainActor private func load(refreshThanks: Bool = true) async {
        guard !loading else { return }; loading = true; defer { loading = false }
        guard let baseURL else { suspendAccess(); error = QelvoraCopy.text("w5ContentRefreshUnavailable"); return }
        let creatorId = self.creatorId, contentId = self.contentId
        let cycleStartedAt = ProcessInfo.processInfo.systemUptime
        loadGeneration+=1;let generation=loadGeneration
        let client=ContentClient(baseURL:baseURL)
        do {
            let before:ContentPreference=try await client.request(creatorId+"/mute")
            var view:ContentViewValue?;var statuses:[String]=[]
            do {view=try await client.request(creatorId+"/"+contentId, expectedAccountId: before.accountId)} catch {
                if let failure=error as? ContentFailure, failure.status==401 || failure.accountChanged {throw error}
                statuses.append(contentFailureCopy(error))
            }
            let depth = before.accountId == viewerAccountId ? replyDepth : 1
            var page:ContentReplyPage?;var currentReplies:[ContentReply]=[];var repliesAvailable=false
            do {
                var fresh:ContentReplyPage=try await client.request(creatorId+"/replies", expectedAccountId: before.accountId)
                var items=fresh.items
                if depth > 1 {
                    for _ in 1..<depth {
                        guard let cursor = fresh.nextCursor else { break }
                        fresh = try await client.request(creatorId + "/replies?cursor=" + cursor, expectedAccountId: before.accountId)
                        items += fresh.items
                    }
                }
                page=fresh;currentReplies=items;repliesAvailable=true
            } catch {
                if (error as? ContentFailure)?.authorityDenied == true {throw error}
                statuses.append("Private replies are unavailable. Refresh to try again.")
            }
            var mine:ContentThanks?;var thanksAvailable=false
            do {mine=try await client.request(creatorId+"/thanks?targetKind=content&targetId="+contentId, expectedAccountId: before.accountId);thanksAvailable=true} catch {
                if (error as? ContentFailure)?.authorityDenied == true {throw error}
                statuses.append("Thanks is unavailable. Your input is kept; refresh before saving.")
            }
            var policy: ContentReplyPolicy?
            do {
                let current: ContentReplyPolicy = try await client.request(creatorId + "/reply-policy", expectedAccountId: before.accountId)
                try current.validate(accountId: before.accountId, creatorId: creatorId)
                policy = current
            } catch {
                if (error as? ContentFailure)?.authorityDenied == true { throw error }
                statuses.append(QelvoraCopy.text("contentReplyPolicyUnavailable"))
            }
            let after:ContentPreference=try await client.request(creatorId+"/mute", expectedAccountId: before.accountId)
            guard generation==loadGeneration else{return}
            guard before.accountId==after.accountId else {clearAuthority();self.error=QelvoraCopy.text("w5ContentAccountChanged");return}
            let changed=viewerAccountId != before.accountId
            if changed {replyText="";thanksText="";shareDigest=false;showIdentity=false;retryKeys=[:];signature=nil;replyDepth=1}
            viewerAccountId=before.accountId;muted=after.muted;content=view;replies=currentReplies;nextCursor=page?.nextCursor;thanks=mine;replyAccess=repliesAvailable;thanksAccess=thanksAvailable;replyPolicy=policy
            if thanksAvailable && (refreshThanks || changed) {thanksText=mine?.text ?? "";shareDigest=mine?.shareWithCreatorDigest ?? false;showIdentity=mine?.showIdentity ?? false}
            self.error=statuses.joined(separator: "\n")
            checkedAt = cycleStartedAt; currentAccess = scene == .active && ProcessInfo.processInfo.systemUptime - cycleStartedAt < 5
        } catch {
            guard generation==loadGeneration else{return}
            suspendAccess()
            content=nil;replies=[];thanks=nil;nextCursor=nil
            if (error as? ContentFailure)?.authorityDenied == true {clearAuthority()}
            self.error=contentFailureCopy(error)
        }
    }
    @MainActor private func mutate(_ path: String, _ body: [String: Any]) async -> Bool {
        guard !busy, currentAccess, let baseURL,let viewerAccountId else { return false }; busy = true; defer { busy = false }
        var command=body
        var fingerprint:String?
        if command["idempotencyKey"] != nil {
            command.removeValue(forKey:"idempotencyKey")
            if let data=try? JSONSerialization.data(withJSONObject:command,options:.sortedKeys),let json=String(data:data,encoding:.utf8) { fingerprint=path+json;command["idempotencyKey"]=retryKeys[fingerprint!] ?? UUID().uuidString;retryKeys[fingerprint!]=command["idempotencyKey"] as? String }
        }
        do { let _: ContentReceipt = try await ContentClient(baseURL: baseURL).request(creatorId + "/" + path, body: JSONSerialization.data(withJSONObject: command), expectedAccountId:viewerAccountId); if let fingerprint { retryKeys.removeValue(forKey:fingerprint) }; error = ""; return true }
        catch { if let fingerprint,let failure=error as? ContentFailure,failure.status>=400 && failure.status<500 { retryKeys.removeValue(forKey:fingerprint) }; if (error as? ContentFailure)?.authorityDenied == true { clearAuthority() }; self.error = contentFailureCopy(error, action: true); return false }
    }
    @MainActor private func sendReply() async { guard replyAccess, replyText.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count <= replyLimit else {return}; if await mutate(contentId + "/replies", ["text": replyText, "idempotencyKey": UUID().uuidString]) { replyText = ""; await load(refreshThanks: false) } }
    @MainActor private func withdraw(_ reply:ContentReply) async { if await mutate("replies/"+reply.id+"/withdraw",["version":reply.version,"idempotencyKey":UUID().uuidString]) { await load(refreshThanks:false) } }
    @MainActor private func consent(_ reply: ContentReply, text: Bool, handle: Bool) async { if await mutate("replies/" + reply.id + "/consent", ["version": reply.consent.version, "shareText": text, "showHandle": handle, "idempotencyKey": UUID().uuidString]) { await load(refreshThanks: false) } }
    @MainActor private func saveThanks(withdraw: Bool) async {
        guard thanksAccess else {return}
        if await mutate("thanks", ["targetKind": "content", "targetId": contentId, "text": withdraw ? "" : thanksText, "shareWithCreatorDigest": !withdraw && shareDigest, "showIdentity": !withdraw && showIdentity, "withdrawn": withdraw, "expectedVersion": thanks?.version ?? 0, "idempotencyKey": UUID().uuidString]) { await load() }
    }
    @MainActor private func older() async {
        guard !busy, currentAccess, nextCursor != nil, replyDepth < 5 else { return }; busy = true; defer { busy = false }
        replyDepth += 1
        await load(refreshThanks: false)
    }
    @MainActor private func verify() async {
        guard currentAccess, let signature, let api = session.api else { return }
        do { let proof = try await api.publicSignature(signedActId: signature); guard self.signature == signature, currentAccess else { return }; signatureStatus = proof.creatorName + " · " + proof.status.rawValue.replacingOccurrences(of: "_", with: " ") + "\n" + proof.explanation }
        catch { guard self.signature == signature, currentAccess else { return }; signatureStatus = "This signature is private or unavailable. Current content access does not grant public verification access." }
    }
}
