#if os(macOS)
  import AppKit
  import SnapshotTesting
  import SwiftUI
  import XCTest
  @testable import QelvoraUI

  @MainActor
  private final class ReferenceWindow: NSWindow {
    var referenceScale: CGFloat = 2
    override var backingScaleFactor: CGFloat { referenceScale }
  }

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
      // AppKit otherwise captures in the attached monitor's ICC profile. The
      // references were recorded on an LG display; CI and other Macs have a
      // different monitor. Render in the reference's declared space so the
      // comparison measures UI changes rather than display calibration.
      let referenceURL = URL(fileURLWithPath: String(describing: file))
        .deletingLastPathComponent().appendingPathComponent("__Snapshots__/NativeSnapshotTests")
        .appendingPathComponent("\(testName.replacingOccurrences(of: "()", with: "")).\(name.replacingOccurrences(of: ".", with: "-")).png")
      let referenceBitmap = NSImage(contentsOf: referenceURL)?.representations
        .compactMap { $0 as? NSBitmapImageRep }.first
      let displayScale = CGFloat(referenceBitmap?.pixelsWide ?? Int(size.width * 2)) / size.width
      let host = NSHostingView(
        rootView: view.environment(\.displayScale, displayScale)
          .transaction { $0.disablesAnimations = true }.frame(
            width: size.width, height: size.height))
      host.frame = NSRect(origin: .zero, size: size)
      let window = ReferenceWindow(
        contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
      window.referenceScale = displayScale
      window.colorSpace = referenceBitmap?.colorSpace ?? .sRGB
      window.appearance = NSAppearance(named: name.hasSuffix("night") ? .darkAqua : .aqua)
      window.contentView = host
      host.viewDidChangeBackingProperties()
      host.layoutSubtreeIfNeeded()
      // The destination bitmap alone does not change SwiftUI/Core Animation's
      // backing store. A 1x layer would otherwise be enlarged into a 2x PNG.
      func configureScale(_ layer: CALayer) {
        layer.contentsScale = displayScale
        layer.rasterizationScale = displayScale
        layer.setNeedsDisplay()
        layer.sublayers?.forEach(configureScale)
      }
      if let layer = host.layer { configureScale(layer) }
      if delay {
        try? await Task.sleep(for: .milliseconds(500))
        host.layoutSubtreeIfNeeded()
      }
      // Headless CI uses a 1x virtual display, while references are 2x. Draw
      // directly at reference resolution; never resize an already-rendered PNG.
      let pixelsWide = referenceBitmap?.pixelsWide ?? Int(size.width * 2)
      let pixelsHigh = referenceBitmap?.pixelsHigh ?? Int(size.height * 2)
      guard let rawBitmap = NSBitmapImageRep(bitmapDataPlanes: nil,
        pixelsWide: pixelsWide, pixelsHigh: pixelsHigh, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: pixelsWide * 4, bitsPerPixel: 32),
        let bitmap = rawBitmap.retagging(with: window.colorSpace ?? .sRGB) else {
        XCTFail("Cannot create the reference-resolution native bitmap")
        return
      }
      bitmap.size = size
      host.cacheDisplay(in: host.bounds, to: bitmap)
      let image = NSImage(size: size)
      image.addRepresentation(bitmap)
      assertSnapshot(
        of: image, as: .image, named: name, record: record, file: file,
        testName: testName, line: line)
      window.contentView = nil
    }
  }
#endif
