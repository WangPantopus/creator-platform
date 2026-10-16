package com.pantopus.qelvora.ui

import android.content.Context
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.generated.CreatorAPIError
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.conversation.ConversationClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import androidx.compose.ui.semantics.heading

private fun trustVisible(model: FanSession): Boolean = model.session != null && !model.busy && model.error.isEmpty() && !model.purgingPrivateState && !model.localPurgeFailed
private fun trustReady(model: FanSession): Boolean = trustVisible(model) && !model.checkingSession

private data class TrustPendingExport(val bytes: ByteArray, val capture: FanSessionRequestCapture)

private data class TrustDraftOwner(val origin: String, val accountId: String, val sessionId: String, val route: String)
private data class TrustFormDraft(
    val kind: String, val reason: String, val creatorId: String, val messageId: String,
    val requestId: String, val threadId: String, val scope: String,
    val useful: Boolean?, val authorship: Boolean?, val feedbackComment: String,
)

/** Activity configuration memory only. No SavedStateHandle, storage, session
 * model, credential, verification proof, consent, request or private result. */
private class TrustConfigurationDrafts : ViewModel() {
    private var parked: Pair<TrustDraftOwner, TrustFormDraft>? = null
    fun park(owner: TrustDraftOwner, draft: TrustFormDraft) { parked = owner to draft }
    fun clear() { parked = null }
    fun take(owner: TrustDraftOwner?): TrustFormDraft? {
        val value = parked; clear()
        return value?.takeIf { owner != null && it.first == owner }?.second
    }
    fun observe(origin: String?, route: String, accountId: String?, sessionId: String?, checking: Boolean,
                savedCredential: Boolean, purging: Boolean, purgeFailed: Boolean, choosingActor: Boolean) {
        val owner = parked?.first ?: return
        if (origin != owner.origin || route != owner.route || purging || purgeFailed || choosingActor ||
            (accountId != null && (accountId != owner.accountId || sessionId != owner.sessionId)) ||
            (accountId == null && !checking && !savedCredential)) clear()
    }
    override fun onCleared() { clear() }
    companion object {
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                check(modelClass == TrustConfigurationDrafts::class.java)
                return TrustConfigurationDrafts() as T
            }
        }
    }
}
private fun trustConfigurationDrafts(context: Context): TrustConfigurationDrafts? =
    (context as? ComponentActivity)?.let { ViewModelProvider(it, TrustConfigurationDrafts.factory)["qelvora.trust.configuration.form", TrustConfigurationDrafts::class.java] }
private fun trustDraftOwner(baseURL: String?, model: FanSession): TrustDraftOwner? =
    baseURL?.let { origin -> model.session?.let { TrustDraftOwner(origin, it.accountId, it.sessionId, model.destination) } }

/** Mounted by the original root even while account restoration hides a feature.
 * Pending input stays sealed until the original ready tuple is revalidated. */
@Composable
fun trustFanConfigurationBoundary(context: Context, baseURL: String?, model: FanSession) {
    val memory = remember(context) { trustConfigurationDrafts(context) }
    val accountId = model.session?.accountId; val sessionId = model.session?.sessionId
    val route = model.destination; val checking = model.checkingSession; val saved = model.hasSavedCredential
    val purging = model.purgingPrivateState; val failed = model.localPurgeFailed; val choosing = model.choosingActor
    SideEffect { memory?.observe(baseURL, route, accountId, sessionId, checking, saved, purging, failed, choosing) }
}

/** Private calls use the genuine original capture; public help has no credential. */
class TrustClient(private val baseURL: String, private val capture: FanSessionRequestCapture? = null) {
    suspend fun bytes(path: String, input: JsonObject? = null, binary: Boolean = false): ByteArray {
        if (input != null || path !in setOf("capabilities", "help", "status")) {
            val original = capture ?: throw IllegalStateException(QelvoraCopy.text("nativeRefreshYourAccountBeforeContinuing2"))
            try { return original.trustBytes("/v1/trust/$path", input?.toString()?.toByteArray(Charsets.UTF_8), binary).body }
            catch (failure: CreatorAPIError) {
                val detail = runCatching { Json.parseToJsonElement(failure.body).jsonObject["error"]?.jsonObject }.getOrNull()
                val message = detail?.get("message")?.jsonPrimitive?.content ?: QelvoraCopy.text("nativeReconnectAndTryAgain")
                throw IllegalStateException(detail?.get("correlationId")?.jsonPrimitive?.content?.let { QelvoraCopy.text("nativeMessageReferenceReference", mapOf("message" to message, "reference" to it)) } ?: message)
            }
        }
        return withContext(Dispatchers.IO) {
        currentCoroutineContext().ensureActive()
        val connection = URL(baseURL.trimEnd('/') + "/v1/trust/" + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"; connection.instanceFollowRedirects = false
            connection.setRequestProperty("X-Correlation-Id", UUID.randomUUID().toString())
            connection.connectTimeout = 5000; connection.readTimeout = 15000; connection.useCaches = false
            connection.setRequestProperty("Content-Type", "application/json")
            val status = connection.responseCode
            val data = (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { stream ->
                val bytes = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { currentCoroutineContext().ensureActive(); val count = stream.read(buffer); if (count < 0) break; if (bytes.size() + count > 1_048_576) throw IllegalStateException(QelvoraCopy.text("nativeThePublicHelpResponseExceeds")); bytes.write(buffer,0,count) }
                bytes.toByteArray()
            } ?: byteArrayOf()
            currentCoroutineContext().ensureActive()
            if (status !in 200..299) throw IllegalStateException(QelvoraCopy.text("nativeReconnectToLoadPublicHelp"))
            data
        } finally { connection.disconnect() }
        }
    }
    suspend fun request(path: String, input: JsonObject? = null): JsonObject = Json.parseToJsonElement(bytes(path, input).toString(Charsets.UTF_8)).jsonObject
}

fun trustFanRegistration(context: Context, baseURL: String?) = FanFeatureRegistration(
    matches = { it.startsWith("/support") || it.startsWith("/trust") },
    allowsSignedOut = { it.startsWith("/trust") },
    rootObserver = { model -> trustFanConfigurationBoundary(context, baseURL, model) },
    screen = { model ->
        key(model.session?.accountId, model.session?.sessionId) { TrustFanFeature(context, baseURL, model) }
    }
)

/** Missing phone composition is recorded; use established tokens and controls at 16dp gutters. */
@Composable
fun TrustFanFeature(context: Context, baseURL: String?, model: FanSession) {
    val activity = context as? ComponentActivity
    val draftMemory = remember(context) { trustConfigurationDrafts(context) }
    val draftOwner = trustDraftOwner(baseURL, model)
    var draftRestorationAttempted by remember { mutableStateOf(false) }
    val client = remember(baseURL) { baseURL?.let { TrustClient(it) } }
    val coroutine = rememberCoroutineScope()
    val route = model.destination
    val privateReady = trustReady(model)
    val privateVisible = trustVisible(model)
    var operation by remember { mutableStateOf<Job?>(null) }
    var refreshOperation by remember { mutableStateOf<Job?>(null) }
    var workEpoch by remember { mutableStateOf(0) }
    var loadedRoute by remember { mutableStateOf(route) }
    fun navigate(target: String) { model.open(target) }
    var cases by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var notices by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var jobs by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var selectedJob by remember { mutableStateOf<JsonObject?>(null) }
    var local by remember { mutableStateOf(false) }
    var verificationConfigured by remember { mutableStateOf(false) }
    var verificationMethod by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var result by remember { mutableStateOf("") }
    val entry = remember(route) { android.net.Uri.parse(route) }
    val reportedCreator = entry.getQueryParameter("creatorId").orEmpty()
    val reportedMessage = entry.getQueryParameter("messageId").orEmpty()
    var kind by remember { mutableStateOf(if (validTrustId(reportedCreator) && validTrustId(reportedMessage)) "ai_report" else "support") }
    var reason by remember { mutableStateOf("") }
    var creatorId by remember { mutableStateOf(reportedCreator.takeIf(::validTrustId).orEmpty()) }
    var messageId by remember { mutableStateOf(reportedMessage.takeIf(::validTrustId).orEmpty()) }
    var requestId by remember { mutableStateOf(entry.getQueryParameter("requestId").orEmpty().takeIf(::validTrustId).orEmpty()) }
    var threadId by remember { mutableStateOf("") }
    var scope by remember { mutableStateOf("account") }
    var proof by remember { mutableStateOf("") }
    var key by remember { mutableStateOf(UUID.randomUUID().toString()) }
    var confirmDelete by remember { mutableStateOf(false) }
    var pendingExport by remember { mutableStateOf<TrustPendingExport?>(null) }
    var history by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var help by remember { mutableStateOf<JsonObject?>(null) }
    var useful by remember { mutableStateOf<Boolean?>(null) }
    var authorship by remember { mutableStateOf<Boolean?>(null) }
    var feedbackConsent by remember { mutableStateOf(false) }
    var feedbackComment by remember { mutableStateOf("") }
    // The pickers' choices: null until loaded; memory only, cleared with the account view.
    var conversations by remember { mutableStateOf<List<JsonObject>?>(null) }
    var conversationsFailed by remember { mutableStateOf(false) }
    fun suspendPrivateResults(keepConfirmation: Boolean = false) {
        workEpoch++; busy = false
        // The generic confirmation carries no authority. Keep it through a
        // same-session readiness check; its action stays disabled and captured.
        pendingExport = null; if (!keepConfirmation) confirmDelete = false; result = ""; error = ""
    }
    fun clearPrivateResults() {
        suspendPrivateResults()
        cases = emptyList(); notices = emptyList(); jobs = emptyList(); history = emptyList(); selectedJob = null
        local = false; verificationConfigured = false; verificationMethod = ""
        conversations = null; conversationsFailed = false
    }
    /** Every page of the person's conversations (at most 20 pages of 50). */
    suspend fun loadConversations() {
        val origin = baseURL ?: return
        val account = model.session?.accountId ?: return
        if (!trustReady(model)) return
        conversationsFailed = false
        val api = ConversationClient(origin, model::currentToken, account)
        try {
            val all = mutableListOf<JsonObject>()
            var cursor: String? = null
            for (page in 0 until 20) {
                val answer = api.request("account" + (cursor?.let { "?cursor=$it" } ?: "")).jsonObject
                all += answer["threads"]?.jsonArray.orEmpty().map { it.jsonObject }
                cursor = answer["nextCursor"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content
                if (cursor == null) break
            }
            currentCoroutineContext().ensureActive()
            if (!trustReady(model) || model.session?.accountId != account) return
            conversations = all
            // An id this screen cannot name is never sent: a choice not among the
            // person's conversations is cleared, and they choose again.
            if (creatorId.isNotEmpty() && all.none { it.text("creatorId") == creatorId.lowercase() }) creatorId = ""
            if (threadId.isNotEmpty() && all.none { it.text("id") == threadId.lowercase() }) threadId = ""
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (trustReady(model) && model.session?.accountId == account) { conversations = null; conversationsFailed = true } }
    }
    fun beginWork(): Int { workEpoch++; busy = true; return workEpoch }
    fun finishWork(epoch: Int) { if (workEpoch == epoch) busy = false }
    fun launchPrivate(block: suspend () -> Unit) {
        if (!trustReady(model)) return
        operation?.cancel(); operation = coroutine.launch { block() }
    }
    suspend fun capture(): FanSessionRequestCapture {
        currentCoroutineContext().ensureActive()
        if (!trustReady(model)) throw CancellationException(QelvoraCopy.text("nativeRefreshYourAccountBeforeContinuing2"))
        val original = model.captureRequest(route, maximumResponseBytes = 32 * 1024 * 1024, timeoutMs = 15_000)
            ?: throw CancellationException("Your original account view changed.")
        if (!trustReady(model) || !original.isCurrent()) throw CancellationException("Your original account view changed.")
        return original
    }
    suspend fun capturedClient(): TrustClient = TrustClient(baseURL ?: throw IllegalStateException(QelvoraCopy.text("nativeTheTrustServiceIsNotConfigured")), capture())
    val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload = pendingExport
        pendingExport = null
        if (uri != null && payload != null) launchPrivate {
            val epoch = beginWork()
            var saved = false
            var wroteDestination = false
            try {
                if (!trustReady(model) || !payload.capture.isCurrent()) throw CancellationException("Your original account view changed.")
                withContext(Dispatchers.IO) {
                    currentCoroutineContext().ensureActive()
                    if (!withContext(Dispatchers.Main.immediate) { trustReady(model) && payload.capture.isCurrent() }) throw CancellationException("Your original account view changed.")
                    val stream = context.contentResolver.openOutputStream(uri, "w") ?: throw IllegalStateException(QelvoraCopy.text("nativeChooseAWritableExportDestination"))
                    wroteDestination = true
                    stream.use { output ->
                        var offset = 0
                        while (offset < payload.bytes.size) {
                            currentCoroutineContext().ensureActive()
                            val count = minOf(8192, payload.bytes.size - offset); output.write(payload.bytes, offset, count); offset += count
                        }
                    }
                }
                currentCoroutineContext().ensureActive()
                if (!trustReady(model) || !payload.capture.isCurrent() || workEpoch != epoch) throw CancellationException("Your original account view changed.")
                saved = true
                result = QelvoraCopy.text("nativeYourExportWasSavedToThe")
                error = ""
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) error = failure.message ?: QelvoraCopy.text("nativeTheExportCouldNotBeSaved") }
            finally {
                if (!saved && wroteDestination) {
                    val removed = runCatching { context.contentResolver.delete(uri, null, null) > 0 }.getOrDefault(false)
                    if (!removed && trustReady(model) && workEpoch == epoch) error = QelvoraCopy.text("nativeTheExportWasInterruptedRemove")
                }
                finishWork(epoch)
            }
        } else pendingExport = null
    }
    // Public crisis help never waits on capability or account data: a restored or
    // degraded host can refuse those while help stays available. A failed capability
    // read clears the old value so data requests cannot submit on stale verification.
    suspend fun load() {
        if (client == null) { error = QelvoraCopy.text("nativeTheTrustServiceIsNotConfigured"); return }
        val epoch = beginWork()
        var failure: Exception? = null
        suspend fun checkLoad(accountRequired: Boolean = true) {
            currentCoroutineContext().ensureActive()
            if (workEpoch != epoch || (accountRequired && !trustReady(model))) throw CancellationException("Your original account view changed.")
        }
        try {
            try { val value = client.request("help"); checkLoad(false); help = value }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (current: Exception) { checkLoad(false); failure = current }
            checkLoad()
            if (route.contains("privacy")) {
                try {
                    val capability = client.request("capabilities")
                    checkLoad()
                    local = capability["localDevelopment"]?.jsonPrimitive?.booleanOrNull == true
                    verificationConfigured = capability.text("actorVerification") == "configured"
                    verificationMethod = capability.text("verificationMethod")
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (current: Exception) { checkLoad(); local = false; verificationConfigured = false; verificationMethod = ""; failure = failure ?: current }
            }
            try {
                val client = capturedClient()
                checkLoad()
                if (route.startsWith("/trust") || route.contains("feedback")) { }
                else if (route.contains("access")) { val page = client.request("access-history"); checkLoad(); history = page.items() }
                else if (route.contains("privacy")) {
                    pendingExport = null
                    val page = client.request("privacy/jobs")
                    checkLoad()
                    jobs = page.items()
                    val selectedId = selectedJob?.text("id")
                    if (selectedId != null && jobs.any { it.text("id") == selectedId }) {
                        val detail = client.request("privacy/jobs/$selectedId")
                        checkLoad()
                        selectedJob = detail
                        jobs = jobs.map { if (it.text("id") == selectedId) detail else it }
                    } else selectedJob = null
                }
                else { val page = client.request("my-cases"); checkLoad(); val inbox = client.request("inbox"); checkLoad(); cases = page.items(); notices = inbox.items() }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (current: Exception) { checkLoad(); cases = emptyList(); notices = emptyList(); jobs = emptyList(); history = emptyList(); selectedJob = null; pendingExport = null; failure = failure ?: current }
            checkLoad()
            error = failure?.let { it.message ?: QelvoraCopy.text("nativeReconnectAndTryAgain") } ?: ""
            if (!route.startsWith("/trust") && !route.contains("access") && !route.contains("feedback")) loadConversations()
        } finally { finishWork(epoch) }
    }
    /** WP 7.4 P5: a creator or a conversation is picked by the creator's name,
     * never typed as an id. Nothing is chosen until the person chooses; a
     * screen opened from a thread arrives with that creator chosen. */
    val conversationPicker: @Composable (Boolean) -> Unit = { thread ->
        val label = QelvoraCopy.text(if (thread) "pickerConversation" else "pickerCreator")
        var open by remember(thread) { mutableStateOf(false) }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TrustText(label, "label")
            val loaded = conversations
            when {
                conversationsFailed -> { TrustText(QelvoraCopy.text("pickerConversationsFailed")); Button(QelvoraCopy.text("growthTryAgain"), ButtonVariant.SECONDARY, disabled = busy || !privateReady) { launchPrivate { loadConversations() } } }
                loaded == null -> TrustText(QelvoraCopy.text("nativeLoading"))
                loaded.isEmpty() -> TrustText(QelvoraCopy.text("pickerNoConversations"))
                else -> {
                    val choices = if (thread) loaded.map { it.text("id") to it } else loaded.distinctBy { it.text("creatorId") }.map { it.text("creatorId") to it }
                    val chosen = choices.firstOrNull { it.first == (if (thread) threadId else creatorId).lowercase() }?.second?.text("name")
                    val shown = chosen ?: QelvoraCopy.text(if (thread) "pickerChooseConversation" else "pickerChooseCreator")
                    Button(shown, ButtonVariant.SECONDARY, block = true, modifier = Modifier.semantics { contentDescription = "$label, $shown" }) { open = !open }
                    if (open) choices.forEach { (id, item) ->
                        Button(item.text("name"), ButtonVariant.QUIET, block = true) {
                            if (thread) { threadId = id; creatorId = item.text("creatorId") } else creatorId = id
                            open = false
                        }
                    }
                }
            }
        }
    }
    // A command with local consequences (`accepted`) finishes once sent, even if
    // a routine session check cancels this screen's work meanwhile: the server
    // may already have accepted it. Only showing the answer depends on the
    // checks after it.
    suspend fun perform(path: String, input: JsonObject, accepted: (suspend () -> Unit)? = null): JsonObject? {
        if (client == null || busy || !trustReady(model)) return null
        val epoch = beginWork()
        return try { val sender = capturedClient(); val value = if (accepted == null) sender.request(path, input) else withContext(kotlinx.coroutines.NonCancellable) { sender.request(path, input).also { accepted() } }; currentCoroutineContext().ensureActive(); if (!trustReady(model) || workEpoch != epoch) throw CancellationException("Your original account view changed."); error = ""; key = UUID.randomUUID().toString(); value }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) error = failure.message ?: QelvoraCopy.text("nativeReconnectAndTryAgain"); null }
        finally { finishWork(epoch) }
    }
    suspend fun jobDetail(id: String) {
        if (client == null || busy || !trustReady(model)) return
        val epoch = beginWork()
        pendingExport = null
        try {
            val detail = capturedClient().request("privacy/jobs/$id")
            currentCoroutineContext().ensureActive()
            if (!trustReady(model) || workEpoch != epoch) throw CancellationException("Your original account view changed.")
            selectedJob = detail
            jobs = jobs.map { if (it.text("id") == id) detail else it }
            error = ""
        }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) { selectedJob = null; error = failure.message ?: QelvoraCopy.text("nativeReconnectAndTryAgain") } }
        finally { finishWork(epoch) }
    }
    suspend fun privacyCommand(action: String) {
        val origin = baseURL ?: return
        val account = model.session?.accountId ?: return
        val deletionScope = scope; val creator = creatorId.lowercase(); val thread = threadId.lowercase()
        val input = buildJsonObject { put("kind", action); put("scope", deletionScope); put("proof", if (verificationMethod == "current_session") "CURRENT_SESSION" else proof); put("idempotencyKey", key); if (deletionScope != "account") put("creatorId", creator); if (deletionScope == "thread") put("threadId", thread) }
        // An accepted deletion removes the original account's matching drafts
        // even if the account view changes before the answer is shown.
        var purgeFailed = false
        val saved = perform("privacy/jobs", input, accepted = if (action != "delete") null else ({
            try {
                com.pantopus.qelvora.conversation.ConversationDraftStorage(context).purge(origin, account,
                    creator = if (deletionScope == "account") null else creator,
                    thread = if (deletionScope == "thread") thread else null)
            } catch (_: Exception) { purgeFailed = true }
        }))
        if (purgeFailed) { model.purge(); return }
        saved?.let { result = QelvoraCopy.text("nativeRequestSavedInspectEachDomains"); load(); jobDetail(it.text("id")) }
    }

    LaunchedEffect(route, privateReady, model.error) {
        operation?.cancel()
        if (loadedRoute != route || model.error.isNotEmpty()) clearPrivateResults() else if (!privateReady) suspendPrivateResults(keepConfirmation = privateVisible && model.checkingSession)
        loadedRoute = route; load()
    }
    LaunchedEffect(draftOwner, privateReady) {
        if (privateReady && !draftRestorationAttempted) {
            draftRestorationAttempted = true
            val restored = draftMemory?.take(draftOwner)
            // Input entered during a first readiness check wins over a parked
            // draft; no late restoration may overwrite the actual user's edit.
            if (restored != null && reason.isEmpty() && feedbackComment.isEmpty() && proof.isEmpty() &&
                !feedbackConsent && useful == null && authorship == null && threadId.isEmpty() && scope == "account" &&
                kind == (if (validTrustId(reportedCreator) && validTrustId(reportedMessage)) "ai_report" else "support") &&
                creatorId == reportedCreator.takeIf(::validTrustId).orEmpty() && messageId == reportedMessage.takeIf(::validTrustId).orEmpty() &&
                requestId == entry.getQueryParameter("requestId").orEmpty().takeIf(::validTrustId).orEmpty()) {
                kind = restored.kind; reason = restored.reason; creatorId = restored.creatorId; messageId = restored.messageId
                requestId = restored.requestId; threadId = restored.threadId; scope = restored.scope
                useful = restored.useful; authorship = restored.authorship; feedbackComment = restored.feedbackComment
            }
        }
    }
    DisposableEffect(Unit) { onDispose {
        if (activity?.isChangingConfigurations == true && draftOwner != null && draftOwner == trustDraftOwner(baseURL, model) &&
            !model.purgingPrivateState && !model.localPurgeFailed && !model.choosingActor && operation?.isActive != true) {
            draftMemory?.park(draftOwner, TrustFormDraft(kind, reason, creatorId, messageId, requestId, threadId, scope, useful, authorship, feedbackComment))
        } else draftMemory?.clear()
        operation?.cancel(); refreshOperation?.cancel(); clearPrivateResults()
    } }
    LaunchedEffect(kind,reason,creatorId,messageId,requestId,threadId,scope,proof) { key=UUID.randomUUID().toString() }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TrustText(if (route.contains("privacy")) QelvoraCopy.text("nativeYourData") else if (route.contains("access")) QelvoraCopy.text("nativeCaseAccessHistory") else if (route.contains("feedback")) QelvoraCopy.text("nativeOptionalProductFeedback") else if (route.startsWith("/trust")) QelvoraCopy.text("nativeCrisisHelpProtocol") else QelvoraCopy.text("nativeHelpAndReports"), "display-md")
        TrustText(QelvoraCopy.text("nativeReportsAreAvailableWithoutPaid"))
        Row { Button(QelvoraCopy.text("nativeSupport"), ButtonVariant.QUIET) { navigate("/support") }; Button(QelvoraCopy.text("nativeYourData"), ButtonVariant.QUIET) { navigate("/support/privacy") } }
        Row { Button(QelvoraCopy.text("nativeAccessHistory"), ButtonVariant.QUIET) { navigate("/support/access") }; Button(QelvoraCopy.text("nativeFeedback"), ButtonVariant.QUIET) { navigate("/support/feedback") } }
        Button(QelvoraCopy.text("nativeCrisisHelp"), ButtonVariant.QUIET) { navigate("/trust/crisis") }
        if (busy) TrustText(QelvoraCopy.text("nativeLoading"))
        if (error.isNotEmpty()) Notice("error", QelvoraCopy.text("nativeCouldNotComplete"), error)
        if (privateVisible && result.isNotEmpty()) Notice(title = QelvoraCopy.text("nativeSaved"), children = result)
        if (!privateVisible && !route.startsWith("/trust")) Notice(title = QelvoraCopy.text("nativeAccountUnavailable"), children = QelvoraCopy.text("nativeRefreshYourAccountBeforeContinuingUnsaved"))
        if (route.startsWith("/trust")) {
            TrustCrisisHelp(context,help)
        } else if (route.contains("access")) {
            TrustText(QelvoraCopy.text("nativeTheseRecordsShowWhenAnAuthorized"))
            if (privateVisible && history.isEmpty() && !busy) TrustText(QelvoraCopy.text("nativeNoCaseAccessesYet"),"caption")
            history.takeIf { privateVisible }.orEmpty().forEach { item -> TrustText(item.text("action").replace('_',' ') + " · " + item.text("created_at"),"caption"); TrustText(item.text("purpose")) }
        } else if (route.contains("feedback")) {
            TrustText(QelvoraCopy.text("nativeYourAnswersHelpEvaluateUsefulness"))
            TrustText(QelvoraCopy.text("nativeWasTheConversationUseful") + " " + (useful?.let { if(it) QelvoraCopy.text("nativeYes") else QelvoraCopy.text("nativeNo") } ?: QelvoraCopy.text("nativeChooseAnAnswer")),"label")
            Row { Button(QelvoraCopy.text("nativeYes"),ButtonVariant.QUIET, modifier = Modifier.semantics { selected = useful == true }) { useful=true }; Button(QelvoraCopy.text("nativeNo"),ButtonVariant.QUIET, modifier = Modifier.semantics { selected = useful == false }) { useful=false } }
            TrustText(QelvoraCopy.text("nativeWasItClearWhoWroteEach") + " " + (authorship?.let { if(it) QelvoraCopy.text("nativeYes") else QelvoraCopy.text("nativeNo") } ?: QelvoraCopy.text("nativeChooseAnAnswer")),"label")
            Row { Button(QelvoraCopy.text("nativeYes"),ButtonVariant.QUIET, modifier = Modifier.semantics { selected = authorship == true }) { authorship=true }; Button(QelvoraCopy.text("nativeNo"),ButtonVariant.QUIET, modifier = Modifier.semantics { selected = authorship == false }) { authorship=false } }
            TrustField(QelvoraCopy.text("nativeAnythingToImproveOptional"),feedbackComment,true) { feedbackComment=it }
            ToggleRow(QelvoraCopy.text("nativeIAgreeToShareTheseAnswers"), checked = feedbackConsent) { feedbackConsent = it }
            Button(QelvoraCopy.text("nativeSendFeedback"),ButtonVariant.SECONDARY,block=true,disabled=busy || !privateReady || !feedbackConsent || useful==null || authorship==null) { launchPrivate {
                if (perform("feedback",buildJsonObject { put("consent",true); put("cohort","unspecified"); put("useful",useful==true); put("authorshipClear",authorship==true); put("comment",feedbackComment) }) != null) { result=QelvoraCopy.text("nativeYourFeedbackIsSaved"); feedbackConsent=false; feedbackComment="" }
            } }
        } else if (route.contains("privacy")) {
            TrustText(QelvoraCopy.text("nativeExportAndDeletionAreSeparate"))
            Button(QelvoraCopy.text("nativeManageGooglePlaySubscriptions"), ButtonVariant.SECONDARY, block = true) { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://play.google.com/store/account/subscriptions"))) }
            // The same names as iOS's picker; the chosen one is announced as selected.
            val scopes = mapOf("account" to QelvoraCopy.text("nativeAccount"), "creator" to QelvoraCopy.text("pickerCreator"), "thread" to QelvoraCopy.text("nativeConversation"))
            Row { scopes.forEach { (value, name) -> Button(name, ButtonVariant.QUIET, modifier = Modifier.semantics { selected = scope == value }) { scope = value } } }
            TrustText(QelvoraCopy.text("nativeDataScopeScope", mapOf("scope" to (scopes[scope] ?: scope))), "label")
            if (scope != "account") conversationPicker(scope == "thread")
            if (local) { TrustText(QelvoraCopy.text("nativeSyntheticLocalAccountTypeLOCAL"), "caption"); TrustField(QelvoraCopy.text("nativeLocalConfirmation"), proof) { proof = it } }
            else if (verificationMethod == "current_session") TrustText(QelvoraCopy.text("nativeYourSignInMustBeRecent"), "caption")
            else if (verificationConfigured) TrustField(QelvoraCopy.text("nativeAccountVerificationReceipt"), proof) { proof = it }
            else TrustText(QelvoraCopy.text("nativeFreshAccountVerificationMust"), "caption")
            val disabled = busy || !privateReady || !verificationConfigured || (if (local) proof != "LOCAL DEVELOPMENT" else verificationMethod != "current_session" && proof.isEmpty()) || (scope != "account" && !validTrustId(creatorId)) || (scope == "thread" && !validTrustId(threadId))
            Button(QelvoraCopy.text("nativeRequestExport"), ButtonVariant.SECONDARY, block = true, disabled = disabled) { launchPrivate { privacyCommand("export") } }
            Button(QelvoraCopy.text("nativeRequestDeletion"), ButtonVariant.SECONDARY, block = true, disabled = disabled) { confirmDelete = true }
            jobs.takeIf { privateVisible }.orEmpty().forEach { job -> key(job.text("id")) {
                TrustText(QelvoraCopy.text("nativeRequestedTime", mapOf("time" to job.text("created_at"))), "caption")
                val label = QelvoraCopy.text("nativeKindScopeStateRequestedCreatedat", mapOf("kind" to job.text("kind"), "scope" to job.text("scope"), "state" to job.text("state").replace('_', ' '), "createdAt" to job.text("created_at"), "id" to job.text("id")))
                Button(job.text("kind") + " · " + job.text("scope") + " · " + job.text("state").replace('_', ' '), ButtonVariant.QUIET, block = true, disabled = busy || !privateReady, modifier = Modifier.semantics { contentDescription = label }) { launchPrivate { jobDetail(job.text("id")) } }
            } }
            selectedJob?.takeIf { privateVisible }?.let { job ->
                TrustText(QelvoraCopy.text("nativeJobId", mapOf("id" to job.text("id"))), "caption")
                job["tasks"]?.jsonArray?.forEach { item -> val task = item.jsonObject; TrustText(task.text("domain") + ": " + task.text("state").replace('_', ' ') + task.text("error_code").takeIf { it.isNotEmpty() }?.let { " · " + it.replace('_', ' ') }.orEmpty()) }
                job["retained"]?.jsonArray?.forEach { item -> val retained = item.jsonObject; TrustText(QelvoraCopy.text("nativeRetainedCategory", mapOf("category" to retained.text("category").replace('_',' '))),"label"); TrustText(retained.text("reason")); retained.text("until").takeIf { it.isNotEmpty() }?.let { TrustText(QelvoraCopy.text("nativeUntilDate", mapOf("date" to it)),"caption") } }
                if (job.text("state") != "complete") Button(QelvoraCopy.text("nativeRetryIncompleteDomains"), ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { launchPrivate { if (perform("privacy/jobs/" + job.text("id") + "/retry", buildJsonObject {}) != null) { result = QelvoraCopy.text("nativeIncompleteDomainsQueuedAgain"); jobDetail(job.text("id")) } } }
                if (job.text("state") == "complete" && job.text("kind") == "export") Button(QelvoraCopy.text("nativeSaveExport"), ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { launchPrivate {
                    if (baseURL != null && trustReady(model)) {
                        val epoch = beginWork()
                        try {
                            val original = capture()
                            val payload = TrustClient(baseURL, original).bytes("privacy/jobs/" + job.text("id") + "/download", binary = true)
                            currentCoroutineContext().ensureActive()
                            if (!trustReady(model) || !original.isCurrent() || workEpoch != epoch) throw CancellationException("Your original account view changed.")
                            pendingExport = TrustPendingExport(payload, original)
                            saveExport.launch("creator-data.json")
                            error = ""
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) { pendingExport = null; error = failure.message ?: QelvoraCopy.text("nativeReconnectAndRetryYourExport") } }
                        finally { finishWork(epoch) }
                    }
                } }
            }
        } else {
            val kinds = mapOf("support" to QelvoraCopy.text("nativeSupportRequest"), "ai_report" to QelvoraCopy.text("nativeReportAIMessage"), "abuse" to QelvoraCopy.text("nativeAbuseReport"), "block" to QelvoraCopy.text("nativeBlockCreator"), "crisis" to QelvoraCopy.text("nativeCrisisHelp"))
            kinds.entries.chunked(2).forEach { choices -> Row { choices.forEach { (value, name) -> Button(name, ButtonVariant.QUIET, modifier = Modifier.semantics { selected = kind == value }) { kind = value } } } }
            TrustText(QelvoraCopy.text("nativeReportTypeKind", mapOf("kind" to (kinds[kind] ?: kind))), "label")
            if (kind == "ai_report" || kind == "abuse" || kind == "block") conversationPicker(false)
            if (kind == "ai_report") TrustField(QelvoraCopy.text("nativeAIMessageID"), messageId) { messageId = it }
            if (kind == "support") TrustField(QelvoraCopy.text("nativeRequestIDOptional"), requestId) { requestId = it }
            if (kind == "crisis") TrustCrisisHelp(context,help)
            TrustField(QelvoraCopy.text("nativeWhatHappened"), reason, true) { reason = it }
            Button(if(kind=="block") QelvoraCopy.text("nativeBlockCreator") else QelvoraCopy.text("nativeSendReport"), ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady || reason.trim().length < 12 || (kind=="support" && requestId.isNotEmpty() && !validTrustId(requestId)) || (kind=="block" && !validTrustId(creatorId)) || (kind=="ai_report" && (!validTrustId(creatorId) || !validTrustId(messageId)))) { launchPrivate {
                if(kind=="block") {
                    if(perform("blocks",buildJsonObject { put("creatorId",creatorId.lowercase()); put("reason",reason); put("idempotencyKey",key) }) != null) { result=QelvoraCopy.text("nativeYourBlockIsSavedEnforcementIn"); reason=""; load() }
                    return@launchPrivate
                }
                val input = buildJsonObject { put("kind", kind); put("reason", reason); put("idempotencyKey", key); if (kind!="support" && creatorId.isNotEmpty()) put("creatorId", creatorId.lowercase()); if (kind == "ai_report") put("messageId", messageId.lowercase()); if (kind == "support" && requestId.isNotEmpty()) put("requestId",requestId.lowercase()) }
                perform("reports", input)?.let { result = QelvoraCopy.text("nativeCASENumberIsSavedNoProvider", mapOf("number" to it.text("number"))); reason = ""; load() }
            } }
            TrustText(QelvoraCopy.text("nativeYourCases"), "title")
            cases.takeIf { privateVisible }.orEmpty().forEach { item ->
                TrustText("CASE-" + item.text("number") + " · " + item.text("kind").replace('_', ' ') + " · " + item.text("state"), "body-strong")
                if (item.text("state") == "resolved") Button(QelvoraCopy.text("nativeAppealCASENumber", mapOf("number" to item.text("number"))), ButtonVariant.SECONDARY, disabled = busy || !privateReady || reason.trim().length < 12) { launchPrivate {
                    if (perform("cases/" + item.text("id") + "/appeals", buildJsonObject { put("version", item["version"]!!); put("reason", reason); put("idempotencyKey", key) }) != null) { result = QelvoraCopy.text("nativeYourAppealIsSavedForA"); reason = ""; load() }
                } }
            }
            TrustText(QelvoraCopy.text("nativeTrustInbox"), "title")
            notices.takeIf { privateVisible }.orEmpty().forEach { item -> TrustText(item.text("type").replace('_', ' '), "label"); TrustText(item.text("reason")) }
        }
        Button(QelvoraCopy.text("nativeRefresh"), ButtonVariant.SECONDARY, block = true, disabled = busy || model.checkingSession || model.busy) { refreshOperation?.cancel(); refreshOperation = coroutine.launch { model.refresh() } }
    }
    if (confirmDelete && privateVisible) Dialog(onDismissRequest = { confirmDelete = false }) {
        Column(Modifier.background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TrustText(QelvoraCopy.text("nativeDeleteThisDataScope"), "title")
            TrustText(QelvoraCopy.text("nativeAccessClosesImmediatelyPurging"))
            Button(QelvoraCopy.text("nativeRequestDeletion"), ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { confirmDelete = false; launchPrivate { privacyCommand("delete") } }
            Button(QelvoraCopy.text("nativeKeepData"), ButtonVariant.QUIET, block = true) { confirmDelete = false }
        }
    }
}
private fun JsonObject.text(key: String): String = get(key)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content.orEmpty()
private fun JsonObject.items(): List<JsonObject> = get("items")?.jsonArray?.map { it.jsonObject }.orEmpty()
private fun validTrustId(value: String) = runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)
@Composable private fun TrustCrisisHelp(context: Context,help: JsonObject?) {
    TrustText(help?.text("emergencyMessage")?.takeIf { it.isNotEmpty() } ?: QelvoraCopy.text("nativeIfYouAreInImmediateDanger"),"body-strong")
    TrustText(QelvoraCopy.text("nativeReportsDoNotRequirePaidAccess"))
    val resources=help?.get("resources")?.jsonArray.orEmpty()
    if(help!=null && resources.isEmpty()) TrustText(QelvoraCopy.text("nativeRegionalHelpResourcesAreNotConfigured"),"caption")
    resources.forEach { item -> val resource=item.jsonObject; val uri=android.net.Uri.parse(resource.text("url")); if(uri.scheme=="https") Button(resource.text("name") + " · " + resource.text("region"),ButtonVariant.QUIET,block=true) { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,uri)) }; resource.text("phone").takeIf { it.isNotEmpty() }?.let { TrustText(it) } }
}
// A screen or section title is a heading, as on iOS.
@Composable private fun TrustText(text: String, style: String = "body") { BasicText(text, if (style.startsWith("display") || style == "title") Modifier.semantics { heading() } else Modifier, style = qText(style).copy(color = qColor("ink"))) }
@Composable private fun TrustField(label: String, value: String, multiline: Boolean = false, changed: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { TrustText(label, "label"); BasicTextField(value, { changed(it.take(if (multiline) 2000 else 2048)) }, Modifier.fillMaxWidth().heightIn(min = if (multiline) 96.dp else 48.dp).background(qColor("surface")).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink")), singleLine = !multiline) }
}
