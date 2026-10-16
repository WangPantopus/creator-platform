import XCTest

/// Opt-in, operated WP 7.4 P6 journeys (the provider sentence on the
/// first-conversation screen) against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --consent
@MainActor
final class Lane7ConsentFlows: XCTestCase {
    private let app = XCUIApplication()
    private let promise = "Before your first message, Lena Park's AI is powered by Synthetic provider. They don't keep or train on your messages."
    private let plain = "This AI is powered by Synthetic provider."
    private let clean = "Doesn't train on your messages. Doesn't keep your messages."
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

    private func consent(_ flags: [String: Any]? = nil, appearance: String = "light") async throws {
        guard ProcessInfo.processInfo.environment["LANE7_CONSENT"] == "1" else {
            throw XCTSkip("Opt in with LANE7_CONSENT=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        if let flags { try await control("/__harness/flags", body: flags) }
        app.launchArguments = arguments(appearance) + ["--harness-reset", "--harness-actor", "priya", "--return-to", "/creators/lenapark/chat"]
        app.launch()
        app.launchArguments = arguments(appearance)
        XCTAssertTrue(app.buttons["Synthetic provider processing terms"].waitForExistence(timeout: 30))
    }

    /// Exact text by predicate: a subscript asserts on very long labels.
    private func text(_ label: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func any(_ contains: String) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", contains)).count > 0
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    /// P6.1: every provider keeps and trains on nothing, the policy is
    /// verified: the fixed sentence, verbatim, and the terms link; Start with
    /// still opens the thread once, consented.
    func testC01PromiseWhenProvidersKeepNothing() async throws {
        try await consent()
        XCTAssertTrue(text(promise).exists, "the fixed sentence")
        XCTAssertFalse(text(plain).exists); XCTAssertFalse(text(clean).exists)
        capture("C1-promise")
        try await control("/__harness/log/clear", body: [:])
        let start = app.buttons["Start with Lena Park's AI"]
        XCTAssertTrue(start.waitForExistence(timeout: 30))
        for _ in 0..<8 where !start.isHittable { app.swipeUp() }
        for _ in 0..<200 where !start.isEnabled { try await Task.sleep(for: .milliseconds(50)) }
        start.tap()
        XCTAssertTrue(app.buttons["Ask Lena Park to step in"].waitForExistence(timeout: 30))
        let state = try await control("/__harness/state") as! [String: Any]
        let thread = (state["threads"] as! [[String: Any]]).first { $0["creator"] as? String == "lenapark" && $0["account"] as? String == "priya" }
        XCTAssertEqual(thread?["consent"] as? Bool, true, "consented")
        let log = try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
        let begins = log.filter { ($0["client"] as? String) == "ios" && ($0["method"] as? String) == "POST" && (($0["path"] as? String) == "/v1/conversations" || ($0["path"] as? String) == "/v1/conversations/begin") && ($0["status"] as? Int) == 200 }
        XCTAssertEqual(begins.count, 1, "one begin request")
    }

    /// P6.2: a provider that keeps messages: its own honest line, no promise.
    func testC02ProviderThatKeepsMessages() async throws {
        try await consent(["providers": [["name": "Synthetic provider", "noTraining": true, "noRetention": false]]])
        XCTAssertTrue(text(plain).exists)
        XCTAssertTrue(text("Doesn't train on your messages. Review message retention in these terms.").exists)
        XCTAssertFalse(any("They don't keep or train"))
        capture("C2-keeps-messages")
    }

    /// P6.3: an unverified policy: the development notice and the providers'
    /// own lines, no promise.
    func testC03UnverifiedPolicy() async throws {
        try await consent(["policyVerified": false])
        XCTAssertTrue(any("Unreviewed development policy"))
        XCTAssertTrue(text(plain).exists); XCTAssertTrue(text(clean).exists)
        XCTAssertFalse(any("They don't keep or train"))
        capture("C3-unverified")
    }

    /// P6.4: two clean providers: both named in the sentence, both links.
    func testC04TwoProviders() async throws {
        try await consent(["providers": [["name": "Synthetic provider", "noTraining": true, "noRetention": true], ["name": "Second provider", "noTraining": true, "noRetention": true]]])
        XCTAssertTrue(text("Before your first message, Lena Park's AI is powered by Synthetic provider, Second provider. They don't keep or train on your messages.").exists)
        XCTAssertTrue(app.buttons["Second provider processing terms"].exists)
        capture("C4-two-providers")
    }

    /// The frame of the scroll view that holds the text: at the largest text
    /// the development banner is a scroll view of its own above the page.
    private func page(_ label: String) -> CGRect {
        app.scrollViews.containing(NSPredicate(format: "label == %@", label)).firstMatch.frame
    }

    /// Scrolls with slow drags until the text's first line is near the top of
    /// its page: at the largest text the screen shows a few lines.
    private func top(_ label: String) {
        let element = text(label), area = page(label)
        let origin = app.coordinate(withNormalizedOffset: .zero)
        for _ in 0..<12 {
            let offset = element.frame.minY - (area.minY + area.height * 0.1)
            if abs(offset) < area.height * 0.15 { break }
            // A finger move of 2 × step scrolls the content about that far.
            let step = max(-area.height * 0.3, min(area.height * 0.3, offset / 2))
            origin.withOffset(CGVector(dx: area.midX, dy: area.midY + step))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: area.midX, dy: area.midY - step)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
    }

    /// P6.5: largest text, Night: the sentence in full.
    func testC05LargestTextNight() async throws {
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await consent(appearance: "night")
        XCTAssertTrue(text(promise).exists)
        top(promise)
        XCTAssertTrue(page(promise).intersects(text(promise).frame), "the sentence is on screen")
        capture("C5-largest-night")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
