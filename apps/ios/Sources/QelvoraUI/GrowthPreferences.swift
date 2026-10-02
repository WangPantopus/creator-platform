import Foundation
import SwiftUI

private struct GrowthPreferences: Codable {
    var push: Bool; var email: Bool; var hideSensitive: Bool
    var quietStart: Int?; var quietEnd: Int?; var timeZone: String
    var mutedCreators: [String]; var disabledPushTypes: [String]; var disabledEmailTypes: [String]
}
private struct PreferenceCreators: Decodable {struct Creator: Decodable, Identifiable {let id: String; let name: String}; let creators: [Creator]}
private let growthNotificationKinds = ["ai_reply", "approved_draft", "personal_reply", "request_status", "call_reminder", "answered_publicly", "content_match", "announcement", "creator_offer", "slot_change", "new_packet", "commitment_due", "guardrail", "pool_share", "note", "reaction", "public_answer", "spending_reminder", "weekly_impact"]

struct GrowthNotificationSettings: View {
    private enum Field: Hashable { case from, until, timeZone }
    let client: GrowthClient?
    @State private var value: GrowthPreferences?
    @State private var formSession: String?
    @State private var creators: [PreferenceCreators.Creator] = []
    @State private var from = ""
    @State private var until = ""
    @State private var message = ""
    @State private var busy = false
    @State private var errors: [Field: String] = [:]
    @FocusState private var focused: Field?
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(QelvoraCopy.text("growthNotificationSettings")).qText("display-md")
            Text(QelvoraCopy.text("growthYourInAppRecordCannotBeTurnedOffPushAnd")).qText("body")
            if value != nil {
                #if os(iOS)
                GrowthDevicePushSettings()
                #endif
                preferenceToggle(QelvoraCopy.text("growthPushNotifications"), value: field(\.push))
                preferenceToggle(QelvoraCopy.text("growthEmailDigest"), value: field(\.email))
                preferenceToggle(QelvoraCopy.text("growthHideSensitivePreviews"), value: field(\.hideSensitive))
                preferenceField(.from, label: QelvoraCopy.text("growthQuietHoursFromHhMm"), text: $from)
                preferenceField(.until, label: QelvoraCopy.text("growthQuietHoursUntilHhMm"), text: $until)
                preferenceField(.timeZone, label: QelvoraCopy.text("growthTimeZone"), text: field(\.timeZone))
                Text(QelvoraCopy.text("growthLeaveBothTimesEmptyForNoQuietHours")).qText("caption")
                ForEach(creators) {creator in
                    preferenceToggle(QelvoraCopy.text("growthPushAndEmail2", values: ["name": creator.name]), value: allowed(\.mutedCreators, creator.id))
                }
                ForEach(growthNotificationKinds, id: \.self) {kind in
                    let label = QelvoraCopy.text("growthKind" + kind.split(separator: "_").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined())
                    VStack(alignment: .leading, spacing: 8) {
                        Text(label).qText("label")
                        preferenceToggle(QelvoraCopy.text("growthPush"), value: allowed(\.disabledPushTypes, kind), accessibilityLabel: QelvoraCopy.text("growthNotificationChannel", values: ["kind": label, "channel": QelvoraCopy.text("growthPush")]))
                        preferenceToggle(QelvoraCopy.text("growthEmail"), value: allowed(\.disabledEmailTypes, kind), accessibilityLabel: QelvoraCopy.text("growthNotificationChannel", values: ["kind": label, "channel": QelvoraCopy.text("growthEmail")]))
                    }.accessibilityElement(children: .contain)
                }
                Button(busy ? QelvoraCopy.text("growthSaving") : QelvoraCopy.text("growthSavePreferences"), variant: .secondary, block: true, disabled: busy) {Task {await save()}}
            } else if message.isEmpty {ProgressView()}
            if !message.isEmpty {Text(message).qText("body").accessibilityAddTraits(.updatesFrequently)}
            Button(QelvoraCopy.text("growthReloadSettings"), variant: .quiet, disabled: busy) {Task {await load()}}
        }
        .disabled(busy)
        .onChange(of: from) { _, _ in clearError(.from); clearError(.until) }
        .onChange(of: until) { _, _ in clearError(.from); clearError(.until) }
        .onChange(of: value?.timeZone) { _, _ in clearError(.timeZone) }
        .task {await load()}
    }
    private func preferenceToggle(_ label: String, value: Binding<Bool>, accessibilityLabel: String? = nil) -> some View {
        SwiftUI.Button { value.wrappedValue.toggle() } label: {
            HStack {
                Text(label).qText("body")
                Spacer(minLength: 12)
                Toggle("", isOn: .constant(value.wrappedValue))
                    .labelsHidden().allowsHitTesting(false).accessibilityHidden(true)
            }.frame(minHeight: 44).contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityLabel(accessibilityLabel ?? label)
            .accessibilityValue(QelvoraCopy.text(value.wrappedValue ? "growthOn" : "growthOff"))
    }
    private func preferenceField(_ field: Field, label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            TextField(label, text: text)
                .textFieldStyle(.plain)
                .qText("body")
                .padding(12)
                .frame(minHeight: 48)
                .background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor(errors[field] == nil ? "control-line" : "alert", scheme), lineWidth: 1))
                .focused($focused, equals: field)
                .accessibilityLabel(label)
                .accessibilityHint(errors[field] ?? "")
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(field == .timeZone ? .asciiCapable : .numbersAndPunctuation)
                #endif
            fieldError(field)
        }
    }
    @ViewBuilder private func fieldError(_ field: Field) -> some View {
        if let error = errors[field] {
            Text(error).qText("caption")
                .foregroundStyle(qColor("alert", scheme))
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
    private func clearError(_ field: Field) { errors.removeValue(forKey: field); message = "" }
    private func field<T>(_ key: WritableKeyPath<GrowthPreferences, T>) -> Binding<T> {Binding(get: {value![keyPath: key]}, set: {value![keyPath: key] = $0; message = ""})}
    private func allowed(_ key: WritableKeyPath<GrowthPreferences, [String]>, _ id: String) -> Binding<Bool> {Binding(get: {!value![keyPath: key].contains(id)}, set: {enabled in value![keyPath: key].removeAll {$0 == id};if !enabled {value![keyPath: key].append(id)}; message = ""})}
    private func time(_ minute: Int?) -> String {guard let minute else {return ""};return String(format: "%02d:%02d", minute / 60, minute % 60)}
    private func validTime(_ text: String) -> Bool {
        text.isEmpty || (text.count == 5 && text.range(of: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil)
    }
    private func minute(_ text: String) -> Int? {
        guard !text.isEmpty else { return nil }
        let parts = text.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        return parts[0] * 60 + parts[1]
    }
    private func load() async {
        guard !busy else { return }
        guard let client else { message = QelvoraCopy.text("growthTheGrowthServiceIsNotConfigured"); return }
        busy = true
        defer { busy = false }
        do {
            guard let captured = try await client.token() else { throw GrowthRequestFailure(status: 401) }
            let preferences: GrowthPreferences = try await client.request("preferences", expectedSession: captured)
            let directory: PreferenceCreators = try await client.request("preferences/creators", expectedSession: captured)
            guard !Task.isCancelled else { return }
            // Commit the complete form only after both reads succeed. A partial
            // reload must not combine new toggles with old/empty quiet hours.
            value = preferences
            formSession = captured
            creators = directory.creators
            from = time(preferences.quietStart)
            until = time(preferences.quietEnd)
            errors = [:]
            message = ""
        } catch is CancellationError {
            return
        } catch {
            message = QelvoraCopy.text("growthSettingsNeedACurrentSignedInAccountAndNetworkConnection")
        }
    }
    private func save() async {
        guard !busy, let client, var current = value else { return }
        message = ""
        var next: [Field: String] = [:]
        if !validTime(from) { next[.from] = QelvoraCopy.text("growthErrorQuietHoursFormat") }
        if !validTime(until) { next[.until] = QelvoraCopy.text("growthErrorQuietHoursFormat") }
        if from.isEmpty != until.isEmpty {
            next[from.isEmpty ? .from : .until] = QelvoraCopy.text("growthErrorQuietHoursPair")
        }
        if current.timeZone.isEmpty || current.timeZone.count > 80 || TimeZone(identifier: current.timeZone) == nil {
            next[.timeZone] = QelvoraCopy.text("growthErrorTimeZone")
        }
        errors = next
        if let invalid = [Field.from, .until, .timeZone].first(where: { next[$0] != nil }) {
            focused = invalid
            return
        }
        busy = true
        defer { busy = false }
        current.quietStart = minute(from)
        current.quietEnd = minute(until)
        do {
            // The loaded form owns this credential snapshot. Taking a new one
            // here could submit an old account's choices after account transfer.
            guard let formSession else { throw GrowthRequestFailure(status: 401) }
            let updated: GrowthPreferences = try await client.request("preferences", method: "PUT", body: JSONEncoder().encode(current), expectedSession: formSession)
            value = updated
            message = QelvoraCopy.text("growthPreferencesSavedYourInAppRecordRemainsAvailable")
        } catch is CancellationError {
            return
        } catch {
            message = QelvoraCopy.text("growthPreferencesWereNotSaved")
        }
    }
}
