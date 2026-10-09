// Prints the text on a screenshot, one line per recognised line, so a scenario
// can check what an iOS screen says (Android has uiautomator for this).
//   swift tests/scenarios/lane-7/ocr.swift shot.png
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2,
      let image = (NSImage(contentsOfFile: CommandLine.arguments[1]))?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write(Data("Usage: ocr.swift <image.png>\n".utf8))
    exit(64)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: image).perform([request])
for observation in request.results ?? [] {
    if let line = observation.topCandidates(1).first?.string { print(line) }
}
