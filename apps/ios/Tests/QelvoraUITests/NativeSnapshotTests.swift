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
      let host = NSHostingView(
        rootView: view.transaction { $0.disablesAnimations = true }.frame(
          width: size.width, height: size.height))
      host.frame = NSRect(origin: .zero, size: size)
      let window = NSWindow(
        contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
      // Keep capture independent of the attached display's calibration.
      window.colorSpace = .sRGB
      window.contentView = host
      host.layoutSubtreeIfNeeded()
      if delay {
        try? await Task.sleep(for: .milliseconds(500))
        host.layoutSubtreeIfNeeded()
      }
      // W4's published capture correction: references contain 2x pixels,
      // whereas a headless CI display is 1x. Render into a fixed-resolution
      // bitmap instead of resizing a lower-resolution capture afterward.
      let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(size.width * 2),
        pixelsHigh: Int(size.height * 2), bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
      )!.retagging(with: .sRGB)!
      bitmap.size = size
      host.cacheDisplay(in: host.bounds, to: bitmap)
      let rendered = NSImage(size: size)
      rendered.addRepresentation(bitmap)
      var imageStrategy = Snapshotting<NSImage, NSImage>.image
      let compare = imageStrategy.diffing.diffV2
      imageStrategy.diffing.diffV2 = { reference, rendered in
        // References contain the original monitor's ICC profile. Compare both
        // in sRGB so display calibration cannot change the pixel contract.
        func canonical(_ image: NSImage) -> CGContext {
          guard let source = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
            let space = CGColorSpace(name: CGColorSpace.sRGB),
            let pixels = CGContext(
              data: nil, width: source.width, height: source.height, bitsPerComponent: 8,
              bytesPerRow: 0, space: space,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
          else { preconditionFailure("Snapshot image could not be color-normalized") }
          pixels.interpolationQuality = .none
          pixels.draw(source, in: CGRect(x: 0, y: 0, width: source.width, height: source.height))
          return pixels
        }
        let expected = canonical(reference), actual = canonical(rendered)
        let expectedImage = NSImage(cgImage: expected.makeImage()!, size: reference.size)
        let actualImage = NSImage(cgImage: actual.makeImage()!, size: rendered.size)
        guard expected.width == actual.width, expected.height == actual.height else {
          return compare(expectedImage, actualImage)
        }
        // Color-profile rounding and native blur/text rasterization vary across
        // macOS hosts. Require 99.85% of decoded sRGB pixels to match within eight
        // channel units; retain exact dimensions and original failure images.
        // Byte comparison avoids Core Image's host-dependent dark-color Delta E.
        let a = expected.data!.assumingMemoryBound(to: UInt8.self)
        let b = actual.data!.assumingMemoryBound(to: UInt8.self)
        var different = 0
        for y in 0..<expected.height {
          var x = 0
          while x < expected.width {
            let left = y * expected.bytesPerRow + x * 4
            let right = y * actual.bytesPerRow + x * 4
            if abs(Int(a[left]) - Int(b[right])) > 8
              || abs(Int(a[left + 1]) - Int(b[right + 1])) > 8
              || abs(Int(a[left + 2]) - Int(b[right + 2])) > 8
              || abs(Int(a[left + 3]) - Int(b[right + 3])) > 8 {
              different += 1
            }
            x += 1
          }
        }
        if Double(different) / Double(expected.width * expected.height) <= 0.0015 { return nil }
        guard let failure = compare(expectedImage, actualImage) else { return nil }
        return ("\(different) pixels exceed the native sRGB rounding bound. " + failure.0, failure.1)
      }
      assertSnapshot(
        of: rendered, as: imageStrategy, named: name, record: record, file: file,
        testName: testName, line: line)
      window.contentView = nil
    }
  }
#endif
