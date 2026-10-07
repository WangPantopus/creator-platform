package com.pantopus.qelvora.identity

import android.content.Context
import androidx.compose.runtime.rememberCoroutineScope
import com.pantopus.qelvora.content.ContentFanFeature
import com.pantopus.qelvora.conversation.W3FanFeatures
import com.pantopus.qelvora.commerce.CommerceFanFeature
import com.pantopus.qelvora.media.W6FanFeatures
import com.pantopus.qelvora.studio.StudioTeamFeature
import com.pantopus.qelvora.ui.growthWeeklyImpactRegistration
import com.pantopus.qelvora.ui.GrowthFanFeature
import com.pantopus.qelvora.ui.publicVerificationRegistration
import com.pantopus.qelvora.ui.trustFanRegistration
import kotlinx.coroutines.launch

/** Authority remains in the owning API. Order gives Access to Commerce. */
fun fanFeatures(context: Context, baseURL: String?): List<FanFeatureRegistration> = listOf(
    publicVerificationRegistration(baseURL),
    StudioTeamFeature.registration(),
    ContentFanFeature.registration(context, baseURL),
    W3FanFeatures.registration(baseURL),
    CommerceFanFeature.registration(context, baseURL),
    trustFanRegistration(context, baseURL),
    W6FanFeatures.callRegistration(baseURL),
    growthWeeklyImpactRegistration(baseURL),
    FanFeatureRegistration(
        matches = { !it.substringBefore('?').endsWith("/chat") && (it == "/home" || it == "/discover" || it.startsWith("/notifications") || it.startsWith("/creators/") || it.startsWith("/invite/") || it.startsWith("/share/")) },
        allowsSignedOut = { it == "/discover" || it.startsWith("/invite/") || it.startsWith("/share/") || (it.startsWith("/creators/") && !it.contains("/chat")) },
        screen = { model ->
            val scope = rememberCoroutineScope()
            GrowthFanFeature(baseURL, token = model::currentToken, destination = model.destination, onSignIn = { model.open(it); scope.launch { model.beginSignIn() } }, onNavigate = model::open)
        }
    )
) + W6FanFeatures.registrations
