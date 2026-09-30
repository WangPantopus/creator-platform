import XCTest
@testable import QelvoraUI

final class DeliveryProtocolTests: XCTestCase {
    private func frame(_ cursor: Int, epoch: Int = 0, kind: APIFrameKind = .sentence, sequence: Int = 1, thread: String = "thread-a") -> APIFrame {
        APIFrame(threadId: thread, cursor: cursor, epoch: epoch, kind: kind, messageId: "message-a", authorKind: kind == .control ? .system : .ai, text: kind == .control ? "Maya is here" : "Sentence", generationId: kind == .control ? nil : "generation-a", sequence: sequence, control: kind == .control ? .human_active : nil)
    }

    func testReorderedTakeoverBoundaryPrecedesLaterContent() throws {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertEqual(try gate.receive(frame(2, epoch: 1, sequence: 1)).count, 0)
        let shown = try gate.receive(frame(1, epoch: 1, kind: .control))
        XCTAssertEqual(shown.map(\.kind), [.control, .sentence])
        XCTAssertEqual(gate.epoch, 1)
        XCTAssertEqual(gate.cursor, 2)
    }

    func testOldAIFrameNeverAppearsAfterTakeover() throws {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertEqual(try gate.receive(frame(1, epoch: 1, kind: .control)).count, 1)
        XCTAssertTrue(try gate.receive(frame(2, epoch: 0)).isEmpty)
        XCTAssertEqual(gate.cursor, 2)
    }

    func testDuplicateCursorAndGenerationSequenceDoNotRepeatText() throws {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertEqual(try gate.receive(frame(1)).count, 1)
        XCTAssertTrue(try gate.receive(frame(1)).isEmpty)
        XCTAssertTrue(try gate.receive(frame(2)).isEmpty)
        XCTAssertEqual(gate.cursor, 2)
    }

    func testReconnectWaitsForMissingCursorRatherThanSkippingABoundary() throws {
        var gate = ThreadDeliveryGate(threadID: "thread-a", cursor: 4, epoch: 2)
        XCTAssertTrue(try gate.receive(frame(6, epoch: 3)).isEmpty)
        XCTAssertEqual(gate.cursor, 4)
        XCTAssertEqual(try gate.receive(frame(5, epoch: 3, kind: .control)).map(\.cursor), [5, 6])
    }

    func testWrongThreadFailsClosed() {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertThrowsError(try gate.receive(frame(1, thread: "thread-b"))) { XCTAssertEqual($0 as? ThreadDeliveryError, .wrongThread) }
    }

    func testGenerationGapDoesNotAdvanceRenderedCursor() {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertThrowsError(try gate.receive(frame(1, sequence: 3))) { XCTAssertEqual($0 as? ThreadDeliveryError, .generationReplayRequired) }
        XCTAssertEqual(gate.cursor, 0)
    }

    func testPersistedCheckpointResumesGenerationAfterProcessRecreation() throws {
        var original = ThreadDeliveryGate(threadID: "thread-a")
        _ = try original.receive(frame(1, sequence: 1))
        _ = try original.receive(frame(2, sequence: 2))
        let data = try JSONEncoder().encode(original.checkpoint())
        var restored = ThreadDeliveryGate(checkpoint: try JSONDecoder().decode(ThreadDeliveryCheckpoint.self, from: data))
        XCTAssertTrue(try restored.receive(frame(2, sequence: 2)).isEmpty)
        XCTAssertEqual(try restored.receive(frame(3, sequence: 3)).map(\.sequence), [3])
        XCTAssertEqual(restored.cursor, 3)
    }

    func testRejectedDrainDoesNotLoseEarlierValidSentence() throws {
        var gate = ThreadDeliveryGate(threadID: "thread-a")
        XCTAssertTrue(try gate.receive(frame(2, sequence: 3)).isEmpty)
        XCTAssertThrowsError(try gate.receive(frame(1, sequence: 1)))
        XCTAssertEqual(gate.cursor, 0)
        XCTAssertEqual(try gate.receive(frame(2, sequence: 2)).map(\.cursor), [1, 2])
    }
}
