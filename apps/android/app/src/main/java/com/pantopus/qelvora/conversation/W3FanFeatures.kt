package com.pantopus.qelvora.conversation

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

object W3FanFeatures {
    /** W1 calls this on sign-out/revocation alongside credential purge. */
    suspend fun clearPrivateState(context: android.content.Context) = ConversationResumeStorage(context).purge()
    fun registration(baseURL: String?) = FanFeatureRegistration(matches = {
        val path = it.substringBefore('?'); path == "/you" || path.startsWith("/threads/") || (path.startsWith("/creators/") && path.endsWith("/chat"))
    }, screen = { session ->
        val parts = Uri.parse(session.destination).pathSegments
        if (baseURL == null) Notice(title = "Conversation unavailable", children = "Reconnect to open this conversation from your account.")
        else if (parts.size == 3 && parts[0] == "threads") {
            val valid = runCatching { UUID.fromString(parts[1]); UUID.fromString(parts[2]); true }.getOrDefault(false)
            if (valid) ConversationScreen(baseURL, parts[1], parts[2], session) else Notice(title = "Conversation unavailable", children = "Open this conversation from your account.")
        } else if (parts.size == 3 && parts[0] == "creators" && parts[2] == "chat") FirstConversation(baseURL, parts[1], session)
        else if (Uri.parse(session.destination).path == "/you") ConversationAccount(baseURL, session)
        else Notice(title = "Conversation unavailable", children = "Open this conversation from your account.")
    })
}
private data class PendingMessage(val key: String, val text: String, val sequence: Long, val destination: String, val uncertain: Boolean = false, val rejected: Boolean = false)

@Composable
private fun ConversationScreen(baseURL: String, creatorId: String, fanId: String, session: FanSession) {
    val client = remember(baseURL, session.session?.accountId) { ConversationClient(baseURL, session::currentToken) }
    val root = "$creatorId/$fanId"
    val accountId = session.session?.accountId ?: "signed-out"
    val context = LocalContext.current
    val resumeStorage = remember(context) { ConversationResumeStorage(context) }
    val storageScope = "$baseURL/$root"
    var resumeActivated by remember(root, accountId) { mutableStateOf(false) }
    var resumeCursor by remember(root, accountId) { mutableStateOf<Long?>(null) }
    var page by remember(root) { mutableStateOf<ConversationPage?>(null) }
    var older by remember(root) { mutableStateOf<List<ConversationMessage>>(emptyList()) }
    var before by remember(root) { mutableStateOf<Long?>(null) }
    var gate by remember(root) { mutableStateOf<ThreadDeliveryGate?>(null) }
    var draft by remember(root) { mutableStateOf("") }
    var pending by remember(root) { mutableStateOf<PendingMessage?>(null) }
    var error by remember(root) { mutableStateOf("") }
    var offline by remember(root) { mutableStateOf(false) }
    var busy by remember(root) { mutableStateOf(false) }
    var privacy by remember(root) { mutableStateOf(false) }
    var source by remember(root) { mutableStateOf<Pair<String,String>?>(null) }
    val scope = rememberCoroutineScope()
    val scroll = rememberLazyListState()
    val fail: (Throwable) -> Unit = { failure ->
        if (failure is CancellationException) throw failure
        error = failure.message ?: "Reconnect to refresh. Your input is kept."
        offline = failure !is ConversationFailure
        if (failure is ConversationFailure && failure.status in listOf(401,403,404)) { page = null; older = emptyList(); draft = ""; pending = null; gate = null; scope.launch { runCatching { resumeStorage.remove(accountId, storageScope) } } }
    }
    suspend fun refresh() {
        try {
            if (!resumeActivated) {
                try { resumeStorage.activate(accountId); resumeCursor = resumeStorage.cursor(accountId, storageScope)?.cursor } catch (failure: Exception) { if (failure is CancellationException) throw failure }
                resumeActivated = true
            }
            val fresh = client.page(root)
            if (fresh.cursor >= (page?.cursor ?: 0)) {
                page = fresh; if (before == null && older.isEmpty()) before = fresh.before
                gate = ThreadDeliveryGate(fresh.threadId, fresh.cursor, fresh.epoch, fresh.generationSequences)
                try { resumeStorage.save(accountId, storageScope, fresh.cursor, fresh.epoch) } catch (failure: Exception) { if (failure is CancellationException) throw failure }
                offline = false; error = ""
                pending?.let { item -> if (client.request("$root/messages/status/${item.key}").jsonObject["accepted"]?.jsonPrimitive?.boolean == true) { pending = null; if (draft.trim() == item.text) draft = "" } }
            }
        } catch (failure: Throwable) { fail(failure) }
    }
    suspend fun send(retry: Boolean = false) {
        val current = page ?: return
        if (busy || offline || (!retry && draft.isBlank())) return
        val item = if (retry) pending ?: return else PendingMessage(UUID.randomUUID().toString(), draft.trim(), (current.messages.lastOrNull()?.sequence ?: 0) + 1, if(current.control == APIThreadControl.HUMAN_ACTIVE) "fan-replies" else "messages")
        pending = item; busy = true
        try {
            val path = item.destination
            val result = client.request("$root/$path", buildJsonObject { put("text", item.text); put("idempotencyKey", item.key); put("clientSequence", item.sequence) })
            if (path == "messages") client.json.decodeFromJsonElement<APIAcceptedMessage>(result) else client.json.decodeFromJsonElement<APIMessage>(result)
            pending = null; if (!retry) draft = ""; refresh()
        } catch (failure: Throwable) { val uncertain = failure !is ConversationFailure || failure.status >= 500 || failure.status == 409; pending = item.copy(uncertain = uncertain, rejected = !uncertain); fail(failure) }
        finally { busy = false }
    }
    LaunchedEffect(root, session.session?.accountId) {
        refresh()
        var ticks = 0
        while (true) {
            delay(if (offline) 3000 else 300)
            try {
                val currentGate = gate
                if (currentGate == null || offline) refresh()
                else {
                    val frames = client.replay(root, minOf(resumeCursor ?: currentGate.cursor, currentGate.cursor))
                    resumeCursor = null
                    var changed = false
                    frames.forEach { if (currentGate.receive(it).isNotEmpty()) changed = true }
                    if (changed || ++ticks % 16 == 0) refresh()
                }
            } catch (failure: Throwable) { fail(failure) }
        }
    }
    if (privacy) {
        ConversationPrivacy(client, root, page?.creatorName ?: "the creator", onBack = { privacy = false }, onData = { session.open("/support/privacy") })
        return
    }
    source?.let { passage -> Dialog(onDismissRequest = { source = null }) {
        Column(Modifier.background(qColor("ground")).padding(16.dp)) {
            BasicText("Original source", style = qText("meta"))
            LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(16.dp)) { item { BasicText(passage.first, style = qText("display-md")); SelectionContainer { BasicText(passage.second, style = qText("body")) } } }
            Button("Close", variant = ButtonVariant.QUIET) { source = null }
        }
    } }
    val current = page
    Column(Modifier.fillMaxSize().widthIn(max = 390.dp).background(qColor("ground"))) {
        if (current == null) {
            Notice(title = "Conversation unavailable", children = if (error.isEmpty()) "Loading your messages…" else error)
            Button("Refresh", variant = ButtonVariant.SECONDARY) { scope.launch { refresh() } }
            Button("Help and safety", variant = ButtonVariant.QUIET) { session.open("/support") }
        } else {
            ThreadHeader(name = current.creatorName, subtitle = "Official AI", live = current.control == APIThreadControl.HUMAN_ACTIVE, onBack = { session.open("/you") }, onAbout = { privacy = true })
            IdentityStrip(state = if (current.control == APIThreadControl.HUMAN_ACTIVE) IdentityState.HUMAN else if (current.control == APIThreadControl.AI_ACTIVE) IdentityState.AI else IdentityState.PAUSED, name = current.creatorName)
            LazyColumn(state = scroll, modifier = Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { BasicText("Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.", style = qText("caption")) }
                if (offline) item { Notice(title = "You're offline", children = "You're seeing the last loaded conversation. Reconnect to send.") }
                if (current.offTheRecord) item { SystemLine(text = "Off the record · the AI keeps no memory from this conversation.") }
                if (before != null) item { Button("Earlier messages", variant = ButtonVariant.QUIET, disabled = busy) { scope.launch {
                    busy = true
                    try { val previous = client.page("$root?before=$before"); older = (previous.messages + older).distinctBy { it.id }.take(250); before = previous.before }
                    catch (failure: Throwable) { fail(failure) } finally { busy = false }
                } } }
                items(older.filter { old -> current.messages.none { it.id == old.id } } + current.messages, key = { it.id }) { message ->
                    ConversationMessageRow(message, current.creatorName, current.control, onVerify = { message.signedActId?.let { session.open("/verify/$it") } }, onReport = { session.open("/support") }, onCitation = { id -> scope.launch { try { val passage = client.request("$root/citations/$id").jsonObject; source = passage["title"]?.jsonPrimitive?.content.orEmpty() to passage["text"]?.jsonPrimitive?.content.orEmpty() } catch (failure: Throwable) { fail(failure) } } })
                }
                pending?.let { pendingItem -> item { Message(kind = MessageKind.FAN, children = pendingItem.text, name = current.creatorName, delivery = if (pendingItem.uncertain) null else Delivery.PENDING); if (pendingItem.uncertain) { BasicText("Acceptance hasn't been confirmed. Retry checks the same message without a duplicate.", style = qText("caption")); Button("Retry", variant = ButtonVariant.QUIET, disabled = busy || offline) { scope.launch { send(true) } } } else if (pendingItem.rejected) { BasicText("Not sent", style = qText("caption")); Button("Keep editing", variant = ButtonVariant.QUIET) { draft = pendingItem.text; pending = null } } } }
                if (error.isNotEmpty()) item { Notice(title = "Conversation status", children = error) }
            }
            Column(Modifier.imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (!current.canSend) Notice(title = "AI unavailable", children = current.unavailableReason ?: "Messaging is unavailable.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BasicTextField(value = draft, onValueChange = { draft = it.take(2000) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp, max = 160.dp).semantics { contentDescription = if (current.control == APIThreadControl.HUMAN_ACTIVE) "Message ${current.creatorName}" else "Message ${current.creatorName}'s AI" }.background(qColor("surface")).padding(12.dp), textStyle = qText("body"), maxLines = 5)
                    Button("Send", variant = ButtonVariant.AI, disabled = !current.canSend || offline || busy || pending != null || current.generationSequences.isNotEmpty() || draft.isBlank()) { scope.launch { send() } }
                }
                Button("Ask ${current.creatorName} to step in", variant = ButtonVariant.MAYA, block = true) { session.open("/commerce/packet?creatorId=$creatorId") }
                Row { Button("Me and privacy", variant = ButtonVariant.QUIET) { privacy = true }; Button("Get support", variant = ButtonVariant.QUIET) { session.open("/support") } }
            }
        }
    }
}

@Composable private fun ConversationMessageRow(message: ConversationMessage, name: String, control: APIThreadControl, onVerify: () -> Unit, onReport: () -> Unit, onCitation: (String) -> Unit) {
    val kind = when (message.authorKind) { APIMessageAuthorKind.FAN -> MessageKind.FAN; APIMessageAuthorKind.AI -> MessageKind.AI; APIMessageAuthorKind.TEAM -> MessageKind.TEAM; APIMessageAuthorKind.HUMAN_CREATOR -> MessageKind.HUMAN_CREATOR; APIMessageAuthorKind.APPROVED_DRAFT -> MessageKind.APPROVED_DRAFT; else -> null }
    SelectionContainer {
        Column(Modifier.semantics { contentDescription = if (message.authorKind == APIMessageAuthorKind.FAN) "You" else if (message.authorKind == APIMessageAuthorKind.AI) "$name's AI" else if (message.authorKind == APIMessageAuthorKind.TEAM) "$name's team" else name }) {
            if (message.authorKind == APIMessageAuthorKind.SYSTEM) SystemLine(text = message.text)
            else if (kind != null) {
                Message(kind = kind, children = message.text, name = name, member = message.member ?: "Authorized team member", delivery = if (message.deliveryState == APIMessageDeliveryState.GENERATING) if (message.text.isEmpty()) Delivery.ACCEPTED else Delivery.STREAMING else if (message.deliveryState == APIMessageDeliveryState.INTERRUPTED) Delivery.INTERRUPTED else null, live = message.authorKind == APIMessageAuthorKind.HUMAN_CREATOR && control == APIThreadControl.HUMAN_ACTIVE, actions = false, onVerify = onVerify, citation = if (message.citations.isEmpty()) null else { { message.citations.forEach { id -> CitationChip(title = "Source", meta = "Read the original passage", onOpen = { onCitation(id) }) } } })
                if (message.deliveryState == APIMessageDeliveryState.FAILED) BasicText("Reply unavailable · your allowance was released", style = qText("caption"))
                if (message.authorKind != APIMessageAuthorKind.FAN) Button("Report", variant = ButtonVariant.QUIET, onClick = onReport)
            } else {
                BasicText(if (message.authorKind == APIMessageAuthorKind.HUMAN_BROADCAST) "Note from $name · audience details unavailable" else if (message.authorKind == APIMessageAuthorKind.HUMAN_REACTION) "$name reacted" else "Call with $name", style = qText("label"))
                BasicText(message.text, style = qText("body"))
                if (message.signedActId != null) SignedMarker(name = name, onClick = onVerify)
            }
        }
    }
}

@Composable private fun ConversationPrivacy(client: ConversationClient, root: String, name: String, onBack: () -> Unit, onData: () -> Unit) {
    var memory by remember(root) { mutableStateOf<ConversationMemories?>(null) }
    var audit by remember(root) { mutableStateOf<List<ConversationAudit>>(emptyList()) }
    var policy by remember(root) { mutableStateOf<ConversationCapabilities?>(null) }; var page by remember(root) { mutableStateOf<ConversationPage?>(null) }
    val uriHandler = LocalUriHandler.current
    var error by remember(root) { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    var provenance by remember(root) { mutableStateOf<ConversationMessage?>(null) }
    var editing by remember { mutableStateOf<String?>(null) }; var text by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    suspend fun refresh() { try { memory = client.json.decodeFromJsonElement(client.request("$root/memory")); audit = client.json.decodeFromJsonElement(client.request("$root/audit")); policy = client.json.decodeFromJsonElement(client.request("capabilities", publicRead = true)); page = client.page(root); error = "" } catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = failure.message ?: "Reconnect to refresh your privacy settings." } }
    suspend fun decide(item: ConversationMemory, action: String) {
        val snapshot = memory ?: return; if (busy) return; busy = true
        try { client.request("$root/memory/${item.id}", buildJsonObject { put("action", action); put("expectedRevision", snapshot.revision); if (action == "edit") put("text", text) }); editing = null; refresh() }
        catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = failure.message ?: "This change could not be saved." } finally { busy = false }
    }
    suspend fun preferences(offTheRecord: Boolean, introShared: Boolean) {
        if (busy) return
        val revision = memory?.revision ?: return
        busy = true
        try { client.request("$root/preferences", buildJsonObject { put("offTheRecord",offTheRecord); put("introShared",introShared); put("expectedRevision",revision) }); refresh() }
        catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = failure.message ?: "This setting could not be saved." } finally { busy = false }
    }
    suspend fun consent() {
        if (busy) return
        val currentPolicy = policy?.providers ?: return
        busy = true
        try { client.request("$root/consent", buildJsonObject { put("version",currentPolicy.version); put("accepted",page?.consentCurrent != true) }); refresh() }
        catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = failure.message ?: "Consent could not be saved." } finally { busy = false }
    }
    provenance?.let { message -> Dialog(onDismissRequest={provenance=null}) { Column(Modifier.background(qColor("ground")).padding(16.dp)) {
        BasicText("Where this came from",style=qText("title"));BasicText(if(message.authorKind==APIMessageAuthorKind.FAN) "You" else message.authorKind.name,style=qText("label"))
        LazyColumn(Modifier.weight(1f,fill=false)) { item { SelectionContainer { BasicText(message.text,style=qText("body")) } } }
        BasicText(message.createdAt,style=qText("data-sm"));Button("Close",variant=ButtonVariant.QUIET) {provenance=null}
    } } }
    LaunchedEffect(root) { refresh() }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxSize().background(qColor("ground"))) {
        item { Button("Back", variant = ButtonVariant.QUIET, onClick = onBack); BasicText("Me and privacy", style = qText("title")); if (error.isNotEmpty()) Notice(title = "Privacy status", children = error) }
        item { BasicText("What $name's AI remembers", style = qText("display-md")); if (memory?.items?.isEmpty() == true) BasicText("No memories. The AI asks before remembering.", style = qText("body")) }
        items(memory?.items.orEmpty(), key = { it.id }) { item -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(if (item.state == "proposed") "Want me to remember this? Only if you say yes." else "Remembered · ${item.kind}", style = qText("meta"))
            if (editing == item.id) { BasicTextField(text, { text = it.take(2000) }, textStyle = qText("body")); Button("Save proposal", variant = ButtonVariant.SECONDARY, disabled = busy || text.isBlank()) { scope.launch { decide(item, "edit") } } } else BasicText(item.text, style = qText("body"))
            if (item.sensitiveCategory != null) BasicText("Sensitive item · agreeing applies only to this exact memory.", style = qText("caption"))
            Button("View where this came from",variant=ButtonVariant.QUIET) { scope.launch { try { provenance=client.json.decodeFromJsonElement(client.request("$root/messages/${item.provenanceMessageId}")) } catch(failure:Throwable) { if(failure is CancellationException) throw failure;error=failure.message ?: "This source message is unavailable." } } }
            Row { if (item.state == "proposed") Button("Remember", variant = ButtonVariant.SECONDARY, disabled = busy || memory?.offTheRecord == true) { scope.launch { decide(item, "accept") } }; Button("Edit", variant = ButtonVariant.QUIET, disabled = busy) { editing = item.id; text = item.text }; Button(if (item.state == "proposed") "Don't remember" else "Delete", variant = ButtonVariant.QUIET, disabled = busy) { scope.launch { decide(item, "delete") } } }
            if (item.kind == "open_loop" && item.state == "remembered") Button("Resolved", variant = ButtonVariant.QUIET, disabled = busy) { scope.launch { decide(item, "resolve") } }
        } }
        item {
            BasicText("Off the record", style = qText("display-md"))
            BasicText("The AI keeps no memory from it. It remains visible to the creator and their team, and you can delete it.", style = qText("body"))
            Button(if (memory?.offTheRecord == true) "Turn off off-the-record" else "Turn on off-the-record", variant = ButtonVariant.SECONDARY, disabled = busy || memory == null) { scope.launch { preferences(memory?.offTheRecord != true, memory?.introShared == true) } }
            Button(if (memory?.introShared == true) "Stop sharing my intro" else "Share my intro with this creator's AI", variant = ButtonVariant.QUIET, disabled = busy || memory == null) { scope.launch { preferences(memory?.offTheRecord == true,memory?.introShared != true) } }
            BasicText("AI providers", style = qText("display-md"))
            policy?.providers?.providers?.forEach { provider ->
                Button(provider.name + " processing terms", variant = ButtonVariant.QUIET) { uriHandler.openUri(provider.termsUrl) }
                BasicText((if(provider.noTraining) "Doesn't train on your messages." else "Review message use in these terms.") + " " + (if(provider.noRetention) "Doesn't keep your messages." else "Review message retention in these terms."), style = qText("caption"))
            }
            if (policy?.providers == null) BasicText("AI providers and verified processing terms are not configured yet.", style = qText("body"))
            Button(if(page?.consentCurrent == true) "Withdraw AI provider consent" else "Agree to these AI providers", variant = ButtonVariant.SECONDARY, disabled = busy || policy?.providers?.verified != true) { scope.launch { consent() } }
        }
        item { BasicText("Who opened your conversations", style = qText("display-md")); if (audit.isEmpty()) BasicText("No logged openings.", style = qText("body")) }
        items(audit, key = { it.id }) { entry -> BasicText((if (entry.role == "creator") "$name's account" else if (entry.role == "ops") "Authorized safety account" else "Authorized team · ${entry.role}") + "\nAccount " + entry.readerAccountId + "\n" + entry.readAt, style = qText("body")) }
        item { BasicText("This shows when an authorized account opened a conversation, not that a person read every message.", style = qText("caption")); Button("Export or delete my data", variant = ButtonVariant.SECONDARY, block = true, onClick = onData) }
    }
}


@Composable private fun FirstConversation(baseURL: String, handle: String, session: FanSession) {
    val client = remember(baseURL,session.session?.accountId) { ConversationClient(baseURL,session::currentToken) }
    val growth = remember(baseURL) { GrowthClient(baseURL) }
    var creator by remember(handle) { mutableStateOf<org.json.JSONObject?>(null) }
    var capabilities by remember(handle) { mutableStateOf<ConversationCapabilities?>(null) }
    var error by remember(handle) { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    val key = remember(handle) { UUID.randomUUID().toString() }
    val scope = rememberCoroutineScope(); val uriHandler = LocalUriHandler.current
    val contextPending = Uri.parse(session.destination).getQueryParameter("context") != null
    LaunchedEffect(handle) {
        try {
            require(Regex("[A-Za-z0-9_-]{1,100}").matches(handle))
            creator = growth.request("public/creators/$handle").getJSONObject("creator")
            capabilities = client.json.decodeFromJsonElement(client.request("capabilities",publicRead = true))
        } catch (failure: Throwable) { if (failure is CancellationException) throw failure; error = "This creator or the conversation service is unavailable." }
    }
    val name = creator?.optString("name").orEmpty().ifBlank { "the creator" }
    LazyColumn(Modifier.fillMaxSize().widthIn(max = 390.dp).background(qColor("ground")),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
        item { Button("Back",variant=ButtonVariant.QUIET) { session.open("/creators/$handle") }; AuthorLabel(kind=AuthorKind.AI,name=name); BasicText("Before your first message",style=qText("display-lg")) }
        item {
            BasicText("WHO RUNS IT",style=qText("meta"))
            val policy = capabilities?.providers
            if(policy == null) BasicText("AI providers and their verified processing terms are not configured yet.",style=qText("body"))
            policy?.providers?.forEach { provider ->
                BasicText("This AI is powered by ${provider.name}.",style=qText("body"))
                Button(provider.name + " processing terms",variant=ButtonVariant.QUIET) { uriHandler.openUri(provider.termsUrl) }
                BasicText((if(provider.noTraining) "Doesn't train on your messages." else "Review message use in these terms.") + " " + (if(provider.noRetention) "Doesn't keep your messages." else "Review message retention in these terms."),style=qText("caption"))
            }
            BasicText("WHO CAN READ IT",style=qText("meta")); BasicText(capabilities?.accessDisclosure ?: "Conversations can be read by the creator and their authorized team. Those accesses are logged.",style=qText("body"))
            BasicText("WHAT IT REMEMBERS",style=qText("meta")); BasicText("Only what you agree to. It asks first, and you can see and delete every memory in You.",style=qText("body"))
        }
        if(error.isNotEmpty()) item { Notice(title="Conversation unavailable",children=error) }
        if(contextPending) item { Notice(title="Post context unavailable",children="This post's context is not connected to the conversation service yet. Your destination is kept.") }
        item {
            Button("Start with $name's AI",variant=ButtonVariant.AI,block=true,disabled=busy || creator == null || contextPending || capabilities?.generationAvailable != true || capabilities?.consentAvailable != true) { scope.launch {
                val policy=capabilities?.providers ?: return@launch; busy=true
                try {
                    val page=client.json.decodeFromJsonElement<ConversationPage>(client.request("begin",buildJsonObject { put("creatorId",creator!!.getString("id"));put("policyVersion",policy.version);put("accessNoticeAccepted",true);put("idempotencyKey",key) }))
                    session.open("/threads/${page.creatorId}/${page.fanId}")
                } catch(failure: Throwable) { if(failure is CancellationException) throw failure;error=failure.message ?: "Reconnect to try again. No message was sent." } finally {busy=false}
            } }
            Button("Not now",variant=ButtonVariant.QUIET,block=true) { session.open("/creators/$handle") }
        }
    }
}

@Composable private fun ConversationAccount(baseURL: String, session: FanSession) {
    val client=remember(baseURL,session.session?.accountId) { ConversationClient(baseURL,session::currentToken) }
    var account by remember { mutableStateOf<JsonObject?>(null) };var error by remember { mutableStateOf("") }
    LaunchedEffect(session.session?.accountId) { try { account=client.request("account").jsonObject } catch(failure:Throwable) { if(failure is CancellationException) throw failure;account=null;error=failure.message ?: "Reconnect to open You." } }
    val fan=account?.get("fan")?.jsonObject
    LazyColumn(Modifier.fillMaxSize().background(qColor("ground")),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
        item { BasicText("You",style=qText("title")); if(error.isNotEmpty()) Notice(title="Account unavailable",children=error) }
        item { BasicText(fan?.get("handle")?.jsonPrimitive?.content.orEmpty(),style=qText("display-md"));BasicText(fan?.get("intro")?.jsonPrimitive?.contentOrNull ?: "Your intro is private until you choose to share it.",style=qText("body"));Button("Handle and intro",variant=ButtonVariant.QUIET) { session.open("/settings/profile") } }
        item { Button("Memberships and requests",variant=ButtonVariant.SECONDARY,block=true) { session.open("/commerce") };Button("Spend and time",variant=ButtonVariant.QUIET,block=true) { session.open("/commerce/limits") };Button("Notifications",variant=ButtonVariant.QUIET,block=true) { session.open("/notifications/settings") } }
        item { BasicText("Me and privacy",style=qText("display-md"));BasicText("Memory and conversation access by creator",style=qText("body")) }
        account?.get("threads")?.jsonArray?.forEach { element -> val thread=element.jsonObject
            item { Button(thread["name"]!!.jsonPrimitive.content,variant=ButtonVariant.QUIET,block=true) { session.open("/threads/${thread["creatorId"]!!.jsonPrimitive.content}/${thread["fanId"]!!.jsonPrimitive.content}") } }
        }
        item { Button("Export or delete my data",variant=ButtonVariant.SECONDARY,block=true) { session.open("/support/privacy") };Button("Help and safety",variant=ButtonVariant.QUIET) { session.open("/support") } }
    }
}
