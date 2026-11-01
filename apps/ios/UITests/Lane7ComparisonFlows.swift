import XCTest

/// Opt-in, operated WP 7.4 P11 journeys (no comparison placeholder) against
/// lane 7's fake API, in Devon's thread with Tomás Reyes.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --comparison
@MainActor
final class Lane7ComparisonFlows: XCTestCase {
    private let app = XCUIApplication()
    private let thread = "/threads/c1000000-0000-4000-8000-000000000004/f1000000-0000-4000-8000-000000000001"
    private let placeholder = "not available yet"
    private func arguments() -> [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

    @discardableResult
    private func control(_ path: String, body: [String: Any]? = nil) async throws -> Any {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:56473\(path)")!)
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
        guard ProcessInfo.processInfo.environment["LANE7_COMPARISON"] == "1" else {
            throw XCTSkip("Opt in with LANE7_COMPARISON=1 against lane 7's disposable harness.")
        }
    }

    /// Devon's thread with Tomás Reyes, with comparisons on or off, after the
    /// app has asked for the capabilities.
    private func open(comparisons: Bool) async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/flags", body: ["comparisonsAvailable": comparisons])
        try await control("/__harness/log/clear", body: [:])
        app.launchArguments = arguments() + ["--harness-reset", "--harness-actor", "devon", "--return-to", thread]
        app.launch()
        app.launchArguments = arguments()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        try await requested("GET", "/v1/conversations/capabilities")
    }

    /// Waits until the app's request is in the harness log.
    private func requested(_ method: String, _ path: String, status: Int? = nil) async throws {
        for _ in 0..<60 {
            let log = try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
            if log.contains(where: { ($0["client"] as? String) == "ios" && ($0["method"] as? String) == method && ($0["path"] as? String)?.hasSuffix(path) == true && (status == nil || ($0["status"] as? Int) == status) }) { return }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTFail("no \(method) \(path) from the app")
    }

    private func text(_ label: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func any(_ contains: String) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", contains)).count > 0
    }
    private func gone(_ element: XCUIElement, timeout: Double = 15) async throws -> Bool {
        for _ in 0..<Int(timeout * 4) { if !element.exists { return true }; try await Task.sleep(for: .milliseconds(250)) }
        return !element.exists
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    /// Scrolls the open sheet with slow drags until the element can be tapped.
    private func reveal(_ element: XCUIElement) {
        let origin = app.coordinate(withNormalizedOffset: .zero), frame = app.frame
        for _ in 0..<12 where !(element.exists && element.isHittable) {
            origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.7))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.4)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
    }
    private func privacy() {
        app.buttons["Me and privacy"].tap()
        let providers = text("AI providers")
        XCTAssertTrue(providers.waitForExistence(timeout: 30))
        reveal(providers)
    }

    /// P11.1: comparisons off (the launch setting): no options button on the
    /// question, and Me and privacy has no comparison section and no placeholder.
    func testK01OffSaysNothing() async throws {
        try await open(comparisons: false)
        XCTAssertFalse(app.buttons["AI comparison options"].exists, "no options button")
        privacy()
        XCTAssertFalse(text("AI comparisons").exists, "no section heading")
        XCTAssertFalse(any(placeholder), "no placeholder")
        XCTAssertTrue(text("AI providers").isHittable)
        capture("K1-privacy-off")
    }

    /// P11.2: the choice is open from a question when comparisons turn off; the
    /// next action is refused by the server, the choice closes and nothing is said.
    func testK02QuestionChoiceClosesWhenTurnedOff() async throws {
        try await open(comparisons: true)
        let options = app.buttons["AI comparison options"]
        XCTAssertTrue(options.waitForExistence(timeout: 20))
        options.tap()
        let allow = app.buttons["Allow questions for AI comparisons"]
        XCTAssertTrue(allow.waitForExistence(timeout: 20))
        XCTAssertTrue(text("Off · optional").exists)
        capture("K2-choice-open")
        try await control("/__harness/flags", body: ["comparisonsAvailable": false])
        allow.tap()
        try await requested("POST", "/comparison-consent", status: 403)
        let gone = try await gone(text("Your question"))
        XCTAssertTrue(gone, "the choice closed")
        XCTAssertFalse(any(placeholder), "no placeholder")
        XCTAssertFalse(app.buttons["AI comparison options"].exists, "no options button")
        XCTAssertTrue(app.buttons["Me and privacy"].exists, "back in the thread")
        capture("K2-closed")
    }

    /// P11.3: Me and privacy with comparisons on shows the choice; turned off,
    /// the next action is refused and the section leaves without a word.
    func testK03PrivacySectionLeavesOnRefusal() async throws {
        try await open(comparisons: true)
        privacy()
        let allow = app.buttons["Allow questions for AI comparisons"]
        XCTAssertTrue(allow.waitForExistence(timeout: 20))
        reveal(allow)
        XCTAssertTrue(text("AI comparisons").exists)
        capture("K3-section-on")
        try await control("/__harness/flags", body: ["comparisonsAvailable": false])
        allow.tap()
        try await requested("POST", "/comparison-consent", status: 403)
        let gone = try await gone(text("AI comparisons"))
        XCTAssertTrue(gone, "the section left")
        XCTAssertFalse(allow.exists)
        XCTAssertFalse(any(placeholder), "no placeholder")
        XCTAssertTrue(text("AI providers").exists)
        capture("K3-section-off")
    }

    /// P11.4: turned off while the app is in the background: back in front, Me
    /// and privacy refreshes and the section is gone, with no placeholder.
    func testK04PrivacyRefreshAfterBackground() async throws {
        try await open(comparisons: true)
        privacy()
        XCTAssertTrue(app.buttons["Allow questions for AI comparisons"].waitForExistence(timeout: 20))
        try await control("/__harness/flags", body: ["comparisonsAvailable": false])
        XCUIDevice.shared.press(.home)
        try await Task.sleep(for: .seconds(2))
        app.activate()
        let gone = try await gone(text("AI comparisons"), timeout: 30)
        XCTAssertTrue(gone, "the section left")
        XCTAssertTrue(text("AI providers").waitForExistence(timeout: 30))
        XCTAssertFalse(any(placeholder), "no placeholder")
        capture("K4-after-background")
    }
}
