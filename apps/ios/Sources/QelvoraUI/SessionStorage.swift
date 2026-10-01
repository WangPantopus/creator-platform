import Foundation
import Security

/// Only the session credential is persisted. Private screen/cache state is account-scoped and purged.
public actor SecureSessionStorage {
    private let service: String
    public init(service: String = Bundle.main.bundleIdentifier ?? "creator-platform-development") { self.service = service }
    public func read() async throws -> String? { try await SessionCredentialStore.shared.read(service: service) }
    public func save(_ token: String?, replacing expectedToken: String? = nil) async throws { try await SessionCredentialStore.shared.save(token, service: service, expectedToken: expectedToken) }
}

/// All feature clients share this fence when persistent storage fails.
private actor SessionCredentialStore {
    static let shared = SessionCredentialStore()
    private var blockedServices: Set<String> = []

    func read(service: String) throws -> String? {
        guard !blockedServices.contains(service) else { return nil }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-session", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw URLError(.userAuthenticationRequired) }
        guard let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            blockedServices.insert(service)
            throw URLError(.userAuthenticationRequired)
        }
        return token
    }
    func save(_ token: String?, service: String, expectedToken: String?) throws {
        if let expectedToken {
            guard try read(service: service) == expectedToken else { throw URLError(.userAuthenticationRequired) }
        }
        // Block every client before a clear or replacement, including failed writes.
        blockedServices.insert(service)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-session"]
        guard let token else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
            return
        }
        guard !token.isEmpty else { throw URLError(.userAuthenticationRequired) }
        let update: [String: Any] = [kSecValueData as String: Data(token.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            let attributes = query.merging(update) { _, replacement in replacement }
            guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw URLError(.userAuthenticationRequired) }
        } else if status != errSecSuccess { throw URLError(.userAuthenticationRequired) }
        blockedServices.remove(service)
    }
}
