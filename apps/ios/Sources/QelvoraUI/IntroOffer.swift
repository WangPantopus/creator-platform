import SwiftUI

/// A current server-issued offer; drafts never enter durable local storage.
@MainActor
struct IntroOffer: View {
    let offerId: String
    @ObservedObject var session: FanSession
    let enabled: Bool
    let acknowledge: (String) async -> Bool
    @State private var intro = ""
    @State private var disposition: String?
    @State private var failure = ""
    @State private var busy = false
    @State private var active = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: QelvoraTokens.space3) {
            Text(QelvoraCopy.text("introOfferTitle")).qText("title").accessibilityAddTraits(.isHeader)
            Text(QelvoraCopy.text("introOfferBody")).qText("caption")
            if let disposition {
                Text(QelvoraCopy.text(disposition == "saved" ? "introOfferSavedPending" : "introOfferSkippedPending")).qText("caption")
                Button(QelvoraCopy.text(busy ? "introOfferAcknowledging" : "introOfferFinish"), variant: .secondary, disabled: busy || !enabled) { Task { await finish(save: false) } }
            } else {
                Text(QelvoraCopy.text("introOfferLabel")).qText("label")
                TextField(QelvoraCopy.text("introOfferLabel"), text: $intro, axis: .vertical)
                    .lineLimit(3...6).qText("body").padding(12)
                    .background(qColor("ground", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
                    .accessibilityLabel(QelvoraCopy.text("introOfferLabel"))
                    .accessibilityHint(QelvoraCopy.text("introOfferBody"))
                    .disabled(busy)
                    .onChange(of: intro) { _, value in if value.count > 240 { intro = String(value.prefix(240)) } }
                Button(QelvoraCopy.text(busy ? "introOfferSaving" : "introOfferSave"), variant: .secondary, disabled: busy || !enabled || intro.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { Task { await finish(save: true) } }
                Button(QelvoraCopy.text("introOfferSkip"), variant: .quiet, disabled: busy || !enabled) { Task { await finish(save: false) } }
            }
            if !failure.isEmpty { Notice(tone: .error, title: QelvoraCopy.text("introOfferTitle"), children: failure) }
        }.padding(QelvoraTokens.space4).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
            .onAppear { active = true; if session.session?.fan?.intro.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false { disposition = "saved" } }
            .onDisappear { active = false }
    }
    private func finish(save: Bool) async {
        guard active, enabled, !busy, let current = session.session else { return }
        busy = true; failure = ""; defer { busy = false }
        if disposition == nil && save {
            guard await session.saveIntro(intro, accountId: current.accountId, sessionId: current.sessionId) else {
                if active { failure = session.error.isEmpty ? QelvoraCopy.text("introOfferUnavailable") : session.error }
                return
            }
            guard active, session.session?.accountId == current.accountId, session.session?.sessionId == current.sessionId else { return }
            disposition = "saved"
        } else if disposition == nil { disposition = "skipped" }
        guard active, session.session?.accountId == current.accountId, session.session?.sessionId == current.sessionId else { return }
        if !(await acknowledge(offerId)), active { failure = QelvoraCopy.text("introOfferAckUnavailable") }
    }
}
