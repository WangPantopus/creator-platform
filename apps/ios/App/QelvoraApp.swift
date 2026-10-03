import QelvoraUI
import SwiftUI

@main
struct QelvoraApp: App {
    @UIApplicationDelegateAdaptor(GrowthPushAppDelegate.self) private var pushDelegate
    init() { QelvoraFonts.register() }
    var body: some Scene {
        WindowGroup {
            Group {
            #if DEBUG
            if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--catalog-component"), ProcessInfo.processInfo.arguments.indices.contains(index + 1) {
                NativeFoundationCatalog(component: ProcessInfo.processInfo.arguments[index + 1])
            } else if ProcessInfo.processInfo.arguments.contains("--catalog") { NativeFoundationCatalog() }
            else { FanAppShell(baseURL: apiURL, returnTo: initialDestination, features: features) }
            #else
            FanAppShell(baseURL: apiURL, features: features)
            #endif
            }
            #if DEBUG
            .preferredColorScheme(debugAppearance)
            #endif
        }
    }
    private var features: [FanFeatureRegistration] {
        [ContentFanFeature.registration(baseURL: apiURL), W3FanFeatures.registration(baseURL: apiURL), CommerceFanFeature.registration(baseURL: apiURL), TrustFanFeature.registration(baseURL: apiURL), W6FanFeatures.callRegistration(baseURL: apiURL), FanFeatureRegistration(matches: { GrowthFanFeature.matches($0) && !$0.components(separatedBy: "?")[0].hasSuffix("/chat") }, allowsSignedOut: { destination in destination == "/discover" || destination.hasPrefix("/invite/") || destination.hasPrefix("/share/") || (destination.hasPrefix("/creators/") && !destination.contains("/chat")) }, screen: { session in AnyView(GrowthFanFeature(baseURL: apiURL, destination: session.destination, onSignIn: { session.open($0); Task { await session.beginSignIn() } }, onNavigate: session.open)) })] + W6FanFeatures.registrations
    }
    private var apiURL: URL? {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--api-url"), arguments.indices.contains(index + 1), let url = apiOrigin(arguments[index + 1], loopback: true) { return url }
        #endif
        guard let value = Bundle.main.object(forInfoDictionaryKey: "CreatorAPIURL") as? String else { return nil }
        #if DEBUG
        return apiOrigin(value) ?? apiOrigin(value, loopback: true)
        #else
        return apiOrigin(value)
        #endif
    }
    private func apiOrigin(_ value: String, loopback: Bool = false) -> URL? {
        guard let origin = URLComponents(string: value), let host = origin.host, !host.isEmpty,
              origin.user == nil, origin.password == nil, origin.query == nil, origin.fragment == nil,
              origin.percentEncodedPath.isEmpty || origin.percentEncodedPath == "/",
              origin.port == nil || (1...65_535).contains(origin.port!) else { return nil }
        if loopback {
            guard ["localhost", "127.0.0.1"].contains(host), ["http", "https"].contains(origin.scheme ?? "") else { return nil }
        } else { guard origin.scheme == "https" else { return nil } }
        return origin.url
    }
    private var initialDestination: String {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--return-to"), arguments.indices.contains(index + 1) { return arguments[index + 1] }
        #endif
        return "/home"
    }

    #if DEBUG
    private var debugAppearance: ColorScheme? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--appearance"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1] == "night" ? .dark : .light
    }
    #endif
}
