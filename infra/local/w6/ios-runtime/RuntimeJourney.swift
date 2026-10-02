import XCTest

/// Operates the shipping app against the separately launched W6 development API.
/// This is an opt-in local UI driver, outside the canonical test target. It does
/// not install credentials, inject sessions, or substitute network responses.
@MainActor
final class W6RuntimeJourney: XCTestCase {
    func testActualAvailabilityJourney() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        let destination = "/studio/60000000-0000-4000-8000-000000000001/more"
        func launch(_ target: String) {
            app.terminate()
            app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", target]
            app.launch()
        }
        func signOut() {
            launch("/identity/account")
            XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 15))
            app.buttons["Sign out"].tap()
            XCTAssertTrue(app.buttons["continue-with-pantopus"].waitForExistence(timeout: 15))
        }
        func signIn(_ actor: String) {
            let welcome = app.buttons["continue-with-pantopus"]
            XCTAssertTrue(welcome.waitForExistence(timeout: 15))
            if !welcome.isHittable { app.swipeUp() }
            welcome.tap()
            XCTAssertTrue(app.buttons[actor].waitForExistence(timeout: 15))
            app.buttons[actor].tap()
        }
        // Normalize the actual prior run through product sign-out. A failed
        // owner edit may leave a valid creator credential in Keychain.
        launch("/identity/account")
        if app.buttons["Sign out"].waitForExistence(timeout: 5) { signOut() }
        launch(destination)
        signIn("Development actor two")
        XCTAssertTrue(app.staticTexts["Availability could not be loaded."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Save availability"].isEnabled)
        capture(app, name: "W6-availability-fan-denied")

        signOut()
        launch(destination)
        signIn("Development actor one")
        let handle = app.textFields["Public handle"]
        if handle.waitForExistence(timeout: 5) {
            handle.tap(); handle.typeText("w6_local_creator")
            if !app.buttons["Continue"].isHittable { app.swipeUp() }
            app.buttons["Continue"].tap()
        }
        XCTAssertTrue(app.textFields["availability-zone"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.textFields["availability-zone"].value as? String, "America/Los_Angeles")
        XCTAssertEqual(app.textFields["availability-start-0"].value as? String, "2026-11-01T08:30:00.000Z")
        XCTAssertEqual(app.textFields["availability-start-1"].value as? String, "2026-11-01T09:30:00.000Z")
        capture(app, name: "W6-availability-owner-dst-windows")
        func replace(_ field: XCUIElement, with value: String) {
            field.tap()
            let existing = field.value as? String ?? ""
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count) + value)
        }
        replace(app.textFields["availability-zone"], with: "US/Pacific")
        replace(app.textFields["availability-start-0"], with: "2026-11-01T01:30-07:00")
        replace(app.textFields["availability-end-0"], with: "2026-11-01T01:45-07:00")
        capture(app, name: "W6-availability-owner-minute-offset-alias")
        XCTAssertTrue(app.keyboards.buttons["Done"].exists)
        app.keyboards.buttons["Done"].tap()
        let save = app.buttons["Save availability"]
        for _ in 0..<4 { if save.isHittable { break }; app.swipeUp() }
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true AND hittable == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 10), .completed)
        save.tap()
        XCTAssertTrue(app.staticTexts["Availability saved."].waitForExistence(timeout: 15))
        app.swipeDown()
        XCTAssertEqual(app.textFields["availability-zone"].value as? String, "America/Los_Angeles")
        XCTAssertEqual(app.textFields["availability-start-0"].value as? String, "2026-11-01T08:30:00.000Z")
        capture(app, name: "W6-availability-owner-save")
        launch(destination)
        XCTAssertTrue(app.textFields["availability-zone"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.textFields["availability-zone"].value as? String, "America/Los_Angeles")
        capture(app, name: "W6-availability-owner-cold-return")

        signOut()
        launch("/identity/account")
        signIn("Development actor two")
        XCTAssertTrue(app.staticTexts["@w6_local_fan"].waitForExistence(timeout: 15))
    }

    func testActualRetainedSessionRecovery() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", "/identity/account"]
        app.launch()
        XCTAssertTrue(app.staticTexts["We can't reach your account right now"].waitForExistence(timeout: 25))
        XCTAssertTrue(app.staticTexts["Your session is kept on this device. Try again in a moment."].exists)
        XCTAssertFalse(app.buttons["continue-with-pantopus"].exists)
        capture(app, name: "W6-ios-real-cold-outage-retained")
        app.buttons["Retry"].tap()
        print("W6_ACTUAL_OFFLINE_RETRY_READY_FOR_API_RESTART")
        XCTAssertTrue(app.staticTexts["@w6_local_fan"].waitForExistence(timeout: 90))
        XCTAssertFalse(app.buttons["continue-with-pantopus"].exists)
        capture(app, name: "W6-ios-real-automatic-same-account-recovery")
    }

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

    /// Actual missing-denial-schema failure path; neither account may save.
    func testActualMediaAvailabilityGate() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        func launch(_ target: String) {
            app.terminate()
            app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", target]
            app.launch()
        }
        let destination = "/studio/60000000-0000-4000-8000-000000000001/more"
        launch("/identity/account")
        if app.buttons["Sign out"].waitForExistence(timeout: 5) { app.buttons["Sign out"].tap() }
        let initialWelcome = app.buttons["continue-with-pantopus"]
        XCTAssertTrue(initialWelcome.waitForExistence(timeout: 15))
        if !initialWelcome.isHittable { app.swipeUp() }
        initialWelcome.tap()
        XCTAssertTrue(app.buttons["Development actor two"].waitForExistence(timeout: 15))
        app.buttons["Development actor two"].tap()
        XCTAssertTrue(app.staticTexts["@w6_local_fan"].waitForExistence(timeout: 15))
        launch(destination)
        func assertUnavailable(_ name: String) {
            XCTAssertTrue(app.staticTexts["Availability could not be loaded."].waitForExistence(timeout: 15))
            XCTAssertFalse(app.textFields["availability-zone"].exists)
            let save = app.buttons["Save availability"]
            for _ in 0..<5 { if save.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(save.exists)
            XCTAssertFalse(save.isEnabled)
            capture(app, name: name)
        }
        assertUnavailable("W6-sdk-fan-media-unavailable")
        launch("/identity/account")
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 15))
        app.buttons["Sign out"].tap()
        let welcome = app.buttons["continue-with-pantopus"]
        XCTAssertTrue(welcome.waitForExistence(timeout: 15))
        if !welcome.isHittable { app.swipeUp() }
        welcome.tap()
        XCTAssertTrue(app.buttons["Development actor one"].waitForExistence(timeout: 15))
        app.buttons["Development actor one"].tap()
        // The creator handle was entered through the actual web onboarding.
        XCTAssertTrue(app.staticTexts["Your account"].waitForExistence(timeout: 15))
        launch(destination)
        assertUnavailable("W6-sdk-owner-media-unavailable")

        launch("/identity/account")
        XCTAssertTrue(app.buttons["Sign out"].waitForExistence(timeout: 15))
        app.buttons["Sign out"].tap()
        XCTAssertTrue(welcome.waitForExistence(timeout: 15))
        if !welcome.isHittable { app.swipeUp() }
        welcome.tap()
        XCTAssertTrue(app.buttons["Development actor two"].waitForExistence(timeout: 15))
        app.buttons["Development actor two"].tap()
        XCTAssertTrue(app.staticTexts["@w6_local_fan"].waitForExistence(timeout: 15))
        capture(app, name: "W6-sdk-restored-fan-account")
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Operates the real OS prompt in the shipping private-preview destination.
    /// The calling/publication APIs remain unavailable; no response is replaced.
    func testActualPrivateVoicePermissionDenial() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", "/media/voice"]
        app.launch()
        XCTAssertTrue(app.buttons["Record"].waitForExistence(timeout: 15))
        app.buttons["Record"].tap()
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = system.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        print("W6_ACTUAL_MICROPHONE_PROMPT " + alert.debugDescription)
        capture(system, name: "W6-ios-real-microphone-prompt")
        let deny = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Don't Allow", "Don’t Allow"])).firstMatch
        XCTAssertTrue(deny.exists)
        deny.tap()
        XCTAssertTrue(app.staticTexts["Microphone access is off. Allow it in Settings, then try again."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Pause"].exists)
        capture(app, name: "W6-ios-real-microphone-denied")
    }

    func testActualPrivateVoicePermissionAndCapture() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", "/media/voice"]
        app.launch()
        XCTAssertTrue(app.buttons["Record"].waitForExistence(timeout: 15))
        app.buttons["Record"].tap()
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = system.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        print("W6_ACTUAL_MICROPHONE_PROMPT " + alert.debugDescription)
        XCTAssertTrue(alert.buttons["Allow"].exists)
        alert.buttons["Allow"].tap()
        let recording = app.buttons["Pause"]
        if !recording.waitForExistence(timeout: 15) {
            XCTAssertTrue(app.staticTexts["The microphone is unavailable. Try again."].exists)
            XCTAssertFalse(app.buttons["Play private preview"].exists)
            capture(app, name: "W6-ios-real-microphone-hardware-unavailable")
            print("W6_ACTUAL_MICROPHONE_HARDWARE_UNAVAILABLE_NO_CAPTURE_ACCEPTED")
            return
        }
        let timer = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'seconds recorded'")).firstMatch
        let elapsed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "NOT label BEGINSWITH '0 ' AND NOT label BEGINSWITH '1 '"), object: timer)
        XCTAssertEqual(XCTWaiter.wait(for: [elapsed], timeout: 15), .completed)
        capture(app, name: "W6-ios-real-private-recording")
        app.buttons["Stop and preview"].tap()
        XCTAssertTrue(app.buttons["Play private preview"].waitForExistence(timeout: 15))
        capture(app, name: "W6-ios-real-private-preview")
        app.buttons["Play private preview"].tap()
        app.buttons["Pause preview"].tap()
        app.buttons["Discard recording"].tap()
        XCTAssertTrue(app.buttons["Record"].exists)
        XCTAssertFalse(app.buttons["Play private preview"].exists)
        capture(app, name: "W6-ios-real-private-discard")
        print("W6_ACTUAL_PRIVATE_PREVIEW_ONLY_NOT_HUMAN_PUBLICATION_ACCEPTANCE")
    }
    func testActualUnavailableCallDoesNotAdmit() {
        let app = XCUIApplication(bundleIdentifier: "com.pantopus.qelvora")
        app.launchArguments = ["--api-url", "http://127.0.0.1:4106", "--return-to", "/calls/60000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000006"]
        app.launch()
        XCTAssertTrue(app.staticTexts["This call is unavailable"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Reconnect to refresh this call. Actions are unavailable until access is confirmed."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Enter the waiting room"].exists)
        XCTAssertFalse(XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch.exists)
        capture(app, name: "W6-ios-real-call-unavailable")
        let refresh = app.buttons["Refresh call"]
        if !refresh.isHittable { app.swipeUp() }
        XCTAssertTrue(refresh.isHittable)
        refresh.tap()
        XCTAssertTrue(app.staticTexts["This call is unavailable"].exists)
        XCTAssertFalse(app.buttons["Enter the waiting room"].exists)
        capture(app, name: "W6-ios-real-call-refresh-unavailable")
    }

}
