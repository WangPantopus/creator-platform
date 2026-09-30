import XCTest

@MainActor
final class FoundationFlowTests: XCTestCase {
    func testWelcomeSignInFailsClosedInBothThemes() {
        for theme in ["Light", "Dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["--appearance", theme == "Dark" ? "night" : "light", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
            app.launch()
            let button = app.buttons["continue-with-pantopus"]
            XCTAssertTrue(button.waitForExistence(timeout: 10))
            if !button.isHittable { app.swipeUp() }
            XCTAssertTrue(button.isHittable)
            capture(app, name: "Welcome-\(theme)")
            button.tap()
            XCTAssertTrue(app.staticTexts["Pantopus sign-in is not connected in this local build."].waitForExistence(timeout: 5))
            XCTAssertTrue(button.isEnabled)
            XCTAssertFalse(app.textFields["handle"].exists)
            capture(app, name: "SignIn-unconfigured-\(theme)")
            app.terminate()
        }
    }

    func testCreatorAndAIRemainLabeledInNativeCatalog() {
        let app = XCUIApplication()
        app.launchArguments = ["--catalog-component", "Message", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Message"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Maya's AI"].exists)
        XCTAssertTrue(app.staticTexts["Maya"].exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Signed by Maya")).firstMatch.exists)
        capture(app, name: "Native-Message-identities")
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
