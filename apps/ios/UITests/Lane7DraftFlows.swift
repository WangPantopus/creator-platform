import XCTest

/// Real API/PostgreSQL deletion and send proof. The fixture holds synthetic
/// object IDs only; authentication lives in memory and is never attached/logged.
@MainActor
final class Lane7StackDraftFlow: XCTestCase {
    func testD06RealSendAndDeletion() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_STACK_DRAFTS"] == "1" else { throw XCTSkip("Requires lane 7's prepared real API.") }
        continueAfterFailure = false
        let fixture = try JSONSerialization.jsonObject(with: Data(ProcessInfo.processInfo.environment["LANE7_STACK_FIXTURE"]!.utf8)) as! [String: String]
        let app = XCUIApplication(), api = fixture["api"]!, marker = fixture["marker"]!
        func request(_ path: String, body: [String: Any]? = nil, token: String? = nil, base: String? = nil) async throws -> (Int, [String: Any]) {
            var request = URLRequest(url: URL(string: (base ?? api) + path)!)
            request.httpMethod = body == nil ? "GET" : "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let token { request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
            if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
            let (data, response) = try await URLSession.shared.data(for: request)
            return ((response as! HTTPURLResponse).statusCode, try JSONSerialization.jsonObject(with: data) as! [String: Any])
        }
        let begun = try await request("/v1/identity/continue", body: ["returnTo": "/home"])
        XCTAssertEqual(begun.0, 200)
        let identity = try await request("/v1/identity/complete", body: ["continuationId": begun.1["continuationId"]!, "code": "10000000-0000-4000-8000-000000000002"])
        XCTAssertEqual(identity.0, 200)
        let token = identity.1["token"] as! String, path = "/v1/conversations/" + fixture["creator"]! + "/" + fixture["fan"]!
        func storage(_ count: Int) async throws {
            var result: [String: Any] = [:]
            for _ in 0..<40 {
                let response = try await request("/storage", body: ["markers": [marker, "real deletion draft"]], base: "http://127.0.0.1:56475")
                XCTAssertEqual(response.0, 200); result = response.1
                if result["count"] as? Int == count { break }
                try await Task.sleep(for: .milliseconds(250))
            }
            XCTAssertEqual(result["count"] as? Int, count)
            XCTAssertEqual(result["plaintextFound"] as? Bool, false)
            print("LANE7 real storage: \(count) ciphertext files")
        }
        let field = app.textViews.matching(NSPredicate(format: "label BEGINSWITH 'Message '")).firstMatch
        func input(_ text: String) throws {
            XCTAssertTrue(field.waitForExistence(timeout: 30))
            let match = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", text), object: field)
            let result = XCTWaiter.wait(for: [match], timeout: 20)
            XCTAssertEqual(result, .completed)
            guard result == .completed else { throw NSError(domain: "Lane7RealDraft", code: 1) }
        }
        func reveal(_ element: XCUIElement) throws {
            for _ in 0..<8 {
                if element.exists && element.isHittable { return }
                app.scrollViews.firstMatch.swipeUp()
            }
            XCTFail("Could not reach privacy control"); throw NSError(domain: "Lane7RealDraft", code: 2)
        }
        func capture(_ name: String) {
            let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
        }
        XCUIDevice.shared.orientation = .portrait
        let arguments = ["--api-url", api, "--appearance", "light", "-AppleLanguages", "(en)"]
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", fixture["actor"]!, "--return-to", fixture["route"]!]
        app.launch(); app.launchArguments = arguments
        XCTAssertTrue(field.waitForExistence(timeout: 30)); field.tap(); field.typeText(marker)
        try input(marker); try await storage(1)
        let before = try await request(path, token: token)
        XCTAssertEqual(before.0, 200)
        XCTAssertFalse((before.1["messages"] as! [[String: Any]]).contains { $0["text"] as? String == marker })
        app.terminate(); app.launch(); try input(marker); app.buttons["Send"].tap()
        var sent = 0
        for _ in 0..<100 {
            let response = try await request(path, token: token); XCTAssertEqual(response.0, 200)
            sent = (response.1["messages"] as! [[String: Any]]).filter { $0["text"] as? String == marker && $0["authorKind"] as? String == "fan" }.count
            if sent == 1 { break }; try await Task.sleep(for: .milliseconds(250))
        }
        XCTAssertEqual(sent, 1); try input(""); try await storage(0)
        print("LANE7 real API: exactly one accepted fan reply after process restart")
        field.tap(); field.typeText("real deletion draft"); try input("real deletion draft"); try await storage(1)
        _ = try await request("/link", body: ["path": "/support/privacy"], base: "http://127.0.0.1:56475")
        let open = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Open"]
        if open.waitForExistence(timeout: 3) { open.tap() }
        XCTAssertTrue(app.staticTexts["Your data"].waitForExistence(timeout: 30))
        let scope = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Data scope'")).firstMatch
        try reveal(scope); scope.tap(); app.buttons["Conversation"].tap()
        for (label, value) in [("Creator ID", fixture["creator"]!), ("Conversation ID", fixture["thread"]!), ("Local confirmation", "LOCAL DEVELOPMENT")] {
            let input = app.textFields[label]; try reveal(input); input.tap(); input.typeText(value)
            app.scrollViews.firstMatch.swipeUp()
        }
        try reveal(app.buttons["Request deletion"]); app.buttons["Request deletion"].tap()
        let confirmations = app.buttons.matching(identifier: "Request deletion")
        let confirm = confirmations.element(boundBy: confirmations.count - 1)
        XCTAssertTrue(confirm.waitForExistence(timeout: 5)); confirm.tap()
        var deleted = false
        for _ in 0..<100 {
            let jobs = try await request("/v1/trust/privacy/jobs", token: token); XCTAssertEqual(jobs.0, 200)
            deleted = (jobs.1["items"] as! [[String: Any]]).contains { $0["kind"] as? String == "delete" && $0["scope"] as? String == "thread" }
            if deleted { break }; try await Task.sleep(for: .milliseconds(250))
        }
        XCTAssertTrue(deleted); try await storage(0)
        let denied = try await request(path, token: token); XCTAssertTrue([403, 404, 410].contains(denied.0))
        print("LANE7 real API: saved thread deletion; subsequent read \(denied.0)")
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: 10, dy: 500)).press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: 240, dy: 502)))
        try await storage(0); app.terminate(); app.launch(); try await storage(0)
        XCTAssertFalse(app.textViews.matching(NSPredicate(format: "value == 'real deletion draft'")).firstMatch.exists)
        capture("D6-real-deletion-restored")
    }
}

/// Opt-in real-app operation; only the API and identities are synthetic.
@MainActor
final class Lane7DraftFlows: XCTestCase {
    private let app = XCUIApplication()
    private let maya = "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001"
    private let kiln = "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001"
    private let arguments = ["--api-url", "http://127.0.0.1:56473", "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
    private func control(_ path: String, body: [String: Any]? = nil, port: Int = 56473) async throws -> Any {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        return try JSONSerialization.jsonObject(with: data)
    }
    private func fresh() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_DRAFTS"] == "1" else { throw XCTSkip("Opt in against lane 7's disposable API.") }
        continueAfterFailure = true
        app.terminate(); XCUIDevice.shared.orientation = .portrait
        _ = try await control("/content-size", body: ["size": "large"], port: 56475)
        _ = try await control("/__harness/reset", body: [:])
        _ = try await control("/__harness/log/clear", body: [:])
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "devon", "--return-to", maya]
        app.launch(); app.launchArguments = arguments
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30))
    }
    private func input() -> XCUIElement {
        let predicate = NSPredicate(format: "label BEGINSWITH %@", "Message ")
        return app.textViews.matching(predicate).firstMatch
    }
    private func hasDraft(_ value: String) throws {
        let field = input()
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        let match = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: field)
        let result = XCTWaiter.wait(for: [match], timeout: 15)
        XCTAssertEqual(result, .completed)
        guard result == .completed else { throw NSError(domain: "Lane7Flow", code: 3) }
        print("LANE7 draft: expected input restored")
    }
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
        let tree = XCTAttachment(string: app.debugDescription); tree.name = name + "-tree"; tree.lifetime = .keepAlways; add(tree)
    }
    private func keyboardClear(_ name: String) {
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        let keyboard = app.keyboards.firstMatch.frame
        let inputView = app.otherElements["inputView"].firstMatch
        let keyboardTop = inputView.exists && inputView.frame.height > 0 && inputView.frame.minY > 0 ? min(keyboard.minY, inputView.frame.minY) : keyboard.minY
        capture(name)
        XCTAssertLessThanOrEqual(input().frame.maxY, keyboardTop + 2, "The keyboard must not cover the composer")
        XCTAssertLessThanOrEqual(app.buttons["Send"].frame.maxY, keyboardTop + 2, "Send must remain above the keyboard")
        XCTAssertTrue(input().isHittable); XCTAssertTrue(app.buttons["Send"].isHittable)
    }
    private func noSends() async throws {
        let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
        let sent = rows.filter { row in
            let path = row["path"] as? String ?? ""
            return row["client"] as? String == "ios" && row["method"] as? String == "POST" && (path.hasSuffix("/messages") || path.hasSuffix("/fan-replies"))
        }
        XCTAssertTrue(sent.isEmpty, "A draft must never be uploaded before explicit Send")
        print("LANE7 server: no message POST")
    }
    private func link(_ path: String, thread: Bool = true) async throws {
        _ = try await control("/link", body: ["path": path], port: 56475)
        let open = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Open"]
        if open.waitForExistence(timeout: 3) { open.tap() }
        if thread { XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 30)) }
    }
    override func tearDown() async throws {
        if ProcessInfo.processInfo.environment["LANE7_DRAFTS"] == "1" {
            _ = try await control("/content-size", body: ["size": "large"], port: 56475)
            XCUIDevice.shared.orientation = .portrait
        }
    }
    private func reveal(_ label: String) throws {
        let button = app.buttons[label].firstMatch
        for _ in 0..<6 {
            if button.exists && button.isHittable { return }
            app.scrollViews.firstMatch.swipeUp()
        }
        capture("missing-" + label)
        XCTFail("Cannot reach " + label)
        throw NSError(domain: "Lane7Flow", code: 1)
    }
    private func chooseActor(_ name: String) throws {
        let actor = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Harness: " + name)).firstMatch
        guard actor.waitForExistence(timeout: 30) else { XCTFail("Missing synthetic actor button"); throw NSError(domain: "Lane7Flow", code: 4) }
        actor.tap()
    }
    private func emptyInput() {
        let match = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '' OR value BEGINSWITH 'Message '"), object: input())
        XCTAssertEqual(XCTWaiter.wait(for: [match], timeout: 20), .completed)
    }
    private func waitRead(_ status: Int) async throws {
        for _ in 0..<120 {
            let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
            if rows.contains(where: { $0["client"] as? String == "ios" && $0["method"] as? String == "GET" && ($0["path"] as? String ?? "").hasSuffix(maya.replacingOccurrences(of: "/threads", with: "/conversations")) && $0["status"] as? Int == status }) { return }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTFail("Missing thread denial"); throw NSError(domain: "Lane7Flow", code: 2)
    }
    private func faults(_ rules: [[String: Any]]) async throws { _ = try await control("/__harness/faults", body: ["rules": rules]) }
    private func sentCount(_ marker: String) async throws -> Int {
        let state = try await control("/__harness/state") as! [String: Any]
        let thread = (state["threads"] as! [[String: Any]]).first { $0["creator"] as? String == "maya" && $0["account"] as? String == "devon" }!
        return (thread["messages"] as! [String]).filter { $0.contains(" fan ") && $0.contains(marker) }.count
    }
    private func accepted(_ marker: String) async throws {
        for _ in 0..<80 {
            if try await sentCount(marker) == 1 { print("LANE7 server: exactly one accepted synthetic message"); return }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTFail("The explicit send was not accepted exactly once")
    }
    private func messagePosts() async throws -> [[String: Any]] {
        let rows = try await control("/__harness/log?limit=1000") as! [[String: Any]]
        return rows.filter { $0["client"] as? String == "ios" && $0["method"] as? String == "POST" && ($0["path"] as? String ?? "").hasSuffix("/messages") }
    }
    private func checkSent(_ marker: String, count: Int) async throws {
        let actual = try await sentCount(marker); XCTAssertEqual(actual, count)
    }
    private func checkPosts(_ count: Int) async throws {
        let actual = try await messagePosts().count; XCTAssertEqual(actual, count)
    }
    private func storage(_ marker: String, count: Int) async throws {
        var result = try await control("/storage", body: ["markers": [marker]], port: 56475) as! [String: Any]
        for _ in 0..<20 where result["count"] as? Int != count {
            try await Task.sleep(for: .milliseconds(250))
            result = try await control("/storage", body: ["markers": [marker]], port: 56475) as! [String: Any]
        }
        XCTAssertEqual(result["count"] as? Int, count)
        XCTAssertEqual(result["plaintextFound"] as? Bool, false)
        if count > 0 { XCTAssertEqual(result["excludedFromBackup"] as? Bool, true) }
        XCTAssertTrue((result["sizes"] as! [Int]).allSatisfy { (28...65536).contains($0) })
        print("LANE7 storage: \(result)")
    }
    func testD01Lifecycle() async throws {
        try await fresh()
        let marker = "lane7 private unsent draft 314159"
        input().tap(); input().typeText(marker); try hasDraft(marker)
        keyboardClear("D1-portrait-keyboard")
        XCUIDevice.shared.orientation = .landscapeLeft; try hasDraft(marker)
        keyboardClear("D1-landscape-keyboard")
        XCUIDevice.shared.orientation = .portrait; try hasDraft(marker)
        XCUIDevice.shared.press(.home); app.activate(); try hasDraft(marker)
        app.terminate(); app.launch(); try hasDraft(marker)
        input().tap(); input().typeText("x" + XCUIKeyboardKey.delete.rawValue); try hasDraft(marker)
        keyboardClear("D1-restored-keyboard")
        capture("D1-restored-after-process-stop")
        try await noSends()
    }
    func testD02IndependentThreads() async throws {
        try await fresh()
        input().tap(); input().typeText("draft for Maya")
        try await link(kiln)
        XCTAssertFalse((input().value as? String ?? "").contains("draft for Maya"))
        input().tap(); input().typeText("draft for Kiln")
        app.buttons["Back"].tap(); try hasDraft("draft for Maya")
        try await link(kiln); try hasDraft("draft for Kiln")
        app.terminate(); app.launch(); try hasDraft("draft for Kiln")
        capture("D2-independent-thread-draft"); try await noSends()
    }
    func testD03LargestText() async throws {
        try await fresh()
        _ = try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        for appearance in ["light", "night"] {
            app.terminate()
            app.launchArguments = ["--api-url", "http://127.0.0.1:56473", "--appearance", appearance, "-AppleLanguages", "(en)"]
            app.launch()
            XCTAssertTrue(input().waitForExistence(timeout: 30))
            capture("D3-\(appearance)-largest-before-keyboard")
            input().tap()
            if appearance == "light" { input().typeText("Large text draft") }
            else { input().typeText("x" + XCUIKeyboardKey.delete.rawValue) }
            try hasDraft("Large text draft"); keyboardClear("D3-\(appearance)-largest-keyboard")
            let identity = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Maya's AI")).firstMatch
            XCTAssertTrue(identity.exists && identity.isHittable, "Authorship must stay available while composing")
            XCUIDevice.shared.orientation = .landscapeLeft
            try hasDraft("Large text draft"); keyboardClear("D3-\(appearance)-largest-landscape")
            XCUIDevice.shared.orientation = .portrait
        }
        try await noSends()
    }
    func testD04SendRecovery() async throws {
        try await fresh()
        input().tap(); input().typeText("accepted draft"); app.buttons["Send"].tap()
        try await accepted("accepted draft"); emptyInput()
        app.terminate(); app.launch(); emptyInput(); try await storage("accepted draft", count: 0)

        try await fresh()
        try await faults([["method": "POST", "match": "/messages$", "status": 422]])
        input().tap(); input().typeText("rejected draft"); app.buttons["Send"].tap()
        try reveal("Keep editing")
        app.terminate(); try await faults([]); app.launch(); try hasDraft("rejected draft")
        try reveal("Keep editing"); app.buttons["Keep editing"].tap()
        try hasDraft("rejected draft"); try await checkSent("rejected draft", count: 0)

        try await fresh()
        try await faults([["method": "POST", "match": "/messages$", "drop": true]])
        input().tap(); input().typeText("retry original draft"); app.buttons["Send"].tap()
        try reveal("Retry")
        app.terminate(); try await faults([]); app.launch(); try hasDraft("retry original draft")
        try reveal("Retry")
        try await checkSent("retry original draft", count: 0)
        app.buttons["Retry"].tap(); try await accepted("retry original draft"); emptyInput()
        let retryPosts = try await messagePosts()
        XCTAssertGreaterThanOrEqual(retryPosts.count, 2)
        XCTAssertEqual(Set(retryPosts.compactMap { $0["commandKeyHash"] as? String }).count, 1, "Retry must keep the original key")

        try await fresh()
        try await faults([
            ["method": "POST", "match": "/messages$", "dropResponse": true],
            ["method": "GET", "match": "/conversations/[^/]+/[^/]+$", "delayMs": 15000],
            ["method": "POST", "match": "/messages/status$", "delayMs": 15000]
        ])
        input().tap(); input().typeText("response lost draft"); app.buttons["Send"].tap()
        try await accepted("response lost draft")
        app.terminate(); try await faults([]); app.launch(); emptyInput()
        try await checkSent("response lost draft", count: 1)
        try await checkPosts(1)
        try await storage("response lost draft", count: 0); capture("D4-accepted-response-lost-recovered")
    }
    func testD04RejectedRetry() async throws {
        try await fresh()
        try await faults([["method": "POST", "match": "/messages$", "status": 422]])
        input().tap(); input().typeText("retry rejected draft"); app.buttons["Send"].tap()
        try reveal("Keep editing"); try reveal("Retry")
        try await faults([])
        app.buttons["Retry"].tap(); try await accepted("retry rejected draft"); emptyInput()
        let posts = try await messagePosts()
        XCTAssertEqual(posts.count, 2)
        XCTAssertEqual(Set(posts.compactMap { $0["commandKeyHash"] as? String }).count, 1)
        try await storage("retry rejected draft", count: 0)
        capture("D4-rejected-message-retry")
    }
    func testD07BoundaryAndCiphertext() async throws {
        try await fresh()
        let marker = String(repeating: "draft7", count: 334)
        input().tap(); input().typeText(marker)
        try hasDraft(String(marker.prefix(2000)))
        try await storage("draft7draft7", count: 1)
        app.terminate(); app.launch(); try hasDraft(String(marker.prefix(2000)))
        try await noSends(); capture("D7-boundary-restored")
    }
    func testD05AuthorizationAndReplacement() async throws {
        try await fresh()
        input().tap(); input().typeText("signed out draft")
        try await storage("signed out draft", count: 1)
        try await link("/identity/account", thread: false)
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30)); app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 30))
        try await storage("signed out draft", count: 0)
        app.buttons["continue-with-pantopus"].tap()
        try chooseActor("Devon")
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30))
        try await link(maya); emptyInput()
        input().tap(); input().typeText("other account draft")
        try await link("/identity/account", thread: false)
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30)); app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 30)); app.buttons["continue-with-pantopus"].tap()
        try chooseActor("Priya")
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30))
        try await link(maya, thread: false)
        try await waitRead(403)
        XCTAssertTrue(app.staticTexts["Conversation unavailable"].waitForExistence(timeout: 30))
        XCTAssertFalse(input().exists); try await storage("other account draft", count: 0)

        for status in [401, 403, 404] {
            try await fresh(); input().tap(); input().typeText("denied draft \(status)")
            app.terminate()
            try await faults([["method": "GET", "match": "/conversations/[^/]+/[^/]+$", "status": status]])
            app.launch(); try await waitRead(status)
            XCTAssertTrue(app.staticTexts["Conversation unavailable"].waitForExistence(timeout: 30))
            XCTAssertFalse(input().exists); try await storage("denied draft", count: 0)
            app.terminate(); try await faults([]); app.launch(); emptyInput()
        }
        try await fresh(); input().tap(); input().typeText("former conversation draft")
        app.terminate()
        _ = try await control("/__harness/threads/maya/recreate", body: [:])
        app.launch(); emptyInput(); try await storage("former conversation draft", count: 0)
        try await noSends(); capture("D5-recreated-thread-without-old-draft")
    }
    func testD08NewTextDuringSend() async throws {
        try await fresh()
        try await faults([["method": "POST", "match": "/messages$", "delayMs": 10000]])
        let original = "older pending draft"
        input().tap(); input().typeText(original); app.buttons["Send"].tap()
        input().tap(); input().typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: original.count) + "newer unsent draft")
        try hasDraft("newer unsent draft"); try await accepted(original)
        app.terminate(); try await faults([]); app.launch(); try hasDraft("newer unsent draft")
        try await checkSent(original, count: 1)
        try await checkSent("newer unsent draft", count: 0)
        try await checkPosts(1)
        try await storage("newer unsent draft", count: 1); capture("D8-new-text-preserved")
    }
}
