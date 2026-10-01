#if os(iOS)
import Foundation
import Security
import SwiftUI
import UIKit
import UserNotifications

/// A physical installation counter is retained, never the APNs device token.
private struct GrowthPushInstallation: Codable {
    let id: UUID
    var revision: Int
    static func next() throws -> Self {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "creator-platform-development",
            kSecAttrAccount as String: "growth-push-installation"]
        var read = query
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(read as CFDictionary, &result)
        var value: Self
        if status == errSecItemNotFound { value = Self(id: UUID(), revision: 0) }
        else {
            guard status == errSecSuccess, let data = result as? Data else { throw URLError(.userAuthenticationRequired) }
            value = try JSONDecoder().decode(Self.self, from: data)
        }
        guard value.revision >= 0, value.revision < 9_007_199_254_740_991 else { throw URLError(.cannotCreateFile) }
        value.revision += 1
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(value),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let saved: OSStatus
        if status == errSecItemNotFound { saved = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        else { saved = SecItemUpdate(query as CFDictionary, attributes as CFDictionary) }
        guard saved == errSecSuccess else { throw URLError(.cannotCreateFile) }
        return value
    }
}

@MainActor
public final class GrowthPushCoordinator: ObservableObject {
    public static let shared = GrowthPushCoordinator()
    struct Tap: Equatable { let notificationID: UUID; let delivery = UUID() }
    enum Permission: Equatable { case unavailable, unknown, notDetermined, denied, granted, quiet }
    @Published private(set) var permission: Permission = .unavailable
    @Published private(set) var message = ""
    @Published private(set) var pendingTap: Tap?
    private var session: APISession?
    private var baseURL: URL?
    private var deviceToken: Data?
    private var generation = 0
    private var dirty = false
    private var synchronization: Task<Void, Never>?
    private var acknowledged: Binding?
    private struct Binding: Equatable { let account: String; let session: String; let token: Data?; let granted: Bool }
    private init() {}

    var enabled: Bool {
        guard Bundle.main.object(forInfoDictionaryKey: "CreatorPushEnabled") as? Bool == true,
              let baseURL, let parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { return false }
        return parts.scheme == "https" && parts.host != nil && parts.user == nil && parts.password == nil && parts.query == nil && parts.fragment == nil && ["", "/"].contains(parts.path)
    }
    func update(session: APISession?, baseURL: URL?) {
        let changed = self.session?.sessionId != session?.sessionId || self.session?.accountId != session?.accountId || self.baseURL != baseURL
        self.session = session; self.baseURL = baseURL
        guard changed else { return }
        generation += 1; acknowledged = nil; message = ""
        if session == nil {
            UIApplication.shared.unregisterForRemoteNotifications()
            deviceToken = nil
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
        }
        refreshPermission()
    }
    func refreshPermission() {
        dirty = true
        guard synchronization == nil else { return }
        // Finish an in-flight registration before submitting the next account.
        // The retained counter also rejects requests arriving out of order.
        synchronization = Task {
            while dirty && !Task.isCancelled { dirty = false; await synchronize() }
            synchronization = nil
        }
    }
    func requestPermission() async {
        guard enabled, session != nil else { return }
        do { _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
        catch { message = QelvoraCopy.text("growthDevicePushPermissionFailed") }
        refreshPermission()
    }
    func received(token: Data) {
        guard !token.isEmpty, token.count <= 2048, token != deviceToken else { return }
        deviceToken = token
        refreshPermission()
    }
    func registrationFailed() { message = QelvoraCopy.text("growthDevicePushRegistrationFailed") }
    func tapped(notificationID: UUID) { pendingTap = Tap(notificationID: notificationID) }
    func consumed(_ tap: Tap) { if pendingTap == tap { pendingTap = nil } }
    private func synchronize() async {
        guard enabled else { permission = .unavailable; return }
        let snapshot = generation
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard snapshot == generation else { dirty = true; return }
        let granted: Bool
        switch settings.authorizationStatus {
        case .authorized: permission = .granted; granted = true
        case .provisional, .ephemeral: permission = .quiet; granted = true
        case .denied: permission = .denied; granted = false
        case .notDetermined: permission = .notDetermined; granted = false
        @unknown default: permission = .unknown; granted = false
        }
        guard let session, let baseURL else { return }
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        else { UIApplication.shared.unregisterForRemoteNotifications(); UNUserNotificationCenter.current().removeAllDeliveredNotifications() }
        let binding = Binding(account: session.accountId, session: session.sessionId, token: deviceToken, granted: granted)
        guard acknowledged != binding else { return }
        if granted && binding.token == nil { return } // Wait for the genuine UIApplicationDelegate token.
        do {
            guard let credential = try await SecureSessionStorage().read(), snapshot == generation else { return }
            let installation = try GrowthPushInstallation.next()
            let client = GrowthClient(baseURL: baseURL)
            if let token = binding.token {
                try await client.registerDevice(installationID: installation.id, token: token, granted: granted, registrationRevision: installation.revision, expectedSession: credential)
            } else if !granted {
                try await client.revokeDevice(installationID: installation.id, registrationRevision: installation.revision, expectedSession: credential)
            } else { return }
            guard snapshot == generation, deviceToken == binding.token else { dirty = true; return }
            acknowledged = binding; message = ""
        } catch {
            guard snapshot == generation else { dirty = true; return }
            message = QelvoraCopy.text("growthDevicePushRegistrationFailed")
        }
    }
}

@MainActor
public final class GrowthPushAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    public func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) { GrowthPushCoordinator.shared.received(token: deviceToken) }
    public func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) { GrowthPushCoordinator.shared.registrationFailed() }
    public nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        // Foreground content is fetched through the current in-app owner record.
        []
    }
    public nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let value = response.notification.request.content.userInfo["notificationId"] as? String, let id = UUID(uuidString: value) else { return }
        await MainActor.run { GrowthPushCoordinator.shared.tapped(notificationID: id) }
    }
}

struct GrowthDevicePushSettings: View {
    @ObservedObject private var push = GrowthPushCoordinator.shared
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(QelvoraCopy.text("growthDevicePushHeading")).qText("label")
            Text(status).qText("body").accessibilityAddTraits(.updatesFrequently)
            if push.enabled {
                if push.permission == .notDetermined {
                    Button(QelvoraCopy.text("growthDevicePushAllow"), variant: .secondary, block: true) { Task { await push.requestPermission() } }
                } else if push.permission == .denied || push.permission == .quiet {
                    Button(QelvoraCopy.text("growthDevicePushOpenSettings"), variant: .secondary, block: true) {
                        guard let url = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                }
            }
            if !push.message.isEmpty { Text(push.message).qText("caption").accessibilityAddTraits(.updatesFrequently) }
        }.task { push.refreshPermission() }
    }
    private var status: String {
        let key = switch push.permission {
        case .unavailable: "growthDevicePushUnavailable"
        case .unknown: "growthDevicePushUnknown"
        case .notDetermined: "growthDevicePushNotRequested"
        case .denied: "growthDevicePushDenied"
        case .granted: "growthDevicePushGranted"
        case .quiet: "growthDevicePushQuiet"
        }
        return QelvoraCopy.text(key)
    }
}
#endif
