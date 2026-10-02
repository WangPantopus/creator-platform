package com.pantopus.qelvora.media

import com.pantopus.qelvora.identity.FanFeatureRegistration

/** W1 composes this real recording destination into its fan shell. */
object W6FanFeatures {
    val registrations = listOf(FanFeatureRegistration({ it == "/media/voice" }, { it == "/media/voice" }) { VoiceRecordingScreen() })
    fun callRegistration(baseURL: String?) = FanFeatureRegistration({ it.startsWith("/calls/") || availabilityCreator(it) != null }) { model ->
        if (availabilityCreator(model.destination) != null) NativeAvailabilityDestination(baseURL, model)
        else NativeCallDestination(baseURL, model)
    }
}
