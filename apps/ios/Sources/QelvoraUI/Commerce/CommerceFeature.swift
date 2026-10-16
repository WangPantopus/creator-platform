import SwiftUI

@MainActor
public enum CommerceFanFeature {
    public static func registration(baseURL: URL?, storeProductIDs: [String] = []) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: { destination in let path = destination.components(separatedBy: "?")[0]; return path == "/requests" || (["requests","spending","access","packet","checkout","status","pass","membership"].contains(path.split(separator: "/").last.map(String.init) ?? "") && path.hasPrefix("/commerce/")) || (path.hasPrefix("/creators/") && path.hasSuffix("/access")) }, screen: { session in AnyView(CommerceFeature(baseURL: baseURL, session: session, accountId: session.session?.accountId, sessionId: session.session?.sessionId, destination: session.destination, storeProductIDs: storeProductIDs).id([session.session?.accountId ?? "signed-out", session.session?.sessionId ?? "no-session"])) })
    }
}

@MainActor
struct CommerceFeature: View {
    let baseURL: URL?; @ObservedObject var session: FanSession
    let accountId: String?
    let sessionId: String?
    let destination: String
    var storeProductIDs: [String] = []
    @State private var overview: CommerceOverview?; @State private var detail: CommerceDetail?
    @State private var screen = "requests"; @State private var category = QelvoraCopy.text("nativeOpen"); @State private var creator = ""
    // Back leaves a step opened inside this screen first, then goes back through where the person came from.
    @State private var arrivalScreen = "requests"; @State private var backStep = UUID()
    @State private var amount = ""; @State private var choice = ""; @State private var reminders = false
    @State private var summary = ""; @State private var info = ""; @State private var selectedMode: String?
    @State private var includeSummary = true; @State private var includeMessages: [IncludeItem] = []
    @State private var visibility: String? = "private"; @State private var busy = false; @State private var failure = ""
    @State private var selectedPassCreators: Set<String> = []; @State private var replacementCreator = ""
    @State private var notice = ""; @State private var keys: [String: String] = [:]
    @State private var accessSnapshot: CommerceAccess?; @State private var accessReceivedAt: Date?
    @State private var accessNow = Date(); @State private var limitVersion: Int?
    @State private var commerceAvailable = false; @State private var arrived = false
    @State private var commandInFlight = false
    @State private var disposed = false
    @State private var operation: Task<Void, Never>?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    private var api: CommerceClient? {
        guard baseURL != nil, let accountId, let sessionId else { return nil }
        return CommerceClient(model: session, accountId: accountId, sessionId: sessionId, destination: destination)
    }
    private var originalViewCurrent: Bool { !disposed && accountId != nil && sessionId != nil && session.session?.accountId == accountId && session.session?.sessionId == sessionId && session.destination == destination }
    private var privateVisible: Bool {
        originalViewCurrent &&
        !session.busy && session.error.isEmpty && !session.purgingPrivateState && !session.localPurgeFailed
    }
    private var privateReady: Bool { privateVisible && !session.checkingSession }
    private var refreshDisabled: Bool { busy || !originalViewCurrent || session.busy || session.checkingSession || session.purgingPrivateState || session.localPurgeFailed }
    private var commandDisabled: Bool { busy || !privateReady || !commerceAvailable }
    private var modes: [CommerceMode] { overview?.modes.filter { $0.creator_id == creator } ?? [] }
    private var creatorName: String { overview?.creators.first { $0.id == creator }?.display_name ?? QelvoraCopy.text("nativeTheCreator") }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    if screen != "requests" { Button(QelvoraCopy.text("back"), variant: .quiet) {
                        if screen != arrivalScreen { screen = arrivalScreen; detail = nil }
                        else { session.back() }
                    } }
                    Spacer(); Text(title.uppercased()).qText("data-sm"); Spacer()
                    Button(QelvoraCopy.text("nativeRefresh"), variant: .quiet, disabled: refreshDisabled) { launch(requireReady: false) { await retry() } }
                }
                if !privateVisible { Notice(title: QelvoraCopy.text("nativeAccountStatus"), children: QelvoraCopy.text("nativeReconnectToCheckYourAccountYour")) }
                if privateVisible && !failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("nativeConnectionStatus"), children: failure) }
                if privateVisible && !notice.isEmpty { Notice(title: QelvoraCopy.text("nativeSaved"), children: notice) }
                if privateVisible, let overview {
                    switch screen {
                    case "spending": spending(overview)
                    case "access": access(overview)
                    case "packet": packet(overview)
                    case "status": if let detail { status(detail) } else { EmptyState(title: QelvoraCopy.text("nativeRequestUnavailable"), body: QelvoraCopy.text("nativeRefreshTheRequestFromYourAccount")) }
                    case "checkout": EmptyState(title: QelvoraCopy.text("nativePaymentUnavailable"), body: QelvoraCopy.text("nativePaidWrittenAndVoiceRequestsAreUnavailable"))
                    case "membership": membership(overview)
                    case "pass": pass(overview)
                    default: requests(overview)
                    }
                } else if privateReady && busy { ProgressView().accessibilityLabel(QelvoraCopy.text("nativeLoadingCommerce")) }
                else if privateReady { EmptyState(title: QelvoraCopy.text("nativeThisInformationIsUnavailable"), body: failure.isEmpty ? QelvoraCopy.text("nativeCommerceIsNotConnectedYetReconnect") : failure) }
            }.padding(.horizontal, screen == "packet" ? 20 : 16).padding(.top, 20).padding(.bottom, 36)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task(id: privateReady) { if privateReady { if !arrived { arrived = true; await arrive() } else { await refresh() } } }
            .task(id: "\(screen):\(creator):\(overview?.fan?.id ?? ""):\(scenePhase):\(privateReady)") { await refreshAccess() }
            .task(id: screen) {
                while screen == "access", !Task.isCancelled {
                    accessNow = Date()
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                }
            }
            .refreshable { await retry() }
            .onChange(of: session.session?.sessionId) { _, value in if value != sessionId { operation?.cancel(); clearPrivateState() } }
            .onChange(of: session.session?.accountId) { _, value in if value != accountId { operation?.cancel(); clearPrivateState() } }
            .onAppear { disposed = false }
            .onChange(of: privateReady) { _, value in if !value { operation?.cancel() } }
            .onChange(of: screen) { _, value in
                if value != arrivalScreen { session.holdBack(backStep) { screen = arrivalScreen; detail = nil } } else { session.releaseBack(backStep) }
            }
            .onDisappear { session.releaseBack(backStep); disposed = true; operation?.cancel(); clearPrivateState() }
    }
    private var title: String { ["spending":QelvoraCopy.text("nativeSpendingAndTime"), "access":QelvoraCopy.text("navAccess"), "packet":QelvoraCopy.text("includedInRequest"), "status":QelvoraCopy.text("nativeYourRequest"), "membership":QelvoraCopy.text("nativeManageMembership"), "pass":QelvoraCopy.text("nativeYourPass")][screen] ?? QelvoraCopy.text("navRequests") }
    private func arrive() async {
        let parts = URLComponents(string: destination)
        let path = parts?.path ?? "/requests"
        arrivalScreen = path.hasPrefix("/commerce/") ? String(path.split(separator: "/").last ?? "requests") : path.hasSuffix("/access") ? "access" : "requests"
        screen = arrivalScreen
        await refresh()
        guard !Task.isCancelled, privateReady else { return }
        if let selected = parts?.queryItems?.first(where: { $0.name == "creatorId" })?.value { creator = selected }
        else if path.hasPrefix("/creators/"), let handle = path.split(separator: "/").dropFirst().first { creator = overview?.creators.first(where: { $0.handle == handle })?.id ?? creator }
        if screen == "status", let id = parts?.queryItems?.first(where: { $0.name == "packetId" })?.value, let api {
            do { let value: CommerceDetail = try await api.request("packets/" + id); guard !Task.isCancelled, privateReady else { return }; detail = value } catch { await report(error) }
        }
    }
    private func retry() async {
        guard !refreshDisabled else { return }
        if !privateReady { await session.refresh() }
        guard !Task.isCancelled, privateReady else { return }
        await refresh()
    }
    private func refresh(allowBusy: Bool = false) async {
        guard privateReady, !busy || allowBusy, let api else { return }; busy = true; defer { busy = false }
        do {
            let accountId = session.session?.accountId
            let value: CommerceOverview = try await api.request("overview"); guard !Task.isCancelled, privateReady, accountId == session.session?.accountId else { return }; overview = value; failure = ""; commerceAvailable = true
            if let limit = value.limits.first(where: { $0.currency == value.policy.currency }), limit.version != limitVersion {
                let pending = limit.effective_at != nil
                let none = pending ? limit.pending_none == true : limit.explicit_none
                choice = none ? "none" : "amount"
                amount = (pending ? limit.pending_amount : limit.amount).flatMap(Int64.init).map { CommerceAmount.input($0, limit.currency) } ?? ""
                reminders = limit.reminders_on; limitVersion = limit.version
            }
            if creator.isEmpty { creator = value.creators.first?.id ?? "" }
            if let packet = detail?.packet { let value: CommerceDetail = try await api.request("packets/" + packet.id); guard !Task.isCancelled, privateReady else { return }; detail = value }
        } catch { await report(error) }
    }
    private func refreshAccess() async {
        accessSnapshot = nil; accessReceivedAt = nil
        guard privateReady, screen == "access", scenePhase == .active, !creator.isEmpty, let fanId = overview?.fan?.id, let api else { return }
        let creatorId = creator; let accountId = session.session?.accountId
        while !Task.isCancelled {
            let checkedAt = Date()
            do {
                let value: CommerceAccess = try await api.request("creators/\(creatorId)/fans/\(fanId)/access")
                guard !Task.isCancelled, privateReady, creator == creatorId, session.session?.accountId == accountId, value.creatorId == creatorId, value.fanId == fanId else { return }
                accessSnapshot = value; accessReceivedAt = checkedAt; accessNow = Date()
            } catch {
                guard !Task.isCancelled, session.session?.accountId == accountId else { return }
                accessSnapshot = nil; accessReceivedAt = nil
            }
            do { try await Task.sleep(for: .seconds(4)) } catch { return }
        }
    }
    private var currentAccess: CommerceAccess? {
        guard let value = accessSnapshot, value.creatorId == creator, value.fanId == overview?.fan?.id,
              let received = accessReceivedAt, accessNow.timeIntervalSince(received) < 5,
              value.validUntil.map({ (instant($0) ?? .distantPast) > accessNow }) ?? true else { return nil }
        return value
    }
    private var accessCan: String {
        guard let value = currentAccess else { return QelvoraCopy.text("nativeCurrentAccessIsUnavailableRefresh") }
        let lines = [value.capabilities.contains("ai_message") ? (value.allowance.available > 0 ? QelvoraCopy.text("nativeMessageThisAI") : QelvoraCopy.text("nativeYourAIAllowanceIsUsedFor")) : "", value.capabilities.contains("note") ? QelvoraCopy.text("nativeReadIncludedNotes") : "", value.capabilities.contains("request") ? QelvoraCopy.text("nativeRequestAvailableServices") : ""].filter { !$0.isEmpty }
        return lines.isEmpty ? QelvoraCopy.text("nativeReadYourExistingConversations") : lines.joined(separator: " ")
    }
    private var accessIncluded: String {
        guard let value = currentAccess else { return QelvoraCopy.text("nativeBenefitsCannotBeConfirmed") }
        let labels = ["membership":QelvoraCopy.text("nativeMembership"), "comp":QelvoraCopy.text("nativeGiftedAccess"), "commitment":QelvoraCopy.text("nativeAcceptedService"), "pass_slot":QelvoraCopy.text("nativePassAIReach"), "trial":QelvoraCopy.text("nativeConversationTrial")]
        let sources = Array(Set(value.sources.map { labels[$0.source] ?? QelvoraCopy.text("nativeCurrentAccess") })).sorted()
        return sources.isEmpty ? QelvoraCopy.text("nativeNoIncludedAccessForThisCreator") : sources.joined(separator: ", ")
    }
    private func report(_ error: Error) async {
        guard !Task.isCancelled, !(error is CancellationError), privateReady else { return }
        if let error = error as? CommerceFailure {
            failure = error.message
            if error.status >= 500 || error.status == 409 || error.status == 401 { commerceAvailable = false }
            if error.code == "session_account_changed" || error.code == "session_view_changed" { clearPrivateState(); await session.refresh() }
            else if error.status == 401 { overview = nil; detail = nil; await session.refresh() }
        } else { commerceAvailable = false; failure = QelvoraCopy.text("nativeReconnectToRefreshYourInputIs") }
    }
    private func clearPrivateState() {
        overview = nil; detail = nil; accessSnapshot = nil; accessReceivedAt = nil; commerceAvailable = false
        commandInFlight = false
        amount = ""; choice = ""; reminders = false; summary = ""; info = ""; selectedMode = nil
        selectedPassCreators = []; replacementCreator = ""; creator = ""; keys.removeAll(); notice = ""; failure = ""; limitVersion = nil
    }
    private func launch(requireReady: Bool = true, _ action: @escaping @MainActor () async -> Void) {
        guard operation == nil, requireReady ? privateReady : !refreshDisabled else { return }
        operation = Task { await action(); operation = nil }
    }
    private func mutate(_ path: String, values: [String: Any], message: String) async {
        guard !commandDisabled, let api else { return }; busy = true; commandInFlight = true; defer { busy = false; commandInFlight = false }
        do {
            var body = values
            let canonical = try JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
            let signature = path + String(decoding: canonical, as: UTF8.self)
            let key = keys[signature] ?? UUID().uuidString; keys[signature] = key; body["idempotencyKey"] = key
            struct Result: Decodable, Sendable {}
            let _: Result = try await api.request(path, body: JSONSerialization.data(withJSONObject: body))
            guard !Task.isCancelled, privateReady else { return }
            notice = message; failure = ""; await refresh(allowBusy: true)
        } catch { await report(error) }
    }
    private func requests(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(QelvoraCopy.text("navRequests")).qText("display-lg").accessibilityAddTraits(.isHeader)
            HStack { ForEach([QelvoraCopy.text("nativeOpen"), QelvoraCopy.text("nativeDelivered"), QelvoraCopy.text("nativeClosed")], id: \.self) { label in Button(label, variant: .quiet) { category = label }.accessibilityAddTraits(category == label ? .isSelected : []) } }
            let visible = data.packets.filter { requestCategory($0) == category }
            if visible.isEmpty { EmptyState(title: QelvoraCopy.text("nativeNoRequestsHere"), body: data.packets.isEmpty ? QelvoraCopy.text("nativeRequestsAppearAfterYouSendThem") : QelvoraCopy.text("nativeChooseAnotherCategoryToViewYour")) }
            ForEach(visible) { packet in
                RequestStatus(reqId: reqID(packet.id), mode: packet.snapshot.title, price: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency), outcome: outcome(packet))
                Button(QelvoraCopy.text("nativeViewRequest"), variant: .secondary, block: true) { launch { await open(packet) } }
            }
            Button(QelvoraCopy.text("nativeSpendingAndTime"), variant: .secondary, block: true) { screen = "spending" }
            Button(QelvoraCopy.text("nativeCreatorAccess"), variant: .secondary, block: true) { screen = "access" }
            Button(QelvoraCopy.text("nativeManageMembership"), variant: .quiet, block: true) { screen = "membership" }
            Button(QelvoraCopy.text("nativeYourPass"), variant: .quiet, block: true) { screen = "pass" }
        }
    }
    private func spending(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(QelvoraCopy.text("nativeSpendingAndTime")).qText("display-md").accessibilityAddTraits(.isHeader)
            Text(CommerceAmount.display(data.exposure?.captured ?? 0, data.policy.currency))
                .modifier(QelvoraTextStyle(style: .init(family: "mono", size: 44, lineHeight: 48, weight: 400, letterSpacing: 0)))
            Text(QelvoraCopy.text("nativeChargedThisUTCCalendarMonth")).qText("caption")
            if let month = data.exposure?.month { Text(QelvoraCopy.text("nativeMonthUTC", values: ["month": month])).qText("data-sm") }
            let limit = data.limits.first { $0.currency == data.policy.currency }
            panel {
                row(QelvoraCopy.text("nativeCurrentLimit"), limit.map { $0.explicit_none ? QelvoraCopy.text("noLimit") : CommerceAmount.display(Int64($0.amount ?? "0") ?? 0, $0.currency) } ?? QelvoraCopy.text("nativeChooseBeforeYourFirstPaidAction"))
                row(QelvoraCopy.text("nativeHeldNotCharged"), CommerceAmount.display(data.exposure?.held ?? 0, data.policy.currency))
                if let refunded = data.exposure?.refunded { row(QelvoraCopy.text("nativeRefundsRecorded"), CommerceAmount.display(refunded, data.policy.currency)) }
                if let effective = limit?.effective_at { Text(QelvoraCopy.text("nativeYourIncreaseTakesEffectDate", values: ["date": when(effective)])).qText("caption") }
            }
            VStack(alignment: .leading, spacing: 12) {
                Text(QelvoraCopy.text("nativeMonthlySpendingLimit")).qText("body-strong")
                HStack { Button(QelvoraCopy.text("nativeChooseAnAmount"), variant: .secondary) { choice = "amount" }; Button(QelvoraCopy.text("noLimit"), variant: .secondary) { choice = "none" } }
                if choice == "amount" { monthlyAmountField(data.policy.currency).padding(12).frame(minHeight: 48).background(qColor("surface", scheme)).accessibilityLabel(QelvoraCopy.text("nativeMonthlyAmountInCurrency", values: ["currency": data.policy.currency])) }
                Toggle(QelvoraCopy.text("nativeRemindMeAt50And100"), isOn: $reminders).qText("body")
                Text(QelvoraCopy.text("nativeIncreasesTake24HoursDecreases")).qText("caption")
                Button(commandInFlight ? QelvoraCopy.text("nativeSaving") : QelvoraCopy.text("nativeSaveLimit"), variant: .secondary, block: true, disabled: commandDisabled || choice.isEmpty) { launch {
                    do { let value = choice == "none" ? nil : try CommerceAmount.parse(amount, data.policy.currency); await mutate("spend-limit", values: ["currency": data.policy.currency, "amount": value.map { $0 as Any } ?? NSNull(), "explicitNone": choice == "none", "remindersOn": reminders], message: QelvoraCopy.text("nativeYourSpendingChoiceIsSaved")) } catch { await report(error) }
                } }
            }
            ForEach(data.spendingNotices) { notice in Text(QelvoraCopy.text("nativeYouveReachedThresholdOfYourMonthly", values: ["threshold": String(notice.threshold)])).qText("body") }
            Notice(title: QelvoraCopy.text("nativeAITime"), children: QelvoraCopy.text("nativeYourTimeSummaryIsUnavailable"))
        }
    }
    @ViewBuilder private func monthlyAmountField(_ currency: String) -> some View {
        #if os(iOS)
        TextField(QelvoraCopy.text("nativeAmountInCurrency", values: ["currency": currency]), text: $amount).keyboardType(.decimalPad)
        #else
        TextField(QelvoraCopy.text("nativeAmountInCurrency", values: ["currency": currency]), text: $amount)
        #endif
    }
    private func access(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(QelvoraCopy.text("navAccess")).qText("display-md").accessibilityAddTraits(.isHeader)
            Picker(QelvoraCopy.text("pickerCreator"), selection: $creator) { ForEach(data.creators) { Text($0.display_name).tag($0.id) } }.pickerStyle(.menu)
            let paid = data.memberships.filter { $0.creator_id == creator && ["active", "grace", "cancelled"].contains($0.state) && (instant($0.period_end) ?? .distantPast) > accessNow }
            let availableModes = modes.filter { $0.state == "offered" && $0.used + $0.reserved < $0.weekly_limit }
            let labels = ["pass_slot":QelvoraCopy.text("nativePassAIReach"), "trial":QelvoraCopy.text("nativeConversationTrial"), "comp":QelvoraCopy.text("nativeGiftedAccess"), "commitment":QelvoraCopy.text("nativeAcceptedService")]
            let changes = paid.map { QelvoraCopy.text($0.cancel_at_end || $0.state == "cancelled" ? "nativeNameEndsDate" : "nativeNameRenewsDate", values: ["name": $0.name, "date": when($0.period_end)]) } + (currentAccess?.sources.filter { $0.source != "membership" }.map { QelvoraCopy.text("nativeLabelEndsDate", values: ["label": labels[$0.source] ?? QelvoraCopy.text("navAccess"), "date": when($0.validUntil)]) } ?? [])
            AccessLines(can: accessCan, included: accessIncluded, byRequest: availableModes.isEmpty ? QelvoraCopy.text("nativeNoHumanModesAreCurrentlyAvailable") : availableModes.map(\.title).joined(separator: ", "), changes: changes.isEmpty ? QelvoraCopy.text("nativeAccessRefreshesFromTheServer") : changes.joined(separator: "; "), name: creatorName)
            ForEach(modes.filter { $0.state == "offered" }) { mode in
                panel { row(mode.title, mode.amount.flatMap(Int64.init).map { CommerceAmount.display($0, mode.currency) } ?? QelvoraCopy.text("nativePriceUnavailable")); Text(QelvoraCopy.text("nativeRemainingOfLimitLeftHoursH", values: ["remaining": String(max(0, mode.weekly_limit - mode.used - mode.reserved)), "limit": String(mode.weekly_limit), "hours": String(mode.delivery_hours)])).qText("caption") }
            }
            Button(QelvoraCopy.text("stepIn", values: ["name": creatorName]), variant: .secondary, block: true, disabled: availableModes.isEmpty) { screen = "packet" }
            Button(QelvoraCopy.text("nativeManageMembership"), variant: .quiet, block: true) { screen = "membership" }
        }
    }
    private func packet(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(QelvoraCopy.text("includedInRequest")).qText("display-md").accessibilityAddTraits(.isHeader)
            Text(QelvoraCopy.text("nativeChangeAnythingNothingIsSentUntil")).qText("body")
            IncludeList(name: creatorName, summaryBinding: $summary, itemsBinding: $includeMessages, summaryIncluded: $includeSummary)
            ModeList(modes: modes.map { mode in ModeItem(id: mode.id, title: mode.title, meta: QelvoraCopy.text("nativeHoursHRemainingLeft", values: ["hours": String(mode.delivery_hours), "remaining": String(max(0, mode.weekly_limit - mode.used - mode.reserved))]), price: mode.amount.flatMap(Int64.init).map { CommerceAmount.display($0, mode.currency) } ?? QelvoraCopy.text("nativePriceUnavailable"), selected: selectedMode == mode.id, disabled: mode.state != "offered" || mode.used + mode.reserved >= mode.weekly_limit) }, selection: $selectedMode)
            // WP 7.4 P9: the chosen mode's terms, as the web packet shows them; its
            // decision time is the deadline. The ETA line waits on lane 4's summary.
            if let mode = modes.first(where: { $0.id == selectedMode }) {
                TermsBlock(price: mode.amount.flatMap(Int64.init).map { CommerceAmount.display($0, mode.currency) } ?? QelvoraCopy.text("nativePriceUnavailable"), deadline: "\(mode.decision_hours) h", name: creatorName)
            }
            Notice(title: QelvoraCopy.text("nativePaymentUnavailable"), children: QelvoraCopy.text("nativePaidWrittenAndVoiceRequestsAre"))
            Button(QelvoraCopy.text("nativeSendRequest"), variant: .secondary, block: true, disabled: true) {}
        }
    }
    private func open(_ packet: CommercePacket) async {
        guard let api, !busy, privateReady else { return }; busy = true; defer { busy = false }
        do { let value: CommerceDetail = try await api.request("packets/" + packet.id); guard !Task.isCancelled, privateReady else { return }; detail = value; screen = "status"; failure = "" } catch { await report(error) }
    }
    private func status(_ detail: CommerceDetail) -> some View {
        let packet = detail.packet
        let name = overview?.creators.first { $0.id == packet.creator_id }?.display_name ?? QelvoraCopy.text("nativeTheCreator")
        let refund = detail.ledger.filter { $0.kind == "refund" && $0.currency == packet.snapshot.currency }.compactMap { Int64($0.amount) }.reduce(0, +)
        return VStack(alignment: .leading, spacing: 24) {
            Text(packet.snapshot.title).qText("display-md").accessibilityAddTraits(.isHeader)
            RequestStatus(reqId: reqID(packet.id), mode: packet.snapshot.title, price: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency), outcome: outcome(packet))
            row(QelvoraCopy.text("nativeDecisionDeadline"), when(packet.decision_at)); row(QelvoraCopy.text("nativeBankAuthorizationExpires"), when(packet.hold_expires_at))
            if let commitment = detail.commitment { row(QelvoraCopy.text("nativeDeliveryDeadline"), when(commitment.due_at)) }
            if packet.state == "more_info" {
                Text(packet.question ?? QelvoraCopy.text("nativeTheCreatorAskedForMoreInformation")).qText("body")
                TextEditor(text: $info).frame(minHeight: 100).accessibilityLabel(QelvoraCopy.text("nativeYourAnswer"))
                Button(QelvoraCopy.text("nativeSendAnswer"), variant: .secondary, block: true, disabled: commandDisabled || info.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { launch { await mutate("packets/\(packet.id)/info", values: ["version": packet.version, "text": info], message: QelvoraCopy.text("nativeYourAnswerIsSaved")) } }
            }
            if ["submitting", "submitted", "more_info", "offer_pending"].contains(packet.state) { Button(QelvoraCopy.text("nativeWithdrawRequest"), variant: .secondary, block: true, disabled: commandDisabled) { launch { await mutate("packets/\(packet.id)/withdraw", values: ["version": packet.version], message: QelvoraCopy.text("nativeHoldReleaseIsBeingConfirmed")) } } }
            if packet.payment_state == "unknown" || packet.payment_state == "requires_action" { Notice(title: QelvoraCopy.text("nativePaymentProcessing"), children: QelvoraCopy.text("nativeTheProviderMustConfirmPayment")) }
            if let transport = detail.callTransport {
                Notice(title: QelvoraCopy.text("nativeSystemCallStatus"), children: transport.state == "closed_unresolved" ? QelvoraCopy.text("nativeTheCallRoomClosedAfterNeither", values: ["time": when(transport.recordedAt)]) : QelvoraCopy.text("nativeCurrentCallStatusIsUnavailable"))
            }
            if detail.commitment?.delivered_at != nil, ["delivered", "refunded", "resolved"].contains(detail.commitment?.state ?? "") {
                Receipt(reqId: reqID(packet.id), title: packet.snapshot.title, rows: [ReceiptRow(id: "amount", label: QelvoraCopy.text("nativeCharged"), value: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency)), ReceiptRow(id: "delivery", label: QelvoraCopy.text("nativeDelivered"), value: when(detail.commitment?.delivered_at))] + (refund > 0 ? [ReceiptRow(id: "refund", label: QelvoraCopy.text("nativeRefundConfirmed"), value: CommerceAmount.display(refund, packet.snapshot.currency))] : []), label: fulfillmentLabel(detail.commitment?.evidence?.authorKind, title: packet.snapshot.title, name: name), name: name)
                if let signedActId = detail.commitment?.evidence?.signedActId ?? detail.commitment?.accept_act_id {
                    Button(detail.commitment?.evidence?.signedActId != nil ? QelvoraCopy.text("nativeOpenSignedVerification") : QelvoraCopy.text("nativeOpenSignedAcceptance"), variant: .quiet, block: true) { session.destination = "/verify/" + signedActId }
                }
                if detail.commitment?.state == "delivered" || detail.share?.fan_choice == true { Button(detail.share?.fan_choice == true ? QelvoraCopy.text("nativeRevokeSharing") : QelvoraCopy.text("nativeAllowSharingWithoutYourHandle"), variant: .secondary, block: true, disabled: commandDisabled || (!packet.snapshot.shareable && detail.share?.fan_choice != true) || detail.share?.revoked_at != nil) { launch { await mutate("packets/\(packet.id)/share", values: ["version": detail.share?.version ?? 1, "enabled": detail.share?.fan_choice != true, "handleDisplay": "hidden"], message: QelvoraCopy.text("nativeYourSharingChoiceIsSaved")) } } }
            }
        }
    }
    private func fulfillmentLabel(_ kind: String?, title: String, name: String) -> String {
        switch kind {
        case "approved_draft": return QelvoraCopy.text("approvedAuthor", values: ["name": name])
        case "human_creator": return QelvoraCopy.text("nativeTitlePersonallyFulfilledByName", values: ["title": title, "name": name])
        case "human_call": return QelvoraCopy.text("nativePersonalCallProviderConfirmed")
        case "system": return QelvoraCopy.text("nativeSystemDeliveryNotice")
        default: return QelvoraCopy.text("nativeDeliveryRecorded")
        }
    }
    private func membership(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(QelvoraCopy.text("nativeManageMembership")).qText("display-md").accessibilityAddTraits(.isHeader)
            if data.memberships.isEmpty { EmptyState(title: QelvoraCopy.text("nativeNoMembershipsYet"), body: QelvoraCopy.text("nativeChooseAnAvailableMembershipOr")) }
            ForEach(data.memberships) { member in panel { Text(member.name).qText("title"); row(QelvoraCopy.text("nativeStatus"), member.state); row(QelvoraCopy.text("nativeAccessUntil"), when(member.period_end)); row(QelvoraCopy.text("nativeBillingProvider"), member.provider) } }
            let currentProducts = data.tiers.filter { $0.state == "active" }.compactMap { $0.catalog.apple?.productId }
            if baseURL != nil, let accountID = session.session?.accountId, data.capabilities.storePurchasesAvailable == true {
                if let api { StoreMembershipPane(client: api, productIDs: currentProducts, accountID: accountID, available: !commandDisabled, onVerified: { await refresh() }).id([accountID, sessionId ?? "no-session"]) }
            } else {
                Notice(title: QelvoraCopy.text("nativePurchaseAndRestoreUnavailable"), children: QelvoraCopy.text("nativeStoreProductsMustBeConfigured"))
                if data.memberships.contains(where: { $0.provider == "apple" }) {
                    StoreSubscriptionManagement().id(session.session?.accountId)
                }
            }
            Text(QelvoraCopy.text("nativeUnusedMembershipsCancelledWithin")).qText("caption")
        }
    }
    private func pass(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(QelvoraCopy.text("nativeYourPass")).qText("display-md").accessibilityAddTraits(.isHeader)
            if !data.policy.passEnabled { EmptyState(title: QelvoraCopy.text("nativePassIsUnavailable"), body: QelvoraCopy.text("nativeMembershipsAreTheCurrentWayTo")) }
            if data.policy.passEnabled, let pass = data.pass.first {
                let current = ["active", "cancelled"].contains(pass.state) && (instant(String(pass.cycle_end.prefix(10)) + "T00:00:00Z") ?? .distantPast) > accessNow
                Text(QelvoraCopy.text("nativeUsedOfAllowanceSharedAICost", values: ["used": String(pass.used + pass.reserved), "allowance": String(pass.allowance)])).qText("body")
                ForEach(data.passChoices.creators) { candidate in Toggle(candidate.display_name, isOn: Binding(get: { selectedPassCreators.contains(candidate.id) }, set: { enabled in if enabled { selectedPassCreators.insert(candidate.id) } else { selectedPassCreators.remove(candidate.id) } })).qText("body") }
                let occupied = Set(data.slots.filter { $0.cycle_start == pass.cycle_start && ["active","draft_next","ended_readable","replaced"].contains($0.state) }.map(\.position)).count
                if occupied < pass.slot_capacity { Button(QelvoraCopy.text("nativeFillAvailableSlots"), variant: .secondary, block: true, disabled: commandDisabled || !current || selectedPassCreators.isEmpty || selectedPassCreators.count > pass.slot_capacity - occupied) { launch { await mutate("pass/initial", values: ["version": pass.version, "creatorIds": selectedPassCreators.sorted()], message: QelvoraCopy.text("nativeYourCurrentChoicesAreSaved")) } } }
                Button(QelvoraCopy.text("nativeSaveNextMonthsChoices"), variant: .secondary, block: true, disabled: commandDisabled || !current || selectedPassCreators.count > pass.slot_capacity) { launch { await mutate("pass/draft", values: ["version": pass.version, "creatorIds": selectedPassCreators.sorted()], message: QelvoraCopy.text("nativeYourNextMonthDraftIsSaved")) } }
                Text(QelvoraCopy.text("nativeCompleteAllSlotcapacityChoices", values: ["slotCapacity": String(pass.slot_capacity)])).qText("caption")
            }
            ForEach(data.slots) { slot in panel {
                row(slot.display_name, slot.state.replacingOccurrences(of: "_", with: " ")); Text(QelvoraCopy.text("nativeThroughDate", values: ["date": when(slot.ends_at)])).qText("caption")
                if data.policy.passEnabled, data.passChoices.replaceableSlotIds.contains(slot.id), let pass = data.pass.first {
                    Picker(QelvoraCopy.text("nativeFreeReplacement"), selection: $replacementCreator) { Text(QelvoraCopy.text("pickerChooseCreator")).tag(""); ForEach(data.passChoices.creators.filter { candidate in !data.slots.contains { $0.state == "active" && $0.creator_id == candidate.id } }) { Text($0.display_name).tag($0.id) } }
                    Button(QelvoraCopy.text("nativeReplaceUnavailableCreator"), variant: .secondary, block: true, disabled: commandDisabled || replacementCreator.isEmpty) { launch { await mutate("pass/slots/\(slot.id)/replace", values: ["version": pass.version, "creatorId": replacementCreator], message: QelvoraCopy.text("nativeYourReplacementIsSaved")) } }
                }
            } }
            Text(QelvoraCopy.text("nativeAPassGrantsAIReachSeparate")).qText("body")
        }
    }
    private func panel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View { VStack(alignment: .leading, spacing: 12, content: content).frame(maxWidth: .infinity, alignment: .leading).padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("line", scheme), lineWidth: 1)) }
    private func row(_ label: String, _ value: String) -> some View { HStack(alignment: .top) { Text(label).qText("body"); Spacer(); Text(value).qText("data-md").multilineTextAlignment(.trailing) }.accessibilityElement(children: .combine) }
    private func reqID(_ id: String) -> String { "REQ-" + id.prefix(8).uppercased() }
    private func requestCategory(_ packet: CommercePacket) -> String {
        if packet.delivered_at != nil || packet.commitment_state == "delivered" { return QelvoraCopy.text("nativeDelivered") }
        if ["draft", "declined", "withdrawn", "expired"].contains(packet.state) || ["refunded", "resolved"].contains(packet.commitment_state ?? "") { return QelvoraCopy.text("nativeClosed") }
        return QelvoraCopy.text("nativeOpen")
    }
    private func instant(_ value: String) -> Date? { let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; if let date = format.date(from: value) { return date }; format.formatOptions = [.withInternetDateTime]; return format.date(from: value) }
    private func when(_ value: String?) -> String { guard let value else { return "—" }; guard let date = instant(value) else { return value }; return date.formatted(date: .abbreviated, time: .shortened) }
    private func outcome(_ packet: CommercePacket) -> String { ["released":QelvoraCopy.text("nativeHoldReleasedNothingCharged"), "failed":QelvoraCopy.text("nativePaymentFailedNothingCharged"), "unknown":QelvoraCopy.text("nativeConfirmingPayment"), "requires_action":QelvoraCopy.text("nativePaymentAuthenticationNeeded"), "refund_pending":QelvoraCopy.text("nativeRefundProcessing"), "refunded":QelvoraCopy.text("nativeRefundConfirmed")][packet.payment_state] ?? (packet.delivered_at != nil || packet.commitment_state == "delivered" ? QelvoraCopy.text("nativeDelivered") : packet.state.replacingOccurrences(of: "_", with: " ")) }
}
