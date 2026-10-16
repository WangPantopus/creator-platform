import XCTest

/// Opt-in, operated WP 7.4 journeys (C4 Notes and reactions) against lane 7's
/// fake API, not backend proof. The app performs real sign-in, HTTP, paging and
/// layout. Run serially on qelvora-lane7-ios with the harness and
/// ios-link-driver.mjs: node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --presence
@MainActor
final class Lane7PresenceFlows: XCTestCase {
    private let app = XCUIApplication()
    private let thread = "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001"
    private let note = "Maya · to all members"
    private let reaction = "Maya reacted to your reply"
    private var appearance = "light"
    private var arguments: [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", appearance, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

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

    private func fresh() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_PRESENCE"] == "1" else {
            throw XCTSkip("Opt in with LANE7_PRESENCE=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        // A failed largest-text flow must not leave the simulator at that size.
        try await control("/content-size", body: ["size": "large"], port: 56475)
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/log/clear", body: [:])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "devon", "--return-to", thread]
        app.launch()
        app.launchArguments = arguments
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30))
    }

    /// Any element whose label contains the text (an author label is one
    /// accessibility element, not always a static text).
    private func element(_ contains: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
    }

    /// A slow drag of about a third of the screen: unlike swipeUp/swipeDown it
    /// never flings past rows. `up` reveals older content (above).
    private func drag(up: Bool) {
        // Inside the thread's own scroll area: at the largest text it is a small
        // band between the header and the composer.
        let scroll = app.scrollViews.firstMatch
        let area = scroll.exists ? scroll.frame : app.windows.firstMatch.frame
        let origin = app.coordinate(withNormalizedOffset: .zero)
        let high = origin.withOffset(CGVector(dx: area.midX, dy: area.minY + area.height * 0.2))
        let low = origin.withOffset(CGVector(dx: area.midX, dy: area.minY + area.height * 0.8))
        let (from, to) = up ? (high, low) : (low, high)
        from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    /// On screen: present and overlapping the window (a Note taller than the
    /// screen is never "hittable", but it is visible).
    private func visible(_ target: XCUIElement) -> Bool {
        target.exists && !target.frame.isEmpty && app.windows.firstMatch.frame.intersects(target.frame)
    }

    /// Scroll the lazy thread until the text is on screen: the preferred
    /// direction first, then the other, so an earlier search cannot strand it.
    @discardableResult
    private func find(_ contains: String, up: Bool = true, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let target = element(contains)
        for direction in [up, !up] {
            for _ in 0..<40 {
                if visible(target) { return target }
                drag(up: direction)
            }
        }
        XCTAssertTrue(visible(target), "Not on screen: \(contains)", file: file, line: line)
        return target
    }

    private func absent(_ contains: String) -> Bool {
        let target = element(contains)
        for direction in [true, false] {
            for _ in 0..<30 {
                if target.exists { return false }
                drag(up: direction)
            }
        }
        return !target.exists
    }

    private func presenceRequests() async throws -> [[String: Any]] {
        let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
        return rows.filter { row in
            let path = row["path"] as? String ?? ""
            return row["client"] as? String == "ios" && row["method"] as? String == "GET" && path.hasPrefix("/v1/content/") && path.hasSuffix("/presence")
        }
    }

    private func reads(_ expected: Int, file: StaticString = #filePath, line: UInt = #line) async throws -> [[String: Any]] {
        var rows = try await presenceRequests()
        for _ in 0..<60 where rows.count < expected {
            try await Task.sleep(for: .milliseconds(250)); rows = try await presenceRequests()
        }
        try await Task.sleep(for: .milliseconds(1500)); rows = try await presenceRequests()
        XCTAssertEqual(rows.count, expected, "presence requests", file: file, line: line)
        print("LANE7 presence requests: \(rows.count)")
        return rows
    }

    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
    }

    private func backgroundAndBack() async throws {
        XCUIDevice.shared.press(.home)
        try await Task.sleep(for: .seconds(2))
        app.activate()
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30))
        try await Task.sleep(for: .seconds(2))
    }

    /// R1.1 to R1.3: the Note and reaction between messages by time, every
    /// cursor followed once (the empty page too), the label before the body.
    func testR01NotesAndReactionsInPlace() async throws {
        try await fresh()
        let rows = try await reads(3)
        XCTAssertTrue(rows[0]["before"] is NSNull, "the first page has no cursor")
        XCTAssertEqual(rows[1]["before"] as? String, rows[0]["nextBefore"] as? String)
        XCTAssertEqual(rows[2]["before"] as? String, rows[1]["nextBefore"] as? String)
        XCTAssertEqual(rows.map { $0["items"] as? Int }, [2, 0, 2], "the empty middle page is followed")
        // Positions are compared within one screen: each pair is made visible
        // together before both frames are read.
        func above(_ upper: String, _ lower: String, file: StaticString = #filePath, line: UInt = #line) {
            let high = element(upper), low = element(lower)
            find(lower)
            for _ in 0..<4 where !(visible(high) && visible(low)) { drag(up: true) }
            XCTAssertTrue(visible(high) && visible(low), "\(upper) and \(lower) on one screen", file: file, line: line)
            XCTAssertLessThan(high.frame.minY, low.frame.minY, "\(upper) above \(lower)", file: file, line: line)
        }
        find("send me a photo of the tile", up: false)
        above("I bisque to cone 04", note)  // the approved draft (45 min) before the Note (30 min)
        above(note, "The Friday glaze clinic is back")  // the label before the body
        above("The Friday glaze clinic is back", reaction)  // the Note (30 min) before the reaction (20 min)
        above(reaction, "send me a photo of the tile")  // the reaction (20 min) before the reply (10 min)
        let container = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'presence-note-'")).firstMatch
        let labels = container.descendants(matching: .any).allElementsBoundByIndex.map(\.label).filter { !$0.isEmpty }
        XCTAssertEqual(labels.first, note, "a screen reader hears the label first: \(labels.prefix(3))")
        capture("R1-note-and-reaction")
        XCTAssertTrue(absent("Gold members"), "a Note this fan may not see is never shown")
        find("Thank you for the glaze questions this month.")
        find("Studio hours change next month.")
        capture("R1-older-notes")
        print("LANE7 presence: three pages, cursors verbatim, items [2,0,2], order and label checked")
    }

    /// R1.4: a message frame reads no presence; foreground and a lost
    /// connection read it again, and the new Note and reaction appear.
    func testR04NewNoteAfterForegroundAndReconnect() async throws {
        try await fresh()
        _ = try await reads(3)
        try await control("/__harness/threads/maya/note", body: ["text": "Kiln opening moved to Sunday."])
        try await control("/__harness/threads/maya/ask", body: ["text": "A frame from my other device"])
        find("A frame from my other device", up: false)
        try await Task.sleep(for: .seconds(3))
        _ = try await reads(3)
        XCTAssertFalse(element("Kiln opening moved to Sunday.").exists, "a message frame reads no presence")
        try await backgroundAndBack()
        _ = try await reads(6)
        find("Kiln opening moved to Sunday.")
        capture("R4-new-note-after-foreground")
        try await control("/__harness/threads/maya/reaction", body: ["reaction": "thanks"])
        try await control("/__harness/sockets/close", body: [:])
        _ = try await reads(9)
        print("LANE7 presence: frame 0 reads, foreground +1 read, lost connection +1 read")
    }

    /// R1.5, R1.6: a server failure or a timed-out request keeps the last list;
    /// a refusal clears it; the thread stays; eligibility is read again. Each
    /// read follows a lost live connection: the background hides the whole
    /// thread (presence included) by design, so it cannot test "keep". A
    /// dropped connection only checks that Notes stay: URLSession retries a
    /// dropped GET by itself (Android's client never retries).
    func testR05EligibilityAndFailures() async throws {
        try await fresh()
        var seen = try await reads(3).count
        find(note)
        func reconnect(_ rule: [String: Any]?, settle: Duration = .milliseconds(1500)) async throws -> Int {
            if var rule { rule["match"] = "^/v1/content/"; rule["method"] = "GET"; rule["remaining"] = rule["remaining"] ?? 1
                try await control("/__harness/faults", body: ["rules": [rule]]) }
            try await control("/__harness/sockets/close", body: [:])
            var rows = try await presenceRequests()
            for _ in 0..<120 where rows.count == seen { try await Task.sleep(for: .milliseconds(250)); rows = try await presenceRequests() }
            try await Task.sleep(for: settle); rows = try await presenceRequests()
            defer { seen = rows.count }
            return rows.count - seen
        }
        let failed = try await reconnect(["status": 500])
        XCTAssertEqual(failed, 1, "a 500 ends that read after one request")
        XCTAssertTrue(find(note).exists, "a 500 keeps the last list")
        let slow = try await reconnect(["delayMs": 20000], settle: .seconds(18))
        XCTAssertEqual(slow, 1, "a timed-out read is not retried")
        XCTAssertTrue(find(note).exists, "a timed-out read keeps the last list")
        let dropped = try await reconnect(["drop": true, "remaining": 3])
        XCTAssertGreaterThanOrEqual(dropped, 1)
        XCTAssertTrue(find(note).exists, "a dropped request leaves Notes on screen")
        capture("R6-kept-after-500-timeout-and-drop")
        try await control("/__harness/faults", body: ["rules": []])
        let refused = try await reconnect(["status": 403, "code": "scope_revoked", "message": "This scope is closed."])
        XCTAssertEqual(refused, 1, "a refusal ends that read after one request")
        XCTAssertTrue(absent(note), "a refusal clears Notes")
        XCTAssertTrue(absent(reaction), "a refusal clears reactions")
        find("send me a photo of the tile", up: false)
        XCTAssertTrue(app.buttons["Send"].exists, "the thread itself is untouched")
        capture("R6-cleared-after-403")
        try await control("/__harness/threads/maya/presence", body: ["visible": false])
        let good = try await reconnect(nil)
        XCTAssertEqual(good, 3, "a good read follows every page")
        XCTAssertTrue(absent(note), "a Note the fan may no longer see is gone")
        find(reaction, up: false)
        capture("R5-note-no-longer-eligible")
    }

    /// R1.8: a long Note with emoji and right-to-left text, largest text, Light and Night.
    func testR08LongUnicodeNoteLargestText() async throws {
        try await fresh()
        let long = String(repeating: "Glaze notes for the long weekend, with every kiln detail. ", count: 12)
        try await control("/__harness/threads/maya/note", body: ["text": "🔥 שלום עולם · " + long + "مرحبا"])
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        for mode in ["light", "night"] {
            appearance = mode
            app.terminate(); app.launchArguments = arguments + ["--return-to", thread]; app.launch(); app.launchArguments = arguments
            XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30))
            find("🔥 שלום עולם", up: false)
            capture("R8-long-unicode-largest-\(mode)")
            find(note)
            capture("R8-label-largest-\(mode)")
        }
        appearance = "light"
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }

    /// R1.9: presence lives in memory only; nothing is written to the app's data.
    func testR09NothingOnDisk() async throws {
        try await fresh()
        _ = try await reads(3)
        find(note)
        try await backgroundAndBack()
        let scan = try await control("/scan", body: ["markers": ["Friday glaze clinic", note, "Thank you for the glaze questions"]], port: 56475) as! [String: Any]
        XCTAssertEqual(scan["hits"] as? Int, 0, "no app file contains Note text: \(scan)")
        print("LANE7 presence storage scan: \(scan)")
    }
}
