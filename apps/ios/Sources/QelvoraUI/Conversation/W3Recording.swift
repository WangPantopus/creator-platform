import AVFoundation
import CryptoKit
import Foundation
import SwiftUI

struct W3Recording: Decodable, Sendable {
  let state: String
  let asset: APIMediaMediaAsset?
}

private struct W3PlaybackTicket: Decodable, Sendable {
  let asset: APIMediaMediaAsset
  let url: URL
  let expiresAt: String
  let playbackFile: APIMediaPlaybackFile
}
private struct W3RecordingAudio: Sendable {
  let data: Data
  let proof: APIMediaPlaybackFile
}

private final class W3RecordingRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable
{
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

private actor W3RecordingClient {
  let baseURL: URL
  let accountId: String
  let family: String
  private let credentials = SecureSessionStorage()
  init(baseURL: URL, accountId: String, creatorId: String, fanId: String) {
    self.baseURL = baseURL
    self.accountId = accountId
    family = "/v1/w6/threads/\(creatorId)/\(fanId)/media"
  }
  private func request(_ path: String, post: Bool = false) async throws -> (URLRequest, String) {
    guard UUID(uuidString: accountId) != nil,
      baseURL.scheme == "https"
        || (baseURL.scheme == "http" && ["localhost", "127.0.0.1"].contains(baseURL.host ?? "")),
      baseURL.user == nil, baseURL.password == nil,
      let url = URL(string: path, relativeTo: baseURL), url.host == baseURL.host,
      url.scheme == baseURL.scheme, url.port == baseURL.port,
      let token = try await credentials.read()
    else { throw URLError(.userAuthenticationRequired) }
    var request = URLRequest(url: url)
    request.httpMethod = post ? "POST" : "GET"
    request.timeoutInterval = 15
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue(accountId, forHTTPHeaderField: "X-Qelvora-Expected-Account")
    if post {
      request.httpBody = Data("{}".utf8)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    return (request, token)
  }
  private func session() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    return URLSession(
      configuration: configuration, delegate: W3RecordingRedirectGuard(), delegateQueue: nil)
  }
  private func metadata<T: Decodable & Sendable>(_ path: String, post: Bool = false) async throws
    -> T
  {
    let (request, token) = try await request(path, post: post)
    let session = session()
    defer { session.invalidateAndCancel() }
    let (stream, response) = try await session.bytes(for: request)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200,
      response.expectedContentLength <= 1_000_000
    else { throw URLError(.noPermissionsToReadFile) }
    var data = Data()
    for try await byte in stream {
      try Task.checkCancellation()
      guard data.count < 1_000_000 else { throw URLError(.dataLengthExceedsMaximum) }
      data.append(byte)
    }
    guard try await credentials.read() == token else {
      throw URLError(.userAuthenticationRequired)
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
  private func matches(_ current: APIMediaMediaAsset, _ asset: APIMediaMediaAsset) -> Bool {
    current.id == asset.id && current.threadId == asset.threadId && current.state == .ready
      && current.purpose == .human_reply && current.version == asset.version
      && current.sha256 == asset.sha256 && current.bytes == asset.bytes
      && current.mimeType == "audio/mp4" && current.durationMs == asset.durationMs
      && current.signedActId != nil && current.signedActId == asset.signedActId
  }
  private func matchesFile(_ asset: APIMediaMediaAsset, _ proof: APIMediaPlaybackFile) -> Bool {
    if proof.variant == .credentialed {
      guard case .boolean(true)? = asset.provenance?["c2paVerified"],
        case .string("credentialed")? = asset.provenance?["fileVariant"],
        case .string(let hash)? = asset.provenance?["fileSha256"], hash == proof.sha256,
        case .number(let bytes)? = asset.provenance?["fileBytes"], bytes == Double(proof.bytes)
      else { return false }
      return true
    }
    if case .boolean(true)? = asset.provenance?["c2paVerified"] { return false }
    return proof.sha256 == asset.sha256 && proof.bytes == asset.bytes
  }
  func assertCurrent(_ asset: APIMediaMediaAsset, file: APIMediaPlaybackFile) async throws {
    let current: APIMediaMediaAsset = try await metadata(family + "/" + asset.id)
    guard matches(current, asset), matchesFile(current, file) else {
      throw URLError(.noPermissionsToReadFile)
    }
  }
  func audio(_ asset: APIMediaMediaAsset) async throws -> W3RecordingAudio {
    guard UUID(uuidString: asset.id) != nil else { throw URLError(.badURL) }
    let ticket: W3PlaybackTicket = try await metadata(
      family + "/" + asset.id + "/playback", post: true)
    let proof = ticket.playbackFile
    let expiry =
      ISO8601DateFormatter().date(from: ticket.expiresAt)
      ?? ISO8601DateFormatter.fractional.date(from: ticket.expiresAt)
    let path = family + "/" + asset.id + "/play"
    guard matches(ticket.asset, asset), proof.bytes > 0, proof.bytes <= 268_435_456,
      proof.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
      let expiry, expiry > Date(), ticket.url.path == path,
      ticket.url.user == nil, ticket.url.password == nil,
      ticket.url.fragment == nil,
      let parts = URLComponents(url: ticket.url, resolvingAgainstBaseURL: false),
      parts.queryItems?.count == 1, parts.queryItems?.first?.name == "ticket",
      !(parts.queryItems?.first?.value ?? "").isEmpty
    else { throw URLError(.badServerResponse) }
    guard matchesFile(ticket.asset, proof) else { throw URLError(.badServerResponse) }
    // Extract only the exact signed route/query; credentials go to the configured base, including emulator loopback transport.
    let (request, token) = try await request(path + "?" + (parts.percentEncodedQuery ?? ""))
    let session = session()
    defer { session.invalidateAndCancel() }
    let (stream, response) = try await session.bytes(for: request)
    guard let response = response as? HTTPURLResponse, response.statusCode == 200,
      response.expectedContentLength == proof.bytes
    else { throw URLError(.badServerResponse) }
    var data = Data()
    data.reserveCapacity(proof.bytes)
    var chunk = Data()
    chunk.reserveCapacity(8192)
    var hash = SHA256()
    for try await byte in stream {
      try Task.checkCancellation()
      guard data.count + chunk.count < proof.bytes else {
        throw URLError(.dataLengthExceedsMaximum)
      }
      chunk.append(byte)
      if chunk.count == 8192 {
        hash.update(data: chunk)
        data.append(chunk)
        chunk.removeAll(keepingCapacity: true)
      }
    }
    hash.update(data: chunk)
    data.append(chunk)
    guard data.count == proof.bytes,
      hash.finalize().map({ String(format: "%02x", $0) }).joined() == proof.sha256,
      try await credentials.read() == token
    else { throw URLError(.badServerResponse) }
    try await assertCurrent(asset, file: proof)
    return W3RecordingAudio(data: data, proof: proof)
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
  @Published var position: TimeInterval = 0
  @Published var failure = ""
  private let client: W3RecordingClient
  private let asset: APIMediaMediaAsset
  private var player: AVAudioPlayer?
  private var proof: APIMediaPlaybackFile?
  private var load: Task<Void, Never>?
  private var revision = 0
  init(baseURL: URL, accountId: String, creatorId: String, fanId: String, asset: APIMediaMediaAsset)
  {
    client = W3RecordingClient(
      baseURL: baseURL, accountId: accountId, creatorId: creatorId, fanId: fanId)
    self.asset = asset
  }
  func toggle() {
    if let player {
      if player.isPlaying { player.pause() } else { _ = player.play() }
      playing = player.isPlaying
      return
    }
    guard load == nil else { return }
    let attempt = revision
    loading = true
    failure = ""
    load = Task {
      defer {
        if attempt == revision {
          loading = false
          load = nil
        }
      }
      do {
        let audio = try await client.audio(asset)
        try Task.checkCancellation()
        guard attempt == revision else { return }
        let player = try AVAudioPlayer(data: audio.data)
        guard player.prepareToPlay() else { throw URLError(.cannotDecodeContentData) }
        self.player = player
        self.proof = audio.proof
        playing = player.play()
        if !playing { throw URLError(.cannotDecodeContentData) }
      } catch {
        if !Task.isCancelled && attempt == revision {
          clear()
          failure = "Audio access could not be confirmed. Try again."
        }
      }
    }
  }
  func recheck() async {
    guard let observedPlayer = player, let proof else { return }
    let attempt = revision
    do {
      try await client.assertCurrent(asset, file: proof)
      try Task.checkCancellation()
      guard attempt == revision && player === observedPlayer else { return }
      position = observedPlayer.currentTime
      playing = observedPlayer.isPlaying
    } catch {
      if !Task.isCancelled && attempt == revision && player === observedPlayer {
        clear()
        failure = "This recording is unavailable. Reopen the conversation to try again."
      }
    }
  }
  func clear() {
    revision += 1
    load?.cancel()
    load = nil
    loading = false
    player?.stop()
    player = nil
    proof = nil
    playing = false
    position = 0
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
    baseURL: URL, accountId: String, creatorId: String, fanId: String, asset: APIMediaMediaAsset,
    name: String, time: String, active: Bool, onVerify: @escaping () -> Void
  ) {
    self.asset = asset
    self.name = name
    self.time = time
    self.active = active
    self.onVerify = onVerify
    _playback = StateObject(
      wrappedValue: W3RecordingPlayback(
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
      if !playback.failure.isEmpty {
        Text(playback.failure).qText("caption").accessibilityAddTraits(.updatesFrequently)
      }
    }
    .task(id: active) {
      guard active else {
        playback.clear()
        return
      }
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        if !Task.isCancelled { await playback.recheck() }
      }
    }
    .onChange(of: active) { _, value in if !value { playback.clear() } }
    .onDisappear { playback.clear() }
  }
}
