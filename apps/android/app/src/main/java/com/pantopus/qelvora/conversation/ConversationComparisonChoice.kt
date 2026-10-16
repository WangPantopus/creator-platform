package com.pantopus.qelvora.conversation

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

@Serializable data class ConversationComparisonPolicy(val version: String, val notice: String, val processorPolicyVersion: String)
@Serializable data class ConversationComparisonConsent(val policy: ConversationComparisonPolicy?, val allowed: Boolean, val consentedAt: String?, val expiresAt: String?)
@Serializable data class ConversationComparisonResult(val included: Boolean)

/** Live consent is never saved in app storage. Closing/backgrounding cancels
 * the actual HTTP call, including a question's provider operation. When
 * comparisons are off, or turn off while it is open, it shows nothing and calls
 * [onUnavailable] so the screen that opened it can close it (WP 7.4 P11). */
@Composable fun ConversationComparisonChoice(client: ConversationClient, root: String, messageId: String? = null, onUnavailable: () -> Unit = {}) {
    var choice by remember(client, root) { mutableStateOf<ConversationComparisonConsent?>(null) }
    var available by remember(client, root) { mutableStateOf<Boolean?>(null) }
    var busy by remember(client, root) { mutableStateOf(false) }
    var failure by remember(client, root) { mutableStateOf("") }
    var status by remember(client, root) { mutableStateOf("") }
    var revision by remember(client, root) { mutableStateOf(0) }
    var operation by remember(client, root) { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    fun conceal() { revision++; operation?.cancel(); operation = null; choice = null; available = null; busy = false; failure = ""; status = "" }
    fun current(ticket: Int) = foreground && ticket == revision
    // The server's answer when comparisons are off: the choice closes and nothing is said.
    fun unavailable(error: Exception): Boolean {
        if ((error as? ConversationFailure)?.code != "comparison_unavailable") return false
        choice = null; failure = ""; status = ""; available = false
        return true
    }
    DisposableEffect(lifecycle, client, root) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!foreground) conceal()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); conceal() }
    }
    suspend fun refresh() {
        revision++; val ticket = revision; choice = null; available = null; failure = ""; status = ""
        try {
            val caps = client.json.decodeFromJsonElement<ConversationCapabilities>(client.request("capabilities", publicRead = true))
            if (!current(ticket)) return
            available = caps.comparisonsAvailable
            if (caps.comparisonsAvailable) {
                val fresh = client.json.decodeFromJsonElement<ConversationComparisonConsent>(client.request("$root/comparison-consent"))
                if (current(ticket)) choice = fresh
            }
        } catch (error: Exception) { if (error is CancellationException) throw error; if (current(ticket) && !unavailable(error)) failure = error.message ?: QelvoraCopy.text("nativeReconnectToViewYourComparison") }
    }
    fun act(action: String) {
        val original = choice ?: return
        if (busy || !foreground) return
        val ticket = revision; busy = true; failure = ""; status = ""
        operation = scope.launch {
            try {
                if (action == "include") {
                    if (messageId == null || !original.allowed) return@launch
                    val result = client.json.decodeFromJsonElement<ConversationComparisonResult>(client.request("$root/messages/$messageId/comparison", buildJsonObject {}))
                    if (current(ticket)) status = if (result.included) QelvoraCopy.text("nativeAGeneralVersionOfThisQuestion") else QelvoraCopy.text("nativeThisQuestionWasNotIncludedIt")
                } else {
                    val input = buildJsonObject {
                        put("action", action)
                        if (action == "allow") { put("policyVersion", original.policy?.version ?: return@launch); put("consent", true) }
                    }
                    val fresh = client.json.decodeFromJsonElement<ConversationComparisonConsent>(client.request("$root/comparison-consent", input))
                    if (current(ticket)) {
                        choice = fresh
                        status = if (action == "withdraw") QelvoraCopy.text("nativeYourComparisonChoiceIsWithdrawn") else QelvoraCopy.text("nativeYourComparisonChoiceIsSavedChoose")
                    }
                }
            } catch (error: Exception) { if (error is CancellationException) throw error; if (current(ticket) && !unavailable(error)) failure = error.message ?: QelvoraCopy.text("nativeTheResultCouldNotBeConfirmed") }
            finally { if (current(ticket)) busy = false }
        }
    }
    LaunchedEffect(client, root, foreground) { if (foreground) refresh() else conceal() }
    LaunchedEffect(available) { if (available == false) onUnavailable() }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (failure.isNotEmpty()) {
            Notice(title = QelvoraCopy.text("nativeComparisonStatus"), children = failure)
            Button(QelvoraCopy.text("nativeRefreshComparisonChoice"), variant = ButtonVariant.SECONDARY, disabled = busy) { operation = scope.launch { refresh() } }
        }
        if (choice == null && available != false && failure.isEmpty()) BasicText(QelvoraCopy.text("nativeLoadingYourComparisonChoice"), style = qText("body").copy(color = qColor("ink")))
        choice?.let { current ->
            BasicText(if (current.allowed) QelvoraCopy.text("nativeAllowedForThisCreator") else QelvoraCopy.text("nativeOffOptional"), style = qText("data-sm").copy(color = qColor("ink")))
            BasicText(current.policy?.notice ?: QelvoraCopy.text("nativeTheCurrentComparisonNoticeIs"), style = qText("body").copy(color = qColor("ink")))
            if (current.allowed && current.expiresAt != null) BasicText(QelvoraCopy.text("nativeYourChoiceEndsDate", mapOf("date" to current.expiresAt)), style = qText("caption").copy(color = qColor("ink")))
            if (busy || status.isNotEmpty()) BasicText(if (busy) QelvoraCopy.text("nativeSavingYourComparisonChoiceOr") else status, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = qText("body").copy(color = qColor("ink")))
            if (current.allowed) {
                if (messageId != null) Button(QelvoraCopy.text("nativeIncludeThisQuestion"), variant = ButtonVariant.AI, disabled = busy, block = true) { act("include") }
                Button(QelvoraCopy.text("nativeWithdrawComparisonChoice"), variant = ButtonVariant.SECONDARY, disabled = busy, block = true) { act("withdraw") }
            } else if (current.policy != null) Button(QelvoraCopy.text("nativeAllowQuestionsForAIComparisons"), variant = ButtonVariant.AI, disabled = busy, block = true) { act("allow") }
        }
    }
}
