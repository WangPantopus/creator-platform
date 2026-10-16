import SwiftUI
#if os(iOS)
import UIKit
#endif

@MainActor
public enum W3FanFeatures {
    /// W1 calls this at sign-out/account revocation alongside credential purge.
    public static func clearPrivateState() async throws {
        await W3Realtime.shared.purge()
        // Purge every feature even if one storage operation fails. W1 keeps
        // sign-in fenced until the entire local purge succeeds.
        var failure: Error?
        do { try await W3DraftStorage.shared.purge() } catch { failure = error }
        do { try await W3ResumeStorage.shared.purge() }
        catch { failure = failure ?? error }
        await W3OfflineStorage.shared.purge()
        if let failure { throw failure }
    }
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
            W3FirstConversation(baseURL: baseURL, handle: path[1], accountId: session.session?.accountId ?? "signed-out", originalSessionId: session.session?.sessionId, destination: session.destination, session: session)
                .id((session.session?.sessionId ?? "signed-out") + session.destination)
        } else if let baseURL, path == ["you"] {
            let query = URLComponents(string: session.destination)?.queryItems ?? []
            if ApplicationDestination.isPermitted(session.destination),
               let creatorId = query.first(where: { $0.name == "creatorId" })?.value,
               let fanId = query.first(where: { $0.name == "fanId" })?.value {
                W3PrivacyScreen(client: W3ConversationClient(baseURL: baseURL, expectedAccountId: session.session?.accountId), root: creatorId + "/" + fanId, session: session, onBack: { session.back() })
            } else { W3AccountScreen(accountId: session.session?.accountId ?? "signed-out", baseURL: baseURL, session: session) }
        }
        else { Notice(title: QelvoraCopy.text("nativeConversationUnavailable"), children: baseURL == nil ? QelvoraCopy.text("nativeReconnectToOpenThisConversation") : QelvoraCopy.text("nativeOpenThisConversationFromYour")) }
    }
}

/// Whether the reader is at the thread's newest row; read only by event handlers.
private final class W3Follow { var atEnd = true; var top: CGFloat? }
/// Where the thread's rows sit in its visible part: their top edge, and how far
/// their end lies below the visible part's bottom.
private struct W3ThreadPlace: Equatable { let top: CGFloat; let gap: CGFloat }

private struct W3ThreadScreen: View {
    let baseURL: URL
    @StateObject private var model: W3ThreadModel
    @ObservedObject var session: FanSession
    @State private var privacy = false
    @State private var backStep = UUID()
    @State private var comparisonQuestion: W3Message?
    @State private var comparisonsAvailable = false
    @State private var source: W3Passage?
    @State private var originalReply: W3Message?
    @State private var sourceFailure = ""
    @State private var connectionRetry = 0
    /// The reader is at the newest row: the thread follows new rows only then.
    /// A plain reference, not view state: the end marker updates it while the
    /// reader scrolls, and as state every update re-rendered the whole thread.
    @State private var follow = W3Follow()
    /// After "Earlier messages", the row that was first stays where it was.
    @State private var keepInPlace: String?
    /// A reminder line was added (WP 7.4 P8): the thread draws it.
    @State private var reminderRevision = 0
    @FocusState private var composerFocused: Bool
    @ScaledMetric(relativeTo: .body) private var composerLineHeight: CGFloat = 24
    @Environment(\.dynamicTypeSize) private var textSize
    #if os(iOS)
    @Environment(\.verticalSizeClass) private var verticalSize
    #endif
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    init(baseURL: URL, creatorId: String, fanId: String, session: FanSession) {
        self.baseURL = baseURL; _model = StateObject(wrappedValue: W3ThreadModel(baseURL: baseURL, creatorId: creatorId, fanId: fanId, accountId: session.session?.accountId ?? "signed-out", sessionId: session.session?.sessionId ?? "")); self.session = session
    }
    private var compact: Bool {
        #if os(iOS)
        textSize.isAccessibilitySize || verticalSize == .compact
        #else
        textSize.isAccessibilitySize
        #endif
    }
    var body: some View {
        VStack(spacing: 0) {
            if let page = model.page {
                if compact {
                    HStack {
                        ThreadIconButton(glyph: "back", label: QelvoraCopy.text("back"), color: qColor("ink", scheme)) { session.back() }
                        Group {
                            if page.control != .ai_active && page.control != .human_active {
                                HStack { QelvoraGlyph(name: "pause", color: qColor("ink-muted", scheme)); Text(QelvoraCopy.text("aiPaused", values: ["name": page.creatorName])).qText("caption") }
                            } else { AuthorLabel(kind: page.control == .human_active ? .humanCreator : .ai, name: page.creatorName) }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        ThreadIconButton(glyph: "info", label: QelvoraCopy.text("aboutConversation"), color: qColor("ink-muted", scheme)) { privacy = true }
                    }
                } else {
                    ThreadHeader(name: page.creatorName, subtitle: QelvoraCopy.text("nativeOfficialAI"), live: !model.offline && page.control == .human_active, onBack: { session.back() }, onAbout: { privacy = true })
                    IdentityStrip(state: page.control == .human_active ? .human : page.control == .ai_active ? .ai : .paused, name: page.creatorName)
                }
                ScrollViewReader { proxy in
                    ScrollView {
                        // A plain stack at every text size. A lazy stack's height estimates could
                        // keep moving its rows while Notes were placed or removed during a
                        // scroll, re-estimating them forever, and the app spun (WP 7.3 at the
                        // largest text, R5 at normal size). Exact sizes settle; a thread holds
                        // at most 250 earlier messages and one page.
                        VStack(alignment: .leading, spacing: QelvoraTokens.space4) { threadRows(page) }
                            .padding(.horizontal, QelvoraTokens.space4).padding(.vertical, QelvoraTokens.space4)
                            // The reader is at the newest row while the rows' end is in view.
                            // Only the reader moving the rows (their top edge moves) leaves it:
                            // rows arriving or growing below do not, so the thread follows them.
                            .onGeometryChange(for: W3ThreadPlace.self) { geometry in
                                let frame = geometry.frame(in: .named("thread-scroll"))
                                return W3ThreadPlace(top: frame.minY, gap: frame.maxY - (geometry.bounds(of: .named("thread-scroll"))?.height ?? 0))
                            } action: { place in
                                defer { follow.top = place.top }
                                if place.gap <= 40 { follow.atEnd = true }
                                else if let top = follow.top, abs(place.top - top) > 0.5 { follow.atEnd = false }
                            }
                    }.textSelection(.enabled)
                        .coordinateSpace(name: "thread-scroll")
                        // Open at the newest row and follow new rows while the reader is
                        // there, explicitly, as Android does. Under a bottom anchor
                        // (`defaultScrollAnchor(.bottom)`) a lazy stack could re-measure its
                        // rows forever when the keyboard left while Notes arrived.
                        .onChange(of: model.page == nil, initial: true) { _, missing in
                            if !missing { follow.atEnd = true; toEnd(proxy) }
                        }
                        .onChange(of: tail(page)) { if follow.atEnd { toEnd(proxy) } }
                        .onChange(of: compact) { toEnd(proxy) }
                        .onChange(of: model.older.count) {
                            if let id = keepInPlace { keepInPlace = nil; proxy.scrollTo(id, anchor: .top) }
                        }
                        .scrollDismissesKeyboard(.interactively)
                        #if os(iOS)
                        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
                            // The default anchor does not follow the viewport
                            // contraction when the software keyboard appears.
                            // Align after that OS transition, only when editing.
                            if composerFocused { toEnd(proxy) }
                        }
                        #endif
                        .onChange(of: model.pending?.key) { _, sent in if sent != nil { follow.atEnd = true; toEnd(proxy) } }
                }
                // The composer follows the design reference (`Composer`, WP 7.4 P3): while the
                // creator is here the input is theirs and there is no step-in button; while the
                // AI is paused the paused line takes the input's place and step-in stays.
                let human = page.control == .human_active, paused = page.control == .ai_paused
                VStack(spacing: QelvoraTokens.space3) {
                    if !page.canSend && !paused { Notice(title: QelvoraCopy.text("nativeAIUnavailable"), children: page.unavailableReason ?? QelvoraCopy.text("nativeMessagingIsUnavailable")) }
                    if paused && !compact {
                        HStack(spacing: QelvoraTokens.space2) {
                            QelvoraGlyph(name: "pause", color: qColor("ink-muted", scheme))
                            Text(QelvoraCopy.text("aiPaused", values: ["name": page.creatorName])).qText("label").foregroundStyle(qColor("ink-muted", scheme))
                        }.frame(maxWidth: .infinity, alignment: .leading).accessibilityElement(children: .combine)
                    }
                    // In the compact layout the step-in button ends the thread instead (below).
                    if !human && !compact && (paused || !composerFocused) { Button(QelvoraCopy.text("stepIn", values: ["name": page.creatorName]), variant: .maya, block: true, initial: creatorInitial(page.creatorName)) { session.open("/commerce/packet?creatorId=" + model.creatorId) } }
                    if !paused { HStack(alignment: .bottom, spacing: QelvoraTokens.space2) {
                        TextEditor(text: Binding(get: { model.draft }, set: { model.draft = String($0.prefix(2000)) }))
                            .qText("body").scrollContentBackground(.hidden)
                            // A bounded scrolling editor avoids intrinsic-height
                            // feedback when a restored draft gains keyboard focus.
                            .frame(height: compact ? max(44, composerLineHeight) : min(120, composerLineHeight * 2))
                            .overlay(alignment: .topLeading) {
                                if model.draft.isEmpty {
                                    Text(composerLabel(page))
                                        .qText("body").foregroundStyle(qColor("ink-muted", scheme))
                                        .lineLimit(1).padding(.leading, 5).padding(.top, 8)
                                        .allowsHitTesting(false).accessibilityHidden(true)
                                }
                            }
                            .padding(compact ? 4 : 12).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
                            .overlay(RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg).stroke(qColor(human ? "maya-line" : "control-line", scheme), lineWidth: QelvoraTokens.hairline))
                            .accessibilityLabel(composerLabel(page))
                            .focused($composerFocused)
                        // Send takes its one-line width first, as on Android; at the largest
                        // text the creator's seal otherwise split the word across two lines.
                        Button(QelvoraCopy.text("nativeSend"), variant: page.control == .human_active ? .maya : .ai, initial: creatorInitial(page.creatorName), disabled: scenePhase != .active || privacy || source != nil || originalReply != nil || comparisonQuestion != nil || !page.canSend || model.offline || model.busy || model.pending != nil || !page.generationSequences.isEmpty || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { Task { await model.send() } }
                            .layoutPriority(1)
                    } }
                    if !composerFocused && !compact { HStack { Button(QelvoraCopy.text("nativeMeAndPrivacy"), variant: .quiet) { privacy = true }; Button(QelvoraCopy.text("nativeGetSupport"), variant: .quiet) { session.open("/support") } } }
                }.padding(.horizontal, QelvoraTokens.space4).padding(.vertical, compact && composerFocused ? 4 : QelvoraTokens.space4).background(qColor("ground", scheme))
            } else {
                Notice(title: QelvoraCopy.text("nativeConversationUnavailable"), children: model.failure.isEmpty ? QelvoraCopy.text("nativeLoadingYourMessages") : model.failure).padding(16)
                Button(QelvoraCopy.text("nativeRefresh"), variant: .secondary) { connectionRetry += 1 }
                Button(QelvoraCopy.text("nativeHelpAndSafety"), variant: .quiet) { session.open("/support") }
                Spacer()
            }
        }.frame(maxWidth: 390).foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: counting) { await countTime() }
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil || comparisonQuestion != nil)-\(connectionRetry)") {
                let active = scenePhase == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil
                model.setActive(active)
                if active { await model.connect() }
            }
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil || comparisonQuestion != nil)") {
                if scenePhase == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil {
                    while !Task.isCancelled { try? await Task.sleep(for: .seconds(15)); if !Task.isCancelled { await model.refresh() } }
                }
            }
            .onChange(of: scenePhase) { _, value in
                if value != .active { source = nil; originalReply = nil; comparisonQuestion = nil; sourceFailure = "" }
                model.setActive(value == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil)
            }
            .onChange(of: privacy) { _, value in
                if value { session.holdBack(backStep) { privacy = false } } else { session.releaseBack(backStep) }
                model.setActive(scenePhase == .active && !value && source == nil && originalReply == nil && comparisonQuestion == nil) }
            .onDisappear { session.releaseBack(backStep) }
            .onChange(of: source != nil) { _, value in model.setActive(scenePhase == .active && !privacy && !value && originalReply == nil && comparisonQuestion == nil) }
            .onChange(of: originalReply != nil || comparisonQuestion != nil) { _, value in model.setActive(scenePhase == .active && !privacy && source == nil && !value) }
            .task(id: "\(scenePhase)-\(privacy)-\(source != nil)-\(originalReply != nil || comparisonQuestion != nil)-\(model.page != nil)") {
                if scenePhase != .active || privacy || source != nil || originalReply != nil || comparisonQuestion != nil { await model.presence(active: false) }
                else { while !Task.isCancelled { await model.presence(active: true); try? await Task.sleep(for: .seconds(20)) } }
            }
            .onDisappear { model.setActive(false); Task { await model.presence(active: false) } }
            .task(id: "\(model.offline)-\(scenePhase)") {
                comparisonsAvailable = false
                if !model.offline && scenePhase == .active {
                    let caps: W3Capabilities? = try? await model.client.request("capabilities", publicRead: true)
                    if !Task.isCancelled { comparisonsAvailable = caps?.comparisonsAvailable == true }
                }
            }
            .sheet(item: $comparisonQuestion) { question in
                ScrollView { VStack(alignment: .leading, spacing: 16) {
                    HStack { Text(QelvoraCopy.text("nativeAIComparisons")).qText("display-lg"); Spacer(); Button(QelvoraCopy.text("close"), variant: .quiet) { comparisonQuestion = nil } }
                    Text(QelvoraCopy.text("nativeYourQuestion")).qText("data-sm")
                    Text(question.text).qText("body").padding(12).background(qColor("surface-sunken", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
                    // Comparisons turned off while the choice was open: it closes, nothing is said.
                    W3ComparisonChoice(client: model.client, root: model.root, messageId: question.id) { comparisonQuestion = nil; comparisonsAvailable = false }
                }.padding(16) }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme)).presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $privacy) { W3PrivacyScreen(client: model.client, root: model.root, session: session, onBack: { privacy = false }) }
            .sheet(item: $source) { passage in ScrollView { VStack(alignment: .leading, spacing: 16) { Text(QelvoraCopy.text("nativeOriginalSource")).qText("data-sm"); Text(passage.title).qText("display-md"); Text(passage.text).qText("body").textSelection(.enabled) }.padding(16) } }
            .sheet(item: $originalReply) { original in ScrollView { VStack(alignment: .leading, spacing: 16) { Text(QelvoraCopy.text("nativeOriginalAIReplyVersionVersion", values: ["version": String(original.version)])).qText("data-sm"); Text(original.text).qText("body").textSelection(.enabled) }.padding(16) } }
            .alert(QelvoraCopy.text("nativeSourceUnavailable"), isPresented: Binding(get: { !sourceFailure.isEmpty }, set: { if !$0 { sourceFailure = "" } })) { SwiftUI.Button(QelvoraCopy.text("close")) { sourceFailure = "" } } message: { Text(sourceFailure) }
    }
    /// Whom the person is writing to: "Reply to {name}" while the creator is here,
    /// otherwise "Message {name}'s AI" (the placeholder and the field's label).
    private func composerLabel(_ page: W3Page) -> String {
        QelvoraCopy.text(page.control == .human_active ? "replyToCreator" : "messageAI", values: ["name": page.creatorName])
    }
    /// The thread's rows, in one plain stack at every text size.
    @ViewBuilder private func threadRows(_ page: W3Page) -> some View {
        if compact { IdentityStrip(state: page.control == .human_active ? .human : page.control == .ai_active ? .ai : .paused, name: page.creatorName) }
        if let offerId = model.introOfferId, session.session?.fan != nil, page.feedbackPolicy != nil {
            IntroOffer(offerId: offerId, session: session,
                enabled: scenePhase == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil && !model.offline && !model.busy,
                acknowledge: model.acknowledgeIntroOffer).id(offerId)
        }
        Text(QelvoraCopy.text("conversationAccess")).qText("caption").padding(12).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
        if model.offline { Notice(tone: .offline, title: QelvoraCopy.text("nativeYoureOffline"), children: QelvoraCopy.text("nativeYoureSeeingASavedConversation")) }
        if page.offTheRecord { SystemLine(children: QelvoraCopy.text("nativeOffTheRecordTheAIKeeps")) }
        if model.before != nil { Button(QelvoraCopy.text("nativeEarlierMessages"), variant: .quiet, disabled: model.busy || model.offline) { keepInPlace = model.timeline(page).first?.id; Task { await model.earlier() } } }
        let rows = model.timeline(page), reminders = W3LongSession.shared.lines(for: model.root)
        ForEach(rows) { entry in
            switch entry {
            case .message(let message): row(message, page: page).id(message.id)
            case .presence(let item): presenceRow(item).id(entry.id)
            }
            // The 3-hour reminder, after the row that was newest when it appeared.
            ForEach(reminders.indices.filter { reminders[$0].after == entry.id }, id: \.self) { index in SystemLine(children: reminders[index].text) }
        }
        let present = Set(rows.map(\.id))
        ForEach(reminders.indices.filter { reminders[$0].after.map { !present.contains($0) } ?? true }, id: \.self) { index in SystemLine(children: reminders[index].text) }
        if let pending = model.pending {
            Message(kind: .fan, children: pending.text, name: page.creatorName, delivery: pending.rejected ? .failed : pending.uncertain ? nil : .pending, onRetry: { Task { await model.send(retry: true) } })
            if pending.uncertain {
                Text(QelvoraCopy.text("nativeAcceptanceHasntBeenConfirmed")).qText("caption")
                Button(QelvoraCopy.text("retry"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.send(retry: true) } }
            }
            if pending.rejected { Button(QelvoraCopy.text("nativeKeepEditing"), variant: .quiet, disabled: model.busy) { model.draft = pending.text; model.pending = nil } }
        }
        if !model.failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativeConversationStatus"), children: model.failure) }
        if compact && !composerFocused {
            if page.control != .human_active { Button(QelvoraCopy.text("stepIn", values: ["name": page.creatorName]), variant: .maya, block: true, initial: creatorInitial(page.creatorName)) { session.open("/commerce/packet?creatorId=" + model.creatorId) } }
            Button(QelvoraCopy.text("nativeMeAndPrivacy"), variant: .quiet) { privacy = true }
            Button(QelvoraCopy.text("nativeGetSupport"), variant: .quiet) { session.open("/support") }
        }
        Color.clear.frame(height: 1).id("conversation-end")
    }
    /// The thread's newest end, below the last row.
    private func toEnd(_ proxy: ScrollViewProxy) { proxy.scrollTo("conversation-end", anchor: .bottom) }
    /// What changes at the newest end of the thread: rows, a reply growing, a send, a notice.
    private func tail(_ page: W3Page) -> String {
        let last = page.messages.last
        return "\(page.messages.count)|\(last?.id ?? "")|\(last?.text.count ?? 0)|\(model.presence.count)|\(model.pending?.key ?? "")|\(model.failure.isEmpty)|\(model.offline)|\(reminderRevision)"
    }
    /// WP 7.4 P8: the AI conversation is in front with its AI on, so its time counts.
    private var counting: Bool {
        scenePhase == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil && model.page?.control == .ai_active
    }
    /// Runs the phone's count while this thread counts; at each 3 hours the fixed
    /// line joins this thread once.
    private func countTime() async {
        guard counting, let account = session.session?.accountId else { return }
        let clock = W3LongSession.shared
        clock.begin(account: account)
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(clock.interval))
            guard !Task.isCancelled, counting else { break }
            if clock.tick(), let page = model.page {
                clock.add(thread: model.root, after: model.timeline(page).last?.id, text: QelvoraCopy.text("longSession", values: ["name": page.creatorName]))
                reminderRevision += 1
            }
        }
        clock.end()
    }
    @ViewBuilder private func row(_ message: W3Message, page: W3Page) -> some View {
        if message.authorKind == .system {
            if let destination = message.publicAnswerDestination(creatorId: page.creatorId) {
                SwiftUI.Button { session.open(destination) } label: {
                    SystemLine(children: message.text).frame(minHeight: 48).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(model.offline || scenePhase != .active)
                .accessibilityLabel(QelvoraCopy.text("nativeSystemUpdateAnsweredPublicly"))
            } else { SystemLine(children: message.text) }
        }
        else if message.recording != nil { recordingRow(message, page: page) }
        else if let correction = message.correction, let original = (model.older + page.messages).first(where: { $0.id == correction.originalMessageId && $0.version == correction.originalVersion && $0.authorKind == .ai }) {
            Correction(aiText: original.text, children: message.text, name: page.creatorName, onVerify: { if let act = message.signedActId { session.open("/verify/" + act) } })
        }
        else if let kind = MessageKind(rawValue: message.authorKind.rawValue) {
            Message(kind: kind, children: message.text, name: page.creatorName, member: message.member ?? QelvoraCopy.text("nativeAuthorizedTeamMember"), delivery: message.deliveryState == .generating ? message.text.isEmpty ? .accepted : .streaming : message.deliveryState == .interrupted ? .interrupted : nil, citation: message.citations.isEmpty ? nil : AnyView(VStack { ForEach(message.citations, id: \.self) { id in CitationChip(title: QelvoraCopy.text("source"), meta: QelvoraCopy.text("nativeReadTheOriginalPassage")) { Task { do { source = try await model.client.request(model.root + "/citations/" + id) } catch { sourceFailure = QelvoraCopy.text("sourceUnavailable") } } } } }), live: !model.offline && message.correction == nil && message.authorKind == .human_creator && page.control == .human_active, actions: false, onReport: { session.open(reportDestination(message)) }, onVerify: { if let act = message.signedActId { session.open("/verify/" + act) } })
                .accessibilityLabel(message.authorLabel(name: page.creatorName))
            if let correction = message.correction {
                Text(QelvoraCopy.text("correctionAuthor", values: ["name": page.creatorName])).qText("label")
                Button(QelvoraCopy.text("nativeOriginalAIReplyVersionVersion", values: ["version": String(correction.originalVersion)]), variant: .quiet) { Task { do { let original: W3Message = try await model.client.request(model.root + "/messages/" + correction.originalMessageId); guard original.id == correction.originalMessageId, original.version == correction.originalVersion, original.authorKind == .ai else { sourceFailure = QelvoraCopy.text("nativeTheOriginalReplyChanged"); return }; originalReply = original } catch { sourceFailure = QelvoraCopy.text("sourceUnavailable") } } }
            }
            if message.deliveryState == .failed { Text(QelvoraCopy.text("conversationReplyUnavailable")).qText("caption") }
            if message.authorKind != .fan { Button(QelvoraCopy.text("report"), variant: .quiet) { session.open(reportDestination(message)) } }
            if message.authorKind == .ai, message.agentVersion != nil, message.deliveryState == .delivered || message.deliveryState == .interrupted, let policy = page.feedbackPolicy {
                DisclosureGroup(QelvoraCopy.text("thisHelped")) {
                    Text(policy.notice).qText("caption")
                    Button(QelvoraCopy.text("thisHelped"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: "helpful") } }.accessibilityValue(message.feedback == "helpful" ? QelvoraCopy.text("nativeSelected") : QelvoraCopy.text("nativeNotSelected"))
                    Button(QelvoraCopy.text("nativeNotHelpful"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: "not_helpful") } }.accessibilityValue(message.feedback == "not_helpful" ? QelvoraCopy.text("nativeSelected") : QelvoraCopy.text("nativeNotSelected"))
                    if message.feedback != nil {
                        Text(QelvoraCopy.text("nativeYourResponseIsSaved")).qText("caption")
                        Button(QelvoraCopy.text("nativeRemoveMyResponse"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: nil) } }
                    }
                }.qText("caption")
            }
            if message.feedback != nil, page.feedbackPolicy == nil {
                Button(QelvoraCopy.text("nativeRemoveMyResponse"), variant: .quiet, disabled: model.busy || model.offline) { Task { await model.feedback(message, rating: nil) } }
            }
            if comparisonsAvailable && message.authorKind == .fan && !message.offTheRecord && !page.offTheRecord && (message.deliveryState == .accepted || message.deliveryState == .delivered) {
                Button(QelvoraCopy.text("nativeAIComparisonOptions"), variant: .quiet, disabled: model.busy || model.offline) { comparisonQuestion = message }.accessibilityIdentifier("comparison-options-" + message.id)
            }
            if message.authorKind == .fan { if message.offTheRecord { Text(QelvoraCopy.text("nativeNotUsedForMemory")).qText("caption") } else { Button(QelvoraCopy.text("nativeDontRememberThis"),variant:.quiet,disabled:model.busy || model.offline) { Task { await model.forget(message) } } } }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: QelvoraLayout.authorGap) {
                    if message.authorKind == .human_broadcast { Mark(kind: .humanBroadcast) } else if message.authorKind == .human_reaction { Mark(kind: .humanReaction) }
                    Text(message.authorKind == .human_broadcast ? QelvoraCopy.text("nativeNoteFromNameAudienceDetailsUnavailable", values: ["name": page.creatorName]) : message.authorKind == .human_reaction ? QelvoraCopy.text("nativeNameReacted", values: ["name": page.creatorName]) : QelvoraCopy.text("nativeCallWithName", values: ["name": page.creatorName])).qText("label")
                }
                Text(message.text).qText("body")
                if let act = message.signedActId { SignedMarker(name: page.creatorName) { session.open("/verify/" + act) } }
            }
        }

    }
    /// C4: a Note or reaction with the server's label, glyph and creator color.
    /// A Note is never answered through the thread composer.
    @ViewBuilder private func presenceRow(_ item: W3ThreadPresence) -> some View {
        switch item {
        case .note(let note):
            Note(children: note.text, name: note.creatorName, reply: false, label: note.authorLabel) { session.open("/verify/" + note.signedActId) }
                .accessibilityIdentifier("presence-note-" + note.id)
        case .reaction(let reaction):
            VStack(alignment: .leading, spacing: 8) {
                ReactionChip(name: reaction.creatorName, label: reaction.authorLabel)
                SignedMarker(name: reaction.creatorName) { session.open("/verify/" + reaction.signedActId) }
            }.accessibilityElement(children: .contain).accessibilityIdentifier("presence-reaction-" + reaction.id)
        case .unknown: EmptyView()
        }
    }
    @ViewBuilder private func recordingRow(_ message: W3Message, page: W3Page) -> some View {
        if let recording = message.recording {
            if recording.state == "available", let asset = recording.asset,
               message.threadId == page.threadId, asset.threadId == page.threadId,
               asset.state == .ready, asset.mimeType == "audio/mp4", asset.purpose == .human_reply,
               message.authorKind == .human_creator, let act = message.signedActId, asset.signedActId == act,
               let accountId = session.session?.accountId {
                W3RecordingView(session: session, destination: session.destination, baseURL: baseURL, accountId: accountId, creatorId: model.creatorId, fanId: model.fanId, asset: asset, name: page.creatorName, time: message.createdAt, active: scenePhase == .active && !privacy && source == nil && originalReply == nil && comparisonQuestion == nil, onVerify: { session.open("/verify/" + act) })
                    .id(accountId + "/" + asset.id + "/" + String(asset.version) + "/" + asset.sha256)
            } else {
                Text(message.authorLabel(name: page.creatorName)).qText("label")
                Text(QelvoraCopy.text("nativeThisRecordingIsUnavailableFor")).qText("caption")
                if let act = message.signedActId { SignedMarker(name: page.creatorName) { session.open("/verify/" + act) } }
            }
        }
        Button(QelvoraCopy.text("report"), variant: .quiet) { session.open(reportDestination(message)) }
    }

    private func reportDestination(_ message: W3Message) -> String {
        "/support?creatorId=" + model.creatorId + (message.authorKind == .ai ? "&messageId=" + message.id : "")
    }
}
private struct W3Passage: Decodable, Identifiable, Sendable { let id: String; let title: String; let text: String }

private struct W3FirstConversation: View {
    let baseURL: URL; let handle: String; let accountId: String
    let originalSessionId: String?; let destination: String
    @ObservedObject var session: FanSession
    @State private var creator: GrowthCreator?; @State private var caps: W3Capabilities?; @State private var failure = ""; @State private var busy = false
    @State private var key = UUID().uuidString.lowercased()
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var postContext: APIGrowthPostEntryContextResponseContext?
    @State private var contextSessionId: String?
    @State private var contextDestination = ""
    @State private var contextFailure = ""
    private var contextPending: Bool {
        URLComponents(string: session.destination)?.queryItems?.contains { $0.name == "context" } == true
    }
    private var visiblePostContext: APIGrowthPostEntryContextResponseContext? {
        guard scenePhase == .active, !session.checkingSession,
              session.session?.accountId == accountId,
              contextSessionId == session.session?.sessionId,
              contextDestination == session.destination,
              postContext?.creatorId == creator?.id else { return nil }
        return postContext
    }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    HStack {
                        SwiftUI.Button { session.back() } label: {
                            QelvoraGlyph(name: "back", size: 22, color: qColor("ink", scheme))
                                .frame(width: 44, height: 44)
                        }.buttonStyle(.plain).accessibilityLabel(QelvoraCopy.text("back"))
                        Spacer()
                        Text(QelvoraCopy.text("native1OF1")).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        AuthorLabel(kind: .ai, name: creator?.name ?? QelvoraCopy.text("nativeTheCreator"))
                        Text(QelvoraCopy.text("nativeBeforeYourFirstMessage")).qText("display-lg")
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        disclosureSection(QelvoraCopy.text("nativeWHORUNSIT")) {
                            if let policy = caps?.providers {
                                if !policy.verified { Notice(title: QelvoraCopy.text("conversationDevelopmentPolicyTitle"), children: QelvoraCopy.text("conversationDevelopmentPolicyNotice")) }
                                // The fixed consent sentence is a promise: only for a verified policy whose
                                // every provider keeps and trains on nothing. Otherwise each provider's own line.
                                let promise = policy.verified && policy.providers.allSatisfy { $0.noTraining && $0.noRetention }
                                let providers = policy.providers.map(\.name).joined(separator: ", ")
                                Text(promise ? QelvoraCopy.text("processorConsent", values: ["name": creator?.name ?? QelvoraCopy.text("nativeTheCreator"), "providers": providers]) : QelvoraCopy.text("nativeThisAIIsPoweredByProviders", values: ["providers": providers])).qText("body")
                                ForEach(policy.providers, id: \.name) { provider in
                                    if let url = URL(string: provider.termsUrl) {
                                        Link(QelvoraCopy.text("nativeProviderProcessingTerms", values: ["provider": provider.name]), destination: url)
                                            .qText("body").frame(minHeight: 44, alignment: .leading)
                                    }
                                    if !promise { Text((provider.noTraining ? QelvoraCopy.text("nativeDoesntTrainOnYourMessages") : QelvoraCopy.text("nativeReviewMessageUseInTheseTerms")) + " " + (provider.noRetention ? QelvoraCopy.text("nativeDoesntKeepYourMessages") : QelvoraCopy.text("nativeReviewMessageRetentionInThese"))).qText("caption") }
                                }
                            } else { Text(QelvoraCopy.text("nativeAIProvidersAndTheirVerifiedProcessing")).qText("body") }
                        }
                        qColor("line", scheme).frame(height: QelvoraTokens.token("hairline"))
                        disclosureSection(QelvoraCopy.text("nativeWHOCANREADIT")) {
                            Text(caps?.accessDisclosure ?? QelvoraCopy.text("conversationAccess")).qText("body")
                        }
                        qColor("line", scheme).frame(height: QelvoraTokens.token("hairline"))
                        disclosureSection(QelvoraCopy.text("nativeWHATITREMEMBERS")) {
                            Text(QelvoraCopy.text("nativeOnlyWhatYouAgreeToIt")).qText("body")
                        }
                    }.background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
                        .clipShape(RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg))
                        .overlay(RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg).stroke(qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")))
                    if !failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativeConversationUnavailable"), children: failure) }
                    if contextPending {
                        if let post = visiblePostContext {
                            ContextCard(source: QelvoraCopy.text("growthFromAPost"), title: post.title, onRemove: { session.open("/creators/" + handle + "/chat") })
                        }
                        Notice(title: QelvoraCopy.text("nativePostContextUnavailable"), children: contextFailure.isEmpty ? QelvoraCopy.text("nativeThisPostsConversationContext") : contextFailure)
                        Button(QelvoraCopy.text("removeContext"), variant: .quiet, block: true) { session.open("/creators/" + handle + "/chat") }
                    }
                    Spacer(minLength: 0)
                    VStack(spacing: 10) {
                        Button(QelvoraCopy.text("nativeStartWithNamesAI", values: ["name": creator?.name ?? QelvoraCopy.text("nativeTheCreator")]), variant: .ai, size: .lg, block: true, disabled: busy || scenePhase != .active || session.checkingSession || session.session?.sessionId != originalSessionId || session.destination != destination || creator == nil || contextPending || caps?.generationAvailable != true || caps?.consentAvailable != true) { Task { await begin() } }
                        Button(QelvoraCopy.text("nativeNotNow"), variant: .quiet, block: true) { session.back() }
                    }
                }.frame(maxWidth: .infinity, minHeight: max(0, geometry.size.height - 52), alignment: .topLeading)
                    .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 36)
                    .frame(maxWidth: 390)
            }.frame(maxWidth: .infinity).background(qColor("ground", scheme))
        }.task {
            struct Page: Decodable { let creator: GrowthCreator }
            do { let page: Page = try await GrowthClient(baseURL: baseURL, token: { nil }).request("public/creators/" + handle); creator = page.creator }
            catch { failure = QelvoraCopy.text("nativeThisCreatorOrTheConversation") }
            // Someone who already talks with this creator's AI goes straight to that
            // conversation: a Note or reaction notice, and "Message {name}'s AI", link
            // here. A link with a post's context keeps this screen, which carries it.
            if let creator, !contextPending, session.session?.accountId == accountId,
               let fanId = await existingThread(creator.id), session.destination == destination {
                session.replace("/threads/" + creator.id + "/" + fanId)
                return
            }
            do { caps = try await W3ConversationClient(baseURL: baseURL).request("capabilities", publicRead: true) }
            catch { failure = QelvoraCopy.text("nativeThisCreatorOrTheConversation") }
        }.task(id: session.destination + "|" + (session.session?.sessionId ?? "") + "|" + String(scenePhase == .active)) {
            postContext = nil; contextFailure = ""
            guard scenePhase == .active, contextPending else { return }
            while !Task.isCancelled {
                await readPostContext()
                do { try await Task.sleep(for: .seconds(4)) } catch { return }
            }
        }
    }
    private func readPostContext() async {
        postContext = nil; contextFailure = ""
        let target = session.destination
        guard ApplicationDestination.isPermitted(target),
              let items = URLComponents(string: target)?.queryItems,
              items.count == 1, items[0].name == "context",
              let raw = items[0].value, let id = UUID(uuidString: raw),
              let capture = await session.captureRequest(from: target, maximumResponseBytes: 8192, timeoutSeconds: 5),
              capture.expectedAccountId == accountId else {
            contextFailure = QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain"); return
        }
        do {
            guard await capture.isCurrent() else { return }
            let page = try await capture.client.readPostEntryContext(handle: handle, id: id.uuidString.lowercased(), xQelvoraExpectedAccount: capture.expectedAccountId)
            let post = page.context
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent(),
                  UUID(uuidString: post.creatorId) != nil,
                  UUID(uuidString: post.contentId) == id,
                  post.version > 0, post.version <= 2147483647, post.title.utf16.count <= 180,
                  post.destination == "/creators/" + handle + "/posts/" + id.uuidString.lowercased() else { return }
            contextSessionId = capture.sessionId; contextDestination = capture.destination; postContext = post
        } catch {
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent() else { return }
            contextFailure = QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain")
        }
    }
    private func disclosureSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
    }
    /// The fan's conversation with this creator, if any (every page of the account's threads).
    private func existingThread(_ creatorId: String) async -> String? {
        struct Thread: Decodable, Sendable { let creatorId: String; let fanId: String }
        struct Account: Decodable, Sendable { let threads: [Thread]; let nextCursor: String? }
        let client = W3ConversationClient(baseURL: baseURL, expectedAccountId: accountId)
        var cursor: String?
        for _ in 0..<20 {
            guard let page: Account = try? await client.request("account" + (cursor.map { "?cursor=" + $0 } ?? "")) else { return nil }
            if let match = page.threads.first(where: { $0.creatorId == creatorId }) { return match.fanId }
            cursor = page.nextCursor
            if cursor == nil { return nil }
        }
        return nil
    }
    private func begin() async {
        guard !busy, !contextPending, scenePhase == .active,
              caps?.generationAvailable == true, caps?.consentAvailable == true,
              let creator, let policy = caps?.providers,
              let capture = await session.captureRequest(from: destination, maximumResponseBytes: 1_000_000, timeoutSeconds: 15),
              capture.expectedAccountId == accountId, capture.sessionId == originalSessionId,
              await capture.isCurrent(), scenePhase == .active,
              session.destination == destination else { return }
        busy = true; defer { busy = false }
        do {
            let page = try await capture.client.beginConversation(
                xExpectedAccountId: capture.expectedAccountId, xExpectedSessionId: capture.sessionId,
                body: APIConversationBeginConversation(creatorId: creator.id, policyVersion: policy.version, accessNoticeAccepted: .init(), idempotencyKey: key))
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent(),
                  page.creatorId == creator.id, UUID(uuidString: page.fanId) != nil else { return }
            session.replace("/threads/" + page.creatorId + "/" + page.fanId)
        } catch {
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent() else { return }
            failure = QelvoraCopy.text("nativeReconnectToTryAgainNoMessage")
        }
    }
}

private struct W3PrivacyScreen: View {
    let client: W3ConversationClient; let root: String; @ObservedObject var session: FanSession
    var onBack: (() -> Void)? = nil
    @State private var memory: W3MemoryView?; @State private var audit: [W3Audit]?; @State private var caps: W3Capabilities?; @State private var page: W3Page?
    @State private var usage: W3Usage?
    @State private var comparisonsOff = false
    @State private var failure = ""; @State private var busy = false; @State private var editing: String?; @State private var text = ""
    @State private var provenance: W3Message?
    @State private var revision = 0
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    private var name: String { page?.creatorName ?? QelvoraCopy.text("nativeThisCreator") }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 28) {
            if let onBack { Button(QelvoraCopy.text("back"), variant: .quiet, action: onBack) }
            Text(QelvoraCopy.text("nativeMeAndPrivacy")).qText("title")
            if !failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativePrivacyStatus"), children: failure); Button(QelvoraCopy.text("nativeTryAgain"), variant: .secondary, disabled: busy) { Task { await refresh() } } }
            Text(QelvoraCopy.text("nativeWhatNamesAIRemembers", values: ["name": name])).qText("display-md")
            if memory == nil { Text(failure.isEmpty ? QelvoraCopy.text("nativeLoadingYourMemories") : QelvoraCopy.text("nativeMemoriesUnavailable")).qText("body") }
            if memory?.items.isEmpty == true { Text(QelvoraCopy.text("nativeNoMemoriesTheAIAsksBefore")).qText("body") }
            ForEach(memory?.items ?? []) { item in VStack(alignment: .leading, spacing: 12) {
                Text(item.state == "proposed" ? QelvoraCopy.text("sensitiveMemory") : item.kind == "open_loop" ? (item.state == "resolved" ? QelvoraCopy.text("nativeResolvedOpenLoop") : QelvoraCopy.text("nativeOpenLoop")) : item.kind == "summary" ? QelvoraCopy.text("summary") : QelvoraCopy.text("nativeRemembered")).qText("data-sm")
                if editing == item.id { TextField(QelvoraCopy.text("nativeWhatYouWantRemembered"), text: $text, axis: .vertical).qText("body"); Button(QelvoraCopy.text("nativeSaveProposal"), variant: .secondary, disabled: busy || text.isEmpty) { Task { await decide(item, "edit") } } }
                else { Text(item.text).qText("body").textSelection(.enabled) }
                if item.sensitiveCategory != nil { Text(QelvoraCopy.text("nativeSensitiveItemAgreeingApplies")).qText("caption") }
                HStack { if item.state == "proposed" { Button(QelvoraCopy.text("remember"), variant: .secondary, disabled: busy || memory?.offTheRecord == true) { Task { await decide(item, "accept") } } }; Button(QelvoraCopy.text("edit"), variant: .quiet, disabled: busy) { editing = item.id; text = item.text }; Button(item.state == "proposed" ? QelvoraCopy.text("nativeDontRemember") : QelvoraCopy.text("nativeDelete"), variant: .quiet, disabled: busy) { Task { await decide(item, "delete") } } }
                if item.kind == "open_loop" && item.state == "remembered" { Button(QelvoraCopy.text("nativeResolved"), variant: .quiet, disabled: busy) { Task { await decide(item, "resolve") } } }
                Button(QelvoraCopy.text("nativeViewWhereThisCameFrom"), variant: .quiet) { Task { await source(item) } }
            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusLg)) }
            Text(QelvoraCopy.text("nativeTheCreatorAndTheirTeamCan")).qText("caption")
            Text(QelvoraCopy.text("nativeWhoOpenedYourConversations")).qText("display-md")
            ForEach(audit ?? []) { entry in VStack(alignment: .leading) { Text(entry.role == "creator" ? QelvoraCopy.text("nativeNamesAccount", values: ["name": name]) : entry.role == "ops" ? QelvoraCopy.text("nativeAuthorizedSafetyAccount") : QelvoraCopy.text("nativeAuthorizedTeamRole", values: ["role": entry.role])).qText("label"); Text(QelvoraCopy.text("nativeAccountId", values: ["id": entry.readerAccountId])).qText("caption"); Text(entry.readAt).qText("data-sm") } }
            if let audit { if audit.isEmpty { Text(QelvoraCopy.text("nativeNoLoggedOpenings")).qText("body") } }
            else { Text(failure.isEmpty ? QelvoraCopy.text("nativeLoadingOpeningHistory") : QelvoraCopy.text("nativeOpeningHistoryUnavailable")).qText("body") }
            Text(QelvoraCopy.text("nativeThisShowsWhenAnAuthorizedAccount")).qText("caption")
            Text(QelvoraCopy.text("nativeOffTheRecord")).qText("display-md")
            Toggle(QelvoraCopy.text("nativeKeepThisConversationOffTheRecord"), isOn: Binding(get: { memory?.offTheRecord ?? false }, set: { value in Task { await preferences(offTheRecord: value, introShared: memory?.introShared ?? false) } })).disabled(busy || memory == nil)
            Text(QelvoraCopy.text("nativeTheAIKeepsNoMemoryFrom")).qText("caption")
            Toggle(QelvoraCopy.text("nativeShareMyIntroWithThisCreators"), isOn: Binding(get: { memory?.introShared ?? false }, set: { value in Task { await preferences(offTheRecord: memory?.offTheRecord ?? false, introShared: value) } })).disabled(busy || memory == nil)
            Text(QelvoraCopy.text("nativeTimeWithThisCreatorsAI")).qText("display-md")
            if usage == nil { Text(failure.isEmpty ? QelvoraCopy.text("nativeLoadingTimeHistory") : QelvoraCopy.text("nativeTimeHistoryUnavailable")).qText("body") }
            if let usage {
                Text(QelvoraCopy.text("nativeMeasurementDaysAreShownInUTC", values: ["measurement": usage.measurement])).qText("caption")
                Text(QelvoraCopy.text("nativeThisWeekMinutesMinutes", values: ["minutes": String(Int(usage.days.reduce(0) { $0 + $1.seconds } / 60))])).qText("body")
                ForEach(usage.days, id: \.day) { day in HStack { Text(day.day).qText("data-sm"); Spacer(); Text(QelvoraCopy.text("nativeMinutesMinutes", values: ["minutes": String(Int(day.seconds / 60))])).qText("body") } }
                if !usage.modeAvailable { Text(QelvoraCopy.text("nativeCompanionModeTimeSignalsAwait")).qText("caption") }
            }
            // While comparisons are off (2026-10-08) the section is absent, with no placeholder.
            if caps?.comparisonsAvailable == true && !comparisonsOff {
                Text(QelvoraCopy.text("nativeAIComparisons")).qText("display-md")
                W3ComparisonChoice(client: client, root: root) { comparisonsOff = true }
            }
            Text(QelvoraCopy.text("nativeAIProviders")).qText("display-md")
            if caps?.providers?.verified == false { Notice(title: QelvoraCopy.text("conversationDevelopmentPolicyTitle"), children: QelvoraCopy.text("conversationDevelopmentPolicyNotice")) }
            if caps?.providers == nil { Text(QelvoraCopy.text("nativeAIProviderConsentIsUnavailable")).qText("body") }
            ForEach(caps?.providers?.providers ?? [], id: \.name) { provider in if let url = URL(string: provider.termsUrl) { Link(QelvoraCopy.text("nativeProviderProcessingTerms", values: ["provider": provider.name]), destination: url) } }
            if let policy = caps?.providers { Button(page?.consentCurrent == true ? QelvoraCopy.text("nativeWithdrawAIProviderConsent") : QelvoraCopy.text("nativeAgreeToTheseAIProviders"), variant: .secondary, disabled: busy || (page?.consentCurrent != true && caps?.consentAvailable != true)) { Task { await consent(policy) } } }
            Button(QelvoraCopy.text("nativeExportOrDeleteMyData"), variant: .secondary, block: true) { session.open("/support/privacy") }
            Button(QelvoraCopy.text("nativeHelpAndSafety"), variant: .quiet) { session.open("/support") }
        }.padding(16) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task(id: "\(root)-\(scenePhase)") { if scenePhase == .active { await refresh() } else { conceal() } }
            .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
            .onDisappear { conceal() }
            .refreshable { await refresh() }
            .sheet(item: $provenance) { message in ScrollView { VStack(alignment: .leading, spacing: 16) { Text(QelvoraCopy.text("nativeWhereThisCameFrom")).qText("title"); Text(message.authorLabel(name:name)).qText("label"); Text(message.text).qText("body").textSelection(.enabled); Text(message.createdAt).qText("data-sm") }.padding(16) } }
    }
    private func conceal() {
        revision += 1; memory = nil; audit = nil; caps = nil; page = nil; usage = nil; provenance = nil; busy = false; comparisonsOff = false
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
        } catch { if current(ticket) { failed(error, fallback: QelvoraCopy.text("nativeReconnectToRefreshYourPrivacy")) } }
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
        } catch { if current(ticket) { failed(error, fallback: QelvoraCopy.text("nativeThisSourceMessageIsUnavailable")) } }
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
        await change({ let _: W3MemoryView = try await client.request(root + "/memory/" + item.id, body: JSONEncoder().encode(W3Decision(expectedRevision: memory.revision, action: action, text: action == "edit" ? text : nil))) }, fallback: QelvoraCopy.text("nativeThisChangeCouldNotBeSaved"))
    }
    private func preferences(offTheRecord: Bool, introShared: Bool) async {
        guard let memory else { return }
        await change({ let _: W3Page = try await client.request(root + "/preferences", body: JSONEncoder().encode(W3Preferences(offTheRecord: offTheRecord, introShared: introShared, expectedRevision: memory.revision))) }, fallback: QelvoraCopy.text("nativeThisChangeCouldNotBeSaved"))
    }
    private func consent(_ policy: W3Policy) async {
        await change({ let _: W3Page = try await client.request(root + "/consent", body: JSONEncoder().encode(W3Consent(version: policy.version, accepted: page?.consentCurrent != true))) }, fallback: QelvoraCopy.text("nativeConsentCouldNotBeSaved"))
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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(account.map { "@" + $0.fan.handle } ?? QelvoraCopy.text("nativeYou")).qText("display-lg")
                        Text(session.session?.mode == .development ? QelvoraCopy.text("nativeSyntheticLocalAccountDevelopment") : QelvoraCopy.text("nativeSignedInWithPantopus"))
                            .qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                    }
                    if !failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativeAccountUnavailable"), children: failure) }
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 12) {
                            accountMetric(QelvoraCopy.text("nativeTHISMONTH"), value: monthAmount, detail: limitDescription)
                            accountMetric(QelvoraCopy.text("nativeMEMBERSHIPS"), value: commerce.map { String($0.memberships.count) } ?? "—", detail: commerce == nil ? QelvoraCopy.text("nativeCurrentlyUnavailable") : QelvoraCopy.text("nativeSavedMemberships"))
                        }
                    } else { HStack(alignment: .top, spacing: 12) {
                        accountMetric(QelvoraCopy.text("nativeTHISMONTH"), value: monthAmount, detail: limitDescription)
                        accountMetric(QelvoraCopy.text("nativeMEMBERSHIPS"), value: commerce.map { String($0.memberships.count) } ?? "—", detail: commerce == nil ? QelvoraCopy.text("nativeCurrentlyUnavailable") : QelvoraCopy.text("nativeSavedMemberships"))
                    } }
                    accountPanel {
                        accountRow(QelvoraCopy.text("nativeMeAndPrivacy"), detail: QelvoraCopy.text("nativeMemoriesWhoOpenedYourConversations")) { proxy.scrollTo("account-privacy", anchor: .top) }
                        accountDivider
                        accountRow(QelvoraCopy.text("nativeSpendingAndTime"), detail: QelvoraCopy.text("nativeYourLimitReceiptsTimeWithEach")) { session.open("/commerce/spending") }
                        accountDivider
                        accountRow(QelvoraCopy.text("nativeMemberships"), detail: QelvoraCopy.text("nativeManageYourMemberships")) { session.open("/commerce/membership") }
                        accountDivider
                        accountRow(QelvoraCopy.text("growthNotifications"), detail: QelvoraCopy.text("nativePushAndEmailPerCreatorQuiet")) { session.open("/notifications/settings") }
                        accountDivider
                        accountRow(QelvoraCopy.text("nativeReceipts"), detail: QelvoraCopy.text("nativeYourPurchasesAndDeliveries")) { session.open("/commerce/requests") }
                        accountDivider
                        accountRow(QelvoraCopy.text("nativeHelpAndSafety"), detail: QelvoraCopy.text("nativeReportBlockCrisisSupport")) { session.open("/support") }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(QelvoraCopy.text("nativeYourIntro")).qText("title")
                        Text(account.map { $0.fan.intro ?? QelvoraCopy.text("nativeYouHaventAddedAnIntroYet") } ?? (failure.isEmpty ? QelvoraCopy.text("nativeLoadingYourAccount") : QelvoraCopy.text("nativeYourIntroIsUnavailable"))).qText("body")
                        Button(QelvoraCopy.text("nativeEditHandleAndIntro"), variant: .quiet) { session.open("/identity/account") }
                    }
                    VStack(alignment: .leading, spacing: 16) {
                        Text(QelvoraCopy.text("nativeMeAndPrivacy")).qText("display-md")
                        Text(QelvoraCopy.text("conversationAccess")).qText("caption")
                        Text(QelvoraCopy.text("nativeMemoryAndConversationAccessBy")).qText("body")
                        if let account, account.threads.isEmpty { Text(QelvoraCopy.text("nativeNoConversationsYet")).qText("body") }
                        ForEach(account?.threads ?? []) { thread in
                            accountPanel {
                                accountRow(thread.name, detail: QelvoraCopy.text("nativeOpenConversation")) { session.open("/threads/" + thread.creatorId + "/" + thread.fanId) }
                                accountDivider
                                accountRow(QelvoraCopy.text("nativeMemoryAndAccess"), detail: thread.name) { session.open("/you?creatorId=" + thread.creatorId + "&fanId=" + thread.fanId) }
                            }
                        }
                        if loading { Text(QelvoraCopy.text("nativeLoadingYourConversations")).qText("caption") }
                        if let next = account?.nextCursor { Button(QelvoraCopy.text("nativeMoreConversations"), variant: .quiet, disabled: loading || !failure.isEmpty) { Task { await refresh(before: next) } } }
                        if cursor != nil { Button(QelvoraCopy.text("nativeBackToFirstPage"), variant: .quiet, disabled: loading) { Task { await refresh() } } }
                        if !failure.isEmpty { Button(QelvoraCopy.text("nativeTryAgain"), variant: .quiet, disabled: loading) { Task { await refresh(before: cursor) } } }
                        Button(QelvoraCopy.text("nativeExportOrDeleteMyData"), variant: .secondary, block: true) { session.open("/support/privacy") }
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
        guard let commerce else { return QelvoraCopy.text("nativeCurrentlyUnavailable") }
        guard let limit = commerce.limits.first(where: { $0.currency == commerce.policy.currency }) else { return QelvoraCopy.text("nativeChooseYourLimit") }
        if limit.explicit_none { return QelvoraCopy.text("noLimit") }
        guard let amount = limit.amount.flatMap(Int64.init) else { return QelvoraCopy.text("nativeLimitUnavailable") }
        return QelvoraCopy.text("nativeOfYourAmountLimit", values: ["amount": CommerceAmount.display(amount, limit.currency)])
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
            }.padding(.horizontal, 16).padding(.vertical, 7).frame(minHeight: 56)
                .contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityElement(children: .combine)
    }
    private func conceal() {
        revision += 1; account = nil; commerce = nil; loading = false
    }
    private func refresh(before: String? = nil) async {
        conceal()
        guard scenePhase == .active, let originalSessionId = session.session?.sessionId else { return }
        let originalDestination = session.destination
        let commerceClient = CommerceClient(model: session, accountId: accountId, sessionId: originalSessionId, destination: originalDestination)
        let currentRevision = revision
        loading = true; cursor = before; failure = ""
        defer { if revision == currentRevision { loading = false } }
        do {
            let fresh: W3Account = try await W3ConversationClient(baseURL:baseURL, expectedAccountId: accountId).request("account" + (before.map { "?cursor=" + $0 } ?? ""))
            guard !Task.isCancelled, revision == currentRevision, scenePhase == .active, session.session?.accountId == accountId, session.session?.sessionId == originalSessionId, session.destination == originalDestination else { return }
            account = fresh; cursor = before
            let overview: CommerceOverview? = try? await commerceClient.request("overview")
            guard !Task.isCancelled, revision == currentRevision, scenePhase == .active, session.session?.accountId == accountId, session.session?.sessionId == originalSessionId, session.destination == originalDestination else { return }
            if let overview, overview.fan?.id == fresh.fan.id { commerce = overview }
        } catch {
            if !Task.isCancelled, revision == currentRevision, scenePhase == .active { failure = (error as? W3Failure)?.message ?? QelvoraCopy.text("nativeReconnectToOpenYou") }
        }
    }
}
