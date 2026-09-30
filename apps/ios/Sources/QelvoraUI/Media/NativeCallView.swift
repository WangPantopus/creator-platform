import Foundation
import SwiftUI

public struct NativeCallRoute: Sendable {
    public let creatorID: UUID; public let fanID: UUID; public let sessionID: UUID
    public init?(destination: String) {
        let parts = destination.components(separatedBy: "?")[0].split(separator: "/")
        guard parts.count == 4, parts[0] == "calls", let creator = UUID(uuidString: String(parts[1])), let fan = UUID(uuidString: String(parts[2])), let session = UUID(uuidString: String(parts[3])) else { return nil }
        creatorID = creator; fanID = fan; sessionID = session
    }
    var path: String { "/v1/w6/threads/\(creatorID.uuidString.lowercased())/\(fanID.uuidString.lowercased())/calls/\(sessionID.uuidString.lowercased())" }
}
public struct NativeCallAdmission: Decodable, Sendable { public let token: String; public let url: String; public let sessionId: String; public let accountId: String; public let expiresAt: String }
private struct NativeCallConsent: Decodable, Sendable { let role: String; let purpose: String; let granted: Bool }
private struct NativeCallPacket: Decodable, Sendable { let summary: String; let attachmentIds: [String] }
private struct NativeCallDocument: Decodable, Sendable {
    let id: String; let commitmentId: String; let creatorName: String; let creatorAccountId: String; let fanAccountId: String
    let mediaMode: String; let scheduledAt: String; let hardEndAt: String; let durationSeconds: Int; let graceSeconds: Int
    let connectedMilliseconds: Int; let reconnectBudgetSeconds: Int; let reconnectUsedMilliseconds: Int; let serverNow: String
    let state: String; let version: Int; let recordingState: String; let consents: [NativeCallConsent]; let packet: NativeCallPacket
    let outcome: String?; let summary: String?; let summaryState: String?; let recordingOccurred: Bool?
}
/** The genuine provider adapter owns capture, rendering and OS audio activation. No adapter is registered by default. */
@MainActor public protocol NativeCallScreenTransport: AnyObject {
    var mediaView: AnyView { get }
    func connect(admission: NativeCallAdmission, onState: @escaping @MainActor (String) -> Void) async throws
    func microphone(enabled: Bool) async throws
    func camera(enabled: Bool) async throws
    func disconnect() async
}
@MainActor public enum NativeCallTransports { public static var create: ((UUID) -> any NativeCallScreenTransport)? }

/** Uses persisted server state and real account credentials; no local delivered-time clock or default creator. */
@MainActor public struct NativeCallView: View {
    private let client: NativeMediaClient?; private let route: NativeCallRoute?; private let actorAccountID: String?; private let open: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    @State private var call: NativeCallDocument?
    @State private var error: String?
    @State private var stale = true
    @State private var busy = false
    @State private var fetching = false
    @State private var leaving = false
    @State private var muted = false
    @State private var camera = false
    @State private var localState = "disconnected"
    @State private var transport: (any NativeCallScreenTransport)?
    public init(baseURL: URL?, destination: String, actorAccountID: String?, open: @escaping (String) -> Void = { _ in }) {
        route = NativeCallRoute(destination: destination); self.actorAccountID = actorAccountID; self.open = open
        client = baseURL.map { NativeMediaClient(baseURL: $0, sessionToken: { guard let value = try await SecureSessionStorage().read() else { throw URLError(.userAuthenticationRequired) }; return value }) }
    }
    private func clock(_ milliseconds: Int) -> String { String(format: "%02d:%02d", max(0, milliseconds) / 60000, max(0, milliseconds) / 1000 % 60) }
    private func role(_ value: NativeCallDocument) -> String? { actorAccountID == value.creatorAccountId ? "creator" : actorAccountID == value.fanAccountId ? "fan" : nil }
    private func bothSummary(_ value: NativeCallDocument) -> Bool { ["creator", "fan"].allSatisfy { r in value.consents.contains { $0.role == r && $0.purpose == "summary" && $0.granted } } }
    private func date(_ value: String) -> Date? { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) }
    private func countdown(_ value: NativeCallDocument) -> String {
        if value.state == "reconnecting" { return "Reconnecting · \(clock(value.reconnectBudgetSeconds * 1000 - value.reconnectUsedMilliseconds)) allowance left" }
        if value.state == "ending" { return "Ending · confirming provider history" }
        if let now = date(value.serverNow), let scheduled = date(value.scheduledAt), now < scheduled { return "Starts in \(clock(Int(scheduled.timeIntervalSince(now) * 1000)))" }
        return "Waiting for both participants"
    }
    private func refresh() async {
        guard !fetching, !busy, let client, let route else { return }; fetching = true; defer { fetching = false }
        do {
            let value = try JSONDecoder().decode(NativeCallDocument.self, from: await client.request(path: route.path))
            if value.version >= (call?.version ?? 0) { call = value }; stale = false
            if ["ending", "ended", "cancelled"].contains(value.state) { await transport?.disconnect(); localState = "disconnected" }
        } catch is CancellationError { }
        catch { stale = true; self.error = "Reconnect to refresh this call. Actions are unavailable until access is confirmed." }
    }
    private func action(_ name: String, values: [String: Any] = [:]) async {
        guard !busy, !stale, let call, role(call) != nil, let client, let route else { return }; busy = true; error = nil; defer { busy = false }
        do {
            var body = values; body["expectedVersion"] = call.version; body["idempotencyKey"] = UUID().uuidString
            let result = try await client.request(path: route.path + "/" + name, method: "POST", body: JSONSerialization.data(withJSONObject: body))
            self.call = try JSONDecoder().decode(NativeCallDocument.self, from: result)
            if name == "end" { await transport?.disconnect(); localState = "disconnected"; leaving = false }
        } catch { self.error = "This action could not complete. Refresh the call before trying again."; stale = true }
    }
    private func join() async {
        guard !busy, !stale, let call, role(call) != nil, let client, let route else { return }
        guard let adapter = NativeCallTransports.create?(route.sessionID) else { error = "Calling is not connected yet. Your booking is unchanged."; return }
        busy = true; error = nil; defer { busy = false }
        do {
            let admission = try JSONDecoder().decode(NativeCallAdmission.self, from: await client.request(path: route.path + "/join", method: "POST", body: Data("{}".utf8)))
            transport = adapter; camera = call.mediaMode == "video"
            try await adapter.connect(admission: admission, onState: { localState = $0 })
        } catch { await adapter.disconnect(); self.error = "Connection failed. Rejoin the same call." }
    }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                if let call {
                    let live = ["connected", "reconnecting", "ending"].contains(call.state)
                    let ended = ["ended", "cancelled"].contains(call.state)
                    if live { CallChip(name: call.creatorName, time: clock(call.connectedMilliseconds), end: clock(call.durationSeconds * 1000), recording: call.recordingState == "on") }
                    else {
                        Text("\(call.durationSeconds / 60)-MINUTE \(call.mediaMode.uppercased()) CALL").qText("label")
                        Text(ended ? (call.state == "cancelled" ? "This call was cancelled." : call.outcome == "completed" ? "You spoke with \(call.creatorName) for \(call.connectedMilliseconds / 60000) minutes." : "Call outcome: \(call.outcome?.replacingOccurrences(of: "_", with: " ") ?? "being reconciled")") : "\(date(call.scheduledAt)?.formatted(date: .complete, time: .shortened) ?? call.scheduledAt) with \(call.creatorName)").qText("display-md")
                    }
                    if !ended && !(call.state == "connected" && localState == "connected") { Countdown(tone: .soon, children: countdown(call)) }
                    if stale { Notice(tone: .error, title: "Connection lost", children: "Displayed times are from the last server update.") }
                    if !live && !ended {
                        Text("\(call.durationSeconds / 60) minutes, fixed · no overtime charge").qText("body")
                        Text("Shared with \(call.creatorName)").qText("label"); Text(call.packet.summary).qText("body")
                        Text("\(call.packet.attachmentIds.count) shared files · \(TimeZone.current.identifier)").qText("caption")
                        Text("Request \(call.commitmentId)").qText("caption")
                        Text("Joining early starts nothing. The connected timer pauses during a drop, up to \(call.reconnectBudgetSeconds / 60) minutes total.").qText("caption")
                        Button("Enter the waiting room", variant: .secondary, block: true, disabled: busy || stale || role(call) == nil) { Task { await join() } }
                    }
                    if live {
                        if let transport { transport.mediaView.frame(minHeight: 260).background(qColor("maya-surface", scheme)).clipShape(RoundedRectangle(cornerRadius: 24)) }
                        else { Text("Media connection is unavailable.").qText("body") }
                        HStack {
                            Button(muted ? "Unmute" : "Mute", variant: .secondary, disabled: busy || stale || transport == nil) { Task { do { try await transport?.microphone(enabled: muted); muted.toggle() } catch { self.error = "Microphone change failed." } } }
                            Button("Camera", variant: .secondary, disabled: busy || stale || transport == nil || call.mediaMode != "video") { Task { do { try await transport?.camera(enabled: !camera); camera.toggle() } catch { self.error = "Camera change failed." } } }
                        }
                        HStack { Button("Report", variant: .secondary) { open("/support") }; Button("Leave", variant: .secondary, disabled: busy || stale || role(call) == nil) { leaving = true } }
                    }
                    if live || call.state == "ended" {
                        Text(call.state == "ended" ? "Both of you can get a short summary" : "Separate permissions").qText("title")
                        ForEach(["recording", "summary", "content_reuse", "ai_source"].filter { call.state != "ended" || $0 != "recording" }, id: \.self) { purpose in
                            Toggle(purpose == "summary" ? "I'd like a summary" : purpose == "recording" ? "Allow recording" : purpose == "content_reuse" ? "Allow content reuse" : "Allow use as an AI source", isOn: Binding(get: { call.consents.contains { $0.role == role(call) && $0.purpose == purpose && $0.granted } }, set: { granted in Task { await action("consent", values: ["purpose": purpose, "granted": granted]) } })).disabled(busy || stale || role(call) == nil)
                        }
                        Text("Each purpose needs both people's permission. Without recording permission, a summary uses only the packet and a creator-typed note.").qText("caption")
                        if let summary = call.summary, bothSummary(call) { Text(summary).qText("body"); Button("Delete this summary", variant: .quiet, disabled: busy || stale) { Task { await action("delete-summary") } } }
                        if call.summaryState == "pending" { Text("Summary queued · available when its provider completes.").qText("caption") }
                    }
                    if call.state == "ended" {
                        Text("Call receipt").qText("title"); Text("Connected \(clock(call.connectedMilliseconds)) of \(clock(call.durationSeconds * 1000))").qText("body")
                        Text(call.recordingOccurred == true ? "Recorded with consent" : "No recording was confirmed").qText("caption")
                        Button("View Requests for settlement", variant: .secondary) { open("/requests") }
                    }
                } else {
                    Text("This call is unavailable").qText("display-md")
                    Text(route == nil ? "Open this call from its authorized request link." : "Checking the booking and participant access.").qText("body")
                }
                if let error { Text(error).qText("caption") }
                Button("Refresh call", variant: .quiet, disabled: busy || fetching || client == nil || route == nil) { Task { await refresh() } }
            }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task { while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(1)) } catch { return } } }
            .onDisappear { let current = transport; Task { await current?.disconnect() } }
            .confirmationDialog("End this call?", isPresented: $leaving, titleVisibility: .visible) {
                SwiftUI.Button("End by choice") { if let call { Task { await action("end", values: role(call) == "fan" ? ["fanChoice": "end_by_choice"] : [:]) } } }
                if let call, role(call) == "fan" { SwiftUI.Button("Technical problem") { Task { await action("end", values: ["fanChoice": "technical_problem"]) } } }
            } message: { Text("A fan ending by choice counts as a completed call after actual connected time. Technical problems and creator early ends are reconciled before settlement.") }
    }
}
