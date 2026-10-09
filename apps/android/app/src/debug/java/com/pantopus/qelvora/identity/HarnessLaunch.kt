package com.pantopus.qelvora.identity

import android.app.Activity
import android.content.Context

/**
 * Operated verification (lane 7). Debug builds only: the release source set
 * holds an empty twin of this object, so a release build contains none of it.
 * Activity intent extras:
 *   harness_reset=true    wipe the saved credential, saved place and private
 *                         state once, so a scenario starts from a clean app
 *   harness_actor=<text>  sign in as the development actor whose label contains
 *                         <text>, when nobody is signed in
 * Nothing here grants authority: it uses the same sign-in the person would,
 * against the development identity the server advertises.
 */
object HarnessLaunch {
    suspend fun signInIfRequested(context: Context, model: FanSession) {
        val intent = (context as? Activity)?.intent ?: return
        val reset = intent.getBooleanExtra("harness_reset", false)
        val wanted = intent.getStringExtra("harness_actor")
        if (!reset && wanted == null) return
        // One launch, one run: rotation recreates the activity with the same intent.
        intent.removeExtra("harness_reset"); intent.removeExtra("harness_actor")
        if (reset) model.purge()
        if (wanted == null || model.session != null || model.hasSavedCredential) return
        model.beginSignIn()
        val actor = model.actors.firstOrNull { it.label.contains(wanted, ignoreCase = true) }
        if (actor == null) { model.error = "No development actor matches \"$wanted\"."; return }
        model.selectActor(actor.id)
    }
}
