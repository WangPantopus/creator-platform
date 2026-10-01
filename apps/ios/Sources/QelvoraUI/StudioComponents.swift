import SwiftUI

private func studioSpace(_ name: String) -> CGFloat { QelvoraTokens.token(name) }
private func studioCopy(_ key: String, _ values: [String: String] = [:]) -> String { QelvoraCopy.text(key, values: values) }

private struct StudioBorder: ViewModifier {
    let radius: String
    let border: String
    var background: String = "surface"
    var dashed = false
    var lineWidth: CGFloat = studioSpace("hairline")
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.background(qColor(background, scheme), in: RoundedRectangle(cornerRadius: studioSpace(radius)))
            .overlay(RoundedRectangle(cornerRadius: studioSpace(radius)).stroke(qColor(border, scheme), style: StrokeStyle(lineWidth: lineWidth, dash: dashed ? [studioSpace("space-1"), studioSpace("space-1")] : [])))
    }
}

private struct StudioAction: View {
    let title: String
    var secondary = false
    var largeText = false
    var padding: CGFloat?
    let action: () -> Void
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        SwiftUI.Button(action: action) {
            Text(title).qText(largeText ? "control-body" : "control-compact", weight: .semibold)
                .frame(minHeight: studioSpace("touch-target"))
                .padding(.horizontal, padding ?? studioSpace(secondary ? "space-5" : "space-3"))
                .foregroundStyle(qColor("ink", scheme))
                .overlay { if secondary { RoundedRectangle(cornerRadius: studioSpace("radius-lg")).stroke(qColor("control-line", scheme), lineWidth: studioSpace("hairline")) } }
                .contentShape(RoundedRectangle(cornerRadius: studioSpace("radius-lg")))
        }.buttonStyle(.plain)
    }
}

private struct StudioBadge: View {
    let title: String
    var ink = "ink-muted"
    var tag = false
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        Text(title.uppercased()).qText("badge")
            .padding(.horizontal, studioSpace("space-2"))
            .padding(.vertical, studioSpace("space-1") * (tag ? 0.5 : 0.75))
            .foregroundStyle(qColor(ink, scheme))
            .overlay(Capsule().stroke(qColor(tag ? "line" : ink, scheme), lineWidth: studioSpace("hairline")))
            .fixedSize(horizontal: true, vertical: false)
    }
}

private struct StudioRule: View {
    var color = "line"
    @Environment(\.colorScheme) private var scheme
    var body: some View { Rectangle().fill(qColor(color, scheme)).frame(height: studioSpace("hairline")) }
}

/// Keeps each authorship label and tag intact while following the source's flex wrapping.
private struct StudioWrapLayout: Layout {
    let gap: CGFloat
    private func positions(_ subviews: Subviews, width: CGFloat) -> ([(CGPoint, CGSize)], CGSize) {
        var items: [(CGPoint, CGSize)] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, usedWidth: CGFloat = 0
        for subview in subviews {
            let ideal = subview.sizeThatFits(.unspecified)
            let size = ideal.width <= width ? ideal : subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { x = 0; y += rowHeight + gap; rowHeight = 0 }
            items.append((CGPoint(x: x, y: y), size))
            usedWidth = max(usedWidth, x + size.width)
            x += size.width + gap
            rowHeight = max(rowHeight, size.height)
        }
        return (items, CGSize(width: usedWidth, height: y + rowHeight))
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        positions(subviews, width: proposal.width ?? .infinity).1
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, item) in positions(subviews, width: bounds.width).0.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + item.0.x, y: bounds.minY + item.0.y), anchor: .topLeading, proposal: ProposedViewSize(item.1))
        }
    }
}

public enum QueueKind: String, Sendable { case packet, commitment, rule }
public struct QueueCard: View {
    public var kind: QueueKind
    public var handle: String
    public var mode: String
    public var price: String
    public var due: String
    public var summary: String
    public var shared: String?
    public var draftReady: Bool
    public var overdue: Bool
    public var onOpen: () -> Void
    public var onDecline: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(kind: QueueKind = .packet, handle: String = "", mode: String = "", price: String = "", due: String = "", summary: String = "", shared: String? = nil, draftReady: Bool = false, overdue: Bool = false, onOpen: @escaping () -> Void = {}, onDecline: @escaping () -> Void = {}) {
        self.kind = kind; self.handle = handle; self.mode = mode; self.price = price; self.due = due; self.summary = summary; self.shared = shared; self.draftReady = draftReady; self.overdue = overdue; self.onOpen = onOpen; self.onDecline = onDecline
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-2") + studioSpace("space-1") / 2) {
            HStack(spacing: studioSpace("space-2") + studioSpace("space-1") / 2) {
                if overdue { QelvoraGlyph(name: "alert", size: studioSpace("space-4"), color: qColor("alert", scheme)) }
                Text(handle).qText("body-strong").frame(maxWidth: .infinity, alignment: .leading)
                Text(overdue ? studioCopy("overduePrefix", ["time": due]) : due).qText("data-sm").foregroundStyle(qColor(overdue ? "alert" : "ink-muted", scheme)).fixedSize(horizontal: true, vertical: false)
            }
            Text("\(studioCopy(kind == .commitment ? "queueAccepted" : kind == .rule ? "queueRule" : "queueNew")) · \(mode) · \(price)").qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
            Text(summary).qText("control-body")
            ViewThatFits(in: .horizontal) {
                footer
                VStack(alignment: .leading, spacing: studioSpace("space-2")) { metadata; actions }
            }
        }
        .padding(studioSpace("message-padding"))
        .foregroundStyle(qColor("ink", scheme))
        .modifier(StudioBorder(radius: "radius-lg", border: overdue ? "alert" : kind == .commitment ? "ink" : "line", lineWidth: studioSpace("hairline") * (overdue ? 2 : 1)))
        .accessibilityElement(children: .contain)
    }
    private var footer: some View { HStack(spacing: studioSpace("space-2")) { metadata; Spacer(minLength: 0); actions } }
    @ViewBuilder private var metadata: some View {
        if let shared { Text(studioCopy("shared", ["items": shared])).qText("caption").foregroundStyle(qColor("ink-muted", scheme)) }
        if draftReady { StudioBadge(title: studioCopy("aiDraftReady"), ink: "ai-ink") }
    }
    private var actions: some View {
        HStack(spacing: studioSpace("space-2")) {
            if kind != .commitment { StudioAction(title: studioCopy("declineNoCharge"), action: onDecline) }
            StudioAction(title: studioCopy(kind == .commitment ? "deliver" : "open"), secondary: true, largeText: true, action: onOpen)
        }
    }
}

public struct CapacityRow: Sendable {
    public var mode: String; public var used: Int; public var limit: Int
    public init(mode: String, used: Int, limit: Int) { self.mode = mode; self.used = used; self.limit = limit }
}
public struct CapacityHeader: View {
    public var rows: [CapacityRow]
    public var line: String?
    @Environment(\.colorScheme) private var scheme
    public init(rows: [CapacityRow] = [], line: String? = nil) { self.rows = rows; self.line = line }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-2")) {
            Text(studioCopy("thisWeek")).qText("data-sm").foregroundStyle(qColor("on-maya-muted", scheme))
            ForEach(rows.indices, id: \.self) { index in
                let row = rows[index]
                HStack(spacing: studioSpace("space-3")) {
                    Text(row.mode).qText("control-body").frame(maxWidth: .infinity, alignment: .leading)
                    Text(studioCopy("capacityUsed", ["used": String(row.used), "limit": String(row.limit), "left": String(row.limit - row.used)])).qText("data-label").foregroundStyle(qColor("maya-accent", scheme)).fixedSize(horizontal: true, vertical: false)
                }
            }
            if let line { Text(line).qText("label", weight: .regular).foregroundStyle(qColor("on-maya-muted", scheme)).padding(.top, studioSpace("author-gap")).frame(maxWidth: .infinity, alignment: .leading).overlay(alignment: .top) { StudioRule(color: "plate-rule").opacity(studioSpace("capacity-rule-opacity")) } }
        }
        .padding(studioSpace("message-padding"))
        .foregroundStyle(qColor("on-maya", scheme))
        .background(qColor("maya-surface", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-lg")))
        .accessibilityLabel(studioCopy("thisWeek"))
    }
}

public struct LabelPreview: View {
    public var kind: AuthorKind
    public var name: String
    @Environment(\.colorScheme) private var scheme
    public init(kind: AuthorKind = .approvedDraft, name: String = "Maya") { self.kind = kind; self.name = name }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-2")) {
            Text(studioCopy("labelPreview")).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            AuthorLabel(kind: kind, name: name)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, studioSpace("space-3")).padding(.horizontal, studioSpace("message-padding"))
            .modifier(StudioBorder(radius: "radius-md", border: "control-line", background: "ground", dashed: true))
    }
}

public struct SigningSheet: View {
    public var title: String
    public var rows: [(String, String)]
    public var action: String
    public var signing: Bool
    public var onSign: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(title: String? = nil, rows: [(String, String)] = [], action: String? = nil, signing: Bool = false, onSign: @escaping () -> Void = {}) {
        self.title = title ?? studioCopy("acceptRequest"); self.rows = rows; self.action = action ?? studioCopy("signFaceID"); self.signing = signing; self.onSign = onSign
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-4")) {
            RoundedRectangle(cornerRadius: studioSpace("sheet-grabber-radius")).fill(qColor("line", scheme)).frame(width: studioSpace("sheet-grabber-width"), height: studioSpace("sheet-grabber-height")).frame(maxWidth: .infinity).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: studioSpace("space-1")) {
                Text(studioCopy("reviewAndSign")).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                Text(title).qText("signing-title")
            }
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { index in
                    if index > 0 { StudioRule() }
                    HStack(alignment: .top, spacing: studioSpace("space-3")) {
                        Text(rows[index].0.uppercased()).qText("signing-label").foregroundStyle(qColor("ink-muted", scheme)).frame(width: studioSpace("signing-label-width"), alignment: .leading)
                        Text(rows[index].1).qText("control-body").frame(maxWidth: .infinity, alignment: .leading)
                    }.padding(.horizontal, studioSpace("space-3")).padding(.vertical, studioSpace("space-2") + studioSpace("space-1") / 2)
                }
            }.modifier(StudioBorder(radius: "radius-md", border: "line"))
            Text(studioCopy("exactSignature")).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            SwiftUI.Button(action: onSign) {
                HStack(spacing: studioSpace("space-3")) { QelvoraGlyph(name: "face", size: studioSpace("space-5"), color: qColor("maya-accent", scheme)); Text(action).qText("body-strong") }
                    .frame(maxWidth: .infinity).frame(minHeight: studioSpace("button-lg")).foregroundStyle(qColor("on-maya", scheme)).background(qColor("maya-surface", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-lg")))
            }.buttonStyle(.plain).disabled(signing)
        }
        .padding(.horizontal, studioSpace("space-5")).padding(.top, studioSpace("space-3")).padding(.bottom, studioSpace("space-6") + studioSpace("space-1"))
        .frame(maxWidth: studioSpace("phone-width"), alignment: .leading)
        .foregroundStyle(qColor("ink", scheme))
        .background(qColor("surface", scheme), in: UnevenRoundedRectangle(topLeadingRadius: studioSpace("radius-xl"), topTrailingRadius: studioSpace("radius-xl")))
        .qShadow("shadow-sheet", radius: studioSpace("radius-xl"))
        .accessibilityLabel(studioCopy("reviewAndSign"))
    }
}

public struct AuditBanner: View {
    public var children: String
    @Environment(\.colorScheme) private var scheme
    public init(children: String? = nil) { self.children = children ?? studioCopy("auditAccess") }
    public var body: some View {
        HStack(spacing: studioSpace("space-2") + studioSpace("space-1") / 2) {
            QelvoraGlyph(name: "info", size: studioSpace("space-4") + studioSpace("space-1") / 2, color: qColor("ink-muted", scheme))
            Text(children).qText("label", weight: .regular)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, studioSpace("message-padding")).padding(.vertical, studioSpace("space-2") + studioSpace("space-1") / 2)
            .foregroundStyle(qColor("ink", scheme)).background(qColor("surface-sunken", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-md")))
            .accessibilityElement(children: .combine)
    }
}

public enum SourceState: String, Sendable { case approved, candidate, revoked }
public struct SourceRow: View {
    public var title: String; public var meta: String; public var scope: String; public var state: SourceState
    public var onApprove: () -> Void; public var onRevoke: () -> Void; public var onRestore: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(title: String = "", meta: String = "", scope: String = "public", state: SourceState = .approved, onApprove: @escaping () -> Void = {}, onRevoke: @escaping () -> Void = {}, onRestore: @escaping () -> Void = {}) { self.title = title; self.meta = meta; self.scope = scope; self.state = state; self.onApprove = onApprove; self.onRevoke = onRevoke; self.onRestore = onRestore }
    public var body: some View {
        HStack(spacing: studioSpace("space-3")) {
            VStack(alignment: .leading, spacing: studioSpace("space-1") / 2) { Text(title).qText("control-body", weight: .semibold); Text(meta).qText("caption").foregroundStyle(qColor("ink-muted", scheme)) }.frame(maxWidth: .infinity, alignment: .leading)
            Text((scope == "public" ? studioCopy("publicScope") : scope).uppercased()).qText("data-sm").padding(.horizontal, studioSpace("space-2")).padding(.vertical, studioSpace("space-1") / 2).foregroundStyle(qColor(scope == "public" ? "ink-muted" : "maya-ink", scheme)).overlay(Capsule().stroke(qColor(scope == "public" ? "control-line" : "maya-ink", scheme), lineWidth: studioSpace("hairline"))).fixedSize(horizontal: true, vertical: false)
            StudioAction(title: studioCopy(state == .candidate ? "approve" : state == .revoked ? "restore" : "revoke"), secondary: state == .candidate, padding: state == .candidate ? studioSpace("message-padding") : nil, action: state == .candidate ? onApprove : state == .revoked ? onRestore : onRevoke)
        }.padding(.vertical, studioSpace("space-3")).padding(.horizontal, studioSpace("message-padding")).foregroundStyle(qColor("ink", scheme)).modifier(StudioBorder(radius: "radius-md", border: "line"))
    }
}

public enum NotificationKind: String, Sendable { case ai, maya, note, approved, reaction, team, system }
public struct NotificationRow: View {
    public var kind: NotificationKind; public var name: String; public var audience: String; public var systemLabel: String
    public var time: String?; public var unread: Bool; public var children: String; public var onOpen: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(kind: NotificationKind = .ai, name: String = "Maya", audience: String = "Kiln Club members", systemLabel: String? = nil, time: String? = nil, unread: Bool = false, children: String = "", onOpen: @escaping () -> Void = {}) { self.kind = kind; self.name = name; self.audience = audience; self.systemLabel = systemLabel ?? studioCopy("requestUpdate"); self.time = time; self.unread = unread; self.children = children; self.onOpen = onOpen }
    private var sender: String {
        switch kind { case .ai: studioCopy("aiAuthor", ["name": name]); case .maya: name; case .note: studioCopy("noteAudience", ["name": name, "audience": audience]); case .approved: studioCopy("approvedNotification", ["name": name]); case .reaction: studioCopy("reaction", ["name": name]); case .team: studioCopy("teamNotification", ["name": name]); case .system: systemLabel }
    }
    private var glyph: String { switch kind { case .ai: "ring"; case .note: "broadcast"; case .approved: "approved"; case .reaction: "heart"; case .team: "team"; case .system: "inbox"; case .maya: "ring" } }
    private var iconBackground: String { kind == .ai ? "ai-surface" : kind == .team ? "team-surface" : kind == .system ? "surface-sunken" : "maya-surface" }
    private var iconInk: String { kind == .ai ? "ai-ink" : kind == .team ? "team-ink" : kind == .system ? "ink-muted" : "maya-accent" }
    public var body: some View {
        SwiftUI.Button(action: onOpen) {
            HStack(alignment: .top, spacing: studioSpace("space-3")) {
                Group { if kind == .maya { Text(String(name.prefix(1))).qText("email-brand", italic: true) } else { QelvoraGlyph(name: glyph, size: studioSpace("space-4"), color: qColor(iconInk, scheme)) } }
                    .foregroundStyle(qColor(iconInk, scheme)).frame(width: studioSpace("avatar-size"), height: studioSpace("avatar-size")).background(qColor(iconBackground, scheme), in: RoundedRectangle(cornerRadius: studioSpace("notification-radius"))).overlay { if kind == .ai { RoundedRectangle(cornerRadius: studioSpace("notification-radius")).stroke(qColor("ai-line", scheme), lineWidth: studioSpace("hairline")) } }.accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) { Text(sender).qText("label"); Text(children).qText("control-body") }.frame(maxWidth: .infinity, alignment: .leading)
                if let time { Text(time).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)).fixedSize(horizontal: true, vertical: false) }
            }.padding(.horizontal, studioSpace("space-4")).padding(.vertical, studioSpace("message-padding")).foregroundStyle(qColor("ink", scheme)).background(qColor(unread ? "surface" : "ground", scheme)).overlay(alignment: .bottom) { StudioRule() }
        }.buttonStyle(.plain).accessibilityLabel("\(sender). \(children)\(time.map { ". \($0)" } ?? "")")
    }
}

public struct ShareCard: View {
    public var name: String; public var handle: String; public var time: String?; public var verify: URL; public var children: String
    @Environment(\.colorScheme) private var scheme
    public init(name: String = "Maya", handle: String = "@kilnfire", time: String? = nil, verify: URL, children: String = "") { self.name = name; self.handle = handle; self.time = time; self.verify = verify; self.children = children }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("share-gap")) {
            VStack(alignment: .leading, spacing: studioSpace("message-padding")) { AuthorLabel(kind: .humanCreator, name: name, onMaya: true); Text(children).qText("share-quote") }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: studioSpace("space-2")) {
                Text(studioCopy("shareReplied", ["name": name, "handle": handle])).qText("label")
                SignedMarker(name: name, time: time, href: verify, onMaya: true)
                Text(studioCopy("verifyAt", ["url": verify.absoluteString.uppercased()])).qText("data-sm").foregroundStyle(qColor("on-maya-muted", scheme))
            }.padding(.top, studioSpace("message-padding")).frame(maxWidth: .infinity, alignment: .leading).overlay(alignment: .top) { StudioRule(color: "plate-rule").opacity(studioSpace("share-rule-opacity")) }
        }.padding(studioSpace("share-padding")).frame(width: studioSpace("share-size"), alignment: .leading).frame(minHeight: studioSpace("share-size"), alignment: .leading).foregroundStyle(qColor("on-maya", scheme)).background(qColor("maya-surface", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-xl"))).qShadow("shadow-plate", radius: studioSpace("radius-xl")).accessibilityElement(children: .contain)
    }
}

public struct CallChip: View {
    public var name: String; public var time: String?; public var end: String?; public var recording: Bool
    @Environment(\.colorScheme) private var scheme
    public init(name: String = "Maya", time: String? = nil, end: String? = nil, recording: Bool = false) { self.name = name; self.time = time; self.end = end; self.recording = recording }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-2")) {
            HStack(spacing: studioSpace("space-2")) { Seal(initial: String(name.prefix(1)), size: studioSpace("space-6"), live: true, onMaya: true); Text(studioCopy("callAuthor", ["name": name])).qText("control-body", weight: .semibold) }.padding(.leading, studioSpace("space-2")).padding(.trailing, studioSpace("message-padding")).frame(height: studioSpace("call-person-height")).foregroundStyle(qColor("maya-accent", scheme)).background(qColor("maya-surface", scheme), in: Capsule()).qShadow("glow-maya", radius: studioSpace("radius-pill"))
            HStack(spacing: studioSpace("space-2") + studioSpace("space-1") / 2) {
                HStack(spacing: studioSpace("space-2")) { Circle().fill(recording ? qColor("ink", scheme) : .clear).overlay(Circle().stroke(qColor(recording ? "ink" : "ink-muted", scheme), lineWidth: studioSpace("hairline") * 1.5)).frame(width: studioSpace("space-2"), height: studioSpace("space-2")).accessibilityHidden(true); Text(studioCopy(recording ? "agreedRecording" : "notRecording")).qText("label") }.padding(.horizontal, studioSpace("space-3")).frame(height: studioSpace("call-recording-height")).modifier(StudioBorder(radius: "radius-pill", border: "control-line"))
                if let time { Text(end.map { studioCopy("timerOf", ["time": time, "end": $0]) } ?? time).qText("data-label").foregroundStyle(qColor("ink-muted", scheme)).fixedSize(horizontal: true, vertical: false).accessibilityHidden(true) }
            }
        }.foregroundStyle(qColor("ink", scheme)).accessibilityElement(children: .combine)
    }
}

public enum ReservedKind: String, Sendable { case fanAgent = "fan_agent", aiCall = "ai_call", aiVideo = "ai_video" }
/// A specification/catalog component only; product screens must never render reserved authorship.
public struct ReservedLabel: View {
    public var kind: ReservedKind; public var name: String; public var handle: String
    @Environment(\.colorScheme) private var scheme
    public init(kind: ReservedKind = .fanAgent, name: String = "Maya", handle: String = "@kilnfire") { self.kind = kind; self.name = name; self.handle = handle }
    public var body: some View {
        StudioWrapLayout(gap: studioSpace("space-2") + studioSpace("space-1") / 2) {
            HStack(spacing: studioSpace("author-gap")) {
                QelvoraGlyph(name: kind == .fanAgent ? "dashRing" : kind == .aiCall ? "phone" : "video", size: studioSpace("message-padding"), color: qColor("ink-muted", scheme))
                Text(studioCopy(kind == .fanAgent ? "reservedAssistant" : kind == .aiCall ? "reservedCall" : "reservedVideo", kind == .fanAgent ? ["handle": handle] : ["name": name])).qText("label")
            }
            StudioBadge(title: studioCopy("reservedDisabled"), tag: true)
        }.padding(.horizontal, studioSpace("space-3")).padding(.vertical, studioSpace("space-2") + studioSpace("space-1") / 2).foregroundStyle(qColor("ink-muted", scheme)).modifier(StudioBorder(radius: "radius-md", border: "control-line", background: "ground", dashed: true)).disabled(true)
    }
}

public enum CountdownTone: String, Sendable { case neutral, soon, overdue }
public struct Countdown: View {
    public var tone: CountdownTone; public var children: String
    @Environment(\.colorScheme) private var scheme
    public init(tone: CountdownTone = .neutral, children: String = "") { self.tone = tone; self.children = children }
    public var body: some View {
        HStack(spacing: studioSpace("author-gap")) { QelvoraGlyph(name: tone == .overdue ? "alert" : "clock", size: studioSpace("space-3") + studioSpace("hairline"), color: qColor(tone == .overdue ? "alert" : tone == .soon ? "ink" : "ink-muted", scheme)); Text(tone == .overdue ? studioCopy("overduePrefix", ["time": children.uppercased()]) : children.uppercased()).qText("data-sm") }
            .padding(.horizontal, studioSpace("space-2") + studioSpace("space-1") / 2).frame(minHeight: studioSpace("countdown-height")).foregroundStyle(qColor(tone == .overdue ? "alert" : tone == .soon ? "ink" : "ink-muted", scheme)).modifier(StudioBorder(radius: "radius-pill", border: tone == .overdue ? "alert" : tone == .soon ? "control-line" : "line")).fixedSize(horizontal: true, vertical: false).accessibilityElement(children: .combine)
    }
}

public struct InsteadAction: Sendable {
    public var title: String; public var explanation: String
    public init(title: String, explanation: String) { self.title = title; self.explanation = explanation }
}
public struct InsteadMenu: View {
    public var name: String; public var items: [InsteadAction]; public var onSelect: (Int) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(name: String = "Maya", items: [InsteadAction]? = nil, onSelect: @escaping (Int) -> Void = { _ in }) {
        self.name = name; self.items = items ?? [InsteadAction(title: studioCopy("insteadAI"), explanation: studioCopy("insteadAIHelp")), InsteadAction(title: studioCopy("insteadGroup"), explanation: studioCopy("insteadGroupHelp")), InsteadAction(title: studioCopy("insteadInfo"), explanation: studioCopy("insteadInfoHelp")), InsteadAction(title: studioCopy("declineNoCharge"), explanation: studioCopy("insteadDeclineHelp"))]; self.onSelect = onSelect
    }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-2") + studioSpace("space-1") / 2) {
            VStack(alignment: .leading, spacing: studioSpace("space-1")) { Text(studioCopy("instead")).qText("data-sm"); Text(studioCopy("insteadExplanation")).qText("caption") }.foregroundStyle(qColor("ink-muted", scheme))
            VStack(spacing: 0) {
                ForEach(items.indices, id: \.self) { index in
                    if index > 0 { StudioRule() }
                    SwiftUI.Button { onSelect(index) } label: {
                        HStack(spacing: studioSpace("space-3")) { VStack(alignment: .leading, spacing: studioSpace("space-1") / 2) { Text(items[index].title).qText("body-strong"); Text(items[index].explanation).qText("caption").foregroundStyle(qColor("ink-muted", scheme)) }.frame(maxWidth: .infinity, alignment: .leading); QelvoraGlyph(name: "chevron", color: qColor("ink-muted", scheme)) }.padding(.vertical, studioSpace("space-3")).padding(.horizontal, studioSpace("message-padding")).frame(minHeight: studioSpace("button-lg")).contentShape(Rectangle())
                    }.buttonStyle(.plain)
                }
            }.modifier(StudioBorder(radius: "radius-md", border: "line"))
        }.foregroundStyle(qColor("ink", scheme)).accessibilityLabel(studioCopy("instead"))
    }
}

public enum BoundaryTestState: String, Sendable { case pass, fail, running }
public struct BoundaryTest: Sendable { public var name: String; public var state: BoundaryTestState; public init(name: String, state: BoundaryTestState = .pass) { self.name = name; self.state = state } }
public struct BoundaryTranscript: Sendable { public var test: String; public var fan: String; public var ai: String; public var why: String?; public init(test: String, fan: String, ai: String, why: String? = nil) { self.test = test; self.fan = fan; self.ai = ai; self.why = why } }
public struct TestConsole: View {
    public var tests: [BoundaryTest]; public var version: String; public var versionShort: String; public var transcript: BoundaryTranscript?; public var name: String; public var onPublish: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(tests: [BoundaryTest] = [], version: String = "V4 DRAFT", versionShort: String = "v4", transcript: BoundaryTranscript? = nil, name: String = "Maya", onPublish: @escaping () -> Void = {}) { self.tests = tests; self.version = version; self.versionShort = versionShort; self.transcript = transcript; self.name = name; self.onPublish = onPublish }
    private var failing: [BoundaryTest] { tests.filter { $0.state == .fail } }
    private var canPublish: Bool { !tests.isEmpty && tests.allSatisfy { $0.state == .pass } }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("space-3")) {
            HStack(alignment: .top, spacing: studioSpace("space-3")) { Text("\(studioCopy("boundaryTests")) · \(version)"); Spacer(minLength: 0); Text(studioCopy("testPassCount", ["passed": String(tests.filter { $0.state == .pass }.count), "total": String(tests.count)])) }.qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
            VStack(spacing: 0) {
                ForEach(tests.indices, id: \.self) { index in
                    if index > 0 { StudioRule() }
                    HStack(spacing: studioSpace("space-2") + studioSpace("space-1") / 2) { QelvoraGlyph(name: tests[index].state == .fail ? "alert" : tests[index].state == .running ? "clock" : "check", size: studioSpace("message-padding"), color: qColor(tests[index].state == .fail ? "alert" : tests[index].state == .running ? "ink-muted" : "ai-ink", scheme)).frame(width: studioSpace("space-5")); Text(tests[index].name).qText("control-body").frame(maxWidth: .infinity, alignment: .leading); Text(studioCopy(tests[index].state == .fail ? "testFails" : tests[index].state == .running ? "testRunning" : "testPasses").uppercased()).qText("data-sm").foregroundStyle(qColor(tests[index].state == .fail ? "alert" : "ink-muted", scheme)) }.frame(minHeight: studioSpace("segment-height"))
                }
            }
            if let transcript {
                VStack(alignment: .leading, spacing: studioSpace("space-2")) {
                    Text(studioCopy("transcript", ["test": transcript.test])).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                    transcriptLine(studioCopy("testFan"), transcript.fan, "ink-muted")
                    transcriptLine(studioCopy("aiAuthor", ["name": name]), transcript.ai, "ai-ink")
                    if let why = transcript.why { Text(why).qText("label", weight: .regular).padding(.top, studioSpace("space-2")).overlay(alignment: .top) { StudioRule() } }
                }.padding(studioSpace("space-3")).background(qColor("ground", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-md")))
            }
            Button(studioCopy("publishVersion", ["version": versionShort]), variant: .ai, disabled: !canPublish, action: onPublish)
            Text(canPublish ? studioCopy("publishingReady") : failing.isEmpty ? studioCopy("publishingPending") : studioCopy("publishingWait", ["tests": failing.map { $0.name.lowercased() }.joined(separator: ", ")])).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
        }.padding(studioSpace("space-4")).foregroundStyle(qColor("ink", scheme)).modifier(StudioBorder(radius: "radius-lg", border: "line"))
    }
    private func transcriptLine(_ who: String, _ text: String, _ ink: String) -> some View { HStack(alignment: .top, spacing: studioSpace("space-2") + studioSpace("space-1") / 2) { Text(who).qText("caption", weight: .semibold).foregroundStyle(qColor(ink, scheme)).frame(width: studioSpace("transcript-label-width"), alignment: .leading); Text(text).qText("control-body").frame(maxWidth: .infinity, alignment: .leading) } }
}

public enum AgentVersionState: String, Sendable { case draft, live, retired }
public struct AgentVersion: Sendable { public var id: String; public var state: AgentVersionState; public var date: String; public var changes: String; public init(id: String, state: AgentVersionState = .retired, date: String = "", changes: String = "") { self.id = id; self.state = state; self.date = date; self.changes = changes } }
public struct VersionList: View {
    public var versions: [AgentVersion]; public var onRollback: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    public init(versions: [AgentVersion] = [], onRollback: @escaping (String) -> Void = { _ in }) { self.versions = versions; self.onRollback = onRollback }
    public var body: some View {
        VStack(spacing: 0) {
            ForEach(versions.indices, id: \.self) { index in
                let version = versions[index]
                if index > 0 { StudioRule() }
                HStack(spacing: studioSpace("space-3")) {
                    Text(version.id.uppercased()).qText("data-label").foregroundStyle(qColor(version.state == .live ? "ai-ink" : "ink-muted", scheme)).frame(width: studioSpace("version-id-width"), alignment: .leading)
                    VStack(alignment: .leading, spacing: studioSpace("space-1") / 2) { Text(version.changes).qText("control-body"); Text(version.date).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)) }.frame(maxWidth: .infinity, alignment: .leading)
                    if version.state == .retired { StudioAction(title: studioCopy("rollBack", ["version": version.id])) { onRollback(version.id) } }
                    else { StudioBadge(title: studioCopy(version.state == .live ? "versionLive" : "versionDraft"), ink: version.state == .live ? "ai-ink" : "ink-muted") }
                }.padding(.vertical, studioSpace("space-3")).padding(.horizontal, studioSpace("message-padding"))
            }
        }.foregroundStyle(qColor("ink", scheme)).modifier(StudioBorder(radius: "radius-md", border: "line"))
    }
}

public struct DigestItem: View {
    public var name: String; public var handle: String; public var time: String?; public var filed: Bool; public var children: String; public var onFlag: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(name: String = "Maya", handle: String = "@kilnfire", time: String? = nil, filed: Bool = false, children: String = "", onFlag: @escaping () -> Void = {}) { self.name = name; self.handle = handle; self.time = time; self.filed = filed; self.children = children; self.onFlag = onFlag }
    public var body: some View {
        VStack(alignment: .leading, spacing: studioSpace("author-gap")) {
            HStack(spacing: studioSpace("space-3")) { AuthorLabel(kind: .ai, name: name, time: time); Spacer(minLength: 0); Text(studioCopy("digestTo", ["handle": handle.uppercased()])).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)).fixedSize(horizontal: true, vertical: false) }
            Text(children).qText("body")
            if filed { HStack(spacing: studioSpace("author-gap")) { QelvoraGlyph(name: "check", size: studioSpace("message-padding"), color: qColor("ink-muted", scheme)); Text(studioCopy("digestFiled")).qText("caption") }.foregroundStyle(qColor("ink-muted", scheme)).frame(minHeight: studioSpace("touch-target")) }
            else { SwiftUI.Button(action: onFlag) { Text(studioCopy("neverSay")).qText("label").frame(minHeight: studioSpace("touch-target")) }.buttonStyle(.plain) }
        }.padding(.horizontal, studioSpace("space-4")).padding(.top, studioSpace("message-padding")).padding(.bottom, studioSpace("author-gap")).foregroundStyle(qColor("ink", scheme)).modifier(StudioBorder(radius: "radius-lg", border: "ai-line", background: "ai-surface"))
    }
}

public struct EmailFrame: View {
    public var kind: AuthorKind; public var name: String; public var from: String?; public var subject: String; public var time: String?; public var cta: String?; public var footer: String?; public var children: String; public var verificationURL: URL?; public var onRead: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(kind: AuthorKind = .humanCreator, name: String = "Maya", from: String? = nil, subject: String, time: String? = nil, cta: String? = nil, footer: String? = nil, children: String = "", verificationURL: URL? = nil, onRead: @escaping () -> Void = {}) { self.kind = kind; self.name = name; self.from = from; self.subject = subject; self.time = time; self.cta = cta; self.footer = footer; self.children = children; self.verificationURL = verificationURL; self.onRead = onRead }
    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: studioSpace("space-1") / 2) {
                Text(studioCopy("emailFrom", ["from": from ?? (kind == .humanCreator || kind == .ai ? studioCopy("emailVia", ["sender": kind == .ai ? studioCopy("aiAuthor", ["name": name]) : name, "brand": QelvoraCopy.brandName]) : QelvoraCopy.brandName)]))
                Text(studioCopy("emailSubject", ["subject": subject]))
            }.qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)).padding(.horizontal, studioSpace("space-4")).padding(.vertical, studioSpace("space-2") + studioSpace("space-1") / 2).frame(maxWidth: .infinity, alignment: .leading).background(qColor("surface", scheme)).overlay(alignment: .bottom) { StudioRule() }
            VStack(alignment: .leading, spacing: studioSpace("share-gap")) {
                Text(QelvoraCopy.brandName).qText("email-brand", italic: true).padding(.bottom, studioSpace("space-3")).frame(maxWidth: .infinity, alignment: .leading).overlay(alignment: .bottom) { StudioRule() }
                if kind == .humanCreator {
                    VStack(alignment: .leading, spacing: studioSpace("space-2") + studioSpace("space-1") / 2) { AuthorLabel(kind: kind, name: name, time: time, onMaya: true); Text(children).qText("voice-lg"); SignedMarker(name: name, href: verificationURL, onMaya: true) }.padding(studioSpace("share-gap")).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(qColor("on-maya", scheme)).background(qColor("maya-surface", scheme), in: BubbleShape())
                } else {
                    VStack(alignment: .leading, spacing: studioSpace("space-2") + studioSpace("space-1") / 2) { AuthorLabel(kind: kind, name: name, time: time); Text(children).qText("body") }
                }
                Button(cta ?? studioCopy("emailRead", ["brand": QelvoraCopy.brandName]), variant: .secondary, action: onRead)
                Text(footer ?? studioCopy("emailFooter", ["name": name])).qText("caption").foregroundStyle(qColor("ink-muted", scheme)).padding(.top, studioSpace("message-padding")).frame(maxWidth: .infinity, alignment: .leading).overlay(alignment: .top) { StudioRule() }
            }.padding(studioSpace("space-6") + studioSpace("space-1")).frame(maxWidth: .infinity, alignment: .leading).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: studioSpace("radius-lg"))).padding(studioSpace("space-6"))
        }.foregroundStyle(qColor("ink", scheme)).modifier(StudioBorder(radius: "radius-md", border: "line", background: "ground"))
    }
}
