import SwiftUI

public enum ButtonVariant: String, CaseIterable, Sendable { case ai, maya, secondary, quiet }
public enum ButtonSize: String, Sendable { case regular, lg }

public struct Button: View {
    public var title: String
    public var variant: ButtonVariant
    public var size: ButtonSize
    public var block: Bool
    public var initial: String
    public var disabled: Bool
    public var disabledReason: String?
    public var action: () -> Void
    @Environment(\.colorScheme) private var scheme

    public init(_ title: String, variant: ButtonVariant = .ai, size: ButtonSize = .regular, block: Bool = false, initial: String = "M", disabled: Bool = false, disabledReason: String? = nil, action: @escaping () -> Void = {}) {
        self.title = title; self.variant = variant; self.size = size; self.block = block; self.initial = initial; self.disabled = disabled; self.disabledReason = disabledReason; self.action = action
    }

    private var fill: Color {
        switch variant {
        case .ai: qColor("ai-ink", scheme)
        case .maya: qColor("maya-surface", scheme)
        default: .clear
        }
    }
    private var ink: Color { qColor(variant == .ai ? "on-ai" : variant == .maya ? "on-maya" : "ink", scheme) }

    public var body: some View {
        VStack(alignment: .leading, spacing: QelvoraTokens.token("space-1")) {
            SwiftUI.Button(action: action) {
                HStack(spacing: QelvoraTokens.token("space-2") + QelvoraTokens.token("space-1") / 2) {
                    if variant == .maya { Seal(initial: initial, size: QelvoraTokens.token("welcome-mark-height") / 2, onMaya: true) }
                    Text(title).qText(size == .lg ? "button-lg" : "body-strong")
                }
                .frame(maxWidth: block ? .infinity : nil)
                .frame(minHeight: variant == .quiet ? QelvoraTokens.token("touch-target") : size == .lg ? QelvoraTokens.token("button-lg") : QelvoraTokens.token("space-12"))
                .padding(.horizontal, QelvoraTokens.token(variant == .quiet ? "space-3" : "space-5"))
                .foregroundStyle(ink)
                .background(fill, in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")))
                .overlay {
                    if variant == .secondary || variant == .maya {
                        RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(qColor(variant == .maya ? "maya-line" : "control-line", scheme), lineWidth: 1)
                    }
                }
                .opacity(disabled ? 0.55 : 1)
                .contentShape(RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")))
            }
            .buttonStyle(.plain)
            .disabled(disabled)
            if disabled, let disabledReason { Text(disabledReason).qText("caption").foregroundStyle(qColor("ink-muted", scheme)) }
        }
    }
}

public struct SignedMarker: View {
    public var name: String
    public var time: String?
    public var extra: String?
    public var href: URL?
    public var size: CGFloat
    public var onMaya: Bool
    public var action: () -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.openURL) private var openURL

    public init(name: String = "Maya", time: String? = nil, extra: String? = nil, href: URL? = nil, size: CGFloat = 13, onMaya: Bool = false, action: @escaping () -> Void = {}) {
        self.name = name; self.time = time; self.extra = extra; self.href = href; self.size = size; self.onMaya = onMaya; self.action = action
    }

    public var body: some View {
        SwiftUI.Button {
            if let href { openURL(href) } else { action() }
        } label: {
            HStack(spacing: QelvoraLayout.authorGap) {
                QelvoraGlyph(name: "sealCheck", size: size, color: qColor(onMaya ? "maya-accent" : "maya-ink", scheme), cutColor: qColor(onMaya ? "maya-surface" : "surface", scheme))
                Text(QelvoraCopy.text("signedBy", values: ["name": name])).underline().qText("caption", weight: .semibold)
                if let time { Text("· \(time)").qText("data-sm").foregroundStyle(qColor(onMaya ? "on-maya-muted" : "ink-muted", scheme)) }
                if let extra { Text("· \(extra)").qText("data-sm").foregroundStyle(qColor(onMaya ? "on-maya-muted" : "ink-muted", scheme)) }
            }
            .foregroundStyle(qColor(onMaya ? "maya-accent" : "maya-ink", scheme))
            .frame(minHeight: QelvoraTokens.token("touch-target"))
        }.buttonStyle(.plain)
            .accessibilityLabel(QelvoraCopy.text("signedBy", values: ["name": name]) + ". " + QelvoraCopy.text("openVerification"))
    }
}

public struct ContextCard: View {
    public var source: String
    public var title: String
    public var onRemove: () -> Void
    @Environment(\.colorScheme) private var scheme
    public init(source: String = "From Instagram", title: String, onRemove: @escaping () -> Void = {}) { self.source = source; self.title = title; self.onRemove = onRemove }
    public var body: some View {
        HStack(spacing: QelvoraTokens.token("space-3")) {
            VStack(alignment: .leading, spacing: QelvoraTokens.token("space-1") / 2) {
                Text(source.uppercased()).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                Text(title).qText("context-body").foregroundStyle(qColor("ink", scheme))
            }.frame(maxWidth: .infinity, alignment: .leading)
            SwiftUI.Button(action: onRemove) {
                QelvoraGlyph(name: "close", size: QelvoraTokens.token("glyph-size"), color: qColor("ink-muted", scheme))
                    .frame(width: QelvoraTokens.token("touch-target"), height: QelvoraTokens.token("touch-target"))
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(QelvoraCopy.text("removeContext"))
        }
        .padding(.leading, QelvoraTokens.token("space-3"))
        .padding(.trailing, QelvoraTokens.token("space-1"))
        .padding(.vertical, QelvoraTokens.token("space-2"))
        .background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")))
        .overlay { RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(qColor("line", scheme), lineWidth: 1) }
    }
}
