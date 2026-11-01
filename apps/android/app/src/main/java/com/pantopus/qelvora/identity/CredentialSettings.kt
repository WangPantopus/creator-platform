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
        BasicText(QelvoraCopy.text("nativeSigningPasskeys"), style = qText("title").copy(color = qColor("ink")))
        BasicText(QelvoraCopy.text("nativeExternalCreatorProofAndFresh"), style = qText("caption").copy(color = qColor("ink-muted")))
        keys?.credentials?.forEach { key -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(if (key.revoked) QelvoraCopy.text("nativeRevokedPasskey") else QelvoraCopy.text("nativeRegisteredPasskey"), style = qText("body").copy(color = qColor("ink")))
            if (!key.revoked) Button(QelvoraCopy.text("revoke"), ButtonVariant.QUIET, disabled = busy) { scope.launch { busy = true; try { model.api?.revokePasskey(APIPasskeyRevocation(key.id)); keys = model.api?.passkeys() } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { message = QelvoraCopy.text("nativeRevocationCouldNotCompleteReconnect") } finally { busy = false } } }
        } }
        Button(if (busy) QelvoraCopy.text("nativeWaitingForDevice") else QelvoraCopy.text("nativeRegisterASigningPasskey"), ButtonVariant.SECONDARY, block = true, disabled = busy) {
            request = scope.launch {
                busy = true; message = ""; var challenge: String? = null
                try { val api = model.api ?: error("unconfigured"); val begin = api.beginPasskey(); challenge = begin.challengeId; val credential = PasskeyCeremony(activity).register(begin.options); api.registerPasskey(APIPasskeyRegistration(begin.challengeId, credential)); keys = api.passkeys(); message = QelvoraCopy.text("nativePasskeyRegisteredNothingWasPublished") }
                catch (cancelled: CancellationException) { message = QelvoraCopy.text("nativeRegistrationCancelledNothing"); throw cancelled }
                catch (failure: Exception) { message = if (failure is CreatorAPIError) QelvoraCopy.text("nativeCreatorProofMustBeApprovedAnd") else failure.message ?: QelvoraCopy.text("nativeThePasskeyProviderCouldNotComplete") }
                finally { challenge?.let { id -> kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { runCatching { model.api?.cancelPasskey(id) } } }; busy = false }
            }
        }
        if (busy) Button(QelvoraCopy.text("cancel"), ButtonVariant.QUIET) { request?.cancel() }
        if (message.isNotEmpty()) Notice(title = QelvoraCopy.text("nativePasskeyStatus"), children = message)
    }
}
