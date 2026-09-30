#if os(iOS)
import SwiftUI
import UIKit

/// Native identity controls use the same registration/revocation API as Studio.
public struct CredentialSettings: View {
    @ObservedObject var model: FanSession
    @State private var keys: APIPasskeys?
    @State private var busy = false
    @State private var message = ""
    @State private var ceremony: PasskeyCeremony?
    public init(model: FanSession) { self.model = model }
    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Signing passkeys").qText("title").accessibilityAddTraits(.isHeader)
            Text("External creator proof and fresh Pantopus authorization are required. Every named act needs its own exact-content signature.").qText("caption")
            if let keys { ForEach(keys.credentials, id: \.id) { key in
                HStack { Text(key.revoked ? "Revoked passkey" : "Registered passkey").qText("body"); Spacer(); if !key.revoked { Button("Revoke", variant: .quiet, disabled: busy) { Task { await revoke(key.id) } } } }
            } }
            Button(busy ? "Waiting for device…" : "Register a signing passkey", variant: .secondary, block: true, disabled: busy) { Task { await register() } }
            if busy { Button("Cancel", variant: .quiet) { ceremony?.cancel() } }
            if !message.isEmpty { Notice(title: "Passkey status", children: message) }
        }.task { await reload() }.onDisappear { ceremony?.cancel() }
    }
    private func reload() async { guard let api = model.api else { return }; do { keys = try await api.passkeys() } catch { message = FanSession.message(error) } }
    private func revoke(_ id: String) async { guard let api = model.api, !busy else { return }; busy = true; defer { busy = false }; do { _ = try await api.revokePasskey(body: APIPasskeyRevocation(credentialId: id)); await reload() } catch { message = FanSession.message(error) } }
    private func register() async {
        guard let api = model.api, !busy else { return }; busy = true; message = ""; defer { busy = false; ceremony = nil }
        var challenge: String?
        do {
            let begin = try await api.beginPasskey(); challenge = begin.challengeId
            guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow) else { throw NativeSigningError.unavailable }
            let action = PasskeyCeremony(anchor: window); ceremony = action
            let credential = try await action.register(options: begin.options)
            _ = try await api.registerPasskey(body: APIPasskeyRegistration(challengeId: begin.challengeId, credential: credential))
            message = "Passkey registered. Nothing was published."; await reload()
        } catch { if let challenge { _ = try? await api.cancelPasskey(challengeId: challenge) }; message = error is NativeSigningError ? "The device could not complete passkey registration. Check the relying-party association or try again. Nothing was published." : FanSession.message(error) }
    }
}
#endif
