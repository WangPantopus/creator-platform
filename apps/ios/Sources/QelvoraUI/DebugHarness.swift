#if DEBUG
import Foundation

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
}
#endif
