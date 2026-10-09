#if DEBUG
import Foundation

/// Operated verification (lane 7). Debug builds only: this whole file is absent
/// from a release build. Launch arguments:
///   --harness-reset          wipe the saved credential, saved place and private
///                            state once, so a scenario starts from a clean app
///   --harness-actor <text>   sign in as the development actor whose label
///                            contains <text>, when nobody is signed in
/// Nothing here grants authority: it taps the same sign-in the person would,
/// against the development identity the server advertises.
@MainActor
enum DebugHarness {
    private static var handled = false

    static func signInIfRequested(_ model: FanSession) async {
        guard !handled else { return }
        let arguments = ProcessInfo.processInfo.arguments
        let reset = arguments.contains("--harness-reset")
        let wanted = arguments.firstIndex(of: "--harness-actor").flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
        guard reset || wanted != nil else { return }
        handled = true
        if reset { await model.purge() }
        guard let wanted, model.session == nil, !model.hasSavedCredential else { return }
        await model.beginSignIn()
        guard let actor = model.actors.first(where: { $0.label.range(of: wanted, options: .caseInsensitive) != nil }) else {
            model.error = "No development actor matches \"\(wanted)\"."
            return
        }
        await model.selectActor(actor.id)
    }
}
#endif
