import AppKit
import QelvoraUI
import SwiftUI

@MainActor
func render(_ view: some View, name: String, directory: URL) throws {
    let width = QelvoraTokens.token("phone-width"), height = QelvoraTokens.token("phone-height")
    let host = NSHostingView(rootView: view.frame(width: width, height: height))
    host.frame = NSRect(x: 0, y: 0, width: width, height: height)
    let window = NSWindow(contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
    window.contentView = host
    host.layoutSubtreeIfNeeded()
    guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { throw NSError(domain: "QelvoraSnapshot", code: 1) }
    host.cacheDisplay(in: host.bounds, to: bitmap)
    guard let source = bitmap.cgImage,
          let pixels = CGContext(data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { throw NSError(domain: "QelvoraSnapshot", code: 2) }
    pixels.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let normalized = pixels.makeImage(), let data = NSBitmapImageRep(cgImage: normalized).representation(using: .png, properties: [:]) else { throw NSError(domain: "QelvoraSnapshot", code: 3) }
    try data.write(to: directory.appendingPathComponent(name + ".png"))
}

@MainActor
func main() throws {
    _ = NSApplication.shared
    QelvoraFonts.register()
    let directory = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "../../artifacts/native/ios")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try render(Welcome().environment(\.colorScheme, .light), name: "Welcome-light", directory: directory)
    try render(Welcome().environment(\.colorScheme, .dark), name: "Welcome-night", directory: directory)
    try render(NativeFoundationCatalog().environment(\.colorScheme, .light), name: "Catalog-light", directory: directory)
    try render(NativeFoundationCatalog().environment(\.colorScheme, .dark), name: "Catalog-night", directory: directory)
    for component in NativeComponentRegistry.implemented {
        try render(NativeFoundationCatalog(component: component).environment(\.colorScheme, .light), name: component + "-light", directory: directory)
        try render(NativeFoundationCatalog(component: component).environment(\.colorScheme, .dark), name: component + "-night", directory: directory)
    }
    print("Rendered SwiftUI foundation snapshots to \(directory.path)")
}

try main()
