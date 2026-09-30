import SwiftUI

/// Only decode these values from a server response. A model never selects authorship.
public enum AuthorKind: String, CaseIterable, Sendable, Codable {
    case ai
    case approvedDraft = "approved_draft"
    case humanCreator = "human_creator"
    case humanBroadcast = "human_broadcast"
    case humanReaction = "human_reaction"
    case team
    case correction

    public func label(name: String = "Maya", audience: String = "Kiln Club members", member: String = "Priya") -> String {
        switch self {
        case .ai: return QelvoraCopy.text("aiAuthor", values: ["name": name])
        case .approvedDraft: return QelvoraCopy.text("approvedAuthor", values: ["name": name])
        case .humanCreator: return name
        case .humanBroadcast: return QelvoraCopy.text("noteAudience", values: ["name": name, "audience": audience])
        case .humanReaction: return QelvoraCopy.text("reaction", values: ["name": name])
        case .team: return QelvoraCopy.text("teamAuthor", values: ["name": name, "member": member])
        case .correction: return QelvoraCopy.text("correctionAuthor", values: ["name": name])
        }
    }

    func colorToken(onMaya: Bool) -> String {
        switch self {
        case .ai: return "ai-ink"
        case .team: return "team-ink"
        default: return onMaya ? "maya-accent" : "maya-ink"
        }
    }
}

public enum MessageKind: String, CaseIterable, Sendable, Codable {
    case fan, ai, team
    case humanCreator = "human_creator"
    case approvedDraft = "approved_draft"

    var author: AuthorKind? {
        switch self {
        case .fan: return nil
        case .ai: return .ai
        case .team: return .team
        case .humanCreator: return .humanCreator
        case .approvedDraft: return .approvedDraft
        }
    }
}

public enum Delivery: String, CaseIterable, Sendable, Codable {
    case pending, failed, accepted, streaming, interrupted
}

public enum DraftTreatment: String, CaseIterable, Sendable { case split, gradient, stacked }

public struct AuthorLabel: View {
    public var kind: AuthorKind
    public var name: String
    public var audience: String
    public var member: String
    public var time: String?
    public var onMaya: Bool
    @Environment(\.colorScheme) private var scheme

    public init(kind: AuthorKind = .ai, name: String = "Maya", audience: String = "Kiln Club members", member: String = "Priya", time: String? = nil, onMaya: Bool = false) {
        self.kind = kind; self.name = name; self.audience = audience; self.member = member; self.time = time; self.onMaya = onMaya
    }

    public var body: some View {
        HStack(spacing: QelvoraLayout.authorGap) {
            Mark(kind: kind, initial: String(name.prefix(1)), onMaya: onMaya)
            if kind == .approvedDraft {
                (Text(QelvoraCopy.text("preparedByAI")).foregroundColor(qColor("ai-ink", scheme)) + Text(" · " + QelvoraCopy.text("approvedBy", values: ["name": name])).foregroundColor(qColor(kind.colorToken(onMaya: onMaya), scheme)))
                    .qText("caption", weight: .semibold)
            } else {
                Text(kind.label(name: name, audience: audience, member: member))
                    .qText("caption", weight: .semibold)
                    .foregroundStyle(qColor(kind.colorToken(onMaya: onMaya), scheme))
            }
            if let time {
                Text("· \(time)").qText("data-sm")
                    .foregroundStyle(qColor(onMaya ? "on-maya-muted" : "ink-muted", scheme))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(kind.label(name: name, audience: audience, member: member) + (time.map { " at \($0)" } ?? ""))
    }
}

public struct Seal: View {
    public var initial: String
    public var size: CGFloat
    public var live: Bool
    public var onMaya: Bool
    @Environment(\.colorScheme) private var scheme

    public init(initial: String = "M", size: CGFloat = 18, live: Bool = false, onMaya: Bool = false) {
        self.initial = initial; self.size = size; self.live = live; self.onMaya = onMaya
    }

    public var body: some View {
        Text(initial)
            .font(.custom(QelvoraFonts.face("serif", italic: true), size: (size * 0.62).rounded()))
            .foregroundStyle(qColor(onMaya ? "on-maya-accent" : "seal-ink", scheme))
            .frame(width: size, height: size)
            .background(qColor(onMaya ? "maya-accent" : "seal-fill", scheme), in: Circle())
            .overlay { if live { Circle().stroke(qColor("ground", scheme), lineWidth: 3).padding(-3) } }
            .overlay { if live { Circle().stroke(qColor("maya-accent", scheme), lineWidth: 1).padding(-4) } }
            .shadow(color: live ? qColor("maya-accent", scheme).opacity(0.62) : .clear, radius: 20, y: 18)
            .accessibilityHidden(true)
    }
}

public struct Mark: View {
    public var kind: AuthorKind
    public var size: CGFloat?
    public var initial: String
    public var live: Bool
    public var onMaya: Bool
    @Environment(\.colorScheme) private var scheme

    public init(kind: AuthorKind = .ai, size: CGFloat? = nil, initial: String = "M", live: Bool = false, onMaya: Bool = false) {
        self.kind = kind; self.size = size; self.initial = initial; self.live = live; self.onMaya = onMaya
    }

    private var side: CGFloat { size ?? ([.humanCreator, .humanBroadcast, .approvedDraft].contains(kind) ? 16 : 14) }
    private var glyph: String {
        switch kind {
        case .ai: "ring"
        case .approvedDraft: "approved"
        case .humanBroadcast: "broadcast"
        case .humanReaction: "heart"
        case .team: "team"
        case .correction: "correction"
        case .humanCreator: "sealCheck"
        }
    }

    public var body: some View {
        Group {
            if kind == .humanCreator {
                Seal(initial: initial, size: side, live: live, onMaya: onMaya)
            } else {
                QelvoraGlyph(name: glyph, size: side, color: qColor(kind.colorToken(onMaya: onMaya), scheme))
            }
        }.accessibilityHidden(true)
    }
}
