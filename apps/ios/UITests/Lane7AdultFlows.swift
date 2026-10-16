import XCTest

/// Opt-in, operated WP 7.4 P7 journeys (the designed under-18 state, D-11)
/// against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --adults
@MainActor
final class Lane7AdultFlows: XCTestCase {
    private let app = XCUIApplication()
    private let title = "This app is for adults"
    private let body = "This app is available to adults aged 18 and over."
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

    private func launch(_ extra: [String], appearance: String = "light") async throws {
        guard ProcessInfo.processInfo.environment["LANE7_ADULTS"] == "1" else {
            throw XCTSkip("Opt in with LANE7_ADULTS=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        app.launchArguments = arguments(appearance) + extra
        app.launch()
        app.launchArguments = arguments(appearance)
    }

    private func label(_ text: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", text)).firstMatch }

    /// The adults-only state and nothing else: no retry, help, sign-in or tabs.
    private func onlyAdultsState(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(label(title).waitForExistence(timeout: 20), "the title", file: file, line: line)
        XCTAssertTrue(label(body).exists, "the body", file: file, line: line)
        for extra in ["Retry", "Crisis help", "Continue with Pantopus", "Home", "Discover"] {
            XCTAssertFalse(app.buttons[extra].exists, "also shown: \(extra)", file: file, line: line)
        }
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "session is kept")).firstMatch.exists, file: file, line: line)
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func log() async throws -> [[String: Any]] {
        try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
    }

    /// Devon signed in on Home, then flagged under 18 (an ops review).
    private func flagged(appearance: String = "light") async throws {
        try await control("/__harness/reset", body: [:])
        try await launch(["--harness-reset", "--harness-actor", "devon", "--return-to", "/"], appearance: appearance)
        XCTAssertTrue(app.staticTexts["Your people"].waitForExistence(timeout: 30))
        try await control("/__harness/accounts/devon", body: ["adult": false])
        onlyAdultsState()
    }

    /// P7.1: flagged after sign-in: the adults-only state and nothing else;
    /// no request uses the old session afterwards; a relaunch has none.
    func testA01FlaggedAfterSignIn() async throws {
        try await flagged()
        capture("A1-flagged-later")
        let seen = try await log().count
        try await Task.sleep(for: .seconds(10))
        let entries = try await log()
        let later = entries.dropFirst(seen).filter { ($0["client"] as? String) == "ios" && ($0["account"] as? String) == "devon" }
        let refused = entries.filter { ($0["client"] as? String) == "ios" && ($0["status"] as? Int) == 403 && ($0["account"] as? String) == "devon" }
        XCTAssertGreaterThanOrEqual(refused.count, 1, "the refusal")
        XCTAssertEqual(later.count, 0, "no request with the old session afterwards")
        try await launch(["--return-to", "/"])
        XCTAssertTrue(app.buttons["Continue with Pantopus"].waitForExistence(timeout: 30), "a relaunch shows the welcome")
        XCTAssertFalse(app.staticTexts["Your people"].exists)
    }

    /// P7.2: the under-18 persona at sign-in: refused, with the same state.
    func testA02RefusedAtSignIn() async throws {
        try await control("/__harness/reset", body: [:])
        try await launch(["--harness-reset", "--return-to", "/"])
        let start = app.buttons["Continue with Pantopus"]
        XCTAssertTrue(start.waitForExistence(timeout: 30)); start.tap()
        let minor = app.buttons["Harness: an account under 18 (refused)"]
        XCTAssertTrue(minor.waitForExistence(timeout: 30)); minor.tap()
        onlyAdultsState()
        capture("A2-refused-at-sign-in")
        try await launch(["--return-to", "/"])
        XCTAssertTrue(app.buttons["Continue with Pantopus"].waitForExistence(timeout: 30), "no session was kept")
    }

    /// P7.3: largest text, Night: the state in full.
    func testA03LargestTextNight() async throws {
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await flagged(appearance: "night")
        capture("A3-largest-night")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
