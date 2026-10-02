import SwiftUI

@MainActor
public enum W3FanFeatures {
    /// W1 calls this at sign-out/account revocation alongside credential purge.
    public static func clearPrivateState() async throws { await W3Realtime.shared.purge(); try await W3ResumeStorage.shared.purge() }
    public static func registration(baseURL: URL?) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: { destination in
            let path = destination.components(separatedBy: "?")[0]
            return path == "/you" || path.hasPrefix("/threads/") || (path.hasPrefix("/creators/") && path.hasSuffix("/chat"))
        }, screen: { session in AnyView(W3ConversationDestination(baseURL: baseURL, session: session).id((session.session?.accountId ?? "signed-out") + session.destination)) })
    }
}

private struct W3ConversationDestination: View {
    let baseURL: URL?; @ObservedObject var session: FanSession
    var body: some View {
        let path = session.destination.components(separatedBy: "?")[0].split(separator: "/").map(String.init)
        if let baseURL, path.count == 3, path[0] == "threads", UUID(uuidString: path[1]) != nil, UUID(uuidString: path[2]) != nil {
            W3ThreadScreen(baseURL: baseURL, creatorId: path[1], fanId: path[2], session: session)
        } else if let baseURL, path.count == 3, path[0] == "creators", path[2] == "chat" {
            W3FirstConversation(baseURL: baseURL, handle: path[1], accountId: session.session?.accountId ?? "signed-out", session: session)
        } else if let baseURL, path == ["you"] {
            let query = URLComponents(string: session.destination)?.queryItems ?? []
            if ApplicationDestination.isPermitted(session.destination),
               let creatorId = query.first(where: { $0.name == "creatorId" })?.value,
               let fanId = query.first(where: { $0.name == "fanId" })?.value {
                W3PrivacyScreen(client: W3ConversationClient(baseURL: baseURL, expectedAccountId: session.session?.accountId), root: creatorId + "/" + fanId, session: session, onBack: { session.open("/you") })
            } else { W3AccountScreen(accountId: session.session?.accountId ?? "signed-out", baseURL: baseURL, session: session) }
        }
        else { Notice(title: "Conversation unavailable", children: "Reconnect to open this conversation from your account.") }
    }
}

private struct W3ThreadScreen: View {
    let baseURL: URL
    @StateObject private var model: W3ThreadModel
    @ObservedObject var session: FanSession
    @State private var privacy = false
    @State private var source: W3Passage?
    @State private var originalReply: W3Message?
    @State private var sourceFailure = ""
    @State private var connectionRetry = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    init(baseURL: URL, creatorId: String, fanId: String, session: FanSession) {
        self.baseURL = baseURL; _model = StateObject(wrappedValue: W3ThreadModel(baseURL: baseURL, creatorId: creatorId, fanId: fanId, accountId: session.session?.accountId ?? "signed-out")); self.session = session
    }
    var body: some View {
        VStack(spacing: 0) {
            if let page = model.page {
                ThreadHeader(name: page.creatorName, subtitle: "Official AI", live: page.control == .human_active, onBack: { session.open("/you") }, onAbout: { privacy = true })
                IdentityStrip(state: page.control == .human_active ? .human : page.control == .ai_active ? .ai : .paused, name: page.creatorName)
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                            if let offerId = model.introOfferId, session.session?.fan != nil, page.feedbackPolicy != nil {
                                IntroOffer(offerId: offerId, session: session,
                                    enabled: scenePhase == .active && !privacy && source == nil && originalReply == nil && !model.offline && !model.busy,
                                    acknowledge: model.acknowledgeIntroOffer).id(offerId)
                            }
                            Text("Conversations with a creator’s AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.").qText("caption").padding(12).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
                            if model.offline { Notice(tone: .offline, title: "You're offline", children: "You're seeing the last loaded conversation. Reconnect to send.") }
                            if page.offTheRecord { SystemLine(children: "Off the record · the AI keeps no memory from this conversation.") }
                            if model.before != nil { Button("Earlier messages", variant: .quiet, disabled: model.busy) { Task { await model.earlier() } } }
                            ForEach(model.older.filter { old in !page.messages.contains { $0.id == old.id } } + page.messages) { message in
                                row(message, page: page).id(message.id)
                            }
                            if let pending = model.pending {
                                Message(kind: .fan, children: pending.text, name: page.creatorName, delivery: pending.rejected ? .failed : pending.uncertain ? nil : .pending)
                                if pending.uncertain {
                                    Text("Acceptance has not been confirmed. Retry checks the same message without a duplicate.").qText("caption")
                                    Button("Retry", variant: .quiet, disabled: model.busy || model.offline) { Task { await model.send(retry: true) } }
                                }
                                if pending.rejected { Button("Keep editing", variant: .quiet) { model.draft = pending.text; model.pending = nil } }
                            }
                            if !model.failure.isEmpty { Notice(tone: .error, title: "Conversation status", children: model.failure) }
                            Color.clear.frame(height: 1).id("conversation-end")
                        }.padding(.horizontal, QelvoraTokens.space4).padding(.vertical, QelvoraTokens.space4)
                    }.textSelection(.enabled)
                        .onChange(of: model.pending == nil) { _, cleared in if cleared { proxy.scrollTo("conversation-end", anchor: .bottom) } }
                }
                VStack(spacing: QelvoraTokens.space3) {
                    if !page.canSend { Notice(title: "AI unavailable", children: page.unavailableReason ?? "Messaging is unavailable.") }
                    HStack(alignment: .bottom, spacing: QelvoraTokens.space2) {
                        TextField(page.control == .human_active ? "Message \(page.creatorName)…" : "Message \(page.creatorName)'s AI…", text: $model.draft, axis: .vertical)
                            .lineLimit(1...5).qText("body").padding(12).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
                            .accessibilityLabel(page.control == .human_active ? "Message \(page.creatorName)" : "Message \(page.creatorName)'s AI")
                            .onChange(of: model.draft) { _, value in if value.count > 2000 { model.draft = String(value.prefix(2000)) } }
                        Button("Send", variant: page.control == .human_active ? .maya : .ai, disabled: scenePhase != .active || privacy || source != nil || originalReply != nil || !page.canSend || model.offline || model.busy || model.pending != nil || !page.generationSequences.isEmpty || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { Task { await model.send() } }
                    }
                    Button("Ask \(page.creatorName) to step in", variant: .maya, block: true) { session.open("/commerce/packet?creatorId=" + model.creatorId) }
                    HStack { Button("Me and privacy", variant: .quiet) { privacy = true }; Button("Get support", variant: .quiet) { session.open("/support") } }
                }.padding(QelvoraTokens.space4).background(qColor("ground", scheme))
            } else {
                Notice(title: "Conversation unavailable", children: model.failure.isEmpty ? "Loading your messages…" : model.failure).padding(16)
                Button("Refresh", variant: .secondary) { connectionRetry += 1 }
                Button("Help and safety", variant: .quiet) { session.open("/support") }
                Spacer()
            }
        }.frame(maxWidth: 390).foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil)-\(connectionRetry)") {
                let active = scenePhase == .active && !privacy && source == nil && originalReply == nil
                model.setActive(active)
                if active { await model.connect() }
            }
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil)") {
                if scenePhase == .active && !privacy && source == nil && originalReply == nil {
                    while !Task.isCancelled { try? await Task.sleep(for: .seconds(15)); if !Task.isCancelled { await model.refresh() } }
                }
            }
            .onChange(of: scenePhase) { _, value in model.setActive(value == .active && !privacy && source == nil && originalReply == nil) }
            .onChange(of: privacy) { _, value in model.setActive(scenePhase == .active && !value && source == nil && originalReply == nil) }
            .onChange(of: source != nil) { _, value in model.setActive(scenePhase == .active && !privacy && !value && originalReply == nil) }
            .onChange(of: originalReply != nil) { _, value in model.setActive(scenePhase == .active && !privacy && source == nil && !value) }
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil)-\(model.page != nil)") {
                if scenePhase != .active || privacy || source != nil || originalReply != nil { await model.presence(active: false) }
                else { while !Task.isCancelled { await model.presence(active: true); try? await Task.sleep(for: .seconds(20)) } }
            }
            .onDisappear { model.setActive(false); Task { await model.presence(active: false) } }
            .sheet(isPresented: $privacy) { W3PrivacyScreen(client: model.client, root: model.root, session: session) }
            .sheet(item: $source) { passage in ScrollView { VStack(alignment: .leading, spacing: 16) { Text("Original source").qText("data-sm"); Text(passage.title).qText("display-md"); Text(passage.text).qText("body").textSelection(.enabled) }.padding(16) } }
            .sheet(item: $originalReply) { original in ScrollView { VStack(alignment: .leading, spacing: 16) { Text("Original AI reply · version \(original.version)").qText("data-sm"); Text(original.text).qText("body").textSelection(.enabled) }.padding(16) } }
            .alert("Source unavailable", isPresented: Binding(get: { !sourceFailure.isEmpty }, set: { if !$0 { sourceFailure = "" } })) { SwiftUI.Button("Close") { sourceFailure = "" } } message: { Text(sourceFailure) }
    }
    @ViewBuilder private func row(_ message: W3Message, page: W3Page) -> some View {
        if message.authorKind == .system {
            if let destination = message.publicAnswerDestination(creatorId: page.creatorId) {
                SwiftUI.Button { session.open(destination) } label: {
                    SystemLine(children: message.text).frame(minHeight: 48).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(model.offline || scenePhase != .active)
                .accessibilityLabel("System update: Answered publicly. Open answer")
            } else { SystemLine(children: message.text) }
        }
        else if message.recording != nil { recordingRow(message, page: page) }
        else if let correction = message.correction, let original = (model.older + page.messages).first(where: { $0.id == correction.originalMessageId && $0.version == correction.originalVersion && $0.authorKind == .ai }) {
            Correction(aiText: original.text, children: message.text, name: page.creatorName, onVerify: { if let act = message.signedActId { session.open("/verify/" + act) } })
        }
        else if let kind = MessageKind(rawValue: message.authorKind.rawValue) {
            Message(kind: kind, children: message.text, name: page.creatorName, member: message.member ?? "Authorized team member", delivery: message.deliveryState == .generating ? message.text.isEmpty ? .accepted : .streaming : message.deliveryState == .interrupted ? .interrupted : nil, citation: message.citations.isEmpty ? nil : AnyView(VStack { ForEach(message.citations, id: \.self) { id in CitationChip(title: "Source", meta: "Read the original passage") { Task { do { source = try await model.client.request(model.root + "/citations/" + id) } catch { sourceFailure = "No longer accessible to you" } } } } }), live: message.correction == nil && message.authorKind == .human_creator && page.control == .human_active, actions: false, onReport: { session.open(reportDestination(message)) }, onVerify: { if let act = message.signedActId { session.open("/verify/" + act) } })
                .accessibilityLabel(message.authorLabel(name: page.creatorName))
            if let correction = message.correction {
                Text(QelvoraCopy.text("correctionAuthor", values: ["name": page.creatorName])).qText("label")
                Button("Original AI reply · version \(correction.originalVersion)", variant: .quiet) { Task { do { let original: W3Message = try await model.client.request(model.root + "/messages/" + correction.originalMessageId); guard original.id == correction.originalMessageId, original.version == correction.originalVersion, original.authorKind == .ai else { sourceFailure = "The original reply changed."; return }; originalReply = original } catch { sourceFailure = "No longer accessible to you" } } }
            }
            if message.deliveryState == .failed { Text("Reply unavailable · your allowance was released").qText("caption") }
            if message.authorKind != .fan { Button("Report", variant: .quiet) { session.open(reportDestination(message)) } }
            if message.authorKind == .ai, message.agentVersion != nil, message.deliveryState == .delivered || message.deliveryState == .interrupted, let policy = page.feedbackPolicy {
                DisclosureGroup(QelvoraCopy.text("thisHelped")) {
                    Text(policy.notice).qText("caption")
                    Button(QelvoraCopy.text("thisHelped"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: "helpful") } }.accessibilityValue(message.feedback == "helpful" ? "Selected" : "Not selected")
                    Button("Not helpful", variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: "not_helpful") } }.accessibilityValue(message.feedback == "not_helpful" ? "Selected" : "Not selected")
                    if message.feedback != nil {
                        Text("Your response is saved.").qText("caption")
                        Button("Remove my response", variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: nil) } }
                    }
                }.qText("caption")
            }
            if message.feedback != nil, page.feedbackPolicy == nil {
                Button("Remove my response", variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: nil) } }
            }
            if message.authorKind == .fan { if message.offTheRecord { Text("Not used for memory").qText("caption") } else { Button("Don't remember this",variant:.quiet,disabled:model.busy || model.offline) { Task { await model.forget(message) } } } }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(message.authorKind == .human_broadcast ? "Note from \(page.creatorName) · audience details unavailable" : message.authorKind == .human_reaction ? "\(page.creatorName) reacted" : "Call with \(page.creatorName)").qText("label")
                Text(message.text).qText("body")
                if let act = message.signedActId { SignedMarker(name: page.creatorName) { session.open("/verify/" + act) } }
            }
        }

    }
    @ViewBuilder private func recordingRow(_ message: W3Message, page: W3Page) -> some View {
        if let recording = message.recording {
            if recording.state == "available", let asset = recording.asset,
               message.threadId == page.threadId, asset.threadId == page.threadId,
               asset.state == .ready, asset.mimeType == "audio/mp4", asset.purpose == .human_reply,
               message.authorKind == .human_creator, let act = message.signedActId, asset.signedActId == act,
               let accountId = session.session?.accountId {
                W3RecordingView(baseURL: baseURL, accountId: accountId, creatorId: model.creatorId, fanId: model.fanId, asset: asset, name: page.creatorName, time: message.createdAt, active: scenePhase == .active && !privacy && source == nil && originalReply == nil, onVerify: { session.open("/verify/" + act) })
                    .id(accountId + "/" + asset.id + "/" + String(asset.version) + "/" + asset.sha256)
            } else {
                Text(message.authorLabel(name: page.creatorName)).qText("label")
                Text("This recording is unavailable for this conversation.").qText("caption")
                if let act = message.signedActId { SignedMarker(name: page.creatorName) { session.open("/verify/" + act) } }
            }
        }
        Button("Report", variant: .quiet) { session.open(reportDestination(message)) }
    }

    private func reportDestination(_ message: W3Message) -> String {
        "/support?creatorId=" + model.creatorId + (message.authorKind == .ai ? "&messageId=" + message.id : "")
    }
}
private struct W3Passage: Decodable, Identifiable, Sendable { let id: String; let title: String; let text: String }

private struct W3FirstConversation: View {
    let baseURL: URL; let handle: String; let accountId: String; @ObservedObject var session: FanSession
    @State private var creator: GrowthCreator?; @State private var caps: W3Capabilities?; @State private var failure = ""; @State private var busy = false
    @State private var key = UUID().uuidString.lowercased()
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Button("Back", variant: .quiet) { session.open("/creators/" + handle) }
            AuthorLabel(kind: .ai, name: creator?.name ?? "the creator")
            Text("Before your first message").qText("display-lg")
            VStack(alignment: .leading, spacing: 16) {
                Text("WHO RUNS IT").qText("data-sm")
                if let policy = caps?.providers {
                    Text("This AI is powered by " + policy.providers.map(\.name).joined(separator: ", ") + ".").qText("body")
                    ForEach(policy.providers, id: \.name) { provider in
                        if let url = URL(string: provider.termsUrl) { Link(provider.name + " processing terms", destination: url) }
                        Text((provider.noTraining ? "Doesn't train on your messages." : "Review message use in these terms.") + " " + (provider.noRetention ? "Doesn't keep your messages." : "Review message retention in these terms.")).qText("caption")
                    }
                } else { Text("AI providers and their verified processing terms are not configured yet.").qText("body") }
                Text("WHO CAN READ IT").qText("data-sm"); Text(caps?.accessDisclosure ?? "Conversations can be read by the creator and their authorized team. Those accesses are logged.").qText("body")
                Text("WHAT IT REMEMBERS").qText("data-sm"); Text("Only what you agree to. It asks first, and you can see and delete every memory in You.").qText("body")
            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
            if !failure.isEmpty { Notice(tone: .error, title: "Conversation unavailable", children: failure) }
            if session.destination.contains("context=") { Notice(title: "Post context unavailable", children: "This post context is not connected to the conversation service yet. Your destination is kept.") }
            Spacer(minLength: 0)
            Button("Start with \(creator?.name ?? "the creator")'s AI", variant: .ai, size: .lg, block: true, disabled: busy || creator == nil || session.destination.contains("context=") || caps?.generationAvailable != true || caps?.consentAvailable != true) { Task { await begin() } }
            Button("Not now", variant: .quiet, block: true) { session.open("/creators/" + handle) }
        }.padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 36).frame(maxWidth: 390).background(qColor("ground", scheme))
            .task {
                struct Page: Decodable { let creator: GrowthCreator }
                do { let page: Page = try await GrowthClient(baseURL: baseURL, token: { nil }).request("public/creators/" + handle); creator = page.creator; caps = try await W3ConversationClient(baseURL: baseURL).request("capabilities", publicRead: true) }
                catch { failure = "This creator or the conversation service is unavailable." }
            }
    }
    private func begin() async {
        guard let creator, let policy = caps?.providers else { return }; busy = true; defer { busy = false }
        do { let page: W3Page = try await W3ConversationClient(baseURL: baseURL, expectedAccountId: accountId).request("begin", body: JSONEncoder().encode(W3Begin(creatorId: creator.id, policyVersion: policy.version, accessNoticeAccepted: true, idempotencyKey: key))); session.open("/threads/" + page.creatorId + "/" + page.fanId) }
        catch { failure = (error as? W3Failure)?.message ?? "Reconnect to try again. No message was sent." }
    }
}

private struct W3PrivacyScreen: View {
    let client: W3ConversationClient; let root: String; @ObservedObject var session: FanSession
    var onBack: (() -> Void)? = nil
    @State private var memory: W3MemoryView?; @State private var audit: [W3Audit]?; @State private var caps: W3Capabilities?; @State private var page: W3Page?
    @State private var usage: W3Usage?
    @State private var failure = ""; @State private var busy = false; @State private var editing: String?; @State private var text = ""
    @State private var provenance: W3Message?
    @State private var revision = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    private var name: String { page?.creatorName ?? "this creator" }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 28) {
            if let onBack { Button("Back to You", variant: .quiet, action: onBack) }
            Text("Me and privacy").qText("title")
            if !failure.isEmpty { Notice(tone: .error, title: "Privacy status", children: failure); Button("Try again", variant: .secondary, disabled: busy) { Task { await refresh() } } }
            Text("What \(name)'s AI remembers").qText("display-md")
            if memory == nil { Text(failure.isEmpty ? "Loading your memories…" : "Memories unavailable.").qText("body") }
            if memory?.items.isEmpty == true { Text("No memories. The AI asks before remembering.").qText("body") }
            ForEach(memory?.items ?? []) { item in VStack(alignment: .leading, spacing: 12) {
                Text(item.state == "proposed" ? "Want me to remember this? Only if you say yes." : item.kind == "open_loop" ? "Open loop · " + item.state : "Remembered").qText("data-sm")
                if editing == item.id { TextField("What you want remembered", text: $text, axis: .vertical).qText("body"); Button("Save proposal", variant: .secondary, disabled: busy || text.isEmpty) { Task { await decide(item, "edit") } } }
                else { Text(item.text).qText("body").textSelection(.enabled) }
                if item.sensitiveCategory != nil { Text("Sensitive item · agreement applies only to this exact memory.").qText("caption") }
                HStack { if item.state == "proposed" { Button("Remember", variant: .secondary, disabled: busy || memory?.offTheRecord == true) { Task { await decide(item, "accept") } } }; Button("Edit", variant: .quiet, disabled: busy) { editing = item.id; text = item.text }; Button(item.state == "proposed" ? "Don't remember" : "Delete", variant: .quiet, disabled: busy) { Task { await decide(item, "delete") } } }
                if item.kind == "open_loop" && item.state == "remembered" { Button("Resolved", variant: .quiet, disabled: busy) { Task { await decide(item, "resolve") } } }
                Button("View where this came from", variant: .quiet) { Task { await source(item) } }
            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg)) }
            Text("The creator and their team can see these memories, never edit them. Deleting one also removes summaries that could repeat it.").qText("caption")
            Text("Who opened your conversations").qText("display-md")
            ForEach(audit ?? []) { entry in VStack(alignment: .leading) { Text(entry.role == "creator" ? name + "'s account" : entry.role == "ops" ? "Authorized safety account" : "Authorized team · " + entry.role).qText("label"); Text("Account " + entry.readerAccountId).qText("caption"); Text(entry.readAt).qText("data-sm") } }
            if let audit { if audit.isEmpty { Text("No logged openings.").qText("body") } }
            else { Text(failure.isEmpty ? "Loading opening history…" : "Opening history unavailable.").qText("body") }
            Text("This shows when an authorized account opened a conversation, not that a person read every message.").qText("caption")
            Text("Off the record").qText("display-md")
            Toggle("Keep this conversation off the record", isOn: Binding(get: { memory?.offTheRecord ?? false }, set: { value in Task { await preferences(offTheRecord: value, introShared: memory?.introShared ?? false) } })).disabled(busy || memory == nil)
            Text("The AI keeps no memory from it. It is still labeled, visible to the creator and their team, and you can delete it.").qText("caption")
            Toggle("Share my intro with this creator's AI", isOn: Binding(get: { memory?.introShared ?? false }, set: { value in Task { await preferences(offTheRecord: memory?.offTheRecord ?? false, introShared: value) } })).disabled(busy || memory == nil)
            Text("Time with this creator's AI").qText("display-md")
            if usage == nil { Text(failure.isEmpty ? "Loading time history…" : "Time history unavailable.").qText("body") }
            if let usage {
                Text(usage.measurement + " Days are shown in UTC.").qText("caption")
                Text("This week · \(Int(usage.days.reduce(0) { $0 + $1.seconds } / 60)) minutes").qText("body")
                ForEach(usage.days, id: \.day) { day in HStack { Text(day.day).qText("data-sm"); Spacer(); Text("\(Int(day.seconds / 60)) minutes").qText("body") } }
                if !usage.modeAvailable { Text("Companion mode time signals await the verified AI mode configuration.").qText("caption") }
            }
            Text("AI providers").qText("display-md")
            if caps?.providers == nil { Text("AI provider consent is unavailable or has been withdrawn.").qText("body") }
            ForEach(caps?.providers?.providers ?? [], id: \.name) { provider in if let url = URL(string: provider.termsUrl) { Link(provider.name + " processing terms", destination: url) } }
            if let policy = caps?.providers { Button(page?.consentCurrent == true ? "Withdraw AI provider consent" : "Agree to these AI providers", variant: .secondary, disabled: busy || !policy.verified) { Task { await consent(policy) } } }
            Button("Export or delete my data", variant: .secondary, block: true) { session.open("/support/privacy") }
            Button("Help and safety", variant: .quiet) { session.open("/support") }
        }.padding(16) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task(id: "\(root)-\(scenePhase)") { if scenePhase == .active { await refresh() } else { conceal() } }
            .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
            .onDisappear { conceal() }
            .refreshable { await refresh() }
            .sheet(item: $provenance) { message in ScrollView { VStack(alignment: .leading, spacing: 16) { Text("Where this came from").qText("title"); Text(message.authorLabel(name:name)).qText("label"); Text(message.text).qText("body").textSelection(.enabled); Text(message.createdAt).qText("data-sm") }.padding(16) } }
    }
    private func conceal() {
        revision += 1; memory = nil; audit = nil; caps = nil; page = nil; usage = nil; provenance = nil; busy = false
    }
    private func current(_ ticket: Int) -> Bool { revision == ticket && scenePhase == .active && !Task.isCancelled }
    private func refresh() async {
        conceal()
        guard scenePhase == .active else { return }
        let ticket = revision; failure = ""
        do {
            let freshMemory: W3MemoryView = try await client.request(root + "/memory")
            let freshAudit: [W3Audit] = try await client.request(root + "/audit")
            let freshCaps: W3Capabilities = try await client.request("capabilities", publicRead: true)
            let freshPage: W3Page = try await client.request(root)
            let freshUsage: W3Usage = try await client.request(root + "/usage")
            guard current(ticket) else { return }
            memory = freshMemory; audit = freshAudit; caps = freshCaps; page = freshPage; usage = freshUsage
        } catch { if current(ticket) { failed(error, fallback: "Reconnect to refresh privacy settings.") } }
    }
    private func failed(_ error: any Error, fallback: String) {
        if let denial = error as? W3Failure, [401,403,404].contains(denial.status) { conceal(); editing = nil; text = "" }
        failure = (error as? W3Failure)?.message ?? fallback
    }
    private func source(_ item: W3Memory) async {
        let ticket = revision
        do {
            let message: W3Message = try await client.request(root + "/messages/" + item.provenanceMessageId)
            guard current(ticket), memory?.items.contains(where: { $0.id == item.id }) == true else { return }
            provenance = message
        } catch { if current(ticket) { failed(error, fallback: "This source message is unavailable.") } }
    }
    private func change(_ run: () async throws -> Void, fallback: String) async {
        guard !busy, scenePhase == .active, page != nil, memory != nil else { return }
        let ticket = revision; busy = true
        defer { if revision == ticket { busy = false } }
        do { try await run(); guard current(ticket) else { return }; editing = nil; await refresh() }
        catch { if current(ticket) { failed(error, fallback: fallback) } }
    }
    private func decide(_ item: W3Memory, _ action: String) async {
        guard let memory else { return }
        await change({ let _: W3MemoryView = try await client.request(root + "/memory/" + item.id, body: JSONEncoder().encode(W3Decision(expectedRevision: memory.revision, action: action, text: action == "edit" ? text : nil))) }, fallback: "This change could not be saved.")
    }
    private func preferences(offTheRecord: Bool, introShared: Bool) async {
        guard let memory else { return }
        await change({ let _: W3Page = try await client.request(root + "/preferences", body: JSONEncoder().encode(W3Preferences(offTheRecord: offTheRecord, introShared: introShared, expectedRevision: memory.revision))) }, fallback: "This change could not be saved.")
    }
    private func consent(_ policy: W3Policy) async {
        await change({ let _: W3Page = try await client.request(root + "/consent", body: JSONEncoder().encode(W3Consent(version: policy.version, accepted: page?.consentCurrent != true))) }, fallback: "Consent could not be saved.")
    }
}


private struct W3Account: Decodable, Sendable {
    struct Fan: Decodable, Sendable { let id: String; let handle: String; let intro: String? }
    struct Conversation: Decodable, Identifiable, Sendable { let id: String; let creatorId: String; let fanId: String; let name: String }
    let fan: Fan; let threads: [Conversation]
    let nextCursor: String?
}
private struct W3AccountScreen: View {
    let accountId: String
    let baseURL: URL; @ObservedObject var session: FanSession
    @State private var account: W3Account?; @State private var failure = ""
    @State private var cursor: String?; @State private var loading = false
    @State private var revision = 0
    @State private var commerce: CommerceOverview?
    @ScaledMetric(relativeTo: .title2) private var metricSize: CGFloat = 24
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(account.map { "@" + $0.fan.handle } ?? "You").qText("display-lg")
                        Text(session.session?.mode == .development ? "Synthetic local account · development" : "Signed in with Pantopus")
                            .qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                    }
                    if !failure.isEmpty { Notice(tone: .error, title: "Account unavailable", children: failure) }
                    HStack(alignment: .top, spacing: 12) {
                        accountMetric("THIS MONTH", value: monthAmount, detail: limitDescription)
                        accountMetric("MEMBERSHIPS", value: commerce.map { String($0.memberships.count) } ?? "—", detail: commerce == nil ? "Currently unavailable" : "Saved memberships")
                    }
                    accountPanel {
                        accountRow("Me and privacy", detail: "Memories, who opened your conversations, consents") { proxy.scrollTo("account-privacy", anchor: .top) }
                        accountDivider
                        accountRow("Spending and time", detail: "Your limit, receipts, time with each AI") { session.open("/commerce/spending") }
                        accountDivider
                        accountRow("Memberships", detail: "Manage your memberships") { session.open("/commerce/membership") }
                        accountDivider
                        accountRow("Notifications", detail: "Push and email, per creator, quiet hours") { session.open("/notifications/settings") }
                        accountDivider
                        accountRow("Receipts", detail: "Your purchases and deliveries") { session.open("/commerce/requests") }
                        accountDivider
                        accountRow("Help and safety", detail: "Report, block, crisis support") { session.open("/support") }
                    }.accessibilityLabel("Your account")
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your intro").qText("title")
                        Text(account.map { $0.fan.intro ?? "You haven’t added an intro yet." } ?? (failure.isEmpty ? "Loading your account…" : "Your intro is unavailable.")).qText("body")
                        Button("Edit handle and intro", variant: .quiet) { session.open("/identity/account") }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Me and privacy").qText("display-md")
                        Text(QelvoraCopy.text("conversationAccess")).qText("caption")
                        Text("Memory and conversation access by creator").qText("body")
                        if let account, account.threads.isEmpty { Text("No conversations yet.").qText("body") }
                        ForEach(account?.threads ?? []) { thread in
                            accountPanel {
                                accountRow(thread.name, detail: "Open conversation") { session.open("/threads/" + thread.creatorId + "/" + thread.fanId) }
                                accountDivider
                                accountRow("Memory and access", detail: thread.name) { session.open("/you?creatorId=" + thread.creatorId + "&fanId=" + thread.fanId) }
                            }
                        }
                        if loading { Text("Loading your conversations…").qText("caption") }
                        if let next = account?.nextCursor { Button("More conversations", variant: .quiet, disabled: loading || !failure.isEmpty) { Task { await refresh(before: next) } } }
                        if cursor != nil { Button("Back to first page", variant: .quiet, disabled: loading) { Task { await refresh() } } }
                        if !failure.isEmpty { Button("Try again", variant: .quiet, disabled: loading) { Task { await refresh(before: cursor) } } }
                        Button("Export or delete my data", variant: .secondary, block: true) { session.open("/support/privacy") }
                    }.id("account-privacy")
                }.padding(.horizontal, 16).padding(.top, 28).padding(.bottom, 24)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }.frame(maxWidth: 390).background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task(id: "\(accountId)-\(scenePhase)") {
                if scenePhase == .active { await refresh(before: cursor) }
                else { conceal() }
            }
            .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
            .onDisappear { conceal() }
            .refreshable { await refresh() }
    }
    private var monthAmount: String {
        guard let exposure = commerce?.exposure else { return "—" }
        return CommerceAmount.display(exposure.captured, exposure.currency)
    }
    private var limitDescription: String {
        guard let commerce else { return "Currently unavailable" }
        guard let limit = commerce.limits.first(where: { $0.currency == commerce.policy.currency }) else { return "Choose your limit" }
        if limit.explicit_none { return "No limit" }
        guard let amount = limit.amount.flatMap(Int64.init) else { return "Limit unavailable" }
        return "of your " + CommerceAmount.display(amount, limit.currency) + " limit"
    }
    private func accountMetric(_ title: String, value: String, detail: String) -> some View {
        accountPanel {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                Text(value).font(QelvoraFonts.font("mono", size: metricSize)).minimumScaleFactor(0.8)
                Text(detail).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            }.padding(14).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
    private var accountDivider: some View { Rectangle().fill(qColor("line", scheme)).frame(height: 1).accessibilityHidden(true) }
    private func accountPanel<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
            .overlay(RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg).stroke(qColor("line", scheme), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
    }
    private func accountRow(_ title: String, detail: String, action: @escaping () -> Void) -> some View {
        SwiftUI.Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).qText("body-strong")
                    Text(detail).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                }.frame(maxWidth: .infinity, alignment: .leading)
                QelvoraGlyph(name: "chevron", size: 16).accessibilityHidden(true)
            }.padding(.horizontal, 16).padding(.vertical, 10).frame(minHeight: 56)
                .contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityElement(children: .combine)
    }
    private func conceal() {
        revision += 1; account = nil; commerce = nil; loading = false
    }
    private func refresh(before: String? = nil) async {
        conceal()
        guard scenePhase == .active else { return }
        let currentRevision = revision
        loading = true; cursor = before; failure = ""
        defer { if revision == currentRevision { loading = false } }
        do {
            let fresh: W3Account = try await W3ConversationClient(baseURL:baseURL, expectedAccountId: accountId).request("account" + (before.map { "?cursor=" + $0 } ?? ""))
            guard !Task.isCancelled, revision == currentRevision, scenePhase == .active, session.session?.accountId == accountId else { return }
            account = fresh; cursor = before
            let overview: CommerceOverview? = try? await CommerceClient(baseURL: baseURL, accountId: accountId).request("overview")
            guard !Task.isCancelled, revision == currentRevision, scenePhase == .active, session.session?.accountId == accountId else { return }
            if let overview, overview.fan?.id == fresh.fan.id { commerce = overview }
        } catch {
            if !Task.isCancelled, revision == currentRevision, scenePhase == .active { failure = (error as? W3Failure)?.message ?? "Reconnect to open You." }
        }
    }
}
