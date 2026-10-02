import SwiftUI

/// W1 installs this registration into the real fan shell; no alternate identity or app root.
@MainActor
public enum W6FanFeatures {
    public static var registrations: [FanFeatureRegistration] {
        [FanFeatureRegistration(matches: { $0 == "/media/voice" }, allowsSignedOut: { $0 == "/media/voice" }, screen: { _ in AnyView(MediaRecordingView(maximumDuration: 60)) })]
    }
    public static func callRegistration(baseURL: URL?) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: { $0.hasPrefix("/calls/") || availabilityCreator($0) != nil }, screen: { session in
            if availabilityCreator(session.destination) != nil { return AnyView(NativeAvailabilityDestination(baseURL: baseURL, model: session)) }
            return AnyView(NativeCallDestination(baseURL: baseURL, model: session))
        })
    }
}
