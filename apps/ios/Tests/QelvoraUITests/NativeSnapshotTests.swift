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
    private var captureColorSpace: NSColorSpace {
      // All 110 original references have the same embedded profile. Use its
      // encoding metadata, never its pixels, so strict comparisons do not
      // inherit whichever display happens to be attached to the test host.
      let reference = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appendingPathComponent("__Snapshots__/NativeSnapshotTests/testWelcomeThemes.light.png")
      guard let data = try? Data(contentsOf: reference),
        let representation = NSBitmapImageRep(data: data)
      else { return .sRGB }
      return representation.colorSpace
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
      let colorSpace = captureColorSpace
      window.colorSpace = colorSpace
      window.contentView = host
      host.layoutSubtreeIfNeeded()
      if delay {
        try? await Task.sleep(for: .milliseconds(500))
        host.layoutSubtreeIfNeeded()
      }
      // The references use 2x pixels. CI's headless screen is 1x; letting
      // AppKit choose its bitmap size makes every reference incomparable.
      let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(size.width * 2),
        pixelsHigh: Int(size.height * 2), bitsPerSample: 8, samplesPerPixel: 4,
        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0
      )!.retagging(with: colorSpace)!
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
