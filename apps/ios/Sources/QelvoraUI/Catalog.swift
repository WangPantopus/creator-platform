import SwiftUI

public enum NativeComponentRegistry {
    /// Implemented means source exists. Visual acceptance remains pending until reviewed diffs.
    public static let implemented = ["Mark", "Seal", "Avatar", "AuthorLabel", "IdentityStrip", "ThreadHeader", "SignedMarker", "SystemLine", "Message", "Note", "ReactionChip", "CitationChip", "MemoryChip", "Correction", "ContextCard", "VoiceNote", "Composer", "StepIn", "AccessLines", "ModeList", "IncludeList", "TermsBlock", "EtaLine", "RequestStatus", "Receipt", "SpendLimit", "QueueCard", "CapacityHeader", "LabelPreview", "SigningSheet", "AuditBanner", "SourceRow", "Button", "TabBar", "Segmented", "Notice", "NotificationRow", "EmptyState", "ShareCard", "CallChip", "ReservedLabel", "Countdown", "InsteadMenu", "TestConsole", "VersionList", "DigestItem", "StudioTabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmailFrame"]
    public static let pending: [String] = []
}

public struct NativeFoundationCatalog: View {
    public let component: String?
    @State private var selected = "Mark"
    @Environment(\.colorScheme) private var scheme
    public init(component: String? = nil) { self.component = component; QelvoraFonts.register() }
    public var body: some View {
        if component == "Dialog" {
            NativeComponentPreview(name: "Dialog")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(qColor("ground", scheme))
        } else {
        ScrollView {
            VStack(alignment: .leading, spacing: QelvoraTokens.space6) {
                if component == nil {
                    Picker("Component", selection: $selected) { ForEach(NativeComponentRegistry.implemented, id: \.self) { Text($0).tag($0) } }.pickerStyle(.menu).accessibilityIdentifier("native-component-picker")
                }
                ForEach([component ?? selected], id: \.self) { name in
                    VStack(alignment: .leading, spacing: QelvoraTokens.space4) {
                        Text(name).qText("display-md").accessibilityAddTraits(.isHeader)
                        NativeComponentPreview(name: name)
                    }
                }
            }.padding(QelvoraTokens.space4).frame(maxWidth: .infinity, alignment: .leading)
        }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
        }
    }
}

#Preview("4A Welcome · Light", traits: .fixedLayout(width: 390, height: 844)) { Welcome().preferredColorScheme(.light) }
#Preview("4A Welcome · Night", traits: .fixedLayout(width: 390, height: 844)) { Welcome().preferredColorScheme(.dark) }
#Preview("Native foundation catalog") { NativeFoundationCatalog() }
