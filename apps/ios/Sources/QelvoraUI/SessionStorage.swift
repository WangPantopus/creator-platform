import Foundation
import Security
import CryptoKit

/// Credentials and bounded account-bound navigation use the actual issuer's
/// device-only Keychain namespace. Screen bodies and drafts are not stored here.
public actor SecureSessionStorage {
    private let service: String
    private let legacyService: String
    private let configured: Bool
    private let navigationOwner = UUID()
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
    /// A saved path supplies presentation context only. The actual current
    /// credential and account must be resolved before this method is called.
    public func readDestination(accountId: String, credential: String) async throws -> String? {
        guard configured else { return nil }
        return try await SessionCredentialStore.shared.readDestination(service: service, legacyService: legacyService,
            owner: navigationOwner, accountId: accountId, credential: credential)
    }
    public func saveDestination(_ destination: String, accountId: String, credential: String, revision: Int) async throws {
        guard configured else { throw URLError(.badURL) }
        try await SessionCredentialStore.shared.saveDestination(destination, service: service, legacyService: legacyService,
            owner: navigationOwner, accountId: accountId, credential: credential, revision: revision)
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
    private var navigationOwners: [String: (owner: UUID, revision: Int)] = [:]
    private struct SavedDestination: Codable {
        let version: Int
        let accountId: String
        let path: String
    }

    private func navigationQuery(_ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "identity-route"]
    }
    private func clearDestination(_ service: String) throws {
        navigationOwners.removeValue(forKey: service)
        let status = SecItemDelete(navigationQuery(service) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
    }
    func readDestination(service: String, legacyService: String, owner: UUID, accountId: String, credential: String) throws -> String? {
        guard let account = UUID(uuidString: accountId), try read(service: service, legacyService: legacyService) == credential else { throw URLError(.userAuthenticationRequired) }
        navigationOwners[service] = (owner, 0)
        var query = navigationQuery(service)
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, data.count <= 1024,
              let saved = try? JSONDecoder().decode(SavedDestination.self, from: data), saved.version == 1,
              saved.path.utf8.count <= 512, !saved.path.contains("?"), ApplicationDestination.isPermitted(saved.path) else {
            try clearDestination(service); navigationOwners[service] = (owner, 0)
            throw URLError(.badServerResponse)
        }
        guard UUID(uuidString: saved.accountId) == account else {
            try clearDestination(service); navigationOwners[service] = (owner, 0)
            return nil
        }
        return saved.path
    }
    func saveDestination(_ destination: String, service: String, legacyService: String, owner: UUID,
                         accountId: String, credential: String, revision: Int) throws {
        guard let current = navigationOwners[service], current.owner == owner, revision >= current.revision else { return }
        guard let account = UUID(uuidString: accountId), ApplicationDestination.isPermitted(destination),
              let path = destination.split(separator: "?", maxSplits: 1).first.map(String.init),
              path.utf8.count <= 512, ApplicationDestination.isPermitted(path),
              try read(service: service, legacyService: legacyService) == credential else { throw URLError(.userAuthenticationRequired) }
        navigationOwners[service] = (owner, revision)
        let data = try JSONEncoder().encode(SavedDestination(version: 1, accountId: account.uuidString.lowercased(), path: path))
        let query = navigationQuery(service)
        let update: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(query.merging(update) { _, replacement in replacement } as CFDictionary, nil) == errSecSuccess else { throw URLError(.userAuthenticationRequired) }
        } else if status != errSecSuccess { throw URLError(.userAuthenticationRequired) }
    }

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
            // Attempt both clears. A navigation failure must not prevent the
            // credential deletion that keeps a cold launch signed out.
            var navigationFailure: Error?
            do { try clearDestination(service) } catch { navigationFailure = error }
            guard status == errSecSuccess || status == errSecItemNotFound else { throw URLError(.userAuthenticationRequired) }
            if let navigationFailure { throw navigationFailure }
            return
        }
        // Account replacement clears the path under this same actor fence.
        // Guarded rotation retains it for the unchanged real account.
        if expectedToken == nil { try clearDestination(service) }
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
