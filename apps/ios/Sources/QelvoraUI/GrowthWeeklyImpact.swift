import Foundation
import SwiftUI

private struct WeeklyImpactPage: Decodable {
    struct Impact: Decodable {
        struct Thanks: Decodable { let text: String; let displayName: String? }
        let window_start: String
        let unique_fans: Int
        let ai_conversations: Int
        let personal_replies: Int
        let notes: Int
        let thanks_count: Int
        let consented_thanks: [Thanks]
    }
    let impact: Impact?
}

/// Only the current creator's closed, owner-produced week is shown. The API
/// rechecks quote permissions; backgrounding discards the private presentation.
public struct GrowthWeeklyImpact: View {
    @ObservedObject private var model: FanSession
    @State private var impact: WeeklyImpactPage.Impact?
    @State private var message = ""
    @State private var loading = false
    @State private var loaded = false
    @State private var reload = 0
    @State private var visibleSession: String?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var textSize

    private init(model: FanSession) { self.model = model }

    public static func registration() -> FanFeatureRegistration {
        FanFeatureRegistration(matches: { $0 == "/studio/impact" }, screen: { model in
            AnyView(GrowthWeeklyImpact(model: model))
        })
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text(QelvoraCopy.text("growthYourWeekImpact")).qText("data-sm")
                    .foregroundStyle(qColor("maya-accent", scheme))
                if scenePhase == .active, !model.checkingSession, !model.purgingPrivateState, !model.localPurgeFailed,
                   visibleSession == model.session?.sessionId, let impact {
                    Text(QelvoraCopy.text("growthImpactPeopleHelped", values: ["people": impact.unique_fans.formatted()]))
                        .modifier(QelvoraTextStyle(style: .init(family: "serif", size: 44, lineHeight: 46, weight: 400, letterSpacing: -0.025)))
                        .accessibilityAddTraits(.isHeader)
                    let columns = Array(repeating: GridItem(.flexible(), alignment: .leading), count: textSize.isAccessibilitySize ? 1 : 2)
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 20) {
                        count(impact.ai_conversations, label: "growthAiConversations")
                        count(impact.personal_replies, label: "growthPersonalReplies")
                        count(impact.thanks_count, label: "growthThanks")
                        count(impact.notes, label: "navNotes")
                    }.padding(.top, 20)
                        .overlay(alignment: .top) { Rectangle().fill(qColor("maya-line", scheme)).frame(height: 1) }
                    if !impact.consented_thanks.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(QelvoraCopy.text("growthImpactThankYou")).qText("data-sm")
                                .foregroundStyle(qColor("on-maya-muted", scheme))
                            ForEach(impact.consented_thanks.indices, id: \.self) { index in
                                let quote = impact.consented_thanks[index]
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("“" + quote.text + "”")
                                        .modifier(QelvoraTextStyle(style: .init(family: "serif", size: 20, lineHeight: 30, weight: 400, letterSpacing: 0)))
                                    if let name = quote.displayName { Text(name).qText("caption") }
                                }.accessibilityElement(children: .combine)
                            }
                        }
                    }
                    Text(QelvoraCopy.text("growthSevenDaysFromThanksAppearOnlyWhenFansChooseTo", values: ["value1": weekStart(impact.window_start)]))
                        .qText("caption").foregroundStyle(qColor("on-maya-muted", scheme))
                } else {
                    Text(QelvoraCopy.text("growthThePeopleYouHelpedThisWeek")).qText("display-lg").accessibilityAddTraits(.isHeader)
                    if loading {
                        ProgressView().tint(qColor("on-maya", scheme)).accessibilityLabel(QelvoraCopy.text("growthLoading"))
                    } else if !message.isEmpty {
                        Text(message).qText("body").accessibilityAddTraits(.updatesFrequently)
                    } else if loaded {
                        Text(QelvoraCopy.text("growthImpactNotAvailable")).qText("body")
                    }
                }
                Text(QelvoraCopy.text("growthImpactWeekCounts")).qText("caption")
                    .foregroundStyle(qColor("on-maya-muted", scheme))
                SwiftUI.Button { reload += 1 } label: {
                    Text(QelvoraCopy.text("growthTryAgain")).qText("body-strong")
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("maya-line", scheme), lineWidth: 1))
                }.buttonStyle(.plain).disabled(loading)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 24).padding(.top, 48).padding(.bottom, 40)
        }.foregroundStyle(qColor("on-maya", scheme)).background(qColor("maya-surface", scheme))
            .onChange(of: scenePhase) { _, phase in if phase != .active { discard() } }
            .onChange(of: model.session?.sessionId) { _, _ in discard() }
            .onChange(of: model.checkingSession) { _, checking in if checking { discard() } }
            .task(id: "\(scenePhase)-\(model.session?.sessionId ?? "")-\(model.checkingSession)-\(reload)") { await load() }
    }
    private func count(_ value: Int, label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value.formatted()).modifier(QelvoraTextStyle(style: .init(family: "mono", size: 28, lineHeight: 32, weight: 400, letterSpacing: 0)))
            Text(QelvoraCopy.text(label)).qText("caption").foregroundStyle(qColor("on-maya-muted", scheme))
        }.accessibilityElement(children: .combine)
    }
    private func weekStart(_ value: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        guard let date = formatter.date(from: String(value.prefix(10))) else { return value }
        formatter.dateFormat = nil; formatter.dateStyle = .medium; formatter.locale = .current
        return formatter.string(from: date)
    }
    private func discard() { impact = nil; visibleSession = nil; message = ""; loaded = false; loading = false }
    @MainActor private func load() async {
        discard()
        guard scenePhase == .active, !model.checkingSession else {
            loading = scenePhase == .active && model.checkingSession
            return
        }
        loading = true
        defer { if !Task.isCancelled { loading = false } }
        guard let capture = await model.captureRequest(from: "/studio/impact"),
              let client = model.growthClient(for: capture) else {
            message = QelvoraCopy.text("growthSettingsNeedACurrentSignedInAccountAndNetworkConnection"); return
        }
        do {
            let page: WeeklyImpactPage = try await client.request("impact")
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent() else { return }
            if let row = page.impact {
                guard [row.unique_fans, row.ai_conversations, row.personal_replies, row.notes, row.thanks_count].allSatisfy({ (0...2_147_483_647).contains($0) }), row.consented_thanks.count <= 20 else { throw URLError(.badServerResponse) }
            }
            impact = page.impact; visibleSession = capture.sessionId; loaded = true
        } catch {
            guard !Task.isCancelled, scenePhase == .active, await capture.isCurrent() else { return }
            message = (error as? GrowthRequestFailure)?.message ?? QelvoraCopy.text("growthTheServiceIsUnavailableReconnectAndTryAgain")
        }
    }
}
