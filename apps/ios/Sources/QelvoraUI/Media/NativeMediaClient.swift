import Foundation
import CryptoKit

private final class MediaRedirectGuard: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
}
public struct NativeMediaAsset: Codable, Sendable {
    public let id: String
    public let state: String
    public let version: Int
    public let bytes: Int
    public let uploadedBytes: Int
    public let sha256: String
    public let mimeType: String
    public let durationMs: Int?
    public let failureCode: String?
}
public struct NativeUploadTicket: Decodable, Sendable {
    public let asset: NativeMediaAsset
    public let url: URL
    public let expiresAt: String
    public let chunkBytes: Int
}
public struct NativeCreatorUploadTicket: Decodable, Sendable {
    public let asset: APIMediaCreatorMediaAsset
    public let url: URL
    public let expiresAt: String
    public let chunkBytes: Int
}
public struct NativeMediaRequestError: Error, Sendable {
    public let status: Int
}

/** Session tokens come from W1's secure account store; W6 never issues or persists identities. */
public struct NativeMediaClient: Sendable {
    public let baseURL: URL
    public let sessionToken: @Sendable () async throws -> String
    public init(baseURL: URL, sessionToken: @escaping @Sendable () async throws -> String) { self.baseURL = baseURL; self.sessionToken = sessionToken }
    public func request(path: String, method: String = "GET", body: Data? = nil, contentType: String = "application/json", offset: Int? = nil, expectedAccountId: UUID? = nil) async throws -> Data {
        guard baseURL.scheme == "https" || (baseURL.scheme == "http" && ["localhost", "127.0.0.1"].contains(baseURL.host ?? "")), baseURL.user == nil, baseURL.password == nil, path.hasPrefix("/v1/w6/"), !path.contains(".."), let url = URL(string: path, relativeTo: baseURL), url.host == baseURL.host, url.scheme == baseURL.scheme, url.port == baseURL.port else { throw URLError(.badURL) }
        var request = URLRequest(url: url); request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 15
        request.setValue("Bearer \(try await sessionToken())", forHTTPHeaderField: "Authorization")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        if let offset { request.setValue(String(offset), forHTTPHeaderField: "Upload-Offset") }
        if let expectedAccountId { request.setValue(expectedAccountId.uuidString.lowercased(), forHTTPHeaderField: "x-qelvora-expected-account") }
        let session = URLSession(configuration: .ephemeral, delegate: MediaRedirectGuard(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(response.statusCode) else { throw NativeMediaRequestError(status: response.statusCode) }
        return data
    }
    public func uploadRecording(file: URL, creatorID: UUID, fanID: UUID, purpose: String, durationMilliseconds: Int, idempotencyKey: String, resume: NativeUploadTicket? = nil, ticketChanged: @Sendable (NativeUploadTicket) async -> Void, progress: @Sendable (Double) async -> Void) async throws -> NativeMediaAsset {
        guard ["human_note", "human_reply", "fan_attachment", "source_audio", "interview_audio"].contains(purpose) else { throw URLError(.unsupportedURL) }
        guard (8...128).contains(idempotencyKey.count), (1...3_600_000).contains(durationMilliseconds) else { throw URLError(.badURL) }
        let root = "/v1/w6/threads/\(creatorID.uuidString.lowercased())/\(fanID.uuidString.lowercased())/media"
        let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
        var hasher = SHA256(); var size = 0
        while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty { try Task.checkCancellation(); size += bytes.count; guard size <= 268_435_456 else { throw CocoaError(.fileReadTooLarge) }; hasher.update(data: bytes) }
        guard size > 0 else { throw CocoaError(.fileReadCorruptFile) }
        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        let decoder = JSONDecoder(); var ticket: NativeUploadTicket
        if let resume { ticket = resume }
        else {
            let body: [String: Any] = ["purpose": purpose, "mimeType": "audio/mp4", "bytes": size, "durationMs": durationMilliseconds, "sha256": digest, "idempotencyKey": idempotencyKey]
            ticket = try decoder.decode(NativeUploadTicket.self, from: await request(path: root, method: "POST", body: JSONSerialization.data(withJSONObject: body)))
        }
        guard (ticket.asset.state != "uploading" || (ticket.asset.sha256 == digest && ticket.asset.bytes == size)), (0...size).contains(ticket.asset.uploadedBytes), (1...1_048_576).contains(ticket.chunkBytes) else { throw URLError(.badServerResponse) }
        await ticketChanged(ticket)
        let assetID = ticket.asset.id
        let current = try decoder.decode(NativeMediaAsset.self, from: await request(path: "\(root)/\(ticket.asset.id)"))
        guard current.id == ticket.asset.id else { throw URLError(.badServerResponse) }
        if ["quarantined", "processing", "ready", "rejected"].contains(current.state) { return current }
        guard current.state == "uploading" else { throw URLError(.resourceUnavailable) }
        var offset = ticket.asset.uploadedBytes; try handle.seek(toOffset: UInt64(offset))
        while offset < size {
            try Task.checkCancellation()
            ticket = try decoder.decode(NativeUploadTicket.self, from: await request(path: "\(root)/\(ticket.asset.id)/resume", method: "POST", body: Data("{}".utf8)))
            guard ticket.asset.id == assetID, ticket.asset.sha256 == digest, ticket.asset.bytes == size, (0...size).contains(ticket.asset.uploadedBytes), (1...1_048_576).contains(ticket.chunkBytes) else { throw URLError(.badServerResponse) }
            offset = ticket.asset.uploadedBytes; await ticketChanged(ticket); try handle.seek(toOffset: UInt64(offset))
            if offset >= size { break }
            guard ticket.url.host == baseURL.host, ticket.url.scheme == baseURL.scheme, ticket.url.port == baseURL.port, let components = URLComponents(url: ticket.url, resolvingAgainstBaseURL: false), components.percentEncodedPath == "\(root)/\(assetID)/upload", components.fragment == nil, let bytes = try handle.read(upToCount: min(ticket.chunkBytes, size-offset)), !bytes.isEmpty else { throw URLError(.badServerResponse) }
            let path = components.percentEncodedPath + (components.percentEncodedQuery.map { "?" + $0 } ?? "")
            let acknowledged = try decoder.decode(NativeMediaAsset.self, from: await request(path: path, method: "PUT", body: bytes, contentType: "application/octet-stream", offset: offset))
            guard acknowledged.id == ticket.asset.id, acknowledged.uploadedBytes == offset + bytes.count else { throw URLError(.badServerResponse) }
            offset = acknowledged.uploadedBytes; await progress(Double(offset)/Double(size))
        }
        let finished = try decoder.decode(NativeMediaAsset.self, from: await request(path: "\(root)/\(ticket.asset.id)/finish", method: "POST", body: Data("{}".utf8)))
        guard finished.id == assetID, ["quarantined", "processing", "ready", "rejected"].contains(finished.state) else { throw URLError(.badServerResponse) }
        return finished
    }
    /** Uses an actual saved creator object and W1 session. W5/W2 own publication
     * and purpose/consent policy; a successful upload does not sign or publish. */
    public func uploadCreatorRecording(file: URL, creatorID: UUID, objectID: UUID, purpose: String, durationMilliseconds: Int, idempotencyKey: String, resume: NativeCreatorUploadTicket? = nil, ticketChanged: @Sendable (NativeCreatorUploadTicket) async -> Void, progress: @Sendable (Double) async -> Void) async throws -> APIMediaCreatorMediaAsset {
        guard ["human_note", "post_audio", "source_audio", "interview_audio"].contains(purpose), (8...128).contains(idempotencyKey.count), (1...3_600_000).contains(durationMilliseconds), purpose != "human_note" || durationMilliseconds <= 60_000 else { throw URLError(.badURL) }
        let root = "/v1/w6/creators/\(creatorID.uuidString.lowercased())/media"
        let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
        var hasher = SHA256(); var size = 0
        while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty { try Task.checkCancellation(); size += bytes.count; guard size <= 268_435_456 else { throw CocoaError(.fileReadTooLarge) }; hasher.update(data: bytes) }
        guard size > 0 else { throw CocoaError(.fileReadCorruptFile) }
        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        let decoder = JSONDecoder()
        func matching(_ asset: APIMediaCreatorMediaAsset) -> Bool {
            UUID(uuidString: asset.creatorId) == creatorID && UUID(uuidString: asset.objectId) == objectID && UUID(uuidString: asset.id) != nil && UUID(uuidString: asset.ownerAccountId) != nil && asset.purpose.rawValue == purpose
        }
        var ticket: NativeCreatorUploadTicket
        if let resume { ticket = resume }
        else {
            let body: [String: Any] = ["objectId": objectID.uuidString.lowercased(), "purpose": purpose, "mimeType": "audio/mp4", "bytes": size, "durationMs": durationMilliseconds, "sha256": digest, "idempotencyKey": idempotencyKey]
            ticket = try decoder.decode(NativeCreatorUploadTicket.self, from: await request(path: root, method: "POST", body: JSONSerialization.data(withJSONObject: body)))
        }
        func valid(_ value: NativeCreatorUploadTicket) -> Bool {
            matching(value.asset) && (0...size).contains(value.asset.uploadedBytes) && (1...1_048_576).contains(value.chunkBytes) && (value.asset.state.rawValue != "uploading" || (value.asset.sha256 == digest && value.asset.bytes == size))
        }
        guard valid(ticket), let assetID = UUID(uuidString: ticket.asset.id) else { throw URLError(.badServerResponse) }
        let assetPath = "\(root)/\(assetID.uuidString.lowercased())"
        await ticketChanged(ticket)
        let current = try decoder.decode(APIMediaCreatorMediaAsset.self, from: await request(path: assetPath))
        guard matching(current), UUID(uuidString: current.id) == assetID else { throw URLError(.badServerResponse) }
        if ["quarantined", "processing", "ready", "rejected"].contains(current.state.rawValue) { return current }
        guard current.state.rawValue == "uploading" else { throw URLError(.resourceUnavailable) }
        var offset = ticket.asset.uploadedBytes
        while offset < size {
            try Task.checkCancellation()
            ticket = try decoder.decode(NativeCreatorUploadTicket.self, from: await request(path: "\(assetPath)/resume", method: "POST", body: Data("{}".utf8)))
            guard valid(ticket), UUID(uuidString: ticket.asset.id) == assetID, ticket.asset.state.rawValue == "uploading" else { throw URLError(.badServerResponse) }
            offset = ticket.asset.uploadedBytes; await ticketChanged(ticket)
            if offset == size { break }
            guard ticket.url.host == baseURL.host, ticket.url.scheme == baseURL.scheme, ticket.url.port == baseURL.port, let components = URLComponents(url: ticket.url, resolvingAgainstBaseURL: false), components.percentEncodedPath == "\(assetPath)/upload", components.fragment == nil else { throw URLError(.badServerResponse) }
            try handle.seek(toOffset: UInt64(offset))
            let count = min(ticket.chunkBytes, size - offset)
            guard let bytes = try handle.read(upToCount: count), bytes.count == count else { throw CocoaError(.fileReadCorruptFile) }
            let path = components.percentEncodedPath + (components.percentEncodedQuery.map { "?" + $0 } ?? "")
            let acknowledged = try decoder.decode(APIMediaCreatorMediaAsset.self, from: await request(path: path, method: "PUT", body: bytes, contentType: "application/octet-stream", offset: offset))
            guard matching(acknowledged), UUID(uuidString: acknowledged.id) == assetID, acknowledged.uploadedBytes == offset + count else { throw URLError(.badServerResponse) }
            offset = acknowledged.uploadedBytes; await progress(Double(offset) / Double(size))
        }
        let finished = try decoder.decode(APIMediaCreatorMediaAsset.self, from: await request(path: "\(assetPath)/finish", method: "POST", body: Data("{}".utf8)))
        guard matching(finished), UUID(uuidString: finished.id) == assetID, ["quarantined", "processing", "ready", "rejected"].contains(finished.state.rawValue) else { throw URLError(.badServerResponse) }
        return finished
    }
    public func uploadChunks(file: URL, path: String, uploadedBytes: Int, totalBytes: Int, progress: @Sendable (Double) async -> Void) async throws {
        guard (1...268_435_456).contains(totalBytes), (0...totalBytes).contains(uploadedBytes) else { throw URLError(.badServerResponse) }
        let handle = try FileHandle(forReadingFrom: file); defer { try? handle.close() }
        var offset = uploadedBytes; try handle.seek(toOffset: UInt64(offset))
        while offset < totalBytes {
            try Task.checkCancellation()
            guard let bytes = try handle.read(upToCount: min(1_048_576, totalBytes - offset)), !bytes.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
            let acknowledged = try JSONDecoder().decode(NativeMediaAsset.self, from: await request(path: path, method: "PUT", body: bytes, contentType: "application/octet-stream", offset: offset))
            guard acknowledged.uploadedBytes == offset + bytes.count else { throw URLError(.badServerResponse) }
            offset = acknowledged.uploadedBytes; await progress(Double(offset) / Double(totalBytes))
        }
    }
}
