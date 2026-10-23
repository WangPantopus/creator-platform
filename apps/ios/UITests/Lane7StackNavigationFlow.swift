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
