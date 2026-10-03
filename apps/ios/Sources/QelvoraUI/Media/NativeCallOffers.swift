import Foundation
import SwiftUI

private struct NativeCallOffer: Decodable, Sendable {
    struct Slot: Decodable, Sendable { let id: String; let startsAt: String }
    let id: String; let version: Int; let state: String; let creatorTimeZone: String; let fanTimeZone: String; let expiresAt: String; let slots: [Slot]; let selectedSessionId: String?
}
@MainActor public struct NativeCallDestination: View {
    let baseURL: URL?; @ObservedObject var model: FanSession
    public init(baseURL: URL?, model: FanSession) { self.baseURL = baseURL; self.model = model }
    private var lifetime: String { "\(baseURL?.absoluteString ?? ""):\(model.destination):\(model.session?.accountId ?? ""):\(model.session?.sessionId ?? "")" }
    public var body: some View {
        let parts = model.destination.components(separatedBy: "?")[0].split(separator: "/")
        if parts.count == 2, parts[0] == "calls", let id = UUID(uuidString: String(parts[1])) {
            NativeAccountCallLookup(model: model, callID: id.uuidString.lowercased()).id(lifetime)
        } else if URLComponents(string: model.destination)?.queryItems?.contains(where: { $0.name == "offer" && $0.value == "1" }) == true {
            NativeCallOffers(baseURL: baseURL, destination: model.destination, model: model, open: model.open).id(lifetime)
        } else { NativeCallView(baseURL: baseURL, destination: model.destination, model: model, open: model.open).id(lifetime) }
    }
}
@MainActor private struct NativeAccountCallLookup: View {
    @ObservedObject var model: FanSession
    let callID: String
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var attempt = 0
    @State private var loading = true
    @State private var unavailable = false
    private var requestID: String { "\(model.destination):\(model.session?.accountId ?? ""):\(model.session?.sessionId ?? ""):\(scenePhase):\(attempt)" }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
            Text(QelvoraCopy.text("w1CallLookupTitle")).qText("display-md").accessibilityAddTraits(.isHeader)
            if loading { ProgressView(QelvoraCopy.text("w1CallLookupChecking")) }
            if unavailable { Notice(tone: .error, children: QelvoraCopy.text("w1CallLookupUnavailable")) }
            Button(QelvoraCopy.text("retry"), variant: .secondary, block: true, disabled: loading || model.busy || scenePhase != .active) { attempt += 1 }
            Button(QelvoraCopy.text("w6OpenRequests"), variant: .quiet) { model.open("/requests") }
        }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading) }
        .background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
        .task(id: requestID) {
            guard scenePhase == .active else { loading = false; return }
            loading = true; unavailable = false
            let target = model.destination
            let resolved = await model.resolveCallDestination(callID, from: target)
            guard !Task.isCancelled, model.destination == target else { return }
            loading = false; unavailable = !resolved
        }
    }
}
@MainActor private struct NativeCallOffers: View {
    let route: NativeCallRoute?; let baseURL: URL?; let destination: String; let open: (String) -> Void
    @ObservedObject private var model: FanSession
    @Environment(\.colorScheme) private var scheme
    @State private var offer: NativeCallOffer?
    @State private var chosen: String?
    @State private var loaded = false
    @State private var stale = true
    @State private var busy = false
    @State private var notice: String?
    @State private var submission: (slot: String, version: Int, key: String)?
    init(baseURL: URL?, destination: String, model: FanSession, open: @escaping (String) -> Void) {
        route = NativeCallRoute(destination: destination); self.baseURL = baseURL; self.destination = destination; self.model = model; self.open = open
    }
    private var canSelect: Bool { model.session?.fan?.id.lowercased() == route?.fanID.uuidString.lowercased() }
    private func display(_ timestamp: String, zone: String) -> String {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp) else { return timestamp }
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: zone); formatter.setLocalizedDateFormatFromTemplate("EEEEyMMMMdHHmm")
        let offset = DateFormatter(); offset.timeZone = formatter.timeZone; offset.dateFormat = "XXX"
        return formatter.string(from: date) + " · " + offset.string(from: date)
    }
    private func refresh() async {
        guard !busy, let route, let request = await model.captureRequest(from: destination) else { return }; busy = true; defer { busy = false }
        do {
            guard await request.isCurrent() else { return }
            let response = try await request.client.readCallOffers(creatorId: route.creatorID.uuidString.lowercased(), fanId: route.fanID.uuidString.lowercased(), xQelvoraExpectedAccount: request.expectedAccountId)
            guard await request.isCurrent() else { return }
            let values = try JSONDecoder().decode([NativeCallOffer].self, from: JSONEncoder().encode(response))
            let current = values.first { $0.id.lowercased() == route.sessionID.uuidString.lowercased() }
            if current?.version != offer?.version || !((current?.slots ?? []).contains { $0.id == chosen }) { chosen = nil }
            offer = current; loaded = true; stale = false; notice = nil
        } catch is CancellationError { }
        catch { if await request.isCurrent() { loaded = true; stale = true; notice = QelvoraCopy.text("w6TheTimesCouldNotBeLoadedReconnectAndTryAgain") } }
    }
    private func select() async {
        guard !busy, !stale, canSelect, let chosen, let offer, let route, let request = await model.captureRequest(from: destination) else { return }; busy = true; defer { busy = false }
        do {
            if submission?.slot != chosen || submission?.version != offer.version { submission = (chosen, offer.version, UUID().uuidString) }
            let body = APICallSelectTime(slotId: chosen, expectedVersion: offer.version, idempotencyKey: submission!.key)
            guard await request.isCurrent() else { return }
            let selected = try await request.client.selectCallOffer(creatorId: route.creatorID.uuidString.lowercased(), fanId: route.fanID.uuidString.lowercased(), offerId: offer.id, xQelvoraExpectedAccount: request.expectedAccountId, body: body)
            guard await request.isCurrent() else { return }
            guard let sessionID = UUID(uuidString: selected.id), UUID(uuidString: selected.creatorId) == route.creatorID, UUID(uuidString: selected.fanId) == route.fanID else { throw URLError(.badServerResponse) }
            open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(sessionID.uuidString.lowercased())")
        } catch is CancellationError { }
        catch { if await request.isCurrent() { notice = QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer") } }
    }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: QelvoraTokens.space5) {
            Text(QelvoraCopy.text("w6CALLREQUEST")).qText("label"); Text(QelvoraCopy.text("w6ChooseATime")).qText("display-md")
            if let offer, offer.state == "offered" {
                ForEach(offer.slots, id: \.id) { slot in
                    Button(display(slot.startsAt, zone: offer.fanTimeZone) + (chosen == slot.id ? " · Selected" : ""), variant: .secondary, block: true, disabled: busy || stale || !canSelect) { chosen = slot.id }
                }
                Text(QelvoraCopy.text("w6YourTime", values: ["value1": String(describing: offer.fanTimeZone)])).qText("caption")
                Text(QelvoraCopy.text("w6CreatorSTimeZone", values: ["value1": String(describing: offer.creatorTimeZone)])).qText("caption")
                Text(QelvoraCopy.text("w6YourAcceptedTermsAndPaymentStayWithTheRequestReceipt")).qText("caption")
                Text(QelvoraCopy.text("w6OfferExpirescfe463", values: ["value1": String(describing: display(offer.expiresAt, zone: offer.fanTimeZone))])).qText("caption")
                Button(QelvoraCopy.text("w6ConfirmThisTime"), variant: .secondary, block: true, disabled: busy || stale || chosen == nil || !canSelect) { Task { await select() } }
            } else if let offer, offer.state == "selected", let id = offer.selectedSessionId, let sessionID = UUID(uuidString: id), let route {
                Button(QelvoraCopy.text("w6OpenYourScheduledCall"), variant: .secondary, block: true) { open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(sessionID.uuidString.lowercased())") }
            } else { Text(loaded ? QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") : QelvoraCopy.text("w6CheckingTheCurrentOfferAndParticipantAccess")).qText("body") }
            if let notice { Text(notice).qText("caption") }
            Button(QelvoraCopy.text("w6ReloadCurrentOffer"), variant: .quiet, disabled: busy || baseURL == nil || route == nil) { Task { await refresh() } }
            Button(QelvoraCopy.text("w6OpenRequests"), variant: .quiet) { open("/requests") }
        }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme)).task {
            while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(loaded ? 30 : 1)) } catch { return } }
        }
    }
}
