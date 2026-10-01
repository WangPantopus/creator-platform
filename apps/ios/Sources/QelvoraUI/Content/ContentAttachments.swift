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
private struct ContentAudienceAsset: Decodable, Sendable {
    struct Provenance: Decodable, Sendable {
        let c2paVerified: Bool
        let assetId: String; let assetVersion: Int
        let creatorId: String; let objectId: String; let accountId: String
        let signedActId: String
        let processedMediaSha256: String
        let processedMediaBytes: Int; let processedMediaMimeType: String
        let processedMediaDurationMs: Int?
        let fileVariant: String; let fileSha256: String; let fileBytes: Int
    }
    let id: String; let creatorId: String; let objectId: String
    let purpose: String; let state: String; let version: Int
    let sha256: String; let mimeType: String; let bytes: Int
    let ownerAccountId: String; let signedActId: String?
    let durationMs: Int?; let provenance: Provenance?
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
private struct ContentMediaCapabilities: Decodable, Sendable {
    let creatorMediaAudienceAvailable: Bool?
}
private final class ContentMediaRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
private actor ContentMediaTransport {
    let baseURL: URL
    let accountId: String
    private let storage = SecureSessionStorage()
    init(baseURL: URL, accountId: String) { self.baseURL = baseURL; self.accountId = accountId }
    func request(_ path: String, post: Bool = false, range: Range<Int>? = nil, total: Int? = nil) async throws -> Data {
        guard UUID(uuidString: accountId) != nil,
              baseURL.scheme == "https" || (baseURL.scheme == "http" && ["localhost", "127.0.0.1"].contains(baseURL.host ?? "")),
              baseURL.user == nil, baseURL.password == nil, path.hasPrefix("/v1/w6/"), !path.contains(".."),
              let url = URL(string: path, relativeTo: baseURL), url.scheme == baseURL.scheme, url.host == baseURL.host, url.port == baseURL.port,
              let token = try await storage.read() else { throw URLError(.noPermissionsToReadFile) }
        var request = URLRequest(url: url); request.httpMethod = post ? "POST" : "GET"
        request.timeoutInterval = 4; request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.setValue(accountId, forHTTPHeaderField: "x-qelvora-expected-account")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if post { request.httpBody = Data("{}".utf8) }
        if let range { request.setValue("bytes=\(range.lowerBound)-\(range.upperBound-1)", forHTTPHeaderField: "Range") }
        let session = URLSession(configuration: .ephemeral, delegate: ContentMediaRedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (bytes, raw) = try await session.bytes(for: request)
        guard let response = raw as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if let range, let total {
            guard response.statusCode == 206,
                  response.value(forHTTPHeaderField: "Content-Range") == "bytes \(range.lowerBound)-\(range.upperBound-1)/\(total)"
            else { throw URLError(.badServerResponse) }
        } else {
            guard response.statusCode == 200 else { throw URLError(.noPermissionsToReadFile) }
        }
        let maximum = range?.count ?? 1_048_576
        var data = Data(); data.reserveCapacity(maximum)
        for try await byte in bytes {
            try Task.checkCancellation()
            guard data.count < maximum else { throw URLError(.dataLengthExceedsMaximum) }
            data.append(byte)
        }
        if let range, data.count != range.count { throw URLError(.badServerResponse) }
        try Task.checkCancellation()
        return data
    }
    func download(path: String, asset: ContentAudienceAsset, playbackFile: ContentPlaybackFile) async throws -> URL {
        guard playbackFile.matches(asset) else { throw URLError(.badServerResponse) }
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
                try Task.checkCancellation()
                let end = min(offset + 1_048_576, playbackFile.bytes)
                let data = try await request(path, range: offset..<end, total: playbackFile.bytes)
                try handle.write(contentsOf: data); hasher.update(data: data); offset = end
            }
            let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            guard digest == playbackFile.sha256 else { throw CocoaError(.fileReadCorruptFile) }
            try Task.checkCancellation()
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
    private let transport: ContentMediaTransport
    private let creatorId: String; private let objectId: String; private let contentKind: String
    private let attachment: ContentAttachmentValue
    private var asset: ContentAudienceAsset?
    private var playbackFile: ContentPlaybackFile?
    private var file: URL?
    private var player: AVAudioPlayer?
    private var operation: Task<Void, Never>?
    private var generation = 0
    private var checking = false
    private var active = true
    private var checkedAt: TimeInterval = 0
    private var family: String { "/v1/w6/creators/" + creatorId + "/audience-media/" + attachment.assetId }
    init(baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, attachment: ContentAttachmentValue) {
        transport = ContentMediaTransport(baseURL: baseURL, accountId: accountId)
        self.creatorId = creatorId; self.objectId = objectId; self.contentKind = contentKind; self.attachment = attachment
    }
    private func matches(_ value: ContentAudienceAsset) -> Bool {
        guard value.id == attachment.assetId, value.creatorId == creatorId, value.objectId == objectId,
              value.version == attachment.version, value.sha256 == attachment.sha256, value.state == "ready",
              value.bytes > 0, value.bytes <= 268_435_456, value.provenance?.c2paVerified == true,
              let provenance = value.provenance, let signedActId = value.signedActId, UUID(uuidString: signedActId) != nil,
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
        let epoch = generation, started = ProcessInfo.processInfo.systemUptime
        do {
            guard UUID(uuidString: attachment.assetId) != nil, UUID(uuidString: creatorId) != nil, UUID(uuidString: objectId) != nil, attachment.version > 0,
                  attachment.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw URLError(.badURL) }
            let capabilities = try JSONDecoder().decode(ContentMediaCapabilities.self, from: await transport.request("/v1/w6/capabilities"))
            guard capabilities.creatorMediaAudienceAvailable == true else { throw URLError(.unsupportedURL) }
            let value = try JSONDecoder().decode(ContentAudienceAsset.self, from: await transport.request(family))
            guard matches(value), active, epoch == generation, !Task.isCancelled else { throw URLError(.noPermissionsToReadFile) }
            if let playbackFile, !playbackFile.matches(value) { clearBytes() }
            checkedAt = started; available = ProcessInfo.processInfo.systemUptime - started < 5; asset = value; error = ""
            if !available { clearBytes() }
        } catch {
            guard epoch == generation, active, !Task.isCancelled else { return }
            available = false; asset = nil; clearBytes(); self.error = "Attachment access could not be confirmed. Check current access before retrying."
        }
    }
    func tick() {
        if ProcessInfo.processInfo.systemUptime - checkedAt >= 5 { available = false; asset = nil; if busy || loaded || file != nil { clearBytes() } }
        playing = player?.isPlaying ?? false
    }
    private func clearBytes() {
        generation += 1; operation?.cancel(); operation = nil
        player?.stop(); player = nil; image = nil; playing = false; loaded = false; busy = false
        playbackFile = nil
        if let file { try? FileManager.default.removeItem(at: file) }; file = nil
    }
    func stop() { active = false; available = false; asset = nil; clearBytes() }
    func setActive(_ value: Bool) { if value { active = true } else { stop() } }
    func load() {
        guard active, available, !busy, let asset, ProcessInfo.processInfo.systemUptime - checkedAt < 5 else { return }
        busy = true; let epoch = generation
        operation = Task { @MainActor in
            do {
                let ticket = try JSONDecoder().decode(ContentPlaybackTicket.self, from: await transport.request(family + "/playback", post: true))
                guard matches(ticket.asset), ticket.asset.bytes == asset.bytes, ticket.asset.mimeType == asset.mimeType, ticket.asset.durationMs == asset.durationMs,
                      ticket.playbackFile.matches(ticket.asset), ticket.playbackFile.matches(asset),
                      let url = URL(string: ticket.url), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
                      parts.percentEncodedPath == family + "/play", let query = parts.queryItems, query.count == 1, query[0].name == "ticket", !(query[0].value ?? "").isEmpty,
                      let expiry = ISO8601DateFormatter().date(from: ticket.expiresAt) ?? ISO8601DateFormatter.withFractionalSeconds.date(from: ticket.expiresAt), expiry > Date() else { throw URLError(.badServerResponse) }
                let saved = try await transport.download(path: parts.percentEncodedPath + "?" + (parts.percentEncodedQuery ?? ""), asset: ticket.asset, playbackFile: ticket.playbackFile)
                guard active, epoch == generation, available, ProcessInfo.processInfo.systemUptime - checkedAt < 5, !Task.isCancelled else { try? FileManager.default.removeItem(at: saved); throw CancellationError() }
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
                else { player = try AVAudioPlayer(contentsOf: saved); player?.prepareToPlay() }
                loaded = true; error = ""; busy = false; operation = nil
            } catch {
                guard epoch == generation, active, !Task.isCancelled else { return }
                clearBytes(); self.error = "The attachment could not be loaded. Check current access before retrying."
            }
        }
    }
    func toggle() {
        guard available, active, ProcessInfo.processInfo.systemUptime - checkedAt < 5 else { clearBytes(); return }
        guard let player else { load(); return }
        if player.isPlaying { player.pause(); playing = false; return }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playback, mode: .spokenAudio)
            try audio.setActive(true)
            guard player.play() else { throw URLError(.cannotDecodeContentData) }
            playing = true
        } catch {
            clearBytes(); self.error = "The recording could not be played. Check current access before retrying."
        }
    }
}
private extension ISO8601DateFormatter {
    static var withFractionalSeconds: ISO8601DateFormatter { let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return formatter }
}
#endif

@MainActor struct NativeContentAttachmentView: View {
    let creatorName: String
    let attachment: ContentAttachmentValue
    @Environment(\.scenePhase) private var scene
    #if canImport(UIKit)
    @StateObject private var model: ContentAttachmentModel
    init(baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) {
        self.creatorName = creatorName; self.attachment = attachment
        _model = StateObject(wrappedValue: ContentAttachmentModel(baseURL: baseURL, accountId: accountId, creatorId: creatorId, objectId: objectId, contentKind: contentKind, attachment: attachment))
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
                Button(recordingAction, variant: .secondary, disabled: model.busy) { model.toggle() }
            }
        }.task { model.setActive(scene == .active); while !Task.isCancelled { await model.check(); try? await Task.sleep(for: .seconds(2)) } }
         .task { while !Task.isCancelled { model.tick(); try? await Task.sleep(for: .milliseconds(500)) } }
         .onChange(of: scene) { _, value in model.setActive(value == .active) }
         .onDisappear { model.stop() }
    }
    #else
    init(baseURL: URL, accountId: String, creatorId: String, objectId: String, contentKind: String, creatorName: String, attachment: ContentAttachmentValue) { self.creatorName = creatorName; self.attachment = attachment }
    var body: some View { Text("Open this attachment in the iOS app.").qText("caption") }
    #endif
}
