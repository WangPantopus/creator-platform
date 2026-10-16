import XCTest

/// Opt-in, operated WP 7.4 P3 journeys (the creator seal on creator-colored
/// buttons) against lane 7's fake API. The seal is decorative and hidden from
/// screen readers, so each flow captures the screen for visual review.
/// node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --seal
@MainActor
final class Lane7SealFlows: XCTestCase {
    private let app = XCUIApplication()
    private func thread(_ n: Int) -> String { "/threads/c1000000-0000-4000-8000-00000000000\(n)/f1000000-0000-4000-8000-000000000001" }
    private func arguments(_ appearance: String) -> [String] { ["--api-url", "http://127.0.0.1:56473", "--appearance", appearance, "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] }

    private func control(_ path: String, body: [String: Any], port: Int = 56473) async throws {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:\(port)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, path)
    }

    /// Every flow skips before it calls anything: CI runs this target with no
    /// harness and no link driver.
    private func optIn() throws {
        guard ProcessInfo.processInfo.environment["LANE7_SEAL"] == "1" else {
            throw XCTSkip("Opt in with LANE7_SEAL=1 against lane 7's disposable harness.")
        }
    }

    private func open(_ path: String, actor: String = "devon", appearance: String = "light", reset: Bool = true) async throws {
        try optIn()
        continueAfterFailure = false
        app.terminate()
        if reset { try await control("/__harness/reset", body: [:]) }
        app.launchArguments = arguments(appearance) + (reset ? ["--harness-reset", "--harness-actor", actor] : []) + ["--return-to", path]
        app.launch()
        app.launchArguments = arguments(appearance)
    }

    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }

    private func button(_ contains: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
    }

    /// S3.1: each creator's own letter on the step-in seal; Kiln Club is
    /// human-active, so its Send is creator-colored and carries "K", and there
    /// is no step-in button (the composer states, P3).
    func testS01SealPerCreator() async throws {
        for (n, name) in [(1, "Maya"), (2, "Kiln Club"), (3, "Glazeco")] {
            try await open(thread(n))
            if n == 2 {
                XCTAssertTrue(app.textViews["Reply to Kiln Club"].waitForExistence(timeout: 30))
                XCTAssertFalse(button("Ask Kiln Club to step in").exists)
            } else { XCTAssertTrue(button("Ask \(name) to step in").waitForExistence(timeout: 30)) }
            capture("S1-\(name)")
        }
    }

    /// Scrolls the thread with slow drags (a fling skips rows) until the text's
    /// row is wholly inside the thread's visible area, or centered in it when
    /// taller; `up` reveals older rows while the row is not yet laid out.
    private func reveal(_ contains: String, up: Bool = true) {
        let scroll = app.scrollViews.firstMatch
        let target = scroll.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", contains)).firstMatch
        let area = scroll.frame
        let origin = app.coordinate(withNormalizedOffset: .zero)
        // A finger move of 2 × step scrolls the content about that far.
        func drag(_ step: CGFloat) {
            let step = max(-area.height * 0.3, min(area.height * 0.3, step))
            origin.withOffset(CGVector(dx: area.midX, dy: area.midY - step))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: area.midX, dy: area.midY + step)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        var last = CGRect.null
        for _ in 0..<40 {
            guard target.exists else { drag(up ? area.height : -area.height); continue }
            let frame = target.frame
            if area.contains(frame) || abs(frame.midY - area.midY) < area.height * 0.1 || frame == last { break }
            last = frame
            drag((area.midY - frame.midY) / 2)
        }
        XCTAssertTrue(target.exists && area.intersects(target.frame), "Not on screen: \(contains)")
    }

    /// S3.2: at the largest text every seal letter stays inside its circle:
    /// the step-in button and Send, the in-thread "is here" line (Kiln Club)
    /// and a reaction chip (Maya).
    func testS02LargestText() async throws {
        try optIn()
        try await control("/content-size", body: ["size": "accessibility-extra-extra-extra-large"], port: 56475)
        for appearance in ["light", "night"] {
            try await open(thread(2), appearance: appearance)
            let send = app.buttons["Send"]
            XCTAssertTrue(send.waitForExistence(timeout: 30))
            for _ in 0..<10 where !send.isHittable { app.swipeUp() }
            capture("S2-largest-\(appearance)")
            reveal("in this conversation now")
            capture("S2-largest-strip-\(appearance)")
        }
        try await open(thread(1))
        let stepIn = button("Ask Maya to step in")
        XCTAssertTrue(stepIn.waitForExistence(timeout: 30))
        reveal("Ask Maya to step in", up: false)
        capture("S2-largest-step-in")
        reveal("Maya reacted to your reply")
        capture("S2-largest-reaction")
        try await control("/content-size", body: ["size": "large"], port: 56475)
    }

    /// S3.3: a name that starts with an emoji and a lowercase letter: "F".
    func testS03EmojiLowercaseName() async throws {
        try await open("/discover", actor: "priya")
        let search = app.textFields["Search creators"]
        XCTAssertTrue(search.waitForExistence(timeout: 30))
        search.tap(); search.typeText("fern\n")
        try await tap("🌿 fern studio")
        try await tap("Message 🌿 fern studio's AI")
        try await tap("Start with 🌿 fern studio's AI")
        XCTAssertTrue(button("Ask 🌿 fern studio to step in").waitForExistence(timeout: 30))
        capture("S3-emoji-lowercase-name")
    }

    /// Reaches a button below the fold and taps it once it is enabled: the
    /// first-conversation button waits for the provider terms.
    private func tap(_ label: String) async throws {
        let target = button(label)
        XCTAssertTrue(target.waitForExistence(timeout: 30), label)
        for _ in 0..<8 where !target.isHittable { app.swipeUp() }
        for _ in 0..<200 where !target.isEnabled { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertTrue(target.isHittable && target.isEnabled, label)
        target.tap()
    }
}
