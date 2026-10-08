import XCTest

/// Opt-in acceptance against a running, preserved development backend. This
/// launches the shipping app and uses its real sign-in, storage and API clients.
/// No account, consent, publication, message or provider response is seeded here.
@MainActor
final class ConnectedJourneyTests: XCTestCase {
    func testPublishedConversationSurvivesNativeRelaunch() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let origin = environment["QELVORA_E2E_API_URL"],
              let destination = environment["QELVORA_E2E_THREAD"],
              let actor = environment["QELVORA_E2E_ACTOR"],
              let creator = environment["QELVORA_E2E_CREATOR"] else {
            throw XCTSkip("Requires an explicitly selected running development journey.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        let appearance = environment["QELVORA_E2E_APPEARANCE"] ?? "light"
        let baseArguments = ["--api-url", origin, "--appearance", appearance, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchArguments = baseArguments + ["--return-to", destination]
        app.launch()
        defer { capture(app, name: "Connected-final-state") }

        let welcome = app.buttons["continue-with-pantopus"]
        if welcome.waitForExistence(timeout: 5) {
            if !welcome.isHittable { app.swipeUp() }
            welcome.tap()
            let account = app.buttons[actor]
            XCTAssertTrue(account.waitForExistence(timeout: 15))
            if !account.isHittable { app.swipeUp() }
            account.tap()
        }
        let composer = app.textFields["Message \(creator)'s AI"]
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Ask \(creator) to step in"].isHittable)
        XCTAssertFalse(app.buttons["Send"].isEnabled)
        if let expected = environment["QELVORA_E2E_LATEST_TEXT"] {
            let reply = app.staticTexts[expected]
            XCTAssertTrue(reply.waitForExistence(timeout: 10))
            XCTAssertTrue(reply.isHittable)
            XCTAssertLessThanOrEqual(reply.frame.maxY, composer.frame.minY)
        }
        capture(app, name: "Connected-published-conversation")

        let citation = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Read the original passage")).firstMatch
        for _ in 0..<16 {
            if citation.exists && citation.isHittable { break }
            app.scrollViews.firstMatch.swipeDown()
        }
        XCTAssertTrue(citation.exists && citation.isHittable)
        let readingPosition = citation.frame.midY
        // Span the real 15-second thread refresh while reading older history.
        Thread.sleep(forTimeInterval: 16)
        XCTAssertTrue(citation.isHittable)
        XCTAssertEqual(citation.frame.midY, readingPosition, accuracy: 2)
        capture(app, name: "Connected-history-position-after-refresh")
        citation.tap()
        XCTAssertTrue(app.staticTexts["Original source"].waitForExistence(timeout: 15))
        capture(app, name: "Connected-original-source")

        // A process restart must restore the genuine saved session and exact
        // destination, without a test-created credential or forced return path.
        app.terminate()
        app.launchArguments = baseArguments
        app.launch()
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        app.buttons["Me and privacy"].tap()
        let withdraw = app.buttons["Withdraw AI provider consent"]
        XCTAssertTrue(withdraw.waitForExistence(timeout: 15))
        for _ in 0..<8 {
            if withdraw.isHittable { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(withdraw.isHittable)
        capture(app, name: "Connected-current-provider-consent")
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name; image.lifetime = .keepAlways; add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
    }
}
