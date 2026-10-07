import Foundation
import SwiftUI

/// Route selection only. The current Studio producer owns workspace and Team
/// permission; this registration receives the shell's genuine session model.
public enum StudioTeamFeature {
    private static func creatorId(_ destination: String) -> String? {
        guard ApplicationDestination.isPermitted(destination) else { return nil }
        let parts = destination.split(separator: "/")
        guard parts.count == 3, parts[0] == "studio", parts[2] == "team" else { return nil }
        let value = String(parts[1])
        guard UUID(uuidString: value)?.uuidString.lowercased() == value else { return nil }
        return value
    }

    public static func matches(_ destination: String) -> Bool {
        (destination == "/studio/workspace" && ApplicationDestination.isPermitted(destination)) || creatorId(destination) != nil
    }

    @MainActor public static func registration() -> FanFeatureRegistration {
        FanFeatureRegistration(matches: matches) { session in
            AnyView(StudioTeamWorkspace(
                session: session,
                creatorId: creatorId(session.destination),
                onOpenTeam: { session.open("/studio/\($0)/team") },
                onReturnToWorkspace: { session.open("/studio/workspace") }
            ))
        }
    }
}
