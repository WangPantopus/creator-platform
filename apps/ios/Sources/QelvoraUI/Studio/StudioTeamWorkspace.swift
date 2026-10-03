import Foundation
import SwiftUI

private func teamCopy(_ key: String, _ values: [String: String] = [:]) -> String {
    QelvoraCopy.text("w5NativeTeam" + key, values: values)
}

private enum NativeTeamRole: String, CaseIterable, Identifiable {
    case triage, drafter, publisher, scheduler
    var id: String { rawValue }
    var title: String { teamCopy(rawValue + "Title") }
    var detail: String { teamCopy(rawValue + "Detail") }
}

private struct NativeTeamEdit {
    let accountId: String
    let label: String
    let capture: FanSessionRequestCapture
    var expected: [String]
    var desired: [String]
    var unknown = false
    var confirmed = false
}

/// Client display lifetime only. Every permission still belongs to the actual
/// Studio/Identity producer. Nothing here issues an Actor or a signing scope.
@MainActor private final class NativeTeamState: ObservableObject {
    @Published private(set) var directory: APIStudioSession?
    @Published private(set) var creator: APIStudioSessionCreatorsItem?
    @Published private(set) var team: APIStudioTeam?
    @Published private(set) var current = false
    @Published private(set) var reading = false
    @Published private(set) var saving = false
    @Published private(set) var error = ""
    @Published private(set) var edit: NativeTeamEdit?
    private(set) var accountId: String?
    private(set) var sessionId: String?
    private weak var session: FanSession?
    private var creatorId: String?
    private var destination = ""
    private var capture: FanSessionRequestCapture?
    private var active = false
    private var generation = 0
    private var checkedUntil: TimeInterval = 0
    private var readTask: Task<Void, Never>?
    private var writeTask: Task<Void, Never>?

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    var mayManage: Bool { current && now < checkedUntil && creator?.owned == true && creator?.verification == "verified" }
    var currentEditRoles: [String]? {
        guard let edit, let member = team?.members.first(where: { $0.account_id == edit.accountId && $0.revoked_at == nil }) else { return nil }
        return member.roles.map(\.rawValue).sorted()
    }
    var editIsStale: Bool {
        guard let edit else { return false }
        guard let roles = currentEditRoles else { return true }
        return roles != edit.expected.sorted() && roles != edit.desired.sorted()
    }
    var canSave: Bool {
        guard let edit else { return false }
        return mayManage && !saving && !reading && !edit.desired.isEmpty && !edit.confirmed && !editIsStale && currentEditRoles != nil
    }

    func activate(session: FanSession, creatorId: String?) {
        deactivate()
        self.session = session; self.creatorId = creatorId
        destination = session.destination; accountId = session.session?.accountId; sessionId = session.session?.sessionId
        active = true; refresh()
    }
    func deactivate() {
        active = false; generation &+= 1
        readTask?.cancel(); writeTask?.cancel(); readTask = nil; writeTask = nil
        reading = false; saving = false; conceal(discardEdit: true)
    }
    private func conceal(discardEdit: Bool = false) {
        checkedUntil = 0; current = false; directory = nil; creator = nil; team = nil; capture = nil
        if discardEdit { edit = nil }
    }
    private func matches(_ snapshot: Int) -> Bool {
        active && generation == snapshot && !Task.isCancelled && session?.destination == destination &&
        session?.session?.accountId == accountId && session?.session?.sessionId == sessionId &&
        session?.purgingPrivateState == false && session?.localPurgeFailed == false
    }
    func expire() async {
        guard active else { return }
        let snapshot = generation
        if !matches(snapshot) { deactivate(); return }
        if let capture, !(await capture.isCurrent()) {
            guard matches(snapshot) else { return }
            conceal(discardEdit: true); error = teamCopy("AccountChanged"); return
        }
        if now >= checkedUntil { conceal() }
    }
    func refresh() {
        guard active, !reading, !saving, let session else { return }
        let snapshot = generation, started = now
        reading = true
        readTask = Task { [weak self] in
            guard let self else { return }
            defer { if generation == snapshot { reading = false; readTask = nil } }
            do {
                guard let request = await session.captureRequest(from: destination, maximumResponseBytes: 262_144, timeoutSeconds: 4), matches(snapshot), await request.isCurrent() else {
                    if matches(snapshot) { conceal(); error = teamCopy("Unavailable") }
                    return
                }
                let first = try await request.client.studioSession()
                guard matches(snapshot), await request.isCurrent() else { return }
                try validate(first, request: request)
                var selected: APIStudioSessionCreatorsItem?
                var members: APIStudioTeam?
                if let creatorId {
                    guard UUID(uuidString: creatorId) != nil,
                          let found = first.creators.first(where: { $0.id == creatorId }),
                          found.verification == "verified", found.owned || !found.roles.isEmpty else { throw NativeTeamDenied() }
                    selected = found
                    members = try await request.client.studioTeam(creatorId: creatorId)
                    guard let teamValue = members, teamValue.members.count <= 50, teamValue.invitations.count <= 50,
                          Set(teamValue.members.map(\.account_id)).count == teamValue.members.count,
                          teamValue.members.allSatisfy({ UUID(uuidString: $0.account_id) != nil }) else { throw NativeTeamDenied() }
                    guard matches(snapshot), await request.isCurrent(), now < started + 5 else { throw NativeTeamExpired() }
                    let last = try await request.client.studioSession()
                    guard matches(snapshot), await request.isCurrent() else { return }
                    try validate(last, request: request)
                    guard let final = last.creators.first(where: { $0.id == creatorId }),
                          final.owned == found.owned, final.verification == found.verification,
                          final.roles.map(\.rawValue).sorted() == found.roles.map(\.rawValue).sorted() else { throw NativeTeamDenied() }
                    selected = final
                    if !final.owned {
                        guard let membership = teamValue.members.first(where: { $0.account_id == request.expectedAccountId && $0.revoked_at == nil }),
                              membership.roles.map(\.rawValue).sorted() == final.roles.map(\.rawValue).sorted() else { throw NativeTeamDenied() }
                    }
                }
                guard matches(snapshot), await request.isCurrent(), now < started + 5 else { throw NativeTeamExpired() }
                directory = first; creator = selected; team = members; capture = request
                checkedUntil = started + 5; current = true
                // An actual current read can display a committed desired set,
                // but it never invents acknowledgement of an unknown command.
                if edit?.unknown != true && edit?.confirmed != true { error = "" }
            } catch {
                guard matches(snapshot) else { return }
                let denied = error is NativeTeamDenied || (error as? CreatorAPIError).map { [401, 403, 404].contains($0.status) } == true
                conceal(discardEdit: denied)
                self.error = teamCopy(denied ? "Denied" : "Unavailable")
            }
        }
    }
    private func validate(_ value: APIStudioSession, request: FanSessionRequestCapture) throws {
        guard value.creators.count <= 50, value.invitations.count <= 50,
              Set(value.creators.map(\.id)).count == value.creators.count,
              value.creators.allSatisfy({ $0.viewerAccountId == request.expectedAccountId && UUID(uuidString: $0.id) != nil }),
              request.expectedAccountId == accountId, request.sessionId == sessionId else { throw NativeTeamDenied() }
    }
    func openEditor(_ member: APIStudioTeamMembersItem) {
        guard mayManage, !saving, edit == nil, member.revoked_at == nil, !member.roles.isEmpty, member.account_id != accountId,
              let capture, team?.members.contains(where: { $0.account_id == member.account_id && $0.revoked_at == nil }) == true else { return }
        edit = NativeTeamEdit(accountId: member.account_id, label: member.handle.map { "@" + $0 } ?? member.account_id, capture: capture,
                              expected: member.roles.map(\.rawValue).sorted(), desired: member.roles.map(\.rawValue).sorted())
        error = ""
    }
    func select(_ role: String, selected: Bool) {
        guard mayManage, !saving, !reading, var value = edit, !value.unknown, !value.confirmed else { return }
        value.desired = (selected ? Array(Set(value.desired + [role])) : value.desired.filter { $0 != role }).sorted()
        edit = value
    }
    func reviewCurrent() {
        guard mayManage, !saving, !reading, let roles = currentEditRoles, var value = edit else { return }
        value.expected = roles; value.unknown = false; value.confirmed = false; edit = value; error = ""
    }
    func closeEditor() { if !saving { edit = nil; error = "" } }
    func save() {
        guard canSave, let command = edit, let creatorId else { return }
        let snapshot = generation
        // The genuine original capture and exact typed tuple survive a response
        // interruption. No fresh actor, credential, or inferred signing receipt.
        let body = APITeamRolesUpdateInput(expectedRoles: command.expected.compactMap(APITeamRolesUpdateInputExpectedRolesItem.init(rawValue:)), roles: command.desired.compactMap(APITeamRolesUpdateInputRolesItem.init(rawValue:)))
        guard body.expectedRoles.count == command.expected.count, body.roles.count == command.desired.count else { return }
        saving = true
        writeTask = Task { [weak self] in
            guard let self else { return }
            defer { if generation == snapshot { saving = false; writeTask = nil; refresh() } }
            do {
                guard matches(snapshot), mayManage, await command.capture.isCurrent() else {
                    if matches(snapshot) { conceal(discardEdit: true); error = teamCopy("AccountChanged") }
                    return
                }
                _ = try await command.capture.client.updateTeamMemberRoles(creatorId: creatorId, accountId: command.accountId,
                    xExpectedAccountId: command.capture.expectedAccountId, body: body)
                guard matches(snapshot), await command.capture.isCurrent(), edit?.accountId == command.accountId else { return }
                var done = command; done.confirmed = true; done.unknown = false; edit = done
                error = teamCopy("Saved")
            } catch {
                guard matches(snapshot), await command.capture.isCurrent(), edit?.accountId == command.accountId else { return }
                if let failure = error as? CreatorAPIError, [401, 403, 404].contains(failure.status) {
                    conceal(discardEdit: true); self.error = teamCopy("Denied")
                } else {
                    // Even a parse failure after HTTP 200 may hide a commit.
                    // Lock the command until exact retry or explicit new review.
                    var pending = command; pending.unknown = true; edit = pending
                    self.error = teamCopy((error as? CreatorAPIError)?.status == 409 ? "Changed" : "Unknown")
                }
            }
        }
    }
}
private struct NativeTeamDenied: Error {}
private struct NativeTeamExpired: Error {}

/// W5 domain component for W1's shipping native shell. Pass that shell's actual
/// FanSession. creatorId nil shows the genuine workspace directory; otherwise
/// it opens a current Team read. Navigation remains with the supplied callbacks.
@MainActor public struct StudioTeamWorkspace: View {
    @ObservedObject private var session: FanSession
    @StateObject private var state = NativeTeamState()
    private let creatorId: String?
    private let onOpenTeam: (String) -> Void
    private let onReturnToWorkspace: () -> Void
    @Environment(\.scenePhase) private var scene
    @Environment(\.colorScheme) private var scheme
    @AccessibilityFocusState private var editorFocus: Bool
    public init(session: FanSession, creatorId: String? = nil, onOpenTeam: @escaping (String) -> Void, onReturnToWorkspace: @escaping () -> Void) {
        self.session = session; self.creatorId = creatorId; self.onOpenTeam = onOpenTeam; self.onReturnToWorkspace = onReturnToWorkspace
    }
    private var lifetime: String { (session.session?.accountId ?? "") + ":" + (session.session?.sessionId ?? "") + ":" + session.destination + ":" + (creatorId ?? "") }
    private var visible: Bool { scene == .active && state.current && session.session?.accountId == state.accountId && session.session?.sessionId == state.sessionId && !session.purgingPrivateState && !session.localPurgeFailed }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(teamCopy(creatorId == nil ? "Workspace" : "Title")).qText("display-md").accessibilityAddTraits(.isHeader)
                if !state.error.isEmpty { Notice(title: teamCopy("Status"), children: state.error) }
                Button(teamCopy("Refresh"), variant: .secondary, block: true, disabled: state.reading || state.saving) { state.refresh() }
                if visible {
                    if creatorId == nil, let directory = state.directory { workspace(directory) }
                    else if let creator = state.creator, let team = state.team { teamView(creator, team) }
                } else {
                    Text(teamCopy("Unavailable")).qText("body")
                }
                if creatorId != nil { Button(teamCopy("Back"), variant: .quiet, block: true, disabled: state.saving, action: onReturnToWorkspace) }
            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
        }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: lifetime + String(describing: scene)) {
                guard scene == .active else { state.deactivate(); return }
                state.activate(session: session, creatorId: creatorId)
                var ticks = 0
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                    await state.expire(); ticks += 1
                    if ticks % 12 == 0 { state.refresh() }
                }
            }.onDisappear { state.deactivate() }
            .onChange(of: state.edit?.accountId) { _, value in editorFocus = value != nil }
    }
    @ViewBuilder private func workspace(_ directory: APIStudioSession) -> some View {
        if directory.creators.isEmpty { Text(teamCopy("NoWorkspace")).qText("body") }
        ForEach(directory.creators, id: \.id) { creator in
            VStack(alignment: .leading, spacing: 8) {
                Text(creator.display_name).qText("body-strong")
                Text("@" + creator.handle).qText("caption")
                Text(teamCopy(creator.owned ? "Owner" : "Member")).qText("label")
                if creator.verification == "verified" {
                    Button(QelvoraCopy.text("navTeam"), variant: .secondary, block: true) { if visible { onOpenTeam(creator.id) } }
                } else { Text(teamCopy("VerificationRequired")).qText("body") }
            }
        }
        ForEach(directory.invitations, id: \.id) { invitation in
            Text(teamCopy("Invitation", ["name": invitation.creatorName, "roles": invitation.roles.map(\.rawValue).joined(separator: ", "), "expires": invitation.expiresAt])).qText("body")
        }
    }
    @ViewBuilder private func teamView(_ creator: APIStudioSessionCreatorsItem, _ team: APIStudioTeam) -> some View {
        Text(creator.display_name).qText("body-strong")
        Text(teamCopy("IdentityRule")).qText("body")
        if team.members.isEmpty { Text(teamCopy("NoMembers")).qText("body") }
        ForEach(team.members, id: \.account_id) { member in
            VStack(alignment: .leading, spacing: 8) {
                Text(member.handle.map { "@" + $0 } ?? member.account_id).qText("body-strong")
                Text(member.roles.map(\.rawValue).joined(separator: ", ")).qText("body")
                if member.revoked_at != nil { Text(teamCopy("Removed")).qText("label") }
                else if state.mayManage && member.account_id != state.accountId {
                    Button(teamCopy("Edit"), variant: .secondary, block: true, disabled: state.saving || state.edit != nil || member.roles.isEmpty) { state.openEditor(member) }
                }
            }
        }
        if !creator.owned { Text(teamCopy("CreatorOnly")).qText("body") }
        if let edit = state.edit, state.mayManage {
            VStack(alignment: .leading, spacing: 12) {
                Text(teamCopy("EditFor", ["member": edit.label])).qText("body-strong").accessibilityAddTraits(.isHeader).accessibilityFocused($editorFocus)
                Text(teamCopy("Reviewed", ["roles": edit.expected.joined(separator: ", ")])).qText("body")
                Text(teamCopy("Desired", ["roles": edit.desired.joined(separator: ", ")])).qText("body")
                if let roles = state.currentEditRoles { Text(teamCopy("Current", ["roles": roles.joined(separator: ", ")])).qText("body") }
                ForEach(NativeTeamRole.allCases) { role in
                    Toggle(isOn: Binding(get: { edit.desired.contains(role.rawValue) }, set: { state.select(role.rawValue, selected: $0) })) {
                        VStack(alignment: .leading, spacing: 4) { Text(role.title).qText("body-strong"); Text(role.detail).qText("caption") }
                    }.frame(minHeight: 48).disabled(state.saving || state.reading || edit.unknown || edit.confirmed)
                }
                if state.editIsStale && state.currentEditRoles != nil {
                    Button(teamCopy("ReviewCurrent"), variant: .secondary, block: true, disabled: state.saving || state.reading) { state.reviewCurrent() }
                }
                Button(teamCopy(edit.unknown ? "RetryExact" : "Save"), variant: .secondary, block: true, disabled: !state.canSave) { state.save() }
                Button(QelvoraCopy.text("close"), variant: .quiet, block: true, disabled: state.saving) { state.closeEditor() }
            }
        }
    }
}
