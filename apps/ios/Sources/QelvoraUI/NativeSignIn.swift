import SwiftUI
import Foundation

enum NativeIdentityProvider: String, CaseIterable, Identifiable {
    case apple, google
    var id: String { rawValue }
    var title: String { QelvoraCopy.text(self == .apple ? "signInWithApple" : "signInWithGoogle") }
    var isConfigured: Bool {
        #if os(iOS)
        // Google needs its own reviewed platform adapter. Never send a person
        // through a browser callback that carries an app bearer in its URL.
        return self == .apple
        #else
        return false
        #endif
    }
}

struct NativeIdentityCredential: Sendable {
    let idToken: String
    var authorizationCode: String? = nil
}
enum NativeIdentityFailure: Error { case cancelled, unavailable, invalidResponse }

func identityDeadline(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}

/// The birth date and continuation live only in this view/model's memory.
/// A provider response is never a session until the backend accepts it.
struct NativeSignInPane: View {
    @ObservedObject var model: FanSession
    @State private var birthDate = ""
    #if os(iOS)
    @State private var ceremony: AppleIdentityCeremony?
    #endif
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if model.adultEligibilityDenied {
                    Text(QelvoraCopy.text("adultOnlyTitle")).qText("display-md").accessibilityAddTraits(.isHeader)
                    Text(QelvoraCopy.text("adultOnlyBody")).qText("body")
                    DisclosureGroup(QelvoraCopy.text("underageLink")) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(QelvoraCopy.text("underagePolicyOpening"))
                            Text(QelvoraCopy.text("underagePolicyNotKept"))
                            Text(QelvoraCopy.text("underagePolicyKept"))
                        }.qText("body")
                    }
                } else if let age = model.ageConfirmation {
                    Text(QelvoraCopy.text("signInAgeTitle")).qText("display-md").accessibilityAddTraits(.isHeader)
                    Text(QelvoraCopy.text("signInAgeNote")).qText("body")
                    TextField("YYYY-MM-DD", text: $birthDate).textFieldStyle(.roundedBorder)
                        .accessibilityLabel(QelvoraCopy.text("signInAgeTitle"))
                        .accessibilityIdentifier("sign-in-birth-date")
                        .autocorrectionDisabled().disabled(model.busy)
                    Button(QelvoraCopy.text("signInAgeContinue"), variant: .secondary, block: true, disabled: model.busy || birthDate.isEmpty) {
                        let date = birthDate
                        Task { await model.confirmSignInAge(date) }
                    }.accessibilityIdentifier("sign-in-confirm-age")
                    Button(QelvoraCopy.text("cancel"), variant: .quiet, disabled: model.busy) { birthDate = ""; model.cancelSignIn() }
                    Color.clear.frame(height: 0).task(id: age.ageContinuationId) {
                        guard let deadline = identityDeadline(age.expiresAt) else { model.expireSignInAge(age.ageContinuationId); return }
                        do { try await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow))) }
                        catch { return }
                        model.expireSignInAge(age.ageContinuationId)
                    }
                } else {
                    Text(QelvoraCopy.text("growthSignInToContinue")).qText("display-md").accessibilityAddTraits(.isHeader)
                    ForEach(model.signInProviders) { provider in
                        Button(provider.title, variant: .secondary, block: true, disabled: model.busy) {
                            Task { await signIn(provider) }
                        }.accessibilityIdentifier("sign-in-" + provider.rawValue)
                    }
                    #if DEBUG
                    if !model.actors.isEmpty {
                        Button("Use a development account", variant: .quiet, disabled: model.busy) { model.cancelSignIn(); model.choosingDevelopmentActor = true }
                    }
                    #endif
                    Button(QelvoraCopy.text("cancel"), variant: .quiet, disabled: model.busy) { model.cancelSignIn() }
                }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }
        .onChange(of: model.ageConfirmation?.ageContinuationId) { _, _ in birthDate = "" }
        .onDisappear {
            birthDate = ""
            #if os(iOS)
            ceremony?.cancel()
            #endif
        }
    }
    private func signIn(_ provider: NativeIdentityProvider) async {
        #if os(iOS)
        await model.signIn(provider) { nonce in
            guard provider == .apple,
                  let anchor = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                    .flatMap(\.windows).first(where: \.isKeyWindow) else { throw NativeIdentityFailure.unavailable }
            let current = AppleIdentityCeremony(anchor: anchor)
            ceremony = current
            defer { ceremony = nil }
            return try await current.perform(nonce: nonce)
        }
        #endif
    }
}

#if os(iOS)
import AuthenticationServices
import CryptoKit
import UIKit

/// Only Apple's system sheet supplies credentials. The nonce, token signature,
/// issuer, audience, age and account authority are checked by the backend.
@MainActor
final class AppleIdentityCeremony: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private weak var anchor: UIWindow?
    private var controller: ASAuthorizationController?
    private var continuation: CheckedContinuation<NativeIdentityCredential, Error>?
    private var state: String?
    init(anchor: UIWindow) { self.anchor = anchor }
    func perform(nonce: String) async throws -> NativeIdentityCredential {
        guard continuation == nil, anchor != nil, !Task.isCancelled else { throw NativeIdentityFailure.unavailable }
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
        request.state = nonce
        state = nonce
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { pending in
                continuation = pending
                let action = ASAuthorizationController(authorizationRequests: [request])
                controller = action; action.delegate = self; action.presentationContextProvider = self
                action.performRequests()
            }
        } onCancel: { Task { @MainActor in self.cancel() } }
    }
    func cancel() { controller?.cancel(); finish(.failure(NativeIdentityFailure.cancelled)) }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor ?? UIWindow() }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == state, let bytes = credential.identityToken,
              let token = String(data: bytes, encoding: .utf8), !token.isEmpty else {
            finish(.failure(NativeIdentityFailure.invalidResponse)); return
        }
        finish(.success(NativeIdentityCredential(idToken: token, authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) })))
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish(.failure((error as? ASAuthorizationError)?.code == .canceled ? NativeIdentityFailure.cancelled : NativeIdentityFailure.unavailable))
    }
    private func finish(_ result: Result<NativeIdentityCredential, Error>) {
        let pending = continuation; continuation = nil; controller = nil; state = nil
        pending?.resume(with: result)
    }
}
#endif
