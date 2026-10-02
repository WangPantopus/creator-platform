#if os(iOS)
import Foundation
import SwiftUI
import LiveKit

/** SDK transport only; its factory stays unregistered until real host authority exists. */
@MainActor public final class LiveKitNativeCallTransport: NSObject, ObservableObject, NativeCallScreenTransport, RoomDelegate {
    private let sessionID: UUID
    private var room: Room?
    private var epoch = 0
    private var cameraAllowed = false
    private var stateChanged: (@MainActor (String) -> Void)?
    @Published private var remoteVideo: VideoTrack?
    public init(sessionID: UUID) { self.sessionID = sessionID; super.init() }
    public var mediaView: AnyView { AnyView(LiveKitCallMedia(transport: self)) }

    public func connect(admission: NativeCallAdmission, camera: Bool, onState: @escaping @MainActor (String) -> Void) async throws {
        guard NativeMediaDevicePermissions.granted(camera: camera) else { throw URLError(.noPermissionsToReadFile) }
        guard room == nil, UUID(uuidString: admission.sessionId) == sessionID,
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
        guard let room else { throw URLError(.notConnectedToInternet) }
        try await room.localParticipant.setMicrophone(enabled: enabled)
    }
    public func camera(enabled: Bool) async throws {
        guard let room, cameraAllowed else { throw URLError(.resourceUnavailable) }
        try await room.localParticipant.setCamera(enabled: enabled)
    }
    public func disconnect() async {
        epoch += 1; let current = room; room = nil; stateChanged = nil; remoteVideo = nil; cameraAllowed = false
        current?.remove(delegate: self)
        await current?.disconnect()
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
