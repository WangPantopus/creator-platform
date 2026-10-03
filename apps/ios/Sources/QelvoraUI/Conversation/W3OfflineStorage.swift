import Foundation
import CryptoKit
import Security

struct W3OfflineSnapshot: Decodable, Sendable {
    let lease: APIConversationConversationOfflineLease
    let page: W3Page
}

/// One encrypted read-only snapshot. Device-only Keychain protects its key;
/// expiry requires the current process's continuous clock, so a cold launch
/// conceals and purges until new server authority arrives.
actor W3OfflineStorage {
    static let shared = W3OfflineStorage()
    private struct Context: Equatable { let origin: String; let account: String; let session: String; let root: String }
    private var context: Context?
    private var generation = 0
    private var key: SymmetricKey?
    private var binding = ""
    private var savedWall = Date.distantPast
    private var savedTick = ContinuousClock.now
    private var remaining = 0.0
    private let service = (Bundle.main.bundleIdentifier ?? "creator-platform-development") + ".conversation-offline"
    private var query: [String:Any] { [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:service, kSecAttrAccount as String:"current-key"] }
    private var file: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent(service).appendingPathComponent("snapshot.enc") }
    private func seconds(_ duration: Duration) -> Double { Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18 }
    private func digest(_ data: Data) -> String { SHA256.hash(data:data).map { String(format:"%02x",$0) }.joined() }
    private func aad() -> Data { Data("\(context!.origin)\n\(context!.account)\n\(context!.root)\n\(binding)".utf8) }
    private var valid: Bool {
        let wall = Date().timeIntervalSince(savedWall), tick = seconds(savedTick.duration(to:.now))
        return key != nil && remaining > 0 && wall >= 0 && tick >= 0 && tick < remaining && abs(wall-tick) < 0.05
    }
    func activate(origin: String, account: String, session: String, root: String) -> Int {
        let next = Context(origin:origin,account:account,session:session,root:root)
        if context != next { purge(); context = next }
        return generation
    }
    func current(_ expected: Int) -> Bool { expected == generation && valid }
    func purge(_ expected: Int) { if expected == generation { purge() } }
    func purge() {
        generation += 1; context = nil; key = nil; binding = ""; remaining = 0
        SecItemDelete(query as CFDictionary)
        try? FileManager.default.removeItem(at:file)
    }
    func save(_ data: Data, generation expected: Int, started: ContinuousClock.Instant) throws -> Bool {
        guard expected == generation, let context, data.count <= 163840 else { return false }
        let snapshot = try JSONDecoder().decode(W3OfflineSnapshot.self,from:data)
        let lease = snapshot.lease, page = snapshot.page
        let fields = ["accountId":context.account,"issuer":lease.issuer,"purpose":"conversation-offline-session-v1","sessionId":context.session]
        let expectedBinding = digest(try JSONSerialization.data(withJSONObject:fields,options:[.sortedKeys,.withoutEscapingSlashes]))
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        guard let issued = formatter.date(from:lease.issuedAt), let expires = formatter.date(from:lease.expiresAt) else { purge(); return false }
        let lifetime = expires.timeIntervalSince(issued)
        let left = min(lifetime-seconds(started.duration(to:.now)),expires.timeIntervalSinceNow)-0.1
        guard lease.accountId == context.account, lease.sessionBinding == expectedBinding,
              "\(lease.creatorId)/\(lease.fanId)" == context.root, lease.threadId == page.threadId,
              lease.revision == page.revision, lease.epoch == page.epoch, lease.cursor == page.cursor,
              !page.canSend, !page.offTheRecord, page.consentCurrent, lifetime > 0, lifetime <= 5, left > 0,
              lease.messages.count == page.messages.count,
              zip(lease.messages,page.messages).allSatisfy({ version,message in
                  version.id == message.id && version.version == message.version && message.threadId == lease.threadId && !message.offTheRecord && message.recording == nil
              }) else { purge(); return false }
        let newKey = key ?? SymmetricKey(size:.bits256)
        if key == nil {
            var attributes = query
            attributes[kSecValueData as String] = newKey.withUnsafeBytes { Data($0) }
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(attributes as CFDictionary,nil) == errSecSuccess else { purge(); return false }
        }
        key = newKey; binding = expectedBinding; savedWall = Date(); savedTick = .now; remaining = left
        guard let encrypted = try AES.GCM.seal(data,using:newKey,authenticating:aad()).combined else { purge(); return false }
        try FileManager.default.createDirectory(at:file.deletingLastPathComponent(),withIntermediateDirectories:true)
        var directory = file.deletingLastPathComponent(); var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        #if os(iOS)
        try encrypted.write(to:file,options:[.atomic,.completeFileProtection])
        #else
        try encrypted.write(to:file,options:.atomic)
        #endif
        return valid
    }
    func read(_ expected: Int) -> W3OfflineSnapshot? {
        guard expected == generation else { return nil }
        guard valid, let key else { purge(); return nil }
        do {
            let bytes = try Data(contentsOf:file)
            guard bytes.count <= 164000 else { purge(); return nil }
            let data = try AES.GCM.open(AES.GCM.SealedBox(combined:bytes),using:key,authenticating:aad())
            guard valid else { purge(); return nil }
            return try JSONDecoder().decode(W3OfflineSnapshot.self,from:data)
        } catch { purge(); return nil }
    }
}
