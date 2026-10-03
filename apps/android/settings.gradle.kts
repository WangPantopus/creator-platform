pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google(); mavenCentral()
        // LiveKit's exact AudioSwitch fork is published by its upstream on
        // JitPack. Resolve only that module here; all other modules stay on
        // the canonical Google/Maven Central repositories.
        exclusiveContent {
            forRepository { maven { url = uri("https://jitpack.io") } }
            filter { includeModule("com.github.davidliu", "audioswitch") }
        }
    }
}
rootProject.name = "QelvoraAndroid"
include(":app")
