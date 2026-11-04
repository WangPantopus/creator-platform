import XCTest

/// Opt-in: an open thread outlives its access token (stack-expiry.mjs on the
/// real stack, e7-8-expiry.mjs on lane 7's fake API). The scenario launches the
/// app into the thread and keeps it open past the token's life; these flows
/// only attach to that running app and never launch it, so the thread stays the
/// one the scenario opened. E1 types the draft, E2 reads what is still there.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --expiry E1|E2
@MainActor
final class Lane7ExpiryFlows: XCTestCase {
    private let environment = ProcessInfo.processInfo.environment

    /// Every flow skips before it touches anything: CI runs this target with no scenario.
    private func attach() throws -> (XCUIApplication, XCUIElement, String) {
        guard environment["LANE7_EXPIRY"] == "1", let draft = environment["LANE7_EXPIRY_DRAFT"] else {
            throw XCTSkip("Opt in with LANE7_EXPIRY=1 from lane 7's stack-expiry.mjs.")
        }
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.activate()
        let field = app.textViews.matching(NSPredicate(format: "label BEGINSWITH 'Message ' OR label BEGINSWITH 'Reply to '")).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 30), "The open thread's composer")
        return (app, field, draft)
    }

    func testE01TypeDraft() throws {
        let (_, field, draft) = try attach()
        field.tap(); field.typeText(draft)
        let typed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", draft), object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [typed], timeout: 20), .completed, "The draft is in the composer")
    }

    func testE02ThreadAndDraftKept() throws {
        let (app, field, draft) = try attach()
        XCTAssertEqual(field.value as? String, draft, "The draft is still in the composer")
        // The thread is still the one shown before: a message it carried then.
        if let seen = environment["LANE7_EXPIRY_SEEN"] {
            XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", seen)).firstMatch.waitForExistence(timeout: 10), "The thread's earlier message")
        }
        for denial in ["Your account changed. Open this conversation again.", "Reconnect to refresh this conversation.", "Sign in to continue"] {
            XCTAssertFalse(app.staticTexts[denial].exists, denial)
        }
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = "E2-thread-and-draft-kept"; shot.lifetime = .keepAlways; add(shot)
    }
}
