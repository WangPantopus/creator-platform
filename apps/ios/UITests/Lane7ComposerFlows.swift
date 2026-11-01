import XCTest

/// Opt-in, operated WP 7.4 P3 journeys (the composer states, following the
/// design reference's `Composer`) against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --composer
@MainActor
final class Lane7ComposerFlows: XCTestCase {
    private let app = XCUIApplication()
    private func thread(_ n: Int) -> String { "/threads/c1000000-0000-4000-8000-00000000000\(n)/f1000000-0000-4000-8000-000000000001" }
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
        guard ProcessInfo.processInfo.environment["LANE7_COMPOSER"] == "1" else {
            throw XCTSkip("Opt in with LANE7_COMPOSER=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ n: Int, appearance: String = "light") async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/log/clear", body: [:])
        app.launchArguments = arguments(appearance) + ["--harness-reset", "--harness-actor", "devon", "--return-to", thread(n)]
        app.launch()
        app.launchArguments = arguments(appearance)
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
    }

    private func text(_ label: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func any(_ contains: String) -> Bool { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", contains)).count > 0 }
    private func stepIns(_ name: String) -> Int { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Ask \(name) to step in")).count }
    private var inputs: XCUIElementQuery { app.textViews.matching(NSPredicate(format: "label BEGINSWITH 'Message ' OR label BEGINSWITH 'Reply to '")) }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func until(_ timeout: Double = 20, _ condition: () -> Bool) async throws -> Bool {
        for _ in 0..<Int(timeout * 4) { if condition() { return true }; try await Task.sleep(for: .milliseconds(250)) }
        return condition()
    }

    /// Q1: the AI is on: "Message Maya's AI", the step-in button, no notice.
    func testQ01AiOn() async throws {
        try await open(1)
        XCTAssertTrue(app.textViews["Message Maya's AI"].waitForExistence(timeout: 30))
        XCTAssertEqual(stepIns("Maya"), 1)
        XCTAssertFalse(any("AI unavailable"))
        capture("Q1-ai-on")
    }

    /// Q2: the creator is in the thread: "Reply to Kiln Club", no step-in
    /// button, Send carries the seal; a reply is sent once.
    func testQ02CreatorHere() async throws {
        try await open(2)
        let field = app.textViews["Reply to Kiln Club"]
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        XCTAssertEqual(stepIns("Kiln Club"), 0, "no step-in button while the creator is here")
        XCTAssertFalse(any("AI unavailable"))
        capture("Q2-creator-here")
        field.tap(); field.typeText("Here is the tile after the firing.")
        try await Task.sleep(for: .seconds(1))
        capture("Q2-typed")
        app.buttons["Send"].tap()
        // To the person, not the AI: the reply goes to fan-replies, once.
        var posts = 0
        for _ in 0..<80 where posts == 0 {
            let log = try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
            posts = log.filter { ($0["client"] as? String) == "ios" && ($0["method"] as? String) == "POST" && ($0["path"] as? String)?.hasSuffix("/fan-replies") == true && ($0["status"] as? Int) == 200 }.count
            if posts == 0 { try await Task.sleep(for: .milliseconds(250)) }
        }
        XCTAssertEqual(posts, 1, "one accepted reply")
        let cleared = try await until(20) { (field.value as? String ?? "").isEmpty }
        XCTAssertTrue(cleared, "the composer is empty again")
        XCTAssertTrue(app.textViews["Reply to Kiln Club"].exists)
    }

    /// Q3: the AI is paused: the paused line in place of the input, the
    /// step-in button, no "AI unavailable" notice; step-in opens the packet.
    func testQ03AiPaused() async throws {
        try await open(3)
        let line = text("Glazeco's AI is paused · requests still work")
        XCTAssertTrue(app.buttons["Ask Glazeco to step in"].waitForExistence(timeout: 30))
        XCTAssertEqual(inputs.count, 0, "no input while the AI is paused")
        XCTAssertFalse(app.buttons["Send"].exists)
        XCTAssertFalse(any("AI unavailable")); XCTAssertFalse(any("AI messaging is paused in this conversation"))
        XCTAssertTrue(line.exists, "the paused line")
        XCTAssertEqual(stepIns("Glazeco"), 1)
        capture("Q3-paused")
        app.buttons["Ask Glazeco to step in"].tap()
        XCTAssertTrue(app.staticTexts["Included in your request"].waitForExistence(timeout: 30), "the packet")
    }

    /// Q4: the state changes while the thread is open, with a draft typed:
    /// paused (input gone, draft kept), the creator steps in ("Reply to Maya",
    /// the draft back, no step-in), and hands back ("Message Maya's AI").
    func testQ04LiveChangesKeepTheDraft() async throws {
        try await open(1)
        let draft = "Kept through every change"
        let ai = app.textViews["Message Maya's AI"]
        XCTAssertTrue(ai.waitForExistence(timeout: 30))
        ai.tap(); ai.typeText(draft)
        try await Task.sleep(for: .seconds(1))
        try await control("/__harness/threads/maya/pause", body: [:])
        let paused = try await until(20) { self.inputs.count == 0 && self.app.buttons["Ask Maya to step in"].exists }
        XCTAssertTrue(paused, "paused: the input leaves, step-in stays")
        XCTAssertTrue(text("Maya's AI is paused · requests still work").exists)
        XCTAssertFalse(any("AI unavailable"))
        capture("Q4-paused")
        try await control("/__harness/threads/maya/takeover", body: [:])
        let human = app.textViews["Reply to Maya"]
        XCTAssertTrue(human.waitForExistence(timeout: 20))
        XCTAssertEqual(human.value as? String, draft, "the draft is back")
        XCTAssertEqual(stepIns("Maya"), 0, "no step-in while Maya is here")
        capture("Q4-creator-here")
        try await control("/__harness/threads/maya/handback", body: [:])
        XCTAssertTrue(ai.waitForExistence(timeout: 20))
        XCTAssertEqual(ai.value as? String, draft, "the draft is kept")
        let stepIn = try await until(20) { self.stepIns("Maya") == 1 }
        XCTAssertTrue(stepIn, "step-in is back")
        capture("Q4-ai-again")
        let log = try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
        XCTAssertFalse(log.contains { ($0["method"] as? String) == "POST" && ($0["path"] as? String)?.hasSuffix("/messages") == true }, "nothing was sent")
    }

    /// Q5: largest text, Night: paused (the header carries the paused line,
    /// one step-in button at the thread's end) and the creator here (no step-in).
    func testQ05LargestTextNight() async throws {
        try optIn()
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await open(3, appearance: "night")
        XCTAssertTrue(app.buttons["Ask Glazeco to step in"].waitForExistence(timeout: 30))
        XCTAssertEqual(stepIns("Glazeco"), 1, "one step-in button")
        XCTAssertEqual(inputs.count, 0)
        XCTAssertFalse(any("AI unavailable"))
        capture("Q5-largest-paused")
        try await open(2, appearance: "night")
        XCTAssertTrue(app.textViews["Reply to Kiln Club"].waitForExistence(timeout: 30))
        XCTAssertEqual(stepIns("Kiln Club"), 0)
        capture("Q5-largest-creator-here")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
