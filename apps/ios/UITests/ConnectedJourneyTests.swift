import XCTest

/// Opt-in acceptance against a running, preserved development backend. This
/// launches the shipping app and uses its real sign-in, storage and API clients.
/// No account, consent, publication, message or provider response is seeded here.
@MainActor
final class ConnectedJourneyTests: XCTestCase {
    /// Real UI reuse of a question explicitly included earlier in the same
    /// preserved development journey; no consent, source or identity fixture.
    func testComparisonChoiceAndQuestion() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let origin = environment["QELVORA_E2E_API_URL"],
              let destination = environment["QELVORA_E2E_THREAD"],
              let source = environment["QELVORA_E2E_COMPARISON_MESSAGE_ID"] else {
            throw XCTSkip("Requires an explicitly selected existing comparison question.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--api-url", origin, "--return-to", destination,
                               "--appearance", environment["QELVORA_E2E_APPEARANCE"] ?? "light",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        defer { capture(app, name: "Comparison-final-state") }
        let question = app.buttons["comparison-options-" + source]
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        for _ in 0..<20 {
            if question.exists && question.isHittable { break }
            app.scrollViews.firstMatch.swipeDown()
        }
        XCTAssertTrue(question.exists && question.isHittable)
        question.tap()
        XCTAssertTrue(app.staticTexts["Allowed for this creator"].waitForExistence(timeout: 20))
        let include = app.buttons["Include this question"]
        for _ in 0..<8 {
            if include.isHittable { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(include.isHittable)
        capture(app, name: "Comparison-choice")
        include.tap()
        let result = app.staticTexts["A general version of this question is saved for AI comparisons. You can withdraw your choice in Me and privacy."]
        XCTAssertTrue(result.waitForExistence(timeout: 70))
        capture(app, name: "Comparison-question-included")
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["Me and privacy"].waitForExistence(timeout: 30))
        app.buttons["Me and privacy"].tap()
        let choice = app.staticTexts["Allowed for this creator"]
        for _ in 0..<12 {
            if choice.exists && choice.isHittable { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(choice.exists && choice.isHittable)
        capture(app, name: "Comparison-privacy-choice")
    }

    /// Read-only check of the real reply while the software keyboard is open.
    func testKeyboardKeepsLatestReply() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let origin = environment["QELVORA_E2E_API_URL"],
              let destination = environment["QELVORA_E2E_THREAD"],
              let creator = environment["QELVORA_E2E_CREATOR"],
              let expected = environment["QELVORA_E2E_LATEST_TEXT"] else {
            throw XCTSkip("Requires an explicitly selected running development journey.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--api-url", origin, "--return-to", destination,
                               "--appearance", environment["QELVORA_E2E_APPEARANCE"] ?? "light",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let composer = app.textFields["Message \(creator)'s AI"]
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        composer.tap(); composer.typeText("Unsent keyboard check")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        capture(app, name: "Read-keyboard-before-visibility-check")
        let reply = app.staticTexts.matching(NSPredicate(format: "label == %@", expected)).allElementsBoundByIndex.last
        XCTAssertTrue(reply?.isHittable == true)
        XCTAssertTrue(app.buttons["Ask \(creator) to step in"].isHittable)
        capture(app, name: "Read-keyboard-visible-reply")
        composer.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Unsent keyboard check".count))
    }

    /// Explicit opt-in: one real send, no synthetic model or automatic resend.
    func testSendMessageWithKeyboard() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let origin = environment["QELVORA_E2E_API_URL"],
              let destination = environment["QELVORA_E2E_THREAD"],
              let creator = environment["QELVORA_E2E_CREATOR"],
              let prompt = environment["QELVORA_E2E_PROMPT"],
              let expected = environment["QELVORA_E2E_REPLY_CONTAINS"] else {
            throw XCTSkip("Requires an explicitly authorized live development send.")
        }
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--api-url", origin, "--return-to", destination,
                               "--appearance", environment["QELVORA_E2E_APPEARANCE"] ?? "light",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        defer { capture(app, name: "Send-final-state") }
        let composer = app.textFields["Message \(creator)'s AI"]
        XCTAssertTrue(composer.waitForExistence(timeout: 30))
        composer.tap()
        composer.typeText(prompt)
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        let send = app.buttons["Send"]
        XCTAssertTrue(wait(send, predicate: "enabled == true", seconds: 30))
        capture(app, name: "Send-keyboard-ready")
        let started = ProcessInfo.processInfo.systemUptime
        send.tap()
        XCTAssertTrue(wait(composer, predicate: "value != %@", argument: prompt, seconds: 90))
        let accepted = ProcessInfo.processInfo.systemUptime - started
        composer.typeText("Unsent verification draft")
        XCTAssertTrue(wait(send, predicate: "enabled == true", seconds: 90))
        let completed = ProcessInfo.processInfo.systemUptime - started
        XCTAssertEqual(composer.value as? String, "Unsent verification draft")
        // An authorization refresh can conceal and recreate the field. Resume
        // through its actual touch target before editing the retained draft.
        composer.tap()
        composer.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: "Unsent verification draft".count))
        capture(app, name: "Send-keyboard-completed")
        let reply = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[cd] %@", expected)).allElementsBoundByIndex.last
        XCTAssertNotNil(reply)
        XCTAssertTrue(reply?.isHittable == true)
        XCTAssertTrue(app.buttons["Ask \(creator) to step in"].isHittable)
        let timing = XCTAttachment(string: "draftClearedAfterSeconds=\(accepted)\nsendAvailableAfterSeconds=\(completed)\nUI observations; not HTTP timing or percentile qualification.")
        timing.name = "Send-timing"; timing.lifetime = .keepAlways; add(timing)
    }

    private func wait(_ element: XCUIElement, predicate: String, argument: String? = nil, seconds: TimeInterval) -> Bool {
        let condition = argument.map { NSPredicate(format: predicate, $0) } ?? NSPredicate(format: predicate)
        return XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: condition, object: element)], timeout: seconds) == .completed
    }

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
            let reply = app.staticTexts.matching(NSPredicate(format: "label == %@", expected)).firstMatch
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
