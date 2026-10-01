import Foundation

enum W3RealtimeEvent: Sendable {
    case connected
    case frame(APIFrame)
}

/// Memory-only, account/credential-bound multiplexing. Overflow closes the
/// connection so each owner obtains a fresh authorized snapshot before replay.
actor W3Realtime {
    static let shared = W3Realtime()
    struct Lease: Sendable {
        let id: UUID
        let events: AsyncThrowingStream<W3RealtimeEvent, Error>
    }
    private struct Key: Hashable { let origin: String; let accountId: String }
    private struct Subscription {
        let threadId: String
        let command: APISubscribe
        let continuation: AsyncThrowingStream<W3RealtimeEvent, Error>.Continuation
    }
    private final class Connection {
        let key: Key; let credential: String; let socket: URLSessionWebSocketTask
        var subscriptions: [UUID: Subscription] = [:]
        var outgoing: [UUID] = []
        var reader: Task<Void, Never>?; var sender: Task<Void, Never>?
        init(key: Key, credential: String, socket: URLSessionWebSocketTask) {
            self.key = key; self.credential = credential; self.socket = socket
        }
    }
    private let credentials = SecureSessionStorage()
    private let session: URLSession
    private var connections: [Key: Connection] = [:]
    private var purgeRevision = 0
    private var unavailable: W3Failure { W3Failure(message: "Reconnect to refresh this conversation.", status: 503) }
    private var accountChanged: W3Failure { W3Failure(message: "Your account changed. Open this conversation again.", status: 401) }

    init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }
    func purge() {
        purgeRevision += 1
        for connection in Array(connections.values) { stop(connection, error: accountChanged) }
    }
    func subscribe(baseURL: URL, accountId: String, page: W3Page) async throws -> Lease {
        let revision = purgeRevision
        guard UUID(uuidString: accountId) != nil,
              var origin = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
              ["http", "https"].contains(origin.scheme), origin.host != nil,
              origin.user == nil, origin.password == nil else { throw accountChanged }
        guard let credential = try await credentials.read(), revision == purgeRevision else { throw accountChanged }
        try Task.checkCancellation()
        origin.path = ""; origin.query = nil; origin.fragment = nil
        guard let originURL = origin.url else { throw URLError(.badURL) }
        let key = Key(origin: originURL.absoluteString, accountId: accountId)
        if let old = connections[key], old.credential != credential { stop(old, error: accountChanged) }
        guard connections.values.reduce(0, { $0 + $1.subscriptions.count }) < 64 else { throw unavailable }
        let connection: Connection
        if let current = connections[key] { connection = current }
        else {
            origin.path = "/v1/realtime"; origin.scheme = origin.scheme == "https" ? "wss" : "ws"
            guard let url = origin.url else { throw URLError(.badURL) }
            var request = URLRequest(url: url)
            request.timeoutInterval = 10
            request.setValue("Bearer " + credential, forHTTPHeaderField: "Authorization")
            request.setValue(accountId, forHTTPHeaderField: "X-Expected-Account-Id")
            request.setValue(UUID().uuidString.lowercased(), forHTTPHeaderField: "X-Correlation-Id")
            let socket = session.webSocketTask(with: request)
            socket.maximumMessageSize = 1_000_000
            connection = Connection(key: key, credential: credential, socket: socket)
            connections[key] = connection
            socket.resume()
            connection.reader = Task { await read(connection) }
        }
        let id = UUID()
        let (events, continuation) = AsyncThrowingStream<W3RealtimeEvent, Error>.makeStream(bufferingPolicy: .bufferingOldest(64))
        continuation.onTermination = { @Sendable _ in Task { await self.release(id) } }
        connection.subscriptions[id] = Subscription(threadId: page.threadId,
            command: APISubscribe(kind: .subscribe, creatorId: page.creatorId, fanId: page.fanId, cursor: page.cursor),
            continuation: continuation)
        connection.outgoing.append(id)
        if connection.sender == nil { connection.sender = Task { await send(connection) } }
        return Lease(id: id, events: events)
    }
    func release(_ id: UUID) {
        for connection in Array(connections.values) {
            guard let removed = connection.subscriptions.removeValue(forKey: id) else { continue }
            connection.outgoing.removeAll { $0 == id }
            removed.continuation.finish()
            // C04 publishes subscribe only. Reconnect remaining owners rather
            // than retain a departed private channel or invent an unsubscribe.
            if connection.subscriptions.isEmpty || !connection.subscriptions.values.contains(where: { $0.threadId == removed.threadId }) {
                stop(connection, error: unavailable)
            }
            return
        }
    }
    private func current(_ connection: Connection) -> Bool { connections[connection.key] === connection }
    private func validate(_ connection: Connection) async throws {
        guard try await credentials.read() == connection.credential else { throw accountChanged }
        guard current(connection) else { throw unavailable }
        try Task.checkCancellation()
    }
    private func emit(_ event: W3RealtimeEvent, to subscription: Subscription) throws {
        switch subscription.continuation.yield(event) {
        case .enqueued: break
        case .dropped, .terminated: throw unavailable
        @unknown default: throw unavailable
        }
    }
    private func send(_ connection: Connection) async {
        do {
            while current(connection), !connection.outgoing.isEmpty {
                let id = connection.outgoing.removeFirst()
                guard let subscription = connection.subscriptions[id] else { continue }
                try await validate(connection)
                let data = try JSONEncoder().encode(subscription.command)
                guard data.count <= 4096, let text = String(data: data, encoding: .utf8) else { throw unavailable }
                try await connection.socket.send(.string(text))
                try await validate(connection)
                if connection.subscriptions[id] != nil { try emit(.connected, to: subscription) }
            }
            connection.sender = nil
        } catch { stop(connection, error: error) }
    }
    private func read(_ connection: Connection) async {
        do {
            while current(connection) {
                let incoming = try await connection.socket.receive()
                try await validate(connection)
                guard case .string(let text) = incoming else { throw unavailable }
                let data = Data(text.utf8)
                guard data.count <= 1_000_000 else { throw unavailable }
                let frame = try JSONDecoder().decode(APIFrame.self, from: data)
                let owners = connection.subscriptions.values.filter { $0.threadId == frame.threadId }
                guard !owners.isEmpty else { throw unavailable }
                for owner in owners { try emit(.frame(frame), to: owner) }
            }
        } catch {
            let denied = connection.socket.closeCode == .policyViolation || (connection.socket.response as? HTTPURLResponse)?.statusCode == 401
            stop(connection, error: denied ? accountChanged : error)
        }
    }
    private func stop(_ connection: Connection, error: Error) {
        guard current(connection) else { return }
        connections.removeValue(forKey: connection.key)
        connection.reader?.cancel(); connection.sender?.cancel()
        connection.socket.cancel(with: .goingAway, reason: nil)
        let subscriptions = Array(connection.subscriptions.values)
        connection.subscriptions.removeAll(); connection.outgoing.removeAll()
        for subscription in subscriptions { subscription.continuation.finish(throwing: error) }
    }
}
