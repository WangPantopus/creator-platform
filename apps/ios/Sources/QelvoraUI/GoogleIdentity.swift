#if os(iOS)
import Foundation
import GoogleSignIn
import UIKit

/// Public identifiers only. Backend iOS audience must equal serverClientID,
/// not the iOS application's clientID. No provider secret belongs in the app.
struct GoogleIdentityConfiguration {
    let clientID: String
    let serverClientID: String
    let callbackScheme: String

    static var current: GoogleIdentityConfiguration? {
        func identifier(_ key: String) -> String? {
            guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
                  value.range(of: #"^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$"#,
                              options: .regularExpression) != nil else { return nil }
            return value
        }
        guard let clientID = identifier("CreatorGoogleClientID"),
              let serverClientID = identifier("CreatorGoogleServerClientID") else { return nil }
        let scheme = clientID.split(separator: ".").reversed().joined(separator: ".").lowercased()
        let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        guard types.flatMap({ $0["CFBundleURLSchemes"] as? [String] ?? [] }).map({ $0.lowercased() }).contains(scheme) else { return nil }
        return GoogleIdentityConfiguration(clientID: clientID, serverClientID: serverClientID, callbackScheme: scheme)
    }
}

/// Clear any SDK cache left by an interrupted prior process. App restoration
/// uses only the backend session in our own Keychain store, never Google restore.
@MainActor
public enum NativeGoogleSignIn {
    public static func prepareForLaunch() { GoogleIdentityCeremony.shared.prepareForLaunch() }
}

/// GoogleSignIn writes its own Keychain state before its callback. The public
/// SDK has no nonpersisting mode or cancellation API. We clear that state at
/// launch, before a request, on cancellation and before every result leaves
/// this adapter. A crash or failed SDK Keychain deletion can still leave state;
/// this is bounded cleanup effort, not a memory-only provider-token guarantee.
@MainActor
final class GoogleIdentityCeremony {
    static let shared = GoogleIdentityCeremony()
    private var didPrepare = false
    private var requestID: UUID?
    private var continuation: CheckedContinuation<NativeIdentityCredential, Error>?
    private init() {}

    func prepareForLaunch() {
        guard !didPrepare else { return }
        didPrepare = true
        GIDSignIn.sharedInstance.signOut()
    }

    func perform(nonce: String, presenting: UIViewController) async throws -> NativeIdentityCredential {
        prepareForLaunch()
        guard requestID == nil, !Task.isCancelled, !nonce.isEmpty,
              presenting.viewIfLoaded?.window != nil,
              let configuration = GoogleIdentityConfiguration.current else { throw NativeIdentityFailure.unavailable }
        let sdk = GIDSignIn.sharedInstance
        sdk.signOut()
        sdk.configuration = GIDConfiguration(clientID: configuration.clientID, serverClientID: configuration.serverClientID)
        let id = UUID(); requestID = id
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { pending in
                guard !Task.isCancelled else {
                    requestID = nil; sdk.signOut(); pending.resume(throwing: NativeIdentityFailure.cancelled); return
                }
                continuation = pending
                // Google's nonce is the raw backend nonce; Apple's SHA-256
                // transform does not apply. SDK/AppAuth owns OAuth state/PKCE.
                sdk.signIn(withPresenting: presenting, hint: nil, additionalScopes: nil, nonce: nonce) { result, error in
                    // Move only Sendable values onto our actor, not SDK objects.
                    let token = result?.user.idToken?.tokenString
                    let failed = error != nil
                    let cancelled = (error as NSError?)?.domain == kGIDSignInErrorDomain &&
                        (error as NSError?)?.code == GIDSignInError.canceled.rawValue
                    Task { @MainActor in
                        self.received(id: id, token: token, failed: failed, cancelled: cancelled)
                    }
                }
            }
        } onCancel: { Task { @MainActor in self.cancel(id: id) } }
    }

    func handleCallback(_ url: URL) -> Bool {
        guard let configuration = GoogleIdentityConfiguration.current,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == configuration.callbackScheme else { return false }
        // Never send an OAuth callback through application navigation. A cold,
        // stale or malformed callback cannot resume a backend sign-in attempt.
        guard requestID != nil, parts.host == nil, parts.user == nil,
              parts.password == nil, parts.port == nil, parts.fragment == nil,
              parts.path == "/oauth2callback" || (parts.path == "/emmcallback" && continuation != nil) else {
            if requestID == nil { GIDSignIn.sharedInstance.signOut() }
            return true
        }
        // The SDK also owns a Device Policy restart path for managed accounts.
        // A cancelled app attempt must not restart that provider ceremony.
        _ = GIDSignIn.sharedInstance.handle(url)
        return true
    }

    func cancelCurrent() {
        if let id = requestID { cancel(id: id) }
        else { GIDSignIn.sharedInstance.signOut() }
    }

    private func cancel(id: UUID) {
        guard requestID == id else { return }
        GIDSignIn.sharedInstance.signOut()
        let pending = continuation; continuation = nil
        pending?.resume(throwing: NativeIdentityFailure.cancelled)
        // Keep the SDK request occupied until its callback drains. signOut()
        // does not dismiss the system sheet; accepting another request here
        // would let a late callback overwrite/clear that newer SDK state.
    }

    private func received(id: UUID, token: String?, failed: Bool, cancelled: Bool) {
        guard requestID == id else { return }
        GIDSignIn.sharedInstance.signOut()
        requestID = nil
        let pending = continuation; continuation = nil
        guard let pending else { return } // A cancelled request never reaches C1.
        if cancelled { pending.resume(throwing: NativeIdentityFailure.cancelled) }
        else if failed { pending.resume(throwing: NativeIdentityFailure.unavailable) }
        else if let token, !token.isEmpty { pending.resume(returning: NativeIdentityCredential(idToken: token)) }
        else { pending.resume(throwing: NativeIdentityFailure.invalidResponse) }
    }
}
#endif
