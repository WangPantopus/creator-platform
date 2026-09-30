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
    let client: GrowthClient?
    @State private var value: GrowthPreferences?
    @State private var creators: [PreferenceCreators.Creator] = []
    @State private var from = ""
    @State private var until = ""
    @State private var message = ""
    @State private var busy = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Notification settings").qText("display-md")
            Text("Your in-app record cannot be turned off. Push and email are optional.").qText("body")
            if value != nil {
                Toggle("Push notifications", isOn: field(\.push))
                Toggle("Email digest", isOn: field(\.email))
                Toggle("Hide sensitive previews", isOn: field(\.hideSensitive))
                TextField("Quiet hours from · HH:mm", text: $from).textFieldStyle(.roundedBorder)
                TextField("Quiet hours until · HH:mm", text: $until).textFieldStyle(.roundedBorder)
                TextField("Time zone", text: field(\.timeZone)).textFieldStyle(.roundedBorder).qDisableAutoCapitalization()
                Text("Leave both times empty for no quiet hours.").qText("caption")
                ForEach(creators) {creator in Toggle(creator.name + " · push and email", isOn: allowed(\.mutedCreators, creator.id))}
                ForEach(growthNotificationKinds, id: \.self) {kind in VStack(alignment: .leading) {Text(kind.replacingOccurrences(of: "_", with: " ")).qText("label");Toggle("Push", isOn: allowed(\.disabledPushTypes, kind));Toggle("Email", isOn: allowed(\.disabledEmailTypes, kind))}}
                Button(busy ? "Saving…" : "Save preferences", variant: .secondary, block: true, disabled: busy) {Task {await save()}}
            } else if message.isEmpty {ProgressView()}
            if !message.isEmpty {Text(message).qText("body").accessibilityAddTraits(.updatesFrequently)}
            Button("Reload settings", variant: .quiet, disabled: busy) {Task {await load()}}
        }.task {await load()}
    }
    private func field<T>(_ key: WritableKeyPath<GrowthPreferences, T>) -> Binding<T> {Binding(get: {value![keyPath: key]}, set: {value![keyPath: key] = $0})}
    private func allowed(_ key: WritableKeyPath<GrowthPreferences, [String]>, _ id: String) -> Binding<Bool> {Binding(get: {!value![keyPath: key].contains(id)}, set: {enabled in value![keyPath: key].removeAll {$0 == id};if !enabled {value![keyPath: key].append(id)}})}
    private func time(_ minute: Int?) -> String {guard let minute else {return ""};return String(format: "%02d:%02d", minute / 60, minute % 60)}
    private func minute(_ text: String) throws -> Int? {if text.isEmpty {return nil};let parts = text.split(separator: ":");guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1]), (0...23).contains(hour), (0...59).contains(minute) else {throw URLError(.cannotParseResponse)};return hour * 60 + minute}
    private func load() async {guard let client else {message = "The growth service is not configured.";return};busy = true;defer {busy = false};do {value = try await client.request("preferences");let directory: PreferenceCreators = try await client.request("preferences/creators");creators = directory.creators;from = time(value?.quietStart);until = time(value?.quietEnd);message = ""} catch {message = "Settings need a current signed-in account and network connection."}}
    private func save() async {guard let client, var current = value else {return};busy = true;defer {busy = false};do {current.quietStart = try minute(from);current.quietEnd = try minute(until);guard (current.quietStart == nil) == (current.quietEnd == nil) else {throw URLError(.cannotParseResponse)};let updated: GrowthPreferences = try await client.request("preferences", method: "PUT", body: JSONEncoder().encode(current));value = updated;message = "Preferences saved. Your in-app record remains available."} catch {message = "Preferences were not saved. Check both quiet-hour times and reconnect."}}
}

