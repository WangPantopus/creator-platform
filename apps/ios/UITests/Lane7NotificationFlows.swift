import XCTest

/// Opt-in, operated WP 7.4 P2 journeys (notification rows: authorship, time,
/// unread) against lane 7's fake API, as Devon.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --notifications
@MainActor
final class Lane7NotificationFlows: XCTestCase {
    private let app = XCUIApplication()
    /// Today's time ("14:05") or the day ("Oct 14").
    private let time = "([0-2][0-9]:[0-5][0-9]|[A-Z][a-z]{2} [0-9]{1,2})"
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
        guard ProcessInfo.processInfo.environment["LANE7_NOTIFICATIONS"] == "1" else {
            throw XCTSkip("Opt in with LANE7_NOTIFICATIONS=1 against lane 7's disposable harness.")
        }
    }

    private func open(appearance: String = "light") async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        app.launchArguments = arguments(appearance) + ["--harness-reset", "--harness-actor", "devon", "--return-to", "/notifications"]
        app.launch()
        app.launchArguments = arguments(appearance)
        XCTAssertTrue(row("The Friday glaze clinic is back").waitForExistence(timeout: 30))
    }

    private func row(_ contains: String) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch }
    /// The row's whole spoken label matches: sender, preview, time, then "Unread" or nothing.
    private func spoken(_ pattern: String) -> Bool {
        app.buttons.matching(NSPredicate(format: "label MATCHES %@", pattern)).count == 1
    }
    private func escaped(_ text: String) -> String { NSRegularExpression.escapedPattern(for: text) }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    /// Slow drags until the row can be tapped (at the largest text a row is most of a screen).
    private func reveal(_ element: XCUIElement) {
        for _ in 0..<30 where !element.isHittable {
            let origin = app.coordinate(withNormalizedOffset: .zero), frame = app.frame
            origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.7))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.4)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
    }

    /// P2.1: each row says who, what, when and whether it is unread, in that
    /// order; a read row says nothing more. The server's sender is verbatim.
    func testU01RowsSaySenderPreviewTimeUnread() async throws {
        try await open()
        let rows: [(String, String, Bool)] = [
            ("Maya · to followers", "The Friday glaze clinic is back. Bring one test tile.", true),
            ("Maya reacted to your reply.", "You have an update. Open the app to view it.", true),
            ("Approved by Maya.", "Your bisque question has an approved reply.", false),
            ("Kiln Club's AI.", "Your question about firing schedules has a reply.", false),
            ("System.", "Your request was passed on this one.", false),
            ("Maya · to members.", "Studio note: the kiln is cooling until Thursday.", true),
        ]
        for (sender, preview, unread) in rows {
            let separator = sender.hasSuffix(".") ? " " : ". "
            let pattern = escaped(sender) + separator + escaped(preview) + " " + time + (unread ? "\\. Unread" : "")
            XCTAssertTrue(spoken(pattern), "spoken: \(pattern)")
        }
        capture("U1-rows")
    }

    /// P2.2: a C4 Note notice opens Maya's thread; back in the list the row is
    /// read: no "Unread", no dot.
    func testU02NoteOpensThreadAndIsRead() async throws {
        try await open()
        let note = row("Studio note: the kiln is cooling until Thursday.")
        reveal(note)
        XCTAssertTrue(note.label.hasSuffix("Unread"))
        note.tap()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30), "Maya's thread")
        let state = try await control("/__harness/state") as! [String: Any]
        let notices = state["notifications"] as! [[String: Any]]
        XCTAssertTrue(notices.contains { $0["id"] as? String == "9e000000-0000-4000-8000-000000000006" && $0["read"] as? Bool == true }, "marked read")
        app.buttons["Back"].firstMatch.tap()
        let read = row("Studio note: the kiln is cooling until Thursday.")
        XCTAssertTrue(read.waitForExistence(timeout: 30))
        for _ in 0..<40 where read.label.hasSuffix("Unread") { try await Task.sleep(for: .milliseconds(250)) }
        XCTAssertFalse(read.label.hasSuffix("Unread"), "read now: \(read.label)")
        reveal(read)
        capture("U2-note-read")
    }

    /// P2.3: a reaction notice shows the generic preview and opens the thread.
    func testU03ReactionOpensThread() async throws {
        try await open()
        let reaction = row("Maya reacted to your reply")
        XCTAssertTrue(reaction.label.contains("You have an update. Open the app to view it."))
        reaction.tap()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30), "Maya's thread")
    }

    /// P2.4: largest text, Night: rows wrap, time and the unread dot stay.
    func testU04LargestTextNight() async throws {
        try optIn()
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        try await open(appearance: "night")
        capture("U4-largest-night-top")
        // The last row ends the list; at this size the tab bar may cover its middle,
        // so the check is that it is on screen, not that its centre takes a tap.
        // Drags stay inside the list's own scroll view: at this size the development
        // banner (a scroll view of its own) and the tab bar take most of the screen.
        let note = row("Studio note: the kiln is cooling until Thursday.")
        let list = app.scrollViews.containing(NSPredicate(format: "label == %@", "Notifications")).firstMatch.frame
        let origin = app.coordinate(withNormalizedOffset: .zero)
        for _ in 0..<40 where !(note.exists && list.intersects(note.frame)) {
            origin.withOffset(CGVector(dx: list.midX, dy: list.midY + list.height * 0.3))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: list.midX, dy: list.midY - list.height * 0.3)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTAssertTrue(note.exists && list.intersects(note.frame), "the last row is on screen")
        capture("U4-largest-night-note")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}
