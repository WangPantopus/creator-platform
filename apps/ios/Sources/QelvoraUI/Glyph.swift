import Foundation
import SwiftUI

private struct GlyphDefinition: Decodable {
    let box: [CGFloat]
    let aspect: CGFloat
    let shapes: [GlyphShape]
}
private struct GlyphShape: Decodable {
    let kind: String
    let d: String?
    let x: CGFloat?; let y: CGFloat?; let width: CGFloat?; let height: CGFloat?; let rx: CGFloat?
    let cx: CGFloat?; let cy: CGFloat?; let r: CGFloat?
    let fill: String?; let stroke: String?; let strokeWidth: CGFloat?; let strokeDasharray: String?
    let strokeLinecap: String?; let strokeLinejoin: String?
}

/// Uses the reference bundle's vector geometry, including elliptical SVG arcs.
struct QelvoraGlyph: View {
    let name: String
    var size: CGFloat = QelvoraTokens.token("glyph-size")
    var color: Color? = nil
    var cutColor: Color? = nil
    @Environment(\.colorScheme) private var scheme
    private static let definitions: [String: GlyphDefinition] = {
        guard let url = Bundle.module.url(forResource: "Glyphs", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let definitions = try? JSONDecoder().decode([String: GlyphDefinition].self, from: data) else {
            preconditionFailure("The reference glyph resource is missing or invalid")
        }
        return definitions
    }()
    var body: some View {
        let definition = Self.definitions[name]!
        Canvas { context, _ in
            let viewportWidth = (size * definition.aspect).rounded()
            let scale = min(viewportWidth / definition.box[2], size / definition.box[3])
            context.translateBy(x: (viewportWidth - definition.box[2] * scale) / 2, y: (size - definition.box[3] * scale) / 2)
            context.scaleBy(x: scale, y: scale)
            for shape in definition.shapes {
                let path: Path
                switch shape.kind {
                case "circle":
                    let r = shape.r ?? 0
                    path = Path(ellipseIn: CGRect(x: (shape.cx ?? 0) - r, y: (shape.cy ?? 0) - r, width: r * 2, height: r * 2))
                case "rect":
                    path = Path(roundedRect: CGRect(x: shape.x ?? 0, y: shape.y ?? 0, width: shape.width ?? 0, height: shape.height ?? 0), cornerRadius: shape.rx ?? 0)
                case "path": path = SVGReferencePath.parse(shape.d ?? "")
                default: preconditionFailure("Unsupported reference glyph element")
                }
                if let fill = shape.fill, fill != "none" { context.fill(path, with: .color(resolve(fill))) }
                if let stroke = shape.stroke, stroke != "none" {
                    let dash = shape.strokeDasharray?.split(separator: " ").compactMap { Double($0).map { CGFloat($0) } } ?? []
                    context.stroke(path, with: .color(resolve(stroke)), style: StrokeStyle(lineWidth: shape.strokeWidth ?? 1, lineCap: shape.strokeLinecap == "round" ? .round : .butt, lineJoin: shape.strokeLinejoin == "round" ? .round : .miter, dash: dash))
                }
            }
        }.frame(width: (size * definition.aspect).rounded(), height: size).accessibilityHidden(true)
    }
    private func resolve(_ value: String) -> Color {
        if value == "currentColor" { return color ?? qColor("ink", scheme) }
        if value.hasPrefix("var(--") {
            let token = value.dropFirst(6).prefix { $0 != "," && $0 != ")" }
            if token == "qv-cut" { return cutColor ?? qColor("surface", scheme) }
            return qColor(String(token), scheme)
        }
        preconditionFailure("Reference glyph contains an unrecognized color")
    }
}

private enum SVGReferencePath {
    static func parse(_ source: String) -> Path {
        let pattern = #"[a-zA-Z]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?"#
        let regex = try! NSRegularExpression(pattern: pattern)
        let ns = source as NSString
        let tokens = regex.matches(in: source, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
        var index = 0; var command = ""; var previous = ""
        var current = CGPoint.zero; var start = CGPoint.zero; var control = CGPoint.zero
        var path = Path()
        func number() -> CGFloat { defer { index += 1 }; return CGFloat(Double(tokens[index])!) }
        func point(relative: Bool) -> CGPoint {
            let x = number(); let y = number()
            return CGPoint(x: x + (relative ? current.x : 0), y: y + (relative ? current.y : 0))
        }
        while index < tokens.count {
            if tokens[index].first!.isLetter { command = tokens[index]; index += 1 }
            let relative = command == command.lowercased()
            switch command.uppercased() {
            case "M":
                current = point(relative: relative); start = current; path.move(to: current)
                command = relative ? "l" : "L"
            case "L": current = point(relative: relative); path.addLine(to: current)
            case "H": current.x = number() + (relative ? current.x : 0); path.addLine(to: current)
            case "V": current.y = number() + (relative ? current.y : 0); path.addLine(to: current)
            case "C":
                let c1 = point(relative: relative); let c2 = point(relative: relative); let end = point(relative: relative)
                path.addCurve(to: end, control1: c1, control2: c2); control = c2; current = end
            case "S":
                let c1 = ["C", "S"].contains(previous.uppercased()) ? CGPoint(x: 2 * current.x - control.x, y: 2 * current.y - control.y) : current
                let c2 = point(relative: relative); let end = point(relative: relative)
                path.addCurve(to: end, control1: c1, control2: c2); control = c2; current = end
            case "Q":
                let c = point(relative: relative); let end = point(relative: relative)
                path.addQuadCurve(to: end, control: c); control = c; current = end
            case "T":
                let c = ["Q", "T"].contains(previous.uppercased()) ? CGPoint(x: 2 * current.x - control.x, y: 2 * current.y - control.y) : current
                let end = point(relative: relative); path.addQuadCurve(to: end, control: c); control = c; current = end
            case "A":
                let rx = number(); let ry = number(); let rotation = number(); let large = number() != 0; let sweep = number() != 0
                let end = point(relative: relative)
                addArc(to: &path, start: current, end: end, rx: rx, ry: ry, rotation: rotation, large: large, sweep: sweep)
                current = end
            case "Z": path.closeSubpath(); current = start; command = ""
            default: preconditionFailure("Unsupported reference SVG command")
            }
            previous = command
        }
        return path
    }
    private static func addArc(to path: inout Path, start: CGPoint, end: CGPoint, rx: CGFloat, ry: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool) {
        if start == end { return }
        var rx = abs(rx); var ry = abs(ry)
        if rx == 0 || ry == 0 { path.addLine(to: end); return }
        let phi = rotation * .pi / 180; let cosPhi = cos(phi); let sinPhi = sin(phi)
        let dx = (start.x - end.x) / 2; let dy = (start.y - end.y) / 2
        let x = cosPhi * dx + sinPhi * dy; let y = -sinPhi * dx + cosPhi * dy
        let scale = x * x / (rx * rx) + y * y / (ry * ry)
        if scale > 1 { rx *= sqrt(scale); ry *= sqrt(scale) }
        let numerator = max(0, rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x)
        let denominator = rx * rx * y * y + ry * ry * x * x
        let factor = (large == sweep ? CGFloat(-1) : 1) * sqrt(numerator / denominator)
        let cxLocal = factor * rx * y / ry; let cyLocal = -factor * ry * x / rx
        let cx = cosPhi * cxLocal - sinPhi * cyLocal + (start.x + end.x) / 2
        let cy = sinPhi * cxLocal + cosPhi * cyLocal + (start.y + end.y) / 2
        let begin = atan2((y - cyLocal) / ry, (x - cxLocal) / rx)
        var delta = atan2((-y - cyLocal) / ry, (-x - cxLocal) / rx) - begin
        if sweep && delta < 0 { delta += 2 * .pi }
        if !sweep && delta > 0 { delta -= 2 * .pi }
        let segments = max(1, Int(ceil(abs(delta) / (.pi / 2))))
        let step = delta / CGFloat(segments)
        func position(_ theta: CGFloat) -> CGPoint { CGPoint(x: cx + cosPhi * rx * cos(theta) - sinPhi * ry * sin(theta), y: cy + sinPhi * rx * cos(theta) + cosPhi * ry * sin(theta)) }
        func tangent(_ theta: CGFloat) -> CGPoint { CGPoint(x: -cosPhi * rx * sin(theta) - sinPhi * ry * cos(theta), y: -sinPhi * rx * sin(theta) + cosPhi * ry * cos(theta)) }
        for segment in 0..<segments {
            let a = begin + CGFloat(segment) * step; let b = a + step; let k = 4 / 3 * tan(step / 4)
            let p1 = position(a); let p2 = position(b); let t1 = tangent(a); let t2 = tangent(b)
            path.addCurve(to: segment == segments - 1 ? end : p2, control1: CGPoint(x: p1.x + k * t1.x, y: p1.y + k * t1.y), control2: CGPoint(x: p2.x - k * t2.x, y: p2.y - k * t2.y))
        }
    }
}
