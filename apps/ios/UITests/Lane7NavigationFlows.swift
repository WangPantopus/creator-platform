import XCTest

/// Opt-in, operated UI journeys against lane 7's fake API, not backend proof.
/// The app performs real sign-in, HTTP requests, navigation, and secure storage.
/// Run serially on qelvora-lane7-ios with the harness and ios-link-driver.mjs.
@MainActor
final class Lane7NavigationFlows: XCTestCase {
    private let app = XCUIApplication()
    private let kiln = "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001"
    private let baseArguments = ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]

    private func control(_ path: String, method: String = "GET", body: [String: String]? = nil, port: Int = 56473) async throws -> Any {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return try JSONSerialization.jsonObject(with: data)
    }

    private func fresh(_ actor: String = "devon", to path: String = "/home") async throws {
        guard ProcessInfo.processInfo.environment["LANE7_NAVIGATION"] == "1" else {
            throw XCTSkip("Opt in with LANE7_NAVIGATION=1 against lane 7's disposable harness.")
        }
        continueAfterFailure = false
        app.terminate()
        _ = try await control("/__harness/reset", method: "POST")
        // Reset preserves the diagnostic log; each flow must assert only its own requests.
        _ = try await control("/__harness/log/clear", method: "POST")
        app.launchArguments = baseArguments + ["--harness-reset", "--harness-actor", actor, "--return-to", path]
        app.launch()
        // A later OS launch must not repeat reset, actor, or destination extras.
        app.launchArguments = baseArguments
    }

    private func text(_ contains: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
    }

    private func button(_ contains: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
    }

    private func at(_ expected: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(text(expected).waitForExistence(timeout: 30), "Missing screen text: \(expected)", file: file, line: line)
        print("LANE7 screen: \(expected)")
    }

    private func tap(_ label: String, file: StaticString = #filePath, line: UInt = #line) {
        let exact = app.buttons[label]
        let target = exact.exists ? exact : button(label)
        XCTAssertTrue(target.waitForExistence(timeout: 30), "Missing button: \(label)", file: file, line: line)
        for _ in 0..<8 {
            if target.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(target.isHittable, "Cannot reach: \(label)", file: file, line: line)
        target.tap()
    }

    private func edgeBack() {
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: 10, dy: 500)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: 240, dy: 502)))
    }

    private func back() {
        let target = app.buttons["Back"]
        if target.exists && target.isHittable { target.tap() } else { edgeBack() }
    }

    private func thread() {
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30))
        XCTAssertFalse(text("AI remembers").exists)
        print("LANE7 screen: thread, privacy closed")
    }

    private func link(_ path: String) async throws {
        _ = try await control("/link", method: "POST", body: ["path": path], port: 56475)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let open = springboard.buttons["Open"]
        if open.waitForExistence(timeout: 3) { open.tap() }
    }

    private func requests() async throws -> [[String: Any]] {
        let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
        let ios = rows.filter { $0["client"] as? String == "ios" }
        let metadata = ios.map { row in
            ["method": row["method"] ?? "", "path": row["path"] ?? "",
             "status": row["status"] ?? 0, "account": row["account"] ?? NSNull()]
        }
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "ios-request-metadata"; attachment.lifetime = .keepAlways; add(attachment)
        return ios
    }

    private func saw(_ path: String, account: String? = nil) async throws {
        let apiPath = path.replacingOccurrences(of: "/threads/", with: "/conversations/")
        let rows = try await requests()
        let found = rows.contains { row in
            (row["path"] as? String ?? "").contains(apiPath)
                && (account == nil || row["account"] as? String == account)
                && row["status"] as? Int == 200
        }
        XCTAssertTrue(found, "No successful iOS request for \(apiPath)")
        if found { print("LANE7 server: successful \(apiPath), account \(account ?? "any")") }
    }

    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
    }

    // Recheck N1 because the resumed N5 flow found a swipe/button conflict.
    func testN01ThreadBackAndGesture() async throws {
        try await fresh(); at("Your people")
        tap("Kiln Club"); thread(); back(); at("Your people")
        tap("Kiln Club"); thread(); edgeBack(); at("Your people")
        try await saw(kiln)
        capture("N1-button-and-edge-home")
    }

    func testN02ConsentIsReplaced() async throws {
        try await fresh("priya", to: "/discover")
        let search = app.textFields["Search creators"]
        XCTAssertTrue(search.waitForExistence(timeout: 30))
        search.tap(); search.typeText("Lena\n")
        tap("Lena Park"); at("Official means")
        tap("Message Lena Park's AI"); at("Before your first message")
        tap("Start with Lena Park's AI"); thread()
        back(); at("Official means")
        XCTAssertFalse(text("Before your first message").exists)
        back(); XCTAssertTrue(search.waitForExistence(timeout: 30))
        edgeBack(); at("Your people")
        let state = try await control("/__harness/state") as! [String: Any]
        let threads = state["threads"] as! [[String: Any]]
        XCTAssertEqual(threads.filter { $0["account"] as? String == "priya" }.count, 1)
        XCTAssertTrue(threads.contains { $0["account"] as? String == "priya" && $0["consent"] as? Bool == true })
        capture("N2-home-consented-thread-created-once")
    }

    func testN05AccountBack() async throws {
        try await fresh(to: "/you"); at("THIS MONTH")
        let monthY = text("THIS MONTH").frame.minY
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: 10, dy: 650)).press(forDuration: 0.05,
            thenDragTo: origin.withOffset(CGVector(dx: 10, dy: 300)))
        XCTAssertLessThan(text("THIS MONTH").frame.minY, monthY - 50,
                          "A vertical drag at the edge must still scroll You")
        for _ in 0..<4 {
            if button("Spending and time").isHittable { break }
            app.swipeDown()
        }
        tap("Spending and time"); at("Charged this UTC calendar month")
        back(); at("THIS MONTH")
        tap("Help and safety"); at("Reports are available without paid access")
        back(); at("THIS MONTH"); edgeBack(); at("Your people")
        try await saw("/commerce/"); try await saw("/trust/")
        capture("N5-home")
    }

    func testN06NotificationTrailAndLabel() async throws {
        try await fresh(); at("Your people"); tap("Notifications")
        tap("The Friday glaze clinic is back"); at("POST")
        XCTAssertTrue(app.buttons["Back"].exists)
        XCTAssertFalse(button("Back to Maya").exists)
        back(); tap("Your bisque question has an approved reply"); at("Official means")
        back(); XCTAssertTrue(app.buttons["Settings"].waitForExistence(timeout: 30))
        edgeBack(); at("Your people")
        let state = try await control("/__harness/state") as! [String: Any]
        let notices = state["notifications"] as! [[String: Any]]
        for id in ["9e000000-0000-4000-8000-000000000001", "9e000000-0000-4000-8000-000000000003"] {
            XCTAssertTrue(notices.contains { $0["account"] as? String == "devon" && $0["id"] as? String == id && $0["read"] as? Bool == true })
        }
        capture("N6-home-two-notices-read")
    }

    func testN08ColdLink() async throws {
        try await fresh(); at("Your people")
        app.terminate(); try await link(kiln); thread()
        back(); at("Your people"); try await saw(kiln)
        // Home is a thread's parent, so it alone cannot detect a fake startup trail.
        app.terminate(); try await link("/creators/maya"); at("Official means")
        edgeBack(); XCTAssertTrue(app.textFields["Search creators"].waitForExistence(timeout: 30))
        edgeBack(); at("Your people"); try await saw("/growth/public/creators/maya")
        capture("N8-thread-and-creator-parents")
    }

    func testN13AccountChangeClearsTrail() async throws {
        try await fresh(to: kiln); thread(); try await link("/identity/account"); at("Your account")
        tap("Sign out"); tap("continue-with-pantopus"); tap("Priya")
        at("Your account"); at("@priya_n")
        edgeBack(); at("THIS MONTH"); at("@priya_n")
        edgeBack(); at("Your people")
        let rows = try await requests()
        XCTAssertFalse(rows.contains { $0["account"] as? String == "priya" && ($0["path"] as? String ?? "").contains("/conversations/c1000000") })
        let state = try await control("/__harness/state") as! [String: Any]
        let sessions = state["sessions"] as! [[String: Any]]
        XCTAssertFalse(sessions.contains { $0["account"] as? String == "devon" && $0["revoked"] as? Bool == false })
        try await saw("/identity/session", account: "priya")
        capture("N13-priya-home-no-devon-requests")
    }

    func testN14UnknownLink() async throws {
        try await fresh(to: "/discover")
        XCTAssertTrue(app.textFields["Search creators"].waitForExistence(timeout: 30))
        try await link("/admin")
        XCTAssertTrue(app.textFields["Search creators"].exists)
        edgeBack(); at("Your people"); try await saw("/growth/public/creators")
        capture("N14-home")
    }

    func testN15RepeatedLinkAndQuickBack() async throws {
        try await fresh(to: "/discover")
        XCTAssertTrue(app.textFields["Search creators"].waitForExistence(timeout: 30))
        try await link(kiln); thread(); try await link(kiln); thread()
        back(); XCTAssertTrue(app.textFields["Search creators"].waitForExistence(timeout: 30))
        try await link(kiln); thread(); edgeBack(); edgeBack(); at("Your people")
        edgeBack(); at("Your people"); try await saw(kiln)
        capture("N15-home")
    }

    func testN16LinkWhilePrivacyIsOpen() async throws {
        try await fresh(to: kiln); thread(); tap("Me and privacy"); at("AI remembers")
        try await link("/creators/maya"); at("Official means")
        back(); thread(); try await saw("/growth/public/creators/maya")
        capture("N16-thread-privacy-closed")
    }

    func testN17TrailBoundary() async throws {
        try await fresh(); at("Your people")
        for index in 1...30 {
            try await link(index % 2 == 1 ? "/creators/maya" : "/support")
            at(index % 2 == 1 ? "Official means" : "Reports are available without paid access")
        }
        for index in 1...24 {
            back()
            at(index % 2 == 1 ? "Official means" : "Reports are available without paid access")
        }
        back(); at("THIS MONTH"); edgeBack(); at("Your people")
        edgeBack(); at("Your people")
        try await saw("/growth/public/creators/maya"); try await saw("/trust/")
        capture("N17-home-after-26-backs")
    }

    func testN19NewFanBack() async throws {
        try await fresh("new fan"); at("How creators will know you")
        back(); at("How creators will know you")
        XCTAssertTrue(app.textFields["@handle"].exists)
        let rows = try await requests()
        XCTAssertFalse(rows.contains { $0["method"] as? String == "POST" && ($0["path"] as? String ?? "").contains("fan-profile") })
        capture("N19-no-profile-created")
    }

    func testN20EditProfileBack() async throws {
        try await fresh(to: "/you"); at("THIS MONTH")
        tap("Edit handle and intro"); at("Your account")
        tap("Edit public profile"); at("How creators will know you")
        back(); at("Your account"); edgeBack(); at("THIS MONTH")
        edgeBack(); at("Your people"); try await saw("/identity/session")
        capture("N20-home")
    }

    func testN21CreatorAccessBack() async throws {
        try await fresh(to: "/requests"); tap("Creator access"); at("YOU CAN")
        back(); XCTAssertTrue(app.buttons["Creator access"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Manage membership"].exists)
        edgeBack(); at("Your people"); try await saw("/commerce/")
        capture("N21-requests-to-home")
    }
}
