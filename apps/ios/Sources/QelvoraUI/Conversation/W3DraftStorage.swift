import Foundation
import CryptoKit
import Security

/// Unsent input only. Separate from credentials, replay cursors and offline pages.
/// Files are authenticated, device encrypted and excluded from backup.
actor W3DraftStorage {
    static let shared = W3DraftStorage()
    struct Pending: Codable, Sendable {
        let key: String; let text: String; let clientSequence: Int; let destination: String
        var uncertain = false; var rejected = false
    }
    struct Value: Codable, Sendable { var text: String; var pending: Pending? }
    struct Context: Codable, Equatable, Sendable {
        let origin: String; let account: String; let root: String
        var creator: String { String(root.split(separator: "/").first ?? "") }
    }
    struct Ticket: Sendable {
        let context: Context; let key: String; let generation: Int; let epoch: Int; let id: UUID
    }
    struct Lease: Sendable { let ticket: Ticket; let thread: String }
    struct Opened: Sendable { let lease: Lease; let value: Value? }
    private struct Record: Codable { let context: Context; let thread: String; let value: Value }
    private struct Owner {
        let context: Context
        var epoch = 0; var candidate: UUID?; var writer: UUID?; var thread: String?; var revision = 0
    }
    private var generation = 0
    private var owners: [String: Owner] = [:]
    private var cachedKey: SymmetricKey?
    private let service = (Bundle.main.bundleIdentifier ?? "creator-platform-development") + ".conversation-drafts"
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "device-key"]
    }
    private var directory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(service, isDirectory: true)
    }
    private func file(_ key: String) -> URL { directory.appendingPathComponent(key + ".enc") }
    private func key(create: Bool) throws -> SymmetricKey? {
        if let cachedKey { return cachedKey }
        var request = query
        request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, data.count == 32 {
            let value = SymmetricKey(data: data); cachedKey = value; return value
        }
        guard status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
        guard create else { return nil }
        let value = SymmetricKey(size: .bits256)
        var attributes = query
        attributes[kSecValueData as String] = value.withUnsafeBytes { Data($0) }
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw URLError(.cannotWriteToFile) }
        cachedKey = value; return value
    }
    private func removeFile(_ name: String) throws {
        if FileManager.default.fileExists(atPath: file(name).path) { try FileManager.default.removeItem(at: file(name)) }
    }
    private func read(_ name: String) throws -> Record? {
        guard FileManager.default.fileExists(atPath: file(name).path) else { return nil }
        guard let key = try key(create: false) else { try removeFile(name); return nil }
        let bytes = try Data(contentsOf: file(name))
        guard bytes.count <= 65_536 else { try removeFile(name); return nil }
        do {
            let data = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key, authenticating: Data(name.utf8))
            let record = try JSONDecoder().decode(Record.self, from: data)
            guard record.value.text.count <= 2000, (record.value.pending?.text.count ?? 0) <= 2000 else { throw URLError(.cannotDecodeContentData) }
            if let pending = record.value.pending {
                guard UUID(uuidString: pending.key) != nil, pending.clientSequence >= 0,
                      ["messages", "fan-replies"].contains(pending.destination) else { throw URLError(.cannotDecodeContentData) }
            }
            return record
        } catch { try removeFile(name); return nil }
    }
    func begin(origin: String, account: String, root: String) -> Ticket {
        let context = Context(origin: origin, account: account, root: root)
        let name = SHA256.hash(data: Data("\(origin)\n\(account)\n\(root)".utf8)).map { String(format: "%02x", $0) }.joined()
        var owner = owners[name] ?? Owner(context: context)
        let id = UUID(); owner.candidate = id; owners[name] = owner
        return Ticket(context: context, key: name, generation: generation, epoch: owner.epoch, id: id)
    }
    private func valid(_ ticket: Ticket) -> Bool {
        ticket.generation == generation && owners[ticket.key]?.epoch == ticket.epoch && owners[ticket.key]?.candidate == ticket.id
    }
    func current(_ lease: Lease) -> Bool {
        lease.ticket.generation == generation && owners[lease.ticket.key]?.epoch == lease.ticket.epoch && owners[lease.ticket.key]?.writer == lease.ticket.id && owners[lease.ticket.key]?.thread == lease.thread
    }
    /// Call only after a fresh authorized page. A pending older read cannot take
    /// ownership back from a newer screen, or reopen a scope that was purged.
    func open(_ ticket: Ticket, thread: String) throws -> Opened? {
        guard valid(ticket) else { return nil }
        var owner = owners[ticket.key]!
        owner.writer = ticket.id; owner.thread = thread; owner.revision = 0; owners[ticket.key] = owner
        let record = try read(ticket.key)
        let value: Value?
        if let record, record.context == ticket.context, record.thread == thread { value = record.value }
        else { try removeFile(ticket.key); value = nil }
        return Opened(lease: Lease(ticket: ticket, thread: thread), value: value)
    }
    /// A revision fences out-of-order input tasks. A lease fences navigation,
    /// account replacement and deletion; none can resurrect an old record.
    func save(_ value: Value, lease: Lease, revision: Int) throws -> Bool {
        guard current(lease) else { return false }
        guard revision > owners[lease.ticket.key]!.revision else { return true }
        guard value.text.count <= 2000, (value.pending?.text.count ?? 0) <= 2000 else { throw URLError(.cannotWriteToFile) }
        let name = lease.ticket.key
        if value.text.isEmpty && value.pending == nil { try removeFile(name) }
        else {
            let data = try JSONEncoder().encode(Record(context: lease.ticket.context, thread: lease.thread, value: value))
            guard data.count <= 65_000, let key = try key(create: true),
                  let encrypted = try AES.GCM.seal(data, using: key, authenticating: Data(name.utf8)).combined else { throw URLError(.cannotWriteToFile) }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var location = directory; var options = URLResourceValues(); options.isExcludedFromBackup = true
            try location.setResourceValues(options)
            #if os(iOS)
            try encrypted.write(to: file(name), options: [.atomic, .completeFileProtection])
            #else
            try encrypted.write(to: file(name), options: .atomic)
            #endif
        }
        owners[name]?.revision = revision
        return true
    }
    private func invalidate(_ name: String) {
        owners[name]?.epoch += 1; owners[name]?.candidate = nil; owners[name]?.writer = nil
    }
    func discard(_ ticket: Ticket) throws {
        guard valid(ticket) else { return }
        invalidate(ticket.key); try removeFile(ticket.key)
    }
    func purge(origin: String, account: String, creator: String? = nil, thread: String? = nil) throws {
        func matches(_ context: Context, _ id: String?) -> Bool {
            context.origin == origin && context.account == account && (creator == nil || context.creator == creator) && (thread == nil || id == nil || id == thread)
        }
        for (name, owner) in owners where matches(owner.context, owner.thread) { invalidate(name) }
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where url.pathExtension == "enc" {
            let name = url.deletingPathExtension().lastPathComponent
            if let record = try read(name), matches(record.context, record.thread) { invalidate(name); try removeFile(name) }
        }
    }
    func purge() throws {
        generation += 1; owners.removeAll(); cachedKey = nil
        var removalError: Error?
        do { if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) } }
        catch { removalError = error }
        let status = SecItemDelete(query as CFDictionary)
        if let removalError { throw removalError }
        guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
    }
}
