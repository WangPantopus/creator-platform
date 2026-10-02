import Foundation
import SwiftUI

func availabilityCreator(_ destination: String) -> UUID? {
    let parts = destination.split(separator: "/", omittingEmptySubsequences: true)
    guard parts.count == 3, parts[0] == "studio", parts[2] == "more", !destination.contains("?") else { return nil }
    return UUID(uuidString: String(parts[1]))
}

private struct AvailabilityWindow: Codable, Equatable {
    var startsAt: String
    var endsAt: String
}
private struct SavedAvailability: Decodable {
    let creatorId: UUID
    let version: Int
    let timeZone: String
    let windows: [AvailabilityWindow]
}
private struct AvailabilitySave: Encodable {
    let timeZone: String
    let windows: [AvailabilityWindow]
    let expectedVersion: Int
    let idempotencyKey: String
}

/// Current W1 session and W8 creator ownership authorize every read and save.
/// Unconfirmed saves retain their immutable command only in this account view.
@MainActor
struct NativeAvailabilityDestination: View {
    let baseURL: URL?
    @ObservedObject var model: FanSession
    var body: some View {
        if let creator = availabilityCreator(model.destination), let account = model.session?.accountId {
            NativeAvailability(creator: creator, account: account, baseURL: baseURL)
                .id("\(account):\(model.session?.sessionId ?? ""):\(creator)")
        } else { Text(QelvoraCopy.text("w6MediaAccessExpiredOrIsUnavailable")).qText("body") }
    }
}

@MainActor
private struct NativeAvailability: View {
    let creator: UUID
    let account: String
    let baseURL: URL?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scene
    @State private var current: SavedAvailability?
    @State private var zone = ""
    @State private var windows: [AvailabilityWindow] = []
    @State private var loaded = false
    @State private var fresh = false
    @State private var freshUntil = Date.distantPast
    @State private var busy = false
    @State private var replacingSavedWindows = false
    @State private var notice: String?
    @State private var command: AvailabilitySave?
    @State private var confirmRefresh = false
    @State private var mutation: Task<Void, Never>?
    @FocusState private var editedField: String?
    private var client: NativeMediaClient? {
        baseURL.map { NativeMediaClient(baseURL: $0, sessionToken: {
            guard let value = try await SecureSessionStorage().read() else { throw URLError(.userAuthenticationRequired) }
            return value
        }) }
    }
    private var root: String { "/v1/w6/creators/\(creator.uuidString.lowercased())/call-availability" }
    private var dirty: Bool {
        loaded && (zone != (current?.timeZone ?? TimeZone.current.identifier) || windows != (current?.windows ?? []))
    }
    private func instant(_ value: String) -> Date? {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$"#, options: .regularExpression) != nil else { return nil }
        let withSeconds = value.replacingOccurrences(of: #"(T\d{2}:\d{2})(?=Z|[+-])"#, with: "$1:00", options: .regularExpression)
        let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.date(from: withSeconds) ?? ISO8601DateFormatter().date(from: withSeconds)
    }
    private func sameZone(_ returned: String, _ sent: String) -> Bool {
        guard let first = NSTimeZone(name: returned), let second = NSTimeZone(name: sent) else { return false }
        return returned == sent || first.data == second.data
    }
    private func read(replace: Bool) async {
        guard !busy, scene == .active, let client, let actor = UUID(uuidString: account) else { return }
        busy = true; replacingSavedWindows = replace
        defer { busy = false; replacingSavedWindows = false }
        let started = Date()
        do {
            let value = try JSONDecoder().decode(SavedAvailability?.self, from: await client.request(path: root, expectedAccountId: actor, timeoutSeconds: 4))
            try Task.checkCancellation()
            guard scene == .active, Date() < started.addingTimeInterval(5), value == nil || (value?.creatorId == creator && (value?.version ?? 0) > 0 && (value?.windows.count ?? 0) <= 64) else { throw URLError(.badServerResponse) }
            freshUntil = started.addingTimeInterval(5); fresh = true
            if notice == QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded") { notice = nil }
            if replace || !loaded || (!dirty && command == nil && value?.version != current?.version) {
                current = value; zone = value?.timeZone ?? TimeZone.current.identifier; windows = value?.windows ?? []; loaded = true; notice = nil
            }
        } catch is CancellationError { return }
        catch let error as NativeMediaRequestError {
            fresh = false
            if [401, 403, 404].contains(error.status) || error.code == "session_account_changed" { loaded = false; current = nil; command = nil; windows = []; zone = "" }
            notice = QelvoraCopy.text(error.code == "session_account_changed" ? "w6AvailabilityAccountChanged" : "w6AvailabilityCouldNotBeLoaded")
        }
        catch { fresh = false; notice = QelvoraCopy.text("w6AvailabilityCouldNotBeLoaded") }
    }
    private func save() async {
        guard !busy, loaded, scene == .active, let client, let actor = UUID(uuidString: account) else { return }
        busy = true; defer { busy = false }
        do {
            if command == nil {
                guard TimeZone(identifier: zone) != nil, windows.count <= 64,
                      windows.allSatisfy({ instant($0.startsAt) != nil && instant($0.endsAt) != nil }) else {
                    notice = QelvoraCopy.text("w6UseISOTimesWithAnExplicitUTCOffsetForEach"); return
                }
                let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                let normalized = windows.map { AvailabilityWindow(startsAt: format.string(from: instant($0.startsAt)!), endsAt: format.string(from: instant($0.endsAt)!)) }
                command = AvailabilitySave(timeZone: zone, windows: normalized, expectedVersion: current?.version ?? 0, idempotencyKey: UUID().uuidString)
            }
            guard let sent = command else { return }
            let bytes = try await client.request(path: root, method: "PUT", body: JSONEncoder().encode(sent), expectedAccountId: actor)
            let value = try JSONDecoder().decode(SavedAvailability.self, from: bytes)
            let normalized = sent.windows.sorted { instant($0.startsAt)! < instant($1.startsAt)! }
            guard value.creatorId == creator, value.version == sent.expectedVersion + 1, sameZone(value.timeZone, sent.timeZone),
                  value.windows.count == normalized.count, zip(value.windows, normalized).allSatisfy({ pair in instant(pair.0.startsAt) == instant(pair.1.startsAt) && instant(pair.0.endsAt) == instant(pair.1.endsAt) }) else { throw URLError(.badServerResponse) }
            try Task.checkCancellation()
            guard scene == .active else { return }
            command = nil; current = value; zone = value.timeZone; windows = value.windows; freshUntil = Date().addingTimeInterval(5); fresh = true; notice = QelvoraCopy.text("w6AvailabilitySaved")
        } catch is CancellationError { return }
        catch let error as NativeMediaRequestError {
            if [400, 401, 403, 404, 409, 422].contains(error.status) { command = nil }
            if [401, 404].contains(error.status) || (error.status == 403 && !["availability_invalid", "time_zone_invalid", "availability_stale"].contains(error.code ?? "")) || error.code == "session_account_changed" { fresh = false; loaded = false; current = nil; windows = []; zone = "" }
            notice = error.code == "session_account_changed" ? QelvoraCopy.text("w6AvailabilityAccountChanged") : (command == nil ? QelvoraCopy.text("w6AvailabilityCouldNotBeSavedYourChangesAreKept") : QelvoraCopy.text("w6AvailabilitySaveIsUnconfirmed"))
        } catch { notice = command == nil ? QelvoraCopy.text("w6AvailabilityCouldNotBeSavedYourChangesAreKept") : QelvoraCopy.text("w6AvailabilitySaveIsUnconfirmed") }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                Text(QelvoraCopy.text("w6CallAvailability")).qText("display-md").accessibilityAddTraits(.isHeader)
                Text(QelvoraCopy.text("w6UseDatedWindowsEachOfferedCallAndItsReconnectAllowance")).qText("caption")
                if fresh && scene == .active {
                    Text(QelvoraCopy.text("w6YourTimeZone")).qText("caption")
                    TextField(QelvoraCopy.text("w6YourTimeZone"), text: $zone).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).disabled(replacingSavedWindows || command != nil).focused($editedField, equals: "zone").submitLabel(.done).onSubmit { editedField = nil }.accessibilityIdentifier("availability-zone")
                    ForEach(windows.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(QelvoraCopy.text("w6Window", values: ["value1": String(index + 1)])).qText("label")
                            Text(QelvoraCopy.text("w6Starts")).qText("caption")
                            TextField("YYYY-MM-DDTHH:mm±HH:mm", text: $windows[index].startsAt).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).disabled(replacingSavedWindows || command != nil).focused($editedField, equals: "start-\(index)").submitLabel(.done).onSubmit { editedField = nil }.accessibilityIdentifier("availability-start-\(index)")
                            Text(QelvoraCopy.text("w6Ends")).qText("caption")
                            TextField("YYYY-MM-DDTHH:mm±HH:mm", text: $windows[index].endsAt).textInputAutocapitalization(.never).autocorrectionDisabled().textFieldStyle(.roundedBorder).disabled(replacingSavedWindows || command != nil).focused($editedField, equals: "end-\(index)").submitLabel(.done).onSubmit { editedField = nil }.accessibilityIdentifier("availability-end-\(index)")
                            Button(QelvoraCopy.text("w6RemoveWindow", values: ["value1": String(index + 1)]), variant: .quiet, disabled: busy || command != nil) { windows.remove(at: index) }
                        }
                    }
                    if windows.isEmpty { Text(QelvoraCopy.text("w6NoWindowsSaved")).qText("caption") }
                    Button(QelvoraCopy.text("w6AddAWindow"), variant: .secondary, disabled: busy || command != nil || windows.count >= 64) { windows.append(AvailabilityWindow(startsAt: "", endsAt: "")) }
                }
                if let notice { Text(notice).qText("caption").accessibilityIdentifier("availability-notice") }
                Button(QelvoraCopy.text(command == nil ? "w6SaveAvailability" : "w6RetryAvailabilitySave"), variant: .secondary, block: true, disabled: busy || !loaded || (!fresh && command == nil) || scene != .active) { mutation = Task { await save() } }
                Button(QelvoraCopy.text("w6ReloadSavedWindows"), variant: .quiet, disabled: busy || command != nil) { if dirty { confirmRefresh = true } else { Task { await read(replace: true) } } }
            }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading)
        }.scrollDismissesKeyboard(.interactively).background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
        .confirmationDialog(QelvoraCopy.text("w6RefreshWillReplaceAvailabilityChanges"), isPresented: $confirmRefresh, titleVisibility: .visible) {
            SwiftUI.Button(QelvoraCopy.text("confirm"), role: .destructive) { Task { await read(replace: true) } }
            SwiftUI.Button(QelvoraCopy.text("cancel"), role: .cancel) {}
        }
        .task { while !Task.isCancelled { await read(replace: false); do { try await Task.sleep(for: .seconds(4)) } catch { return } } }
        .task { while !Task.isCancelled { if Date() >= freshUntil { fresh = false }; do { try await Task.sleep(for: .milliseconds(250)) } catch { return } } }
        .onChange(of: scene) { _, phase in if phase != .active { fresh = false } }
        .onDisappear { fresh = false; mutation?.cancel(); mutation = nil }
    }
}
