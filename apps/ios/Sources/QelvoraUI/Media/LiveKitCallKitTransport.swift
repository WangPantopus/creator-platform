#if os(iOS)
import Foundation
import SwiftUI

/** Composes the real SDK with CallKit. The caller supplies current server
 * authorization from its actual captured client; a UUID alone grants nothing. */
@MainActor internal final class LiveKitCallKitTransport: NativeCallScreenTransport {
    private let sessionID: UUID
    private let sdk: LiveKitNativeCallTransport
    private let authorize: @MainActor (UUID) async throws -> (name: String, video: Bool)
    private var coordinator: NativeCallCoordinator?
    private var admission: NativeCallAdmission?
    private var wantsCamera = false
    private var continuation: CheckedContinuation<Void, any Error>?
    private var request: Task<Void, Never>?
    private var monitor: Task<Void, Never>?
    private let isCurrent: @MainActor () async -> Bool
    private var stateChanged: (@MainActor (String) -> Void)?
    private var closed = false
    private var connecting = false
    private var cleanup: Task<Void, Never>?

    init(sessionID: UUID, isCurrent: @escaping @MainActor () async -> Bool, authorize: @escaping @MainActor (UUID) async throws -> (name: String, video: Bool)) {
        self.sessionID = sessionID; self.authorize = authorize; self.isCurrent = isCurrent
        sdk = LiveKitNativeCallTransport(sessionID: sessionID)
    }
    var mediaView: AnyView { sdk.mediaView }
    func connect(admission: NativeCallAdmission, camera: Bool, onState: @escaping @MainActor (String) -> Void) async throws {
        guard !closed, !connecting, coordinator == nil, UUID(uuidString: admission.sessionId) == sessionID else { throw CancellationError() }
        connecting = true; defer { connecting = false }
        _ = try await authorize(sessionID)
        try Task.checkCancellation()
        guard !closed else { throw CancellationError() }
        try sdk.reserveSystemAudio()
        self.admission = admission; wantsCamera = camera; stateChanged = onState
        let bridge = RoomBridge(owner: self)
        coordinator = NativeCallCoordinator(brandName: QelvoraCopy.brandName, transport: bridge, authorize: { [weak self] id in
            guard let self, !self.closed, self.sessionID == id else { throw CancellationError() }
            return try await self.authorize(id)
        }, connected: { [weak self] id in
            guard let self, !self.closed, self.sessionID == id else { return }
            self.complete(nil)
        })
        do {
            try await withTaskCancellationHandler {
                try await withCheckedThrowingContinuation { pending in
                    continuation = pending
                    request = Task { @MainActor [weak self] in
                        guard let self else { return }
                        do { try await self.coordinator?.outgoing(sessionID: self.sessionID) }
                        catch { self.complete(error); await self.disconnect() }
                    }
                }
            } onCancel: { Task { @MainActor [weak self] in await self?.disconnect() } }
            monitor = Task { @MainActor [weak self] in
                guard let self else { return }
                do {
                    var reads = 0
                    while !Task.isCancelled && !self.closed {
                        try await Task.sleep(for: .seconds(1))
                        guard await self.isCurrent() else { await self.disconnect(); return }
                        reads += 1
                        if reads % 15 == 0 { _ = try await self.authorize(self.sessionID) }
                    }
                } catch { await self.disconnect() }
            }
        } catch { await disconnect(); throw error }
    }
    func microphone(enabled: Bool) async throws {
        guard !closed else { throw CancellationError() }
        _ = try await authorize(sessionID)
        try await sdk.microphone(enabled: enabled)
        _ = try await authorize(sessionID)
    }
    func camera(enabled: Bool) async throws {
        guard !closed else { throw CancellationError() }
        _ = try await authorize(sessionID)
        try await sdk.camera(enabled: enabled)
        _ = try await authorize(sessionID)
    }
    func disconnect() async {
        if let cleanup { await cleanup.value; return }
        closed = true; complete(CancellationError()); request?.cancel(); request = nil; monitor?.cancel(); monitor = nil
        let current = coordinator; coordinator = nil; admission = nil
        stateChanged?("disconnected"); stateChanged = nil
        let sdk = sdk
        let drain = Task { @MainActor in
            await current?.drain(sessionID: sessionID)
            await sdk.disconnect()
        }
        cleanup = drain; await drain.value
    }
    private func complete(_ error: (any Error)?) {
        guard let pending = continuation else { return }
        continuation = nil
        if let error { pending.resume(throwing: error) } else { pending.resume() }
    }
    private final class RoomBridge: NativeRoomTransport {
        weak var owner: LiveKitCallKitTransport?
        init(owner: LiveKitCallKitTransport) { self.owner = owner }
        func connect(sessionID: UUID) async throws {
            guard let owner, !owner.closed, owner.sessionID == sessionID, let admission = owner.admission else { throw CancellationError() }
            try await owner.sdk.connect(admission: admission, camera: owner.wantsCamera) { [weak owner] state in
                guard let owner, !owner.closed else { return }
                owner.stateChanged?(state)
            }
        }
        func setAudioActive(_ active: Bool) throws {
            guard let owner, !owner.closed else { return }
            try owner.sdk.systemAudio(active: active)
        }
        func microphone(enabled: Bool) async throws {
            guard let owner, !owner.closed else { throw CancellationError() }
            try await owner.microphone(enabled: enabled)
        }
        func disconnect() async {
            guard let owner else { return }
            owner.closed = true; owner.complete(CancellationError())
            owner.admission = nil; owner.stateChanged?("disconnected"); owner.stateChanged = nil
            await owner.sdk.disconnect()
        }
    }
}
#endif
