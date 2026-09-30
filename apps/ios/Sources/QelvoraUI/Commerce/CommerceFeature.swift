import SwiftUI

@MainActor
public enum CommerceFanFeature {
    public static func registration(baseURL: URL?, storeProductIDs: [String] = []) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: { destination in let path = destination.components(separatedBy: "?")[0]; return path == "/requests" || (["requests","spending","access","packet","checkout","status","pass","membership"].contains(path.split(separator: "/").last.map(String.init) ?? "") && path.hasPrefix("/commerce/")) || (path.hasPrefix("/creators/") && path.hasSuffix("/access")) }, screen: { session in AnyView(CommerceFeature(baseURL: baseURL, session: session, accountId: session.session?.accountId, storeProductIDs: storeProductIDs)) })
    }
}

@MainActor
struct CommerceFeature: View {
    let baseURL: URL?; @ObservedObject var session: FanSession
    let accountId: String?
    var storeProductIDs: [String] = []
    @State private var overview: CommerceOverview?; @State private var detail: CommerceDetail?
    @State private var screen = "requests"; @State private var category = "Open"; @State private var creator = ""
    @State private var amount = ""; @State private var choice = ""; @State private var reminders = true
    @State private var summary = ""; @State private var info = ""; @State private var selectedMode: String?
    @State private var includeSummary = true; @State private var includeMessages: [IncludeItem] = []
    @State private var visibility: String? = "private"; @State private var busy = false; @State private var failure = ""
    @State private var selectedPassCreators: Set<String> = []; @State private var replacementCreator = ""
    @State private var notice = ""; @State private var keys: [String: String] = [:]
    @State private var accessSnapshot: CommerceAccess?; @State private var accessReceivedAt: Date?
    @State private var accessNow = Date(); @State private var limitVersion: Int?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    private var api: CommerceClient? { baseURL.map { CommerceClient(baseURL: $0, accountId: accountId) } }
    private var modes: [CommerceMode] { overview?.modes.filter { $0.creator_id == creator } ?? [] }
    private var creatorName: String { overview?.creators.first { $0.id == creator }?.display_name ?? "the creator" }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    if screen != "requests" { Button("Back", variant: .quiet) { screen = "requests"; detail = nil } }
                    Spacer(); Text(title.uppercased()).qText("meta"); Spacer()
                    Button("Refresh", variant: .quiet, disabled: busy) { Task { await refresh() } }
                }
                if !failure.isEmpty { Notice(tone: .error, title: "Connection status", children: failure) }
                if !notice.isEmpty { Notice(title: "Saved", children: notice) }
                if let overview {
                    switch screen {
                    case "spending": spending(overview)
                    case "access": access(overview)
                    case "packet": packet(overview)
                    case "status": if let detail { status(detail) } else { EmptyState(title: "Request unavailable", body: "Refresh the request from your account.") }
                    case "checkout": EmptyState(title: "Payment unavailable", body: "Paid written and voice requests are unavailable in this native app.")
                    case "membership": membership(overview)
                    case "pass": pass(overview)
                    default: requests(overview)
                    }
                } else if busy { ProgressView().accessibilityLabel("Loading commerce") }
                else { EmptyState(title: "This information is unavailable", body: failure.isEmpty ? "Commerce is not connected yet. Reconnect to try again." : failure) }
            }.padding(.horizontal, screen == "packet" ? 20 : 16).padding(.top, 20).padding(.bottom, 36)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task { await arrive() }
            .task(id: "\(screen):\(creator):\(overview?.fan?.id ?? ""):\(scenePhase)") { await refreshAccess() }
            .task(id: screen) {
                while screen == "access", !Task.isCancelled {
                    accessNow = Date()
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                }
            }
            .refreshable { await refresh() }
    }
    private var title: String { ["spending":"Spending and time", "access":"Access", "packet":"Included in your request", "status":"Your request", "membership":"Manage membership", "pass":"Your pass"][screen] ?? "Requests" }
    private func arrive() async {
        let parts = URLComponents(string: session.destination)
        let path = parts?.path ?? "/requests"
        screen = path.hasPrefix("/commerce/") ? String(path.split(separator: "/").last ?? "requests") : path.hasSuffix("/access") ? "access" : "requests"
        await refresh()
        if let selected = parts?.queryItems?.first(where: { $0.name == "creatorId" })?.value { creator = selected }
        else if path.hasPrefix("/creators/"), let handle = path.split(separator: "/").dropFirst().first { creator = overview?.creators.first(where: { $0.handle == handle })?.id ?? creator }
        if screen == "status", let id = parts?.queryItems?.first(where: { $0.name == "packetId" })?.value, let api {
            do { detail = try await api.request("packets/" + id) } catch { await report(error) }
        }
    }
    private func refresh() async {
        guard let api else { failure = "Commerce is not connected yet."; return }; busy = true; defer { busy = false }
        do {
            let accountId = session.session?.accountId
            let value: CommerceOverview = try await api.request("overview"); guard !Task.isCancelled, accountId == session.session?.accountId else { return }; overview = value; failure = ""
            if let limit = value.limits.first(where: { $0.currency == value.policy.currency }), limit.version != limitVersion {
                let pending = limit.effective_at != nil
                let none = pending ? limit.pending_none == true : limit.explicit_none
                choice = none ? "none" : "amount"
                amount = (pending ? limit.pending_amount : limit.amount).flatMap(Int64.init).map { CommerceAmount.input($0, limit.currency) } ?? ""
                reminders = limit.reminders_on; limitVersion = limit.version
            }
            if creator.isEmpty { creator = value.creators.first?.id ?? "" }
            if let packet = detail?.packet { detail = try await api.request("packets/" + packet.id) }
        } catch { await report(error) }
    }
    private func refreshAccess() async {
        accessSnapshot = nil; accessReceivedAt = nil
        guard screen == "access", scenePhase == .active, !creator.isEmpty, let fanId = overview?.fan?.id, let api else { return }
        let creatorId = creator; let accountId = session.session?.accountId
        while !Task.isCancelled {
            let checkedAt = Date()
            do {
                let value: CommerceAccess = try await api.request("creators/\(creatorId)/fans/\(fanId)/access")
                guard !Task.isCancelled, creator == creatorId, session.session?.accountId == accountId, value.creatorId == creatorId, value.fanId == fanId else { return }
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
        guard let value = currentAccess else { return "Current access is unavailable. Refresh to try again." }
        let lines = [value.capabilities.contains("ai_message") ? (value.allowance.available > 0 ? "Message this AI." : "Your AI allowance is used for this period.") : "", value.capabilities.contains("note") ? "Read included notes." : "", value.capabilities.contains("request") ? "Request available services." : ""].filter { !$0.isEmpty }
        return lines.isEmpty ? "Read your existing conversations." : lines.joined(separator: " ")
    }
    private var accessIncluded: String {
        guard let value = currentAccess else { return "Benefits cannot be confirmed." }
        let labels = ["membership":"Membership", "comp":"Gifted access", "commitment":"Accepted service", "pass_slot":"Pass AI reach", "trial":"Conversation trial"]
        let sources = Array(Set(value.sources.map { labels[$0.source] ?? "Current access" })).sorted()
        return sources.isEmpty ? "No included access for this creator." : sources.joined(separator: ", ")
    }
    private func report(_ error: Error) async {
        if let error = error as? CommerceFailure { failure = error.message; if error.status == 401 { overview = nil; detail = nil; await session.refresh() } }
        else if !(error is CancellationError) { failure = "Reconnect to refresh. Your input is kept; actions are unavailable while offline." }
    }
    private func mutate(_ path: String, values: [String: Any], message: String) async {
        guard !busy, let api else { return }; busy = true; defer { busy = false }
        do {
            var body = values
            let canonical = try JSONSerialization.data(withJSONObject: values, options: [.sortedKeys])
            let signature = path + String(decoding: canonical, as: UTF8.self)
            let key = keys[signature] ?? UUID().uuidString; keys[signature] = key; body["idempotencyKey"] = key
            struct Result: Decodable, Sendable {}
            let _: Result = try await api.request(path, body: JSONSerialization.data(withJSONObject: body))
            notice = message; failure = ""; await refresh()
        } catch { await report(error) }
    }
    private func requests(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Requests").qText("display-lg")
            HStack { ForEach(["Open", "Delivered", "Closed"], id: \.self) { label in Button(label, variant: .quiet) { category = label }.accessibilityAddTraits(category == label ? .isSelected : []) } }
            let visible = data.packets.filter { requestCategory($0) == category }
            if visible.isEmpty { EmptyState(title: "No requests here", body: data.packets.isEmpty ? "Requests appear after you send them." : "Choose another category to view your requests and retained receipts.") }
            ForEach(visible) { packet in
                RequestStatus(reqId: reqID(packet.id), mode: packet.snapshot.title, price: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency), outcome: outcome(packet))
                Button("View request", variant: .secondary, block: true) { Task { await open(packet) } }
            }
            Button("Spending and time", variant: .secondary, block: true) { screen = "spending" }
            Button("Creator access", variant: .secondary, block: true) { screen = "access" }
            Button("Manage membership", variant: .quiet, block: true) { screen = "membership" }
            Button("Your pass", variant: .quiet, block: true) { screen = "pass" }
        }
    }
    private func spending(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Spending and time").qText("display-md")
            Text(CommerceAmount.display(data.exposure?.captured ?? 0, data.policy.currency)).qText("spend-total")
            Text("Charged this calendar month").qText("caption")
            let limit = data.limits.first { $0.currency == data.policy.currency }
            panel {
                row("Current limit", limit.map { $0.explicit_none ? "No limit" : CommerceAmount.display(Int64($0.amount ?? "0") ?? 0, $0.currency) } ?? "Choose before your first paid action")
                row("Held, not charged", CommerceAmount.display(data.exposure?.held ?? 0, data.policy.currency))
                if let effective = limit?.effective_at { Text("Your increase takes effect \(when(effective)).").qText("caption") }
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("Monthly spending limit").qText("body-strong")
                HStack { Button("Choose an amount", variant: .secondary) { choice = "amount" }; Button("No limit", variant: .secondary) { choice = "none" } }
                if choice == "amount" { monthlyAmountField(data.policy.currency).padding(12).frame(minHeight: 48).background(qColor("surface", scheme)).accessibilityLabel("Monthly amount") }
                Toggle("Remind me at 50% and 100%", isOn: $reminders).qText("body")
                Text("Increases take 24 hours. Decreases are immediate and affect new requests. Existing obligations remain.").qText("caption")
                Button(busy ? "Saving…" : "Save limit", variant: .secondary, block: true, disabled: busy || choice.isEmpty) { Task {
                    do { let value = choice == "none" ? nil : try CommerceAmount.parse(amount, data.policy.currency); await mutate("spend-limit", values: ["currency": data.policy.currency, "amount": value.map { $0 as Any } ?? NSNull(), "explicitNone": choice == "none", "remindersOn": reminders], message: "Your spending choice is saved.") } catch { await report(error) }
                } }
            }
            ForEach(data.spendingNotices) { notice in Text("You’ve reached \(notice.threshold)% of your monthly limit.").qText("body") }
            Notice(title: "AI time", children: "Your time summary is unavailable until conversation activity is connected.")
        }
    }
    @ViewBuilder private func monthlyAmountField(_ currency: String) -> some View {
        #if os(iOS)
        TextField("Amount in \(currency)", text: $amount).keyboardType(.decimalPad)
        #else
        TextField("Amount in \(currency)", text: $amount)
        #endif
    }
    private func access(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Access").qText("display-md")
            Picker("Creator", selection: $creator) { ForEach(data.creators) { Text($0.display_name).tag($0.id) } }.pickerStyle(.menu)
            let paid = data.memberships.filter { $0.creator_id == creator && ["active", "grace", "cancelled"].contains($0.state) && (instant($0.period_end) ?? .distantPast) > accessNow }
            let availableModes = modes.filter { $0.state == "offered" && $0.used + $0.reserved < $0.weekly_limit }
            let labels = ["pass_slot":"Pass AI reach", "trial":"Conversation trial", "comp":"Gifted access", "commitment":"Accepted service"]
            let changes = paid.map { "\($0.name): \($0.cancel_at_end || $0.state == "cancelled" ? "ends" : "renews") \(when($0.period_end))" } + (currentAccess?.sources.filter { $0.source != "membership" }.map { "\(labels[$0.source] ?? "Access") ends \(when($0.validUntil))" } ?? [])
            AccessLines(can: accessCan, included: accessIncluded, byRequest: availableModes.isEmpty ? "No human modes are currently available." : availableModes.map(\.title).joined(separator: ", "), changes: changes.isEmpty ? "Access refreshes from the server." : changes.joined(separator: "; "), name: creatorName)
            ForEach(modes.filter { $0.state == "offered" }) { mode in
                panel { row(mode.title, mode.amount.flatMap(Int64.init).map { CommerceAmount.display($0, mode.currency) } ?? "Price not set"); Text("\(max(0, mode.weekly_limit - mode.used - mode.reserved)) of \(mode.weekly_limit) left · \(mode.delivery_hours) h delivery").qText("caption") }
            }
            Button("Ask \(creatorName) to step in", variant: .secondary, block: true, disabled: availableModes.isEmpty) { screen = "packet" }
            Button("Manage membership", variant: .quiet, block: true) { screen = "membership" }
        }
    }
    private func packet(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Included in your request").qText("display-md")
            Text("Change anything; nothing is sent until you do.").qText("body")
            IncludeList(name: creatorName, summaryBinding: $summary, itemsBinding: $includeMessages, summaryIncluded: $includeSummary)
            ModeList(modes: modes.map { mode in ModeItem(id: mode.id, title: mode.title, meta: "\(mode.delivery_hours) h · \(max(0, mode.weekly_limit - mode.used - mode.reserved)) left", price: mode.amount.flatMap(Int64.init).map { CommerceAmount.display($0, mode.currency) } ?? "Unset", selected: selectedMode == mode.id, disabled: mode.state != "offered" || mode.used + mode.reserved >= mode.weekly_limit) }, selection: $selectedMode)
            Notice(title: "Payment unavailable", children: "Paid written and voice requests are unavailable in this native app. Your draft stays on this screen.")
            Button("Send request", variant: .secondary, block: true, disabled: true) {}
        }
    }
    private func open(_ packet: CommercePacket) async {
        guard let api, !busy else { return }; busy = true; defer { busy = false }
        do { detail = try await api.request("packets/" + packet.id); screen = "status"; failure = "" } catch { await report(error) }
    }
    private func status(_ detail: CommerceDetail) -> some View {
        let packet = detail.packet
        let name = overview?.creators.first { $0.id == packet.creator_id }?.display_name ?? "the creator"
        let refund = detail.ledger.filter { $0.kind == "refund" && $0.currency == packet.snapshot.currency }.compactMap { Int64($0.amount) }.reduce(0, +)
        return VStack(alignment: .leading, spacing: 24) {
            Text(packet.snapshot.title).qText("display-md")
            RequestStatus(reqId: reqID(packet.id), mode: packet.snapshot.title, price: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency), outcome: outcome(packet))
            row("Decision deadline", when(packet.decision_at)); row("Bank authorization expires", when(packet.hold_expires_at))
            if let commitment = detail.commitment { row("Delivery deadline", when(commitment.due_at)) }
            if packet.state == "more_info" {
                Text(packet.question ?? "The creator asked for more information.").qText("body")
                TextEditor(text: $info).frame(minHeight: 100).accessibilityLabel("Your answer")
                Button("Send answer", variant: .secondary, block: true, disabled: busy || info.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { Task { await mutate("packets/\(packet.id)/info", values: ["version": packet.version, "text": info], message: "Your answer is saved.") } }
            }
            if ["submitting", "submitted", "more_info", "offer_pending"].contains(packet.state) { Button("Withdraw request", variant: .secondary, block: true, disabled: busy) { Task { await mutate("packets/\(packet.id)/withdraw", values: ["version": packet.version], message: "Hold release is being confirmed.") } } }
            if packet.payment_state == "unknown" || packet.payment_state == "requires_action" { Notice(title: "Payment processing", children: "The provider must confirm payment. No completion is inferred from this screen.") }
            if detail.commitment?.delivered_at != nil, ["delivered", "refunded", "resolved"].contains(detail.commitment?.state ?? "") {
                Receipt(reqId: reqID(packet.id), title: packet.snapshot.title, rows: [ReceiptRow(id: "amount", label: "Charged", value: CommerceAmount.display(packet.snapshot.amount, packet.snapshot.currency)), ReceiptRow(id: "delivery", label: "Delivered", value: when(detail.commitment?.delivered_at))] + (refund > 0 ? [ReceiptRow(id: "refund", label: "Refund confirmed", value: CommerceAmount.display(refund, packet.snapshot.currency))] : []), label: detail.commitment?.evidence?.authorKind == "approved_draft" ? "Prepared by AI · approved by \(name)" : "\(packet.snapshot.title) · personally fulfilled by \(name)", name: name)
                if let signedActId = detail.commitment?.evidence?.signedActId ?? detail.commitment?.accept_act_id {
                    Button(detail.commitment?.evidence?.signedActId != nil ? "Open signed verification" : "Open signed acceptance", variant: .quiet, block: true) { session.destination = "/verify/" + signedActId }
                }
                if detail.commitment?.state == "delivered" || detail.share?.fan_choice == true { Button(detail.share?.fan_choice == true ? "Revoke sharing" : "Allow sharing without your handle", variant: .secondary, block: true, disabled: busy || (!packet.snapshot.shareable && detail.share?.fan_choice != true) || detail.share?.revoked_at != nil) { Task { await mutate("packets/\(packet.id)/share", values: ["version": detail.share?.version ?? 1, "enabled": detail.share?.fan_choice != true, "handleDisplay": "hidden"], message: "Your sharing choice is saved.") } } }
            }
        }
    }
    private func membership(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Manage membership").qText("display-md")
            if data.memberships.isEmpty { EmptyState(title: "No memberships yet", body: "Choose an available membership or restore your current store purchases.") }
            ForEach(data.memberships) { member in panel { Text(member.name).qText("title"); row("Status", member.state); row("Access until", when(member.period_end)); row("Billing provider", member.provider) } }
            let currentProducts = data.tiers.filter { $0.state == "active" }.compactMap { $0.catalog.apple?.productId }
            if let baseURL, let accountID = session.session?.accountId, data.capabilities.storePurchasesAvailable == true {
                StoreMembershipPane(baseURL: baseURL, productIDs: currentProducts, accountID: accountID, onVerified: { await refresh() }).id(accountID)
            } else {
                Notice(title: "Purchase and restore unavailable", children: "Store products must be configured and verified by the server before access is granted.")
            }
            Text("Unused memberships cancelled within seven days qualify for a full refund. Later refunds follow the remaining paid period; store refunds follow that store's process.").qText("caption")
        }
    }
    private func pass(_ data: CommerceOverview) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Your pass").qText("display-md")
            if !data.policy.passEnabled { EmptyState(title: "Pass is unavailable", body: "Memberships are the current way to deepen access. The pass is not open yet.") }
            if data.policy.passEnabled, let pass = data.pass.first {
                Text("\(pass.used + pass.reserved) of \(pass.allowance) shared AI cost units used or reserved.").qText("body")
                ForEach(data.passChoices.creators) { candidate in Toggle(candidate.display_name, isOn: Binding(get: { selectedPassCreators.contains(candidate.id) }, set: { enabled in if enabled { selectedPassCreators.insert(candidate.id) } else { selectedPassCreators.remove(candidate.id) } })).qText("body") }
                let occupied = Set(data.slots.filter { $0.cycle_start == pass.cycle_start && ["active","ended_readable","replaced"].contains($0.state) }.map(\.position)).count
                if occupied < pass.slot_capacity { Button("Fill available slots", variant: .secondary, block: true, disabled: busy || selectedPassCreators.isEmpty || selectedPassCreators.count > pass.slot_capacity - occupied) { Task { await mutate("pass/initial", values: ["version": pass.version, "creatorIds": selectedPassCreators.sorted()], message: "Your current choices are saved.") } } }
                Button("Save next month’s choices", variant: .secondary, block: true, disabled: busy || selectedPassCreators.count > pass.slot_capacity) { Task { await mutate("pass/draft", values: ["version": pass.version, "creatorIds": selectedPassCreators.sorted()], message: "Your next-month draft is saved.") } }
                Text("Complete all \(pass.slot_capacity) choices. An incomplete draft carries forward your current selection.").qText("caption")
            }
            ForEach(data.slots) { slot in panel {
                row(slot.display_name, slot.state.replacingOccurrences(of: "_", with: " ")); Text("Through \(when(slot.ends_at))").qText("caption")
                if data.policy.passEnabled, data.passChoices.replaceableSlotIds.contains(slot.id), let pass = data.pass.first {
                    Picker("Free replacement", selection: $replacementCreator) { Text("Choose a creator").tag(""); ForEach(data.passChoices.creators.filter { candidate in !data.slots.contains { $0.state == "active" && $0.creator_id == candidate.id } }) { Text($0.display_name).tag($0.id) } }
                    Button("Replace unavailable creator", variant: .secondary, block: true, disabled: busy || replacementCreator.isEmpty) { Task { await mutate("pass/slots/\(slot.id)/replace", values: ["version": pass.version, "creatorId": replacementCreator], message: "Your replacement is saved.") } }
                }
            } }
            Text("A pass grants AI reach. Separate memberships grant tier depth and do not consume a slot.").qText("body")
        }
    }
    private func panel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View { VStack(alignment: .leading, spacing: 12, content: content).frame(maxWidth: .infinity, alignment: .leading).padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("line", scheme), lineWidth: 1)) }
    private func row(_ label: String, _ value: String) -> some View { HStack(alignment: .top) { Text(label).qText("body"); Spacer(); Text(value).qText("data-md").multilineTextAlignment(.trailing) }.accessibilityElement(children: .combine) }
    private func reqID(_ id: String) -> String { "REQ-" + id.prefix(8).uppercased() }
    private func requestCategory(_ packet: CommercePacket) -> String {
        if packet.delivered_at != nil || packet.commitment_state == "delivered" { return "Delivered" }
        if ["draft", "declined", "withdrawn", "expired"].contains(packet.state) || ["refunded", "resolved"].contains(packet.commitment_state ?? "") { return "Closed" }
        return "Open"
    }
    private func instant(_ value: String) -> Date? { let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; if let date = format.date(from: value) { return date }; format.formatOptions = [.withInternetDateTime]; return format.date(from: value) }
    private func when(_ value: String?) -> String { guard let value else { return "—" }; guard let date = instant(value) else { return value }; return date.formatted(date: .abbreviated, time: .shortened) }
    private func outcome(_ packet: CommercePacket) -> String { ["released":"Hold released · nothing charged", "failed":"Payment failed · nothing charged", "unknown":"Confirming payment", "requires_action":"Payment authentication needed", "refund_pending":"Refund processing", "refunded":"Refund confirmed"][packet.payment_state] ?? (packet.delivered_at != nil || packet.commitment_state == "delivered" ? "Delivered" : packet.state.replacingOccurrences(of: "_", with: " ")) }
}
