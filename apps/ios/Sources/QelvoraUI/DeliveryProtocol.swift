import Foundation

public enum ThreadDeliveryError: Error, Equatable, Sendable {
    case wrongThread, replayRequired, generationReplayRequired
}

/// Persist together with the rendered timeline. Cursor alone cannot resume a generation.
public struct ThreadDeliveryCheckpoint: Codable, Equatable, Sendable {
    public let threadID: String
    public let cursor: Int
    public let epoch: Int
    public let generationSequences: [String: Int]
}

/// Keep one instance per thread. Reconnect from `cursor`; never paint around missing boundaries.
public struct ThreadDeliveryGate: Sendable {
    public let threadID: String
    public private(set) var cursor: Int
    public private(set) var epoch: Int
    private var pending: [Int: APIFrame] = [:]
    private var generationSequences: [String: Int] = [:]

    public init(threadID: String, cursor: Int = 0, epoch: Int = 0, generationSequences: [String: Int] = [:]) {
        precondition(cursor >= 0 && epoch >= 0 && generationSequences.values.allSatisfy { $0 >= 0 })
        self.threadID = threadID; self.cursor = cursor; self.epoch = epoch; self.generationSequences = generationSequences
    }

    public init(checkpoint: ThreadDeliveryCheckpoint) {
        self.init(threadID: checkpoint.threadID, cursor: checkpoint.cursor, epoch: checkpoint.epoch, generationSequences: checkpoint.generationSequences)
    }

    public func checkpoint() -> ThreadDeliveryCheckpoint {
        ThreadDeliveryCheckpoint(threadID: threadID, cursor: cursor, epoch: epoch, generationSequences: generationSequences)
    }

    public mutating func receive(_ frame: APIFrame) throws -> [APIFrame] {
        guard frame.threadId == threadID else { throw ThreadDeliveryError.wrongThread }
        guard frame.cursor > cursor else { return [] }
        guard pending.count < 1024 || pending[frame.cursor] != nil else { throw ThreadDeliveryError.replayRequired }
        pending[frame.cursor] = frame
        var stagedCursor = cursor
        var stagedEpoch = epoch
        var stagedSequences = generationSequences
        var consumed: [Int] = []
        var visible: [APIFrame] = []
        while let next = pending[stagedCursor + 1] {
            if next.epoch > stagedEpoch && next.kind != .control { break }
            // Validate before moving the replay cursor: a gap cannot masquerade as rendered content.
            if next.epoch >= stagedEpoch, next.kind == .sentence, let generation = next.generationId {
                let last = stagedSequences[generation] ?? 0
                if next.sequence > last && next.sequence != last + 1 { throw ThreadDeliveryError.generationReplayRequired }
                if next.sequence <= last { consumed.append(next.cursor); stagedCursor = next.cursor; continue }
                stagedSequences[generation] = next.sequence
            }
            consumed.append(next.cursor); stagedCursor = next.cursor
            if next.epoch < stagedEpoch { continue }
            if next.kind == .control { stagedEpoch = next.epoch }
            visible.append(next)
        }
        for item in consumed { pending.removeValue(forKey: item) }
        cursor = stagedCursor; epoch = stagedEpoch; generationSequences = stagedSequences
        return visible
    }
}
