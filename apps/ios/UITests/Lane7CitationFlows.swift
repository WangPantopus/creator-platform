import XCTest

/// Opt-in, operated WP 7.4 P4 journeys (citations in Maya's thread) against
/// lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --citations
@MainActor
final class Lane7CitationFlows: XCTestCase {
    private let app = XCUIApplication()
    private let thread = "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001"
    private let draft = "Kept draft about the glaze"
    private var arguments: [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

    private func control(_ path: String, body: [String: Any]) async throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:56473\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, path)
    }

    private var chip: XCUIElement { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Read the original passage")).firstMatch }

    /// Maya's thread with a draft typed, a citation on screen.
    private func open() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_CITATIONS"] == "1" else {
            throw XCTSkip("Opt in with LANE7_CITATIONS=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/faults", body: ["rules": []])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "devon", "--return-to", thread]
        app.launch()
        app.launchArguments = arguments
        let editor = app.textViews["Message Maya's AI"]
        XCTAssertTrue(editor.waitForExistence(timeout: 30))
        editor.tap(); editor.typeText(draft)
        // Slow drags reveal older rows and let the keyboard go. Fast swipes right
        // after typing can freeze this thread on iOS (see the P4 findings).
        // Every row exists (a plain stack); the chip must be on screen to tap.
        for _ in 0..<20 where !(chip.exists && chip.isHittable) { dragOlder() }
        XCTAssertTrue(chip.isHittable, "a citation on screen")
    }

    private func dragOlder() {
        let area = app.scrollViews.firstMatch.frame
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: area.midX, dy: area.minY + area.height * 0.3))
            .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: area.midX, dy: area.minY + area.height * 0.75)), withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    /// The thread is still there, with its rows and its draft. (The step-in
    /// button hides while the message box has focus, so it is not the test.)
    private func threadKept(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(app.staticTexts["Conversation unavailable"].exists, "the thread stays", file: file, line: line)
        // iOS gives the message box its focus back after an alert, which scrolls
        // to the newest row; any row's Report link shows the rows are there.
        XCTAssertTrue(app.buttons["Report"].firstMatch.exists, "its rows stay", file: file, line: line)
        XCTAssertEqual(app.textViews["Message Maya's AI"].value as? String, draft, "the draft stays", file: file, line: line)
    }

    private func refused(_ status: Int, _ code: String, _ name: String) async throws {
        try await open()
        try await control("/__harness/faults", body: ["rules": [["match": "/citations/", "status": status, "code": code, "message": "No longer accessible to you"]]])
        chip.tap()
        let alert = app.alerts["Source unavailable"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "the refusal is said")
        XCTAssertTrue(alert.staticTexts["No longer accessible to you"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
        alert.buttons["Close"].tap()
        try await Task.sleep(for: .seconds(1.5))
        let after = XCTAttachment(screenshot: app.screenshot()); after.name = name + "-after-close"; after.lifetime = .keepAlways; add(after)
        threadKept()
    }

    /// P4.1: a citation opens its passage; closing returns to the thread.
    func testP01PassageOpens() async throws {
        try await open()
        chip.tap()
        XCTAssertTrue(app.staticTexts["Why celadon pinholes"].waitForExistence(timeout: 15), "the passage")
        XCTAssertTrue(app.staticTexts["Original source"].exists)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "P1-passage"; shot.lifetime = .keepAlways; add(shot)
        app.swipeDown(velocity: .fast) // dismiss the sheet (the thread is not scrolled)
        XCTAssertTrue(app.staticTexts["Why celadon pinholes"].waitForNonExistence(timeout: 10))
        threadKept()
    }

    /// P4.2: the real refusal for a passage that is no longer readable (403).
    func testP02RefusedPassage() async throws { try await refused(403, "citation_unavailable", "P2-refused") }

    /// P4.3: a missing passage (404) is said the same way.
    func testP03MissingPassage() async throws { try await refused(404, "not_found", "P3-missing") }
}
