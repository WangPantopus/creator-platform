package com.pantopus.qelvora.media

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** One real OS request stays bound to its original continuation. Cancellation
 * cannot let a late result authorize a newer account or route's join attempt. */
internal class NativeMediaDevicePermissions(private val context: Context) {
    private data class Pending(val continuation: CancellableContinuation<Boolean>, val permissions: Array<String>)
    private var pending: Pending? = null
    private var closed = false
    var inFlight by mutableStateOf(false); private set
    var launch: ((Array<String>) -> Unit)? = null

    private fun granted(permission: String) = context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    suspend fun request(camera: Boolean): Boolean = withContext(Dispatchers.Main.immediate) {
        check(!closed)
        // Keep a cancelled OS request reserved until its actual callback. An
        // Activity Result callback has no request ID with which to rebind it.
        if (pending != null) return@withContext false
        val wanted = if (camera) arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA) else arrayOf(Manifest.permission.RECORD_AUDIO)
        if (wanted.all(::granted)) return@withContext true
        suspendCancellableCoroutine { continuation ->
            pending = Pending(continuation, wanted)
            inFlight = true
            try {
                checkNotNull(launch).invoke(wanted)
            } catch (error: Exception) {
                pending = null
                inFlight = false
                continuation.resumeWithException(error)
            }
        }
    }
    fun received(result: Map<String, Boolean>) {
        val original = pending ?: return
        pending = null
        inFlight = false
        if (closed || !original.continuation.isActive) return
        original.continuation.resume(original.permissions.all { result[it] == true && granted(it) })
    }
    fun cancel() { pending?.continuation?.cancel() }
    fun close() { closed = true; cancel(); launch = null }
}

@Composable
internal fun rememberNativeMediaDevicePermissions(): NativeMediaDevicePermissions {
    val context = LocalContext.current
    val permissions = remember(context) { NativeMediaDevicePermissions(context) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions(), permissions::received)
    SideEffect { permissions.launch = { launcher.launch(it) } }
    DisposableEffect(permissions) { onDispose { permissions.close() } }
    return permissions
}
