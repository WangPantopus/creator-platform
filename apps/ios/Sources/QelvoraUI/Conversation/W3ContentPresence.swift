import Foundation
import SwiftUI

/// C4 items are authorized Content reads, never conversation messages or
/// conversation-offline bodies. Their cursor is independent of the SSE cursor.
enum W3ContentPresenceItem: Identifiable, Sendable {
    case note(APIThreadPresenceNote)
    case reaction(APIThreadPresenceReaction)
    var id: String { switch self { case .note(let n): "note:" + n.id; case .reaction(let r): "reaction:" + r.id } }
    var occurredAt: String { switch self { case .note(let n): n.occurredAt; case .reaction(let r): r.occurredAt } }
    var authorLabel: String { switch self { case .note(let n): n.authorLabel; case .reaction(let r): r.authorLabel } }
    var accessibleLabel: String { switch self { case .note(let n): n.authorLabel + ". " + n.text; case .reaction(let r): r.authorLabel } }
    var creatorName: String { switch self { case .note(let n): n.creatorName; case .reaction(let r): r.creatorName } }
    var signedActId: String { switch self { case .note(let n): n.signedActId; case .reaction(let r): r.signedActId } }
    var destination: String { switch self { case .note(let n): "/content/" + n.creatorId + "/" + n.id; case .reaction(let r): "/content/" + r.creatorId + "/" + r.noteId } }
    var glyph: String { switch self { case .note: "broadcast"; case .reaction: "heart" } }
    static func decode(_ value: APIJSONValue, creatorId: String) throws -> Self {
        let data = try JSONEncoder().encode(value)
        struct Kind: Decodable { let authorKind: String }
        let decoder = JSONDecoder()
        let kind = try decoder.decode(Kind.self, from: data).authorKind
        let result: Self
        if kind == "human_broadcast" {
            let n = try decoder.decode(APIThreadPresenceNote.self, from: data)
            guard n.creatorId == creatorId, UUID(uuidString: n.id) != nil, n.version > 0,
                  !n.audience.label.isEmpty, n.audience.label.count <= 200,
                  n.text.count <= 20_000 else { throw W3Failure(message: "Invalid content presence.", status: 503) }
            result = .note(n)
        } else if kind == "human_reaction" {
            let r = try decoder.decode(APIThreadPresenceReaction.self, from: data)
            guard r.creatorId == creatorId, r.id == r.replyId,
                  [r.id, r.noteId].allSatisfy({ UUID(uuidString: $0) != nil }) else { throw W3Failure(message: "Invalid content presence.", status: 503) }
            result = .reaction(r)
        } else { throw W3Failure(message: "Invalid content presence.", status: 503) }
        guard UUID(uuidString: result.signedActId) != nil,
              !result.authorLabel.isEmpty, result.authorLabel.count <= 300,
              !result.creatorName.isEmpty, result.creatorName.count <= 80,
              identityDeadline(result.occurredAt) != nil else { throw W3Failure(message: "Invalid content presence.", status: 503) }
        return result
    }
}

struct W3ContentPresencePage: Sendable {
    let items: [W3ContentPresenceItem]
    let nextBefore: String?
    init(_ page: APIThreadPresencePage, creatorId: String) throws {
        guard page.items.count <= 50, identityDeadline(page.serverTime) != nil,
              page.nextBefore == nil || Self.validCursor(page.nextBefore!) else { throw W3Failure(message: "Invalid content presence.", status: 503) }
        items = try page.items.map { try W3ContentPresenceItem.decode($0, creatorId: creatorId) }
        guard Set(items.map(\.id)).count == items.count else { throw W3Failure(message: "Invalid content presence.", status: 503) }
        nextBefore = page.nextBefore
    }
    static func validCursor(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z~[0-9a-f-]{36}$"#, options: .regularExpression) != nil
    }
}

/// A small, memory-only window, re-authorized in full. Even an empty candidate
/// page can have an older cursor. Old windows never survive a failed refresh.
@MainActor
final class W3ContentPresenceFeed: ObservableObject {
    @Published private(set) var items: [W3ContentPresenceItem] = []
    @Published private(set) var nextBefore: String?
    @Published private(set) var unavailable = false
    @Published private(set) var loading = false
    @Published private(set) var pages = 1
    @Published private(set) var retry = 0
    private var generation = 0
    private var deadline: ContinuousClock.Instant?
    let client: W3ConversationClient
    let creatorId: String
    init(client: W3ConversationClient, creatorId: String) { self.client = client; self.creatorId = creatorId }
    var canReadEarlier: Bool { nextBefore != nil && pages < 5 }
    func earlier() { guard !loading, canReadEarlier else { return }; pages += 1 }
    func refresh() { retry += 1 }
    func conceal() { generation += 1; items = []; nextBefore = nil; deadline = nil; loading = false }
    func expire() { if let deadline, .now >= deadline { items = []; nextBefore = nil; self.deadline = nil; unavailable = true } }
    func run(active: Bool) async {
        conceal()
        guard active else { return }
        let run = generation
        defer { if run == generation { conceal() } }
        while !Task.isCancelled && run == generation {
            loading = true
            let started = ContinuousClock.now
            do {
                var collected: [W3ContentPresenceItem] = [], cursor: String?
                var seen = Set<String>()
                for _ in 0..<pages {
                    let page = try await client.contentPresence(creatorId: creatorId, before: cursor)
                    guard !Task.isCancelled, run == generation else { return }
                    collected += page.items
                    guard let next = page.nextBefore else { cursor = nil; break }
                    guard next != cursor, seen.insert(next).inserted else { throw W3Failure(message: "Invalid content cursor.", status: 503) }
                    cursor = next
                }
                guard !Task.isCancelled, run == generation else { return }
                // Charge network time to the display lease, including all pages.
                guard started.duration(to: .now) < .seconds(5), Set(collected.map(\.id)).count == collected.count else { throw W3Failure(message: "Content access expired.", status: 503) }
                items = collected; nextBefore = cursor; unavailable = false; deadline = started.advanced(by: .seconds(5))
            } catch {
                guard !Task.isCancelled, run == generation else { return }
                items = []; nextBefore = nil; deadline = nil; unavailable = true
            }
            loading = false
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
        }
    }
}

struct W3TimelineItem: Identifiable {
    let id: String
    let at: Date
    let message: W3Message?
    let content: W3ContentPresenceItem?
    static func merge(messages: [W3Message], content: [W3ContentPresenceItem]) -> [Self] {
        let rows = messages.map { Self(id: "message:" + $0.id, at: identityDeadline($0.createdAt) ?? .distantPast, message: $0, content: nil) }
            + content.map { Self(id: "content:" + $0.id, at: identityDeadline($0.occurredAt) ?? .distantPast, message: nil, content: $0) }
        return rows.sorted { $0.at == $1.at ? $0.id < $1.id : $0.at < $1.at }
    }
}

struct W3ContentPresenceRow: View {
    let item: W3ContentPresenceItem
    let open: (String) -> Void
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: QelvoraTokens.space3) {
            SwiftUI.Button { open(item.destination) } label: {
                VStack(alignment: .leading, spacing: QelvoraTokens.space3) {
                    HStack { QelvoraGlyph(name: item.glyph, size: QelvoraTokens.space4, color: qColor("maya-accent", scheme)); Text(item.authorLabel).qText("label").foregroundStyle(qColor("maya-accent", scheme)) }
                    if case .note(let note) = item { Text(note.text).qText("body").foregroundStyle(qColor("on-maya", scheme)) }
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel(item.accessibleLabel)
            SignedMarker(name: item.creatorName, onMaya: true) { open("/verify/" + item.signedActId) }
        }.padding(QelvoraTokens.space4).background(qColor("maya-surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.radiusMd))
            .accessibilityIdentifier("content-presence-" + item.id)
    }
}
