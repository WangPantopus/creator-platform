// Generated from design/handoff/tokens.json.
import SwiftUI

public enum QelvoraTokens {
  public enum Theme: Sendable { case light, night }
  public static let colors: [Theme: [String: String]] = [
    .light: [
      "ground": "#F3F2EE",
      "surface": "#FFFFFF",
      "surface-sunken": "#E6E4DE",
      "line": "#DAD8D2",
      "control-line": "#7F7D78",
      "ink": "#1B1A18",
      "ink-muted": "#5C5B57",
      "ai-surface": "#FFFFFF",
      "ai-line": "#C8D2DC",
      "ai-ink": "#3A6795",
      "on-ai": "#FFFFFF",
      "maya-surface": "#1C1B19",
      "maya-line": "#1C1B19",
      "on-maya": "#F4F1EA",
      "on-maya-muted": "#ABA8A1",
      "maya-accent": "#EE8D5F",
      "on-maya-accent": "#1C1B19",
      "maya-ink": "#7E2E12",
      "team-surface": "#ECEAE5",
      "team-ink": "#5C5B57",
      "alert": "#B42318",
      "focus": "#1B1A18",
      "focus-on-maya": "#EE8D5F",
      "seal-fill": "#EE8D5F",
      "seal-ink": "#1C1B19",
      "selected-surface": "#FFFFFF",
      "overlay-scrim": "#1C1B1973",
      "plate-rule": "#FFFFFF"
    ],
    .night: [
      "ground": "#14120F",
      "surface": "#211E1A",
      "surface-sunken": "#2A2621",
      "line": "#3A342D",
      "control-line": "#80796E",
      "ink": "#ECE6DA",
      "ink-muted": "#A39C8F",
      "ai-surface": "#1B1F23",
      "ai-line": "#3A4652",
      "ai-ink": "#A3B8CC",
      "on-ai": "#14120F",
      "maya-surface": "#EDE3D3",
      "maya-line": "#5A3F2C",
      "on-maya": "#231C16",
      "on-maya-muted": "#5E5246",
      "maya-accent": "#8E3514",
      "on-maya-accent": "#FBF5EC",
      "maya-ink": "#E89A6E",
      "team-surface": "#24221F",
      "team-ink": "#A39C8F",
      "alert": "#FF8A7A",
      "focus": "#ECE6DA",
      "focus-on-maya": "#8E3514",
      "seal-fill": "#E89A6E",
      "seal-ink": "#14120F",
      "selected-surface": "#211E1A",
      "overlay-scrim": "#00000099",
      "plate-rule": "#FFFFFF"
    ]
  ]
  public static let dimensions: [String: CGFloat] = [
    "space-1": 4,
    "space-2": 8,
    "space-3": 12,
    "space-4": 16,
    "space-5": 20,
    "space-6": 24,
    "space-8": 32,
    "space-12": 48,
    "radius-tail": 4,
    "radius-sm": 8,
    "radius-md": 12,
    "radius-lg": 14,
    "radius-xl": 20,
    "radius-pill": 999,
    "z-strip": 10,
    "z-composer": 20,
    "z-sheet": 40,
    "phone-width": 390,
    "phone-height": 844,
    "desktop-width": 1280,
    "sidebar-width": 248,
    "welcome-top": 64,
    "welcome-bottom": 40,
    "welcome-gap": 28,
    "welcome-wordmark": 22,
    "welcome-title": 44,
    "welcome-title-line": 46,
    "welcome-mark-width": 120,
    "welcome-mark-height": 56,
    "touch-target": 44,
    "button-lg": 56,
    "author-label-size": 12,
    "author-label-line": 17,
    "author-gap": 6,
    "message-max-width": 334,
    "fan-message-max-width": 286,
    "message-padding": 14,
    "note-fold": 28,
    "hairline": 1,
    "glyph-size": 22,
    "avatar-size": 38,
    "segment-height": 40,
    "segment-radius": 10,
    "sidebar-min-height": 600,
    "dialog-width": 340,
    "dialog-padding": 22,
    "toast-width": 358,
    "sheet-grabber-width": 38,
    "sheet-grabber-height": 5,
    "sheet-grabber-radius": 3,
    "skeleton-width": 300,
    "skeleton-label-width": 88,
    "skeleton-bubble-height": 72,
    "skeleton-radius": 6,
    "avatar-radius": 11,
    "strip-min-height": 42,
    "strip-box-radius": 7,
    "glyph-small": 12,
    "glyph-caption": 13,
    "glyph-inline": 14,
    "seal-step": 30,
    "seal-reaction": 22,
    "seal-presence": 18,
    "chip-radius": 10,
    "citation-stamp-width": 34,
    "citation-stamp-height": 26,
    "citation-stamp-size": 10,
    "access-term-width": 96,
    "checkbox-size": 20,
    "limit-radio-size": 18,
    "include-row-height": 52,
    "request-dot-size": 9,
    "request-dot-inset": 3,
    "request-dot-stroke": 1.5,
    "receipt-max-width": 460,
    "receipt-padding-x": 28,
    "receipt-padding-y": 26,
    "receipt-radius": 6,
    "composer-bottom": 28,
    "composer-gap": 10,
    "composer-input-height": 48,
    "wave-bar-width": 3,
    "wave-gap": 2,
    "wave-radius": 2,
    "share-size": 340,
    "share-padding": 26,
    "share-gap": 18,
    "countdown-height": 26,
    "call-person-height": 40,
    "call-recording-height": 32,
    "notification-radius": 11,
    "signing-label-width": 88,
    "transcript-label-width": 84,
    "version-id-width": 36,
    "wave-bar-8": 8,
    "wave-bar-10": 10,
    "wave-bar-12": 12,
    "wave-bar-14": 14,
    "wave-bar-16": 16,
    "wave-bar-18": 18,
    "wave-bar-20": 20,
    "wave-bar-22": 22,
    "wave-bar-24": 24,
    "wave-bar-26": 26,
    "glow-opacity": 0.62,
    "seal-font-ratio": 0.62,
    "wave-opacity": 0.55,
    "presence-line-opacity": 0.5,
    "strip-glow-opacity": 0.24,
    "capacity-rule-opacity": 0.09,
    "share-rule-opacity": 0.1,
    "strip-glow-x": 0.18,
    "strip-glow-stop": 0.55,
    "strip-glow-scale-x": 1.2,
    "strip-glow-scale-y": 1.6,
    "note-fold-opacity": 0.14,
    "note-media-opacity": 0.18,
    "note-media-height": 150
  ]
  public struct TextStyle: Sendable { public let family: String; public let size: CGFloat; public let lineHeight: CGFloat; public let weight: Int; public let letterSpacing: CGFloat }
  public static let textStyles: [String: TextStyle] = [
    "display-xl": TextStyle(family: "serif", size: 64, lineHeight: 60, weight: 400, letterSpacing: -0.03),
    "display-lg": TextStyle(family: "serif", size: 34, lineHeight: 36, weight: 400, letterSpacing: -0.02),
    "display-md": TextStyle(family: "serif", size: 26, lineHeight: 30, weight: 400, letterSpacing: -0.015),
    "voice-lg": TextStyle(family: "serif", size: 18, lineHeight: 28, weight: 400, letterSpacing: 0),
    "voice-md": TextStyle(family: "serif", size: 16, lineHeight: 24, weight: 400, letterSpacing: 0),
    "title": TextStyle(family: "sans", size: 17, lineHeight: 22, weight: 600, letterSpacing: -0.015),
    "body": TextStyle(family: "sans", size: 15, lineHeight: 22, weight: 400, letterSpacing: 0),
    "body-strong": TextStyle(family: "sans", size: 15, lineHeight: 22, weight: 600, letterSpacing: 0),
    "label": TextStyle(family: "sans", size: 13, lineHeight: 18, weight: 600, letterSpacing: 0),
    "caption": TextStyle(family: "sans", size: 12, lineHeight: 17, weight: 400, letterSpacing: 0),
    "data-lg": TextStyle(family: "mono", size: 24, lineHeight: 28, weight: 400, letterSpacing: 0),
    "data-md": TextStyle(family: "mono", size: 15, lineHeight: 20, weight: 400, letterSpacing: 0),
    "data-sm": TextStyle(family: "mono", size: 11, lineHeight: 14, weight: 400, letterSpacing: 0.05),
    "control-body": TextStyle(family: "sans", size: 14, lineHeight: 20, weight: 400, letterSpacing: 0),
    "tab-label": TextStyle(family: "sans", size: 11, lineHeight: 16, weight: 600, letterSpacing: 0),
    "summary": TextStyle(family: "sans", size: 17, lineHeight: 24, weight: 400, letterSpacing: 0),
    "receipt-title": TextStyle(family: "serif", size: 28, lineHeight: 32, weight: 400, letterSpacing: -0.01),
    "transcript-human": TextStyle(family: "serif", size: 15, lineHeight: 22, weight: 400, letterSpacing: 0),
    "transcript-ai": TextStyle(family: "sans", size: 13, lineHeight: 19, weight: 400, letterSpacing: 0),
    "mono-caption": TextStyle(family: "mono", size: 12, lineHeight: 17, weight: 400, letterSpacing: 0),
    "signing-title": TextStyle(family: "serif", size: 28, lineHeight: 32, weight: 400, letterSpacing: 0),
    "share-quote": TextStyle(family: "serif", size: 22, lineHeight: 31, weight: 400, letterSpacing: 0),
    "data-label": TextStyle(family: "mono", size: 13, lineHeight: 20, weight: 400, letterSpacing: 0),
    "signing-label": TextStyle(family: "mono", size: 11, lineHeight: 20, weight: 400, letterSpacing: 0.05),
    "email-brand": TextStyle(family: "serif", size: 22, lineHeight: 26, weight: 400, letterSpacing: 0),
    "sidebar-brand": TextStyle(family: "serif", size: 14, lineHeight: 18, weight: 400, letterSpacing: 0),
    "citation-stamp": TextStyle(family: "mono", size: 10, lineHeight: 10, weight: 500, letterSpacing: 0),
    "access-term": TextStyle(family: "mono", size: 11, lineHeight: 20, weight: 400, letterSpacing: 0.05),
    "mode-title": TextStyle(family: "sans", size: 15, lineHeight: 20, weight: 600, letterSpacing: 0),
    "control-compact": TextStyle(family: "sans", size: 13, lineHeight: 20, weight: 600, letterSpacing: 0),
    "badge": TextStyle(family: "mono", size: 11, lineHeight: 14, weight: 500, letterSpacing: 0.04),
    "button-lg": TextStyle(family: "sans", size: 16, lineHeight: 22, weight: 600, letterSpacing: 0),
    "context-body": TextStyle(family: "sans", size: 14, lineHeight: 19, weight: 400, letterSpacing: 0)
  ]
  public struct ShadowValue: Sendable { public let x: CGFloat; public let y: CGFloat; public let blur: CGFloat; public let spread: CGFloat; public let red: Double; public let green: Double; public let blue: Double; public let opacity: Double
    public var color: Color { Color(red: red / 255, green: green / 255, blue: blue / 255, opacity: opacity) }
  }
  public static let shadows: [Theme: [String: ShadowValue]] = [
    .light: [
      "shadow-plate": ShadowValue(x: 0, y: 20, blur: 34, spread: -24, red: 28, green: 27, blue: 25, opacity: 0.8),
      "shadow-sheet": ShadowValue(x: 0, y: -12, blur: 40, spread: 0, red: 28, green: 27, blue: 25, opacity: 0.22),
      "glow-maya": ShadowValue(x: 0, y: 18, blur: 38, spread: -20, red: 238, green: 141, blue: 95, opacity: 0.62)
    ],
    .night: [
      "shadow-plate": ShadowValue(x: 0, y: 20, blur: 34, spread: -24, red: 0, green: 0, blue: 0, opacity: 0.9),
      "shadow-sheet": ShadowValue(x: 0, y: -12, blur: 40, spread: 0, red: 0, green: 0, blue: 0, opacity: 0.6),
      "glow-maya": ShadowValue(x: 0, y: 18, blur: 40, spread: -22, red: 232, green: 154, blue: 110, opacity: 0.62)
    ]
  ]
  public static let sans = "Geist"
  public static let serif = "Newsreader"
  public static let mono = "GeistMono"
  public static func color(_ name: String, theme: Theme) -> Color {
    guard let hex = colors[theme]?[name], let number = UInt64(hex.dropFirst(), radix: 16) else { preconditionFailure("Unknown color token: \(name)") }
    let rgb = hex.count == 9 ? number >> 8 : number
    let alpha = hex.count == 9 ? Double(number & 255) / 255 : 1
    return Color(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255, opacity: alpha)
  }
  public static func token(_ name: String) -> CGFloat {
    guard let value = dimensions[name] else { preconditionFailure("Unknown dimension token: \(name)") }; return value
  }
  public static let space1: CGFloat = 4
  public static let space2: CGFloat = 8
  public static let space3: CGFloat = 12
  public static let space4: CGFloat = 16
  public static let space5: CGFloat = 20
  public static let space6: CGFloat = 24
  public static let space8: CGFloat = 32
  public static let space12: CGFloat = 48
  public static let radiusTail: CGFloat = 4
  public static let radiusSm: CGFloat = 8
  public static let radiusMd: CGFloat = 12
  public static let radiusLg: CGFloat = 14
  public static let radiusXl: CGFloat = 20
  public static let radiusPill: CGFloat = 999
  public static let zStrip: CGFloat = 10
  public static let zComposer: CGFloat = 20
  public static let zSheet: CGFloat = 40
  public static let phoneWidth: CGFloat = 390
  public static let phoneHeight: CGFloat = 844
  public static let desktopWidth: CGFloat = 1280
  public static let sidebarWidth: CGFloat = 248
  public static let welcomeTop: CGFloat = 64
  public static let welcomeBottom: CGFloat = 40
  public static let welcomeGap: CGFloat = 28
  public static let welcomeWordmark: CGFloat = 22
  public static let welcomeTitle: CGFloat = 44
  public static let welcomeTitleLine: CGFloat = 46
  public static let welcomeMarkWidth: CGFloat = 120
  public static let welcomeMarkHeight: CGFloat = 56
  public static let touchTarget: CGFloat = 44
  public static let buttonLg: CGFloat = 56
  public static let authorLabelSize: CGFloat = 12
  public static let authorLabelLine: CGFloat = 17
  public static let authorGap: CGFloat = 6
  public static let messageMaxWidth: CGFloat = 334
  public static let fanMessageMaxWidth: CGFloat = 286
  public static let messagePadding: CGFloat = 14
  public static let noteFold: CGFloat = 28
  public static let hairline: CGFloat = 1
  public static let glyphSize: CGFloat = 22
  public static let avatarSize: CGFloat = 38
  public static let segmentHeight: CGFloat = 40
  public static let segmentRadius: CGFloat = 10
  public static let sidebarMinHeight: CGFloat = 600
  public static let dialogWidth: CGFloat = 340
  public static let dialogPadding: CGFloat = 22
  public static let toastWidth: CGFloat = 358
  public static let sheetGrabberWidth: CGFloat = 38
  public static let sheetGrabberHeight: CGFloat = 5
  public static let sheetGrabberRadius: CGFloat = 3
  public static let skeletonWidth: CGFloat = 300
  public static let skeletonLabelWidth: CGFloat = 88
  public static let skeletonBubbleHeight: CGFloat = 72
  public static let skeletonRadius: CGFloat = 6
  public static let avatarRadius: CGFloat = 11
  public static let stripMinHeight: CGFloat = 42
  public static let stripBoxRadius: CGFloat = 7
  public static let glyphSmall: CGFloat = 12
  public static let glyphCaption: CGFloat = 13
  public static let glyphInline: CGFloat = 14
  public static let sealStep: CGFloat = 30
  public static let sealReaction: CGFloat = 22
  public static let sealPresence: CGFloat = 18
  public static let chipRadius: CGFloat = 10
  public static let citationStampWidth: CGFloat = 34
  public static let citationStampHeight: CGFloat = 26
  public static let citationStampSize: CGFloat = 10
  public static let accessTermWidth: CGFloat = 96
  public static let checkboxSize: CGFloat = 20
  public static let limitRadioSize: CGFloat = 18
  public static let includeRowHeight: CGFloat = 52
  public static let requestDotSize: CGFloat = 9
  public static let requestDotInset: CGFloat = 3
  public static let requestDotStroke: CGFloat = 1.5
  public static let receiptMaxWidth: CGFloat = 460
  public static let receiptPaddingX: CGFloat = 28
  public static let receiptPaddingY: CGFloat = 26
  public static let receiptRadius: CGFloat = 6
  public static let composerBottom: CGFloat = 28
  public static let composerGap: CGFloat = 10
  public static let composerInputHeight: CGFloat = 48
  public static let waveBarWidth: CGFloat = 3
  public static let waveGap: CGFloat = 2
  public static let waveRadius: CGFloat = 2
  public static let shareSize: CGFloat = 340
  public static let sharePadding: CGFloat = 26
  public static let shareGap: CGFloat = 18
  public static let countdownHeight: CGFloat = 26
  public static let callPersonHeight: CGFloat = 40
  public static let callRecordingHeight: CGFloat = 32
  public static let notificationRadius: CGFloat = 11
  public static let signingLabelWidth: CGFloat = 88
  public static let transcriptLabelWidth: CGFloat = 84
  public static let versionIdWidth: CGFloat = 36
  public static let waveBar8: CGFloat = 8
  public static let waveBar10: CGFloat = 10
  public static let waveBar12: CGFloat = 12
  public static let waveBar14: CGFloat = 14
  public static let waveBar16: CGFloat = 16
  public static let waveBar18: CGFloat = 18
  public static let waveBar20: CGFloat = 20
  public static let waveBar22: CGFloat = 22
  public static let waveBar24: CGFloat = 24
  public static let waveBar26: CGFloat = 26
  public static let glowOpacity: CGFloat = 0.62
  public static let sealFontRatio: CGFloat = 0.62
  public static let waveOpacity: CGFloat = 0.55
  public static let presenceLineOpacity: CGFloat = 0.5
  public static let stripGlowOpacity: CGFloat = 0.24
  public static let capacityRuleOpacity: CGFloat = 0.09
  public static let shareRuleOpacity: CGFloat = 0.1
  public static let stripGlowX: CGFloat = 0.18
  public static let stripGlowStop: CGFloat = 0.55
  public static let stripGlowScaleX: CGFloat = 1.2
  public static let stripGlowScaleY: CGFloat = 1.6
  public static let noteFoldOpacity: CGFloat = 0.14
  public static let noteMediaOpacity: CGFloat = 0.18
  public static let noteMediaHeight: CGFloat = 150
}
