import XCTest

/// Opt-in, operated WP 7.4 journeys for `/creators/{handle}/chat` (the link a
/// Note or reaction notice and "Message {name}'s AI" open) against lane 7's
/// fake API. A notice opening the thread is P2's U2.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --chat-link
@MainActor
final class Lane7ChatLinkFlows: XCTestCase {
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

    /// Every flow skips before it calls anything: CI runs this target with no
    /// harness and no link driver.
    private func optIn() throws {
        guard ProcessInfo.processInfo.environment["LANE7_CHAT_LINK"] == "1" else {
            throw XCTSkip("Opt in with LANE7_CHAT_LINK=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ path: String, actor: String) async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/log/clear", body: [:])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", actor, "--return-to", path]
        app.launch()
        app.launchArguments = arguments
    }
    private func begins() async throws -> Int {
        let log = try await control("/__harness/log?since=0&limit=1000") as! [[String: Any]]
        return log.filter { ($0["client"] as? String) == "ios" && ($0["method"] as? String) == "POST" && (($0["path"] as? String) == "/v1/conversations" || ($0["path"] as? String) == "/v1/conversations/begin") }.count
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    /// H1: Devon already talks with Maya's AI: the chat link opens that thread,
    /// not "Before your first message", and starts nothing.
    func testH01ExistingConversationOpens() async throws {
        try await open("/creators/maya/chat", actor: "devon")
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30), "Maya's thread")
        XCTAssertFalse(app.staticTexts["Before your first message"].exists)
        let started = try await begins()
        XCTAssertEqual(started, 0, "no conversation begun")
        capture("H1-thread")
    }

    /// H2: Priya has no conversation with Lena Park: the first-conversation
    /// screen, as before.
    func testH02NoConversationKeepsFirstScreen() async throws {
        try await open("/creators/lenapark/chat", actor: "priya")
        XCTAssertTrue(app.staticTexts["Before your first message"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Synthetic provider processing terms"].waitForExistence(timeout: 30))
        capture("H2-first-conversation")
    }
}
