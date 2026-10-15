import XCTest

/// Navigation against lane 2's disposable real API and PostgreSQL. Only the
/// development identity and model provider are synthetic. No API harness reset.
@MainActor
final class Lane7StackNavigationFlow: XCTestCase {
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
