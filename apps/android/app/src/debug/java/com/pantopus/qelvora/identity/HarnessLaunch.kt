package com.pantopus.qelvora.identity

import android.app.Activity
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

/**
 * Operated verification (lane 7). Debug builds only: the release source set
 * holds an empty twin of this object, so a release build contains none of it.
 * Activity intent extras:
 *   harness_reset=true    wipe the saved credential, saved place and private
 *                         state before anything is sent, once, so a scenario
 *                         starts from a clean app
 *   harness_actor=<text>  sign in as the development actor whose label contains
 *                         <text>, when nobody is signed in
 * Nothing here grants authority: it uses the same sign-in the person would,
 * against the development identity the server advertises.
 */
object HarnessLaunch {
    /** Before the shell's first session check, so a stale credential is never sent. */
    suspend fun resetIfRequested(context: Context, model: FanSession) {
        val intent = (context as? Activity)?.intent ?: return
        if (!intent.getBooleanExtra("harness_reset", false)) return
        // One launch, one run: rotation recreates the activity with the same intent.
        intent.removeExtra("harness_reset")
        model.purge()
    }

    /** After the first session check: nothing happens if someone is signed in. */
    suspend fun signInIfRequested(context: Context, model: FanSession) {
        val intent = (context as? Activity)?.intent ?: return
        val nativeSubject = intent.getStringExtra("harness_native_sub")
        if (nativeSubject != null) {
            intent.removeExtra("harness_native_sub")
            val rawOrigin = intent.getStringExtra("harness_provider_url") ?: return
            intent.removeExtra("harness_provider_url")
            val origin = runCatching { URI(rawOrigin) }.getOrNull() ?: return
            if (model.session != null || model.hasSavedCredential || origin.scheme != "http" ||
                origin.host !in listOf("127.0.0.1", "localhost") || origin.userInfo != null ||
                origin.query != null || origin.fragment != null || origin.path !in listOf("", "/")) return
            model.beginSignIn()
            model.signIn(NativeIdentityProvider.GOOGLE) { nonce ->
                // Fake only the external sheet. The app exchanges its own real
                // backend nonce and renders the real backend's age decision.
                withContext(Dispatchers.IO) {
                    val connection = origin.resolve("/__mint").toURL().openConnection() as HttpURLConnection
                    try {
                        connection.requestMethod = "POST"; connection.doOutput = true
                        connection.connectTimeout = 5_000; connection.readTimeout = 5_000
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.outputStream.use { it.write(JSONObject().put("provider", "google")
                            .put("aud", com.pantopus.qelvora.BuildConfig.CREATOR_GOOGLE_SERVER_CLIENT_ID)
                            .put("sub", nativeSubject).put("nonce", nonce).toString().toByteArray()) }
                        if (connection.responseCode != 200) throw NativeIdentityUnavailable()
                        NativeIdentityCredential(JSONObject(connection.inputStream.bufferedReader().use { it.readText() }).getString("idToken"))
                    } finally { connection.disconnect() }
                }
            }
            return
        }
        val wanted = intent.getStringExtra("harness_actor") ?: return
        intent.removeExtra("harness_actor")
        if (model.session != null || model.hasSavedCredential) return
        model.beginSignIn()
        val actor = model.actors.firstOrNull { it.label.contains(wanted, ignoreCase = true) }
        if (actor == null) { model.error = "No development actor matches \"$wanted\"."; return }
        model.selectActor(actor.id)
    }
}
