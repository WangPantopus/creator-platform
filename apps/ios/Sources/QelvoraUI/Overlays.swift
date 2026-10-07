import SwiftUI

#if canImport(UIKit)
  import UIKit
#endif

public enum NoticeTone: String, CaseIterable, Sendable { case neutral, paused, error, offline }
public struct Notice: View {
  public var tone: NoticeTone
  public var title: String?
  public var children: String
  public var accessibilityIdentifier: String?
  @Environment(\.colorScheme) private var scheme
  public init(
    tone: NoticeTone = .neutral, title: String? = nil, children: String,
    accessibilityIdentifier: String? = nil
  ) {
    self.tone = tone
    self.title = title
    self.children = children
    self.accessibilityIdentifier = accessibilityIdentifier
  }
  public var body: some View {
    HStack(alignment: .top, spacing: QelvoraTokens.token("composer-gap")) {
      QelvoraGlyph(
        name: tone == .error ? "alert" : tone == .paused ? "pause" : "info",
        size: QelvoraTokens.token("space-4"),
        color: qColor(tone == .error ? "alert" : "ink-muted", scheme)
      )
      .padding(.top, QelvoraTokens.token("hairline"))
      VStack(alignment: .leading, spacing: 0) {
        if let title { Text(title).qText("control-body", weight: .semibold).fixedSize(horizontal: false, vertical: true) }
        Text(children).qText("control-body").fixedSize(horizontal: false, vertical: true)
      }.frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }.padding(.horizontal, QelvoraTokens.token("message-padding")).padding(
      .vertical, QelvoraTokens.token("space-3")
    )
    .foregroundStyle(qColor("ink", scheme))
    .background(
      qColor(tone == .paused || tone == .offline ? "surface-sunken" : "surface", scheme),
      in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md"))
    )
    .overlay {
      RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(
        tone == .paused ? .clear : qColor(tone == .error ? "alert" : "line", scheme),
        style: StrokeStyle(
          lineWidth: QelvoraTokens.token("hairline"),
          dash: tone == .offline ? [QelvoraTokens.token("space-1")] : []))
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier(accessibilityIdentifier ?? "")
    .onAppear {
      if tone == .error { announce([title, children].compactMap { $0 }.joined(separator: ". ")) }
    }
  }
}

public struct EmptyState<Action: View>: View {
  public var title: String
  public var message: String?
  private var action: Action
  @Environment(\.colorScheme) private var scheme
  public init(title: String, body: String? = nil, @ViewBuilder action: () -> Action) {
    self.title = title
    self.message = body
    self.action = action()
  }
  public var body: some View {
    VStack(spacing: QelvoraTokens.token("composer-gap")) {
      Text(title).qText("display-md").accessibilityAddTraits(.isHeader)
      if let message {
        Text(message).qText("body").foregroundStyle(qColor("ink-muted", scheme)).frame(
          maxWidth: QelvoraTokens.token("skeleton-width"))
      }
      action
    }.multilineTextAlignment(.center).padding(.vertical, QelvoraTokens.token("welcome-bottom"))
      .padding(.horizontal, QelvoraTokens.token("space-6"))
      .frame(maxWidth: .infinity).foregroundStyle(qColor("ink", scheme))
  }
}
extension EmptyState where Action == EmptyView {
  public init(title: String, body: String? = nil) {
    self.init(title: title, body: body) { EmptyView() }
  }
}

public struct Sheet<Content: View, Actions: View>: View {
  public var title: String
  public var meta: String?
  public var onClose: () -> Void
  private var content: Content
  private var actions: Actions
  @Environment(\.colorScheme) private var scheme
  public init(
    title: String, meta: String? = nil, onClose: @escaping () -> Void = {},
    @ViewBuilder content: () -> Content, @ViewBuilder actions: () -> Actions
  ) {
    self.title = title
    self.meta = meta
    self.onClose = onClose
    self.content = content()
    self.actions = actions()
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("space-4")) {
      RoundedRectangle(cornerRadius: QelvoraTokens.token("sheet-grabber-radius")).fill(
        qColor("line", scheme)
      )
      .frame(
        width: QelvoraTokens.token("sheet-grabber-width"),
        height: QelvoraTokens.token("sheet-grabber-height")
      )
      .frame(maxWidth: .infinity).accessibilityHidden(true)
      HStack(alignment: .top, spacing: 0) {
        VStack(alignment: .leading, spacing: QelvoraTokens.token("space-1")) {
          if let meta { Text(meta).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)) }
          Text(title).qText("display-lg").accessibilityAddTraits(.isHeader)
        }.frame(maxWidth: .infinity, alignment: .leading)
        SwiftUI.Button(action: onClose) {
          QelvoraGlyph(
            name: "close", size: QelvoraTokens.token("space-4"), color: qColor("ink-muted", scheme)
          )
          .frame(
            width: QelvoraTokens.token("touch-target"), height: QelvoraTokens.token("touch-target")
          ).contentShape(Rectangle())
        }.buttonStyle(.plain).accessibilityLabel(QelvoraCopy.text("close"))
          .offset(x: QelvoraTokens.token("space-3"), y: -QelvoraTokens.token("space-2"))
      }
      content.qText("body")
      VStack(spacing: QelvoraTokens.token("space-2")) { actions }.frame(maxWidth: .infinity)
    }.padding(.horizontal, QelvoraTokens.token("space-5"))
      .padding(.top, QelvoraTokens.token("space-3")).padding(
        .bottom, QelvoraTokens.token("welcome-gap")
      )
      .frame(maxWidth: QelvoraTokens.token("phone-width"), alignment: .leading)
      .foregroundStyle(qColor("ink", scheme))
      .background(
        qColor("surface", scheme),
        in: UnevenRoundedRectangle(
          topLeadingRadius: QelvoraTokens.token("radius-xl"),
          topTrailingRadius: QelvoraTokens.token("radius-xl"))
      )
      .qShadow("shadow-sheet", radius: QelvoraTokens.token("radius-xl"))
  }
}
extension Sheet where Actions == EmptyView {
  public init(
    title: String, meta: String? = nil, onClose: @escaping () -> Void = {},
    @ViewBuilder content: () -> Content
  ) { self.init(title: title, meta: meta, onClose: onClose, content: content) { EmptyView() } }
}

public struct Dialog<Content: View>: View {
  public var title: String
  public var confirm: String
  public var cancel: String
  public var destructive: Bool
  public var onConfirm: () -> Void
  public var onCancel: () -> Void
  private var content: Content
  @Environment(\.colorScheme) private var scheme
  @AccessibilityFocusState private var headingFocused: Bool
  public init(
    title: String, confirm: String = QelvoraCopy.text("confirm"),
    cancel: String = QelvoraCopy.text("cancel"), destructive: Bool = false,
    onConfirm: @escaping () -> Void = {}, onCancel: @escaping () -> Void = {},
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.confirm = confirm
    self.cancel = cancel
    self.destructive = destructive
    self.onConfirm = onConfirm
    self.onCancel = onCancel
    self.content = content()
  }
  public var body: some View {
    ZStack {
      qColor("overlay-scrim", scheme).ignoresSafeArea().accessibilityHidden(true)
      VStack(alignment: .leading, spacing: QelvoraTokens.token("space-3")) {
        Text(title).qText("title").accessibilityAddTraits(.isHeader).accessibilityFocused(
          $headingFocused)
        VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) { content }.qText(
          "body")
        HStack(spacing: QelvoraTokens.token("space-2")) {
          Spacer(minLength: 0)
          Button(cancel, variant: .quiet, action: onCancel)
          // The verb carries the consequence; the visual style remains neutral.
          Button(confirm, variant: .secondary, action: onConfirm).accessibilityHint(
            destructive ? confirm : "")
        }.padding(.top, QelvoraTokens.token("space-1"))
      }.padding(.horizontal, QelvoraTokens.token("dialog-padding")).padding(
        .top, QelvoraTokens.token("dialog-padding")
      ).padding(.bottom, QelvoraTokens.token("space-3"))
        .frame(maxWidth: QelvoraTokens.token("dialog-width"), alignment: .leading)
        .foregroundStyle(qColor("ink", scheme))
        .background(
          qColor("surface", scheme),
          in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-xl"))
        )
        .overlay {
          RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-xl")).stroke(
            qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline"))
        }
        .qShadow("shadow-sheet", radius: QelvoraTokens.token("radius-xl"))
    }.accessibilityAddTraits(.isModal).task { headingFocused = true }
  }
}

public struct Toast: View {
  public var children: String
  public var action: String?
  public var onAction: () -> Void
  public var onDismiss: () -> Void
  @AccessibilityFocusState private var actionFocused: Bool
  @Environment(\.colorScheme) private var scheme
  public init(
    children: String, action: String? = nil, onAction: @escaping () -> Void = {},
    onDismiss: @escaping () -> Void = {}
  ) {
    self.children = children
    self.action = action
    self.onAction = onAction
    self.onDismiss = onDismiss
  }
  public var body: some View {
    HStack(spacing: QelvoraTokens.token("composer-gap")) {
      QelvoraGlyph(
        name: "check", size: QelvoraTokens.token("space-4"), color: qColor("ink-muted", scheme))
      Text(children).qText("control-body").frame(maxWidth: .infinity, alignment: .leading)
      if let action {
        SwiftUI.Button(action, action: onAction).buttonStyle(.plain).qText(
          "caption", weight: .semibold
        ).padding(.horizontal, QelvoraTokens.token("segment-radius")).frame(
          minHeight: QelvoraTokens.token("touch-target")
        ).accessibilityFocused($actionFocused)
      }
    }.padding(.leading, QelvoraTokens.token("message-padding")).padding(
      .trailing, QelvoraTokens.token("author-gap")
    ).padding(.vertical, QelvoraTokens.token("author-gap"))
      .frame(
        maxWidth: QelvoraTokens.token("toast-width"), minHeight: QelvoraTokens.token("space-12")
      )
      .foregroundStyle(qColor("ink", scheme)).background(
        qColor("surface", scheme),
        in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md"))
      )
      .overlay {
        RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(
          qColor("control-line", scheme), lineWidth: QelvoraTokens.token("hairline"))
      }
      .accessibilityElement(children: .contain)
      .task(id: children) {
        announce(children)
        #if canImport(UIKit)
          let duration = UIAccessibility.isVoiceOverRunning ? 8 : 4
        #else
          let duration = 4
        #endif
        try? await Task.sleep(for: .seconds(duration))
        while actionFocused && !Task.isCancelled { try? await Task.sleep(for: .milliseconds(250)) }
        if !Task.isCancelled { onDismiss() }
      }
  }
}

public enum SkeletonKind: String, Sendable { case message, row }
public struct Skeleton: View {
  public var kind: SkeletonKind
  @State private var shown = false
  @State private var pulse = false
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  public init(kind: SkeletonKind = .message) { self.kind = kind }
  public var body: some View {
    ZStack(alignment: .leading) {
      if shown {
        SkeletonShape(kind: kind)
      } else {
        Color.clear.frame(height: 0)
      }
    }.opacity(pulse && !reduceMotion ? 0.5 : 1).accessibilityHidden(true)
      .task {
        try? await Task.sleep(for: .milliseconds(300))
        if !Task.isCancelled {
          shown = true
          pulse = true
        }
      }
      .animation(
        reduceMotion || !shown ? nil : .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
        value: pulse)
  }
}

/// Shared visible geometry; runtime Skeleton owns the delay and motion.
struct SkeletonShape: View {
  var kind: SkeletonKind = .message
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    if kind == .row {
      HStack(spacing: QelvoraTokens.token("space-3")) {
        RoundedRectangle(cornerRadius: QelvoraTokens.token("avatar-radius")).fill(
          qColor("line", scheme)
        ).frame(
          width: QelvoraTokens.token("avatar-size"), height: QelvoraTokens.token("avatar-size"))
        GeometryReader { frame in
          VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) {
            bar(width: frame.size.width * 0.4)
            bar(width: frame.size.width * 0.8)
          }
        }.frame(height: QelvoraTokens.token("space-8"))
      }.padding(.vertical, QelvoraTokens.token("space-3"))
    } else {
      VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) {
        bar(width: QelvoraTokens.token("skeleton-label-width"))
        BubbleShape().fill(qColor("line", scheme)).frame(
          height: QelvoraTokens.token("skeleton-bubble-height"))
      }.frame(maxWidth: QelvoraTokens.token("skeleton-width"))
    }
  }
  private func bar(width: CGFloat) -> some View {
    RoundedRectangle(cornerRadius: QelvoraTokens.token("skeleton-radius")).fill(
      qColor("line", scheme)
    ).frame(width: width, height: QelvoraTokens.token("space-3"))
  }
}

private func announce(_ text: String) {
  #if canImport(UIKit)
    UIAccessibility.post(notification: .announcement, argument: text)
  #endif
}
