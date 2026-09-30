package com.pantopus.qelvora.identity

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun CredentialSettings(activity: Activity, model: FanSession) {
    var keys by remember(model.session?.accountId) { mutableStateOf<APIPasskeys?>(null) }
    var busy by remember { mutableStateOf(false) }; var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope(); var request by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    LaunchedEffect(model.session?.accountId) { runCatching { model.api?.passkeys() }.onSuccess { keys = it } }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BasicText("Signing passkeys", style = qText("title").copy(color = qColor("ink")))
        BasicText("External creator proof and fresh Pantopus authorization are required. Each named act needs its own exact-content signature.", style = qText("caption").copy(color = qColor("ink-muted")))
        keys?.credentials?.forEach { key -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(if (key.revoked) "Revoked passkey" else "Registered passkey", style = qText("body").copy(color = qColor("ink")))
            if (!key.revoked) Button("Revoke", ButtonVariant.QUIET, disabled = busy) { scope.launch { busy = true; try { model.api?.revokePasskey(APIPasskeyRevocation(key.id)); keys = model.api?.passkeys() } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { message = "Revocation could not complete. Reconnect and try again." } finally { busy = false } } }
        } }
        Button(if (busy) "Waiting for device…" else "Register a signing passkey", ButtonVariant.SECONDARY, block = true, disabled = busy) {
            request = scope.launch {
                busy = true; message = ""; var challenge: String? = null
                try { val api = model.api ?: error("unconfigured"); val begin = api.beginPasskey(); challenge = begin.challengeId; val credential = PasskeyCeremony(activity).register(begin.options); api.registerPasskey(APIPasskeyRegistration(begin.challengeId, credential)); keys = api.passkeys(); message = "Passkey registered. Nothing was published." }
                catch (cancelled: CancellationException) { message = "Registration cancelled. Nothing was published."; throw cancelled }
                catch (failure: Exception) { message = if (failure is CreatorAPIError) "Creator proof must be approved and Pantopus authorization must be fresh before enrollment." else failure.message ?: "The passkey provider could not complete registration." }
                finally { challenge?.let { id -> kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { runCatching { model.api?.cancelPasskey(id) } } }; busy = false }
            }
        }
        if (busy) Button("Cancel", ButtonVariant.QUIET) { request?.cancel() }
        if (message.isNotEmpty()) Notice(title = "Passkey status", children = message)
    }
}
