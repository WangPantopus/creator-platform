import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif

// Port of the named reference bundle components, with explicit native callbacks.
// Dimensions and fixed disclosure text come from generated shared resources.
public struct Avatar: View {
  public var initial: String
  public var live: Bool
  @Environment(\.colorScheme) private var scheme
  public init(initial: String = "M", live: Bool = false) {
    self.initial = initial
    self.live = live
  }
  public var body: some View {
    Text(initial).font(
      .custom(QelvoraFonts.face("serif", italic: true), size: QelvoraTokens.token("glyph-size"))
    )
    .foregroundStyle(qColor("maya-accent", scheme))
    .frame(width: QelvoraTokens.token("avatar-size"), height: QelvoraTokens.token("avatar-size"))
    .background(
      qColor("maya-surface", scheme),
      in: RoundedRectangle(cornerRadius: QelvoraTokens.token("avatar-radius"))
    )
    .overlay {
      if live {
        RoundedRectangle(cornerRadius: QelvoraTokens.token("avatar-radius")).stroke(
          qColor("ground", scheme), lineWidth: QelvoraTokens.token("request-dot-inset")
        ).padding(-QelvoraTokens.token("request-dot-inset"))
      }
    }
    .overlay {
      if live {
        RoundedRectangle(cornerRadius: QelvoraTokens.token("avatar-radius")).stroke(
          qColor("maya-accent", scheme), lineWidth: QelvoraTokens.token("hairline")
        ).padding(-QelvoraTokens.token("space-1"))
      }
    }
    .shadow(
      color: live
        ? qColor("maya-accent", scheme).opacity(Double(QelvoraTokens.token("glow-opacity")))
        : .clear, radius: QelvoraTokens.token("space-5"), y: QelvoraTokens.token("seal-presence")
    )
    .accessibilityHidden(true)
  }
}

/// Seal placed on a creator plate; Night uses the paper plate's ink pair.
struct ThreadPlateSeal: View {
  var initial = "M"
  var size: CGFloat
  var live = false
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    Text(initial).font(
      .custom(
        QelvoraFonts.face("serif", italic: true),
        size: (size * QelvoraTokens.token("seal-font-ratio")).rounded())
    )
    .foregroundStyle(qColor("on-maya-accent", scheme)).frame(width: size, height: size)
    .background(qColor("maya-accent", scheme), in: Circle())
    .overlay {
      if live {
        Circle().stroke(
          qColor("ground", scheme), lineWidth: QelvoraTokens.token("request-dot-inset")
        ).padding(-QelvoraTokens.token("request-dot-inset"))
        Circle().stroke(qColor("maya-accent", scheme), lineWidth: QelvoraTokens.token("hairline"))
          .padding(-QelvoraTokens.token("space-1"))
      }
    }
    .shadow(
      color: live
        ? qColor("maya-accent", scheme).opacity(Double(QelvoraTokens.token("glow-opacity")))
        : .clear, radius: QelvoraTokens.token("space-5"), y: QelvoraTokens.token("seal-presence")
    )
    .accessibilityHidden(true)
  }
}

public enum IdentityStripState: String, CaseIterable, Sendable {
  case ai, human, team, paused, updating
}
public struct IdentityStrip: View {
  public var state: IdentityStripState
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(state: IdentityStripState = .ai, name: String = "Maya") {
    self.state = state
    self.name = name
  }
  private var phrase: (String, String) {
    switch state {
    case .human:
      return (
        QelvoraCopy.text("takeover", values: ["name": name]), QelvoraCopy.text("humanStripRest")
      )
    case .team:
      return (
        QelvoraCopy.text("teamStripLead", values: ["name": name]),
        QelvoraCopy.text("teamStripRest", values: ["name": name])
      )
    case .paused:
      let parts = QelvoraCopy.text("aiPaused", values: ["name": name]).components(
        separatedBy: " · ")
      return (parts.first ?? "", " · " + (parts.last ?? ""))
    case .updating:
      return (
        QelvoraCopy.text("updatingAI", values: ["name": name]),
        QelvoraCopy.text("requestsStillWork")
      )
    case .ai:
      let parts = QelvoraCopy.text("identityStrip", values: ["name": name]).trimmingCharacters(
        in: CharacterSet(charactersIn: ".")
      ).components(separatedBy: " · ")
      return (parts.first ?? "", " · " + (parts.last ?? ""))
    }
  }
  private var accent: String {
    state == .human
      ? "maya-accent" : state == .team ? "team-ink" : state == .paused ? "ink-muted" : "ai-ink"
  }
  public var body: some View {
    HStack(spacing: QelvoraTokens.token("composer-gap")) {
      if state == .human {
        ThreadPlateSeal(
          initial: String(name.prefix(1)), size: QelvoraTokens.token("seal-reaction"), live: true)
      } else {
        QelvoraGlyph(
          name: state == .team ? "team" : state == .paused ? "pause" : "ring",
          size: QelvoraTokens.token("glyph-small"), color: qColor(accent, scheme)
        )
        .frame(width: QelvoraTokens.token("glyph-size"), height: QelvoraTokens.token("glyph-size"))
        .overlay(
          RoundedRectangle(cornerRadius: QelvoraTokens.token("strip-box-radius")).stroke(
            qColor(accent, scheme), lineWidth: QelvoraTokens.token("hairline")))
      }
      Text("\(Text(phrase.0).fontWeight(.semibold).foregroundColor(qColor(accent, scheme)))\(Text(phrase.1).foregroundColor(qColor(state == .human ? "on-maya" : "ink", scheme)))")
        .qText("label", weight: .regular)
        .frame(maxWidth: .infinity, alignment: .leading)
    }.padding(.horizontal, QelvoraTokens.token("space-4")).padding(
      .vertical, QelvoraTokens.token("composer-gap")
    )
    .frame(minHeight: QelvoraTokens.token("strip-min-height"))
    .background {
      ZStack {
        qColor(
          state == .human
            ? "maya-surface" : [.paused, .updating].contains(state) ? "surface-sunken" : "surface",
          scheme)
        if state == .human {
          GeometryReader { geometry in
            let center = UnitPoint(x: QelvoraTokens.token("strip-glow-x"), y: 0)
            // The shipped CSS uses the Light accent's fixed rgba tint in both themes.
            RadialGradient(
              colors: [
                QelvoraTokens.color("maya-accent", theme: .light).opacity(
                  Double(QelvoraTokens.token("strip-glow-opacity"))), .clear,
              ], center: center, startRadius: 0,
              endRadius: geometry.size.width * QelvoraTokens.token("strip-glow-stop")
            )
            .scaleEffect(
              x: QelvoraTokens.token("strip-glow-scale-x"),
              y: geometry.size.height / max(geometry.size.width, QelvoraTokens.token("hairline"))
                * QelvoraTokens.token("strip-glow-scale-y"), anchor: center)
          }.clipped().allowsHitTesting(false).accessibilityHidden(true)
        }
      }
    }
    .overlay(alignment: .bottom) {
      Rectangle().fill(qColor(state == .human ? "maya-line" : "line", scheme)).frame(
        height: QelvoraTokens.token("hairline"))
    }
    .zIndex(Double(QelvoraTokens.token("z-strip")))
    .accessibilityElement(children: .ignore).accessibilityLabel(phrase.0 + phrase.1)
    .accessibilityAddTraits(.updatesFrequently)
    .onChange(of: state) { _, _ in
      #if canImport(UIKit)
        UIAccessibility.post(notification: .announcement, argument: phrase.0 + phrase.1)
      #endif
    }
  }
}

public struct ThreadHeader: View {
  public var name: String
  public var subtitle: String?
  public var live: Bool
  public var onBack: () -> Void
  public var onAbout: () -> Void
  @Environment(\.colorScheme) private var scheme
  public init(
    name: String = "Maya", subtitle: String? = nil, live: Bool = false,
    onBack: @escaping () -> Void = {}, onAbout: @escaping () -> Void = {}
  ) {
    self.name = name
    self.subtitle = subtitle
    self.live = live
    self.onBack = onBack
    self.onAbout = onAbout
  }
  public var body: some View {
    HStack(spacing: QelvoraTokens.token("space-3")) {
      ThreadIconButton(
        glyph: "back", label: QelvoraCopy.text("back"), color: qColor("ink", scheme), action: onBack
      )
      Avatar(initial: String(name.prefix(1)), live: live)
      VStack(alignment: .leading, spacing: QelvoraTokens.token("wave-gap")) {
        Text(name).qText("title")
        Text(
          live
            ? QelvoraCopy.text("inConversation")
            : subtitle ?? QelvoraCopy.text("officialAISubtitle")
        ).textCase(.uppercase).qText("data-sm").foregroundStyle(
          qColor(live ? "maya-ink" : "ink-muted", scheme))
      }.frame(maxWidth: .infinity, alignment: .leading)
      ThreadIconButton(
        glyph: "info", label: QelvoraCopy.text("aboutConversation"),
        color: qColor("ink-muted", scheme), action: onAbout)
    }.padding(.leading, QelvoraTokens.token("space-1")).padding(
      .trailing, QelvoraTokens.token("space-3")
    ).padding(.vertical, QelvoraTokens.token("composer-gap"))
      .foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
      .overlay(alignment: .bottom) {
        Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline"))
      }
  }
}

struct ThreadIconButton: View {
  var glyph: String
  var label: String
  var color: Color
  var action: () -> Void
  var body: some View {
    SwiftUI.Button(action: action) {
      QelvoraGlyph(name: glyph, color: color).frame(
        width: QelvoraTokens.token("touch-target"), height: QelvoraTokens.token("touch-target")
      ).contentShape(Rectangle())
    }
    .buttonStyle(.plain).accessibilityLabel(label)
  }
}

public enum SystemLineVariant: String, CaseIterable, Sendable { case plain, presence, date }
public struct SystemLine: View {
  public var variant: SystemLineVariant
  public var name: String
  public var time: String?
  public var children: String
  @Environment(\.colorScheme) private var scheme
  public init(
    variant: SystemLineVariant = .plain, name: String = "Maya", time: String? = nil,
    children: String = ""
  ) {
    self.variant = variant
    self.name = name
    self.time = time
    self.children = children
  }
  public var body: some View {
    if variant == .date {
      HStack(spacing: QelvoraTokens.token("composer-gap")) {
        Text(children.uppercased()).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
          .fixedSize(horizontal: true, vertical: false)
        line(leading: false)
      }
    } else {
      HStack(spacing: QelvoraTokens.token("space-3")) {
        line(leading: true)
        if variant == .presence {
          HStack(spacing: QelvoraTokens.token("space-2")) {
            ThreadPlateSeal(
              initial: String(name.prefix(1)), size: QelvoraTokens.token("seal-presence"))
            Text(QelvoraCopy.text("takeover", values: ["name": name])).qText(
              "caption", weight: .semibold)
            if let time {
              Text(time).qText("data-sm").foregroundStyle(qColor("on-maya-muted", scheme))
                .fixedSize(horizontal: true, vertical: false)
            }
          }.foregroundStyle(qColor("maya-accent", scheme)).padding(
            .leading, QelvoraTokens.token("author-gap")
          ).padding(.trailing, QelvoraTokens.token("space-3")).padding(
            .vertical, QelvoraTokens.token("author-gap")
          )
          .background(qColor("maya-surface", scheme), in: Capsule())
          .fixedSize(horizontal: false, vertical: true).layoutPriority(1)
          .qShadow("glow-maya", radius: QelvoraTokens.token("radius-pill"))
        } else {
          Text(children).qText("label", weight: .regular).foregroundStyle(
            qColor("ink-muted", scheme)
          ).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            .layoutPriority(1)
        }
        line(leading: false)
      }.accessibilityElement(children: .combine).accessibilityAddTraits(.updatesFrequently)
    }
  }
  private func line(leading: Bool) -> some View {
    Group {
      if variant == .presence {
        Rectangle().fill(
          LinearGradient(
            colors: leading
              ? [.clear, qColor("maya-ink", scheme)] : [qColor("maya-ink", scheme), .clear],
            startPoint: .leading, endPoint: .trailing)
        ).opacity(Double(QelvoraTokens.token("presence-line-opacity")))
      } else {
        Rectangle().fill(qColor("line", scheme))
      }
    }.frame(height: QelvoraTokens.token("hairline"))
  }
}

public struct ReactionChip: View {
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(name: String = "Maya") { self.name = name }
  public var body: some View {
    HStack(spacing: QelvoraTokens.token("author-gap")) {
      ThreadPlateSeal(initial: String(name.prefix(1)), size: QelvoraTokens.token("seal-reaction"))
      QelvoraGlyph(
        name: "heart", size: QelvoraTokens.token("glyph-caption"),
        color: qColor("maya-accent", scheme))
      Text(QelvoraCopy.text("reaction", values: ["name": name])).qText("caption", weight: .semibold)
    }.foregroundStyle(qColor("on-maya", scheme)).padding(.leading, QelvoraTokens.token("space-1"))
      .padding(.trailing, QelvoraTokens.token("space-3")).padding(
        .vertical, QelvoraTokens.token("space-1")
      )
      .background(qColor("maya-surface", scheme), in: Capsule()).accessibilityElement(
        children: .combine)
  }
}

public struct CitationChip: View {
  public var title: String
  public var meta: String
  public var stamp: String?
  public var href: URL?
  public var unavailable: Bool
  public var onOpen: () -> Void
  @Environment(\.colorScheme) private var scheme
  @Environment(\.openURL) private var openURL
  public init(
    title: String = "", meta: String = "", stamp: String? = nil, href: URL? = nil,
    unavailable: Bool = false, onOpen: @escaping () -> Void = {}
  ) {
    self.title = title
    self.meta = meta
    self.stamp = stamp
    self.href = href
    self.unavailable = unavailable
    self.onOpen = onOpen
  }
  public var body: some View {
    SwiftUI.Button {
      if let href { openURL(href) } else { onOpen() }
    } label: {
      HStack(spacing: QelvoraTokens.token("composer-gap")) {
        if !unavailable {
          Group {
            if let stamp {
              Text(stamp).qText("citation-stamp", weight: .medium)
            } else {
              QelvoraGlyph(
                name: "play", size: QelvoraTokens.token("glyph-small"),
                color: qColor("ai-ink", scheme))
            }
          }
          .foregroundStyle(qColor("ai-ink", scheme)).padding(
            .horizontal, QelvoraTokens.token("space-1")
          )
          .frame(
            minWidth: QelvoraTokens.token("citation-stamp-width"),
            minHeight: QelvoraTokens.token("citation-stamp-height")
          )
          .background(
            qColor("ai-surface", scheme),
            in: RoundedRectangle(cornerRadius: QelvoraTokens.token("author-gap"))
          )
          .overlay(
            RoundedRectangle(cornerRadius: QelvoraTokens.token("author-gap")).stroke(
              qColor("ai-line", scheme), lineWidth: QelvoraTokens.token("hairline")))
        }
        VStack(alignment: .leading, spacing: 0) {
          Text(title.isEmpty && unavailable ? QelvoraCopy.text("source") : title).qText("label")
          Text(unavailable ? QelvoraCopy.text("sourceUnavailable") : meta).qText("caption")
            .foregroundStyle(qColor("ink-muted", scheme))
        }.frame(maxWidth: .infinity, alignment: .leading)
        if !unavailable { QelvoraGlyph(name: "chevron", color: qColor("ink-muted", scheme)) }
      }.padding(.vertical, QelvoraTokens.token("space-2")).padding(
        .horizontal, QelvoraTokens.token("composer-gap")
      ).frame(minHeight: QelvoraTokens.token("touch-target"))
        .foregroundStyle(qColor(unavailable ? "ink-muted" : "ink", scheme)).background(
          qColor("ground", scheme),
          in: RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius"))
        )
        .overlay(
          RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius")).stroke(
            qColor("line", scheme),
            style: StrokeStyle(
              lineWidth: QelvoraTokens.token("hairline"),
              dash: unavailable ? [QelvoraTokens.token("space-1")] : [])))
    }.buttonStyle(.plain).disabled(unavailable)
  }
}

public enum MemoryVariant: String, CaseIterable, Sendable { case saved, ask }
public struct MemoryChip: View {
  public var text: String
  public var variant: MemoryVariant
  public var onRemember: () -> Void
  public var onForget: () -> Void
  public var onEdit: () -> Void
  @Environment(\.colorScheme) private var scheme
  public init(
    text: String, variant: MemoryVariant = .saved, onRemember: @escaping () -> Void = {},
    onForget: @escaping () -> Void = {}, onEdit: @escaping () -> Void = {}
  ) {
    self.text = text
    self.variant = variant
    self.onRemember = onRemember
    self.onForget = onForget
    self.onEdit = onEdit
  }
  public var body: some View {
    if variant == .ask {
      VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) {
        HStack(spacing: QelvoraTokens.token("author-gap")) {
          QelvoraGlyph(name: "bookmark", color: qColor("ai-ink", scheme))
          Text(QelvoraCopy.text("sensitiveMemory")).qText("caption", weight: .semibold)
            .foregroundStyle(qColor("ai-ink", scheme))
        }
        Text(text).qText("control-body")
        HStack(spacing: QelvoraTokens.token("space-2")) {
          Button(QelvoraCopy.text("remember"), variant: .secondary, action: onRemember)
          Button(QelvoraCopy.text("dontRemember"), variant: .quiet, action: onForget)
        }
      }.padding(.vertical, QelvoraTokens.token("space-3")).padding(
        .horizontal, QelvoraTokens.token("message-padding")
      )
      .background(
        qColor("ai-surface", scheme),
        in: RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius"))
      )
      .overlay(
        RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius")).stroke(
          qColor("ai-line", scheme), lineWidth: QelvoraTokens.token("hairline"))
      )
      .accessibilityElement(children: .contain).accessibilityLabel(
        QelvoraCopy.text("memoryQuestion"))
    } else {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: QelvoraTokens.token("space-1")) {
          QelvoraGlyph(name: "bookmark", color: qColor("ai-ink", scheme))
          Text(QelvoraCopy.text("remembered", values: ["text": text])).qText(
            "label", weight: .regular)
          memoryAction("edit", style: "label", color: "ai-ink", action: onEdit)
        }
        .padding(.leading, QelvoraTokens.token("space-3")).padding(
          .trailing, QelvoraTokens.token("space-1")
        )
        .background(
          qColor("ai-surface", scheme),
          in: RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius"))
        )
        .overlay(
          RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius")).stroke(
            qColor("ai-line", scheme),
            style: StrokeStyle(
              lineWidth: QelvoraTokens.token("hairline"), dash: [QelvoraTokens.token("space-1")])))
        memoryAction("dontRememberThis", style: "caption", color: "ink-muted", action: onForget)
      }
    }
  }
  private func memoryAction(
    _ key: String, style: String, color: String, action: @escaping () -> Void
  ) -> some View {
    SwiftUI.Button(action: action) {
      Text(QelvoraCopy.text(key)).qText(style, weight: .semibold).foregroundStyle(
        qColor(color, scheme)
      ).padding(.horizontal, QelvoraTokens.token("space-2")).frame(
        minHeight: QelvoraTokens.token("touch-target"))
    }.buttonStyle(.plain)
  }

}

public struct Correction: View {
  public var aiText: String
  public var aiTime: String?
  public var children: String
  public var time: String?
  public var name: String
  public var onVerify: () -> Void
  @Environment(\.colorScheme) private var scheme
  public init(
    aiText: String, aiTime: String? = nil, children: String, time: String? = nil,
    name: String = "Maya", onVerify: @escaping () -> Void = {}
  ) {
    self.aiText = aiText
    self.aiTime = aiTime
    self.children = children
    self.time = time
    self.name = name
    self.onVerify = onVerify
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("author-gap")) {
      AuthorLabel(kind: .ai, name: name, time: aiTime)
      VStack(alignment: .leading, spacing: 0) {
        Text(aiText).qText("body").padding(.vertical, QelvoraTokens.token("space-3")).padding(
          .horizontal, QelvoraTokens.token("message-padding")
        ).frame(maxWidth: .infinity, alignment: .leading).background(qColor("ai-surface", scheme))
        VStack(alignment: .leading, spacing: QelvoraTokens.token("author-gap")) {
          AuthorLabel(kind: .correction, name: name, onMaya: true)
          Text(children).qText("voice-md")
          SignedMarker(name: name, time: time, onMaya: true, action: onVerify)
        }
        .foregroundStyle(qColor("on-maya", scheme)).padding(
          .vertical, QelvoraTokens.token("space-3")
        ).padding(.horizontal, QelvoraTokens.token("message-padding")).frame(
          maxWidth: .infinity, alignment: .leading
        ).background(qColor("maya-surface", scheme))
      }.clipShape(BubbleShape()).overlay(
        BubbleShape().stroke(qColor("ai-line", scheme), lineWidth: QelvoraTokens.token("hairline")))
    }.foregroundStyle(qColor("ink", scheme)).frame(
      maxWidth: QelvoraTokens.token("message-max-width"), alignment: .leading)
  }
}

public enum VoiceNoteKind: String, CaseIterable, Sendable { case human, ai }
public struct VoiceNote: View {
  public var kind: VoiceNoteKind
  public var duration: String
  public var transcript: String?
  public var time: String?
  public var name: String
  public var playing: Bool
  public var onPlayPause: () -> Void
  public var onVerify: () -> Void
  @Environment(\.colorScheme) private var scheme
  public init(
    kind: VoiceNoteKind = .human, duration: String = "0:42", transcript: String? = nil,
    time: String? = nil, name: String = "Maya", playing: Bool = false,
    onPlayPause: @escaping () -> Void = {}, onVerify: @escaping () -> Void = {}
  ) {
    self.kind = kind
    self.duration = duration
    self.transcript = transcript
    self.time = time
    self.name = name
    self.playing = playing
    self.onPlayPause = onPlayPause
    self.onVerify = onVerify
  }
  private var bars: [String] {
    [
      "8", "14", "22", "12", "18", "26", "16", "10", "20", "24", "14", "8", "18", "22", "12", "16",
      "26", "20", "10", "14", "18", "8", "12", "20", "16", "10",
    ]
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("author-gap")) {
      if kind == .ai { AuthorLabel(kind: .ai, name: name, time: time) }
      VStack(alignment: .leading, spacing: QelvoraTokens.token("composer-gap")) {
        if kind == .human {
          AuthorLabel(kind: .humanCreator, name: name, time: time, onMaya: true)
        } else {
          Text(QelvoraCopy.text("aiVoiceDisclosure", values: ["name": name])).qText("data-sm")
            .foregroundStyle(qColor("ai-ink", scheme)).padding(
              .horizontal, QelvoraTokens.token("author-gap")
            ).padding(.vertical, QelvoraTokens.token("wave-gap")).overlay(
              Capsule().stroke(
                qColor("ai-line", scheme), lineWidth: QelvoraTokens.token("hairline")))
        }
        HStack(spacing: QelvoraTokens.token("composer-gap")) {
          SwiftUI.Button(action: onPlayPause) {
            QelvoraGlyph(
              name: playing ? "pause" : "play", size: QelvoraTokens.token("space-4"),
              color: qColor(kind == .human ? "on-maya-accent" : "on-ai", scheme)
            ).frame(
              width: QelvoraTokens.token("touch-target"),
              height: QelvoraTokens.token("touch-target")
            ).background(qColor(kind == .human ? "maya-accent" : "ai-ink", scheme), in: Circle())
          }.buttonStyle(.plain).accessibilityLabel(
            QelvoraCopy.text(playing ? "pauseVoiceNote" : "playVoiceNote"))
          HStack(spacing: QelvoraTokens.token("wave-gap")) {
            ForEach(Array(bars.enumerated()), id: \.offset) { _, height in
              RoundedRectangle(cornerRadius: QelvoraTokens.token("wave-radius")).fill(
                qColor(kind == .human ? "maya-accent" : "ai-ink", scheme).opacity(
                  Double(QelvoraTokens.token("wave-opacity")))
              ).frame(
                width: QelvoraTokens.token("wave-bar-width"),
                height: QelvoraTokens.token("wave-bar-" + height))
            }
          }.frame(maxWidth: .infinity, alignment: .leading).frame(
            height: QelvoraTokens.token("note-fold")
          ).accessibilityHidden(true)
          Text(duration).qText("mono-caption").fixedSize()
        }
        if let transcript {
          Text(transcript).qText(kind == .human ? "transcript-human" : "transcript-ai")
        }
        if kind == .human {
          SignedMarker(
            name: name, extra: QelvoraCopy.text("recordedBy", values: ["name": name]), onMaya: true,
            action: onVerify)
        }
      }.foregroundStyle(qColor(kind == .human ? "on-maya" : "ink", scheme)).padding(
        .vertical, QelvoraTokens.token("space-3")
      ).padding(.horizontal, QelvoraTokens.token("message-padding"))
        .background(
          qColor(kind == .human ? "maya-surface" : "ai-surface", scheme), in: BubbleShape()
        )
        .overlay {
          if kind == .ai {
            BubbleShape().stroke(
              qColor("ai-line", scheme), lineWidth: QelvoraTokens.token("hairline"))
          }
        }
    }.frame(maxWidth: QelvoraTokens.token("skeleton-width"), alignment: .leading)
  }
}

public enum ComposerState: String, CaseIterable, Sendable {
  case ai, trial
  case capacityZero = "capacity_zero"
  case paused, ended, human
}
public struct Composer: View {
  public var state: ComposerState
  public var trialLeft: String
  public var backDate: String
  public var id: String
  public var name: String
  public var onAttach: () -> Void
  public var onSend: (String) -> Void
  public var onStepIn: () -> Void
  public var onJoin: () -> Void
  private var providedText: Binding<String>?
  @State private var localText = ""
  @Environment(\.colorScheme) private var scheme
  public init(
    state: ComposerState = .ai, trialLeft: String = "18 H", backDate: String = "Monday",
    id: String = "qelvora-composer", name: String = "Maya", text: Binding<String>? = nil,
    onAttach: @escaping () -> Void = {}, onSend: @escaping (String) -> Void = { _ in },
    onStepIn: @escaping () -> Void = {}, onJoin: @escaping () -> Void = {}
  ) {
    self.state = state
    self.trialLeft = trialLeft
    self.backDate = backDate
    self.id = id
    self.name = name
    self.providedText = text
    self.onAttach = onAttach
    self.onSend = onSend
    self.onStepIn = onStepIn
    self.onJoin = onJoin
  }
  private var text: Binding<String> { providedText ?? $localText }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("composer-gap")) {
      switch state {
      case .human: inputRow
      case .paused:
        HStack(spacing: QelvoraTokens.token("space-2")) {
          QelvoraGlyph(
            name: "pause", size: QelvoraTokens.token("glyph-inline"),
            color: qColor("ink-muted", scheme))
          Text(QelvoraCopy.text("aiPausedBack", values: ["name": name, "date": backDate])).qText(
            "label", weight: .regular)
        }.foregroundStyle(qColor("ink-muted", scheme))
        StepIn(name: name, action: onStepIn)
      case .ended:
        VStack(alignment: .leading, spacing: QelvoraTokens.token("space-3")) {
          Text(QelvoraCopy.text("freeConversationEnded")).qText("body-strong")
          AccessLines(
            can: QelvoraCopy.text("endCan", values: ["name": name]),
            included: QelvoraCopy.text("endIncluded"),
            changes: QelvoraCopy.text("endChanges", values: ["name": name]), name: name)
          Button(QelvoraCopy.text("joinClub"), variant: .secondary, block: true, action: onJoin)
        }.padding(QelvoraTokens.token("message-padding")).background(
          qColor("surface", scheme),
          in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md"))
        ).overlay(
          RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(
            qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")))
        StepIn(name: name, action: onStepIn)
      default:
        if state == .trial {
          HStack(spacing: QelvoraTokens.token("space-2")) {
            QelvoraGlyph(
              name: "clock", size: QelvoraTokens.token("glyph-inline"),
              color: qColor("ink-muted", scheme))
            Text(QelvoraCopy.text("freeConversationCountdown", values: ["left": trialLeft])).qText(
              "mono-caption")
          }.foregroundStyle(qColor("ink-muted", scheme))
        }
        StepIn(name: name, disabled: state == .capacityZero, action: onStepIn)
        inputRow
      }
    }.padding(.top, QelvoraTokens.token("space-3")).padding(
      .horizontal, QelvoraTokens.token("space-4")
    ).padding(.bottom, QelvoraTokens.token("composer-bottom"))
      .foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
      .overlay(alignment: .top) {
        Rectangle().fill(qColor(state == .human ? "maya-line" : "line", scheme)).frame(
          height: QelvoraTokens.token("hairline"))
      }.zIndex(Double(QelvoraTokens.token("z-composer")))
  }
  private var inputRow: some View {
    let placeholder = QelvoraCopy.text(
      state == .human ? "replyToCreator" : "messageAI", values: ["name": name])
    return HStack(spacing: QelvoraTokens.token("space-2")) {
      ThreadIconButton(
        glyph: "plus", label: QelvoraCopy.text("attachPhoto"), color: qColor("ink-muted", scheme),
        action: onAttach)
      TextField(placeholder, text: text).qText("body").textFieldStyle(.plain).padding(
        .horizontal, QelvoraTokens.token("space-4")
      ).frame(height: QelvoraTokens.token("composer-input-height"))
        .background(
          qColor("surface", scheme),
          in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg"))
        )
        .overlay(
          RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(
            qColor(state == .human ? "maya-line" : "control-line", scheme),
            lineWidth: QelvoraTokens.token("hairline"))
        ).accessibilityIdentifier(id).accessibilityLabel(placeholder).onSubmit {
          onSend(text.wrappedValue)
        }
      SwiftUI.Button {
        onSend(text.wrappedValue)
      } label: {
        QelvoraGlyph(name: "send", color: qColor(state == .human ? "maya-accent" : "on-ai", scheme))
          .frame(
            width: QelvoraTokens.token("composer-input-height"),
            height: QelvoraTokens.token("composer-input-height")
          ).background(
            qColor(state == .human ? "maya-surface" : "ai-ink", scheme),
            in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")))
      }.buttonStyle(.plain).accessibilityLabel(
        QelvoraCopy.text(state == .human ? "sendToCreator" : "sendToAI", values: ["name": name]))
    }
  }
}
