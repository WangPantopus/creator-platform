package com.pantopus.qelvora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanFeatureRegistration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

private fun verificationId(destination: String): String? {
    val parts = destination.split('/')
    if (!ApplicationDestination.isPermitted(destination) || parts.size != 3 || parts[0].isNotEmpty() || parts[1] != "verify") return null
    return parts[2].takeIf { runCatching { UUID.fromString(it).toString() == it }.getOrDefault(false) }
}

/** Reads only the server's public projection, without session credentials. */
fun publicVerificationRegistration(baseURL: String?) = FanFeatureRegistration(
    matches = { verificationId(it) != null },
    allowsSignedOut = { verificationId(it) != null },
    screen = { session ->
        val id = verificationId(session.destination)
        if (id == null) Notice(title = QelvoraCopy.text("identityVerificationSignedUnavailableTitle"), children = QelvoraCopy.text("identityVerificationInvalidLink"))
        else PublicVerificationScreen(baseURL, id, onHome = { session.open("/home") })
    }
)

@Composable
private fun PublicVerificationScreen(baseURL: String?, signedActId: String, onHome: () -> Unit) {
    val client = remember(baseURL) { baseURL?.let { CreatorAPIClient(it) { null } } }
    var signature by remember(baseURL, signedActId) { mutableStateOf<APIPublicSignature?>(null) }
    var failure by remember(baseURL, signedActId) { mutableStateOf<String?>(null) }
    var missing by remember(baseURL, signedActId) { mutableStateOf(false) }
    var loading by remember(baseURL, signedActId) { mutableStateOf(true) }
    var attempt by remember(baseURL, signedActId) { mutableStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(baseURL, signedActId, foreground, attempt) {
        signature = null; failure = null; missing = false; loading = false
        if (foreground && client != null) {
            loading = true
            try {
                val response = client.publicSignature(signedActId)
                currentCoroutineContext().ensureActive()
                if (response.signedActId != signedActId || response.creatorName.isBlank() || !Regex("[a-f0-9]{64}").matches(response.contentHash)) throw IllegalStateException("Unreadable verification response")
                signature = response
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                missing = (error as? CreatorAPIError)?.status == 404
                failure = if (missing) QelvoraCopy.text("identityVerificationMissing") else QelvoraCopy.text("identityVerificationFailed")
            }
            loading = false
        }
    }
    val retry = { signature = null; failure = null; loading = true; attempt += 1 }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        VerificationText(QelvoraCopy.text("identityVerificationPageTitle"), "title", modifier = Modifier.semantics { heading() })
        val current = if (foreground) signature?.takeIf { it.signedActId == signedActId } else null
        if (current != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Glyph("sealCheck", 40.dp, qColor("maya-ink"), qColor("ground"))
                VerificationText(QelvoraCopy.text("signedBy", mapOf("name" to current.creatorName)), "display-lg", modifier = Modifier.weight(1f).semantics { heading() })
            }
            VerificationText(current.explanation)
            if (current.status != APIPublicSignatureStatus.VALID) Notice(title = verificationStatus(current.status), children = QelvoraCopy.text("identityVerificationHistoricalUnavailable"))
            val text = publicVerificationText(current)
            if (text != null) {
                if (current.actType == "reply" || current.actType == "approved_draft") {
                    Message(kind = if (current.actType == "approved_draft") MessageKind.APPROVED_DRAFT else MessageKind.HUMAN_CREATOR, children = text, name = current.creatorName, actions = false, onVerify = retry)
                } else {
                    Column(Modifier.fillMaxWidth().background(qColor("maya-surface"), RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        AuthorLabel(if (current.actType == "correction") AuthorKind.CORRECTION else AuthorKind.HUMAN_CREATOR, current.creatorName, onMaya = true)
                        VerificationText(if (current.actType == "broadcast") QelvoraCopy.text("identityVerificationActNote") else QelvoraCopy.text("identityVerificationActCorrection"), "caption", "on-maya")
                        VerificationText(text, if (current.actType == "correction") "voice-md" else "voice-lg", "on-maya")
                        SignedMarker(current.creatorName, onMaya = true, onClick = retry)
                    }
                }
            } else Notice(title = if (current.status == APIPublicSignatureStatus.WITHDRAWN) QelvoraCopy.text("identityVerificationWithdrawnContentTitle") else if (current.contentAvailable) QelvoraCopy.text("identityVerificationMetadataTitle") else QelvoraCopy.text("identityVerificationPrivateTitle"), children = if (current.status == APIPublicSignatureStatus.WITHDRAWN) QelvoraCopy.text("identityVerificationWithdrawnContent") else if (current.contentAvailable) QelvoraCopy.text("identityVerificationMetadataNotice") else QelvoraCopy.text("identityVerificationPrivateNotice"))
            Column(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("line"), RoundedCornerShape(12.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                VerificationRow(QelvoraCopy.text("identityVerificationAuthor"), current.creatorName)
                VerificationRow(QelvoraCopy.text("identityVerificationAct"), verificationAct(current.actType))
                publicVerificationVersion(current)?.let { VerificationRow(QelvoraCopy.text("identityVerificationContentVersion"), it) }
                VerificationRow(QelvoraCopy.text("identityVerificationWrittenBy"), if (current.actType == "approved_draft") QelvoraCopy.text("identityVerificationApprovedAuthor") else if (text != null) current.creatorName else QelvoraCopy.text("identityVerificationAuthorizedOnly"))
                VerificationRow(QelvoraCopy.text("identityVerificationSigned"), runCatching { DateTimeFormatter.ofPattern("MMM d, uuuu, HH:mm 'UTC'", Locale.ENGLISH).withZone(ZoneOffset.UTC).format(Instant.parse(current.verifiedAt)) }.getOrDefault(current.verifiedAt))
                VerificationRow(QelvoraCopy.text("identityVerificationStatus"), verificationStatus(current.status))
                VerificationRow(QelvoraCopy.text("identityVerificationSharedBy"), QelvoraCopy.text("identityVerificationNotDisclosed"))
            }
            VerificationText(QelvoraCopy.text("identityVerificationHash", mapOf("hash" to current.contentHash)), "data-sm")
            VerificationText(QelvoraCopy.text("identityVerificationPublicNotice"), "caption", "ink-muted")
        } else Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            Notice(title = if (loading) QelvoraCopy.text("identityVerificationCheckingTitle") else if (missing) QelvoraCopy.text("identityVerificationSignedUnavailableTitle") else QelvoraCopy.text("identityVerificationUnavailableTitle"), children = if (loading) QelvoraCopy.text("identityVerificationLoading") else failure ?: QelvoraCopy.text("identityVerificationUnconfigured"))
        }
        Button(if (current != null) QelvoraCopy.text("identityVerificationRefresh") else QelvoraCopy.text("retry"), ButtonVariant.SECONDARY, block = true, disabled = loading || client == null, onClick = retry)
        Button(QelvoraCopy.text("navHome"), ButtonVariant.QUIET, block = true, onClick = onHome)
    }
}

private fun publicVerificationText(value: APIPublicSignature): String? {
    if (value.status == APIPublicSignatureStatus.WITHDRAWN || !value.contentAvailable || value.actType !in listOf("reply", "approved_draft", "broadcast", "correction")) return null
    val command = value.content as? JsonObject ?: return null
    if ((command["actType"] as? JsonPrimitive)?.takeIf { it.isString }?.content != value.actType) return null
    val content = command["content"] as? JsonObject ?: return null
    return (content["text"] as? JsonPrimitive)?.takeIf { it.isString }?.content
}

private fun publicVerificationVersion(value: APIPublicSignature): String? {
    if (value.status == APIPublicSignatureStatus.WITHDRAWN || !value.contentAvailable) return null
    val command = value.content as? JsonObject ?: return null
    if ((command["actType"] as? JsonPrimitive)?.takeIf { it.isString }?.content != value.actType) return null
    val content = command["content"] as? JsonObject ?: return null
    return (content["version"] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull?.takeIf { it in 1..9_007_199_254_740_991L }?.toString()
}

@Composable
private fun VerificationText(value: String, style: String = "body", color: String = "ink", modifier: Modifier = Modifier, alignment: TextAlign = TextAlign.Start) {
    BasicText(value, modifier, style = qText(style).copy(color = qColor(color), textAlign = alignment))
}

@Composable
private fun VerificationRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        VerificationText(label, color = "ink-muted", modifier = Modifier.weight(0.4f))
        VerificationText(value, modifier = Modifier.weight(0.6f), alignment = TextAlign.End)
    }
}

private fun verificationAct(value: String) = when (value) {
    "reply" -> QelvoraCopy.text("identityVerificationActReply")
    "approved_draft" -> QelvoraCopy.text("identityVerificationActApproved")
    "broadcast" -> QelvoraCopy.text("identityVerificationActNote")
    "reaction" -> QelvoraCopy.text("identityVerificationActReaction")
    "accept" -> QelvoraCopy.text("identityVerificationActAcceptance")
    "correction" -> QelvoraCopy.text("identityVerificationActCorrection")
    else -> QelvoraCopy.text("identityVerificationActOther")
}

private fun verificationStatus(value: APIPublicSignatureStatus) = when (value) {
    APIPublicSignatureStatus.VALID -> QelvoraCopy.text("identityVerificationValid")
    APIPublicSignatureStatus.KEY_REVOKED -> QelvoraCopy.text("identityVerificationKeyRevoked")
    APIPublicSignatureStatus.CREATOR_REVOKED -> QelvoraCopy.text("identityVerificationCreatorRevoked")
    APIPublicSignatureStatus.WITHDRAWN -> QelvoraCopy.text("identityVerificationWithdrawn")
}
