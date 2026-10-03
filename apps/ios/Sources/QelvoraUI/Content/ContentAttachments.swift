import Foundation
import SwiftUI
import CryptoKit
#if canImport(UIKit)
import UIKit
import AVFoundation
import ImageIO
#endif

struct ContentAttachmentValue: Decodable, Sendable, Identifiable {
    let kind: String
    let assetId: String
    let version: Int
    let sha256: String
    let alt: String?
    var id: String { assetId + ":" + String(version) + ":" + sha256 }
}
private struct ContentAudienceAsset: Decodable, Sendable, Equatable {
    struct Provenance: Decodable, Sendable, Equatable {
        let schemaVersion: Int; let kind: String; let transform: String
        let c2paVerified: Bool
        let assetId: String; let assetVersion: Int
        let creatorId: String; let objectId: String; let accountId: String
        let signedActId: String
        let processedMediaSha256: String
        let processedMediaBytes: Int; let processedMediaMimeType: String
        let processedMediaDurationMs: Int?
        let fileVariant: String; let fileSha256: String; let fileBytes: Int
        private enum CodingKeys: String, CodingKey {
            case schemaVersion, kind, transform
            case c2paVerified, assetId, assetVersion, creatorId, objectId, accountId, signedActId
            case processedMediaSha256, processedMediaBytes, processedMediaMimeType, processedMediaDurationMs
            case fileVariant, fileSha256, fileBytes
        }
        init(from decoder: Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
            kind = try values.decode(String.self, forKey: .kind)
            transform = try values.decode(String.self, forKey: .transform)
            c2paVerified = try values.decode(Bool.self, forKey: .c2paVerified)
            assetId = try values.decode(String.self, forKey: .assetId)
            assetVersion = try values.decode(Int.self, forKey: .assetVersion)
            creatorId = try values.decode(String.self, forKey: .creatorId)
            objectId = try values.decode(String.self, forKey: .objectId)
            accountId = try values.decode(String.self, forKey: .accountId)
            signedActId = try values.decode(String.self, forKey: .signedActId)
            processedMediaSha256 = try values.decode(String.self, forKey: .processedMediaSha256)
            processedMediaBytes = try values.decode(Int.self, forKey: .processedMediaBytes)
            processedMediaMimeType = try values.decode(String.self, forKey: .processedMediaMimeType)
            // This key is required even when its actual value is JSON null.
            processedMediaDurationMs = try values.decode(Int?.self, forKey: .processedMediaDurationMs)
            fileVariant = try values.decode(String.self, forKey: .fileVariant)
            fileSha256 = try values.decode(String.self, forKey: .fileSha256)
            fileBytes = try values.decode(Int.self, forKey: .fileBytes)
        }
    }
    let id: String; let creatorId: String; let objectId: String
    let purpose: String; let state: String; let version: Int
    let sha256: String; let mimeType: String; let bytes: Int
    let ownerAccountId: String; let signedActId: String?
    let expiresAt: String
    let durationMs: Int?; let provenance: Provenance?
    private enum CodingKeys: String, CodingKey {
        case id, creatorId, objectId, purpose, state, version, sha256, mimeType, bytes
        case ownerAccountId, signedActId, expiresAt, durationMs, provenance
    }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        creatorId = try values.decode(String.self, forKey: .creatorId)
        objectId = try values.decode(String.self, forKey: .objectId)
        purpose = try values.decode(String.self, forKey: .purpose)
        state = try values.decode(String.self, forKey: .state)
        version = try values.decode(Int.self, forKey: .version)
        sha256 = try values.decode(String.self, forKey: .sha256)
        mimeType = try values.decode(String.self, forKey: .mimeType)
        bytes = try values.decode(Int.self, forKey: .bytes)
        ownerAccountId = try values.decode(String.self, forKey: .ownerAccountId)
        expiresAt = try values.decode(String.self, forKey: .expiresAt)
        signedActId = try values.decode(String?.self, forKey: .signedActId)
        durationMs = try values.decode(Int?.self, forKey: .durationMs)
        provenance = try values.decode(Provenance?.self, forKey: .provenance)
    }
}
private struct ContentPlaybackTicket: Decodable, Sendable {
    let asset: ContentAudienceAsset; let url: String; let expiresAt: String
    let playbackFile: ContentPlaybackFile
}
private struct ContentPlaybackFile: Decodable, Sendable, Equatable {
    let variant: String; let sha256: String; let bytes: Int
    func matches(_ asset: ContentAudienceAsset) -> Bool {
        variant == "credentialed" && bytes > 0 && bytes <= 268_435_456 &&
        sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil &&
        asset.provenance?.fileVariant == variant && asset.provenance?.fileSha256 == sha256 && asset.provenance?.fileBytes == bytes
    }
}
/// Both deadlines come from the actual response. The monotonic bound prevents
/// a device clock rollback from extending that issued playback lifetime.
private struct ContentPlaybackDeadline: Sendable {
    let ticket: Date; let asset: Date; let uptime: TimeInterval
    init(ticket: String, asset: String) throws {
        guard let ticketDate = Self.date(ticket), let assetDate = Self.date(asset) else { throw URLError(.badServerResponse) }
        let remaining = min(ticketDate, assetDate).timeIntervalSinceNow
        guard remaining.isFinite, remaining > 0 else { throw URLError(.noPermissionsToReadFile) }
        self.ticket = ticketDate; self.asset = assetDate; uptime = ProcessInfo.processInfo.systemUptime + remaining
    }
    static func date(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return ISO8601DateFormatter().date(from: value) ?? fractional.date(from: value)
    }
    var current: Bool { ticket > Date() && asset > Date() && ProcessInfo.processInfo.systemUptime < uptime }
}
/// One original W1 capture for metadata, ticket, ranges and local playback.
@MainActor private final class ContentMediaTransport {
    private let capture: FanSessionRequestCapture
    private let creatorId: String
    private let assetId: String
    init(capture: FanSessionRequestCapture, creatorId: String, assetId: String) {
        self.capture = capture; self.creatorId = creatorId; self.assetId = assetId
    }
    func isCurrent() async -> Bool { await capture.isCurrent() }
    private func requireCurrent() async throws {
        try Task.checkCancellation()
        guard await isCurrent() else { throw URLError(.noPermissionsToReadFile) }
    }
    func audienceAvailable() async throws -> Bool {
        try await requireCurrent()
        let value = try await capture.client.readMediaCapabilities()
        try await requireCurrent()
        return value.creatorMediaAudienceAvailable
    }
    func asset() async throws -> ContentAudienceAsset {
        try await requireCurrent()
        let value = try await capture.client.readAudienceCreatorMedia(creatorId: creatorId, assetId: assetId, xQelvoraExpectedAccount: capture.expectedAccountId)
        try await requireCurrent()
        return try JSONDecoder().decode(ContentAudienceAsset.self, from: JSONEncoder().encode(value))
    }
    func playback() async throws -> ContentPlaybackTicket {
        try await requireCurrent()
        let value = try await capture.client.audienceCreatorMediaPlayback(creatorId: creatorId, assetId: assetId, xQelvoraExpectedAccount: capture.expectedAccountId)
        try await requireCurrent()
        return try JSONDecoder().decode(ContentPlaybackTicket.self, from: JSONEncoder().encode(value))
    }
    func download(ticket: String, asset: ContentAudienceAsset, playbackFile: ContentPlaybackFile, deadline: ContentPlaybackDeadline) async throws -> URL {
        try await requireCurrent()
        guard playbackFile.matches(asset), deadline.current else { throw URLError(.badServerResponse) }
        guard ContentMediaCache.prepare() else { throw CocoaError(.fileWriteUnknown) }
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("w5-content-" + UUID().uuidString + (asset.mimeType == "image/png" ? ".png" : ".m4a"))
        #if canImport(UIKit)
        let attributes: [FileAttributeKey: Any] = [.protectionKey: FileProtectionType.complete]
        #else
        let attributes: [FileAttributeKey: Any] = [.posixPermissions: 0o600]
        #endif
        guard FileManager.default.createFile(atPath: file.path, contents: nil, attributes: attributes) else { throw CocoaError(.fileWriteUnknown) }
        do {
            let handle = try FileHandle(forWritingTo: file)
            defer { try? handle.close() }
            var hasher = SHA256(); var offset = 0
            while offset < playbackFile.bytes {
                try await requireCurrent()
                guard deadline.current else { throw URLError(.noPermissionsToReadFile) }
                let end = min(offset + 1_048_576, playbackFile.bytes)
                let range = "bytes=\(offset)-\(end-1)"
                let result = try await capture.client.playAudienceCreatorMedia(creatorId: creatorId, assetId: assetId, ticket: ticket, range: range, xQelvoraExpectedAccount: capture.expectedAccountId)
                try await requireCurrent()
                guard deadline.current else { throw URLError(.noPermissionsToReadFile) }
                guard result.status == 206, result.contentRange == "bytes \(offset)-\(end-1)/\(playbackFile.bytes)", result.body.count == end - offset else { throw URLError(.badServerResponse) }
                try handle.write(contentsOf: result.body); hasher.update(data: result.body); offset = end
            }
            let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            guard digest == playbackFile.sha256 else { throw CocoaError(.fileReadCorruptFile) }
            try await requireCurrent()
            guard deadline.current else { throw URLError(.noPermissionsToReadFile) }
            return file
        } catch { try? FileManager.default.removeItem(at: file); throw error }
    }
}

#if canImport(UIKit)
@MainActor private final class ContentAttachmentModel: ObservableObject {
    @Published var available = false
    @Published var busy = false
    @Published var error = ""
    @Published var image: UIImage?
    @Published var loaded = false
    @Published var playing = false
    @Published var position: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    private var transport: ContentMediaTransport?
    private let session: FanSession
    private let destination: String
    private let baseURL: URL
    private let accountId: String
    private let creatorId: String; private let objectId: String; private let contentKind: String
    private let attachment: ContentAttachmentValue
    private var asset: ContentAudienceAsset?
    private var playbackFile: ContentPlaybackFile?
    private var deadline: ContentPlaybackDeadline?
    private var file: URL?
    private var player: AVAudioPlayer?
    private var operation: Task<Void, Never>?
    private var generation = 0
    private var checking = false
    private var toggling = false
    private var active = true
    private var checkedAt: TimeInterval = 0
    private var family: String { "/v1/w6/creators/" + creatorId + "/audience-media/" + attachment.assetId }
    init(session: FanSession, destination: String, baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, attachment: ContentAttachmentValue) {
        self.session = session; self.destination = destination; self.baseURL = baseURL; self.accountId = accountId
        self.creatorId = creatorId; self.objectId = objectId; self.contentKind = contentKind; self.attachment = attachment
    }
    private func matches(_ value: ContentAudienceAsset) -> Bool {
        guard value.id == attachment.assetId, value.creatorId == creatorId, value.objectId == objectId,
              value.version == attachment.version, value.sha256 == attachment.sha256, value.state == "ready",
              value.bytes > 0, value.bytes <= 268_435_456, value.provenance?.c2paVerified == true,
              let provenance = value.provenance, let signedActId = value.signedActId, UUID(uuidString: signedActId) != nil,
              UUID(uuidString: value.ownerAccountId) != nil, provenance.schemaVersion == 1,
              provenance.kind == (attachment.kind == "voice" ? "human_recording" : "human_publication_media"),
              provenance.transform == (attachment.kind == "voice" ? "aac_m4a" : "png"),
              let expiry = ContentPlaybackDeadline.date(value.expiresAt), expiry > Date(),
              provenance.assetId == value.id, provenance.assetVersion == value.version,
              provenance.creatorId == value.creatorId, provenance.objectId == value.objectId,
              provenance.accountId == value.ownerAccountId, provenance.signedActId == signedActId,
              provenance.processedMediaSha256 == attachment.sha256, provenance.processedMediaBytes == value.bytes,
              provenance.processedMediaMimeType == value.mimeType, provenance.processedMediaDurationMs == value.durationMs,
              ContentPlaybackFile(variant: provenance.fileVariant, sha256: provenance.fileSha256, bytes: provenance.fileBytes).matches(value) else { return false }
        if attachment.kind == "photo" {
            return value.purpose == "post_photo" && value.mimeType == "image/png" && !(attachment.alt ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return attachment.kind == "voice" && value.mimeType == "audio/mp4" && (value.durationMs ?? 0) > 0 && value.purpose == (contentKind == "note" ? "human_note" : "post_audio")
    }
    func check() async {
        guard active, !checking else { return }; checking = true; defer { checking = false }
        var epoch = generation
        let started = ProcessInfo.processInfo.systemUptime
        do {
            guard UUID(uuidString: attachment.assetId) != nil, UUID(uuidString: creatorId) != nil, UUID(uuidString: objectId) != nil, attachment.version > 0,
                  attachment.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw URLError(.badURL) }
            guard baseURL.scheme == "https" || (baseURL.scheme == "http" && ["localhost", "127.0.0.1"].contains(baseURL.host ?? "")), baseURL.user == nil, baseURL.password == nil else { throw URLError(.badURL) }
            let capturedCurrent = await transport?.isCurrent() ?? false
            if !capturedCurrent {
                available = false; asset = nil; clearBytes(); transport = nil; epoch = generation
                guard let capture = await session.captureRequest(from: destination, maximumResponseBytes: 1_048_576, timeoutSeconds: 4), capture.expectedAccountId == accountId else { throw URLError(.noPermissionsToReadFile) }
                guard active, epoch == generation else { throw CancellationError() }
                transport = ContentMediaTransport(capture: capture, creatorId: creatorId, assetId: attachment.assetId)
            }
            guard let api = transport, try await api.audienceAvailable() else { throw URLError(.unsupportedURL) }
            let value = try await api.asset()
            guard matches(value), active, epoch == generation, transport === api, await api.isCurrent(), !Task.isCancelled else { throw URLError(.noPermissionsToReadFile) }
            if let playbackFile, (!playbackFile.matches(value) || asset != value) { clearBytes() }
            checkedAt = started; available = ProcessInfo.processInfo.systemUptime - started < 5; asset = value; error = ""
            if !available { clearBytes() }
        } catch {
            guard epoch == generation, active, !Task.isCancelled else { return }
            available = false; asset = nil; clearBytes(); self.error = "Attachment access could not be confirmed. Check current access before retrying."
        }
    }
    func tick() async {
        if let api = transport {
            let current = await api.isCurrent()
            if transport === api && !current { available = false; asset = nil; clearBytes(); transport = nil }
        }
        if ProcessInfo.processInfo.systemUptime - checkedAt >= 5 { available = false; asset = nil; if busy || loaded || file != nil { clearBytes() } }
        if deadline?.current == false { clearBytes(); error = "This attachment link expired. Load it again to check current access." }
        if let player, loaded, duration > 0, player.currentTime >= duration { player.pause() }
        position = min(duration, max(0, player?.currentTime ?? 0))
        playing = player?.isPlaying ?? false
    }
    private func clearBytes() {
        generation += 1; operation?.cancel(); operation = nil
        player?.stop(); player = nil; image = nil; playing = false; loaded = false; busy = false
        playbackFile = nil; deadline = nil; position = 0; duration = 0
        if let file { try? FileManager.default.removeItem(at: file) }; file = nil
    }
    func stop() { active = false; available = false; asset = nil; clearBytes(); transport = nil }
    func setActive(_ value: Bool) { if value { active = true } else { stop() } }
    func load() {
        guard active, available, !busy, let asset, ProcessInfo.processInfo.systemUptime - checkedAt < 5 else { return }
        busy = true; let epoch = generation
        operation = Task { @MainActor in
            do {
                guard let api = transport, await api.isCurrent(), active, epoch == generation else { throw CancellationError() }
                let ticket = try await api.playback()
                guard matches(ticket.asset), ticket.asset.bytes == asset.bytes, ticket.asset.mimeType == asset.mimeType, ticket.asset.durationMs == asset.durationMs,
                      ticket.playbackFile.matches(ticket.asset), ticket.playbackFile.matches(asset),
                      let url = URL(string: ticket.url), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                      url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port, url.user == nil, url.password == nil, parts.fragment == nil,
                      parts.percentEncodedPath == family + "/play", let query = parts.queryItems, query.count == 1, query[0].name == "ticket", let token = query[0].value, !token.isEmpty,
                      ticket.asset == asset else { throw URLError(.badServerResponse) }
                let issuedDeadline = try ContentPlaybackDeadline(ticket: ticket.expiresAt, asset: ticket.asset.expiresAt)
                guard active, epoch == generation, transport === api, await api.isCurrent(), issuedDeadline.current else { throw CancellationError() }
                deadline = issuedDeadline
                let saved = try await api.download(ticket: token, asset: ticket.asset, playbackFile: ticket.playbackFile, deadline: issuedDeadline)
                guard active, epoch == generation, transport === api, await api.isCurrent(), available, self.asset == ticket.asset, issuedDeadline.current, ProcessInfo.processInfo.systemUptime - checkedAt < 5, !Task.isCancelled else { try? FileManager.default.removeItem(at: saved); throw CancellationError() }
                file = saved; playbackFile = ticket.playbackFile
                if attachment.kind == "photo" {
                    guard let source = CGImageSourceCreateWithURL(saved as CFURL, nil),
                          let value = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                            kCGImageSourceCreateThumbnailFromImageAlways: true,
                            kCGImageSourceCreateThumbnailWithTransform: true,
                            kCGImageSourceThumbnailMaxPixelSize: 2048,
                            kCGImageSourceShouldCacheImmediately: true,
                          ] as CFDictionary) else { throw CocoaError(.fileReadCorruptFile) }
                    image = UIImage(cgImage: value)
                }
                else {
                    let next = try AVAudioPlayer(contentsOf: saved)
                    let end = min(next.duration, Double(ticket.asset.durationMs ?? 0) / 1000)
                    guard end.isFinite, end > 0, next.prepareToPlay() else { throw URLError(.cannotDecodeContentData) }
                    player = next; duration = end
                }
                guard issuedDeadline.current else { throw URLError(.noPermissionsToReadFile) }
                loaded = true; error = ""; busy = false; operation = nil
            } catch {
                guard epoch == generation, active, !Task.isCancelled else { return }
                clearBytes(); self.error = "The attachment could not be loaded. Check current access before retrying."
            }
        }
    }
    func toggle() async { await command(seek: nil) }
    func seek(by seconds: TimeInterval) async {
        guard seconds.isFinite, loaded else { return }
        await command(seek: seconds)
    }
    private func command(seek: TimeInterval?) async {
        guard !toggling else { return }; toggling = true; defer { toggling = false }
        guard available, active, !busy, ProcessInfo.processInfo.systemUptime - checkedAt < 5, let api = transport else { clearBytes(); return }
        let epoch = generation
        guard await api.isCurrent(), active, available, epoch == generation, transport === api, ProcessInfo.processInfo.systemUptime - checkedAt < 5 else {
            if epoch == generation && transport === api { clearBytes() }
            return
        }
        guard let player, let playbackFile, let expected = asset else { if seek == nil { load() }; return }
        do {
            let started = ProcessInfo.processInfo.systemUptime
            let actual = try await api.asset()
            guard matches(actual), actual == expected, playbackFile.matches(actual), deadline?.current == true else { throw URLError(.noPermissionsToReadFile) }
            guard await api.isCurrent(), active, available, epoch == generation, self.player === player, transport === api, ProcessInfo.processInfo.systemUptime - started < 5 else {
                if epoch == generation && transport === api { clearBytes() }
                return
            }
            if let seek { player.currentTime = min(duration, max(0, player.currentTime + seek)) }
            else if player.isPlaying { player.pause() }
            else {
                let audio = AVAudioSession.sharedInstance()
                try audio.setCategory(.playback, mode: .spokenAudio)
                try audio.setActive(true)
                guard await api.isCurrent(), active, epoch == generation, self.player === player, transport === api,
                      ProcessInfo.processInfo.systemUptime - started < 5, deadline?.current == true else { throw URLError(.noPermissionsToReadFile) }
                if player.currentTime >= duration { player.currentTime = 0 }
                guard player.play() else { throw URLError(.cannotDecodeContentData) }
            }
            checkedAt = started; position = min(duration, player.currentTime); playing = player.isPlaying
        } catch {
            guard epoch == generation, transport === api, active, !Task.isCancelled else { return }
            clearBytes(); self.error = "The recording could not be played. Check current access before retrying."
        }
    }
}
#endif

@MainActor struct NativeContentAttachmentView: View {
    let creatorName: String
    let attachment: ContentAttachmentValue
    @Environment(\.scenePhase) private var scene
    #if canImport(UIKit)
    @StateObject private var model: ContentAttachmentModel
    init(session: FanSession, destination: String, baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) {
        self.creatorName = creatorName; self.attachment = attachment
        _model = StateObject(wrappedValue: ContentAttachmentModel(session: session, destination: destination, baseURL: baseURL, accountId: accountId, creatorId: creatorId, objectId: objectId, contentKind: contentKind, attachment: attachment))
    }
    private var recordingAction: String {
        if model.busy { return "Loading recording…" }
        if !model.loaded { return "Load recording" }
        return model.playing ? "Pause recording" : "Play recording"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !model.error.isEmpty { Text(model.error).qText("caption") }
            if !model.available { Text("Checking current attachment access…").qText("caption") }
            else if attachment.kind == "photo" {
                if let image = model.image { Image(uiImage: image).resizable().scaledToFit().accessibilityLabel(attachment.alt ?? "") }
                else { Button(model.busy ? "Loading photo…" : "Load photo", variant: .secondary, disabled: model.busy) { model.load() } }
            } else {
                Text(creatorName + "’s recording").qText("label")
                Button(recordingAction, variant: .secondary, disabled: model.busy) { Task { await model.toggle() } }
                if model.loaded {
                    Text(elapsed(model.position) + " / " + elapsed(model.duration)).qText("data-sm")
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Button("Back 10 seconds", variant: .quiet) { Task { await model.seek(by: -10) } }
                            Button("Forward 10 seconds", variant: .quiet) { Task { await model.seek(by: 10) } }
                        }
                        VStack(alignment: .leading) {
                            Button("Back 10 seconds", variant: .quiet) { Task { await model.seek(by: -10) } }
                            Button("Forward 10 seconds", variant: .quiet) { Task { await model.seek(by: 10) } }
                        }
                    }
                }
            }
        }.task { model.setActive(scene == .active); while !Task.isCancelled { await model.check(); try? await Task.sleep(for: .seconds(2)) } }
         .task { while !Task.isCancelled { await model.tick(); try? await Task.sleep(for: .milliseconds(500)) } }
         .onChange(of: scene) { _, value in model.setActive(value == .active) }
         .onDisappear { model.stop() }
    }
    private func elapsed(_ value: TimeInterval) -> String {
        let seconds = Int(max(0, value)); return "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
    #else
    init(session: FanSession, destination: String, baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) { self.creatorName = creatorName; self.attachment = attachment }
    var body: some View { Text("Open this attachment in the iOS app.").qText("caption") }
    #endif
}
