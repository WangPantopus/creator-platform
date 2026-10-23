import XCTest

/// Navigation against lane 2's disposable real API and PostgreSQL. Only the
/// development identity and model provider are synthetic. No API harness reset.
@MainActor
final class Lane7StackNavigationFlow: XCTestCase {
    /// Operated C1 journey against the real backend/database, with only the
    /// external credential provider replaced by lane 1's fake issuer.
    func testNativeSignInOnRealStack() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let api = environment["QELVORA_SIGNIN_STACK_API"],
              let provider = environment["QELVORA_SIGNIN_FAKE_PROVIDER"] else {
            throw XCTSkip("Requires a disposable C1 stack and its fake provider.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        let identityProvider = environment["QELVORA_SIGNIN_PROVIDER"] ?? "apple"
        guard ["apple", "google"].contains(identityProvider) else { throw XCTSkip("Use apple or google for the fake credential edge.") }
        let arguments = ["--api-url", api, "--appearance", "light", "--return-to", "/identity/account",
                         "--harness-native-provider", identityProvider,
                         "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        let subject = "native-ios-" + UUID().uuidString.lowercased()
        print("Native sign-in synthetic subject: \(subject)")
        // Cancel the app attempt at the fake credential edge, then return its
        // signed proof. The stale proof must never create an age step/session.
        app.launchArguments = arguments + ["--harness-reset", "--harness-native-sub", subject + "-cancelled",
            "--harness-provider-url", provider, "--harness-cancel-native-before-proof"]
        app.launch()
        XCTAssertTrue(app.buttons["sign-in-" + identityProvider].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.textFields["sign-in-birth-date"].exists)
        XCTAssertFalse(app.buttons["Sign out"].exists)
        let cancelled = XCTAttachment(screenshot: app.screenshot()); cancelled.name = "native-sign-in-cancelled-late-proof"; cancelled.lifetime = .keepAlways; add(cancelled)
        app.terminate()
        app.launchArguments = arguments + ["--harness-reset", "--harness-native-sub", subject, "--harness-provider-url", provider]
        app.launch()
        let birthDate = app.textFields["sign-in-birth-date"]
        XCTAssertTrue(birthDate.waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["Sign out"].exists)
        birthDate.tap(); birthDate.typeText("2001-02-30")
        app.buttons["sign-in-confirm-age"].tap()
        XCTAssertTrue(birthDate.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Sign out"].exists)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 10))
        XCTAssertFalse(birthDate.exists)
        app.terminate(); app.launch()
        XCTAssertTrue(birthDate.waitForExistence(timeout: 30))
        XCTAssertEqual(birthDate.value as? String, "YYYY-MM-DD")
        birthDate.tap(); birthDate.typeText("1990-01-01")
        app.buttons["sign-in-confirm-age"].tap()
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30))
        let adult = XCTAttachment(screenshot: app.screenshot()); adult.name = "native-sign-in-adult"; adult.lifetime = .keepAlways; add(adult)
        app.terminate(); app.launchArguments = arguments; app.launch()
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 30))
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 30))
        app.terminate()
        app.launchArguments = arguments + ["--harness-reset", "--harness-native-sub", subject + "-teen", "--harness-provider-url", provider]
        app.launch()
        XCTAssertTrue(birthDate.waitForExistence(timeout: 30))
        birthDate.tap(); birthDate.typeText("2015-01-01")
        app.buttons["sign-in-confirm-age"].tap()
        XCTAssertTrue(app.staticTexts["This app is for adults"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.buttons["Sign out"].exists)
        XCTAssertFalse(app.buttons["continue-with-pantopus"].exists)
        app.buttons["What we keep, and what we don't"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "We never store a date of birth")).firstMatch.waitForExistence(timeout: 5))
        let teen = XCTAttachment(screenshot: app.screenshot()); teen.name = "native-sign-in-under-18"; teen.lifetime = .keepAlways; add(teen)
    }
    /// Actual signed Note, real Content authorization. The external identity
    /// assertion and membership grant are the existing disposable-stack edges.
    func testContentPresenceOnRealStack() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let api = environment["QELVORA_PRESENCE_STACK_API"],
              let creator = environment["QELVORA_PRESENCE_CREATOR"],
              let fan = environment["QELVORA_PRESENCE_MEMBER_FAN"],
              let outsider = environment["QELVORA_PRESENCE_OUTSIDER_FAN"],
              let text = environment["QELVORA_PRESENCE_NOTE_TEXT"] else { throw XCTSkip("Requires a signed, current members Note on a disposable stack.") }
        continueAfterFailure = false
        let app = XCUIApplication()
        let arguments = ["--api-url", api, "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "verification reviewer", "--return-to", "/threads/" + creator + "/" + fan]
        app.launch()
        let note = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 30))
        XCTAssertTrue(note.label.hasPrefix("Maya"), "The spoken author precedes the full Note body.")
        for _ in 0..<7 { try await Task.sleep(for: .seconds(1)); XCTAssertTrue(note.exists, "Healthy refresh keeps the Note visible across the five-second UI freshness window.") }
        print("Native real C4 accessible Note: \(note.label)")
        let member = XCTAttachment(screenshot: app.screenshot()); member.name = "native-c4-real-member-note"; member.lifetime = .keepAlways; add(member)
        let signed = app.buttons["Signed by Maya. Open the verification page"]
        XCTAssertTrue(signed.waitForExistence(timeout: 5)); signed.tap()
        XCTAssertTrue(app.staticTexts["Signature verification"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Your private replies"].exists)
        app.terminate(); app.launch()
        XCTAssertTrue(note.waitForExistence(timeout: 30)); note.tap()
        XCTAssertTrue(app.staticTexts["Your private replies"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Me and privacy"].exists, "The Note opens the Content/private-reply route.")
        app.terminate()
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "support reviewer", "--return-to", "/threads/" + creator + "/" + outsider]
        app.launch()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        try await Task.sleep(for: .seconds(4))
        XCTAssertFalse(note.exists, "An outsider cannot receive the members Note in C4.")
        let refused = XCTAttachment(screenshot: app.screenshot()); refused.name = "native-c4-real-outsider"; refused.lifetime = .keepAlways; add(refused)
    }

    /// UI failure/lifecycle/pagination/reaction checks only. Harness reactions
    /// are explicit fixtures, not qualification of Trust review or signing.
    func testContentPresenceLifecycleInHarness() async throws {
        guard let api = ProcessInfo.processInfo.environment["QELVORA_PRESENCE_HARNESS_API"] else { throw XCTSkip("Requires the owned lane-7 presence harness.") }
        continueAfterFailure = false
        func control(_ path: String, _ body: [String: Any] = [:]) async throws -> [String: Any] {
            var request = URLRequest(url: URL(string: api + "/__harness/" + path)!)
            request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            return try JSONSerialization.jsonObject(with: data) as! [String: Any]
        }
        _ = try await control("reset")
        let seeded = try await control("threads/maya/presence", ["mode": "live"])
        let reactionLabel = (seeded["items"] as! [[String: Any]])[1]["authorLabel"] as! String
        let app = XCUIApplication()
        let route = "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001"
        let arguments = ["--api-url", api, "--appearance", "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "Devon", "--return-to", route]
        app.launch()
        let note = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Native C4 fixture: a signed Note.")).firstMatch
        let reaction = app.buttons[reactionLabel]
        XCTAssertTrue(note.waitForExistence(timeout: 30)); XCTAssertTrue(reaction.waitForExistence(timeout: 10))
        XCTAssertTrue(note.label.hasPrefix("Maya")); XCTAssertTrue(note.label.contains("The kiln opens at nine 🔥"))
        for _ in 0..<7 { try await Task.sleep(for: .seconds(1)); XCTAssertTrue(note.exists); XCTAssertTrue(reaction.exists) }
        print("Native fixture C4 accessible Note: \(note.label)")
        let live = XCTAttachment(screenshot: app.screenshot()); live.name = "native-c4-note-and-own-reaction-fixture"; live.lifetime = .keepAlways; add(live)
        _ = try await control("faults", ["rules": [["match": "/v1/content/.*/presence", "status": 503, "remaining": -1]]])
        let unavailable = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Content could not be refreshed")).firstMatch
        XCTAssertTrue(unavailable.waitForExistence(timeout: 10)); XCTAssertFalse(note.exists); XCTAssertFalse(reaction.exists)
        _ = try await control("faults", ["rules": []])
        XCTAssertTrue(note.waitForExistence(timeout: 10)); XCTAssertTrue(reaction.waitForExistence(timeout: 10))
        _ = try await control("threads/maya/presence", ["mode": "empty_first"])
        try await Task.sleep(for: .seconds(3))
        XCTAssertFalse(note.exists); XCTAssertFalse(reaction.exists)
        let earlier = app.buttons["EARLIER"]
        for _ in 0..<8 { if earlier.isHittable { break }; app.swipeDown() }
        XCTAssertTrue(earlier.isHittable); earlier.tap()
        for _ in 0..<8 { if note.exists { break }; app.swipeUp() }
        XCTAssertTrue(note.waitForExistence(timeout: 10)); XCTAssertTrue(reaction.waitForExistence(timeout: 10))
        _ = try await control("threads/maya/presence", ["mode": "removed"])
        try await Task.sleep(for: .seconds(3))
        XCTAssertFalse(note.exists); XCTAssertFalse(reaction.exists)
        _ = try await control("threads/maya/presence", ["mode": "live"])
        XCTAssertTrue(note.waitForExistence(timeout: 10))
        XCUIDevice.shared.press(.home)
        _ = try await control("faults", ["rules": [["match": "/v1/content/.*/presence", "delayMs": 6000, "remaining": -1]]])
        app.activate()
        try await Task.sleep(for: .seconds(1))
        XCTAssertFalse(note.exists, "Foreground restoration waits for fresh Content authority.")
        try await Task.sleep(for: .seconds(6))
        XCTAssertFalse(note.exists, "An over-budget read cannot renew the five-second UI freshness window.")
        _ = try await control("faults", ["rules": []])
        XCTAssertTrue(note.waitForExistence(timeout: 15))
        _ = try await control("sessions", ["account": "devon", "action": "revoke"])
        try await Task.sleep(for: .seconds(5))
        XCTAssertFalse(note.exists); XCTAssertFalse(reaction.exists)
        app.terminate()
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "Priya", "--return-to", route]
        app.launch()
        XCTAssertTrue(app.staticTexts["Conversation unavailable"].waitForExistence(timeout: 30))
        XCTAssertFalse(note.exists); XCTAssertFalse(reaction.exists)
        _ = try await control("threads/maya/presence", ["mode": "deep"])
        app.terminate()
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "Devon", "--return-to", route]
        app.launch()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        for _ in 0..<7 {
            for _ in 0..<8 { if earlier.isHittable { break }; app.swipeDown() }
            XCTAssertTrue(earlier.isHittable); earlier.tap()
            try await Task.sleep(for: .milliseconds(600))
        }
        for _ in 0..<8 { if note.exists { break }; app.swipeUp() }
        XCTAssertTrue(note.waitForExistence(timeout: 10)); XCTAssertTrue(reaction.waitForExistence(timeout: 10))
        print("Native C4: seven older cursors advance beyond the five-page retained window.")
    }

    func testNavigationOnRealStack() async throws {
        guard ProcessInfo.processInfo.environment["LANE7_REAL_STACK"] == "1" else {
            throw XCTSkip("Requires lane 7's disposable real stack with Maya and fan one.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        let arguments = ["--api-url", "http://127.0.0.1:56471", "--appearance", "light",
                         "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchArguments = arguments + ["--harness-reset", "--harness-actor", "actor one", "--return-to", "/home"]
        app.launch()
        app.launchArguments = arguments
        func at(_ value: String) {
            XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", value)).firstMatch.waitForExistence(timeout: 30))
            print("LANE7 real stack: \(value)")
        }
        func thread() {
            XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
            XCTAssertTrue(app.buttons["Send"].exists)
            print("LANE7 real stack: Maya thread")
        }
        func edge() {
            let origin = app.coordinate(withNormalizedOffset: .zero)
            origin.withOffset(CGVector(dx: 10, dy: 500)).press(forDuration: 0.05,
                thenDragTo: origin.withOffset(CGVector(dx: 240, dy: 502)))
        }
        func link(_ path: String) async throws {
            var request = URLRequest(url: URL(string: "http://127.0.0.1:56475/link")!)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["path": path])
            let (_, response) = try await URLSession.shared.data(for: request)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            let open = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Open"]
            if open.waitForExistence(timeout: 3) { open.tap() }
        }
        func capture(_ name: String) {
            let item = XCTAttachment(screenshot: app.screenshot())
            item.name = name; item.lifetime = .keepAlways; add(item)
        }
        func openMaya() {
            let row = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Maya")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 30)); row.tap(); thread()
        }
        at("Your people"); openMaya(); capture("real-stack-thread")
        app.buttons["Back"].tap(); at("Your people")
        openMaya(); XCUIDevice.shared.press(.home)
        try await link("/identity/account"); at("Your account")
        edge(); thread(); capture("real-stack-warm-link-back")
        app.terminate(); app.launch(); thread()
        app.buttons["Back"].tap(); at("Your people"); capture("real-stack-restored-parent")
        // Cold OS launch takes its API origin from the debug build setting.
        app.terminate(); try await link("/creators/maya"); at("Official means")
        edge()
        XCTAssertTrue(app.textFields["Search creators"].waitForExistence(timeout: 30))
        edge(); at("Your people"); capture("real-stack-cold-link-home")
    }
}
