#if os(iOS)
import AVFoundation
import UIKit

/** OS permission is device access only. It grants no booking, participant,
 * recording, reuse or financial authority. Ask before issuing a 30s admission. */
@MainActor enum NativeMediaDevicePermissions {
    static func granted(camera: Bool) -> Bool {
        AVAudioApplication.shared.recordPermission == .granted &&
            (!camera || AVCaptureDevice.authorizationStatus(for: .video) == .authorized)
    }

    static func request(camera: Bool) async throws -> Bool {
        guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil,
              !camera || Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") != nil else { return false }
        try Task.checkCancellation()
        guard await AVAudioApplication.requestRecordPermission() else { return false }
        try Task.checkCancellation()
        if camera && AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
            guard await AVCaptureDevice.requestAccess(for: .video) else { return false }
        }
        try Task.checkCancellation()
        // Permission dismissal can precede didBecomeActive. Wait for actual
        // foreground state, while a background transition or cancellation
        // refuses the original attempt before admission or capture begins.
        for _ in 0..<50 {
            try Task.checkCancellation()
            switch UIApplication.shared.applicationState {
            case .active: return granted(camera: camera)
            case .background: return false
            case .inactive: try await Task.sleep(for: .milliseconds(100))
            @unknown default: return false
            }
        }
        return false
    }
}
#endif
