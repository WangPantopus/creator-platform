package com.pantopus.qelvora.identity

import android.content.Context

/** The release twin of the debug harness hook. It does nothing, by design. */
@Suppress("UNUSED_PARAMETER")
object HarnessLaunch {
    suspend fun signInIfRequested(context: Context, model: FanSession) = Unit
}
