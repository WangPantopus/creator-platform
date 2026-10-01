#if os(macOS)
  import AppKit
  import SnapshotTesting
  import SwiftUI
  import XCTest
  @testable import QelvoraUI

  @MainActor
  final class NativeSnapshotTests: XCTestCase {
    private let size = CGSize(width: 390, height: 844)
    private var record: Bool {
      ProcessInfo.processInfo.environment["RECORD_NATIVE_SNAPSHOTS"] == "true"
    }

    func testWelcomeThemes() async {
      for (name, scheme) in [("light", ColorScheme.light), ("night", ColorScheme.dark)] {
        await capture(Welcome().environment(\.colorScheme, scheme), name: name)
      }
    }

    func testAuthorIdentitySurfaces() async {
      for (name, scheme) in [("light", ColorScheme.light), ("night", ColorScheme.dark)] {
        let view = VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
          IdentityStrip(state: .ai)
          Message(
            kind: .ai, children: "Maya's AI answers from her approved sources.", actions: false)
          Message(
            kind: .humanCreator, children: "Single dip, count to three, and let it drip off.",
            live: true)
          Message(
            kind: .approvedDraft, children: "Thin the glaze before dipping the next tile.",
            actions: false)
          Message(kind: .team, children: "Your workshop seat is confirmed.")
          Note(children: "The studio opens again on Monday.", reply: false)
        }.padding(QelvoraTokens.space4).frame(
          maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading
        )
        .background(QelvoraTokens.color("ground", theme: scheme == .dark ? .night : .light))
        .environment(\.colorScheme, scheme)
        await capture(view, name: name)
      }
    }

    func testComponentCatalogThemes() async {
      for (theme, scheme) in [("light", ColorScheme.light), ("night", ColorScheme.dark)] {
        for component in NativeComponentRegistry.implemented {
          if component == "Skeleton" {
            let visible = VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
              Text("Skeleton").qText("display-md")
              SkeletonShape()
              SkeletonShape(kind: .row)
            }.padding(QelvoraTokens.space4).frame(
              maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading
            )
            .background(QelvoraTokens.color("ground", theme: scheme == .dark ? .night : .light))
            .environment(\.colorScheme, scheme)
            await capture(visible, name: "\(component).\(theme)")
            continue
          }
          await capture(
            NativeFoundationCatalog(component: component).environment(\.colorScheme, scheme),
            name: "\(component).\(theme)", delay: component == "Skeleton")
        }
      }
    }

    private func capture(
      _ view: some View, name: String, delay: Bool = false, file: StaticString = #filePath,
      testName: String = #function, line: UInt = #line
    ) async {
      _ = NSApplication.shared
      QelvoraFonts.register()
      let window = NSWindow(
        contentRect: NSRect(origin: .zero, size: size), styleMask: .borderless,
        backing: .buffered, defer: false)
      window.colorSpace = .sRGB
      window.isReleasedWhenClosed = false
      // Scale the SwiftUI graph before its layers are cached. Changing only
      // AppKit frame/bounds enlarges the headless display's cached 1x text.
      let captureScale = 2 / window.backingScaleFactor
      let canvas = CGSize(width: size.width * captureScale, height: size.height * captureScale)
      let host = NSHostingView(
        rootView: view.environment(\.displayScale, 2)
          .transaction { $0.disablesAnimations = true }.frame(
            width: size.width, height: size.height)
          .scaleEffect(captureScale, anchor: .topLeading)
          .frame(width: canvas.width, height: canvas.height, alignment: .topLeading))
      host.frame = NSRect(origin: .zero, size: canvas)
      window.setContentSize(canvas)
      window.contentView = host
      defer {
        window.contentView = nil
        window.close()
      }
      host.layoutSubtreeIfNeeded()
      if delay {
        try? await Task.sleep(for: .milliseconds(500))
        host.layoutSubtreeIfNeeded()
      }
      func prepareLayer(_ layer: CALayer) {
        layer.contentsScale = 2
        layer.rasterizationScale = 2
        layer.setNeedsDisplay()
        for child in layer.sublayers ?? [] { prepareLayer(child) }
        if let mask = layer.mask { prepareLayer(mask) }
        layer.displayIfNeeded()
      }
      if let layer = host.layer { prepareLayer(layer) }
      print("Native capture \(testName)/\(name): backing=\(window.backingScaleFactor), canvas=\(canvas), logical=\(size)")
      // Match the existing 2x references independently of a runner's attached display.
      guard let context = CGContext(
        data: nil, width: Int(size.width * 2), height: Int(size.height * 2),
        bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ), let pixels = context.makeImage() else {
        XCTFail("Snapshot bitmap could not be allocated.", file: file, line: line)
        return
      }
      let bitmap = NSBitmapImageRep(cgImage: pixels)
      bitmap.size = canvas
      host.cacheDisplay(in: host.bounds, to: bitmap)
      bitmap.size = size
      let snapshot = NSImage(size: size)
      snapshot.addRepresentation(bitmap)
      assertSnapshot(
        of: snapshot, as: .image, named: name, record: record, file: file,
        testName: testName, line: line)
    }
  }
#endif
