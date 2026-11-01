import XCTest

/// Opt-in, operated WP 7.4 P5 journeys (a creator or a conversation picked by
/// name, never typed as an id) against lane 7's fake API.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --pickers
@MainActor
final class Lane7PickerFlows: XCTestCase {
    private let app = XCUIApplication()
    private let maya = "c1000000-0000-4000-8000-000000000001"
    private let kiln = "c1000000-0000-4000-8000-000000000002"
    private let glazeco = "c1000000-0000-4000-8000-000000000003"
    private func arguments() -> [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

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
        guard ProcessInfo.processInfo.environment["LANE7_PICKERS"] == "1" else {
            throw XCTSkip("Opt in with LANE7_PICKERS=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ path: String, actor: String = "devon", faults: [[String: Any]] = []) async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        try await control("/__harness/reset", body: [:])
        try await control("/__harness/faults", body: ["rules": faults])
        app.launchArguments = arguments() + ["--harness-reset", "--harness-actor", actor, "--return-to", path]
        app.launch()
        app.launchArguments = arguments()
        XCTAssertTrue(app.staticTexts["Help and reports"].waitForExistence(timeout: 30) || app.staticTexts["Your data"].waitForExistence(timeout: 5))
    }

    private func text(_ label: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label == %@", label)).firstMatch }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    private func reveal(_ element: XCUIElement) {
        let origin = app.coordinate(withNormalizedOffset: .zero), frame = app.frame
        for _ in 0..<10 where !(element.exists && element.isHittable) {
            origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.7))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: frame.midX, dy: frame.height * 0.45)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
    }
    /// Chooses an option from a menu picker (the report type, the data scope, the creator).
    private func choose(_ picker: XCUIElement, _ option: String) {
        reveal(picker)
        for _ in 0..<40 where !picker.isEnabled { usleep(50_000) }
        picker.tap()
        let item = app.buttons[option]
        XCTAssertTrue(item.waitForExistence(timeout: 10), "option \(option)")
        item.tap()
    }
    private func menu(_ contains: String) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch }
    private var creatorPicker: XCUIElement { app.buttons["picker-creator"] }
    private var conversationPicker: XCUIElement { app.buttons["picker-conversation"] }
    /// What a picker shows: its value (the chosen name, or the prompt).
    private func shows(_ picker: XCUIElement, _ expected: String) -> Bool {
        (picker.value as? String) == expected || picker.label.contains(expected)
    }
    private func reason(_ value: String) {
        let field = app.textFields["What happened?"].exists ? app.textFields["What happened?"] : app.textViews["What happened?"]
        reveal(field); field.tap(); field.typeText(value)
    }
    private func sent() async throws -> [[String: Any]] {
        let state = try await control("/__harness/state") as! [String: Any]
        return state["trust"] as? [[String: Any]] ?? []
    }
    private func noTypedIds() {
        XCTAssertFalse(app.textFields["Creator ID"].exists, "no typed creator id")
        XCTAssertFalse(app.textFields["Conversation ID"].exists, "no typed conversation id")
        XCTAssertFalse(app.staticTexts["Creator ID"].exists); XCTAssertFalse(app.staticTexts["Conversation ID"].exists)
    }

    /// P5.1: Block, by name: nothing is chosen at first and Block waits; the
    /// chosen creator's id is what is sent.
    func testV01BlockByName() async throws {
        try await open("/support")
        choose(menu("Report type"), "Block creator")
        XCTAssertTrue(creatorPicker.waitForExistence(timeout: 30))
        XCTAssertTrue(text("Creator").exists)
        XCTAssertTrue(shows(creatorPicker, "Choose a creator"), "nothing chosen: \(creatorPicker.label) \(String(describing: creatorPicker.value))")
        noTypedIds()
        reason("Blocking this creator for the picker test.")
        XCTAssertFalse(app.buttons["Block creator"].isEnabled, "nothing is sent until a creator is chosen")
        choose(creatorPicker, "Kiln Club")
        XCTAssertTrue(shows(creatorPicker, "Kiln Club"))
        capture("V1-chosen")
        reveal(app.buttons["Block creator"]); app.buttons["Block creator"].tap()
        var commands: [[String: Any]] = []
        for _ in 0..<60 where commands.isEmpty { commands = try await sent(); try await Task.sleep(for: .milliseconds(250)) }
        XCTAssertEqual(commands.count, 1)
        XCTAssertEqual(commands.first?["command"] as? String, "block")
        XCTAssertEqual(commands.first?["creatorId"] as? String, kiln)
    }

    /// P5.2: opened with a creator (Report from a thread): that creator's name,
    /// already chosen; the report carries that id.
    func testV02OpenedFromThreadShowsName() async throws {
        try await open("/support?creatorId=" + maya)
        choose(menu("Report type"), "Abuse report")
        XCTAssertTrue(creatorPicker.waitForExistence(timeout: 30))
        let named = { self.shows(self.creatorPicker, "Maya") }
        for _ in 0..<40 where !named() { try await Task.sleep(for: .milliseconds(250)) }
        XCTAssertTrue(named(), "Maya already chosen: \(creatorPicker.label) \(String(describing: creatorPicker.value))")
        XCTAssertFalse(app.staticTexts[maya].exists, "never the id")
        noTypedIds()
        capture("V2-maya-chosen")
        reason("Reporting this creator for the picker test.")
        reveal(app.buttons["Send report"]); app.buttons["Send report"].tap()
        var commands: [[String: Any]] = []
        for _ in 0..<60 where commands.isEmpty { commands = try await sent(); try await Task.sleep(for: .milliseconds(250)) }
        XCTAssertEqual(commands.first?["kind"] as? String, "abuse")
        XCTAssertEqual(commands.first?["creatorId"] as? String, maya)
    }

    /// P5.3: Your data, one conversation, by name: the export names that
    /// conversation and its creator.
    func testV03ExportOneConversation() async throws {
        try await open("/support/privacy")
        XCTAssertTrue(text("Your data").waitForExistence(timeout: 30))
        choose(menu("Data scope"), "Conversation")
        XCTAssertTrue(conversationPicker.waitForExistence(timeout: 30))
        XCTAssertTrue(text("Conversation").exists)
        XCTAssertTrue(shows(conversationPicker, "Choose a conversation"))
        XCTAssertFalse(creatorPicker.exists, "one picker for one conversation")
        noTypedIds()
        choose(conversationPicker, "Glazeco")
        let proof = app.textFields["Local confirmation"]
        reveal(proof); proof.tap(); proof.typeText("LOCAL DEVELOPMENT")
        capture("V3-conversation-chosen")
        let export = app.buttons["Request export"]
        reveal(export)
        for _ in 0..<40 where !export.isEnabled { try await Task.sleep(for: .milliseconds(100)) }
        export.tap()
        var commands: [[String: Any]] = []
        for _ in 0..<60 where commands.isEmpty { commands = try await sent(); try await Task.sleep(for: .milliseconds(250)) }
        XCTAssertEqual(commands.first?["command"] as? String, "export")
        XCTAssertEqual(commands.first?["scope"] as? String, "thread")
        XCTAssertEqual(commands.first?["creatorId"] as? String, glazeco)
        XCTAssertEqual(commands.first?["threadId"] as? String, "71000000-0000-4000-8000-000000000003")
    }

    /// P5.4: a person with no conversations is told so.
    func testV04NoConversations() async throws {
        try await open("/support", actor: "priya")
        choose(menu("Report type"), "Abuse report")
        XCTAssertTrue(text("You have no conversations yet.").waitForExistence(timeout: 30))
        XCTAssertFalse(creatorPicker.exists)
        noTypedIds()
        capture("V4-none")
    }

    /// P5.5: the list cannot load: said so, with Try again; once the service
    /// answers, the names arrive.
    func testV05ListFailsThenRetries() async throws {
        try await open("/support", faults: [["match": "^/v1/conversations/account", "status": 503]])
        choose(menu("Report type"), "Abuse report")
        XCTAssertTrue(text("Your conversations couldn't load.").waitForExistence(timeout: 30))
        XCTAssertFalse(creatorPicker.exists)
        capture("V5-failed")
        try await control("/__harness/faults", body: ["rules": []])
        let retry = app.buttons["Try again"]
        reveal(retry); retry.tap()
        XCTAssertTrue(creatorPicker.waitForExistence(timeout: 30))
        XCTAssertTrue(shows(creatorPicker, "Choose a creator"))
        choose(creatorPicker, "Maya")
        XCTAssertTrue(shows(creatorPicker, "Maya"))
    }
}
