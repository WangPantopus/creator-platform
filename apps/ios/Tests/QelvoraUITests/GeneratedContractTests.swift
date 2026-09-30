import Foundation
import XCTest
@testable import QelvoraUI

final class GeneratedContractTests: XCTestCase {
    func testIdentityCapabilityRejectsIndependentAccounts() throws {
        let decoder = JSONDecoder()
        let valid = Data(#"{"signInAvailable":false,"localAccountsAllowed":false}"#.utf8)
        XCTAssertFalse(try decoder.decode(APIIdentityCapabilities.self, from: valid).localAccountsAllowed.value)
        let invalid = Data(#"{"signInAvailable":true,"localAccountsAllowed":true}"#.utf8)
        XCTAssertThrowsError(try decoder.decode(APIIdentityCapabilities.self, from: invalid))
        XCTAssertThrowsError(try decoder.decode(APISignedChallengePublicKeyUserVerification.self, from: Data(#""preferred""#.utf8)))
    }

    func testRealtimeControlFrameDecodesNullableGeneration() throws {
        let frame = try JSONDecoder().decode(APIFrame.self, from: Data(#"{"threadId":"thread","cursor":4,"epoch":2,"kind":"control","messageId":"message","authorKind":"system","text":"Maya is here","generationId":null,"sequence":0,"control":"human_active"}"#.utf8))
        XCTAssertNil(frame.generationId)
        XCTAssertEqual(frame.control, .human_active)
        XCTAssertEqual(frame.epoch, 2)
        let encoded = try JSONEncoder().encode(frame)
        XCTAssertEqual(try JSONDecoder().decode(APIFrame.self, from: encoded).control, .human_active)
    }
}
