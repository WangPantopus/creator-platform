package com.pantopus.qelvora.studio

import com.pantopus.qelvora.generated.ApplicationDestination
import com.pantopus.qelvora.identity.FanFeatureRegistration
import java.util.UUID

/** Route selection only; the genuine Studio producer owns permission. */
object StudioTeamFeature {
    private fun creatorId(destination: String): String? {
        if (!ApplicationDestination.isPermitted(destination)) return null
        val parts = destination.removePrefix("/").split("/")
        if (parts.size != 3 || parts[0] != "studio" || parts[2] != "team") return null
        val value = parts[1]
        if (runCatching { UUID.fromString(value).toString() == value }.getOrDefault(false)) return value
        return null
    }

    fun matches(destination: String): Boolean =
        (destination == "/studio/workspace" && ApplicationDestination.isPermitted(destination)) || creatorId(destination) != null

    fun registration() = FanFeatureRegistration(matches = ::matches, screen = { session ->
        StudioTeamWorkspace(
            session = session,
            creatorId = creatorId(session.destination),
            onOpenTeam = { session.open("/studio/$it/team") },
            onReturnToWorkspace = { session.open("/studio/workspace") },
        )
    })
}
