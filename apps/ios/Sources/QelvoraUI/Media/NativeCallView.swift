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
public struct NativeCallAdmission: Decodable, Sendable { public let token: String; public let url: String; public let nonce: String; public let sessionId: String; public let accountId: String; public let expiresAt: String; public let role: String }
private struct NativeCallRedemption: Decodable { let admitted: Bool }
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
    func connect(admission: NativeCallAdmission, camera: Bool, onState: @escaping @MainActor (String) -> Void) async throws
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
    @State private var mediaEpoch = 0
    @State private var active = true
    public init(baseURL: URL?, destination: String, actorAccountID: String?, open: @escaping (String) -> Void = { _ in }) {
        route = NativeCallRoute(destination: destination); self.actorAccountID = actorAccountID; self.open = open
        client = baseURL.map { NativeMediaClient(baseURL: $0, sessionToken: { guard let value = try await SecureSessionStorage().read() else { throw URLError(.userAuthenticationRequired) }; return value }) }
    }
    private func clock(_ milliseconds: Int) -> String { String(format: "%02d:%02d", max(0, milliseconds) / 60000, max(0, milliseconds) / 1000 % 60) }
    private func role(_ value: NativeCallDocument) -> String? { actorAccountID == value.creatorAccountId ? "creator" : actorAccountID == value.fanAccountId ? "fan" : nil }
    private func bothSummary(_ value: NativeCallDocument) -> Bool { ["creator", "fan"].allSatisfy { r in value.consents.contains { $0.role == r && $0.purpose == "summary" && $0.granted } } }
    private func date(_ value: String) -> Date? { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value) }
    private func countdown(_ value: NativeCallDocument) -> String {
        if value.state == "reconnecting" { return QelvoraCopy.text("w6ReconnectingAllowanceLeft", values: ["value1": String(describing: clock(value.reconnectBudgetSeconds * 1000 - value.reconnectUsedMilliseconds))]) }
        if value.state == "ending" { return QelvoraCopy.text("w6EndingConfirmingProviderHistory") }
        if let now = date(value.serverNow), let scheduled = date(value.scheduledAt), now < scheduled { return QelvoraCopy.text("w6StartsIn", values: ["value1": String(describing: clock(Int(scheduled.timeIntervalSince(now) * 1000)))]) }
        return QelvoraCopy.text("w6WaitingForBothParticipants")
    }
    private func refresh() async {
        guard !fetching, !busy, let client, let route else { return }; fetching = true; defer { fetching = false }
        do {
            let value = try JSONDecoder().decode(NativeCallDocument.self, from: await client.request(path: route.path))
            try Task.checkCancellation()
            guard active else { return }
            if value.version >= (call?.version ?? 0) { call = value }; stale = false
            if ["ending", "ended", "cancelled"].contains(value.state) { await disconnectMedia() }
        } catch is CancellationError { }
        catch {
            guard active else { return }
            if let failure = error as? NativeMediaRequestError, [401, 403, 404].contains(failure.status) { await disconnectMedia(); call = nil }
            stale = true; self.error = QelvoraCopy.text("w6ReconnectToRefreshThisCallActionsAreUnavailableUntilAccess")
        }
    }
    private func disconnectMedia() async {
        mediaEpoch += 1; let current = transport; transport = nil; localState = "disconnected"
        await current?.disconnect()
    }
    private func action(_ name: String, values: [String: Any] = [:]) async {
        guard !busy, !stale, let call, role(call) != nil, let client, let route else { return }; busy = true; error = nil; defer { busy = false }
        do {
            var body = values; body["expectedVersion"] = call.version; body["idempotencyKey"] = UUID().uuidString
            let result = try await client.request(path: route.path + "/" + name, method: "POST", body: JSONSerialization.data(withJSONObject: body))
            self.call = try JSONDecoder().decode(NativeCallDocument.self, from: result)
            if name == "end" { await disconnectMedia(); leaving = false }
        } catch { self.error = QelvoraCopy.text("w6ThisActionCouldNotCompleteRefreshTheCallBeforeTrying"); stale = true }
    }
    private func join() async {
        guard active, !busy, !stale, transport == nil || localState == "disconnected", let call, role(call) != nil, let client, let route else { return }
        guard let adapter = NativeCallTransports.create?(route.sessionID) else { error = QelvoraCopy.text("w6CallingIsNotConnectedYetYourBookingIsUnchanged"); return }
        busy = true; error = nil; defer { busy = false }
        mediaEpoch += 1; let epoch = mediaEpoch
        do {
            let admission = try JSONDecoder().decode(NativeCallAdmission.self, from: await client.request(path: route.path + "/join", method: "POST", body: Data("{}".utf8)))
            try Task.checkCancellation()
            guard active, epoch == mediaEpoch else { return }
            guard UUID(uuidString: admission.sessionId) == route.sessionID,
                  admission.accountId.lowercased() == actorAccountID?.lowercased(),
                  admission.role == role(call), UUID(uuidString: admission.nonce) != nil,
                  let expires = date(admission.expiresAt), expires > Date() else { throw URLError(.badServerResponse) }
            let receipt = try await client.request(path: route.path + "/redeem", method: "POST", body: JSONSerialization.data(withJSONObject: ["nonce": admission.nonce]))
            try Task.checkCancellation()
            guard active, epoch == mediaEpoch else { return }
            guard try JSONDecoder().decode(NativeCallRedemption.self, from: receipt).admitted,
                  admission.accountId.lowercased() == actorAccountID?.lowercased(),
                  expires > Date() else { throw URLError(.badServerResponse) }
            transport = adapter; camera = call.mediaMode == "video"
            try await adapter.connect(admission: admission, camera: camera, onState: { if active && epoch == mediaEpoch { localState = $0 } })
            if !active || epoch != mediaEpoch { await adapter.disconnect() }
        } catch {
            await adapter.disconnect()
            guard active, epoch == mediaEpoch else { return }
            transport = nil; localState = "disconnected"; self.error = QelvoraCopy.text("w6ConnectionFailedRejoinTheSameCall")
        }
    }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                if let call {
                    let live = ["connected", "reconnecting", "ending"].contains(call.state)
                    let ended = ["ended", "cancelled"].contains(call.state)
                    if live { CallChip(name: call.creatorName, time: clock(call.connectedMilliseconds), end: clock(call.durationSeconds * 1000), recording: ["on", "stopping"].contains(call.recordingState)) }
                    if ["starting", "stopping", "blocked"].contains(call.recordingState) { Text(call.recordingState == "stopping" ? QelvoraCopy.text("w6RecordingStopRequestedAwaitingProviderConfirmation") : call.recordingState == "starting" ? QelvoraCopy.text("w6RecordingStartRequestedAwaitingProviderConfirmation") : QelvoraCopy.text("w6RecordingStatusNeedsConfirmation")).qText("caption") }
                    else {
                        Text(QelvoraCopy.text("w6MINUTECALL", values: ["value1": String(call.durationSeconds / 60), "value2": call.mediaMode.uppercased()])).qText("label")
                        Text(ended ? (call.state == "cancelled" ? QelvoraCopy.text("w6ThisCallWasCancelled") : call.outcome == "completed" ? QelvoraCopy.text("w6YouSpokeWithForMinutesa8bf6c", values: ["value1": String(describing: call.creatorName), "value2": String(describing: call.connectedMilliseconds / 60000)]) : QelvoraCopy.text("w6CallOutcome", values: ["value1": String(describing: call.outcome?.replacingOccurrences(of: "_", with: " ") ?? QelvoraCopy.text("w6BeingReconciled"))])) : QelvoraCopy.text("w6With", values: ["value1": date(call.scheduledAt)?.formatted(date: .complete, time: .shortened) ?? call.scheduledAt, "value2": call.creatorName])).qText("display-md")
                    }
                    if !ended && !(call.state == "connected" && localState == "connected") { Countdown(tone: .soon, children: countdown(call)) }
                    if stale { Notice(tone: .error, title: QelvoraCopy.text("w6ConnectionLost"), children: QelvoraCopy.text("w6DisplayedTimesAreFromTheLastServerUpdate")) }
                    if !live && !ended {
                        Text(QelvoraCopy.text("w6MinutesFixedNoOvertimeCharge", values: ["value1": String(describing: call.durationSeconds / 60)])).qText("body")
                        Text(QelvoraCopy.text("w6SharedWith", values: ["value1": String(describing: call.creatorName)])).qText("label"); Text(call.packet.summary).qText("body")
                        Text(QelvoraCopy.text("w6SharedFilesInZone", values: ["value1": String(call.packet.attachmentIds.count), "value2": TimeZone.current.identifier])).qText("caption")
                        Text(QelvoraCopy.text("w6Requestfc03f5", values: ["value1": String(describing: call.commitmentId)])).qText("caption")
                        Text(QelvoraCopy.text("w6JoiningEarlyStartsNothingTheConnectedTimerPausesDuringA", values: ["value1": String(describing: call.reconnectBudgetSeconds / 60)])).qText("caption")
                        Button(QelvoraCopy.text("w6EnterTheWaitingRoom"), variant: .secondary, block: true, disabled: busy || stale || role(call) == nil) { Task { await join() } }
                    }
                    if live {
                        if let transport { transport.mediaView.frame(minHeight: 260).background(qColor("maya-surface", scheme)).clipShape(RoundedRectangle(cornerRadius: 24)) }
                        else { Text(QelvoraCopy.text("w6MediaConnectionIsUnavailable")).qText("body") }
                        HStack {
                            Button(muted ? QelvoraCopy.text("w6Unmute") : QelvoraCopy.text("w6Mute"), variant: .secondary, disabled: busy || stale || transport == nil) { Task { do { try await transport?.microphone(enabled: muted); muted.toggle() } catch { self.error = QelvoraCopy.text("w6MicrophoneChangeFailed") } } }
                            Button(QelvoraCopy.text("w6Camera"), variant: .secondary, disabled: busy || stale || transport == nil || call.mediaMode != "video") { Task { do { try await transport?.camera(enabled: !camera); camera.toggle() } catch { self.error = QelvoraCopy.text("w6CameraChangeFailed") } } }
                        }
                        HStack { Button(QelvoraCopy.text("w6Report"), variant: .secondary) { open("/support") }; Button(QelvoraCopy.text("w6Leave"), variant: .secondary, disabled: busy || stale || role(call) == nil) { leaving = true } }
                    }
                    if live || ended {
                        Text(call.state == "ended" ? QelvoraCopy.text("w6BothOfYouCanGetAShortSummary") : QelvoraCopy.text("w6SeparatePermissions")).qText("title")
                        ForEach(["recording", "summary", "content_reuse", "ai_source"].filter { purpose in
                            let granted = call.consents.contains { $0.role == role(call) && $0.purpose == purpose && $0.granted }
                            if call.state == "cancelled" { return granted }
                            return purpose != "recording" || !["ending", "ended"].contains(call.state) || granted
                        }, id: \.self) { purpose in
                            Toggle(purpose == "summary" ? QelvoraCopy.text("w6IDLikeASummary") : purpose == "recording" ? QelvoraCopy.text("w6AllowRecording") : purpose == "content_reuse" ? QelvoraCopy.text("w6AllowContentReuse") : QelvoraCopy.text("w6AllowUseAsAnAISource"), isOn: Binding(get: { call.consents.contains { $0.role == role(call) && $0.purpose == purpose && $0.granted } }, set: { granted in Task { await action("consent", values: ["purpose": purpose, "granted": granted]) } })).disabled(busy || stale || role(call) == nil)
                        }
                        Text(QelvoraCopy.text("w6EachPurposeNeedsBothPeopleSPermissionWithoutRecordingPermission8487ed")).qText("caption")
                        if let summary = call.summary, bothSummary(call) { Text(summary).qText("body"); Button(QelvoraCopy.text("w6DeleteThisSummary"), variant: .quiet, disabled: busy || stale) { Task { await action("delete-summary") } } }
                        if call.summaryState == "pending" { Text(QelvoraCopy.text("w6SummaryQueuedAvailableWhenItsProviderCompletes")).qText("caption") }
                    }
                    if call.state == "ended" {
                        Text(QelvoraCopy.text("w6CallReceipt")).qText("title"); Text(QelvoraCopy.text("w6ConnectedOf", values: ["value1": String(describing: clock(call.connectedMilliseconds)), "value2": String(describing: clock(call.durationSeconds * 1000))])).qText("body")
                        Text(call.recordingOccurred == true ? QelvoraCopy.text("w6RecordingOccurredCheckTheConsentHistory") : QelvoraCopy.text("w6NoRecordingWasConfirmed")).qText("caption")
                        Button(QelvoraCopy.text("w6ViewRequestsForSettlement"), variant: .secondary) { open("/requests") }
                    }
                } else {
                    Text(QelvoraCopy.text("w6ThisCallIsUnavailable")).qText("display-md")
                    Text(route == nil ? QelvoraCopy.text("w6OpenThisCallFromItsAuthorizedRequestLink") : QelvoraCopy.text("w6CheckingTheBookingAndParticipantAccess")).qText("body")
                }
                if let error { Text(error).qText("caption") }
                Button(QelvoraCopy.text("w6RefreshCall"), variant: .quiet, disabled: busy || fetching || client == nil || route == nil) { Task { await refresh() } }
            }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .task { while !Task.isCancelled { await refresh(); do { try await Task.sleep(for: .seconds(1)) } catch { return } } }
            .onAppear { active = true }
            .onChange(of: actorAccountID) { _, _ in Task { await disconnectMedia(); call = nil; stale = true } }
            .onDisappear { active = false; mediaEpoch += 1; let current = transport; transport = nil; localState = "disconnected"; Task { await current?.disconnect() } }
            .confirmationDialog(QelvoraCopy.text("w6EndThisCall"), isPresented: $leaving, titleVisibility: .visible) {
                SwiftUI.Button(QelvoraCopy.text("w6EndByChoice")) { if let call { Task { await action("end", values: role(call) == "fan" ? ["fanChoice": "end_by_choice"] : [:]) } } }
                if let call, role(call) == "fan" { SwiftUI.Button(QelvoraCopy.text("w6TechnicalProblem")) { Task { await action("end", values: ["fanChoice": "technical_problem"]) } } }
            } message: { Text(QelvoraCopy.text("w6AFanEndingByChoiceCountsAsACompletedCall")) }
    }
}
