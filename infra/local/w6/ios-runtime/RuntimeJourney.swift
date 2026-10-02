import XCTest

/// Operates the shipping app against the separately launched W6 development API.
/// This is an opt-in local UI driver, outside the canonical test target. It does
/// not install credentials, inject sessions, or substitute network responses.
@MainActor
final class W6RuntimeJourney: XCTestCase {
    func testActualFanSignIn() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", "/identity/account"]
        app.launch()

        let welcome = app.buttons["continue-with-pantopus"]
        if welcome.waitForExistence(timeout: 5) {
            if !welcome.isHittable { app.swipeUp() }
            welcome.tap()
            let actor = app.buttons["Development actor two"]
            XCTAssertTrue(actor.waitForExistence(timeout: 15), "The actual API must offer its development actor.")
            actor.tap()
        }

        XCTAssertTrue(app.staticTexts["Your account"].waitForExistence(timeout: 15), "The actual sign-in must reach the product account screen.")
        XCTAssertTrue(app.staticTexts["@w6_local_fan"].exists, "The app must show the fan profile persisted in the W6 database.")
        capture(app, name: "W6-actual-local-fan-account")
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
