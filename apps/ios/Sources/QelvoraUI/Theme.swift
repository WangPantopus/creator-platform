import CoreText
import SwiftUI

func qColor(_ name: String, _ scheme: ColorScheme) -> Color {
    QelvoraTokens.color(name, theme: scheme == .dark ? .night : .light)
}

enum QelvoraLayout {
    static var authorGap: CGFloat { QelvoraTokens.token("author-gap") }
    static func value(_ name: String) -> CGFloat { QelvoraTokens.token(name) }
}

struct QelvoraTextStyle: ViewModifier {
    let style: QelvoraTokens.TextStyle
    let weight: Font.Weight?
    let italic: Bool
    @ScaledMetric(relativeTo: .body) private var scaledSize: CGFloat = 1

    init(_ name: String, weight: Font.Weight?, italic: Bool = false) {
        guard let style = QelvoraTokens.textStyles[name] else { preconditionFailure("Unknown text style: \(name)") }
        self.style = style; self.weight = weight; self.italic = italic
        _scaledSize = ScaledMetric(wrappedValue: style.size, relativeTo: .body)
    }

    init(style: QelvoraTokens.TextStyle, weight: Font.Weight? = nil, italic: Bool = false) {
        self.style = style; self.weight = weight; self.italic = italic
        _scaledSize = ScaledMetric(wrappedValue: style.size, relativeTo: .body)
    }

    private var family: String {
        switch style.family {
        case "serif": QelvoraFonts.face("serif")
        case "mono": QelvoraFonts.face("mono")
        default: QelvoraFonts.face("sans")
        }
    }

    func body(content: Content) -> some View {
        let numericWeight: Int = weight == .semibold || weight == .bold ? 600 : weight == .medium ? 500 : style.weight
        let font = QelvoraFonts.coreText(style.family, size: scaledSize, weight: numericWeight, italic: italic)
        let naturalHeight = CTFontGetAscent(font) + CTFontGetDescent(font) + CTFontGetLeading(font)
        content
            .font(Font(font))
            .tracking(style.letterSpacing * scaledSize)
            .lineSpacing(max(0, style.lineHeight * scaledSize / style.size - naturalHeight))
    }
}

extension View {
    @ViewBuilder func qDisableAutoCapitalization() -> some View {
        #if os(iOS)
        self.textInputAutocapitalization(.never)
        #else
        self
        #endif
    }
    @ViewBuilder func qDecimalKeyboard() -> some View {
        #if os(iOS)
        self.keyboardType(.decimalPad)
        #else
        self
        #endif
    }
    func qText(_ name: String, weight: Font.Weight? = nil, italic: Bool = false) -> some View {
        modifier(QelvoraTextStyle(name, weight: weight, italic: italic))
    }
    func qShadow(_ name: String, radius: CGFloat = QelvoraTokens.token("radius-lg")) -> some View { modifier(QelvoraShadow(name: name, radius: radius)) }
}

private struct QelvoraShadow: ViewModifier {
    let name: String
    let radius: CGFloat
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        let shadow = QelvoraTokens.shadows[scheme == .dark ? .night : .light]![name]!
        content.background {
            RoundedRectangle(cornerRadius: max(0, radius + shadow.spread))
                .fill(shadow.color).padding(-shadow.spread)
                .blur(radius: shadow.blur / 2).offset(x: shadow.x, y: shadow.y)
        }
    }
}

/// Installs bundled, licensed font resources for both previews and device rendering.
public enum QelvoraFonts {
    public static func postScriptFamily(_ family: String) -> String { face(family) }
    public static func face(_ family: String, italic: Bool = false) -> String {
        switch family {
        case "serif": italic ? "Newsreader16pt-Italic" : "Newsreader16pt-Regular"
        case "mono": italic ? "GeistMono-Italic" : "GeistMono-Regular"
        default: italic ? "Geist-Italic" : "Geist-Regular"
        }
    }
    static func coreText(_ family: String, size: CGFloat, weight: Int = 400, italic: Bool = false) -> CTFont {
        register()
        let variations: [NSNumber: NSNumber] = [NSNumber(value: 0x6F70737A): NSNumber(value: Double(size)), NSNumber(value: 0x77676874): NSNumber(value: weight)]
        let attributes: [CFString: Any] = [kCTFontNameAttribute: face(family, italic: italic), kCTFontVariationAttribute: variations]
        let descriptor = CTFontDescriptorCreateWithAttributes(attributes as CFDictionary)
        return CTFontCreateWithFontDescriptor(descriptor, size, nil)
    }
    public static func font(_ family: String, size: CGFloat, weight: Int = 400, italic: Bool = false) -> Font { Font(coreText(family, size: size, weight: weight, italic: italic)) }
    private static let registered: Bool = {
        for ext in ["ttf", "otf"] {
            for url in Bundle.module.urls(forResourcesWithExtension: ext, subdirectory: nil) ?? [] {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
        return true
    }()
    public static func register() { _ = registered }
}

struct BubbleShape: Shape {
    var fan = false
    var creator = false
    func path(in rect: CGRect) -> Path {
        let radius = QelvoraTokens.token(creator ? "space-4" : "radius-lg")
        let tail = QelvoraTokens.token("radius-tail")
        return UnevenRoundedRectangle(topLeadingRadius: fan ? radius : tail, bottomLeadingRadius: radius, bottomTrailingRadius: fan ? tail : radius, topTrailingRadius: radius).path(in: rect)
    }
}
