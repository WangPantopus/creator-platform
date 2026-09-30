#if os(iOS)
import AVFoundation
import CallKit
import Foundation

@MainActor
public protocol NativeRoomTransport: AnyObject {
    func connect(sessionID: UUID) async throws
    func setAudioActive(_ active: Bool)
    func disconnect() async
}
/** A CallKit action does not prove connection. Only provider media confirmation reports connected. */
@MainActor
public final class NativeCallCoordinator: NSObject, @preconcurrency CXProviderDelegate {
    private let provider: CXProvider
    private let controller = CXCallController()
    private let transport: any NativeRoomTransport
    private let authorize: @MainActor (UUID) async throws -> (name: String, video: Bool)
    private var sessions: [UUID: UUID] = [:]
    public init(brandName: String, transport: any NativeRoomTransport, authorize: @escaping @MainActor (UUID) async throws -> (name: String, video: Bool)) {
        let configuration = CXProviderConfiguration(localizedName: brandName)
        configuration.maximumCallGroups = 1; configuration.maximumCallsPerCallGroup = 1
        configuration.supportsVideo = true; configuration.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: configuration); self.transport = transport; self.authorize = authorize
        super.init(); provider.setDelegate(self, queue: .main)
    }
    public func incoming(sessionID: UUID) async throws {
        let identity = try await authorize(sessionID)
        let uuid = UUID(); let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: identity.name); update.hasVideo = identity.video
        try await provider.reportNewIncomingCall(with: uuid, update: update); sessions[uuid] = sessionID
    }
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard let sessionID = sessions[action.callUUID] else { action.fail(); return }
        Task { @MainActor in
            do { _ = try await authorize(sessionID); try await transport.connect(sessionID: sessionID); action.fulfill() }
            catch { action.fail(); provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .failed) }
        }
    }
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in await transport.disconnect(); sessions.removeValue(forKey: action.callUUID); action.fulfill() }
    }
    public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) { transport.setAudioActive(true) }
    public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) { transport.setAudioActive(false) }
    public func providerDidReset(_ provider: CXProvider) { sessions.removeAll(); Task { @MainActor in await transport.disconnect() } }
    public func providerConfirmedEnd(callID: UUID) { provider.reportCall(with: callID, endedAt: Date(), reason: .remoteEnded); sessions.removeValue(forKey: callID) }
    public func end(callID: UUID) async throws { try await controller.request(CXTransaction(action: CXEndCallAction(call: callID))) }
}
#endif
