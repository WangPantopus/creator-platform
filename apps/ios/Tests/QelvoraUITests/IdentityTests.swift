import XCTest
@testable import QelvoraUI

final class IdentityTests: XCTestCase {
    func testEveryAuthorUsesItsFixedLabel() {
        XCTAssertEqual(AuthorKind.ai.label(), "Maya's AI")
        XCTAssertEqual(AuthorKind.approvedDraft.label(), "Prepared by AI · approved by Maya")
        XCTAssertEqual(AuthorKind.humanCreator.label(), "Maya")
        XCTAssertEqual(AuthorKind.humanBroadcast.label(), "Maya · to Kiln Club members")
        XCTAssertEqual(AuthorKind.team.label(), "Maya's team · Priya")
        XCTAssertEqual(AuthorKind.correction.label(), "Maya's note on this AI reply")
    }

    func testUnknownOrReservedServerMessageKindCannotRenderAsAHuman() {
        for invalid in ["human_call", "ai_call", "ai_video", "fan_agent", "creator", "unknown"] {
            XCTAssertNil(MessageKind(rawValue: invalid))
        }
    }

    func testOnlyCreatorAuthorshipOwnsTheCreatorSurface() {
        XCTAssertEqual(AuthorKind.ai.colorToken(onMaya: false), "ai-ink")
        XCTAssertEqual(AuthorKind.team.colorToken(onMaya: false), "team-ink")
        XCTAssertEqual(AuthorKind.humanCreator.colorToken(onMaya: true), "maya-accent")
        XCTAssertNil(MessageKind.fan.author)
    }

    func testRegistryHonestlyTracksAll53Components() {
        let all = NativeComponentRegistry.implemented + NativeComponentRegistry.pending
        XCTAssertEqual(all.count, 53)
        XCTAssertEqual(Set(all).count, 53)
        XCTAssertEqual(NativeComponentRegistry.implemented.count, 53)
    }

    func testUnconnectedPantopusAdapterDoesNotReturnAnAccount() async {
        do { _ = try await UnavailablePantopusSignIn().signIn(returnTo: "/creators/maya"); XCTFail("Unconnected SSO must not produce an account") }
        catch { XCTAssertTrue(error is PantopusSignInError) }
    }
}
