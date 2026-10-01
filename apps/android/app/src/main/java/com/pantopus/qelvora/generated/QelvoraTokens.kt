// Generated from design/handoff/tokens.json.
package com.pantopus.qelvora.generated

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

object QelvoraTokens {
  private val light = mapOf(
    "ground" to Color(0xFFF3F2EE),
    "surface" to Color(0xFFFFFFFF),
    "surface-sunken" to Color(0xFFE6E4DE),
    "line" to Color(0xFFDAD8D2),
    "control-line" to Color(0xFF7F7D78),
    "ink" to Color(0xFF1B1A18),
    "ink-muted" to Color(0xFF5C5B57),
    "ai-surface" to Color(0xFFFFFFFF),
    "ai-line" to Color(0xFFC8D2DC),
    "ai-ink" to Color(0xFF3A6795),
    "on-ai" to Color(0xFFFFFFFF),
    "maya-surface" to Color(0xFF1C1B19),
    "maya-line" to Color(0xFF1C1B19),
    "on-maya" to Color(0xFFF4F1EA),
    "on-maya-muted" to Color(0xFFABA8A1),
    "maya-accent" to Color(0xFFEE8D5F),
    "on-maya-accent" to Color(0xFF1C1B19),
    "maya-ink" to Color(0xFF7E2E12),
    "team-surface" to Color(0xFFECEAE5),
    "team-ink" to Color(0xFF5C5B57),
    "alert" to Color(0xFFB42318),
    "focus" to Color(0xFF1B1A18),
    "focus-on-maya" to Color(0xFFEE8D5F),
    "seal-fill" to Color(0xFFEE8D5F),
    "seal-ink" to Color(0xFF1C1B19),
    "selected-surface" to Color(0xFFFFFFFF),
    "overlay-scrim" to Color(0x731C1B19),
    "plate-rule" to Color(0xFFFFFFFF)
  )
  private val night = mapOf(
    "ground" to Color(0xFF14120F),
    "surface" to Color(0xFF211E1A),
    "surface-sunken" to Color(0xFF2A2621),
    "line" to Color(0xFF3A342D),
    "control-line" to Color(0xFF80796E),
    "ink" to Color(0xFFECE6DA),
    "ink-muted" to Color(0xFFA39C8F),
    "ai-surface" to Color(0xFF1B1F23),
    "ai-line" to Color(0xFF3A4652),
    "ai-ink" to Color(0xFFA3B8CC),
    "on-ai" to Color(0xFF14120F),
    "maya-surface" to Color(0xFFEDE3D3),
    "maya-line" to Color(0xFF5A3F2C),
    "on-maya" to Color(0xFF231C16),
    "on-maya-muted" to Color(0xFF5E5246),
    "maya-accent" to Color(0xFF8E3514),
    "on-maya-accent" to Color(0xFFFBF5EC),
    "maya-ink" to Color(0xFFE89A6E),
    "team-surface" to Color(0xFF24221F),
    "team-ink" to Color(0xFFA39C8F),
    "alert" to Color(0xFFFF8A7A),
    "focus" to Color(0xFFECE6DA),
    "focus-on-maya" to Color(0xFF8E3514),
    "seal-fill" to Color(0xFFE89A6E),
    "seal-ink" to Color(0xFF14120F),
    "selected-surface" to Color(0xFF211E1A),
    "overlay-scrim" to Color(0x99000000),
    "plate-rule" to Color(0xFFFFFFFF)
  )
  private val dimensions = mapOf(
    "space-1" to 4.dp,
    "space-2" to 8.dp,
    "space-3" to 12.dp,
    "space-4" to 16.dp,
    "space-5" to 20.dp,
    "space-6" to 24.dp,
    "space-8" to 32.dp,
    "space-12" to 48.dp,
    "radius-tail" to 4.dp,
    "radius-sm" to 8.dp,
    "radius-md" to 12.dp,
    "radius-lg" to 14.dp,
    "radius-xl" to 20.dp,
    "radius-pill" to 999.dp,
    "z-strip" to 10.dp,
    "z-composer" to 20.dp,
    "z-sheet" to 40.dp,
    "phone-width" to 390.dp,
    "phone-height" to 844.dp,
    "desktop-width" to 1280.dp,
    "sidebar-width" to 248.dp,
    "welcome-top" to 64.dp,
    "welcome-bottom" to 40.dp,
    "welcome-gap" to 28.dp,
    "welcome-wordmark" to 22.dp,
    "welcome-title" to 44.dp,
    "welcome-title-line" to 46.dp,
    "welcome-mark-width" to 120.dp,
    "welcome-mark-height" to 56.dp,
    "touch-target" to 44.dp,
    "button-lg" to 56.dp,
    "author-label-size" to 12.dp,
    "author-label-line" to 17.dp,
    "author-gap" to 6.dp,
    "message-max-width" to 334.dp,
    "fan-message-max-width" to 286.dp,
    "message-padding" to 14.dp,
    "note-fold" to 28.dp,
    "hairline" to 1.dp,
    "glyph-size" to 22.dp,
    "avatar-size" to 38.dp,
    "segment-height" to 40.dp,
    "segment-radius" to 10.dp,
    "sidebar-min-height" to 600.dp,
    "dialog-width" to 340.dp,
    "dialog-padding" to 22.dp,
    "toast-width" to 358.dp,
    "sheet-grabber-width" to 38.dp,
    "sheet-grabber-height" to 5.dp,
    "sheet-grabber-radius" to 3.dp,
    "skeleton-width" to 300.dp,
    "skeleton-label-width" to 88.dp,
    "skeleton-bubble-height" to 72.dp,
    "skeleton-radius" to 6.dp,
    "avatar-radius" to 11.dp,
    "strip-min-height" to 42.dp,
    "strip-box-radius" to 7.dp,
    "glyph-small" to 12.dp,
    "glyph-caption" to 13.dp,
    "glyph-inline" to 14.dp,
    "seal-step" to 30.dp,
    "seal-reaction" to 22.dp,
    "seal-presence" to 18.dp,
    "chip-radius" to 10.dp,
    "citation-stamp-width" to 34.dp,
    "citation-stamp-height" to 26.dp,
    "citation-stamp-size" to 10.dp,
    "access-term-width" to 96.dp,
    "checkbox-size" to 20.dp,
    "limit-radio-size" to 18.dp,
    "include-row-height" to 52.dp,
    "request-dot-size" to 9.dp,
    "request-dot-inset" to 3.dp,
    "request-dot-stroke" to 1.5.dp,
    "receipt-max-width" to 460.dp,
    "receipt-padding-x" to 28.dp,
    "receipt-padding-y" to 26.dp,
    "receipt-radius" to 6.dp,
    "composer-bottom" to 28.dp,
    "composer-gap" to 10.dp,
    "composer-input-height" to 48.dp,
    "wave-bar-width" to 3.dp,
    "wave-gap" to 2.dp,
    "wave-radius" to 2.dp,
    "share-size" to 340.dp,
    "share-padding" to 26.dp,
    "share-gap" to 18.dp,
    "countdown-height" to 26.dp,
    "call-person-height" to 40.dp,
    "call-recording-height" to 32.dp,
    "notification-radius" to 11.dp,
    "signing-label-width" to 88.dp,
    "transcript-label-width" to 84.dp,
    "version-id-width" to 36.dp,
    "wave-bar-8" to 8.dp,
    "wave-bar-10" to 10.dp,
    "wave-bar-12" to 12.dp,
    "wave-bar-14" to 14.dp,
    "wave-bar-16" to 16.dp,
    "wave-bar-18" to 18.dp,
    "wave-bar-20" to 20.dp,
    "wave-bar-22" to 22.dp,
    "wave-bar-24" to 24.dp,
    "wave-bar-26" to 26.dp,
    "glow-opacity" to 0.62.dp,
    "seal-font-ratio" to 0.62.dp,
    "wave-opacity" to 0.55.dp,
    "presence-line-opacity" to 0.5.dp,
    "strip-glow-opacity" to 0.24.dp,
    "capacity-rule-opacity" to 0.09.dp,
    "share-rule-opacity" to 0.1.dp,
    "strip-glow-x" to 0.18.dp,
    "strip-glow-stop" to 0.55.dp,
    "strip-glow-scale-x" to 1.2.dp,
    "strip-glow-scale-y" to 1.6.dp,
    "note-fold-opacity" to 0.14.dp,
    "note-media-opacity" to 0.18.dp,
    "note-media-height" to 150.dp
  )
  data class TextStyle(val family: String, val size: Float, val lineHeight: Float, val weight: Int, val letterSpacing: Float)
  val textStyles = mapOf(
    "display-xl" to TextStyle("serif", 64f, 60f, 400, -0.03f),
    "display-lg" to TextStyle("serif", 34f, 36f, 400, -0.02f),
    "display-md" to TextStyle("serif", 26f, 30f, 400, -0.015f),
    "voice-lg" to TextStyle("serif", 18f, 28f, 400, 0f),
    "voice-md" to TextStyle("serif", 16f, 24f, 400, 0f),
    "title" to TextStyle("sans", 17f, 22f, 600, -0.015f),
    "body" to TextStyle("sans", 15f, 22f, 400, 0f),
    "body-strong" to TextStyle("sans", 15f, 22f, 600, 0f),
    "label" to TextStyle("sans", 13f, 18f, 600, 0f),
    "caption" to TextStyle("sans", 12f, 17f, 400, 0f),
    "data-lg" to TextStyle("mono", 24f, 28f, 400, 0f),
    "data-md" to TextStyle("mono", 15f, 20f, 400, 0f),
    "data-sm" to TextStyle("mono", 11f, 14f, 400, 0.05f),
    "control-body" to TextStyle("sans", 14f, 20f, 400, 0f),
    "tab-label" to TextStyle("sans", 11f, 16f, 600, 0f),
    "summary" to TextStyle("sans", 17f, 24f, 400, 0f),
    "receipt-title" to TextStyle("serif", 28f, 32f, 400, -0.01f),
    "transcript-human" to TextStyle("serif", 15f, 22f, 400, 0f),
    "transcript-ai" to TextStyle("sans", 13f, 19f, 400, 0f),
    "mono-caption" to TextStyle("mono", 12f, 17f, 400, 0f),
    "signing-title" to TextStyle("serif", 28f, 32f, 400, 0f),
    "share-quote" to TextStyle("serif", 22f, 31f, 400, 0f),
    "data-label" to TextStyle("mono", 13f, 20f, 400, 0f),
    "signing-label" to TextStyle("mono", 11f, 20f, 400, 0.05f),
    "email-brand" to TextStyle("serif", 22f, 26f, 400, 0f),
    "sidebar-brand" to TextStyle("serif", 14f, 18f, 400, 0f),
    "citation-stamp" to TextStyle("mono", 10f, 10f, 500, 0f),
    "access-term" to TextStyle("mono", 11f, 20f, 400, 0.05f),
    "mode-title" to TextStyle("sans", 15f, 20f, 600, 0f),
    "control-compact" to TextStyle("sans", 13f, 20f, 600, 0f),
    "badge" to TextStyle("mono", 11f, 14f, 500, 0.04f),
    "button-lg" to TextStyle("sans", 16f, 22f, 600, 0f),
    "context-body" to TextStyle("sans", 14f, 19f, 400, 0f)
  )
  data class ShadowValue(val x: Dp, val y: Dp, val blur: Dp, val spread: Dp, val color: Color)
  private val shadows = mapOf(
    false to mapOf(
      "shadow-plate" to ShadowValue(0.dp, 20.dp, 34.dp, -24.dp, Color(28 / 255f, 27 / 255f, 25 / 255f, 0.8f)),
      "shadow-sheet" to ShadowValue(0.dp, -12.dp, 40.dp, 0.dp, Color(28 / 255f, 27 / 255f, 25 / 255f, 0.22f)),
      "glow-maya" to ShadowValue(0.dp, 18.dp, 38.dp, -20.dp, Color(238 / 255f, 141 / 255f, 95 / 255f, 0.62f))
    ),
    true to mapOf(
      "shadow-plate" to ShadowValue(0.dp, 20.dp, 34.dp, -24.dp, Color(0 / 255f, 0 / 255f, 0 / 255f, 0.9f)),
      "shadow-sheet" to ShadowValue(0.dp, -12.dp, 40.dp, 0.dp, Color(0 / 255f, 0 / 255f, 0 / 255f, 0.6f)),
      "glow-maya" to ShadowValue(0.dp, 18.dp, 40.dp, -22.dp, Color(232 / 255f, 154 / 255f, 110 / 255f, 0.62f))
    )
  )
  fun shadow(name: String, night: Boolean): ShadowValue = shadows.getValue(night).getValue(name)
  fun color(name: String, night: Boolean): Color = (if (night) this.night else light).getValue(name)
  fun dimension(name: String): Dp = dimensions.getValue(name)
  val space1 = 4.dp
  val space2 = 8.dp
  val space3 = 12.dp
  val space4 = 16.dp
  val space5 = 20.dp
  val space6 = 24.dp
  val space8 = 32.dp
  val space12 = 48.dp
  val radiusTail = 4.dp
  val radiusSm = 8.dp
  val radiusMd = 12.dp
  val radiusLg = 14.dp
  val radiusXl = 20.dp
  val radiusPill = 999.dp
  val zStrip = 10.0f
  val zComposer = 20.0f
  val zSheet = 40.0f
  val phoneWidth = 390.dp
  val phoneHeight = 844.dp
  val desktopWidth = 1280.dp
  val sidebarWidth = 248.dp
  val welcomeTop = 64.dp
  val welcomeBottom = 40.dp
  val welcomeGap = 28.dp
  val welcomeWordmark = 22.dp
  val welcomeTitle = 44.dp
  val welcomeTitleLine = 46.dp
  val welcomeMarkWidth = 120.dp
  val welcomeMarkHeight = 56.dp
  val touchTarget = 44.dp
  val buttonLg = 56.dp
  val authorLabelSize = 12.dp
  val authorLabelLine = 17.dp
  val authorGap = 6.dp
  val messageMaxWidth = 334.dp
  val fanMessageMaxWidth = 286.dp
  val messagePadding = 14.dp
  val noteFold = 28.dp
  val hairline = 1.dp
  val glyphSize = 22.dp
  val avatarSize = 38.dp
  val segmentHeight = 40.dp
  val segmentRadius = 10.dp
  val sidebarMinHeight = 600.dp
  val dialogWidth = 340.dp
  val dialogPadding = 22.dp
  val toastWidth = 358.dp
  val sheetGrabberWidth = 38.dp
  val sheetGrabberHeight = 5.dp
  val sheetGrabberRadius = 3.dp
  val skeletonWidth = 300.dp
  val skeletonLabelWidth = 88.dp
  val skeletonBubbleHeight = 72.dp
  val skeletonRadius = 6.dp
  val avatarRadius = 11.dp
  val stripMinHeight = 42.dp
  val stripBoxRadius = 7.dp
  val glyphSmall = 12.dp
  val glyphCaption = 13.dp
  val glyphInline = 14.dp
  val sealStep = 30.dp
  val sealReaction = 22.dp
  val sealPresence = 18.dp
  val chipRadius = 10.dp
  val citationStampWidth = 34.dp
  val citationStampHeight = 26.dp
  val citationStampSize = 10.dp
  val accessTermWidth = 96.dp
  val checkboxSize = 20.dp
  val limitRadioSize = 18.dp
  val includeRowHeight = 52.dp
  val requestDotSize = 9.dp
  val requestDotInset = 3.dp
  val requestDotStroke = 1.5.dp
  val receiptMaxWidth = 460.dp
  val receiptPaddingX = 28.dp
  val receiptPaddingY = 26.dp
  val receiptRadius = 6.dp
  val composerBottom = 28.dp
  val composerGap = 10.dp
  val composerInputHeight = 48.dp
  val waveBarWidth = 3.dp
  val waveGap = 2.dp
  val waveRadius = 2.dp
  val shareSize = 340.dp
  val sharePadding = 26.dp
  val shareGap = 18.dp
  val countdownHeight = 26.dp
  val callPersonHeight = 40.dp
  val callRecordingHeight = 32.dp
  val notificationRadius = 11.dp
  val signingLabelWidth = 88.dp
  val transcriptLabelWidth = 84.dp
  val versionIdWidth = 36.dp
  val waveBar8 = 8.dp
  val waveBar10 = 10.dp
  val waveBar12 = 12.dp
  val waveBar14 = 14.dp
  val waveBar16 = 16.dp
  val waveBar18 = 18.dp
  val waveBar20 = 20.dp
  val waveBar22 = 22.dp
  val waveBar24 = 24.dp
  val waveBar26 = 26.dp
  val glowOpacity = 0.62f
  val sealFontRatio = 0.62f
  val waveOpacity = 0.55f
  val presenceLineOpacity = 0.5f
  val stripGlowOpacity = 0.24f
  val capacityRuleOpacity = 0.09f
  val shareRuleOpacity = 0.1f
  val stripGlowX = 0.18f
  val stripGlowStop = 0.55f
  val stripGlowScaleX = 1.2f
  val stripGlowScaleY = 1.6f
  val noteFoldOpacity = 0.14f
  val noteMediaOpacity = 0.18f
  val noteMediaHeight = 150.dp
}
