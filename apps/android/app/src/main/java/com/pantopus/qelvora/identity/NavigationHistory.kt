package com.pantopus.qelvora.identity

import com.pantopus.qelvora.studio.StudioTeamFeature

/** One screen the person has been through: its path and the tab it was reached from. */
data class NavEntry(val path: String, val tab: String)

/**
 * Where Back goes (work package 7.2, one spec for both platforms).
 *
 * The app keeps the screens you moved through, newest last. Back returns to the
 * last one. When there is none (after a link, a push or a restart), Back goes to
 * the screen this one belongs under, and from a tab other than Home to Home.
 * Paths only: no credential, message or account data is ever kept here.
 */
object NavigationParents {
    const val LIMIT = 24
    val roots = listOf("/home", "/discover", "/requests", "/you")
    private val handle = "[a-z0-9_]{3,30}"
    private val creatorChild = Regex("^/creators/($handle)/(?:chat|requests|access|posts/[a-f0-9-]{36})$")
    private val creator = Regex("^/creators/$handle$")
    private val transient = Regex("^/notifications/[a-f0-9-]{36}$")

    fun path(destination: String): String = destination.substringBefore('?')
    fun isRoot(destination: String): Boolean = destination in roots

    /** A route that only forwards, such as a tapped notification: it replaces itself. */
    fun isTransient(destination: String): Boolean = transient.matches(path(destination))

    /** The screen this one belongs under, or null for Home, where Back leaves the app. */
    fun parent(destination: String): String? {
        val path = path(destination)
        // A sub-screen of a tab (for example /you?creatorId=...) belongs under the tab itself.
        if (path in roots && destination != path) return path
        return when {
            path == "/home" -> null
            path in roots -> "/home"
            creatorChild.matches(path) -> "/creators/" + creatorChild.matchEntire(path)!!.groupValues[1]
            creator.matches(path) -> "/discover"
            path == "/notifications" -> "/home"
            path.startsWith("/notifications/") -> "/notifications"
            path == "/commerce/spending" -> "/you"
            path.startsWith("/commerce/") || path.startsWith("/requests/") -> "/requests"
            path.startsWith("/support") || path.startsWith("/trust") || path.startsWith("/identity/") ||
                path == "/onboarding/handle" || path.startsWith("/studio/") -> "/you"
            else -> "/home"
        }
    }

    /** The tab a destination belongs to when nothing says where the person came from. */
    fun tab(destination: String): String {
        val path = path(destination)
        val account = path.startsWith("/identity/") || path == "/support" || path.startsWith("/support/") ||
            path == "/notifications/settings" || path == "/studio/impact" || path == "/commerce/spending" ||
            StudioTeamFeature.matches(path)
        return when {
            account -> "/you"
            path.startsWith("/commerce/") -> "/requests"
            else -> roots.firstOrNull { path == it || path.startsWith("$it/") } ?: "/home"
        }
    }

    // Saved with the activity's state so rotation and process death keep the trail.
    fun encode(entries: List<NavEntry>): Array<String> = entries.map { it.tab + "\n" + it.path }.toTypedArray()
    fun decode(values: Array<String>?): List<NavEntry> = values.orEmpty().mapNotNull { value ->
        val tab = value.substringBefore('\n')
        val path = value.substringAfter('\n', "")
        if (tab in roots && path.length <= 2048 && com.pantopus.qelvora.generated.ApplicationDestination.isPermitted(path)) NavEntry(path, tab) else null
    }.takeLast(LIMIT)
}
