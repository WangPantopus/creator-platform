import Foundation
import SwiftUI

private struct NativeCallOffer: Decodable, Sendable, Equatable {
    struct Slot: Decodable, Sendable, Equatable { let id: String; let startsAt: String }
    let id: String; let commitmentId: String; let version: Int; let state: String; let creatorTimeZone: String; let fanTimeZone: String; let expiresAt: String; let slots: [Slot]; let selectedSessionId: String?
    static func date(_ value: String) -> Date? {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    var valid: Bool {
        UUID(uuidString: id) != nil && UUID(uuidString: commitmentId) != nil && version > 0 &&
        TimeZone(identifier: creatorTimeZone) != nil && TimeZone(identifier: fanTimeZone) != nil && Self.date(expiresAt) != nil &&
        (selectedSessionId == nil || UUID(uuidString: selectedSessionId!) != nil) &&
        slots.allSatisfy { UUID(uuidString: $0.id) != nil && Self.date($0.startsAt) != nil } &&
        Set(slots.compactMap { UUID(uuidString: $0.id) }).count == slots.count
    }
}
private struct NativeOfferDeadline {
    let id: String; let version: Int; let timestamp: String; let wall: Date; let elapsed: ContinuousClock.Instant
    var current: Bool { Date() < wall && ContinuousClock().now < elapsed }
}
private func callOfferNotice(_ error: Error, fallback: String) -> String {
    if let failure = error as? CreatorAPIError,
       let code = (try? JSONDecoder().decode(APIError.self, from: failure.body))?.error.code,
       ["calls_unconfigured", "call_control_unconfigured", "call_provider_unconfigured", "call_admission_unverified", "call_control_role_invalid"].contains(code) {
        return QelvoraCopy.text("w6CallServiceUnavailable")
    }
    return fallback
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
            NativeCallOffers(baseURL: baseURL, destination: model.destination, model: model, open: { model.open($0) }).id(lifetime)
        } else { NativeCallView(baseURL: baseURL, destination: model.destination, model: model, open: { model.open($0) }).id(lifetime) }
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
    @Environment(\.scenePhase) private var scenePhase
    @State private var offer: NativeCallOffer?
    @State private var chosen: String?
    @State private var loaded = false
    @State private var stale = true
    @State private var busy = false
    @State private var notice: String?
    @State private var submission: (slot: String, version: Int, key: String)?
    @State private var epoch = 0
    @State private var deadline: NativeOfferDeadline?
    @State private var now = Date()
    @State private var command: Task<Void, Never>?
    init(baseURL: URL?, destination: String, model: FanSession, open: @escaping (String) -> Void) {
        route = NativeCallRoute(destination: destination); self.baseURL = baseURL; self.destination = destination; self.model = model; self.open = open
    }
    private var canSelect: Bool { model.session?.fan?.id.lowercased() == route?.fanID.uuidString.lowercased() }
    private var selectable: Bool { scenePhase == .active && !stale && deadline?.current == true && offer?.state == "offered" }
    private func display(_ timestamp: String, zone: String) -> String {
        guard let date = NativeCallOffer.date(timestamp) else { return timestamp }
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: zone); formatter.setLocalizedDateFormatFromTemplate("EEEEyMMMMdHHmm")
        let offset = DateFormatter(); offset.timeZone = formatter.timeZone; offset.dateFormat = "XXX"
        return formatter.string(from: date) + " · " + offset.string(from: date)
    }
    private func conceal() {
        epoch += 1; command?.cancel(); command = nil; busy = false; stale = true; loaded = false
        offer = nil; chosen = nil; notice = nil
    }
    private func current(_ request: FanSessionRequestCapture, _ attempt: Int) async -> Bool {
        guard scenePhase == .active, epoch == attempt, !Task.isCancelled else { return false }
        let issued = await request.isCurrent()
        return issued && scenePhase == .active && epoch == attempt && !Task.isCancelled
    }
    private func read(_ request: FanSessionRequestCapture, route: NativeCallRoute, attempt: Int) async throws -> NativeCallOffer? {
        guard await current(request, attempt) else { throw CancellationError() }
        let started = ContinuousClock().now
        let response = try await request.client.readCallOffers(creatorId: route.creatorID.uuidString.lowercased(), fanId: route.fanID.uuidString.lowercased(), xQelvoraExpectedAccount: request.expectedAccountId)
        let values = try JSONDecoder().decode([NativeCallOffer].self, from: JSONEncoder().encode(response))
        guard await current(request, attempt) else { throw CancellationError() }
        guard started.duration(to: ContinuousClock().now) < .seconds(5), values.allSatisfy(\.valid) else { throw URLError(.badServerResponse) }
        return values.first { UUID(uuidString: $0.id) == route.sessionID }
    }
    private func refresh() async {
        guard scenePhase == .active, !busy, let route else { return }
        let attempt = epoch; busy = true; defer { if epoch == attempt { busy = false } }
        guard let request = await model.captureRequest(from: destination, maximumResponseBytes: 1_048_576, timeoutSeconds: 4) else { return }
        do {
            let next = try await read(request, route: route, attempt: attempt)
            guard await current(request, attempt) else { return }
            if next != offer || !((next?.slots ?? []).contains { $0.id == chosen }) { chosen = nil }
            if let next, let wall = NativeCallOffer.date(next.expiresAt) {
                var elapsed = ContinuousClock().now.advanced(by: .seconds(max(0, wall.timeIntervalSinceNow)))
                if let prior = deadline, prior.id == next.id, prior.version == next.version, prior.timestamp == next.expiresAt { elapsed = min(elapsed, prior.elapsed) }
                deadline = NativeOfferDeadline(id: next.id, version: next.version, timestamp: next.expiresAt, wall: wall, elapsed: elapsed)
            } else { deadline = nil }
            offer = next; loaded = true; stale = next?.state == "offered" && deadline?.current != true; now = Date()
            notice = stale ? QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") : nil
        } catch is CancellationError { }
        catch { if await current(request, attempt) { offer = nil; chosen = nil; loaded = true; stale = true; notice = callOfferNotice(error, fallback: QelvoraCopy.text("w6TheTimesCouldNotBeLoadedReconnectAndTryAgain")) } }
    }
    private func select() async {
        guard !busy, selectable, canSelect, let chosen, let offer, let route,
              let slot = offer.slots.first(where: { $0.id == chosen }), let starts = NativeCallOffer.date(slot.startsAt), starts > Date() else { return }
        let attempt = epoch; busy = true; defer { if epoch == attempt { busy = false } }
        guard let request = await model.captureRequest(from: destination, maximumResponseBytes: 1_048_576, timeoutSeconds: 4) else { return }
        do {
            let started = ContinuousClock().now
            let latest = try await read(request, route: route, attempt: attempt)
            guard await current(request, attempt) else { return }
            guard started.duration(to: ContinuousClock().now) < .seconds(5), latest == offer, selectable, starts > Date() else { throw URLError(.resourceUnavailable) }
            if submission?.slot != chosen || submission?.version != offer.version { submission = (chosen, offer.version, UUID().uuidString) }
            let body = APICallSelectTime(slotId: chosen, expectedVersion: offer.version, idempotencyKey: submission!.key)
            let selected = try await request.client.selectCallOffer(creatorId: route.creatorID.uuidString.lowercased(), fanId: route.fanID.uuidString.lowercased(), offerId: offer.id, xQelvoraExpectedAccount: request.expectedAccountId, body: body)
            guard await current(request, attempt) else { return }
            guard let sessionID = UUID(uuidString: selected.id), UUID(uuidString: selected.creatorId) == route.creatorID, UUID(uuidString: selected.fanId) == route.fanID,
                  UUID(uuidString: selected.fanAccountId) == UUID(uuidString: request.expectedAccountId), UUID(uuidString: selected.commitmentId) == UUID(uuidString: offer.commitmentId),
                  NativeCallOffer.date(selected.scheduledAt) == starts else { throw URLError(.badServerResponse) }
            open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(sessionID.uuidString.lowercased())")
        } catch is CancellationError { }
        catch { if await current(request, attempt) { stale = true; notice = callOfferNotice(error, fallback: QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer")) } }
    }
    private func openSelected(_ id: UUID) async {
        guard !busy, !stale, scenePhase == .active, let route, let observed = offer else { return }
        let attempt = epoch; busy = true; defer { if epoch == attempt { busy = false } }
        guard let request = await model.captureRequest(from: destination, maximumResponseBytes: 1_048_576, timeoutSeconds: 4) else { return }
        do {
            let latest = try await read(request, route: route, attempt: attempt)
            guard await current(request, attempt) else { return }
            guard latest == observed, latest?.state == "selected", UUID(uuidString: latest?.selectedSessionId ?? "") == id else { throw URLError(.resourceUnavailable) }
            let session = try await request.client.readCallSession(creatorId: route.creatorID.uuidString.lowercased(), fanId: route.fanID.uuidString.lowercased(), sessionId: id.uuidString.lowercased(), xQelvoraExpectedAccount: request.expectedAccountId)
            guard await current(request, attempt) else { return }
            guard UUID(uuidString: session.id) == id, UUID(uuidString: session.creatorId) == route.creatorID, UUID(uuidString: session.fanId) == route.fanID,
                  UUID(uuidString: session.commitmentId) == UUID(uuidString: observed.commitmentId),
                  [session.creatorAccountId, session.fanAccountId].contains(where: { UUID(uuidString: $0) == UUID(uuidString: request.expectedAccountId) }) else { throw URLError(.badServerResponse) }
            open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(id.uuidString.lowercased())")
        } catch is CancellationError { }
        catch { if await current(request, attempt) { stale = true; notice = callOfferNotice(error, fallback: QelvoraCopy.text("w6ThisTimeIsUnavailableReloadTheCurrentOffer")) } }
    }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: QelvoraTokens.space5) {
            Text(QelvoraCopy.text("w6CALLREQUEST")).qText("label"); Text(QelvoraCopy.text("w6ChooseATime")).qText("display-md")
            if let offer, offer.state == "offered", !stale, scenePhase == .active {
                ForEach(offer.slots, id: \.id) { slot in
                    Button(display(slot.startsAt, zone: offer.fanTimeZone) + (chosen == slot.id ? " · Selected" : ""), variant: .secondary, block: true, disabled: busy || !selectable || !canSelect || (NativeCallOffer.date(slot.startsAt) ?? .distantPast) <= now) { chosen = slot.id }
                }
                Text(QelvoraCopy.text("w6YourTime", values: ["value1": String(describing: offer.fanTimeZone)])).qText("caption")
                Text(QelvoraCopy.text("w6CreatorSTimeZone", values: ["value1": String(describing: offer.creatorTimeZone)])).qText("caption")
                Text(QelvoraCopy.text("w6YourAcceptedTermsAndPaymentStayWithTheRequestReceipt")).qText("caption")
                Text(QelvoraCopy.text("w6OfferExpirescfe463", values: ["value1": String(describing: display(offer.expiresAt, zone: offer.fanTimeZone))])).qText("caption")
                Button(QelvoraCopy.text("w6ConfirmThisTime"), variant: .secondary, block: true, disabled: busy || !selectable || chosen == nil || !canSelect) { command = Task { await select() } }
            } else if let offer, offer.state == "selected", !stale, scenePhase == .active, let id = offer.selectedSessionId, let sessionID = UUID(uuidString: id) {
                Button(QelvoraCopy.text("w6OpenYourScheduledCall"), variant: .secondary, block: true, disabled: busy) { command = Task { await openSelected(sessionID) } }
            } else if notice == nil { Text(loaded ? QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") : QelvoraCopy.text("w6CheckingTheCurrentOfferAndParticipantAccess")).qText("body") }
            if let notice { Text(notice).qText("caption") }
            Button(QelvoraCopy.text("w6ReloadCurrentOffer"), variant: .quiet, disabled: busy || scenePhase != .active || baseURL == nil || route == nil) { command = Task { await refresh() } }
            Button(QelvoraCopy.text("w6OpenRequests"), variant: .quiet) { open("/requests") }
        }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme)).task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(loaded ? 30 : 1)) } catch { return } }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            while !Task.isCancelled {
                now = Date()
                if offer?.state == "offered", deadline?.current != true { chosen = nil; stale = true; notice = QelvoraCopy.text("w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent") }
                do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { conceal() } }
        .onDisappear { conceal() }
    }
}
