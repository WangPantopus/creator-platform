package com.pantopus.qelvora.conversation

import android.net.Uri
import android.os.SystemClock
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.NativeIntroOffer
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
import kotlin.random.Random
import kotlinx.serialization.json.*
import java.util.UUID
import com.pantopus.qelvora.commerce.CommerceClient
import com.pantopus.qelvora.commerce.CommerceOverview
import com.pantopus.qelvora.commerce.CommerceFailure
import com.pantopus.qelvora.commerce.commerceMoney

object W3FanFeatures {
    /** W1 calls this on sign-out/revocation alongside credential purge. */
    suspend fun clearPrivateState(context: android.content.Context) {
        ConversationRealtime.purge()
        ConversationOfflineStorage.purge(context)
        ConversationResumeStorage(context).purge()
    }
    fun registration(baseURL: String?) = FanFeatureRegistration(matches = {
        val path = it.substringBefore('?'); path == "/you" || path.startsWith("/threads/") || (path.startsWith("/creators/") && path.endsWith("/chat"))
    }, screen = { session ->
        val parts = Uri.parse(session.destination).pathSegments
        if (baseURL == null) Notice(title = "Conversation unavailable", children = "Reconnect to open this conversation from your account.")
        else if (parts.size == 3 && parts[0] == "threads") {
            val valid = runCatching { UUID.fromString(parts[1]); UUID.fromString(parts[2]); true }.getOrDefault(false)
            if (valid) ConversationScreen(baseURL, parts[1], parts[2], session) else Notice(title = "Conversation unavailable", children = "Open this conversation from your account.")
        } else if (parts.size == 3 && parts[0] == "creators" && parts[2] == "chat") key(session.session?.accountId, session.session?.sessionId, session.destination) { FirstConversation(baseURL, parts[1], session) }
        else if (Uri.parse(session.destination).path == "/you") {
            val destination = Uri.parse(session.destination)
            val creatorId = destination.getQueryParameter("creatorId")
            val fanId = destination.getQueryParameter("fanId")
            if (ApplicationDestination.isPermitted(session.destination) && creatorId != null && fanId != null) {
                val client = remember(baseURL, session.session?.accountId) { ConversationClient(baseURL, session::currentToken, session.session?.accountId) }
                ConversationPrivacy(client, "$creatorId/$fanId", onBack = { session.open("/you") }, onData = { session.open("/support/privacy") }, onSupport = { session.open("/support") })
            } else ConversationAccount(baseURL, session)
        }
        else Notice(title = "Conversation unavailable", children = "Open this conversation from your account.")
    })
}
private data class PendingMessage(val key: String, val text: String, val sequence: Long, val destination: String, val uncertain: Boolean = false, val rejected: Boolean = false)

@Composable
private fun ConversationScreen(baseURL: String, creatorId: String, fanId: String, session: FanSession) {
    val client = remember(baseURL, session.session?.accountId) { ConversationClient(baseURL, session::currentToken, session.session?.accountId) }
    val root = "$creatorId/$fanId"
    val accountId = session.session?.accountId ?: "signed-out"
    val context = LocalContext.current
    val resumeStorage = remember(context) { ConversationResumeStorage(context) }
    val storageScope = "$baseURL/$root"
    var resumeActivated by remember(root, accountId) { mutableStateOf(false) }
    var page by remember(root, accountId) { mutableStateOf<ConversationPage?>(null) }
    var older by remember(root, accountId) { mutableStateOf<List<ConversationMessage>>(emptyList()) }
    var before by remember(root, accountId) { mutableStateOf<Long?>(null) }
    var gate by remember(root, accountId) { mutableStateOf<ThreadDeliveryGate?>(null) }
    var draft by remember(root, accountId) { mutableStateOf("") }
    var pending by remember(root, accountId) { mutableStateOf<PendingMessage?>(null) }
    var error by remember(root, accountId) { mutableStateOf("") }
    var offline by remember(root, accountId) { mutableStateOf(true) }
    var transportReady by remember(root, accountId) { mutableStateOf(false) }
    var busy by remember(root, accountId) { mutableStateOf(false) }
    var introOfferId by remember(root, accountId) { mutableStateOf<String?>(null) }
    var privacy by remember(root, accountId) { mutableStateOf(false) }
    var source by remember(root, accountId) { mutableStateOf<Pair<String,String>?>(null) }
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var offlineContext by remember(baseURL, root, accountId, session.session?.sessionId) { mutableStateOf<Long?>(null) }
    var renewingOffline by remember(baseURL, root, accountId) { mutableStateOf(false) }
    var offlineShowing by remember(baseURL, root, accountId) { mutableStateOf(false) }
    var viewRun by remember(baseURL, root, accountId) { mutableStateOf(0) }
    val presenceId = remember(root) { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope()
    val scroll = rememberLazyListState()
    var positionedConversation by remember(root, accountId) { mutableStateOf(false) }
    var followingReply by remember(root, accountId) { mutableStateOf(true) }
    var positioningReply by remember(root, accountId) { mutableStateOf(false) }
    // Observe completed user/accessibility scrolls, rather than treating a
    // newly enlarged reply as a request to stop following it.
    LaunchedEffect(scroll) {
        snapshotFlow { Triple(scroll.isScrollInProgress, scroll.firstVisibleItemIndex, scroll.firstVisibleItemScrollOffset) }.collect { (moving, _, _) ->
            if (!moving && positionedConversation && !positioningReply) {
                followingReply = !scroll.canScrollForward
            }
        }
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _,_ ->
            foreground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!foreground) {
                viewRun++; offlineShowing = false; transportReady = false; offline = true
                page = null; older = emptyList(); before = null; gate = null; source = null
                offlineContext?.let { ConversationOfflineStorage.purge(it) }; offlineContext = null
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer); viewRun++
            offlineContext?.let { ConversationOfflineStorage.purge(it) }; offlineContext = null
        }
    }
    LaunchedEffect(root,foreground,privacy,page?.threadId) {
        if (page != null) {
            suspend fun pulse(active: Boolean) { try { client.request("$root/presence",buildJsonObject { put("clientId",presenceId);put("active",active) }) } catch(failure:Exception) { if(failure is CancellationException) throw failure } }
            if (!foreground || privacy) pulse(false)
            else while (true) { pulse(true);delay(20000) }
        }
    }
    fun conceal() { page = null; older = emptyList(); before = null; gate = null; source = null }
    suspend fun showOffline() {
        val run = viewRun
        val lease = offlineContext
        offlineShowing = true
        val snapshot = withContext(Dispatchers.IO) { lease?.let { ConversationOfflineStorage.read(it) } }
        if (run != viewRun || !foreground || privacy || !offlineShowing) return
        val current = page
        if (snapshot == null || (current != null && (snapshot.page.cursor < current.cursor || snapshot.page.epoch < current.epoch || snapshot.page.revision < current.revision))) { conceal(); return }
        page = snapshot.page; older = emptyList(); before = null; gate = null; source = null
    }
    suspend fun renewOffline() {
        val current = page ?: return
        val lease = offlineContext ?: return
        val run = viewRun
        if (!foreground || privacy || !transportReady || current.offTheRecord || !current.consentCurrent) return
        val started = SystemClock.elapsedRealtime()
        try {
            val value = client.request("$root/offline")
            val snapshot = client.json.decodeFromJsonElement<ConversationOfflineSnapshot>(value)
            if (run != viewRun || !foreground || privacy || !transportReady || page?.cursor != snapshot.page.cursor || page?.epoch != snapshot.page.epoch || page?.revision != snapshot.page.revision) return
            val saved = withContext(Dispatchers.IO) { ConversationOfflineStorage.save(value.toString().toByteArray(Charsets.UTF_8), lease, started) }
            if (!saved && offlineContext == lease) offlineContext = null
        } catch (failure: Exception) {
            if (failure is CancellationException) throw failure
            ConversationOfflineStorage.purge(lease); if (offlineContext == lease) offlineContext = null
        }
    }
    val fail: (Throwable) -> Unit = { failure ->
        if (failure is CancellationException) throw failure
        error = failure.message ?: "Reconnect to refresh. Your input is kept."
        offline = true; transportReady = false
        if (failure is ConversationFailure && failure.status in listOf(401,403,404)) { offlineShowing = false; offlineContext?.let { ConversationOfflineStorage.purge(it) }; offlineContext = null; page = null; older = emptyList(); before = null; draft = ""; pending = null; gate = null; source = null; privacy = false; transportReady = false; scope.launch { runCatching { resumeStorage.remove(accountId, storageScope) } } }
        else scope.launch { showOffline() }
    }
    suspend fun refresh() {
        val run = viewRun
        if (!foreground || privacy) return
        try {
            if (!resumeActivated) {
                try { resumeStorage.activate(accountId) } catch (failure: Exception) { if (failure is CancellationException) throw failure }
                resumeActivated = true
            }
            val fresh = client.page(root)
            if (run != viewRun || !foreground || privacy) return
            if (fresh.cursor >= (page?.cursor ?: 0) && fresh.epoch >= (page?.epoch ?: 0) && fresh.revision >= (page?.revision ?: 0)) {
                offlineShowing = false; page = fresh; if (before == null && older.isEmpty()) before = fresh.before
                gate = ThreadDeliveryGate(fresh.threadId, fresh.cursor, fresh.epoch, fresh.generationSequences)
                try { resumeStorage.save(accountId, storageScope, fresh.cursor, fresh.epoch) } catch (failure: Exception) { if (failure is CancellationException) throw failure }
                offline = !transportReady; error = ""
                pending?.let { item -> if (client.request("$root/messages/status", buildJsonObject { put("idempotencyKey", item.key) }).jsonObject["accepted"]?.jsonPrimitive?.boolean == true && pending?.key == item.key) { pending = null; if (draft.trim() == item.text) draft = "" } }
            }
        } catch (failure: Throwable) { if (run == viewRun) fail(failure) }
    }
    LaunchedEffect(baseURL, root, accountId, foreground, privacy) {
        if (!foreground || privacy) {
            viewRun++; offlineContext?.let { ConversationOfflineStorage.purge(it) }; offlineContext = null
            offlineShowing = false; conceal(); return@LaunchedEffect
        }
        var nextRenew = 0L
        renewingOffline = false
        while (isActive) {
            if (offlineShowing && offlineContext?.let { ConversationOfflineStorage.current(it) } != true) {
                offlineContext?.let { ConversationOfflineStorage.purge(it) }; offlineContext = null; offlineShowing = false; conceal()
            }
            if (SystemClock.elapsedRealtime() >= nextRenew) {
                nextRenew = SystemClock.elapsedRealtime() + 2000
                if (offlineContext == null) offlineContext = ConversationOfflineStorage.activate(context,baseURL,accountId,session.session?.sessionId.orEmpty(),root)
                if (!renewingOffline) {
                    renewingOffline = true; val run = viewRun
                    launch { try { renewOffline() } finally { if (run == viewRun) renewingOffline = false } }
                }
            }
            delay(100)
        }
    }
    suspend fun send(retry: Boolean = false) {
        val current = page ?: return
        if (busy || offline || !foreground || privacy || !current.canSend || (!retry && draft.isBlank())) return
        val item = if (retry) pending ?: return else PendingMessage(UUID.randomUUID().toString(), draft.trim(), (current.messages.lastOrNull()?.sequence ?: 0) + 1, if(current.control == APIThreadControl.HUMAN_ACTIVE) "fan-replies" else "messages")
        followingReply = true
        pending = item; busy = true
        try {
            val path = item.destination
            val result = client.request("$root/$path", buildJsonObject { put("text", item.text); put("idempotencyKey", item.key); put("clientSequence", item.sequence) })
            if (path == "messages") client.json.decodeFromJsonElement<APIAcceptedMessage>(result) else client.json.decodeFromJsonElement<APIMessage>(result)
            pending = null; if (!retry) draft = ""; refresh()
        } catch (failure: Throwable) { val uncertain = failure !is ConversationFailure || failure.status >= 500 || failure.status == 409; pending = item.copy(uncertain = uncertain, rejected = !uncertain); fail(failure) }
        finally { busy = false }
    }
    LaunchedEffect(baseURL, root, accountId, foreground, privacy) {
        transportReady = false; offline = true
        if (!foreground || privacy) return@LaunchedEffect
        var backoff = 1000L
        while (isActive) {
            try {
                refresh()
                val current = page
                val currentGate = gate
                if (current != null && currentGate != null && error.isEmpty()) coroutineScope {
                    val metadata = launch { while (isActive) { delay(15000); refresh() } }
                    try {
                        // A cursor without cached content is not a checkpoint.
                        // The freshly authorized atomic page is the resume base.
                        client.frames(current, current.cursor).collect { event ->
                            when (event) {
                                ConversationRealtimeEvent.Connected -> {
                                    transportReady = true; backoff = 1000L
                                    refresh()
                                }
                                is ConversationRealtimeEvent.Frame -> {
                                    val delivery = gate ?: throw ConversationFailure(503, "Reconnect to refresh this conversation.")
                                    if (delivery.receive(event.value).isNotEmpty()) refresh()
                                }
                            }
                        }
                    } finally { metadata.cancel() }
                }
            } catch (failure: Throwable) {
                fail(failure)
                if (failure is ConversationFailure && failure.status in listOf(401,403,404)) return@LaunchedEffect
            } finally { transportReady = false; offline = true }
            showOffline()
            delay(backoff + Random.nextLong(0, backoff / 4 + 1))
            backoff = minOf(15000L, backoff * 2)
        }
    }
    if (privacy) {
        ConversationPrivacy(client, root, onBack = { privacy = false }, onData = { session.open("/support/privacy") }, onSupport = { session.open("/support") })
        return
    }
    source?.let { passage -> Dialog(onDismissRequest = { source = null }) {
        Column(Modifier.background(qColor("ground")).padding(16.dp)) {
            BasicText("Original source", style = qText("data-sm").copy(color = qColor("ink")))
            LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(16.dp)) { item { BasicText(passage.first, style = qText("display-md").copy(color = qColor("ink"))); SelectionContainer { BasicText(passage.second, style = qText("body").copy(color = qColor("ink"))) } } }
            Button("Close", variant = ButtonVariant.QUIET) { source = null }
        }
    } }
    val current = page
    BoxWithConstraints(Modifier.fillMaxSize().widthIn(max = 390.dp)) {
    // Keep the actual conversation and its privacy notice reachable when
    // enlarged text or the keyboard leaves too little room for fixed controls.
    val scrollControls = LocalDensity.current.fontScale >= 1.5f || maxHeight < 480.dp
    LaunchedEffect(current?.threadId, current?.messages?.lastOrNull(), pending?.key, scrollControls, maxHeight) {
        if (current != null && followingReply && !scroll.isScrollInProgress) {
            positioningReply = true
            try {
                snapshotFlow { scroll.layoutInfo.totalItemsCount }.first { it > 0 }
                withFrameNanos { }
                scroll.scrollToItem((scroll.layoutInfo.totalItemsCount - 1).coerceAtLeast(0))
                positionedConversation = true
            } finally { positioningReply = false }
        }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground"))) {
        if (current == null) {
            Notice(title = "Conversation unavailable", children = if (error.isEmpty()) "Loading your messages…" else error)
            Button("Refresh", variant = ButtonVariant.SECONDARY) { scope.launch { refresh() } }
            Button("Help and safety", variant = ButtonVariant.QUIET) { session.open("/support") }
        } else {
            val header: @Composable () -> Unit = {
                ThreadHeader(name = current.creatorName, subtitle = "Official AI", live = !offline && current.control == APIThreadControl.HUMAN_ACTIVE, onBack = { session.open("/you") }, onAbout = { privacy = true })
                IdentityStrip(state = if (current.control == APIThreadControl.HUMAN_ACTIVE) IdentityState.HUMAN else if (current.control == APIThreadControl.AI_ACTIVE) IdentityState.AI else IdentityState.PAUSED, name = current.creatorName)
            }
            val messageLabel = if (current.control == APIThreadControl.HUMAN_ACTIVE) "Message ${current.creatorName}" else "Message ${current.creatorName}'s AI"
            val input: @Composable (Modifier) -> Unit = { modifier ->
                BasicTextField(value = draft, onValueChange = { draft = it.take(2000) },
                    modifier = modifier.heightIn(min = 48.dp, max = 160.dp)
                        .semantics { contentDescription = messageLabel }
                        .background(qColor("surface"), RoundedCornerShape(QelvoraTokens.radiusLg))
                        .border(QelvoraTokens.hairline, qColor(if (current.control == APIThreadControl.HUMAN_ACTIVE) "maya-line" else "control-line"), RoundedCornerShape(QelvoraTokens.radiusLg))
                        .padding(QelvoraTokens.space3),
                    textStyle = qText("body").copy(color = qColor("ink")), cursorBrush = SolidColor(qColor("ink")), maxLines = 5,
                    decorationBox = { field -> Box {
                        if (draft.isEmpty()) BasicText(messageLabel, modifier = Modifier.clearAndSetSemantics { }, style = qText("body").copy(color = qColor("ink-muted")))
                        field()
                    } })
            }
            val sendButton: @Composable () -> Unit = {
                Button("Send", variant = if (current.control == APIThreadControl.HUMAN_ACTIVE) ButtonVariant.MAYA else ButtonVariant.AI, block = scrollControls, disabled = !current.canSend || offline || !foreground || busy || pending != null || current.generationSequences.isNotEmpty() || draft.isBlank()) { scope.launch { send() } }
            }
            val privacyControls: @Composable () -> Unit = {
                Button("Me and privacy", variant = ButtonVariant.QUIET) { privacy = true }
                Button("Get support", variant = ButtonVariant.QUIET) { session.open("/support") }
            }
            val composer: @Composable () -> Unit = {
                Column(Modifier.imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (!current.canSend) Notice(title = "AI unavailable", children = current.unavailableReason ?: "Messaging is unavailable.")
                    if (scrollControls) {
                        BasicText(messageLabel, style = qText("label").copy(color = qColor("ink")))
                        input(Modifier.fillMaxWidth())
                        sendButton()
                    } else Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { input(Modifier.weight(1f)); sendButton() }
                    Button("Ask ${current.creatorName} to step in", variant = ButtonVariant.MAYA, block = true) { session.open("/commerce/packet?creatorId=$creatorId") }
                    if (scrollControls) Column { privacyControls() } else Row { privacyControls() }
                }
            }
            if (!scrollControls) header()
            LazyColumn(state = scroll, modifier = Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (scrollControls) item { Column { header() } }
                item(key = "intro-offer") {
                    NativeIntroOffer(client, root, session, introOfferId, current.feedbackPolicy != null,
                        enabled = !busy && !offline && foreground && !privacy && source == null)
                }
                item { BasicText("Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.", style = qText("caption").copy(color = qColor("ink"))) }
                if (offline) item { Notice(title = "You're offline", children = "Saved conversation is available briefly while its reading permission is current. Reconnect to send.") }
                if (current.offTheRecord) item { SystemLine(text = "Off the record · the AI keeps no memory from this conversation.") }
                if (before != null) item { Button("Earlier messages", variant = ButtonVariant.QUIET, disabled = busy || offline || !foreground) { scope.launch {
                    busy = true
                    try { val previous = client.page("$root?before=$before"); older = (previous.messages + older).distinctBy { it.id }.take(250); before = previous.before }
                    catch (failure: Throwable) { fail(failure) } finally { busy = false }
                } } }
                items(older.filter { old -> current.messages.none { it.id == old.id } } + current.messages, key = { it.id }) { message ->
                    if (message.recording == null) ConversationMessageRow(message, current.creatorName, current.control, creatorId = current.creatorId, onLink = { session.open(it) }, connected = !offline && foreground, original = (older + current.messages).firstOrNull { it.id == message.correction?.originalMessageId && it.version == message.correction.originalVersion && it.authorKind == APIMessageAuthorKind.AI }, onOriginal = { message.correction?.let { correction -> scope.launch { try { val original = client.json.decodeFromJsonElement<ConversationMessage>(client.request("$root/messages/${correction.originalMessageId}")); if (original.id != correction.originalMessageId || original.version != correction.originalVersion || original.authorKind != APIMessageAuthorKind.AI) throw ConversationFailure(409, "The original reply changed."); source = "Original AI reply · version ${original.version}" to original.text } catch (failure: Throwable) { fail(failure) } } } }, onVerify = { message.signedActId?.let { session.open("/verify/$it") } }, onReport = { session.open("/support?creatorId=$creatorId" + if (message.authorKind == APIMessageAuthorKind.AI) "&messageId=${message.id}" else "") }, onForget = if (busy || offline) null else { { scope.launch { busy=true;try { client.request("$root/messages/${message.id}/dont-remember",buildJsonObject { put("expectedRevision",current.revision) });refresh() } catch(failure:Throwable) { fail(failure) } finally {busy=false} } } }, onCitation = { id -> scope.launch { try { val passage = client.request("$root/citations/$id").jsonObject; source = passage["title"]?.jsonPrimitive?.content.orEmpty() to passage["text"]?.jsonPrimitive?.content.orEmpty() } catch (failure: Throwable) { fail(failure) } } })
                    message.recording?.let { recording ->
                        val asset = recording.asset
                        if (recording.state == "available" && asset != null &&
                            message.threadId == current.threadId && asset.threadId == current.threadId &&
                            asset.state == APIMediaMediaAssetState.READY && asset.mimeType == "audio/mp4" &&
                            asset.purpose == APIMediaMediaAssetPurpose.HUMAN_REPLY &&
                            message.authorKind == APIMessageAuthorKind.HUMAN_CREATOR && message.signedActId != null &&
                            asset.signedActId == message.signedActId) {
                            ConversationRecordingPlayer(baseURL, session, session.destination, accountId, creatorId, fanId, asset, current.creatorName, message.createdAt,
                                active = foreground && !privacy && source == null,
                                onVerify = { session.open("/verify/${message.signedActId}") })
                        } else {
                            BasicText(message.authorLabel(current.creatorName), style = qText("label").copy(color = qColor("ink")))
                            BasicText("This recording is unavailable for this conversation.", style = qText("caption").copy(color = qColor("ink")))
                            if (message.signedActId != null) SignedMarker(current.creatorName) { session.open("/verify/${message.signedActId}") }
                        }
                        Button("Report", variant = ButtonVariant.QUIET) { session.open("/support?creatorId=$creatorId") }
                    }
                    val version = message.agentVersion
                    val policy = current.feedbackPolicy
                    if (message.feedback != null && policy == null && version != null) {
                        Button("Remove my response", variant = ButtonVariant.QUIET, disabled = busy || offline || !foreground) { scope.launch {
                            busy = true
                            try {
                                client.request("$root/messages/${message.id}/feedback", buildJsonObject {
                                    put("messageVersion", message.version); put("agentVersion", buildJsonObject { put("id", version.id); put("hash", version.hash) }); put("rating", JsonNull)
                                }); older = older.map { if (it.id == message.id) it.copy(feedback = null) else it }; refresh()
                            } catch (failure: Throwable) { fail(failure) } finally { busy = false }
                        } }
                    }
                    if (message.authorKind == APIMessageAuthorKind.AI && version != null && policy != null && message.deliveryState in listOf(APIMessageDeliveryState.DELIVERED, APIMessageDeliveryState.INTERRUPTED)) {
                        var expanded by remember(message.id) { mutableStateOf(false) }
                        Button(QelvoraCopy.text("thisHelped"), variant = ButtonVariant.QUIET) { expanded = !expanded }
                        if (expanded) {
                            BasicText(policy.notice, style = qText("caption").copy(color = qColor("ink")))
                            val respond: (String?) -> Unit = { rating -> scope.launch {
                                if (!busy && !offline && foreground) {
                                    busy = true
                                    try {
                                        val response = client.request("$root/messages/${message.id}/feedback", buildJsonObject {
                                            put("messageVersion", message.version)
                                            put("agentVersion", buildJsonObject { put("id", version.id); put("hash", version.hash) })
                                            put("rating", rating?.let { JsonPrimitive(it) } ?: JsonNull)
                                            if (rating != null) { put("consent", true); put("policyVersion", policy.version) }
                                        })
                                        introOfferId = response.jsonObject["introOffer"]?.takeUnless { it is JsonNull }?.jsonObject?.get("offerId")?.jsonPrimitive?.contentOrNull
                                        older = older.map { if (it.id == message.id) it.copy(feedback = rating) else it }; refresh()
                                    } catch (failure: Throwable) { fail(failure) } finally { busy = false }
                                }
                            } }
                            Button(QelvoraCopy.text("thisHelped"), variant = ButtonVariant.QUIET, disabled = busy || offline || !foreground, modifier = Modifier.semantics { stateDescription = if (message.feedback == "helpful") "Selected" else "Not selected" }) { respond("helpful") }
                            Button("Not helpful", variant = ButtonVariant.QUIET, disabled = busy || offline || !foreground, modifier = Modifier.semantics { stateDescription = if (message.feedback == "not_helpful") "Selected" else "Not selected" }) { respond("not_helpful") }
                            if (message.feedback != null) {
                                BasicText("Your response is saved.", style = qText("caption").copy(color = qColor("ink")))
                                Button("Remove my response", variant = ButtonVariant.QUIET, disabled = busy || offline || !foreground) { respond(null) }
                            }
                        }
                    }
                }
                pending?.let { pendingItem -> item { Message(kind = MessageKind.FAN, children = pendingItem.text, name = current.creatorName, delivery = if (pendingItem.rejected) Delivery.FAILED else if (pendingItem.uncertain) null else Delivery.PENDING); if (pendingItem.uncertain) { BasicText("Acceptance hasn't been confirmed. Retry checks the same message without a duplicate.", style = qText("caption").copy(color = qColor("ink"))); Button("Retry", variant = ButtonVariant.QUIET, disabled = busy || offline) { scope.launch { send(true) } } } else if (pendingItem.rejected) { BasicText("Not sent", style = qText("caption").copy(color = qColor("ink"))); Button("Keep editing", variant = ButtonVariant.QUIET) { draft = pendingItem.text; pending = null } } } }
                if (error.isNotEmpty()) item { Notice(title = "Conversation status", children = error) }
                if (scrollControls) item { composer() }
                item(key = "conversation-end") { Spacer(Modifier.height(1.dp)) }
            }
            if (!scrollControls) composer()
        }
    }
    }
}

@Composable private fun ConversationMessageRow(message: ConversationMessage, name: String, control: APIThreadControl, creatorId: String, onLink: (String) -> Unit, connected: Boolean, original: ConversationMessage?, onOriginal: () -> Unit, onVerify: () -> Unit, onReport: () -> Unit, onForget: (() -> Unit)?, onCitation: (String) -> Unit) {
    val kind = when (message.authorKind) { APIMessageAuthorKind.FAN -> MessageKind.FAN; APIMessageAuthorKind.AI -> MessageKind.AI; APIMessageAuthorKind.TEAM -> MessageKind.TEAM; APIMessageAuthorKind.HUMAN_CREATOR -> MessageKind.HUMAN_CREATOR; APIMessageAuthorKind.APPROVED_DRAFT -> MessageKind.APPROVED_DRAFT; else -> null }
    SelectionContainer {
        Column(Modifier.semantics { contentDescription = message.authorLabel(name) }) {
            if (message.authorKind == APIMessageAuthorKind.SYSTEM) {
                val destination = message.publicAnswerDestination(creatorId)
                if (destination != null) Box(Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .clickable(enabled = connected, role = Role.Button) { onLink(destination) }
                    .semantics(mergeDescendants = true) { contentDescription = "System update: Answered publicly. Open answer" },
                    contentAlignment = Alignment.Center) { SystemLine(text = message.text) }
                else SystemLine(text = message.text)
            }
            else if (message.correction != null && original != null) {
                Correction(text = message.text, name = name, aiText = original.text, onVerify = onVerify)
                Button("Report", variant = ButtonVariant.QUIET, onClick = onReport)
            }
            else if (kind != null) {
                Message(kind = kind, children = message.text, name = name, member = message.member ?: "Authorized team member", delivery = if (message.deliveryState == APIMessageDeliveryState.GENERATING) if (message.text.isEmpty()) Delivery.ACCEPTED else Delivery.STREAMING else if (message.deliveryState == APIMessageDeliveryState.INTERRUPTED) Delivery.INTERRUPTED else null, live = connected && message.correction == null && message.authorKind == APIMessageAuthorKind.HUMAN_CREATOR && control == APIThreadControl.HUMAN_ACTIVE, actions = false, onVerify = onVerify, citation = if (message.citations.isEmpty()) null else { { message.citations.forEach { id -> CitationChip(title = "Source", meta = "Read the original passage", onOpen = { onCitation(id) }) } } })
                if (message.correction != null) { BasicText(QelvoraCopy.text("correctionAuthor", mapOf("name" to name)), style = qText("label").copy(color = qColor("ink"))); Button("Original AI reply · version ${message.correction.originalVersion}", variant = ButtonVariant.QUIET, onClick = onOriginal) }
                if (message.deliveryState == APIMessageDeliveryState.FAILED) BasicText(QelvoraCopy.text("conversationReplyUnavailable"), style = qText("caption").copy(color = qColor("ink")))
                if (message.authorKind != APIMessageAuthorKind.FAN) Button("Report", variant = ButtonVariant.QUIET, onClick = onReport)
                if (message.authorKind == APIMessageAuthorKind.FAN) { if(message.offTheRecord) BasicText("Not used for memory",style=qText("caption").copy(color = qColor("ink"))) else Button("Don't remember this",variant=ButtonVariant.QUIET,disabled=onForget==null) { onForget?.invoke() } }
            } else {
                BasicText(if (message.authorKind == APIMessageAuthorKind.HUMAN_BROADCAST) "Note from $name · audience details unavailable" else if (message.authorKind == APIMessageAuthorKind.HUMAN_REACTION) "$name reacted" else "Call with $name", style = qText("label").copy(color = qColor("ink")))
                BasicText(message.text, style = qText("body").copy(color = qColor("ink")))
                if (message.signedActId != null) SignedMarker(name = name, onClick = onVerify)
            }
        }
    }
}

@Composable private fun ConversationPrivacy(client: ConversationClient, root: String, onBack: () -> Unit, onData: () -> Unit, onSupport: () -> Unit) {
    var memory by remember(client, root) { mutableStateOf<ConversationMemories?>(null) }
    var audit by remember(client, root) { mutableStateOf<List<ConversationAudit>?>(null) }
    var usage by remember(client, root) { mutableStateOf<ConversationUsage?>(null) }
    var policy by remember(client, root) { mutableStateOf<ConversationCapabilities?>(null) }; var page by remember(client, root) { mutableStateOf<ConversationPage?>(null) }
    val name = page?.creatorName ?: "this creator"
    val uriHandler = LocalUriHandler.current
    var error by remember(client, root) { mutableStateOf("") }; var busy by remember(client, root) { mutableStateOf(false) }
    var provenance by remember(client, root) { mutableStateOf<ConversationMessage?>(null) }
    var editing by remember(client, root) { mutableStateOf<String?>(null) }; var text by remember(client, root) { mutableStateOf("") }
    var revision by remember(client, root) { mutableStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    val scope = rememberCoroutineScope()
    fun conceal() { revision += 1; memory = null; audit = null; policy = null; page = null; usage = null; provenance = null; busy = false }
    fun current(ticket: Int) = revision == ticket && foreground
    fun failed(failure: Throwable, fallback: String) {
        if (failure is CancellationException) throw failure
        if (failure is ConversationFailure && failure.status in listOf(401,403,404)) { conceal(); editing = null; text = "" }
        error = failure.message ?: fallback
    }
    DisposableEffect(lifecycleOwner, client, root) {
        val observer = LifecycleEventObserver { _, _ ->
            val active = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!active) conceal()
            foreground = active
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); conceal() }
    }
    suspend fun refresh() {
        conceal()
        if (!foreground) return
        val ticket = revision; error = ""
        try {
            val freshMemory: ConversationMemories = client.json.decodeFromJsonElement(client.request("$root/memory"))
            val freshAudit: List<ConversationAudit> = client.json.decodeFromJsonElement(client.request("$root/audit"))
            val freshPolicy: ConversationCapabilities = client.json.decodeFromJsonElement(client.request("capabilities", publicRead = true))
            val freshPage = client.page(root)
            val freshUsage: ConversationUsage = client.json.decodeFromJsonElement(client.request("$root/usage"))
            if (current(ticket)) { memory = freshMemory; audit = freshAudit; policy = freshPolicy; page = freshPage; usage = freshUsage }
        } catch (failure: Throwable) { if (failure is CancellationException) throw failure; if (current(ticket)) failed(failure, "Reconnect to refresh your privacy settings.") }
    }
    suspend fun change(fallback: String, run: suspend () -> Unit) {
        if (busy || !foreground || page == null || memory == null) return
        val ticket = revision; busy = true
        try { run(); if (current(ticket)) { editing = null; refresh() } }
        catch (failure: Throwable) { if (failure is CancellationException) throw failure; if (current(ticket)) failed(failure, fallback) }
        finally { if (revision == ticket) busy = false }
    }
    suspend fun source(item: ConversationMemory) {
        val ticket = revision
        try {
            val message: ConversationMessage = client.json.decodeFromJsonElement(client.request("$root/messages/${item.provenanceMessageId}"))
            if (current(ticket) && memory?.items?.any { it.id == item.id } == true) provenance = message
        } catch (failure: Throwable) { if (failure is CancellationException) throw failure; if (current(ticket)) failed(failure, "This source message is unavailable.") }
    }
    suspend fun decide(item: ConversationMemory, action: String) {
        val snapshot = memory ?: return
        change("This change could not be saved.") { client.request("$root/memory/${item.id}", buildJsonObject { put("action", action); put("expectedRevision", snapshot.revision); if (action == "edit") put("text", text) }) }
    }
    suspend fun preferences(offTheRecord: Boolean, introShared: Boolean) {
        val snapshot = memory ?: return
        change("This setting could not be saved.") { client.request("$root/preferences", buildJsonObject { put("offTheRecord",offTheRecord); put("introShared",introShared); put("expectedRevision",snapshot.revision) }) }
    }
    suspend fun consent() {
        val currentPolicy = policy?.providers ?: return
        val accepted = page?.consentCurrent != true
        change("Consent could not be saved.") { client.request("$root/consent", buildJsonObject { put("version",currentPolicy.version); put("accepted",accepted) }) }
    }
    provenance?.let { message -> Dialog(onDismissRequest={provenance=null}) { Column(Modifier.background(qColor("ground")).padding(16.dp)) {
        BasicText("Where this came from",style=qText("title").copy(color = qColor("ink")));BasicText(message.authorLabel(name),style=qText("label").copy(color = qColor("ink")))
        LazyColumn(Modifier.weight(1f,fill=false)) { item { SelectionContainer { BasicText(message.text,style=qText("body").copy(color = qColor("ink"))) } } }
        BasicText(message.createdAt,style=qText("data-sm").copy(color = qColor("ink")));Button("Close",variant=ButtonVariant.QUIET) {provenance=null}
    } } }
    LaunchedEffect(client, root, foreground) { if (foreground) refresh() else conceal() }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxSize().background(qColor("ground"))) {
        item { Button("Back", variant = ButtonVariant.QUIET, onClick = onBack); BasicText("Me and privacy", style = qText("title").copy(color = qColor("ink"))); if (error.isNotEmpty()) { Notice(title = "Privacy status", children = error); Button("Try again", variant = ButtonVariant.SECONDARY, disabled = busy) { scope.launch { refresh() } } } }
        item { BasicText("What $name's AI remembers", style = qText("display-md").copy(color = qColor("ink"))); if (memory == null) BasicText(if (error.isEmpty()) "Loading your memories…" else "Memories unavailable.", style = qText("body").copy(color = qColor("ink"))); if (memory?.items?.isEmpty() == true) BasicText("No memories. The AI asks before remembering.", style = qText("body").copy(color = qColor("ink"))) }
        items(memory?.items.orEmpty(), key = { it.id }) { item -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(if (item.state == "proposed") "Want me to remember this? Only if you say yes." else "Remembered · ${item.kind}", style = qText("data-sm").copy(color = qColor("ink")))
            if (editing == item.id) { BasicTextField(text, { text = it.take(2000) }, textStyle = qText("body").copy(color = qColor("ink")), cursorBrush = SolidColor(qColor("ink"))); Button("Save proposal", variant = ButtonVariant.SECONDARY, disabled = busy || text.isBlank()) { scope.launch { decide(item, "edit") } } } else BasicText(item.text, style = qText("body").copy(color = qColor("ink")))
            if (item.sensitiveCategory != null) BasicText("Sensitive item · agreeing applies only to this exact memory.", style = qText("caption").copy(color = qColor("ink")))
            Button("View where this came from",variant=ButtonVariant.QUIET) { scope.launch { source(item) } }
            Row { if (item.state == "proposed") Button("Remember", variant = ButtonVariant.SECONDARY, disabled = busy || memory?.offTheRecord == true) { scope.launch { decide(item, "accept") } }; Button("Edit", variant = ButtonVariant.QUIET, disabled = busy) { editing = item.id; text = item.text }; Button(if (item.state == "proposed") "Don't remember" else "Delete", variant = ButtonVariant.QUIET, disabled = busy) { scope.launch { decide(item, "delete") } } }
            if (item.kind == "open_loop" && item.state == "remembered") Button("Resolved", variant = ButtonVariant.QUIET, disabled = busy) { scope.launch { decide(item, "resolve") } }
        } }
        item {
            BasicText("Off the record", style = qText("display-md").copy(color = qColor("ink")))
            BasicText("The AI keeps no memory from it. It remains visible to the creator and their team, and you can delete it.", style = qText("body").copy(color = qColor("ink")))
            Button(if (memory?.offTheRecord == true) "Turn off off-the-record" else "Turn on off-the-record", variant = ButtonVariant.SECONDARY, disabled = busy || memory == null) { scope.launch { preferences(memory?.offTheRecord != true, memory?.introShared == true) } }
            Button(if (memory?.introShared == true) "Stop sharing my intro" else "Share my intro with this creator's AI", variant = ButtonVariant.QUIET, disabled = busy || memory == null) { scope.launch { preferences(memory?.offTheRecord == true,memory?.introShared != true) } }
            BasicText("AI providers", style = qText("display-md").copy(color = qColor("ink")))
            if (policy?.providers?.verified == false) Notice(title=QelvoraCopy.text("conversationDevelopmentPolicyTitle"),children=QelvoraCopy.text("conversationDevelopmentPolicyNotice"))
            policy?.providers?.providers?.forEach { provider ->
                Button(provider.name + " processing terms", variant = ButtonVariant.QUIET) { uriHandler.openUri(provider.termsUrl) }
                BasicText((if(provider.noTraining) "Doesn't train on your messages." else "Review message use in these terms.") + " " + (if(provider.noRetention) "Doesn't keep your messages." else "Review message retention in these terms."), style = qText("caption").copy(color = qColor("ink")))
            }
            if (policy?.providers == null) BasicText("AI provider consent is unavailable or has been withdrawn.", style = qText("body").copy(color = qColor("ink")))
            Button(if(page?.consentCurrent == true) "Withdraw AI provider consent" else "Agree to these AI providers", variant = ButtonVariant.SECONDARY, disabled = busy || (page?.consentCurrent != true && policy?.consentAvailable != true)) { scope.launch { consent() } }
        }
        item { BasicText("Time with this creator's AI",style=qText("display-md").copy(color = qColor("ink"))); if (usage == null) BasicText(if (error.isEmpty()) "Loading time history…" else "Time history unavailable.", style = qText("body").copy(color = qColor("ink"))); usage?.let { time -> BasicText(time.measurement + " Days are shown in UTC.",style=qText("caption").copy(color = qColor("ink")));BasicText("This week · ${time.days.sumOf { it.seconds }.toInt()/60} minutes",style=qText("body").copy(color = qColor("ink")));time.days.forEach { day -> BasicText("${day.day} · ${day.seconds.toInt()/60} minutes",style=qText("body").copy(color = qColor("ink"))) };if(!time.modeAvailable) BasicText("Companion mode time signals await the verified AI mode configuration.",style=qText("caption").copy(color = qColor("ink"))) } }
        item { BasicText("Who opened your conversations", style = qText("display-md").copy(color = qColor("ink"))); if (audit == null) BasicText(if (error.isEmpty()) "Loading opening history…" else "Opening history unavailable.", style = qText("body").copy(color = qColor("ink"))) else if (audit?.isEmpty() == true) BasicText("No logged openings.", style = qText("body").copy(color = qColor("ink"))) }
        items(audit.orEmpty(), key = { it.id }) { entry -> BasicText((if (entry.role == "creator") "$name's account" else if (entry.role == "ops") "Authorized safety account" else "Authorized team · ${entry.role}") + "\nAccount " + entry.readerAccountId + "\n" + entry.readAt, style = qText("body").copy(color = qColor("ink"))) }
        item { BasicText("This shows when an authorized account opened a conversation, not that a person read every message.", style = qText("caption").copy(color = qColor("ink"))); Button("Export or delete my data", variant = ButtonVariant.SECONDARY, block = true, onClick = onData); Button("Help and safety", variant = ButtonVariant.QUIET, onClick = onSupport) }
    }
}


@Composable private fun FirstConversation(baseURL: String, handle: String, session: FanSession) {
    val client = remember(baseURL,session.session?.accountId) { ConversationClient(baseURL,session::currentToken, session.session?.accountId) }
    val growth = remember(baseURL) { GrowthClient(baseURL) }
    var creator by remember(handle) { mutableStateOf<org.json.JSONObject?>(null) }
    var capabilities by remember(handle) { mutableStateOf<ConversationCapabilities?>(null) }
    var error by remember(handle) { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    val key = remember(handle) { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope(); val uriHandler = LocalUriHandler.current
    val contextPending = Uri.parse(session.destination).getQueryParameter("context") != null
    val target = session.destination
    val accountId = session.session?.accountId
    val sessionId = session.session?.sessionId
    var postContext by remember { mutableStateOf<APIGrowthPostEntryContextResponseContext?>(null) }
    var contextSessionId by remember { mutableStateOf<String?>(null) }
    var contextDestination by remember { mutableStateOf("") }
    var contextFailure by remember { mutableStateOf("") }
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!foreground) postContext = null
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); postContext = null }
    }
    LaunchedEffect(baseURL, target, accountId, sessionId, foreground) {
        postContext = null; contextFailure = ""
        if (!foreground || !contextPending) return@LaunchedEffect
        while (isActive) {
            postContext = null; contextFailure = ""
            val values = Uri.parse(target).getQueryParameters("context")
            val id = values.singleOrNull()?.let { raw -> runCatching { UUID.fromString(raw).also { require(it.toString().equals(raw, ignoreCase = true)) } }.getOrNull() }
            val capture = if (id != null && ApplicationDestination.isPermitted(target)) session.captureRequest(target, maximumResponseBytes = 8192, timeoutMs = 5000) else null
            if (capture == null || capture.expectedAccountId != accountId) {
                contextFailure = QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain")
            } else try {
                if (!capture.isCurrent()) return@LaunchedEffect
                val page = capture.client.readPostEntryContext(handle, id.toString(), capture.expectedAccountId)
                val post = page.context
                if (!foreground || !capture.isCurrent()) return@LaunchedEffect
                require(UUID.fromString(post.creatorId).toString().equals(post.creatorId, ignoreCase = true))
                require(UUID.fromString(post.contentId) == id && post.version in 1..2147483647L && post.title.length <= 180)
                require(post.destination == "/creators/$handle/posts/$id")
                contextSessionId = capture.sessionId; contextDestination = capture.destination; postContext = post
            } catch (failure: Throwable) {
                if (failure is CancellationException) throw failure
                if (foreground && capture.isCurrent()) contextFailure = QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain")
            }
            delay(4000)
        }
    }
    LaunchedEffect(handle) {
        try {
            require(Regex("[A-Za-z0-9_-]{1,100}").matches(handle))
            creator = growth.request("public/creators/$handle").getJSONObject("creator")
        } catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = "This creator or the conversation service is unavailable." }
        try {
            capabilities = client.json.decodeFromJsonElement(client.request("capabilities", publicRead = true))
        } catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = "This creator or the conversation service is unavailable." }
    }
    val name = creator?.optString("name").orEmpty().ifBlank { "the creator" }
    LazyColumn(Modifier.fillMaxSize().widthIn(max = 390.dp).background(qColor("ground")), contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 36.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton("back", "Back", qColor("ink")) { session.open("/creators/$handle") }
                BasicText("1 OF 1", style = qText("data-sm").copy(color = qColor("ink-muted")))
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AuthorLabel(kind = AuthorKind.AI, name = name)
                BasicText("Before your first message", style = qText("display-lg").copy(color = qColor("ink")))
            }
        }
        item {
            val shape = RoundedCornerShape(QelvoraTokens.radiusLg)
            Column(Modifier.fillMaxWidth().background(qColor("surface"), shape).clip(shape).border(QelvoraTokens.hairline, qColor("line"), shape)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BasicText("WHO RUNS IT", style = qText("data-sm").copy(color = qColor("ink-muted")))
                    val policy = capabilities?.providers
                    if (policy?.verified == false) Notice(title=QelvoraCopy.text("conversationDevelopmentPolicyTitle"),children=QelvoraCopy.text("conversationDevelopmentPolicyNotice"))
                    if (policy == null) BasicText("AI providers and their verified processing terms are not configured yet.", style = qText("body").copy(color = qColor("ink")))
                    else BasicText("This AI is powered by ${policy.providers.joinToString(", ") { it.name }}.", style = qText("body").copy(color = qColor("ink")))
                    policy?.providers?.forEach { provider ->
                        Button(provider.name + " processing terms", variant = ButtonVariant.QUIET) { uriHandler.openUri(provider.termsUrl) }
                        BasicText((if (provider.noTraining) "Doesn't train on your messages." else "Review message use in these terms.") + " " + (if (provider.noRetention) "Doesn't keep your messages." else "Review message retention in these terms."), style = qText("caption").copy(color = qColor("ink")))
                    }
                }
                Hairline()
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BasicText("WHO CAN READ IT", style = qText("data-sm").copy(color = qColor("ink-muted")))
                    BasicText(capabilities?.accessDisclosure ?: "Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.", style = qText("body").copy(color = qColor("ink")))
                }
                Hairline()
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    BasicText("WHAT IT REMEMBERS", style = qText("data-sm").copy(color = qColor("ink-muted")))
                    BasicText("Only what you agree to. It asks first, and you can see and delete every memory in You.", style = qText("body").copy(color = qColor("ink")))
                }
            }
        }
        if(error.isNotEmpty()) item { Notice(title="Conversation unavailable",children=error) }
        if(contextPending) item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                postContext?.takeIf { foreground && !session.checkingSession && contextSessionId == sessionId && contextDestination == target && it.creatorId == creator?.optString("id") }?.let { post ->
                    ContextCard(QelvoraCopy.text("growthFromAPost"), post.title) { session.open("/creators/$handle/chat") }
                }
                Notice(title="Post context unavailable",children=contextFailure.ifEmpty { "This post's conversation context is not connected yet. Remove the post context to continue to the current AI provider review." })
                Button(QelvoraCopy.text("removeContext"), variant=ButtonVariant.QUIET, block=true) { session.open("/creators/$handle/chat") }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Button("Start with $name's AI",variant=ButtonVariant.AI,size="lg",block=true,disabled=busy || !foreground || session.checkingSession || creator == null || contextPending || capabilities?.generationAvailable != true || capabilities?.consentAvailable != true) { scope.launch {
                if (busy || !foreground || contextPending || session.destination != target || capabilities?.generationAvailable != true || capabilities?.consentAvailable != true) return@launch
                val policy=capabilities?.providers ?: return@launch
                val selectedCreator=creator ?: return@launch
                val capture=session.captureRequest(target, maximumResponseBytes=1_000_000, timeoutMs=15_000) ?: return@launch
                if (capture.expectedAccountId != accountId || capture.sessionId != sessionId || !capture.isCurrent() || !foreground || session.destination != target) return@launch
                busy=true
                try {
                    val page=capture.client.beginConversation(capture.expectedAccountId, capture.sessionId, APIConversationBeginConversation(selectedCreator.getString("id"),policy.version,APIConversationBeginConversationAccessNoticeAccepted,key))
                    if (!foreground || !capture.isCurrent() || page.creatorId != selectedCreator.getString("id") || runCatching { UUID.fromString(page.fanId) }.isFailure) return@launch
                    session.open("/threads/${page.creatorId}/${page.fanId}")
                } catch(failure: Throwable) { if(failure is CancellationException) throw failure;if(foreground && capture.isCurrent()) error="Reconnect to try again. No message was sent." } finally {busy=false}
            } }
            Button("Not now",variant=ButtonVariant.QUIET,block=true) { session.open("/creators/$handle") }
            }
        }
    }
}

@Composable private fun ConversationAccount(baseURL: String, session: FanSession) {
    val accountId = session.session?.accountId
    val sessionId = session.session?.sessionId
    val destination = session.destination
    val client=remember(baseURL,session,accountId,sessionId,destination) { ConversationClient(baseURL,session::currentToken,accountId) }
    val commerceClient = remember(session, accountId, sessionId, destination) {
        if (accountId != null && sessionId != null) CommerceClient(session, accountId, sessionId, destination) else null
    }
    var commerce by remember(client) { mutableStateOf<CommerceOverview?>(null) }
    val scroll = rememberLazyListState()
    var account by remember(client) { mutableStateOf<JsonObject?>(null) };var error by remember(client) { mutableStateOf("") }
    var cursor by remember(client) { mutableStateOf<String?>(null) }; var loading by remember(client) { mutableStateOf(false) }
    var revision by remember(client) { mutableStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    val scope = rememberCoroutineScope()
    fun conceal() { revision += 1; account = null; commerce = null; loading = false }
    DisposableEffect(lifecycleOwner, client) {
        val observer = LifecycleEventObserver { _, _ ->
            val active = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!active) conceal()
            foreground = active
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer); conceal() }
    }
    suspend fun refresh(before: String? = null) {
        conceal()
        if (!foreground) return
        val currentRevision = revision
        loading = true; cursor = before; error = ""
        try {
            val fresh = client.request("account" + (before?.let { "?cursor=$it" } ?: "")).jsonObject
            if (revision != currentRevision || !foreground || session.session?.accountId != accountId || session.session?.sessionId != sessionId || session.destination != destination) return
            account = fresh; cursor = before
            val token = session.currentToken()
            val overview = try { commerceClient?.overview() } catch (failure: Throwable) {
                if (failure is CancellationException) throw failure
                if (failure is CommerceFailure && failure.status in listOf(401, 409)) {
                    if (revision == currentRevision) conceal()
                    throw failure
                }
                null
            }
            if (revision == currentRevision && foreground && session.session?.accountId == accountId && session.session?.sessionId == sessionId && session.destination == destination && session.currentToken() == token && overview?.fan?.id == fresh["fan"]?.jsonObject?.get("id")?.jsonPrimitive?.content)
                commerce = overview
        }
        catch(failure:Throwable) { if(failure is CancellationException) throw failure; if(revision == currentRevision && foreground) error=failure.message ?: "Reconnect to open You." }
        finally { if (revision == currentRevision) loading = false }
    }
    LaunchedEffect(client, foreground) { if (foreground) refresh(cursor) else conceal() }
    val fan=account?.get("fan")?.jsonObject
    val overview = commerce
    val largeText = LocalDensity.current.fontScale >= 1.5f
    val limit = overview?.limits?.firstOrNull { it.currency == overview.policy.currency }
    val limitDetail = if (overview == null) "Currently unavailable" else if (limit == null) "Choose your limit" else if (limit.explicit_none) "No limit" else limit.amount?.toLongOrNull()?.let { "of your ${commerceMoney(it, limit.currency)} limit" } ?: "Limit unavailable"
    val privacyIndex = if (error.isNotEmpty()) 5 else 4
    LazyColumn(Modifier.fillMaxSize().widthIn(max = 390.dp).background(qColor("ground")), state = scroll, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 28.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                BasicText(fan?.get("handle")?.jsonPrimitive?.content?.let { "@$it" } ?: "You", style = qText("display-lg").copy(color = qColor("ink")))
                BasicText(if (session.session?.mode == APISessionMode.DEVELOPMENT) "Synthetic local account · development" else "Signed in with Pantopus", style = qText("caption").copy(color = qColor("ink-muted")))
            }
        }
        if(error.isNotEmpty()) item { Notice(title = "Account unavailable", children = error) }
        item {
            if (largeText) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AccountMetric("THIS MONTH", overview?.exposure?.let { commerceMoney(it.captured, it.currency) } ?: "—", limitDetail, Modifier.fillMaxWidth())
                    AccountMetric("MEMBERSHIPS", overview?.memberships?.size?.toString() ?: "—", if(overview == null) "Currently unavailable" else "Saved memberships", Modifier.fillMaxWidth())
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    AccountMetric("THIS MONTH", overview?.exposure?.let { commerceMoney(it.captured, it.currency) } ?: "—", limitDetail, Modifier.weight(1f))
                    AccountMetric("MEMBERSHIPS", overview?.memberships?.size?.toString() ?: "—", if(overview == null) "Currently unavailable" else "Saved memberships", Modifier.weight(1f))
                }
            }
        }
        item {
            Panel(Modifier.fillMaxWidth(), padding = 0.dp, gap = 0.dp) {
                AccountRow("Me and privacy", "Memories, who opened your conversations, consents") { scope.launch { scroll.scrollToItem(privacyIndex) } }; Hairline()
                AccountRow("Spending and time", "Your limit, receipts, time with each AI") { session.open("/commerce/spending") }; Hairline()
                AccountRow("Memberships", "Manage your memberships") { session.open("/commerce/membership") }; Hairline()
                AccountRow("Notifications", "Push and email, per creator, quiet hours") { session.open("/notifications/settings") }; Hairline()
                AccountRow("Receipts", "Your purchases and deliveries") { session.open("/commerce/requests") }; Hairline()
                AccountRow("Help and safety", "Report, block, crisis support") { session.open("/support") }
            }
        }
        item {
            BasicText("Your intro", style = qText("title").copy(color = qColor("ink")))
            BasicText(if (fan != null) fan["intro"]?.jsonPrimitive?.contentOrNull ?: "You haven’t added an intro yet." else if (error.isEmpty()) "Loading your account…" else "Your intro is unavailable.", style = qText("body").copy(color = qColor("ink")))
            Button("Edit handle and intro", variant = ButtonVariant.QUIET) { session.open("/identity/account") }
        }
        item { BasicText("Me and privacy",style=qText("display-md").copy(color = qColor("ink")));BasicText(QelvoraCopy.text("conversationAccess"),style=qText("caption").copy(color = qColor("ink")));BasicText("Memory and conversation access by creator",style=qText("body").copy(color = qColor("ink"))) }
        if (account != null && account?.get("threads")?.jsonArray?.isEmpty() == true) item { BasicText("No conversations yet.",style=qText("body").copy(color = qColor("ink"))) }
        account?.get("threads")?.jsonArray?.forEach { element -> val thread=element.jsonObject
            item {
                Button(thread["name"]!!.jsonPrimitive.content,variant=ButtonVariant.QUIET,block=true) { session.open("/threads/${thread["creatorId"]!!.jsonPrimitive.content}/${thread["fanId"]!!.jsonPrimitive.content}") }
                Button("Memory and access · " + thread["name"]!!.jsonPrimitive.content,variant=ButtonVariant.QUIET,block=true) { session.open("/you?creatorId=${thread["creatorId"]!!.jsonPrimitive.content}&fanId=${thread["fanId"]!!.jsonPrimitive.content}") }
            }
        }
        item {
            if (loading) BasicText("Loading your conversations…",style=qText("caption").copy(color = qColor("ink")))
            account?.get("nextCursor")?.jsonPrimitive?.contentOrNull?.let { next -> Button("More conversations",variant=ButtonVariant.QUIET,disabled=loading || error.isNotEmpty()) { scope.launch { refresh(next) } } }
            if (cursor != null) Button("Back to first page",variant=ButtonVariant.QUIET,disabled=loading) { scope.launch { refresh() } }
            if (error.isNotEmpty()) Button("Try again",variant=ButtonVariant.QUIET,disabled=loading) { scope.launch { refresh(cursor) } }
        }
        item { Button("Export or delete my data",variant=ButtonVariant.SECONDARY,block=true) { session.open("/support/privacy") } }
    }
}

@Composable private fun AccountMetric(title: String, value: String, detail: String, modifier: Modifier) {
    Panel(modifier, padding = 14.dp, gap = 4.dp) {
        BasicText(title, style = qText("data-sm").copy(color = qColor("ink-muted")))
        BasicText(value, style = qText("data-lg").copy(color = qColor("ink")))
        BasicText(detail, style = qText("caption").copy(color = qColor("ink-muted")))
    }
}

@Composable private fun AccountRow(title: String, detail: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = onClick).semantics(mergeDescendants = true) {}.padding(horizontal = 16.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(title, style = qText("body-strong").copy(color = qColor("ink")))
            BasicText(detail, style = qText("caption").copy(color = qColor("ink-muted")))
        }
        Box(Modifier.clearAndSetSemantics {}) { Glyph("chevron", 16.dp, qColor("ink")) }
    }
}
