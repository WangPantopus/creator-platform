import Foundation
import Security

/// Only the session credential is persisted. Private screen/cache state is account-scoped and purged.
public actor SecureSessionStorage {
    private let service: String
    public init(service: String = Bundle.main.bundleIdentifier ?? "creator-platform-development") { self.service = service }
    public func read() throws -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-session", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw URLError(.userAuthenticationRequired) }
        return String(data: data, encoding: .utf8)
    }
    public func save(_ token: String?) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-session"]
        SecItemDelete(query as CFDictionary)
        guard let token else { return }
        var attributes = query
        attributes[kSecValueData as String] = Data(token.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess else { throw URLError(.userAuthenticationRequired) }
    }
}
