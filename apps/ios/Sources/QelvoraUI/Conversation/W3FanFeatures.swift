import SwiftUI

@MainActor
public enum W3FanFeatures {
    /// W1 calls this at sign-out/account revocation alongside credential purge.
    public static func clearPrivateState() async { await W3ResumeStorage.shared.purge() }
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
        } else if let baseURL, path == ["you"] { W3AccountScreen(accountId: session.session?.accountId ?? "signed-out", baseURL: baseURL, session: session) }
        else { Notice(title: "Conversation unavailable", children: "Reconnect to open this conversation from your account.") }
    }
}

private struct W3ThreadScreen: View {
    @StateObject private var model: W3ThreadModel
    @ObservedObject var session: FanSession
    @State private var privacy = false
    @State private var source: W3Passage?
    @State private var sourceFailure = ""
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    init(baseURL: URL, creatorId: String, fanId: String, session: FanSession) {
        _model = StateObject(wrappedValue: W3ThreadModel(baseURL: baseURL, creatorId: creatorId, fanId: fanId, accountId: session.session?.accountId ?? "signed-out")); self.session = session
    }
    var body: some View {
        VStack(spacing: 0) {
            if let page = model.page {
                ThreadHeader(name: page.creatorName, subtitle: "Official AI", live: page.control == .human_active, onBack: { session.open("/you") }, onAbout: { privacy = true })
                IdentityStrip(state: page.control == .human_active ? .human : page.control == .ai_active ? .ai : .paused, name: page.creatorName)
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                            Text("Conversations with a creator’s AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.").qText("caption").padding(12).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
                            if model.offline { Notice(tone: .offline, title: "You're offline", children: "You're seeing the last loaded conversation. Reconnect to send.") }
                            if page.offTheRecord { SystemLine(children: "Off the record · the AI keeps no memory from this conversation.") }
                            if model.before != nil { Button("Earlier messages", variant: .quiet, disabled: model.busy) { Task { await model.earlier() } } }
                            ForEach(model.older.filter { old in !page.messages.contains { $0.id == old.id } } + page.messages) { message in
                                row(message, page: page).id(message.id)
                            }
                            if let pending = model.pending {
                                Message(kind: .fan, children: pending.text, name: page.creatorName, delivery: pending.uncertain ? nil : .pending)
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
                        Button("Send", variant: .ai, disabled: !page.canSend || model.offline || model.busy || model.pending != nil || !page.generationSequences.isEmpty || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { Task { await model.send() } }
                    }
                    Button("Ask \(page.creatorName) to step in", variant: .maya, block: true) { session.open("/commerce/packet?creatorId=" + model.creatorId) }
                    HStack { Button("Me and privacy", variant: .quiet) { privacy = true }; Button("Get support", variant: .quiet) { session.open("/support") } }
                }.padding(QelvoraTokens.space4).background(qColor("ground", scheme))
            } else {
                Notice(title: "Conversation unavailable", children: model.failure.isEmpty ? "Loading your messages…" : model.failure).padding(16)
                Button("Refresh", variant: .secondary) { Task { await model.refresh() } }
                Button("Help and safety", variant: .quiet) { session.open("/support") }
                Spacer()
            }
        }.frame(maxWidth: 390).foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: scenePhase) { if scenePhase == .active { await model.connect() } }
            .task(id: scenePhase) { if scenePhase == .active { while !Task.isCancelled { try? await Task.sleep(for: .seconds(5)); if !Task.isCancelled { await model.refresh() } } } }
            .task(id: "\(scenePhase)-\(privacy)-\(model.page != nil)") {
                if scenePhase != .active || privacy { await model.presence(active: false) }
                else { while !Task.isCancelled { await model.presence(active: true); try? await Task.sleep(for: .seconds(20)) } }
            }
            .onDisappear { Task { await model.presence(active: false) } }
            .sheet(isPresented: $privacy) { W3PrivacyScreen(client: model.client, root: model.root, name: model.page?.creatorName ?? "the creator", session: session) }
            .sheet(item: $source) { passage in ScrollView { VStack(alignment: .leading, spacing: 16) { Text("Original source").qText("meta"); Text(passage.title).qText("display-md"); Text(passage.text).qText("body").textSelection(.enabled) }.padding(16) } }
            .alert("Source unavailable", isPresented: Binding(get: { !sourceFailure.isEmpty }, set: { if !$0 { sourceFailure = "" } })) { SwiftUI.Button("Close") { sourceFailure = "" } } message: { Text(sourceFailure) }
    }
    @ViewBuilder private func row(_ message: W3Message, page: W3Page) -> some View {
        if message.authorKind == .system { SystemLine(children: message.text) }
        else if let kind = MessageKind(rawValue: message.authorKind.rawValue) {
            Message(kind: kind, children: message.text, name: page.creatorName, member: message.member ?? "Authorized team member", delivery: message.deliveryState == .generating ? message.text.isEmpty ? .accepted : .streaming : message.deliveryState == .interrupted ? .interrupted : nil, citation: message.citations.isEmpty ? nil : AnyView(VStack { ForEach(message.citations, id: \.self) { id in CitationChip(title: "Source", meta: "Read the original passage") { Task { do { source = try await model.client.request(model.root + "/citations/" + id) } catch { sourceFailure = "No longer accessible to you" } } } } }), live: message.authorKind == .human_creator && page.control == .human_active, actions: false, onReport: { session.open(reportDestination(message)) }, onVerify: { if let act = message.signedActId { session.open("/verify/" + act) } })
                .accessibilityLabel(message.authorLabel(name: page.creatorName))
            if message.deliveryState == .failed { Text("Reply unavailable · your allowance was released").qText("caption") }
            if message.authorKind != .fan { Button("Report", variant: .quiet) { session.open(reportDestination(message)) } }
            if message.authorKind == .fan { if message.offTheRecord { Text("Not used for memory").qText("caption") } else { Button("Don't remember this",variant:.quiet,disabled:model.busy || model.offline) { Task { await model.forget(message) } } } }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text(message.authorKind == .human_broadcast ? "Note from \(page.creatorName) · audience details unavailable" : message.authorKind == .human_reaction ? "\(page.creatorName) reacted" : "Call with \(page.creatorName)").qText("label")
                Text(message.text).qText("body")
                if let act = message.signedActId { SignedMarker(name: page.creatorName) { session.open("/verify/" + act) } }
            }
        }
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
                Text("WHO RUNS IT").qText("meta")
                if let policy = caps?.providers {
                    Text("This AI is powered by " + policy.providers.map(\.name).joined(separator: ", ") + ".").qText("body")
                    ForEach(policy.providers, id: \.name) { provider in
                        if let url = URL(string: provider.termsUrl) { Link(provider.name + " processing terms", destination: url) }
                        Text((provider.noTraining ? "Doesn't train on your messages." : "Review message use in these terms.") + " " + (provider.noRetention ? "Doesn't keep your messages." : "Review message retention in these terms.")).qText("caption")
                    }
                } else { Text("AI providers and their verified processing terms are not configured yet.").qText("body") }
                Text("WHO CAN READ IT").qText("meta"); Text(caps?.accessDisclosure ?? "Conversations can be read by the creator and their authorized team. Those accesses are logged.").qText("body")
                Text("WHAT IT REMEMBERS").qText("meta"); Text("Only what you agree to. It asks first, and you can see and delete every memory in You.").qText("body")
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
    let client: W3ConversationClient; let root: String; let name: String; @ObservedObject var session: FanSession
    @State private var memory: W3MemoryView?; @State private var audit: [W3Audit] = []; @State private var caps: W3Capabilities?; @State private var page: W3Page?
    @State private var usage: W3Usage?
    @State private var failure = ""; @State private var busy = false; @State private var editing: String?; @State private var text = ""
    @State private var provenance: W3Message?
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 28) {
            Text("Me and privacy").qText("title")
            if !failure.isEmpty { Notice(tone: .error, title: "Privacy status", children: failure) }
            Text("What \(name)'s AI remembers").qText("display-md")
            if memory?.items.isEmpty == true { Text("No memories. The AI asks before remembering.").qText("body") }
            ForEach(memory?.items ?? []) { item in VStack(alignment: .leading, spacing: 12) {
                Text(item.state == "proposed" ? "Want me to remember this? Only if you say yes." : item.kind == "open_loop" ? "Open loop · " + item.state : "Remembered").qText("meta")
                if editing == item.id { TextField("What you want remembered", text: $text, axis: .vertical).qText("body"); Button("Save proposal", variant: .secondary, disabled: busy || text.isEmpty) { Task { await decide(item, "edit") } } }
                else { Text(item.text).qText("body").textSelection(.enabled) }
                if item.sensitiveCategory != nil { Text("Sensitive item · agreement applies only to this exact memory.").qText("caption") }
                HStack { if item.state == "proposed" { Button("Remember", variant: .secondary, disabled: busy || memory?.offTheRecord == true) { Task { await decide(item, "accept") } } }; Button("Edit", variant: .quiet, disabled: busy) { editing = item.id; text = item.text }; Button(item.state == "proposed" ? "Don't remember" : "Delete", variant: .quiet, disabled: busy) { Task { await decide(item, "delete") } } }
                if item.kind == "open_loop" && item.state == "remembered" { Button("Resolved", variant: .quiet, disabled: busy) { Task { await decide(item, "resolve") } } }
                Button("View where this came from", variant: .quiet) { Task { do { provenance = try await client.request(root + "/messages/" + item.provenanceMessageId) } catch { failure = (error as? W3Failure)?.message ?? "This source message is unavailable." } } }
            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg)) }
            Text("The creator and their team can see these memories, never edit them. Deleting one also removes summaries that could repeat it.").qText("caption")
            Text("Who opened your conversations").qText("display-md")
            ForEach(audit) { entry in VStack(alignment: .leading) { Text(entry.role == "creator" ? name + "'s account" : entry.role == "ops" ? "Authorized safety account" : "Authorized team · " + entry.role).qText("label"); Text("Account " + entry.readerAccountId).qText("caption"); Text(entry.readAt).qText("data-sm") } }
            if audit.isEmpty { Text("No logged openings.").qText("body") }
            Text("This shows when an authorized account opened a conversation, not that a person read every message.").qText("caption")
            Text("Off the record").qText("display-md")
            Toggle("Keep this conversation off the record", isOn: Binding(get: { memory?.offTheRecord ?? false }, set: { value in Task { await preferences(offTheRecord: value, introShared: memory?.introShared ?? false) } })).disabled(busy || memory == nil)
            Text("The AI keeps no memory from it. It is still labeled, visible to the creator and their team, and you can delete it.").qText("caption")
            Toggle("Share my intro with this creator's AI", isOn: Binding(get: { memory?.introShared ?? false }, set: { value in Task { await preferences(offTheRecord: memory?.offTheRecord ?? false, introShared: value) } })).disabled(busy || memory == nil)
            Text("Time with this creator's AI").qText("display-md")
            if let usage {
                Text(usage.measurement + " Days are shown in UTC.").qText("caption")
                Text("This week · \(Int(usage.days.reduce(0) { $0 + $1.seconds } / 60)) minutes").qText("body")
                ForEach(usage.days, id: \.day) { day in HStack { Text(day.day).qText("data-sm"); Spacer(); Text("\(Int(day.seconds / 60)) minutes").qText("body") } }
                if !usage.modeAvailable { Text("Companion mode time signals await the verified AI mode configuration.").qText("caption") }
            }
            Text("AI providers").qText("display-md")
            ForEach(caps?.providers?.providers ?? [], id: \.name) { provider in if let url = URL(string: provider.termsUrl) { Link(provider.name + " processing terms", destination: url) } }
            if let policy = caps?.providers { Button(page?.consentCurrent == true ? "Withdraw AI provider consent" : "Agree to these AI providers", variant: .secondary, disabled: busy || !policy.verified) { Task { await consent(policy) } } }
            Button("Export or delete my data", variant: .secondary, block: true) { session.open("/support/privacy") }
            Button("Help and safety", variant: .quiet) { session.open("/support") }
        }.padding(16) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme)).task { await refresh() }.refreshable { await refresh() }
            .sheet(item: $provenance) { message in ScrollView { VStack(alignment: .leading, spacing: 16) { Text("Where this came from").qText("title"); Text(message.authorLabel(name:name)).qText("label"); Text(message.text).qText("body").textSelection(.enabled); Text(message.createdAt).qText("data-sm") }.padding(16) } }
    }
    private func refresh() async { do { memory = try await client.request(root + "/memory"); audit = try await client.request(root + "/audit"); caps = try await client.request("capabilities", publicRead: true); page = try await client.request(root); usage = try await client.request(root + "/usage"); failure = "" } catch { if let denial = error as? W3Failure, [401,403,404].contains(denial.status) { memory = nil; audit = []; page = nil; usage = nil; editing = nil; text = ""; provenance = nil }; failure = (error as? W3Failure)?.message ?? "Reconnect to refresh privacy settings." } }
    private func decide(_ item: W3Memory, _ action: String) async { guard !busy, let memory else { return }; busy = true; defer { busy = false }; do { let _: W3MemoryView = try await client.request(root + "/memory/" + item.id, body: JSONEncoder().encode(W3Decision(expectedRevision: memory.revision, action: action, text: action == "edit" ? text : nil))); editing = nil; await refresh() } catch { failure = (error as? W3Failure)?.message ?? "This change could not be saved." } }
    private func preferences(offTheRecord: Bool, introShared: Bool) async { guard !busy, let memory else { return }; busy = true; defer { busy = false }; do { let _: W3Page = try await client.request(root + "/preferences", body: JSONEncoder().encode(W3Preferences(offTheRecord: offTheRecord, introShared: introShared, expectedRevision: memory.revision))); await refresh() } catch { failure = (error as? W3Failure)?.message ?? "This change could not be saved." } }
    private func consent(_ policy: W3Policy) async { guard !busy else { return }; busy = true; defer { busy = false }; do { let _: W3Page = try await client.request(root + "/consent", body: JSONEncoder().encode(W3Consent(version: policy.version, accepted: page?.consentCurrent != true))); await refresh() } catch { failure = (error as? W3Failure)?.message ?? "Consent could not be saved." } }
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
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 28) {
            Text("You").qText("title")
            if !failure.isEmpty { Notice(tone: .error, title: "Account unavailable", children: failure) }
            Text(account?.fan.handle ?? "Your account").qText("display-md")
            Text(account?.fan.intro ?? "Your intro is private until you choose to share it.").qText("body")
            Button("Handle and intro", variant: .quiet) { session.open("/identity/account") }
            Button("Memberships and requests", variant: .secondary, block: true) { session.open("/commerce/requests") }
            Button("Spend and time", variant: .quiet, block: true) { session.open("/commerce/spending") }
            Button("Notifications", variant: .quiet, block: true) { session.open("/notifications/settings") }
            Text("Me and privacy").qText("display-md")
            Text("Memory and conversation access by creator").qText("body")
            ForEach(account?.threads ?? []) { thread in Button(thread.name, variant: .quiet, block: true) { session.open("/threads/" + thread.creatorId + "/" + thread.fanId) } }
            if loading { Text("Loading your conversations…").qText("caption") }
            if let next = account?.nextCursor { Button("More conversations", variant: .quiet, disabled: loading || !failure.isEmpty) { Task { await refresh(before: next) } } }
            if cursor != nil { Button("Back to first page", variant: .quiet, disabled: loading) { Task { await refresh() } } }
            if !failure.isEmpty { Button("Try again", variant: .quiet, disabled: loading) { Task { await refresh(before: cursor) } } }
            Button("Export or delete my data", variant: .secondary, block: true) { session.open("/support/privacy") }
            Button("Help and safety", variant: .quiet) { session.open("/support") }
        }.padding(16) }.frame(maxWidth: 390).background(qColor("ground",scheme)).foregroundStyle(qColor("ink",scheme))
            .task(id: session.session?.accountId) { await refresh() }.refreshable { await refresh() }
    }
    private func refresh(before: String? = nil) async {
        guard !loading else { return }; loading = true; cursor = before; defer { loading = false }
        do { let fresh: W3Account = try await W3ConversationClient(baseURL:baseURL, expectedAccountId: accountId).request("account" + (before.map { "?cursor=" + $0 } ?? "")); guard !Task.isCancelled else { return }; account = fresh; cursor = before; failure = "" }
        catch { if !Task.isCancelled { if let denial = error as? W3Failure, [401,403,404].contains(denial.status) { account = nil }; failure = (error as? W3Failure)?.message ?? "Reconnect to open You." } }
    }
}
