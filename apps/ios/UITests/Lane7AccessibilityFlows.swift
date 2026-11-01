import XCTest

/// Opt-in, operated WP 7.11 journeys against lane 7's fake API: VoiceOver hears
/// who is speaking before the words, an on/off setting is a switch with its
/// state, a choice is named, and the largest text keeps those controls reachable.
/// Android runs the same flows (tests/scenarios/lane-7/e7-11-accessibility.mjs).
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --a11y
@MainActor
final class Lane7AccessibilityFlows: XCTestCase {
    private let app = XCUIApplication()
    private let maya = "c1000000-0000-4000-8000-000000000001"
    private let kiln = "c1000000-0000-4000-8000-000000000002"
    private let fan = "f1000000-0000-4000-8000-000000000001"
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

    /// Every flow skips before it calls anything: CI runs this target with no harness.
    private func open(_ path: String, appearance: String = "light", size: String = "large", waitFor: String) async throws {
        guard ProcessInfo.processInfo.environment["LANE7_A11Y"] == "1" else {
            throw XCTSkip("Opt in with LANE7_A11Y=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        // A failed largest-text flow must not leave the simulator at that size.
        try await control("/content-size", body: ["size": size], port: 56475)
        try await control("/__harness/reset", body: [:])
        app.launchArguments = arguments(appearance) + ["--harness-reset", "--harness-actor", "devon", "--return-to", path]
        app.launch()
        app.launchArguments = arguments(appearance)
        XCTAssertTrue(app.descendants(matching: .any)[waitFor].waitForExistence(timeout: 30), waitFor)
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func reveal(_ element: XCUIElement) {
        let origin = app.coordinate(withNormalizedOffset: .zero), frame = app.frame
        for up in [false, true] {
            for _ in 0..<12 where !(element.exists && element.isHittable) {
                let (from, to) = up ? (0.35, 0.7) : (0.7, 0.35)
                origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * from))
                    .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * to)), withVelocity: .slow, thenHoldForDuration: 0.2)
            }
        }
    }

    /// The labels VoiceOver reads, in its order: one snapshot of the whole tree
    /// (every row of a thread exists, as it is a plain stack).
    private func spoken() throws -> [String] {
        var labels: [String] = []
        func walk(_ node: XCUIElementSnapshot) {
            if !node.label.isEmpty { labels.append(node.label) }
            node.children.forEach(walk)
        }
        walk(try app.snapshot())
        return labels
    }
    private let authors = [#"^You\. "#, #"^Prepared by AI"#, #"^(Maya|Kiln Club)('s AI|'s team · .+)?( at .+)?$"#, #"^Maya · to "#, #"^Maya reacted"#]
    private func matches(_ label: String, _ pattern: String) -> Bool { label.range(of: pattern, options: .regularExpression) != nil }
    /// The body is read after its author: in the same element (`own`) or as the
    /// nearest author label before it.
    private func heardFirst(_ labels: [String], body: String, author: String, own: Bool = false, file: StaticString = #filePath, line: UInt = #line) {
        guard let i = labels.lastIndex(where: { $0.contains(body) }) else { return XCTFail("not in the tree: \(body)", file: file, line: line) }
        if own { return XCTAssertTrue(matches(labels[i], author), "heard \"\(labels[i])\"", file: file, line: line) }
        let j = labels[..<i].lastIndex { label in authors.contains { matches(label, $0) } }
        XCTAssertTrue(j.map { matches(labels[$0], author) } ?? false, "\(body): heard \"\(j.map { labels[$0] } ?? "nothing")\" first", file: file, line: line)
    }

    /// A2: in Maya's thread (the fan, the AI, an approved draft, the creator and a
    /// Note) and in Kiln Club's (the creator and the team) the author comes first.
    func testA02AuthorshipFirst() async throws {
        try await open("/threads/\(maya)/\(fan)", waitFor: "Send")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Second note")).firstMatch.waitForExistence(timeout: 20))
        var labels = try spoken()
        heardFirst(labels, body: "I keep getting pinholes", author: #"^You\. I keep getting pinholes"#, own: true)
        heardFirst(labels, body: "Pinholes in celadon usually", author: #"^Maya's AI( at .+)?$"#)
        heardFirst(labels, body: "Thanks. What bisque temperature", author: #"^You\. Thanks\. What bisque"#, own: true)
        heardFirst(labels, body: "I bisque to cone 04", author: #"^Prepared by AI · approved by Maya\. I bisque"#, own: true)
        heardFirst(labels, body: "Devon, send me a photo", author: #"^Maya( at .+)?$"#)
        heardFirst(labels, body: "Second note: the clinic starts at 6pm.", author: #"^Maya · to all members"#)
        try await open("/threads/\(kiln)/\(fan)", waitFor: "Send")
        labels = try spoken()
        heardFirst(labels, body: "I'm in this thread now", author: #"^Kiln Club( at .+)?$"#)
        heardFirst(labels, body: "I'm helping Kiln Club with the queue", author: #"^Kiln Club's team · Sam, triage( at .+)?$"#)
    }

    /// A3: off the record, sharing the intro, the feedback consent and the
    /// spending reminders are switches; off the record reaches the server.
    func testA03Switches() async throws {
        try await open("/you?creatorId=\(maya)&fanId=\(fan)", waitFor: "Off the record")
        let record = app.switches["Keep this conversation off the record"]
        reveal(record)
        XCTAssertEqual(record.value as? String, "0")
        record.tap()
        XCTAssertTrue(record.waitForValue("1"))
        let on = try await offTheRecord()
        XCTAssertEqual(on, true, "the server has it on")
        record.tap()
        XCTAssertTrue(record.waitForValue("0"))
        let off = try await offTheRecord()
        XCTAssertEqual(off, false, "and off again")
        let intro = app.switches["Share my intro with this creator's AI"]
        reveal(intro)
        XCTAssertTrue(intro.exists)
        try await open("/support/feedback", waitFor: "Optional product feedback")
        let consent = app.switches["I agree to share these answers for product feedback."]
        reveal(consent)
        XCTAssertEqual(consent.value as? String, "0")
        consent.tap()
        XCTAssertTrue(consent.waitForValue("1"))
        try await open("/commerce/spending", waitFor: "Spending and time")
        let remind = app.switches["Remind me at 50% and 100%"]
        reveal(remind)
        XCTAssertTrue(remind.exists)
    }
    private func offTheRecord() async throws -> Bool? {
        for _ in 0..<20 {
            let state = try await control("/__harness/state") as! [String: Any]
            let thread = (state["threads"] as? [[String: Any]])?.first { $0["creator"] as? String == "maya" && $0["account"] as? String == "devon" }
            if let value = thread?["offTheRecord"] as? Bool { return value }
            try await Task.sleep(for: .milliseconds(250))
        }
        return nil
    }

    /// A4: the report type and the data scope are named choices, as on Android.
    func testA04NamedChoices() async throws {
        try await open("/support", waitFor: "Help and reports")
        let type = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Report type")).firstMatch
        reveal(type); type.tap()
        for name in ["Support request", "Report AI message", "Abuse report", "Block creator", "Crisis help"] { XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 10), name) }
        app.buttons["Abuse report"].tap()
        XCTAssertTrue((type.label + " " + String(describing: type.value ?? "")).contains("Abuse report"), "the picker says the chosen type")
        try await open("/support/privacy", waitFor: "Your data")
        let scope = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Data scope")).firstMatch
        reveal(scope); scope.tap()
        for name in ["Account", "Creator", "Conversation"] { XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 10), name) }
        app.buttons["Conversation"].tap()
    }

    /// A5: at the largest text, in Light and Night, both privacy switches can be
    /// reached; the captures are reviewed by eye for clipping.
    func testA05LargestText() async throws {
        for appearance in ["light", "night"] {
            try await open("/you?creatorId=\(maya)&fanId=\(fan)", appearance: appearance, size: "accessibility-extra-extra-extra-large", waitFor: "Off the record")
            for label in ["Keep this conversation off the record", "Share my intro with this creator's AI"] {
                let toggle = app.switches[label]
                reveal(toggle)
                XCTAssertTrue(toggle.exists && toggle.isHittable, "\(appearance): \(label)")
                capture("A5-largest-\(appearance)-\(label.prefix(12))")
            }
            for (path, label, title) in [("/support/feedback", "I agree to share these answers for product feedback.", "Optional product feedback"), ("/commerce/spending", "Remind me at 50% and 100%", "Spending and time")] {
                try await open(path, appearance: appearance, size: "accessibility-extra-extra-extra-large", waitFor: title)
                let toggle = app.switches[label]
                reveal(toggle)
                XCTAssertTrue(toggle.exists && toggle.isHittable, "\(appearance): \(label)")
                capture("A5-largest-\(appearance)-\(title.prefix(12))")
            }
        }
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }
}

private extension XCUIElement {
    /// Waits until the element's value is the expected one (a switch says "0" or "1").
    func waitForValue(_ expected: String, timeout: TimeInterval = 10) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline { if value as? String == expected { return true }; usleep(200_000) }
        return value as? String == expected
    }
}
