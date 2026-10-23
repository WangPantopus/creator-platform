#if DEBUG
import Foundation
import CryptoKit

/// Operated verification (lane 7). Debug builds only: this whole file is absent
/// from a release build. Launch arguments:
///   --harness-reset          wipe the saved credential, saved place and private
///                            state before anything is sent, once, so a scenario
///                            starts from a clean app
///   --harness-actor <text>   sign in as the development actor whose label
///                            contains <text>, when nobody is signed in
/// Nothing here grants authority: it taps the same sign-in the person would,
/// against the development identity the server advertises.
@MainActor
enum DebugHarness {
    private static var didReset = false
    private static var didSignIn = false
    private static var arguments: [String] { ProcessInfo.processInfo.arguments }

    /// Before the shell's first session check, so a stale credential is never sent.
    static func resetIfRequested(_ model: FanSession) async {
        guard !didReset, arguments.contains("--harness-reset") else { return }
        didReset = true
        await model.purge()
    }

    /// After the first session check: nothing happens if someone is signed in.
    static func signInIfRequested(_ model: FanSession) async {
        if let subject = argument("--harness-native-sub"), !didSignIn {
            didSignIn = true
            guard model.session == nil, !model.hasSavedCredential,
                  let raw = argument("--harness-provider-url"), let origin = URLComponents(string: raw),
                  origin.scheme == "http", ["127.0.0.1", "localhost"].contains(origin.host ?? ""),
                  origin.user == nil, origin.password == nil, origin.query == nil, origin.fragment == nil,
                  origin.path.isEmpty || origin.path == "/", let url = origin.url else { return }
            guard let provider = NativeIdentityProvider(rawValue: argument("--harness-native-provider") ?? "apple") else { return }
            let audience = provider == .apple ? "com.pantopus.qelvora" : Bundle.main.object(forInfoDictionaryKey: "CreatorGoogleServerClientID") as? String
            guard let audience, !audience.isEmpty else { return }
            await model.beginSignIn()
            await model.signIn(provider) { nonce in
                // Only the external provider is faked. The real app obtains and
                // consumes the real backend's one-use nonce, then renders its age step.
                let providerNonce = provider == .apple ? SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined() : nonce
                var request = URLRequest(url: url.appendingPathComponent("__mint"))
                request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["provider": provider.rawValue, "aud": audience, "sub": subject, "nonce": providerNonce])
                let (data, response) = try await URLSession.shared.data(for: request)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw NativeIdentityFailure.unavailable }
                struct Token: Decodable { let idToken: String }
                let proof = NativeIdentityCredential(idToken: try JSONDecoder().decode(Token.self, from: data).idToken)
                if arguments.contains("--harness-cancel-native-before-proof") {
                    // Keep the provider pane visible for operated verification,
                    // cancel the actual app attempt, then deliver a late proof.
                    // This does not simulate or prove SDK sheet cancellation.
                    try await Task.sleep(for: .seconds(2))
                    model.cancelSignIn()
                }
                return proof
            }
            return
        }
        guard !didSignIn, let index = arguments.firstIndex(of: "--harness-actor"), arguments.indices.contains(index + 1) else { return }
        didSignIn = true
        let wanted = arguments[index + 1]
        guard model.session == nil, !model.hasSavedCredential else { return }
        await model.beginSignIn()
        guard let actor = model.actors.first(where: { $0.label.range(of: wanted, options: .caseInsensitive) != nil }) else {
            model.error = "No development actor matches \"\(wanted)\"."
            return
        }
        await model.selectActor(actor.id)
    }
    private static func argument(_ key: String) -> String? {
        guard let index = arguments.firstIndex(of: key), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}
#endif
