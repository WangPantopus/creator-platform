import Foundation
import CryptoKit
import Security

/// Only replay metadata lives on disk. Keychain keeps it device-bound; private
/// message text, input and credentials are never stored in this feature cache.
actor W3ResumeStorage {
    static let shared = W3ResumeStorage()
    struct Cursor: Codable, Sendable { let cursor: Int; let epoch: Int }
    private struct State: Codable { let account: String; var entries: [String: Cursor] }
    private let service = (Bundle.main.bundleIdentifier ?? "creator-platform-development") + ".conversation-resume"
    private func digest(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
    private var query: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "scoped-cursors"] }
    private func read() -> State? {
        var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &item) == errSecSuccess, let data = item as? Data, data.count <= 32_768 else { return nil }
        return try? JSONDecoder().decode(State.self, from: data)
    }
    private func write(_ state: State) {
        guard let data = try? JSONEncoder().encode(state), data.count <= 32_768 else { return }
        if SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary) == errSecItemNotFound {
            var attributes = query; attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            SecItemAdd(attributes as CFDictionary, nil)
        }
    }
    func activate(accountId: String) {
        let account = digest(accountId)
        if read()?.account != account { write(State(account: account, entries: [:])) }
    }
    func cursor(accountId: String, scope: String) -> Cursor? {
        guard let state = read(), state.account == digest(accountId), let value = state.entries[digest(scope)], value.cursor >= 0, value.epoch >= 0 else { return nil }
        return value
    }
    func save(accountId: String, scope: String, cursor: Int, epoch: Int) {
        guard var state = read(), state.account == digest(accountId), cursor >= 0, epoch >= 0 else { return }
        let key = digest(scope)
        if let previous = state.entries[key], previous.cursor > cursor { return }
        if state.entries[key] == nil && state.entries.count >= 64 { state.entries.removeAll() }
        state.entries[key] = Cursor(cursor: cursor, epoch: epoch); write(state)
    }
    func remove(accountId: String, scope: String) {
        guard var state = read(), state.account == digest(accountId) else { return }
        state.entries.removeValue(forKey: digest(scope)); write(state)
    }
    func purge() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
    }
}
