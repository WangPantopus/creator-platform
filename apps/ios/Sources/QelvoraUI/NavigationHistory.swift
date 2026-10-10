import Foundation

/// One screen the person has been through: its path and the tab it was reached from.
public struct NavigationEntry: Equatable, Sendable {
    public let path: String
    public let tab: FanTab
}

/// Where Back goes (work package 7.2, one spec for both platforms).
///
/// The app keeps the screens you moved through, newest last. Back returns to the
/// last one. When there is none (after a link, a push or a restart), Back goes to
/// the screen this one belongs under, and from a tab other than Home to Home.
/// Paths only: no credential, message or account data is ever kept here.
public enum NavigationParents {
    public static let limit = 24
    static let roots = ["/home", "/discover", "/requests", "/you"]

    static func path(_ destination: String) -> String { destination.components(separatedBy: "?")[0] }
    static func isRoot(_ destination: String) -> Bool { roots.contains(destination) }

    /// A route that only forwards, such as a tapped notification: it replaces itself.
    static func isTransient(_ destination: String) -> Bool {
        let parts = path(destination).split(separator: "/").map(String.init)
        return parts.count == 2 && parts[0] == "notifications" && parts[1] != "settings"
    }

    /// The screen this one belongs under, or nil for Home, where there is nowhere to go back to.
    static func parent(of destination: String) -> String? {
        let path = path(destination)
        // A sub-screen of a tab (for example /you?creatorId=...) belongs under the tab itself.
        if roots.contains(path), destination != path { return path }
        let parts = path.split(separator: "/").map(String.init)
        switch (parts.first ?? "", parts.count) {
        case ("home", _): return nil
        case ("creators", 2): return "/discover"
        case ("creators", _): return "/creators/" + parts[1]
        case ("notifications", 1): return "/home"
        case ("notifications", _): return "/notifications"
        case ("commerce", _):
            return path == "/commerce/spending" ? "/you" : "/requests"
        case ("requests", 2...): return "/requests"
        case ("support", _), ("trust", _), ("identity", _), ("studio", _), ("onboarding", _): return "/you"
        default: return "/home"
        }
    }

    /// The tab a destination belongs to when nothing says where the person came from.
    static func tab(of destination: String) -> FanTab {
        let path = path(destination)
        if path.hasPrefix("/identity/") || path == "/support" || path.hasPrefix("/support/")
            || path == "/notifications/settings" || path == "/studio/impact" || path == "/commerce/spending"
            || StudioTeamFeature.matches(path) { return .you }
        if path.hasPrefix("/commerce/") { return .requests }
        return FanTab.allCases.first { tab in
            let root = "/" + tab.rawValue.lowercased()
            return path == root || path.hasPrefix(root + "/")
        } ?? .home
    }
}
