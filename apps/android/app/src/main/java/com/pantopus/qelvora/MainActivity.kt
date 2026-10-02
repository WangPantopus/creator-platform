package com.pantopus.qelvora

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.SideEffect
import androidx.core.view.WindowCompat
import androidx.compose.foundation.isSystemInDarkTheme
import android.content.Intent
import java.net.URI
import com.pantopus.qelvora.ui.NativeFoundationCatalog
import com.pantopus.qelvora.ui.QelvoraTheme
import com.pantopus.qelvora.ui.GrowthPush
import com.pantopus.qelvora.identity.FanAppShell
import com.pantopus.qelvora.identity.fanFeatures

class MainActivity : ComponentActivity() {
    private val destination = mutableStateOf("/home")
    private val destinationDelivery = mutableStateOf(0L)
    private val notificationID = mutableStateOf<String?>(null)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        notificationID.value = GrowthPush.tapId(intent)
        destination.value = returnTarget(intent)
        val configured = BuildConfig.CREATOR_API_URL.takeIf { it.startsWith("https://") }
        val local = if (BuildConfig.DEBUG) intent.getStringExtra("api_url")?.takeIf { runCatching { URI(it).let { url -> url.scheme in listOf("http", "https") && url.userInfo == null && url.host in listOf("localhost", "127.0.0.1", "10.0.2.2") } }.getOrDefault(false) } else null
        setContent {
            val appearance = if (BuildConfig.DEBUG) intent.getStringExtra("appearance") else null
            val night = when (appearance) { "night" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            SideEffect {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !night
                    isAppearanceLightNavigationBars = !night
                }
            }
            QelvoraTheme(night = night) {
                if (BuildConfig.DEBUG && intent.getBooleanExtra("catalog", false)) NativeFoundationCatalog(intent.getStringExtra("component")) else FanAppShell(this, local ?: configured, destination.value, fanFeatures(this, local ?: configured), destinationDelivery.value, notificationID.value) { notificationID.value = null }
            }
        }
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent)
        // A launcher return keeps the user's current screen. Every explicit
        // link is a new delivery, even when its target equals the last link.
        val launcherResume = intent.action == Intent.ACTION_MAIN && intent.hasCategory(Intent.CATEGORY_LAUNCHER) && intent.data == null && (!BuildConfig.DEBUG || !intent.hasExtra("return_to"))
        if (!launcherResume) {
            notificationID.value = GrowthPush.tapId(intent)
            destination.value = returnTarget(intent)
            destinationDelivery.value++
        }
    }
    private fun returnTarget(intent: Intent): String {
        if (GrowthPush.tapId(intent) != null) return "/notifications"
        if (BuildConfig.DEBUG) intent.getStringExtra("return_to")?.let { return it }
        val uri = intent.data ?: return "/home"
        if (uri.scheme != "qelvora" || uri.host != "app" || uri.encodedUserInfo != null || uri.fragment != null) return "/unavailable"
        return uri.encodedPath.orEmpty() + (uri.encodedQuery?.let { "?$it" } ?: "")
    }
}
