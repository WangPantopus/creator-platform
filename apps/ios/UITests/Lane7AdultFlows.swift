import XCTest

/// Opt-in, operated WP 7.4 P7 journeys (the designed under-18 state, D-11)
/// against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --adults
@MainActor
final class Lane7AdultFlows: XCTestCase {
    private let app = XCUIApplication()
    private let title = "This app is for adults"
    private let body = "This app is available to adults aged 18 and over."
    private let thread = "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001"
    private let draft = "lane7 under18 private draft"
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
        guard ProcessInfo.processInfo.environment["LANE7_ADULTS"] == "1" else {
            throw XCTSkip("Opt in with LANE7_ADULTS=1 against lane 7's disposable harness.")
        }
    }

    private func launch(_ extra: [String], appearance: String = "light") async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        app.launchArguments = arguments(appearance) + extra
        app.launch()
        app.launchArguments = arguments(appearance)
    }

    private func label(_ text: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", text)).firstMatch }

    /// The adults-only state and nothing else: no retry, help, sign-in or tabs.
    private func onlyAdultsState(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(label(title).waitForExistence(timeout: 40), "the title", file: file, line: line)
        XCTAssertTrue(label(body).exists, "the body", file: file, line: line)
        for extra in ["Retry", "Crisis help", "Sign in to continue", "Home", "Discover"] {
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
        try optIn()
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
        XCTAssertTrue(app.buttons["Sign in to continue"].waitForExistence(timeout: 30), "a relaunch shows the welcome")
        XCTAssertFalse(app.staticTexts["Your people"].exists)
    }

    /// P7.2: the under-18 persona at sign-in: refused, with the same state.
    func testA02RefusedAtSignIn() async throws {
        try optIn()
        try await control("/__harness/reset", body: [:])
        try await launch(["--harness-reset", "--return-to", "/"])
        let start = app.buttons["Sign in to continue"]
        XCTAssertTrue(start.waitForExistence(timeout: 30)); start.tap()
        let minor = app.buttons["Harness: an account under 18 (refused)"]
        XCTAssertTrue(minor.waitForExistence(timeout: 30)); minor.tap()
        onlyAdultsState()
        capture("A2-refused-at-sign-in")
        try await launch(["--return-to", "/"])
        XCTAssertTrue(app.buttons["Sign in to continue"].waitForExistence(timeout: 30), "no session was kept")
    }

    /// What the app keeps of the thread (ios-link-driver.mjs reads the files,
    /// never their contents): drafts, the offline copy, files holding its text.
    private func stored() async throws -> (drafts: Int, offline: Bool, hits: Int) {
        let storage = try await control("/storage", body: ["markers": [draft]], port: 56475) as! [String: Any]
        let scan = try await control("/scan", body: ["markers": [draft, "Pinholes in celadon"]], port: 56475) as! [String: Any]
        return (storage["count"] as! Int, storage["offline"] as! Bool, scan["hits"] as! Int)
    }

    /// P7.4: flagged in a thread. Its own reads (Notes and reactions, the
    /// offline copy) meet the flag before the 30-second session check does,
    /// and the server ends the session there. The same state shows, and
    /// nothing of the thread stays on screen or in the app's files.
    func testA04FlaggedInAThread() async throws {
        try optIn()
        try await control("/__harness/reset", body: [:])
        try await launch(["--harness-reset", "--harness-actor", "devon", "--return-to", thread])
        let input = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Message ", "Reply to ")).firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 30))
        input.tap(); input.typeText(draft)
        var before = try await stored()
        for _ in 0..<40 where before.drafts == 0 || !before.offline {
            try await Task.sleep(for: .milliseconds(500)); before = try await stored()
        }
        XCTAssertEqual(before.drafts, 1, "the draft is saved before the flag")
        XCTAssertTrue(before.offline, "the offline copy is saved before the flag")
        let seen = try await log().count
        try await control("/__harness/accounts/devon", body: ["adult": false])
        onlyAdultsState()
        capture("A4-flagged-in-a-thread")
        let refused = try await log().dropFirst(seen).first { ($0["client"] as? String) == "ios" && ($0["status"] as? Int) == 403 }
        let path = refused?["path"] as? String ?? "no refusal"
        XCTAssertFalse(path == "no refusal" || path.hasSuffix("/identity/session"), "a thread read met the flag: \(path)")
        print("LANE7 adults A4: first refusal \(path)")
        for text in ["Pinholes in celadon", "Maya's AI", draft] {
            XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", text, text)).firstMatch.exists, "still on screen: \(text)")
        }
        let after = try await stored()
        XCTAssertEqual(after.drafts, 0, "no draft file")
        XCTAssertFalse(after.offline, "no offline copy")
        XCTAssertEqual(after.hits, 0, "no app file holds the thread's text")
        print("LANE7 adults A4: stored before \(before), after \(after)")
        try await launch(["--return-to", thread])
        XCTAssertTrue(app.buttons["Sign in to continue"].waitForExistence(timeout: 30), "a relaunch into the thread shows the welcome")
        XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Pinholes in celadon")).firstMatch.exists)
    }

    /// P7.5: only D-11 ends the session. The thread's own reads refused for
    /// another reason (403 human_unavailable) leave the adult signed in.
    func testA05OtherRefusalInAThread() async throws {
        try optIn()
        try await control("/__harness/reset", body: [:])
        try await launch(["--harness-reset", "--harness-actor", "devon", "--return-to", thread])
        let input = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@ OR label BEGINSWITH %@", "Message ", "Reply to ")).firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 30))
        let seen = try await log().count
        try await control("/__harness/faults", body: ["rules": [["match": "/(presence|offline)$", "method": "GET", "status": 403, "code": "human_unavailable", "message": "Maya isn't available right now.", "remaining": 6]]])
        try await Task.sleep(for: .seconds(8))
        try await control("/__harness/faults", body: ["rules": []])
        let refused = try await log().dropFirst(seen).filter { ($0["client"] as? String) == "ios" && ($0["status"] as? Int) == 403 }
        XCTAssertGreaterThanOrEqual(refused.count, 3, "the thread's own reads were refused")
        XCTAssertFalse(label(title).exists, "no adults-only state")
        XCTAssertTrue(input.exists, "the thread stays")
        capture("A5-other-refusal-in-a-thread")
        try await launch(["--return-to", "/"])
        XCTAssertTrue(app.staticTexts["Your people"].waitForExistence(timeout: 30), "a relaunch is still signed in")
    }

    /// P7.3: largest text, Night: the state in full.
    func testA03LargestTextNight() async throws {
        try optIn()
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await flagged(appearance: "night")
        capture("A3-largest-night")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
