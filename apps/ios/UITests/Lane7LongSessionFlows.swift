import XCTest

/// Opt-in, operated WP 7.4 P8 journeys (the 3-hour reminder) against lane 7's
/// fake API. The debug launch shortens the two durations: the reminder after
/// 20 s of counted time, a break from 6 s.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --long-session
@MainActor
final class Lane7LongSessionFlows: XCTestCase {
    private let app = XCUIApplication()
    private func thread(_ n: Int) -> String { "/threads/c1000000-0000-4000-8000-00000000000\(n)/f1000000-0000-4000-8000-000000000001" }
    private let arguments = ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US", "--harness-long-session", "20,6"]

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
        guard ProcessInfo.processInfo.environment["LANE7_LONG_SESSION"] == "1" else {
            throw XCTSkip("Opt in with LANE7_LONG_SESSION=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ n: Int) async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "devon", "--return-to", thread(n)]
        app.launch()
        app.launchArguments = arguments
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
    }
    /// Another thread, as a link from elsewhere opens it (the count keeps running).
    private func link(_ n: Int) async throws {
        try await control("/link", body: ["path": thread(n)], port: 56475)
        let open = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Open"]
        if open.waitForExistence(timeout: 3) { open.tap() }
    }
    private func line(_ name: String) -> String { "You've been talking with \(name)'s AI for a while. It's an AI, and it will be here when you're back." }
    private func count(_ name: String) -> Int { app.staticTexts.matching(NSPredicate(format: "label == %@", line(name))).count }
    private func until(_ timeout: Double, _ condition: () -> Bool) async throws -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end { if condition() { return true }; try await Task.sleep(for: .milliseconds(500)) }
        return condition()
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func background(_ seconds: Double) async throws {
        XCUIDevice.shared.press(.home)
        try await Task.sleep(for: .seconds(seconds))
        app.activate()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
    }

    /// P8.1: the line appears once at the first threshold, names the creator,
    /// blocks nothing, and appears again after the next one.
    func testT01OnceThenAgain() async throws {
        try await open(1)
        let first = try await until(45) { self.count("Maya") >= 1 }
        XCTAssertTrue(first, "the line after 20 s")
        XCTAssertEqual(count("Maya"), 1, "once")
        capture("T1-first")
        let editor = app.textViews["Message Maya's AI"]
        editor.tap(); editor.typeText("Still here")
        XCTAssertTrue(app.buttons["Send"].isEnabled, "it blocks nothing")
        let second = try await until(45) { self.count("Maya") >= 2 }
        XCTAssertTrue(second, "again after the next 20 s")
        XCTAssertEqual(count("Maya"), 2)
        capture("T1-second")
    }

    /// P8.2: moving to another creator's AI keeps counting; the line names the
    /// creator of the conversation open at that moment.
    func testT02AcrossCreators() async throws {
        try await open(1)
        try await Task.sleep(for: .seconds(12))
        XCTAssertEqual(count("Maya"), 0)
        try await link(4)
        XCTAssertTrue(app.staticTexts["Tomás Reyes"].waitForExistence(timeout: 30) || app.buttons["Ask Tomás Reyes to step in"].waitForExistence(timeout: 5))
        let shown = try await until(18) { self.count("Tomás Reyes") >= 1 }
        XCTAssertTrue(shown, "the count continued: the line well before a fresh 20 s")
        XCTAssertEqual(count("Maya"), 0)
        capture("T2-tomas")
    }

    /// P8.3: a break at least as long as the break duration starts the count again.
    func testT03LongBreakResets() async throws {
        try await open(1)
        try await Task.sleep(for: .seconds(14))
        try await background(9)
        let early = try await until(12) { self.count("Maya") >= 1 }
        XCTAssertFalse(early, "no line soon after a long break: the count started again")
        let later = try await until(30) { self.count("Maya") >= 1 }
        XCTAssertTrue(later, "a full 20 s after the break")
        capture("T3-after-reset")
    }

    /// P8.4: a short break keeps the count (and is not counted).
    func testT04ShortBreakKeeps() async throws {
        try await open(1)
        try await Task.sleep(for: .seconds(14))
        try await background(2)
        let shown = try await until(14) { self.count("Maya") >= 1 }
        XCTAssertTrue(shown, "the count kept: the line well before a fresh 20 s")
        capture("T4-kept")
    }

    /// P8.5: time while the creator is in the thread, or the AI is paused, does not count.
    func testT05CreatorHereOrPausedDoesNotCount() async throws {
        try await open(2)
        let human = try await until(28) { self.count("Kiln Club") >= 1 }
        XCTAssertFalse(human, "no line while Kiln Club is in the thread")
        try await open(3)
        let paused = try await until(28) { self.count("Glazeco") >= 1 }
        XCTAssertFalse(paused, "no line while Glazeco's AI is paused")
        capture("T5-paused")
    }
}
