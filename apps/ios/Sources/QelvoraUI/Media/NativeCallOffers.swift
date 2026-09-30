import Foundation
import SwiftUI

private struct NativeCallOffer: Decodable, Sendable {
    struct Slot: Decodable, Sendable { let id: String; let startsAt: String }
    let id: String; let version: Int; let state: String; let creatorTimeZone: String; let fanTimeZone: String; let expiresAt: String; let slots: [Slot]; let selectedSessionId: String?
}
@MainActor public struct NativeCallDestination: View {
    let baseURL: URL?; @ObservedObject var model: FanSession
    public init(baseURL: URL?, model: FanSession) { self.baseURL = baseURL; self.model = model }
    public var body: some View {
        if URLComponents(string: model.destination)?.queryItems?.contains(where: { $0.name == "offer" && $0.value == "1" }) == true {
            NativeCallOffers(baseURL: baseURL, destination: model.destination, fanID: model.session?.fan?.id, open: model.open).id(model.destination)
        } else { NativeCallView(baseURL: baseURL, destination: model.destination, actorAccountID: model.session?.accountId, open: model.open).id(model.destination) }
    }
}
@MainActor private struct NativeCallOffers: View {
    let route: NativeCallRoute?; let client: NativeMediaClient?; let fanID: String?; let open: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var offer: NativeCallOffer?
    @State private var chosen: String?
    @State private var loaded = false
    @State private var stale = true
    @State private var busy = false
    @State private var notice: String?
    @State private var submission: (slot: String, version: Int, key: String)?
    init(baseURL: URL?, destination: String, fanID: String?, open: @escaping (String) -> Void) {
        route = NativeCallRoute(destination: destination); self.fanID = fanID; self.open = open
        client = baseURL.map { NativeMediaClient(baseURL: $0, sessionToken: { guard let value = try await SecureSessionStorage().read() else { throw URLError(.userAuthenticationRequired) }; return value }) }
    }
    private var root: String? { route.map { "/v1/w6/threads/\($0.creatorID.uuidString.lowercased())/\($0.fanID.uuidString.lowercased())/call-offers" } }
    private var canSelect: Bool { fanID?.lowercased() == route?.fanID.uuidString.lowercased() }
    private func display(_ timestamp: String, zone: String) -> String {
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp) else { return timestamp }
        let formatter = DateFormatter(); formatter.timeZone = TimeZone(identifier: zone); formatter.setLocalizedDateFormatFromTemplate("EEEEyMMMMdHHmm")
        let offset = DateFormatter(); offset.timeZone = formatter.timeZone; offset.dateFormat = "XXX"
        return formatter.string(from: date) + " · " + offset.string(from: date)
    }
    private func refresh() async {
        guard !busy, let client, let root, let route else { return }; busy = true; defer { busy = false }
        do {
            let values = try JSONDecoder().decode([NativeCallOffer].self, from: await client.request(path: root))
            let current = values.first { $0.id.lowercased() == route.sessionID.uuidString.lowercased() }
            if current?.version != offer?.version || !((current?.slots ?? []).contains { $0.id == chosen }) { chosen = nil }
            offer = current; loaded = true; stale = false; notice = nil
        } catch { loaded = true; stale = true; notice = "The times could not be loaded. Reconnect and try again." }
    }
    private func select() async {
        guard !busy, !stale, canSelect, let chosen, let offer, let client, let route, let root else { return }; busy = true; defer { busy = false }
        do {
            if submission?.slot != chosen || submission?.version != offer.version { submission = (chosen, offer.version, UUID().uuidString) }
            let body: [String: Any] = ["slotId": chosen, "expectedVersion": offer.version, "idempotencyKey": submission!.key]
            struct Selection: Decodable { let id: String }
            let selected = try JSONDecoder().decode(Selection.self, from: await client.request(path: root + "/" + offer.id + "/select", method: "POST", body: JSONSerialization.data(withJSONObject: body)))
            guard let sessionID = UUID(uuidString: selected.id) else { throw URLError(.badServerResponse) }
            open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(sessionID.uuidString.lowercased())")
        } catch { notice = "This time is unavailable. Reload the current offer." }
    }
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: QelvoraTokens.space5) {
            Text("CALL REQUEST").qText("label"); Text("Choose a time").qText("display-md")
            if let offer, offer.state == "offered" {
                ForEach(offer.slots, id: \.id) { slot in
                    Button(display(slot.startsAt, zone: offer.fanTimeZone) + (chosen == slot.id ? " · Selected" : ""), variant: .secondary, block: true, disabled: busy || stale || !canSelect) { chosen = slot.id }
                }
                Text("Your time · \(offer.fanTimeZone)").qText("caption")
                Text("Creator's time zone · \(offer.creatorTimeZone)").qText("caption")
                Text("Your accepted terms and payment stay with the request receipt. Choosing a time cannot create a second charge.").qText("caption")
                Text("Offer expires \(display(offer.expiresAt, zone: offer.fanTimeZone)).").qText("caption")
                Button("Confirm this time", variant: .secondary, block: true, disabled: busy || stale || chosen == nil || !canSelect) { Task { await select() } }
            } else if let offer, offer.state == "selected", let id = offer.selectedSessionId, let sessionID = UUID(uuidString: id), let route {
                Button("Open your scheduled call", variant: .secondary, block: true) { open("/calls/\(route.creatorID.uuidString.lowercased())/\(route.fanID.uuidString.lowercased())/\(sessionID.uuidString.lowercased())") }
            } else { Text(loaded ? "This offer changed or expired. Open Requests for its current options." : "Checking the current offer and participant access.").qText("body") }
            if let notice { Text(notice).qText("caption") }
            Button("Reload current offer", variant: .quiet, disabled: busy || client == nil || route == nil) { Task { await refresh() } }
            Button("Open Requests", variant: .quiet) { open("/requests") }
        }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading) }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme)).task {
            while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(30)) } catch { return } }
        }
    }
}
