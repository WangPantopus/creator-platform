package com.pantopus.qelvora.media

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.compose.runtime.Composable
import com.pantopus.qelvora.generated.QelvoraCopy
import kotlinx.coroutines.*
import java.util.UUID

/** The native lifetime uses a real redeemed admission and its captured current
 * request. Telecom and foreground service state grant no backend authority. */
internal class TelecomNativeCallTransport(
    context: Context,
    private val sessionId: UUID,
    internal val destination: String,
    private val stillCurrent: suspend () -> Boolean,
    private val authorizeCall: suspend (UUID) -> Boolean,
) : NativeCallScreenTransport, NativeCallDelegate {
    private val context = context.applicationContext
    private val sdk = LiveKitNativeCallTransport(context, sessionId)
    private val tasks = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val foreground = CompletableDeferred<Unit>()
    private val connection = CompletableDeferred<Unit>()
    private val lifetimeNonce = UUID.randomUUID().toString()
    private var admission: CallAdmission? = null
    private var onState: ((String) -> Unit)? = null
    private var closed = false
    private var attempted = false
    internal var cameraRequested = false; private set

    @Composable override fun Media() = sdk.Media()

    override suspend fun connect(admission: CallAdmission, camera: Boolean, onState: (String) -> Unit) {
        check(!closed && !attempted && UUID.fromString(admission.sessionId) == sessionId)
        check(stillCurrent() && authorizeCall(sessionId))
        currentCoroutineContext().ensureActive()
        check(!closed && stillCurrent())
        attempted = true; this.admission = admission; cameraRequested = camera; this.onState = onState
        NativeCallConnectionService.claim(this)
        try {
            // Registration carries a stable app identifier, never account PII.
            val manager = context.getSystemService(TelecomManager::class.java)
            val handle = PhoneAccountHandle(ComponentName(context, NativeCallConnectionService::class.java), "self-managed-calls")
            manager.registerPhoneAccount(PhoneAccount.builder(handle, QelvoraCopy.brandName)
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .setSupportedUriSchemes(listOf("qelvora-call")).build())
            val service = Intent(context, NativeCallForegroundService::class.java)
                .putExtra("sessionId", sessionId.toString()).putExtra("lifetimeNonce", lifetimeNonce)
            context.startForegroundService(service)
            withTimeout(10_000) { foreground.await() }
            check(stillCurrent() && authorizeCall(sessionId))
            val extras = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
                putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, Bundle().apply { putString("sessionId", sessionId.toString()) })
            }
            manager.placeCall(Uri.fromParts("qelvora-call", sessionId.toString(), null), extras)
            withTimeout(30_000) { connection.await() }
            check(!closed && stillCurrent())
            tasks.launch {
                try {
                    var reads = 0
                    while (isActive && !closed) {
                        delay(1_000)
                        if (!stillCurrent() || (++reads % 15 == 0 && !authorizeCall(sessionId))) { disconnect(); return@launch }
                    }
                } catch (_: Exception) { disconnect() }
            }
        } catch (failure: Exception) { disconnect(); throw failure }
    }
    override suspend fun authorize(sessionId: UUID): Boolean =
        !closed && this.sessionId == sessionId && stillCurrent() && authorizeCall(sessionId) && !closed && stillCurrent()
    override suspend fun connect(sessionId: UUID) {
        check(authorize(sessionId))
        val admission = admission ?: error("Current admission unavailable")
        sdk.connect(admission, cameraRequested) { state ->
            tasks.launch { if (!closed && stillCurrent()) onState?.invoke(state) else disconnect() }
        }
        check(authorize(sessionId))
    }
    override fun connected(sessionId: UUID) {
        tasks.launch { if (!closed && this@TelecomNativeCallTransport.sessionId == sessionId && stillCurrent()) connection.complete(Unit) else disconnect() }
    }
    override suspend fun end(sessionId: UUID) { if (this.sessionId == sessionId) { disconnect(); sdk.disconnectAndDrain() } }
    override suspend fun microphone(enabled: Boolean) {
        check(authorize(sessionId)); sdk.microphone(enabled); check(authorize(sessionId))
    }
    override suspend fun camera(enabled: Boolean) {
        check(authorize(sessionId)); sdk.camera(enabled); check(authorize(sessionId))
    }
    internal fun ownsForeground(intent: Intent): Boolean = !closed && admission != null &&
        intent.getStringExtra("sessionId") == sessionId.toString() && intent.getStringExtra("lifetimeNonce") == lifetimeNonce
    internal fun foregroundStarted() { tasks.launch { if (!closed && stillCurrent()) foreground.complete(Unit) else disconnect() } }
    internal fun foregroundLost() { disconnect() }
    override fun disconnect() {
        if (closed) return
        closed = true
        foreground.cancel(); connection.cancel(); tasks.cancel()
        admission = null
        onState?.invoke("disconnected"); onState = null
        if (!NativeCallConnectionService.endOwned(sessionId, this)) {
            CoroutineScope(NonCancellable + Dispatchers.Main.immediate).launch {
                sdk.disconnectAndDrain()
                NativeCallConnectionService.releaseDrained(this@TelecomNativeCallTransport)
            }
        }
        context.stopService(Intent(context, NativeCallForegroundService::class.java))
    }
}
