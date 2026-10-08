import AVFoundation
import SwiftUI

/// Only a cold process has no live private recording to preserve.
@MainActor enum VoiceRecordingCache {
    private static var prepared = false
    private static var preparing: Set<URL> = []
    // Preserve failed deletion custody even when the owning view disappears.
    private static var pendingDeletion: Set<URL> = []
    static func beginPreparation(_ file: URL) { preparing.insert(file.standardizedFileURL) }
    static func endPreparation(_ file: URL) { preparing.remove(file.standardizedFileURL) }
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
        guard preparing.isEmpty else { return false }
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

private final class RecordingDelegate: NSObject, AVAudioRecorderDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var failed = false
    let onError: @Sendable () -> Void
    init(onError: @escaping @Sendable () -> Void) { self.onError = onError }
    var hasFailed: Bool { lock.lock(); defer { lock.unlock() }; return failed }
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        lock.lock(); failed = true; lock.unlock(); onError()
    }
}

// A single transfer after preparation; the SDK object is never used by both
// executors. Cancellation consumes it on the preparer, adoption on MainActor.
private final class PreparedRecording: @unchecked Sendable {
    private let lock = NSLock()
    private var value: (AVAudioRecorder, RecordingDelegate)?
    init(_ audio: AVAudioRecorder, _ delegate: RecordingDelegate) { value = (audio, delegate) }
    func take() -> (AVAudioRecorder, RecordingDelegate)? {
        lock.lock(); defer { lock.unlock() }
        let result = value; value = nil; return result
    }
}

private actor RecordingPreparation {
    func prepare(at file: URL, delegate: RecordingDelegate, current: @escaping @Sendable () async -> Bool) async throws -> PreparedRecording {
        var audio: AVAudioRecorder?
        do {
            #if os(iOS)
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
            #endif
            guard await current() else { throw CancellationError() }
            let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48000, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96000, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            let next = try AVAudioRecorder(url: file, settings: settings); audio = next; next.delegate = delegate
            guard next.prepareToRecord(), await current() else { throw CancellationError() }
            guard next.record(), !delegate.hasFailed else { throw CocoaError(.fileWriteUnknown) }
            guard await current() else { throw CancellationError() }
            return PreparedRecording(next, delegate)
        } catch {
            audio?.stop()
            deactivate()
            throw error
        }
    }
    func abandon(_ result: PreparedRecording) {
        result.take()?.0.stop(); deactivate()
    }
    private func deactivate() {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
}

@MainActor
public final class NativeVoiceRecorder: NSObject, ObservableObject, @preconcurrency AVAudioRecorderDelegate {
    public enum State: String { case idle, requesting, preparing, recording, paused, preview, denied, failed }
    @Published public private(set) var state: State = .idle
    @Published public private(set) var duration: TimeInterval = 0
    @Published public private(set) var reason: String?
    @Published public private(set) var file: URL?
    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var recordingDelegate: RecordingDelegate?
    private let preparation = RecordingPreparation()
    private var ownsAudioSession = false
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
        state = .preparing
        let location = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        VoiceRecordingCache.beginPreparation(location)
        let deadline = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(5)) } catch { return }
            guard let self, self.generation == requestGeneration else { return }
            self.generation += 1; self.state = .failed
            self.reason = QelvoraCopy.text("w6TheMicrophoneIsUnavailableTryAgain")
        }
        defer { deadline.cancel() }
        do {
            let delegate = RecordingDelegate { [weak self] in Task { @MainActor [weak self] in
                guard let self, self.generation == requestGeneration, self.recorder != nil else { return }
                self.stop(); self.reason = QelvoraCopy.text("w6RecordingWasInterruptedPreviewWhatWasSavedOrRecordAgain")
            } }
            let result = try await preparation.prepare(at: location, delegate: delegate, current: { [weak self] in
                await MainActor.run { self?.generation == requestGeneration }
            })
            // A delegate error can arrive during the preparer's final actor
            // hop while no recorder has yet been adopted by this UI.
            guard generation == requestGeneration, !Task.isCancelled, !delegate.hasFailed else {
                await preparation.abandon(result)
                VoiceRecordingCache.endPreparation(location)
                let cleared = VoiceRecordingCache.discard(location)
                if generation == requestGeneration {
                    if !cleared { file = location }
                    state = .failed
                    reason = QelvoraCopy.text(cleared ? "w6TheMicrophoneIsUnavailableTryAgain" : "w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore")
                }
                return
            }
            VoiceRecordingCache.endPreparation(location)
            guard let (audio, delegate) = result.take() else { throw CocoaError(.fileWriteUnknown) }
            recordingDelegate = delegate
            ownsAudioSession = true
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
            VoiceRecordingCache.endPreparation(location)
            // Failed hardware preparation can still leave a private header.
            // Keep its custody if deletion fails, before allowing another act.
            let cleared = VoiceRecordingCache.discard(location)
            guard generation == requestGeneration else { return }
            if !cleared { file = location }
            state = .failed; reason = QelvoraCopy.text(cleared ? "w6TheMicrophoneIsUnavailableTryAgain" : "w6ThePrivatePreviewCouldNotBeClearedTryAgainBefore"); deactivate()
        }
    }
    public func pause(interrupted: Bool = false) {
        if interrupted && (state == .requesting || state == .preparing) {
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
            ownsAudioSession = true
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
            ownsAudioSession = true
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
        guard ownsAudioSession else { return }
        ownsAudioSession = false
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
                } else if recorder.state == .requesting || recorder.state == .preparing {
                    Button(QelvoraCopy.text(recorder.state == .requesting ? "w6CancelPermissionRequest" : "cancel"), variant: .secondary) { recorder.discard() }
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
