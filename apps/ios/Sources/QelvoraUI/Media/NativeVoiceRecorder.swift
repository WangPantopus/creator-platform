import AVFoundation
import SwiftUI

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
        #if os(iOS)
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.pause(interrupted: true) }
        })
        observers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.state == .recording else { return }
                self.pause(interrupted: true)
                self.reason = "Audio route changed. Check your microphone, then resume or record again."
            }
        })
        #endif
    }
    public func start() async {
        discard()
        let requestGeneration = generation
        #if os(iOS)
        guard Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") != nil else {
            state = .failed; reason = "Microphone recording is unavailable in this app build."; return
        }
        state = .requesting
        let allowed = await AVAudioApplication.requestRecordPermission()
        guard requestGeneration == generation else { return }
        guard allowed else { state = .denied; reason = "Microphone access is off. Allow it in Settings, then try again."; return }
        #endif
        do {
            #if os(iOS)
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try audioSession.setActive(true)
            #endif
            let location = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
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
        } catch { state = .failed; reason = "The microphone is unavailable. Try again."; deactivate() }
    }
    public func pause(interrupted: Bool = false) {
        if interrupted && state == .requesting {
            generation += 1; state = .idle
            reason = "Microphone request cancelled after an interruption. Record when you return."
            return
        }
        guard state == .recording else { return }
        duration = recorder?.currentTime ?? duration; recorder?.pause(); state = .paused
        if interrupted { reason = "Recording paused after an interruption. Resume or preview what was saved." }
    }
    public func resume() {
        guard state == .paused else { return }
        do {
            #if os(iOS)
            try AVAudioSession.sharedInstance().setActive(true)
            #endif
            guard recorder?.record() == true else { throw CocoaError(.fileWriteUnknown) }
            state = .recording; reason = nil
        } catch { reason = "Recording could not resume. Preview it or record again." }
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
        } catch { reason = "The saved recording could not be played. Record again." }
    }
    public func seek(to seconds: TimeInterval) { player?.currentTime = min(duration, max(0, seconds)) }
    public func pausePreview() { player?.pause() }
    public func discard() {
        generation += 1; clock?.cancel(); clock = nil; recorder?.stop(); recorder = nil; player?.stop(); player = nil
        if let file { try? FileManager.default.removeItem(at: file) }
        file = nil; duration = 0; state = .idle; reason = nil; deactivate()
    }
    private func deactivate() {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        guard self.recorder === recorder else { return }
        stop(); reason = "Recording was interrupted. Preview what was saved or record again."
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
                Text("Your own voice").qText("display-md")
                Text("Record and listen before uploading. Your preview stays on this device.").qText("body")
                Text(String(format: "%d:%02d", Int(recorder.duration) / 60, Int(recorder.duration) % 60)).qText("data-lg").accessibilityLabel("\(Int(recorder.duration)) seconds recorded")
                Text("Up to \(Int(recorder.maximumDuration)) seconds").qText("caption")
                if recorder.state == .recording || recorder.state == .paused {
                    Button(recorder.state == .recording ? "Pause" : "Resume", variant: .secondary) { if recorder.state == .recording { recorder.pause() } else { recorder.resume() } }
                    Button("Stop and preview", variant: .secondary) { recorder.stop() }
                } else if recorder.state == .requesting {
                    Button("Cancel permission request", variant: .secondary) { recorder.discard() }
                } else {
                    Button(recorder.state == .preview ? "Record again" : "Record", variant: .secondary) { Task { await recorder.start() } }
                }
                if recorder.state == .preview {
                    Button("Play private preview", variant: .secondary) { recorder.preview() }
                    Button("Pause preview", variant: .secondary) { recorder.pausePreview() }
                    Button("Discard recording", variant: .quiet) { recorder.discard() }
                }
                if let reason = recorder.reason { Text(reason).qText("caption").accessibilityAddTraits(.updatesFrequently) }
                Text("Uploading and exact-media signing require a configured account and media service.").qText("caption")
            }.padding(QelvoraTokens.space4).frame(maxWidth: QelvoraTokens.phoneWidth, alignment: .leading)
        }.background(qColor("ground", scheme)).foregroundStyle(qColor("ink", scheme))
            .onChange(of: scenePhase) { _, phase in if phase != .active { recorder.pause(interrupted: true); recorder.pausePreview() } }
            .onDisappear { recorder.discard() }
    }
}
