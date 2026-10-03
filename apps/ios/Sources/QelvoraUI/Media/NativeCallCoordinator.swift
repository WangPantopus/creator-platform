#if os(iOS)
import AVFoundation
import CallKit
import Foundation

@MainActor
public protocol NativeRoomTransport: AnyObject {
    /** Must cooperate with cancellation; completion means actual provider media is connected. */
    func connect(sessionID: UUID) async throws
    func setAudioActive(_ active: Bool) throws
    func microphone(enabled: Bool) async throws
    /** Drain a pending connection as well as connected media before returning. */
    func disconnect() async
}
/** A CallKit action does not prove connection. Only provider media confirmation reports connected. */
@MainActor
public final class NativeCallCoordinator: NSObject, @preconcurrency CXProviderDelegate {
    private let provider: CXProvider
    private let controller = CXCallController()
    private let transport: any NativeRoomTransport
    private let authorize: @MainActor (UUID) async throws -> (name: String, video: Bool)
    private let connected: @MainActor (UUID) -> Void
    private var sessions: [UUID: UUID] = [:]
    private var answers: [UUID: (task: Task<Void, Never>, action: CXCallAction)] = [:]
    private var controls: [UUID: (callID: UUID, task: Task<Void, Never>, action: CXAction)] = [:]
    private var pendingActions: Set<UUID> = []
    private var timedOutActions: Set<UUID> = []
    private var incomingRequest: (callID: UUID, sessionID: UUID)?
    private var cleanupTask: Task<Void, Never>?
    private var cleanupGeneration = 0
    private var audioActive = false
    private var connectedCallID: UUID?
    private enum CallError: Error { case busy, cancelled }
    public init(brandName: String, transport: any NativeRoomTransport, authorize: @escaping @MainActor (UUID) async throws -> (name: String, video: Bool), connected: @escaping @MainActor (UUID) -> Void = { _ in }) {
        let configuration = CXProviderConfiguration(localizedName: brandName)
        configuration.maximumCallGroups = 1; configuration.maximumCallsPerCallGroup = 1
        configuration.supportsVideo = true; configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        self.provider = CXProvider(configuration: configuration); self.transport = transport; self.authorize = authorize; self.connected = connected
        super.init(); provider.setDelegate(self, queue: .main)
    }
    public func incoming(sessionID: UUID) async throws {
        if sessions.values.contains(sessionID) { return }
        guard sessions.isEmpty, incomingRequest == nil else { throw CallError.busy }
        let uuid = UUID()
        incomingRequest = (uuid, sessionID)
        defer { if incomingRequest?.callID == uuid { incomingRequest = nil } }
        await cleanupTask?.value
        try Task.checkCancellation()
        let identity = try await authorize(sessionID)
        guard incomingRequest?.callID == uuid, sessions.isEmpty else { throw CallError.cancelled }
        try Task.checkCancellation()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: identity.name); update.hasVideo = identity.video
        update.supportsHolding = false; update.supportsGrouping = false; update.supportsUngrouping = false; update.supportsDTMF = false
        // An answer may arrive before the reporting continuation resumes.
        sessions[uuid] = sessionID
        do {
            try await provider.reportNewIncomingCall(with: uuid, update: update)
            guard sessions[uuid] == sessionID else { throw CallError.cancelled }
        } catch {
            stop(callID: uuid, reason: .failed)
            throw error
        }
    }
    /** Only a current server-authorized call may be presented to CallKit.
     * Request acceptance is not connection; the connected callback follows the
     * actual SDK connection and a fresh authorization bookend. */
    public func outgoing(sessionID: UUID) async throws {
        guard sessions.isEmpty, incomingRequest == nil else { throw CallError.busy }
        await cleanupTask?.value
        try Task.checkCancellation()
        let identity = try await authorize(sessionID)
        guard sessions.isEmpty, incomingRequest == nil else { throw CallError.busy }
        let uuid = UUID()
        sessions[uuid] = sessionID
        let action = CXStartCallAction(call: uuid, handle: CXHandle(type: .generic, value: identity.name))
        action.isVideo = identity.video
        do {
            try await controller.request(CXTransaction(action: action))
            let update = CXCallUpdate()
            update.remoteHandle = action.handle; update.hasVideo = identity.video
            update.supportsHolding = false; update.supportsGrouping = false; update.supportsUngrouping = false; update.supportsDTMF = false
            provider.reportCall(with: uuid, updated: update)
            try Task.checkCancellation()
            guard sessions[uuid] == sessionID else { throw CallError.cancelled }
        } catch { stop(callID: uuid, reason: .failed); throw error }
    }
    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        connect(action, outgoing: true)
    }
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        connect(action, outgoing: false)
    }
    private func connect(_ action: CXCallAction, outgoing: Bool) {
        let callID = action.callUUID
        guard let sessionID = sessions[callID], answers[callID] == nil,
              connectedCallID == nil else { action.fail(); return }
        pendingActions.insert(action.uuid)
        let task = Task { @MainActor in
            defer { answers.removeValue(forKey: callID) }
            do {
                _ = try await authorize(sessionID)
                try Task.checkCancellation()
                guard sessions[callID] == sessionID else { throw CallError.cancelled }
                if outgoing { provider.reportOutgoingCall(with: callID, startedConnectingAt: Date()) }
                try await transport.connect(sessionID: sessionID)
                try Task.checkCancellation()
                // Revocation during an external connection cannot become an accepted answer.
                _ = try await authorize(sessionID)
                try Task.checkCancellation()
                guard sessions[callID] == sessionID else { throw CallError.cancelled }
                connectedCallID = callID
                try transport.setAudioActive(audioActive)
                if outgoing { provider.reportOutgoingCall(with: callID, connectedAt: Date()) }
                complete(action, succeeded: true)
                connected(sessionID)
            } catch {
                complete(action, succeeded: false)
                stop(callID: callID, reason: .failed)
            }
        }
        answers[callID] = (task, action)
    }
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        pendingActions.insert(action.uuid)
        stop(callID: action.callUUID, reason: nil)
        let drain = cleanupTask
        Task { @MainActor in
            await drain?.value
            complete(action, succeeded: true)
        }
    }
    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        guard let session = sessions[action.callUUID], connectedCallID == action.callUUID else { action.fail(); return }
        pendingActions.insert(action.uuid)
        let task = Task { @MainActor in
            defer { controls.removeValue(forKey: action.uuid) }
            do {
                _ = try await authorize(session)
                try Task.checkCancellation()
                guard sessions[action.callUUID] == session else { throw CallError.cancelled }
                try await transport.microphone(enabled: !action.isMuted)
                _ = try await authorize(session)
                try Task.checkCancellation()
                guard sessions[action.callUUID] == session else { throw CallError.cancelled }
                complete(action, succeeded: true)
            } catch { complete(action, succeeded: false) }
        }
        controls[action.uuid] = (action.callUUID, task, action)
    }
    public func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        if pendingActions.contains(action.uuid) { timedOutActions.insert(action.uuid) }
        if let call = action as? CXCallAction { stop(callID: call.callUUID, reason: .failed) }
    }
    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        audioActive = true
        if let callID = connectedCallID {
            do { try transport.setAudioActive(true) }
            catch { stop(callID: callID, reason: .failed) }
        }
    }
    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        audioActive = false
        do { try transport.setAudioActive(false) }
        catch { if let callID = connectedCallID { stop(callID: callID, reason: .failed) } }
    }
    public func providerDidReset(_ provider: CXProvider) {
        incomingRequest = nil
        audioActive = false
        for callID in Array(sessions.keys) { stop(callID: callID, reason: nil) }
    }
    public func providerConfirmedEnd(callID: UUID) { stop(callID: callID, reason: .remoteEnded) }
    public func providerConfirmedEnd(sessionID: UUID) {
        if incomingRequest?.sessionID == sessionID { incomingRequest = nil }
        for (callID, session) in Array(sessions) where session == sessionID {
            stop(callID: callID, reason: .remoteEnded)
        }
    }
    internal func drain(sessionID: UUID) async {
        providerConfirmedEnd(sessionID: sessionID)
        await cleanupTask?.value
    }
    public func end(callID: UUID) async throws { try await controller.request(CXTransaction(action: CXEndCallAction(call: callID))) }
    private func complete(_ action: CXAction, succeeded: Bool) {
        guard pendingActions.remove(action.uuid) != nil else { return }
        let timedOut = timedOutActions.remove(action.uuid) != nil
        guard !timedOut, !action.isComplete else { return }
        if succeeded { action.fulfill() } else { action.fail() }
    }
    private func stop(callID: UUID, reason: CXCallEndedReason?) {
        guard sessions.removeValue(forKey: callID) != nil else { return }
        let answer = answers.removeValue(forKey: callID)
        let changes = controls.values.filter { $0.callID == callID }
        for change in changes { complete(change.action, succeeded: false); change.task.cancel() }
        if let answer {
            complete(answer.action, succeeded: false)
            answer.task.cancel()
        }
        connectedCallID = nil
        audioActive = false
        try? transport.setAudioActive(false)
        if let reason { provider.reportCall(with: callID, endedAt: Date(), reason: reason) }
        // New arrivals wait for the old SDK operation and its cleanup. A late
        // cancelled connect cannot disconnect the next participant's transport.
        let prior = cleanupTask
        cleanupGeneration += 1
        let generation = cleanupGeneration
        cleanupTask = Task { @MainActor in
            await prior?.value
            await answer?.task.value
            for change in changes { await change.task.value }
            await transport.disconnect()
            if cleanupGeneration == generation { cleanupTask = nil }
        }
    }
}
#endif
