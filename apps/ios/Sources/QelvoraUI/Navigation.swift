import SwiftUI

/// Keep the reference row at standard sizes; give accessible text real layout space.
private struct NavigationLayout<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var textSize
    private let content: (Bool) -> Content
    init(@ViewBuilder content: @escaping (Bool) -> Content) { self.content = content }
    var body: some View {
        if textSize >= .accessibility4 {
            VStack(spacing: QelvoraTokens.token("space-2")) { content(true) }
        } else if textSize.isAccessibilitySize {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: QelvoraTokens.token("space-2")) { content(false) }
        } else {
            HStack(spacing: 0) { content(false) }
        }
    }
}

private struct NavigationLabel<Icon: View>: View {
    let title: String
    let horizontal: Bool
    @ViewBuilder let icon: () -> Icon
    var body: some View {
        Group {
            if horizontal {
                HStack(spacing: QelvoraTokens.token("space-3")) { icon(); text }
            } else {
                VStack(spacing: QelvoraTokens.token("space-1")) { icon(); text }
            }
        }.frame(maxWidth: .infinity, minHeight: QelvoraTokens.token("space-12"))
            .contentShape(Rectangle())
    }
    private var text: some View {
        Text(title).qText("tab-label").fixedSize(horizontal: false, vertical: true)
            .multilineTextAlignment(.center)
    }
}

public enum FanTab: String, CaseIterable, Sendable {
    case home = "Home", discover = "Discover", requests = "Requests", you = "You"
    var title: String { QelvoraCopy.text("nav" + rawValue) }
    var glyph: String { switch self { case .home: "home"; case .discover: "compass"; case .requests: "inbox"; case .you: "user" } }
}
public enum StudioTab: String, CaseIterable, Sendable {
    case notes = "Notes", requests = "Requests", threads = "Threads", myAI = "My AI", more = "More"
    var title: String { QelvoraCopy.text(self == .myAI ? "navMyAI" : "nav" + rawValue) }
    var glyph: String { switch self { case .notes: "broadcast"; case .requests: "inbox"; case .threads: "threads"; case .myAI: "ring"; case .more: "more" } }
}

public struct TabBar: View {
    public var active: FanTab
    public var onSelect: (FanTab) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(active: FanTab = .home, onSelect: @escaping (FanTab) -> Void = { _ in }) { self.active = active; self.onSelect = onSelect }
    public var body: some View {
        NavigationLayout { horizontal in
            ForEach(FanTab.allCases, id: \.rawValue) { tab in
                SwiftUI.Button { onSelect(tab) } label: {
                    NavigationLabel(title: tab.title, horizontal: horizontal) {
                        QelvoraGlyph(name: tab.glyph, color: qColor(active == tab ? "ink" : "ink-muted", scheme))
                    }
                        .foregroundStyle(qColor(active == tab ? "ink" : "ink-muted", scheme))
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel(tab.title).accessibilityAddTraits(active == tab ? .isSelected : [])
            }
        }.padding(.horizontal, QelvoraTokens.token("space-2"))
            .padding(.top, QelvoraTokens.token("author-gap"))
            .padding(.bottom, QelvoraTokens.token("space-6"))
            .background(qColor("surface", scheme))
            .overlay(alignment: .top) { Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline")) }
    }
}

public struct Segmented: View {
    public var items: [String]
    public var active: String
    public var label: String
    public var onSelect: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(items: [String] = ["navChat", "navPosts", "navRequests", "navAccess"].map { QelvoraCopy.text($0) }, active: String? = nil, label: String = QelvoraCopy.text("sections"), onSelect: @escaping (String) -> Void = { _ in }) { self.items = items; self.active = active ?? items.first ?? ""; self.label = label; self.onSelect = onSelect }
    public var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.self) { item in
                SwiftUI.Button { onSelect(item) } label: {
                    Text(item).qText("label").frame(maxWidth: .infinity).frame(height: QelvoraTokens.token("segment-height"))
                        .foregroundStyle(qColor(active == item ? "ink" : "ink-muted", scheme))
                        .background(active == item ? qColor("selected-surface", scheme) : .clear, in: RoundedRectangle(cornerRadius: QelvoraTokens.token("segment-radius")))
                        .overlay { if active == item { RoundedRectangle(cornerRadius: QelvoraTokens.token("segment-radius")).stroke(qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")) } }
                        .contentShape(Rectangle().inset(by: -QelvoraTokens.token("space-1") / 2))
                }.buttonStyle(.plain).accessibilityLabel(item).accessibilityAddTraits(active == item ? .isSelected : [])
            }
        }.padding(QelvoraTokens.token("space-1"))
            .background(qColor("surface-sunken", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
            .accessibilityElement(children: .contain)
    }
}

struct NavigationCount: View {
    let count: Int
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(String(count)).qText("data-sm", weight: .medium)
            .padding(.horizontal, QelvoraTokens.token("space-1") + QelvoraTokens.token("hairline"))
            .frame(minWidth: QelvoraTokens.textStyles["label"]!.lineHeight, minHeight: QelvoraTokens.textStyles["label"]!.lineHeight)
            .foregroundStyle(qColor("ground", scheme)).background(qColor("ink", scheme), in: Capsule())
            .accessibilityLabel(QelvoraCopy.text("waiting", values: ["count": String(count)]))
    }
}

public struct StudioTabBar: View {
    public var active: StudioTab
    public var requests: Int
    public var onSelect: (StudioTab) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(active: StudioTab = .requests, requests: Int = 0, onSelect: @escaping (StudioTab) -> Void = { _ in }) { self.active = active; self.requests = requests; self.onSelect = onSelect }
    public var body: some View {
        NavigationLayout { horizontal in
            ForEach(StudioTab.allCases, id: \.rawValue) { tab in
                SwiftUI.Button { onSelect(tab) } label: {
                    NavigationLabel(title: tab.title, horizontal: horizontal) {
                        QelvoraGlyph(name: tab.glyph, size: tab == .notes ? QelvoraTokens.textStyles["caption"]!.lineHeight : QelvoraTokens.token("glyph-size"), color: qColor(active == tab ? "ink" : "ink-muted", scheme))
                            .frame(height: QelvoraTokens.token("glyph-size"))
                            .overlay(alignment: .topLeading) { if tab == .requests && requests > 0 { NavigationCount(count: requests).overlay { Capsule().inset(by: -QelvoraTokens.token("hairline")).stroke(qColor("surface", scheme), lineWidth: QelvoraTokens.token("hairline") * 2) }.offset(x: QelvoraTokens.token("message-padding"), y: -QelvoraTokens.token("author-gap")) } }
                    }
                        .foregroundStyle(qColor(active == tab ? "ink" : "ink-muted", scheme)).contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel(tab.title)
                    .accessibilityValue(tab == .requests && requests > 0 ? QelvoraCopy.text("waiting", values: ["count": String(requests)]) : "")
                    .accessibilityAddTraits(active == tab ? .isSelected : [])
            }
        }.padding(.horizontal, QelvoraTokens.token("space-2"))
            .padding(.top, QelvoraTokens.token("author-gap"))
            .padding(.bottom, QelvoraTokens.token("space-6"))
            .background(qColor("surface", scheme))
            .overlay(alignment: .top) { Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline")) }
    }
}

public struct Sidebar: View {
    public var name: String
    public var active: String
    public var requests: Int
    public var status: String
    public var onSelect: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(name: String = "Maya", active: String = "Requests", requests: Int = 0, status: String = QelvoraCopy.text("studioLive", values: ["version": "v4"]), onSelect: @escaping (String) -> Void = { _ in }) { self.name = name; self.active = active; self.requests = requests; self.status = status; self.onSelect = onSelect }
    private let main = [("navNotes", "broadcast"), ("navRequests", "inbox"), ("navThreads", "threads"), ("navMyAI", "ring")]
    private let more = [("navOffers", "tag"), ("navPublish", "pen"), ("navInsights", "chart"), ("navEarnings", "coin"), ("navTeam", "people")]
    public var body: some View {
        VStack(alignment: .leading, spacing: QelvoraTokens.token("author-gap")) {
            HStack(spacing: QelvoraTokens.token("space-3")) {
                Avatar(initial: String(name.prefix(1)))
                VStack(alignment: .leading, spacing: QelvoraTokens.token("space-1") / 2) {
                    Text(name).qText("body-strong")
                    Text(QelvoraCopy.studioName).qText("sidebar-brand", italic: true).foregroundStyle(qColor("ink-muted", scheme))
                }
            }.padding(.horizontal, QelvoraTokens.token("space-2")).padding(.bottom, QelvoraTokens.token("space-4"))
            group(main)
            Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline")).padding(QelvoraTokens.token("segment-radius"))
            group(more)
            Spacer(minLength: 0)
            HStack(spacing: QelvoraTokens.token("space-2")) {
                QelvoraGlyph(name: "ring", size: QelvoraTokens.token("space-3"), color: qColor("ai-ink", scheme))
                Text(status).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            }.padding(.top, QelvoraTokens.token("space-3")).padding(.horizontal, QelvoraTokens.token("segment-radius"))
                .overlay(alignment: .top) { Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline")) }
        }.padding(.horizontal, QelvoraTokens.token("space-3")).padding(.vertical, QelvoraTokens.token("space-5"))
            .frame(width: QelvoraTokens.token("sidebar-width"), alignment: .leading).frame(minHeight: QelvoraTokens.token("sidebar-min-height"))
            .foregroundStyle(qColor("ink", scheme)).background(qColor("surface", scheme))
            .overlay(alignment: .trailing) { Rectangle().fill(qColor("line", scheme)).frame(width: QelvoraTokens.token("hairline")) }
    }
    private func group(_ items: [(String, String)]) -> some View {
        VStack(spacing: QelvoraTokens.token("space-1") / 2) {
            ForEach(items, id: \.0) { key, glyph in
                let title = QelvoraCopy.text(key)
                SwiftUI.Button { onSelect(title) } label: {
                    HStack(spacing: QelvoraTokens.token("space-3")) {
                        QelvoraGlyph(name: glyph, size: glyph == "broadcast" ? QelvoraTokens.textStyles["body"]!.size : QelvoraTokens.token("space-5"), color: qColor(active == title ? "ink" : "ink-muted", scheme)).frame(width: QelvoraTokens.token("space-5"))
                        Text(title).qText("control-body", weight: .semibold).frame(maxWidth: .infinity, alignment: .leading)
                        if key == "navRequests" && requests > 0 { NavigationCount(count: requests) }
                    }.padding(.horizontal, QelvoraTokens.token("segment-radius")).frame(minHeight: QelvoraTokens.token("segment-height"))
                        .foregroundStyle(qColor(active == title ? "ink" : "ink-muted", scheme))
                        .background(active == title ? qColor("surface-sunken", scheme) : .clear, in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")))
                        .contentShape(Rectangle().inset(by: -QelvoraTokens.token("space-1") / 2))
                }.buttonStyle(.plain).accessibilityAddTraits(active == title ? .isSelected : [])
            }
        }
    }
}
