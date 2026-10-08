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
    private var debugAPIURL: String? = null
    private var debugAppearance: String? = null
    private val destinationDelivery = mutableStateOf(0L)
    private val notificationID = mutableStateOf<String?>(null)
    private val restoreSavedDestination = mutableStateOf(true)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        notificationID.value = GrowthPush.tapId(intent)
        destination.value = returnTarget(intent)
        destinationDelivery.value = savedInstanceState?.getLong("destination_delivery") ?: 0L
        restoreSavedDestination.value = savedInstanceState?.getBoolean("restore_saved_destination")
            ?: (intent.data == null && notificationID.value == null && (!BuildConfig.DEBUG || !intent.hasExtra("return_to")))
        val configured = apiOrigin(BuildConfig.CREATOR_API_URL)
            ?: if (BuildConfig.DEBUG) apiOrigin(BuildConfig.CREATOR_API_URL, loopback = true) else null
        debugAPIURL = if (BuildConfig.DEBUG) apiOrigin(if (intent.hasExtra("api_url")) intent.getStringExtra("api_url") else savedInstanceState?.getString("debug_api_url"), loopback = true) else null
        debugAppearance = if (BuildConfig.DEBUG) (if (intent.hasExtra("appearance")) intent.getStringExtra("appearance") else savedInstanceState?.getString("debug_appearance"))?.takeIf { it in listOf("light", "night") } else null
        val local = debugAPIURL
        setContent {
            val appearance = debugAppearance
            val night = when (appearance) { "night" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            SideEffect {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !night
                    isAppearanceLightNavigationBars = !night
                }
            }
            QelvoraTheme(night = night) {
                if (BuildConfig.DEBUG && intent.getBooleanExtra("catalog", false)) NativeFoundationCatalog(intent.getStringExtra("component")) else FanAppShell(this, local ?: configured, destination.value, fanFeatures(this, local ?: configured), destinationDelivery.value, notificationID.value, restoreSavedDestination.value) { notificationID.value = null }
            }
        }
    }
    override fun onSaveInstanceState(outState: Bundle) {
        outState.putLong("destination_delivery", destinationDelivery.value)
        outState.putBoolean("restore_saved_destination", restoreSavedDestination.value)
        if (BuildConfig.DEBUG) {
            debugAPIURL?.let { outState.putString("debug_api_url", it) }
            debugAppearance?.let { outState.putString("debug_appearance", it) }
        }
        super.onSaveInstanceState(outState)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val launcherResume = intent.action == Intent.ACTION_MAIN && intent.hasCategory(Intent.CATEGORY_LAUNCHER) && intent.data == null && GrowthPush.tapId(intent) == null && (!BuildConfig.DEBUG || !intent.hasExtra("return_to"))
        // Repeated explicit links are new deliveries; launcher resumes keep
        // the current screen. The counter is navigation, never authority.
        if (!launcherResume) {
            restoreSavedDestination.value = false
            setIntent(intent)
            notificationID.value = GrowthPush.tapId(intent)
            destination.value = returnTarget(intent)
            destinationDelivery.value++
        }
    }
    private fun returnTarget(intent: Intent): String {
        if (GrowthPush.tapId(intent) != null) return "/notifications"
        if (BuildConfig.DEBUG) intent.getStringExtra("return_to")?.let { return it }
        val uri = intent.data ?: return "/home"
        if (uri.scheme != "qelvora" || uri.host != "app" || uri.port != -1 || uri.encodedUserInfo != null || uri.fragment != null) return "/unavailable"
        return uri.encodedPath.orEmpty() + (uri.encodedQuery?.let { "?$it" } ?: "")
    }
    private fun apiOrigin(value: String?, loopback: Boolean = false): String? = value?.takeIf {
        runCatching {
            val origin = URI(it)
            origin.host?.isNotEmpty() == true && origin.userInfo == null && origin.rawQuery == null && origin.rawFragment == null &&
                origin.rawPath in listOf("", "/") && (origin.port == -1 || origin.port in 1..65535) &&
                if (loopback) origin.scheme in listOf("http", "https") && origin.host in listOf("localhost", "127.0.0.1", "10.0.2.2") else origin.scheme == "https"
        }.getOrDefault(false)
    }
}
