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
import com.pantopus.qelvora.identity.FanAppShell
import com.pantopus.qelvora.identity.fanFeatures

class MainActivity : ComponentActivity() {
    private val destination = mutableStateOf("/home")
    private var debugAPIURL: String? = null
    private var debugAppearance: String? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        destination.value = returnTarget(intent)
        val configured = BuildConfig.CREATOR_API_URL.takeIf { it.startsWith("https://") }
        debugAPIURL = if (BuildConfig.DEBUG) debugURL(if (intent.hasExtra("api_url")) intent.getStringExtra("api_url") else savedInstanceState?.getString("debug_api_url")) else null
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
                if (BuildConfig.DEBUG && intent.getBooleanExtra("catalog", false)) NativeFoundationCatalog(intent.getStringExtra("component")) else FanAppShell(this, local ?: configured, destination.value, fanFeatures(this, local ?: configured))
            }
        }
    }
    override fun onSaveInstanceState(outState: Bundle) {
        if (BuildConfig.DEBUG) {
            debugAPIURL?.let { outState.putString("debug_api_url", it) }
            debugAppearance?.let { outState.putString("debug_appearance", it) }
        }
        super.onSaveInstanceState(outState)
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent); setIntent(intent)
        val launcherResume = intent.action == Intent.ACTION_MAIN && intent.hasCategory(Intent.CATEGORY_LAUNCHER) && intent.data == null && (!BuildConfig.DEBUG || !intent.hasExtra("return_to"))
        if (!launcherResume) destination.value = returnTarget(intent)
    }
    private fun debugURL(value: String?): String? = value?.takeIf { runCatching { URI(it).let { url -> url.scheme in listOf("http", "https") && url.userInfo == null && url.host in listOf("localhost", "127.0.0.1", "10.0.2.2") } }.getOrDefault(false) }
    private fun returnTarget(intent: Intent): String {
        if (BuildConfig.DEBUG) intent.getStringExtra("return_to")?.let { return it }
        val uri = intent.data ?: return "/home"
        if (uri.scheme != "qelvora" || uri.host != "app" || uri.encodedUserInfo != null || uri.fragment != null) return "/unavailable"
        return uri.encodedPath.orEmpty() + (uri.encodedQuery?.let { "?$it" } ?: "")
    }
}
