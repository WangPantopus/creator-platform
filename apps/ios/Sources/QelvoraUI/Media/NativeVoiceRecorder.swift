import AVFoundation
import SwiftUI

/// Only a cold process has no live private recording to preserve.
@MainActor enum VoiceRecordingCache {
    private static var prepared = false
    // Preserve failed deletion custody even when the owning view disappears.
    private static var pendingDeletion: Set<URL> = []
    static func discard(_ file: URL) -> Bool {
        let location = file.standardizedFileURL
        let manager = FileManager.default
        let stem = location.deletingPathExtension().lastPathComponent
        let identifier = String(stem.dropFirst("voice-".count))
        guard location.deletingLastPathComponent() == manager.temporaryDirectory.standardizedFileURL,
              location.pathExtension == "m4a", stem.hasPrefix("voice-"),
              let id = UUID(uuidString: identifier), id.uuidString.caseInsensitiveCompare(identifier) == .orderedSame else { return false }
        pendingDeletion.insert(location)
        do {
            let values = try location.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isSymbolicLink != true, values.isRegularFile == true else { return false }
            try manager.removeItem(at: location)
        } catch {
            guard (error as? CocoaError)?.code == .fileReadNoSuchFile || (error as? CocoaError)?.code == .fileNoSuchFile else { return false }
        }
        pendingDeletion.remove(location)
        return true
    }
    static func prepare() -> Bool {
        for file in Array(pendingDeletion) { if !discard(file) { return false } }
        if prepared { return true }
        let manager = FileManager.default
        do {
            let keys: Set<URLResourceKey> = [.isRegularFileKey, .isSymbolicLinkKey]
            let files = try manager.contentsOfDirectory(at: manager.temporaryDirectory, includingPropertiesForKeys: Array(keys))
            for file in files {
                let stem = file.deletingPathExtension().lastPathComponent
                guard file.pathExtension == "m4a", stem.hasPrefix("voice-") else { continue }
                let identifier = String(stem.dropFirst("voice-".count))
                guard let id = UUID(uuidString: identifier), id.uuidString.caseInsensitiveCompare(identifier) == .orderedSame else { continue }
                let values = try file.resourceValues(forKeys: keys)
                guard values.isSymbolicLink != true, values.isRegularFile == true else { continue }
                guard discard(file) else { return false }
            }
            prepared = true
            return true
        } catch { return false }
    }
}

@MainActor
public final class NativeVoiceRecorder: NSObject, ObservableObject, @preconcurrency AVAudioRecorderDelegate {
    public enum State: String { case idle, requesting, recording, paused, preview, denied, failed }
    @Published public private(set) var state: State = .idle
    @Published public private(set) var duration: TimeInterval = 0
    @Published public private(set) var reason: String?
    @Published public private(set) var file: URL?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var clock: Task<Void, Never>?
    private var observers: [NSObjectProtocol] = []
    private var generation = 0
    public let maximumDuration: TimeInterval

    public init(maximumDuration: TimeInterval) {
        precondition(maximumDuration > 0)
        self.maximumDuration = maximumDuration
        super.init()
        if !VoiceRecordingCache.prepare() {
            state = .failed; reason = QelvoraCopy.text("w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore")
        }
        #if os(iOS)
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.pause(interrupted: true) }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.state == .recording else { return }
                self.pause(interrupted: true)
                self.reason = QelvoraCopy.text("w6AudioRouteChangedCheckYourMicrophoneThenResumeOrRecord")
            }
        })
        #endif
    }
    public func start() async {
        guard discard() else { return }
        guard VoiceRecordingCache.prepare() else {
            state = .failed; reason = QelvoraCopy.text("w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore"); return
        }
        let requestGeneration = generation
        #if os(iOS)
        guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil else {
            state = .failed; reason = QelvoraCopy.text("w6MicrophoneRecordingIsUnavailableInThisAppBuild"); return
        }
        state = .requesting
        let allowed = (try? await NativeMediaDevicePermissions.request(camera: false)) == true
        guard requestGeneration == generation else { return }
        guard allowed else {
            let access = NativeMediaDevicePermissions.granted(camera: false)
            state = access ? .failed : .denied
            reason = QelvoraCopy.text(access ? "w6TheMicrophoneIsUnavailableTryAgain" : "w6MicrophoneAccessIsOffAllowItInSettingsThenTry")
            return
        }
        #endif
        var attemptedFile: URL?
        do {
            #if os(iOS)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try audioSession.setActive(true)
            #endif
            let location = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
            attemptedFile = location
            let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96000, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            let audio = try AVAudioRecorder(url: location, settings: settings)
            audio.delegate = self
            guard audio.prepareToRecord(), audio.record() else { throw CocoaError(.fileWriteUnknown) }
            recorder = audio; file = location; state = .recording; reason = nil
            clock = Task { @MainActor [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(100))
                    guard !Task.isCancelled, let self else { return }
                    self.duration = min(self.maximumDuration, self.recorder?.currentTime ?? self.duration)
                    if self.duration >= self.maximumDuration { self.stop(); return }
                }
            }
        } catch {
            // Failed hardware preparation can still leave a private header.
            // Keep its custody if deletion fails, before allowing another act.
            let cleared = attemptedFile.map { VoiceRecordingCache.discard($0) } ?? true
            if !cleared { file = attemptedFile }
            state = .failed; reason = QelvoraCopy.text(cleared ? "w6TheMicrophoneIsUnavailableTryAgain" : "w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore"); deactivate()
        }
    }
    public func pause(interrupted: Bool = false) {
        if interrupted && state == .requesting {
            generation += 1; state = .idle
            reason = QelvoraCopy.text("w6MicrophoneRequestCancelledAfterAnInterruptionRecordWhenYouReturn")
            return
        }
        guard state == .recording else { return }
        duration = recorder?.currentTime ?? duration; recorder?.pause(); state = .paused
        if interrupted { reason = QelvoraCopy.text("w6RecordingPausedAfterAnInterruptionResumeOrPreviewWhatWas") }
    }
    public func resume() {
        guard state == .paused else { return }
        do {
            #if os(iOS)
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            guard recorder?.record() == true else { throw CocoaError(.fileWriteUnknown) }
            state = .recording; reason = nil
        } catch { reason = QelvoraCopy.text("w6RecordingCouldNotResumePreviewItOrRecordAgain") }
    }
    public func stop() {
        guard state == .recording || state == .paused else { return }
        duration = min(maximumDuration, recorder?.currentTime ?? duration)
        recorder?.stop(); clock?.cancel(); clock = nil; recorder = nil
        state = duration > 0 ? .preview : .failed; deactivate()
    }
    public func preview() {
        guard state == .preview, let file else { return }
        do {
            #if os(iOS)
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            player = try AVAudioPlayer(contentsOf: file); player?.play()
        } catch { reason = QelvoraCopy.text("w6TheSavedRecordingCouldNotBePlayedRecordAgain") }
    }
    public func seek(to seconds: TimeInterval) { player?.currentTime = min(duration, max(0, seconds)) }
    public func pausePreview() { player?.pause() }
    @discardableResult public func discard() -> Bool {
        generation += 1; clock?.cancel(); clock = nil; recorder?.stop(); recorder = nil; player?.stop(); player = nil
        duration = 0; deactivate()
        if let file, !VoiceRecordingCache.discard(file) {
            state = .failed; reason = QelvoraCopy.text("w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore"); return false
        }
        file = nil; state = .idle; reason = nil
        return true
    }
    private func deactivate() {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        guard self.recorder === recorder else { return }
        stop(); reason = QelvoraCopy.text("w6RecordingWasInterruptedPreviewWhatWasSavedOrRecordAgain")
    }
}

public struct MediaRecordingView: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var recorder: NativeVoiceRecorder
    public init(maximumDuration: TimeInterval = 60) { _recorder = StateObject(wrappedValue: NativeVoiceRecorder(maximumDuration: maximumDuration)) }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: QelvoraTokens.space5) {
                Text(QelvoraCopy.text("w6YourOwnVoice")).qText("display-md")
                Text(QelvoraCopy.text("w6RecordAndListenBeforeUploadingYourPreviewStaysOnThis")).qText("body")
                Text(String(format: "%d:%02d", Int(recorder.duration) / 60, Int(recorder.duration) % 60)).qText("data-lg").accessibilityLabel(QelvoraCopy.text("w6SecondsRecorded", values: ["value1": String(describing: Int(recorder.duration))]))
                Text(QelvoraCopy.text("w6UpToSeconds", values: ["value1": String(describing: Int(recorder.maximumDuration))])).qText("caption")
                if recorder.state == .recording || recorder.state == .paused {
                    Button(recorder.state == .recording ? QelvoraCopy.text("w6Pause") : QelvoraCopy.text("w6Resume"), variant: .secondary) { if recorder.state == .recording { recorder.pause() } else { recorder.resume() } }
                    Button(QelvoraCopy.text("w6StopAndPreview"), variant: .secondary) { recorder.stop() }
                } else if recorder.state == .requesting {
                    Button(QelvoraCopy.text("w6CancelPermissionRequest"), variant: .secondary) { recorder.discard() }
                } else {
                    Button(recorder.state == .preview ? QelvoraCopy.text("w6RecordAgain") : QelvoraCopy.text("w6Record"), variant: .secondary) { Task { await recorder.start() } }
                }
                if recorder.state == .preview {
                    Button(QelvoraCopy.text("w6PlayPrivatePreview"), variant: .secondary) { recorder.preview() }
                    Button(QelvoraCopy.text("w6PausePreview"), variant: .secondary) { recorder.pausePreview() }
                    Button(QelvoraCopy.text("w6DiscardRecording"), variant: .quiet) { recorder.discard() }
                }
                if let reason = recorder.reason { Text(reason).qText("caption").accessibilityAddTraits(.updatesFrequently) }
                Text(QelvoraCopy.text("w6UploadingAndExactMediaSigningRequireAConfiguredAccountAnd")).qText("caption")
            }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .onChange(of: scenePhase) { _, phase in
                if phase == .background || (phase == .inactive && recorder.state != .requesting) { recorder.pause(interrupted: true) }
                if phase != .active { recorder.pausePreview() }
            }
            .onDisappear { recorder.discard() }
    }
}
