#if os(iOS)
import Foundation
import SwiftUI
import LiveKit
import AVFoundation

/** Actual SDK media; OS composition admits it only after current backend authorization. */
@MainActor public final class LiveKitNativeCallTransport: NSObject, ObservableObject, NativeCallScreenTransport, RoomDelegate {
    private let sessionID: UUID
    private var room: Room?
    private var disconnectTask: Task<Void, Never>?
    private var controls: [UUID: Task<Void, any Error>] = [:]
    private var epoch = 0
    private var cameraAllowed = false
    private var stateChanged: (@MainActor (String) -> Void)?
    private static weak var systemAudioOwner: LiveKitNativeCallTransport?
    private var previousAutomaticAudio: Bool?
    private var previousEngineAvailability: AudioEngineAvailability?
    @Published private var remoteVideo: VideoTrack?
    public init(sessionID: UUID) { self.sessionID = sessionID; super.init() }
    public var mediaView: AnyView { AnyView(LiveKitCallMedia(transport: self)) }

    /** CallKit alone activates AVAudioSession. The SDK may establish transport
     * and publish while its audio engine is held off until didActivate. */
    internal func reserveSystemAudio() throws {
        guard Self.systemAudioOwner == nil else { throw URLError(.resourceUnavailable) }
        let manager = AudioManager.shared
        let automatic = manager.audioSession.isAutomaticConfigurationEnabled
        let availability = manager.engineAvailability
        manager.audioSession.isAutomaticConfigurationEnabled = false
        do {
            try manager.setEngineAvailability(.none)
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
            previousAutomaticAudio = automatic; previousEngineAvailability = availability
            Self.systemAudioOwner = self
        } catch {
            manager.audioSession.isAutomaticConfigurationEnabled = automatic
            try? manager.setEngineAvailability(availability)
            throw error
        }
    }
    internal func systemAudio(active: Bool) throws {
        guard Self.systemAudioOwner === self else { throw URLError(.resourceUnavailable) }
        try AudioManager.shared.setEngineAvailability(active ? .default : .none)
    }
    private func releaseSystemAudio() {
        guard Self.systemAudioOwner === self else { return }
        // Restore only after this SDK connection has drained, so a late cleanup
        // cannot stop a replacement call's audio engine.
        if let automatic = previousAutomaticAudio { AudioManager.shared.audioSession.isAutomaticConfigurationEnabled = automatic }
        if let availability = previousEngineAvailability { try? AudioManager.shared.setEngineAvailability(availability) }
        previousAutomaticAudio = nil; previousEngineAvailability = nil; Self.systemAudioOwner = nil
    }

    public func connect(admission: NativeCallAdmission, camera: Bool, onState: @escaping @MainActor (String) -> Void) async throws {
        guard NativeMediaDevicePermissions.granted(camera: camera) else { throw URLError(.noPermissionsToReadFile) }
        guard room == nil, disconnectTask == nil, UUID(uuidString: admission.sessionId) == sessionID,
              let url = URLComponents(string: admission.url), url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, !admission.token.isEmpty, admission.token.count <= 16384 else { throw URLError(.badServerResponse) }
        var allowed = url.scheme == "wss"
        #if DEBUG
        allowed = allowed || (url.scheme == "ws" && ["localhost", "127.0.0.1", "[::1]"].contains(url.host ?? ""))
        #endif
        guard allowed else { throw URLError(.secureConnectionFailed) }
        epoch += 1; let generation = epoch
        let current = Room(delegate: self)
        room = current; cameraAllowed = camera; stateChanged = onState
        do {
            try await current.connect(url: admission.url, token: admission.token)
            try Task.checkCancellation()
            guard generation == epoch, room === current else { throw CancellationError() }
            try await current.localParticipant.setMicrophone(enabled: true)
            if camera { try await current.localParticipant.setCamera(enabled: true) }
            try Task.checkCancellation()
            guard generation == epoch, room === current else { throw CancellationError() }
            updateVideo(current)
        } catch {
            if room === current { await disconnect() } else { await current.disconnect() }
            throw error
        }
    }
    public func microphone(enabled: Bool) async throws {
        guard let current = room else { throw URLError(.notConnectedToInternet) }
        let generation = epoch, id = UUID()
        let task = Task { @MainActor in _ = try await current.localParticipant.setMicrophone(enabled: enabled) }
        controls[id] = task; defer { controls.removeValue(forKey: id) }
        try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
        try Task.checkCancellation()
        guard generation == epoch, room === current else { throw CancellationError() }
    }
    public func camera(enabled: Bool) async throws {
        guard let current = room, cameraAllowed else { throw URLError(.resourceUnavailable) }
        let generation = epoch, id = UUID()
        let task = Task { @MainActor in _ = try await current.localParticipant.setCamera(enabled: enabled) }
        controls[id] = task; defer { controls.removeValue(forKey: id) }
        try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
        try Task.checkCancellation()
        guard generation == epoch, room === current else { throw CancellationError() }
    }
    public func disconnect() async {
        if let disconnectTask { await disconnectTask.value; return }
        epoch += 1; let current = room; room = nil; stateChanged = nil; remoteVideo = nil; cameraAllowed = false
        current?.remove(delegate: self)
        let pending = Array(controls.values); controls.removeAll()
        pending.forEach { $0.cancel() }
        let drain = Task { @MainActor in
            for task in pending { _ = try? await task.value }
            await current?.disconnect(); releaseSystemAudio()
        }
        disconnectTask = drain
        await drain.value; disconnectTask = nil
    }
    private func updateVideo(_ current: Room) {
        guard room === current else { return }
        remoteVideo = current.remoteParticipants.values.flatMap { $0.videoTracks }.compactMap { $0.track as? VideoTrack }.first
    }
    nonisolated public func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldConnectionState: ConnectionState) {
        Task { @MainActor in
            guard self.room === room else { return }
            switch connectionState {
            case .connected: stateChanged?("connected")
            case .reconnecting: stateChanged?("reconnecting")
            case .disconnected: remoteVideo = nil; stateChanged?("disconnected")
            default: break
            }
        }
    }
    nonisolated public func room(_ room: Room, didStartReconnectWithMode reconnectMode: ReconnectMode) {
        Task { @MainActor in if self.room === room { stateChanged?("reconnecting") } }
    }
    nonisolated public func room(_ room: Room, didCompleteReconnectWithMode reconnectMode: ReconnectMode) {
        Task { @MainActor in if self.room === room { stateChanged?("connected") } }
    }
    nonisolated public func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        Task { @MainActor in updateVideo(room) }
    }
    nonisolated public func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        Task { @MainActor in updateVideo(room) }
    }
    private struct LiveKitCallMedia: View {
        @ObservedObject var transport: LiveKitNativeCallTransport
        var body: some View {
            if let track = transport.remoteVideo { Renderer(track: track).frame(height: 240).accessibilityHidden(true) }
        }
    }
    private struct Renderer: UIViewRepresentable {
        let track: VideoTrack
        func makeUIView(context: Context) -> VideoView { VideoView() }
        func updateUIView(_ view: VideoView, context: Context) { view.track = track }
        static func dismantleUIView(_ view: VideoView, coordinator: ()) { view.track = nil }
    }
}
#endif
