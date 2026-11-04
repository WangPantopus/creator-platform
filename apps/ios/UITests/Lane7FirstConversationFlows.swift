import XCTest

/// Opt-in, operated E7.1 first conversation against lane 7's fake API: a fan
/// with no conversations goes from Discover to a creator's page, the
/// first-conversation screen and an empty thread (F1), then sends a first
/// message and sees the AI's reply stream in (F2). Android runs the same steps
/// (tests/scenarios/lane-7/e7-1-first-conversation.mjs).
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --first
@MainActor
final class Lane7FirstConversationFlows: XCTestCase {
    private let app = XCUIApplication()
    private let arguments = ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

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
    private func thread() async throws -> [String: Any]? {
        let state = try await control("/__harness/state") as! [String: Any]
        return (state["threads"] as! [[String: Any]]).first { $0["creator"] as? String == "lenapark" && $0["account"] as? String == "priya" }
    }
    /// A button by its label; `contains` for a row whose label says more (a search result).
    private func tap(_ label: String, contains: Bool = false) async throws {
        let target = contains ? app.buttons.matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch : app.buttons[label]
        XCTAssertTrue(target.waitForExistence(timeout: 30), label)
        for _ in 0..<8 where !target.isHittable { app.swipeUp() }
        for _ in 0..<200 where !target.isEnabled { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertTrue(target.isHittable && target.isEnabled, label)
        target.tap()
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    /// Priya, who has no conversations, from Discover to Lena Park's empty thread.
    /// Every flow skips before it calls anything: CI runs this target with no harness.
    private func firstThread() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_FIRST"] == "1" else {
            throw XCTSkip("Opt in with LANE7_FIRST=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/flags", body: ["replyDelayMs": 300, "sentenceDelayMs": 600])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "priya", "--return-to", "/discover"]
        app.launch()
        app.launchArguments = arguments
        let search = app.textFields["Search creators"]
        XCTAssertTrue(search.waitForExistence(timeout: 30))
        search.tap(); search.typeText("Lena\n")
        try await tap("Lena Park", contains: true)
        try await tap("Message Lena Park's AI")
        XCTAssertTrue(app.staticTexts["Before your first message"].waitForExistence(timeout: 30))
        // Start stays disabled until the provider terms have loaded.
        try await tap("Start with Lena Park's AI")
        XCTAssertTrue(app.textViews["Message Lena Park's AI"].waitForExistence(timeout: 30), "the empty thread's composer")
    }

    /// F1: four screens to a thread (Discover, the page, the first-conversation
    /// screen, an empty thread), begun once with consent and no messages.
    func testF01DiscoverToAnEmptyThread() async throws {
        try await firstThread()
        let thread = try await thread()
        XCTAssertEqual(thread?["consent"] as? Bool, true, "consented")
        XCTAssertEqual((thread?["messages"] as? [String])?.count, 0, "no messages yet")
        capture("F1-empty-thread")
    }

    /// F2: the first message is sent once, and the AI's reply streams in and is delivered.
    func testF02FirstMessageAndReply() async throws {
        try await firstThread()
        let editor = app.textViews["Message Lena Park's AI"]
        editor.tap(); editor.typeText("Hello, where should I start with a loom?")
        // Taps while the keyboard animates land asynchronously: let the layout settle.
        try await Task.sleep(for: .seconds(1))
        try await tap("Send")
        let reply = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "Here's how I'd think about that", "That depends on a few things")).firstMatch
        XCTAssertTrue(reply.waitForExistence(timeout: 30), "the AI's reply")
        var rows: [String] = []
        var generating = true
        for _ in 0..<60 where rows.count != 2 || generating {
            try await Task.sleep(for: .milliseconds(500))
            let current = try await thread()
            rows = (current?["messages"] as? [String] ?? []).map { String($0.split(separator: ":").first ?? "") }
            generating = current?["generating"] as? Bool ?? true
        }
        XCTAssertEqual(rows.count, 2, rows.joined(separator: " | "))
        XCTAssertTrue(rows.first?.contains("fan delivered") == true, rows.joined(separator: " | "))
        XCTAssertTrue(rows.last?.contains("ai delivered") == true, rows.joined(separator: " | "))
        XCTAssertFalse(generating, "the reply finished")
        capture("F2-reply")
    }
}
