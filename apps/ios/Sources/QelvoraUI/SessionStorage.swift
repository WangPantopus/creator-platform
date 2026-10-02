import Foundation
import Security
import CryptoKit

/// Only the session credential is persisted. Private screen/cache state is account-scoped and purged.
public actor SecureSessionStorage {
    private let service: String
    private let legacyService: String
    private let configured: Bool
    public init(issuer: URL?, service: String = Bundle.main.bundleIdentifier ?? "creator-platform-development") {
        let origin = Self.origin(issuer)
        legacyService = service
        configured = origin != nil
        let scope = origin.map { SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined() } ?? "unconfigured"
        self.service = service + ".identity-session." + scope
    }
    public func read() async throws -> String? {
        guard configured else { return nil }
        return try await SessionCredentialStore.shared.read(service: service, legacyService: legacyService)
    }
    public func save(_ token: String?, replacing expectedToken: String? = nil) async throws {
        guard configured || token == nil else { throw URLError(.badURL) }
        try await SessionCredentialStore.shared.save(token, service: service, legacyService: legacyService, expectedToken: expectedToken)
    }
    private static func origin(_ issuer: URL?) -> String? {
        guard let issuer, var value = URLComponents(url: issuer, resolvingAgainstBaseURL: false),
              let scheme = value.scheme?.lowercased(), let host = value.host?.lowercased(),
              !host.isEmpty, value.user == nil, value.password == nil, value.query == nil, value.fragment == nil,
              value.percentEncodedPath.isEmpty || value.percentEncodedPath == "/",
              value.port == nil || (1...65_535).contains(value.port!) else { return nil }
        var permitted = scheme == "https"
        #if DEBUG
        permitted = permitted || (scheme == "http" && ["localhost", "127.0.0.1"].contains(host))
        #endif
        guard permitted else { return nil }
        value.scheme = scheme; value.host = host; value.path = ""
        if value.port == (scheme == "https" ? 443 : 80) { value.port = nil }
        return value.url?.absoluteString
    }
}

/// All feature clients share this fence when persistent storage fails.
private actor SessionCredentialStore {
    static let shared = SessionCredentialStore()
    private var blockedServices: Set<String> = []
    private var clearedLegacyServices: Set<String> = []

    private func clearLegacy(_ service: String) throws {
        guard !clearedLegacyServices.contains(service) else { return }
        // Old credentials have no provable issuer. Require sign-in rather than migrate them.
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-session"]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
        clearedLegacyServices.insert(service)
    }

    func read(service: String, legacyService: String) throws -> String? {
        try clearLegacy(legacyService)
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
    func save(_ token: String?, service: String, legacyService: String, expectedToken: String?) throws {
        try clearLegacy(legacyService)
        if let expectedToken {
            guard try read(service: service, legacyService: legacyService) == expectedToken else { throw URLError(.userAuthenticationRequired) }
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
