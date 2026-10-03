package com.pantopus.qelvora.identity

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.conversation.ConversationClient
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

/** Renders only the original server-issued pending offer in this account. */
@Composable
internal fun NativeIntroOffer(client: ConversationClient, root: String, session: FanSession,
    offeredId: String?, policyAvailable: Boolean, enabled: Boolean) {
    val current = session.session ?: return
    if (current.fan == null) return
    var offerId by remember(root, current.accountId, current.sessionId) { mutableStateOf<String?>(null) }
    var intro by remember(root, current.accountId, current.sessionId) { mutableStateOf("") }
    var disposition by remember(root, current.accountId, current.sessionId) { mutableStateOf<String?>(null) }
    var error by remember(root, current.accountId, current.sessionId) { mutableStateOf("") }
    var busy by remember(root, current.accountId, current.sessionId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(client, root, offeredId, policyAvailable, enabled) {
        if (!policyAvailable) offerId = null
        else if (enabled) {
            try {
                val result = client.request("$root/intro-offer").jsonObject
                val id = result["offerId"]?.jsonPrimitive?.contentOrNull
                offerId = id?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }
                if (offerId != null && current.fan.intro.isNotBlank() && disposition == null) disposition = "saved"
            } catch (failure: Exception) { if (failure is CancellationException) throw failure }
        }
    }
    val id = offerId ?: return
    val finish: (Boolean) -> Unit = { save -> scope.launch {
        if (!busy && enabled && policyAvailable && session.session?.accountId == current.accountId && session.session?.sessionId == current.sessionId) {
            busy = true; error = ""
            try {
                if (disposition == null && save) {
                    if (!session.saveIntro(intro, current.accountId, current.sessionId)) {
                        error = session.error.ifEmpty { QelvoraCopy.text("introOfferUnavailable") }
                        return@launch
                    }
                    currentCoroutineContext().ensureActive()
                    if (session.session?.accountId != current.accountId || session.session?.sessionId != current.sessionId) return@launch
                    disposition = "saved"
                } else if (disposition == null) disposition = "skipped"
                val result = client.request("$root/intro-offer/acknowledgement", buildJsonObject { put("offerId", id) }).jsonObject
                currentCoroutineContext().ensureActive()
                if (result["acknowledged"]?.jsonPrimitive?.booleanOrNull != true) error = QelvoraCopy.text("introOfferAckUnavailable")
                else offerId = null
            } catch (failure: Exception) {
                if (failure is CancellationException) throw failure
                error = if (disposition == null) QelvoraCopy.text("introOfferUnavailable") else QelvoraCopy.text("introOfferAckUnavailable")
            } finally { busy = false }
        }
    } }
    Column(Modifier.fillMaxWidth().background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BasicText(QelvoraCopy.text("introOfferTitle"), style = qText("title").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
        BasicText(QelvoraCopy.text("introOfferBody"), style = qText("caption").copy(color = qColor("ink")))
        if (disposition != null) {
            BasicText(QelvoraCopy.text(if (disposition == "saved") "introOfferSavedPending" else "introOfferSkippedPending"), style = qText("caption").copy(color = qColor("ink")))
            Button(QelvoraCopy.text(if (busy) "introOfferAcknowledging" else "introOfferFinish"), ButtonVariant.SECONDARY, block = true, disabled = busy || !enabled) { finish(false) }
        } else {
            BasicText(QelvoraCopy.text("introOfferLabel"), style = qText("label").copy(color = qColor("ink")))
            BasicTextField(intro, { intro = it.take(240) }, enabled = !busy,
                modifier = Modifier.fillMaxWidth().heightIn(min = 96.dp).background(qColor("ground")).padding(12.dp).semantics { contentDescription = QelvoraCopy.text("introOfferLabel") },
                textStyle = qText("body").copy(color = qColor("ink")), cursorBrush = SolidColor(qColor("ink")), minLines = 3, maxLines = 6)
            Button(QelvoraCopy.text(if (busy) "introOfferSaving" else "introOfferSave"), ButtonVariant.SECONDARY, block = true, disabled = busy || !enabled || intro.isBlank()) { finish(true) }
            Button(QelvoraCopy.text("introOfferSkip"), ButtonVariant.QUIET, block = true, disabled = busy || !enabled) { finish(false) }
        }
        if (error.isNotEmpty()) Notice(title = QelvoraCopy.text("introOfferTitle"), children = error)
    }
}
