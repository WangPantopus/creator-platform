import Foundation
import CoreGraphics
import CoreText

/// Local, paged rendering of an already permitted immutable reply. The caller
/// rechecks the complete export after rendering and before opening the sheet.
struct GrowthReplyDocument: Identifiable, Sendable {
  private static let renderLock = NSLock()
  private static let cacheLimit = 128 * 1024 * 1024
  let source: GrowthReplyExport
  let file: URL
  var id: String { file.lastPathComponent }

  func remove() { try? FileManager.default.removeItem(at: file) }

  static func create(_ source: GrowthReplyExport) throws -> GrowthReplyDocument {
    guard renderLock.try() else { throw GrowthRequestFailure(status: 503) }
    defer { renderLock.unlock() }
    guard UUID(uuidString: source.id) != nil,
      (1...9_007_199_254_740_991).contains(source.version),
      !source.text.isEmpty, source.text.utf16.count <= 128000,
      !source.authorLabel.isEmpty, source.authorLabel.utf16.count <= 512,
      source.sourceHash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
      source.verificationURL.utf16.count <= 2048,
      ["human_creator", "approved_draft"].contains(source.authorKind),
      let verification = URL(string: source.verificationURL), verification.scheme == "https",
      verification.host != nil, verification.user == nil, verification.password == nil,
      verification.path == "/share/" + source.id, verification.query == nil,
      verification.fragment == nil
    else { throw GrowthRequestFailure(status: 410) }
    try Task.checkCancellation()
    let manager = FileManager.default
    let directory = try manager.url(for: .cachesDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true).appendingPathComponent("growth-replies", isDirectory: true)
    try manager.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
    let existing = try manager.contentsOfDirectory(at: directory,
      includingPropertiesForKeys: [.contentModificationDateKey])
    for old in existing {
      if let modified = try old.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
        modified < Date().addingTimeInterval(-86400) { try manager.removeItem(at: old) }
    }
    let retained = try manager.contentsOfDirectory(at: directory,
      includingPropertiesForKeys: [.fileSizeKey])
    let used = try retained.reduce(0) { total, file in
      total + (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0)
    }
    guard retained.count < 32, used < cacheLimit else {
      throw GrowthRequestFailure(status: 503)
    }
    let remaining = cacheLimit - used
    let file = directory.appendingPathComponent("reply-v\(source.version)-\(UUID().uuidString.lowercased()).pdf")
    var complete = false
    defer { if !complete { try? manager.removeItem(at: file) } }
    var page = CGRect(x: 0, y: 0, width: 390, height: 844)
    guard let consumer = CGDataConsumer(url: file as CFURL),
      let context = CGContext(consumer: consumer, mediaBox: &page, nil)
    else { throw GrowthRequestFailure(status: 503) }
    var closed = false
    defer { if !closed { context.closePDF() } }
    try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    #if os(iOS)
    try manager.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: file.path)
    #endif
    let approved = source.authorKind == "approved_draft"
    let background = color(approved ? "ai-surface" : "maya-surface")
    let ink = color(approved ? "ai-ink" : "on-maya")
    let width: CGFloat = 358
    func styled(_ text: String, _ name: String) -> NSAttributedString {
      let style = QelvoraTokens.textStyles[name]!
      var height = style.lineHeight
      let paragraph = withUnsafePointer(to: &height) { pointer in
        let settings = [
          CTParagraphStyleSetting(spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: pointer),
          CTParagraphStyleSetting(spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: pointer),
        ]
        return settings.withUnsafeBufferPointer { CTParagraphStyleCreate($0.baseAddress, $0.count) }
      }
      return NSAttributedString(string: text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): QelvoraFonts.coreText(style.family, size: style.size, weight: style.weight),
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): ink,
        NSAttributedString.Key(kCTParagraphStyleAttributeName as String): paragraph,
      ])
    }
    let header = CTFramesetterCreateWithAttributedString(styled(source.authorLabel, "label") as CFAttributedString)
    let footerText = QelvoraCopy.text("growthVerifyThisImmutableVersion", values: [
      "value1": String(source.version), "value2": source.verificationURL,
    ])
    let footer = CTFramesetterCreateWithAttributedString(styled(footerText, "caption") as CFAttributedString)
    func height(_ framesetter: CTFramesetter) -> CGFloat {
      ceil(CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(location: 0, length: 0),
        nil, CGSize(width: width, height: .greatestFiniteMagnitude), nil).height) + 4
    }
    let headerHeight = height(header), footerHeight = height(footer)
    let headerBox = CGRect(x: 16, y: page.height - 16 - headerHeight, width: width, height: headerHeight)
    let footerBox = CGRect(x: 16, y: 16, width: width, height: footerHeight)
    let bodyBox = CGRect(x: 16, y: footerBox.maxY + 16, width: width,
      height: headerBox.minY - footerBox.maxY - 32)
    guard bodyBox.height >= 96 else { throw GrowthRequestFailure(status: 503) }
    let body = CTFramesetterCreateWithAttributedString(styled(source.text, approved ? "body" : "voice-md") as CFAttributedString)
    let length = source.text.utf16.count
    var position = 0, pages = 0
    repeat {
      try Task.checkCancellation()
      guard pages < 8192 else { throw GrowthRequestFailure(status: 503) }
      let frame = CTFramesetterCreateFrame(body, CFRange(location: position, length: 0),
        CGPath(rect: bodyBox, transform: nil), nil)
      let visible = CTFrameGetVisibleStringRange(frame)
      guard visible.length > 0 || length == 0 else { throw GrowthRequestFailure(status: 503) }
      context.beginPDFPage(nil)
      context.setFillColor(background)
      context.fill(page)
      context.textMatrix = .identity
      CTFrameDraw(CTFramesetterCreateFrame(header, CFRange(location: 0, length: 0),
        CGPath(rect: headerBox, transform: nil), nil), context)
      CTFrameDraw(frame, context)
      CTFrameDraw(CTFramesetterCreateFrame(footer, CFRange(location: 0, length: 0),
        CGPath(rect: footerBox, transform: nil), nil), context)
      context.setURL(verification as CFURL, for: footerBox)
      context.endPDFPage()
      position += visible.length
      pages += 1
      let bytes = (try manager.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
      guard bytes <= remaining else { throw GrowthRequestFailure(status: 503) }
    } while position < length
    try Task.checkCancellation()
    context.closePDF()
    closed = true
    let bytes = (try manager.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.intValue ?? 0
    guard bytes <= remaining else { throw GrowthRequestFailure(status: 503) }
    complete = true
    return GrowthReplyDocument(source: source, file: file)
  }

  private static func color(_ token: String) -> CGColor {
    let hex = QelvoraTokens.colors[.light]![token]!.dropFirst()
    let value = UInt32(hex, radix: 16)!
    return CGColor(srgbRed: CGFloat((value >> 16) & 255) / 255,
      green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
  }
}
