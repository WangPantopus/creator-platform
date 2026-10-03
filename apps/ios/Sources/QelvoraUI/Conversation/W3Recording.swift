import AVFoundation
import CryptoKit
import Foundation
import SwiftUI

struct W3Recording: Decodable, Sendable {
  let state: String
  let asset: APIMediaMediaAsset?
}

private struct W3RecordingAudio: Sendable {
  let data: Data
  let proof: APIMediaPlaybackFile
  let checkedAt: TimeInterval
}

/// The same W1-issued immutable client serves every metadata and byte request.
@MainActor
private final class W3RecordingClient {
  private let capture: FanSessionRequestCapture
  private let baseURL: URL
  private let creatorId: String
  private let fanId: String
  init(capture: FanSessionRequestCapture, baseURL: URL, creatorId: String, fanId: String) {
    self.capture = capture
    self.baseURL = baseURL
    self.creatorId = creatorId
    self.fanId = fanId
  }
  func isCurrent() async -> Bool { await capture.isCurrent() }
  private func requireCurrent() async throws {
    try Task.checkCancellation()
    guard await isCurrent() else { throw URLError(.userAuthenticationRequired) }
  }
  private func string(_ asset: APIMediaMediaAsset, _ key: String) -> String? {
    guard case .string(let value)? = asset.provenance?[key] else { return nil }
    return value
  }
  private func number(_ asset: APIMediaMediaAsset, _ key: String) -> Double? {
    guard case .number(let value)? = asset.provenance?[key], value.isFinite else { return nil }
    return value
  }
  private func qualified(_ asset: APIMediaMediaAsset) -> Bool {
    guard asset.state == .ready, asset.purpose == .human_reply, asset.mimeType == "audio/mp4",
      asset.bytes > 0, asset.bytes <= 268_435_456,
      let duration = asset.durationMs, (1...3_600_000).contains(duration),
      let act = asset.signedActId, UUID(uuidString: act) != nil,
      let owner = string(asset, "accountId"), UUID(uuidString: owner) != nil,
      case .boolean(true)? = asset.provenance?["c2paVerified"]
    else { return false }
    // accountId is the original creator signer, never the viewing fan.
    return number(asset, "schemaVersion") == 1 && string(asset, "kind") == "human_recording"
      && string(asset, "creatorId") == creatorId && string(asset, "fanId") == fanId
      && string(asset, "threadId") == asset.threadId && string(asset, "purpose") == "human_reply"
      && string(asset, "signedActId") == act && string(asset, "assetId") == asset.id
      && number(asset, "assetVersion") == Double(asset.version)
      && string(asset, "processedMediaSha256") == asset.sha256
      && number(asset, "processedMediaBytes") == Double(asset.bytes)
      && string(asset, "processedMediaMimeType") == asset.mimeType
      && number(asset, "processedMediaDurationMs") == Double(duration)
      && string(asset, "transform") == "aac_m4a"
  }
  private func matches(_ current: APIMediaMediaAsset, _ asset: APIMediaMediaAsset) -> Bool {
    qualified(current) && qualified(asset)
      && current.id == asset.id && current.threadId == asset.threadId
      && current.version == asset.version && current.sha256 == asset.sha256
      && current.bytes == asset.bytes && current.durationMs == asset.durationMs
      && current.signedActId == asset.signedActId
      && string(current, "accountId") == string(asset, "accountId")
  }
  private func matchesFile(_ asset: APIMediaMediaAsset, _ proof: APIMediaPlaybackFile) -> Bool {
    qualified(asset) && proof.variant == .credentialed && proof.bytes > 0
      && proof.bytes <= 268_435_456
      && proof.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
      && string(asset, "fileVariant") == "credentialed"
      && string(asset, "fileSha256") == proof.sha256
      && number(asset, "fileBytes") == Double(proof.bytes)
  }
  func assertCurrent(_ asset: APIMediaMediaAsset, file: APIMediaPlaybackFile) async throws
    -> TimeInterval
  {
    let started = ProcessInfo.processInfo.systemUptime
    try await requireCurrent()
    let current = try await capture.client.readThreadMedia(
      creatorId: creatorId, fanId: fanId,
      assetId: asset.id, xQelvoraExpectedAccount: capture.expectedAccountId)
    try await requireCurrent()
    guard matches(current, asset), matchesFile(current, file), matchesFile(asset, file),
      ProcessInfo.processInfo.systemUptime - started < 5
    else { throw URLError(.noPermissionsToReadFile) }
    return started
  }
  func audio(_ asset: APIMediaMediaAsset) async throws -> W3RecordingAudio {
    guard UUID(uuidString: asset.id) != nil, qualified(asset) else { throw URLError(.badURL) }
    try await requireCurrent()
    let ticket = try await capture.client.threadMediaPlayback(
      creatorId: creatorId, fanId: fanId,
      assetId: asset.id, xQelvoraExpectedAccount: capture.expectedAccountId)
    try await requireCurrent()
    // OpenAPI's nested DTOs carry the original response. Round-trip the same
    // values into the canonical shared asset/file models; no authority is made.
    let decoder = JSONDecoder()
    let issued = try decoder.decode(
      APIMediaMediaAsset.self, from: JSONEncoder().encode(ticket.asset))
    let proof = try decoder.decode(
      APIMediaPlaybackFile.self, from: JSONEncoder().encode(ticket.playbackFile))
    let expiry =
      ISO8601DateFormatter().date(from: ticket.expiresAt)
      ?? ISO8601DateFormatter.fractional.date(from: ticket.expiresAt)
    let path = "/v1/w6/threads/\(creatorId)/\(fanId)/media/\(asset.id)/play"
    guard matches(issued, asset), matchesFile(issued, proof), matchesFile(asset, proof),
      let expiry, expiry > Date(), let url = URL(string: ticket.url),
      url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port,
      url.user == nil, url.password == nil, url.fragment == nil,
      let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
      parts.percentEncodedPath == path,
      let query = parts.queryItems, query.count == 1, query[0].name == "ticket",
      let token = query[0].value, !token.isEmpty
    else { throw URLError(.badServerResponse) }
    var data = Data()
    data.reserveCapacity(proof.bytes)
    var hash = SHA256()
    var offset = 0
    while offset < proof.bytes {
      try await requireCurrent()
      let end = min(offset + 1_048_576, proof.bytes)
      let result = try await capture.client.playThreadMedia(
        creatorId: creatorId, fanId: fanId,
        assetId: asset.id, ticket: token, range: "bytes=\(offset)-\(end-1)",
        xQelvoraExpectedAccount: capture.expectedAccountId)
      try await requireCurrent()
      guard result.status == 206, result.contentRange == "bytes \(offset)-\(end-1)/\(proof.bytes)",
        result.body.count == end - offset
      else { throw URLError(.badServerResponse) }
      hash.update(data: result.body)
      data.append(result.body)
      offset = end
    }
    guard data.count == proof.bytes,
      hash.finalize().map({ String(format: "%02x", $0) }).joined() == proof.sha256
    else { throw URLError(.badServerResponse) }
    let checkedAt = try await assertCurrent(asset, file: proof)
    return W3RecordingAudio(data: data, proof: proof, checkedAt: checkedAt)
  }
}

extension ISO8601DateFormatter {
  fileprivate static var fractional: ISO8601DateFormatter {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }
}

@MainActor
private final class W3RecordingPlayback: ObservableObject {
  @Published var playing = false
  @Published var loading = false
  @Published var loaded = false
  @Published var position: TimeInterval = 0
  @Published var failure = ""
  private let session: FanSession
  private let destination: String
  private let baseURL: URL
  private let accountId: String
  private let creatorId: String
  private let fanId: String
  private let asset: APIMediaMediaAsset
  private var client: W3RecordingClient?
  private var player: AVAudioPlayer?
  private var proof: APIMediaPlaybackFile?
  private var load: Task<Void, Never>?
  private var revision = 0
  private var active = false
  private var checkedAt: TimeInterval = 0
  init(
    session: FanSession, destination: String, baseURL: URL, accountId: String,
    creatorId: String, fanId: String, asset: APIMediaMediaAsset
  ) {
    self.session = session
    self.destination = destination
    self.baseURL = baseURL
    self.accountId = accountId
    self.creatorId = creatorId
    self.fanId = fanId
    self.asset = asset
  }
  private func fresh() -> Bool { ProcessInfo.processInfo.systemUptime - checkedAt < 5 }
  private func discardBytes() {
    player?.stop()
    player = nil
    proof = nil
    playing = false
    loaded = false
    position = 0
    checkedAt = 0
  }
  func clear() {
    revision += 1
    load?.cancel()
    load = nil
    loading = false
    discardBytes()
    client = nil
  }
  func setActive(_ value: Bool) {
    active = value
    if !value { clear() }
  }
  func toggle() { command(seek: nil) }
  func seek(by seconds: TimeInterval) {
    guard seconds.isFinite, loaded else { return }
    command(seek: seconds)
  }
  private func command(seek: TimeInterval?) {
    guard active, load == nil else { return }
    var attempt = revision
    loading = true
    failure = ""
    load = Task { @MainActor in
      defer {
        if attempt == revision {
          loading = false
          load = nil
        }
      }
      do {
        if await client?.isCurrent() != true {
          discardBytes()
          client = nil
          revision += 1
          attempt = revision
          guard
            let capture = await session.captureRequest(
              from: destination,
              maximumResponseBytes: 1_048_576, timeoutSeconds: 4),
            capture.expectedAccountId == accountId
          else { throw URLError(.userAuthenticationRequired) }
          try Task.checkCancellation()
          guard active, attempt == revision else { return }
          client = W3RecordingClient(
            capture: capture, baseURL: baseURL, creatorId: creatorId, fanId: fanId)
        }
        guard let api = client, active, attempt == revision else { return }
        if let observedPlayer = player, let proof {
          let started = try await api.assertCurrent(asset, file: proof)
          try Task.checkCancellation()
          guard active, attempt == revision, client === api, player === observedPlayer,
            await api.isCurrent(), ProcessInfo.processInfo.systemUptime - started < 5
          else { return }
          if let seek {
            let end = min(observedPlayer.duration, Double(asset.durationMs ?? 0) / 1000)
            guard end.isFinite, end > 0 else { throw URLError(.cannotDecodeContentData) }
            observedPlayer.currentTime = min(end, max(0, observedPlayer.currentTime + seek))
          } else if observedPlayer.isPlaying {
            observedPlayer.pause()
          } else {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
            try AVAudioSession.sharedInstance().setActive(true)
            guard await api.isCurrent(), active, attempt == revision, client === api,
              player === observedPlayer, ProcessInfo.processInfo.systemUptime - started < 5
            else { return }
            guard observedPlayer.play() else { throw URLError(.cannotDecodeContentData) }
          }
          checkedAt = started
          position = observedPlayer.currentTime
          playing = observedPlayer.isPlaying
          return
        }
        guard seek == nil else { return }
        let audio = try await api.audio(asset)
        try Task.checkCancellation()
        guard active, attempt == revision, client === api, await api.isCurrent() else { return }
        let next = try AVAudioPlayer(data: audio.data)
        guard next.duration.isFinite, next.duration > 0, next.prepareToPlay() else {
          throw URLError(.cannotDecodeContentData)
        }
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try AVAudioSession.sharedInstance().setActive(true)
        guard await api.isCurrent(), active, attempt == revision, client === api,
          ProcessInfo.processInfo.systemUptime - audio.checkedAt < 5
        else { return }
        player = next
        proof = audio.proof
        checkedAt = audio.checkedAt
        loaded = true
        guard next.play() else { throw URLError(.cannotDecodeContentData) }
        playing = true
      } catch {
        if !Task.isCancelled && attempt == revision {
          clear()
          failure = "Audio access could not be confirmed. Try again."
        }
      }
    }
  }
  func tick() async {
    guard active else { return }
    if let api = client, !(await api.isCurrent()), client === api {
      clear()
      failure = "Your session changed. Load this recording again."
      return
    }
    if player != nil && !fresh() {
      clear()
      failure = "This recording is unavailable. Reopen the conversation to try again."
      return
    }
    position = min(player?.currentTime ?? 0, Double(asset.durationMs ?? 0) / 1000)
    playing = player?.isPlaying ?? false
  }
  func recheck() async {
    guard active, let observedPlayer = player, let proof, let api = client else { return }
    let attempt = revision
    do {
      let started = try await api.assertCurrent(asset, file: proof)
      try Task.checkCancellation()
      guard active, attempt == revision, player === observedPlayer, client === api else { return }
      checkedAt = started
    } catch {
      if !Task.isCancelled && active && attempt == revision && player === observedPlayer
        && client === api
      {
        clear()
        failure = "This recording is unavailable. Reopen the conversation to try again."
      }
    }
  }
}

struct W3RecordingView: View {
  let asset: APIMediaMediaAsset
  let name: String
  let time: String
  let active: Bool
  let onVerify: () -> Void
  @StateObject private var playback: W3RecordingPlayback
  init(
    session: FanSession, destination: String, baseURL: URL, accountId: String,
    creatorId: String, fanId: String, asset: APIMediaMediaAsset,
    name: String, time: String, active: Bool, onVerify: @escaping () -> Void
  ) {
    self.asset = asset
    self.name = name
    self.time = time
    self.active = active
    self.onVerify = onVerify
    _playback = StateObject(
      wrappedValue: W3RecordingPlayback(
        session: session, destination: destination,
        baseURL: baseURL, accountId: accountId, creatorId: creatorId, fanId: fanId, asset: asset))
  }
  private func elapsed(_ seconds: TimeInterval) -> String {
    let value = max(0, Int(seconds))
    return "\(value / 60):\(String(format: "%02d", value % 60))"
  }
  var body: some View {
    VStack(alignment: .leading) {
      VoiceNote(
        duration: elapsed(Double(asset.durationMs ?? 0) / 1000), time: time, name: name,
        playing: playback.playing, playbackAvailable: active && !playback.loading,
        waveform: asset.waveform,
        position: playback.position / max(1, Double(asset.durationMs ?? 0) / 1000),
        onPlayPause: { if active { playback.toggle() } }, onVerify: onVerify)
      Text(playback.loading ? "Loading recording…" : elapsed(playback.position)).qText("data-sm")
      if playback.loaded {
        ViewThatFits(in: .horizontal) {
          HStack { seekControls }
          VStack(alignment: .leading) { seekControls }
        }
      }
      if !playback.failure.isEmpty {
        Text(playback.failure).qText("caption").accessibilityAddTraits(.updatesFrequently)
      }
    }
    .task(id: active) {
      playback.setActive(active)
      guard active else { return }
      while !Task.isCancelled {
        await playback.recheck()
        try? await Task.sleep(for: .seconds(1))
      }
    }
    .task(id: active) {
      guard active else { return }
      while !Task.isCancelled {
        await playback.tick()
        try? await Task.sleep(for: .milliseconds(500))
      }
    }
    .onChange(of: active) { _, value in playback.setActive(value) }
    .onDisappear { playback.setActive(false) }
  }
  @ViewBuilder private var seekControls: some View {
    Button("Back 10 seconds", variant: .quiet, disabled: !active || playback.loading) {
      playback.seek(by: -10)
    }
    Button("Forward 10 seconds", variant: .quiet, disabled: !active || playback.loading) {
      playback.seek(by: 10)
    }
  }
}
