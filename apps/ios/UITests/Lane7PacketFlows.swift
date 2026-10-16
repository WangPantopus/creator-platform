import XCTest

/// Opt-in, operated WP 7.4 P9 journeys (the packet's terms block, in the
/// approved wording) against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --packet
@MainActor
final class Lane7PacketFlows: XCTestCase {
    private let app = XCUIApplication()
    private func arguments(_ appearance: String) -> [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", appearance, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

    @discardableResult
    private func control(_ path: String, body: [String: Any]? = nil, port: Int = 56473) async throws -> Any {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, path)
        return try JSONSerialization.jsonObject(with: data)
    }

    /// Every flow skips before it calls anything: CI runs this target with no
    /// harness and no link driver.
    private func optIn() throws {
        guard ProcessInfo.processInfo.environment["LANE7_PACKET"] == "1" else {
            throw XCTSkip("Opt in with LANE7_PACKET=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ n: Int, appearance: String = "light") async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        app.launchArguments = arguments(appearance) + ["--harness-reset", "--harness-actor", "devon", "--return-to", "/commerce/packet?creatorId=c1000000-0000-4000-8000-00000000000\(n)"]
        app.launch()
        app.launchArguments = arguments(appearance)
        XCTAssertTrue(app.staticTexts["Included in your request"].waitForExistence(timeout: 30))
    }
    private func text(_ label: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func any(_ contains: String) -> Bool { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", contains)).count > 0 }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func reveal(_ element: XCUIElement) {
        let origin = app.coordinate(withNormalizedOffset: .zero), frame = app.frame
        for _ in 0..<12 where !(element.exists && element.isHittable) {
            origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.7))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.45)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
    }
    private func choose(_ mode: String) {
        let item = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", mode)).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: 30), mode)
        reveal(item); item.tap()
    }
    /// The block for one creator: both rows, the rule and the hold, never "she".
    private func terms(_ name: String, _ price: String, _ hours: Int) {
        let rule = text("Charged only when \(name) accepts. If \(name) declines or \(hours) h pass, nothing is charged.")
        XCTAssertTrue(rule.waitForExistence(timeout: 20), "the charge rule names \(name)")
        reveal(rule)
        XCTAssertTrue(text("IF \(name.uppercased()) ACCEPTS").exists)
        XCTAssertTrue(text(price).exists)
        XCTAssertTrue(text("IF \(name.uppercased()) DECLINES OR \(hours) H PASS").exists)
        XCTAssertTrue(text("Your bank may show a pending hold for a few days.").exists)
        XCTAssertFalse(any("she declines"), "never \"she\"")
        XCTAssertFalse(any("usually decides"), "no ETA line while the summary has none")
    }

    /// P9.1: no terms before a mode is chosen; Maya's written reply: the terms
    /// in the approved wording, the decision time as the deadline.
    func testM01MayaWrittenReply() async throws {
        try await open(1)
        XCTAssertFalse(any("Charged only when"), "no terms before a choice")
        choose("Written reply")
        terms("Maya", "$25.00", 48)
        capture("M1-maya-terms")
    }

    /// P9.2: Kiln Club's voice note: the creator's own name and deadline.
    func testM02KilnClubVoiceNote() async throws {
        try await open(2)
        choose("Voice note")
        terms("Kiln Club", "$15.00", 72)
        capture("M2-kiln-terms")
    }

    /// P9.3: largest text, Night: the block wraps and stays whole.
    func testM03LargestTextNight() async throws {
        try optIn()
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await open(1, appearance: "night")
        choose("Written reply")
        terms("Maya", "$25.00", 48)
        capture("M3-largest-night")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
