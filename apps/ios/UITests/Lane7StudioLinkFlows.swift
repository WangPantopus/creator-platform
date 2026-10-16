import XCTest

/// Opt-in, operated WP 7.12 journeys against lane 7's fake API: a creator in the
/// fan app opens the web Studio in the system browser; a fan sees no link.
/// Android runs the same flows (tests/scenarios/lane-7/e7-12-studio-link.mjs).
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --studio
@MainActor
final class Lane7StudioLinkFlows: XCTestCase {
    private let app = XCUIApplication()
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    private let studio = "/studio/c1000000-0000-4000-8000-000000000001"
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

    /// Every flow skips before it calls anything: CI runs this target with no harness.
    private func open(actor: String) async throws {
        guard ProcessInfo.processInfo.environment["LANE7_STUDIO"] == "1" else {
            throw XCTSkip("Opt in with LANE7_STUDIO=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", actor, "--return-to", "/identity/account"]
        app.launch()
        app.launchArguments = arguments
        XCTAssertTrue(app.staticTexts["Your account"].waitForExistence(timeout: 30))
    }
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<8 where !(element.exists && element.isHittable) { app.swipeUp() }
    }
    private func studioVisits() async throws -> Int {
        let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
        return rows.filter { $0["method"] as? String == "GET" && $0["path"] as? String == studio }.count
    }

    /// Z1: a creator account has "Open Qelvora Studio"; the system browser opens
    /// that creator's web Studio (signed in there, or at its sign-in).
    func testZ01CreatorOpensTheWebStudio() async throws {
        try await open(actor: "maya")
        let link = app.buttons["Open Qelvora Studio"]
        reveal(link)
        XCTAssertTrue(link.waitForExistence(timeout: 20), "the link")
        let before = try await studioVisits()
        link.tap()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20), "the system browser opens")
        var after = before
        for _ in 0..<40 where after == before { try await Task.sleep(for: .milliseconds(500)); after = try await studioVisits() }
        XCTAssertGreaterThan(after, before, "the browser asked for this creator's Studio")
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = "Z1-browser"; shot.lifetime = .keepAlways; add(shot)
        app.activate()
    }

    /// Z2: a fan's account has no Studio link.
    func testZ02FanSeesNoStudioLink() async throws {
        try await open(actor: "devon")
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["Open Qelvora Studio"].exists)
    }
}
