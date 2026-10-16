import CryptoKit
import Foundation

/// WP 7.4 P8, the 3-hour reminder. No server signal exists, so the count lives
/// on this phone only (another device keeps its own). Time counts while an AI
/// conversation is in front and its AI is on, across creators; time while the
/// creator is in the thread does not count. A break of 15 minutes or more (the
/// app in the background, another part of the app, the screen off) starts the
/// count again. Each further 3 hours of the same count shows the fixed line
/// (`longSession`) once, as a system line in the conversation open then.
/// The count is kept per account (its id hashed) so a relaunch within the
/// break keeps it; the lines themselves are memory only.
@MainActor final class W3LongSession {
    static let shared = W3LongSession()
    private(set) var threshold: TimeInterval = 3 * 3600
    private(set) var pause: TimeInterval = 15 * 60
    /// How often the count is advanced while it runs.
    var interval: TimeInterval { min(15, threshold / 20) }
    private let storeKey = "qelvora.longSession.v1"
    private var account = ""
    private var seconds: TimeInterval = 0
    private var lastAt: Date?
    private var shown = 0
    private var running = false
    /// Lines shown, by thread: the row each follows, and its words.
    private var shownLines: [String: [(after: String?, text: String)]] = [:]

    private init() {
        #if DEBUG
        if let custom = DebugHarness.longSession { threshold = custom.threshold; pause = custom.pause }
        #endif
        if let saved = UserDefaults.standard.dictionary(forKey: storeKey) {
            account = saved["account"] as? String ?? ""
            seconds = saved["seconds"] as? TimeInterval ?? 0
            lastAt = (saved["lastAt"] as? TimeInterval).map(Date.init(timeIntervalSince1970:))
            shown = saved["shown"] as? Int ?? 0
        }
    }

    /// The thread came to the front with its AI on.
    func begin(account id: String, now: Date = Date()) {
        let key = SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
        if key != account { account = key; seconds = 0; shown = 0; lastAt = nil }
        if let lastAt, now.timeIntervalSince(lastAt) >= pause { seconds = 0; shown = 0 }
        lastAt = now; running = true; save()
    }
    /// Advances the count; true when a reminder is due now.
    func tick(now: Date = Date()) -> Bool {
        guard running else { return false }
        advance(now)
        let due = Int(seconds / threshold)
        guard due > shown else { save(); return false }
        shown = due; save()
        return true
    }
    /// The thread left the front, or its AI stopped: the count waits.
    func end(now: Date = Date()) {
        guard running else { return }
        advance(now); running = false; save()
    }
    func lines(for thread: String) -> [(after: String?, text: String)] { shownLines[thread] ?? [] }
    func add(thread: String, after: String?, text: String) { shownLines[thread, default: []].append((after, text)) }

    /// A suspended app is not counted: one step adds at most twice the interval.
    private func advance(_ now: Date) {
        if let lastAt { seconds += min(2 * interval, max(0, now.timeIntervalSince(lastAt))) }
        lastAt = now
    }
    private func save() {
        UserDefaults.standard.set(["account": account, "seconds": seconds, "lastAt": lastAt?.timeIntervalSince1970 ?? 0, "shown": shown], forKey: storeKey)
    }
}
