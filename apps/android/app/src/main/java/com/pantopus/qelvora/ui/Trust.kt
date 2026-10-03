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
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.generated.CreatorAPIError
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
            val original = capture ?: throw IllegalStateException("Refresh your account before continuing.")
            try { return original.trustBytes("/v1/trust/$path", input?.toString()?.toByteArray(Charsets.UTF_8), binary).body }
            catch (failure: CreatorAPIError) {
                val detail = runCatching { Json.parseToJsonElement(failure.body).jsonObject["error"]?.jsonObject }.getOrNull()
                throw IllegalStateException((detail?.get("message")?.jsonPrimitive?.content ?: "Reconnect and try again.") + (detail?.get("correlationId")?.jsonPrimitive?.content?.let { " Reference $it" } ?: ""))
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
                while (true) { currentCoroutineContext().ensureActive(); val count = stream.read(buffer); if (count < 0) break; if (bytes.size() + count > 1_048_576) throw IllegalStateException("The public help response exceeds the native limit."); bytes.write(buffer,0,count) }
                bytes.toByteArray()
            } ?: byteArrayOf()
            currentCoroutineContext().ensureActive()
            if (status !in 200..299) throw IllegalStateException("Reconnect to load public help.")
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
    fun suspendPrivateResults() {
        workEpoch++; busy = false
        pendingExport = null; confirmDelete = false; result = ""; error = ""
    }
    fun clearPrivateResults() {
        suspendPrivateResults()
        cases = emptyList(); notices = emptyList(); jobs = emptyList(); history = emptyList(); selectedJob = null
        local = false; verificationConfigured = false; verificationMethod = ""
    }
    fun beginWork(): Int { workEpoch++; busy = true; return workEpoch }
    fun finishWork(epoch: Int) { if (workEpoch == epoch) busy = false }
    fun launchPrivate(block: suspend () -> Unit) {
        if (!trustReady(model)) return
        operation?.cancel(); operation = coroutine.launch { block() }
    }
    suspend fun capture(): FanSessionRequestCapture {
        currentCoroutineContext().ensureActive()
        if (!trustReady(model)) throw CancellationException("Refresh your account before continuing.")
        val original = model.captureRequest(route, maximumResponseBytes = 32 * 1024 * 1024, timeoutMs = 15_000)
            ?: throw CancellationException("Your original account view changed.")
        if (!trustReady(model) || !original.isCurrent()) throw CancellationException("Your original account view changed.")
        return original
    }
    suspend fun capturedClient(): TrustClient = TrustClient(baseURL ?: throw IllegalStateException("The trust service is not configured."), capture())
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
                    val stream = context.contentResolver.openOutputStream(uri, "w") ?: throw IllegalStateException("Choose a writable export destination.")
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
                result = "Your export was saved to the destination you chose."
                error = ""
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) error = failure.message ?: "The export could not be saved." }
            finally {
                if (!saved && wroteDestination) {
                    val removed = runCatching { context.contentResolver.delete(uri, null, null) > 0 }.getOrDefault(false)
                    if (!removed && trustReady(model) && workEpoch == epoch) error = "The export was interrupted. Remove the incomplete file from the destination you chose."
                }
                finishWork(epoch)
            }
        } else pendingExport = null
    }
    // Public crisis help never waits on capability or account data: a restored or
    // degraded host can refuse those while help stays available. A failed capability
    // read clears the old value so data requests cannot submit on stale verification.
    suspend fun load() {
        if (client == null) { error = "The trust service is not configured."; return }
        val epoch = beginWork()
        var failure: Exception? = null
        try {
            try { val value = client.request("help"); currentCoroutineContext().ensureActive(); help = value }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (current: Exception) { failure = current }
            if (!trustReady(model)) return
            if (route.contains("privacy")) {
                try {
                    val capability = client.request("capabilities")
                    local = capability["localDevelopment"]?.jsonPrimitive?.booleanOrNull == true
                    verificationConfigured = capability.text("actorVerification") == "configured"
                    verificationMethod = capability.text("verificationMethod")
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (current: Exception) { local = false; verificationConfigured = false; verificationMethod = ""; failure = failure ?: current }
            }
            try {
                val client = capturedClient()
                if (route.startsWith("/trust") || route.contains("feedback")) { }
                else if (route.contains("access")) history = client.request("access-history").items()
                else if (route.contains("privacy")) {
                    pendingExport = null
                    jobs = client.request("privacy/jobs").items()
                    val selectedId = selectedJob?.text("id")
                    if (selectedId != null && jobs.any { it.text("id") == selectedId }) {
                        val detail = client.request("privacy/jobs/$selectedId")
                        selectedJob = detail
                        jobs = jobs.map { if (it.text("id") == selectedId) detail else it }
                    } else selectedJob = null
                }
                else { cases = client.request("my-cases").items(); notices = client.request("inbox").items() }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (current: Exception) { cases = emptyList(); notices = emptyList(); jobs = emptyList(); history = emptyList(); selectedJob = null; pendingExport = null; failure = failure ?: current }
            currentCoroutineContext().ensureActive()
            if (trustReady(model) && workEpoch == epoch) error = failure?.let { it.message ?: "Reconnect and try again." } ?: ""
        } finally { finishWork(epoch) }
    }
    suspend fun perform(path: String, input: JsonObject): JsonObject? {
        if (client == null || busy || !trustReady(model)) return null
        val epoch = beginWork()
        return try { val value = capturedClient().request(path, input); currentCoroutineContext().ensureActive(); if (!trustReady(model) || workEpoch != epoch) throw CancellationException("Your original account view changed."); error = ""; key = UUID.randomUUID().toString(); value }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) error = failure.message ?: "Reconnect and try again."; null }
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
        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) { selectedJob = null; error = failure.message ?: "Reconnect and try again." } }
        finally { finishWork(epoch) }
    }
    suspend fun privacyCommand(action: String) {
        val input = buildJsonObject { put("kind", action); put("scope", scope); put("proof", if (verificationMethod == "current_session") "CURRENT_SESSION" else proof); put("idempotencyKey", key); if (scope != "account") put("creatorId", creatorId.lowercase()); if (scope == "thread") put("threadId", threadId.lowercase()) }
        perform("privacy/jobs", input)?.let { result = "Request saved; inspect each domain's progress."; load(); jobDetail(it.text("id")) }
    }
    LaunchedEffect(route, privateReady, model.error) {
        operation?.cancel()
        if (loadedRoute != route || model.error.isNotEmpty()) clearPrivateResults() else if (!privateReady) suspendPrivateResults()
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
        TrustText(if (route.contains("privacy")) "Your data" else if (route.contains("access")) "Case access history" else if (route.contains("feedback")) "Optional product feedback" else if (route.startsWith("/trust")) "Crisis help protocol" else "Help and reports", "display-md")
        TrustText("Reports are available without paid access. Evidence is limited to what you report.")
        Row { Button("Support", ButtonVariant.QUIET) { navigate("/support") }; Button("Your data", ButtonVariant.QUIET) { navigate("/support/privacy") } }
        Row { Button("Access history", ButtonVariant.QUIET) { navigate("/support/access") }; Button("Feedback", ButtonVariant.QUIET) { navigate("/support/feedback") } }
        Button("Crisis help", ButtonVariant.QUIET) { navigate("/trust/crisis") }
        if (busy) TrustText("Loading…")
        if (error.isNotEmpty()) Notice("error", "Could not complete", error)
        if (privateVisible && result.isNotEmpty()) Notice(title = "Saved", children = result)
        if (!privateVisible && !route.startsWith("/trust")) Notice(title = "Account unavailable", children = "Refresh your account before continuing. Unsaved input stays in this account view.")
        if (route.startsWith("/trust")) {
            TrustCrisisHelp(context,help)
        } else if (route.contains("access")) {
            TrustText("These records show when an authorized operations account opened your case evidence and its purpose. Opening a case does not mean someone read every word.")
            if (privateVisible && history.isEmpty() && !busy) TrustText("No case accesses yet.","caption")
            history.takeIf { privateVisible }.orEmpty().forEach { item -> TrustText(item.text("action").replace('_',' ') + " · " + item.text("created_at"),"caption"); TrustText(item.text("purpose")) }
        } else if (route.contains("feedback")) {
            TrustText("Your answers help evaluate usefulness and clear authorship. They do not affect access, ranking or payment. Feedback is retained for 90 days and included in account deletion.")
            TrustText("Was the conversation useful?" + (useful?.let { if(it) " Yes" else " No" } ?: " Choose an answer"),"label")
            Row { Button("Yes",ButtonVariant.QUIET) { useful=true }; Button("No",ButtonVariant.QUIET) { useful=false } }
            TrustText("Was it clear who wrote each message?" + (authorship?.let { if(it) " Yes" else " No" } ?: " Choose an answer"),"label")
            Row { Button("Yes",ButtonVariant.QUIET) { authorship=true }; Button("No",ButtonVariant.QUIET) { authorship=false } }
            TrustField("Anything to improve? (optional)",feedbackComment,true) { feedbackComment=it }
            Box(Modifier.semantics { role=Role.Checkbox; stateDescription=if(feedbackConsent) "Agreed" else "Not agreed" }) { Button(if(feedbackConsent) "Agreed to share feedback" else "I agree to share these answers for product feedback",ButtonVariant.QUIET,block=true) { feedbackConsent=!feedbackConsent } }
            Button("Send feedback",ButtonVariant.SECONDARY,block=true,disabled=busy || !privateReady || !feedbackConsent || useful==null || authorship==null) { launchPrivate {
                if (perform("feedback",buildJsonObject { put("consent",true); put("cohort","unspecified"); put("useful",useful==true); put("authorshipClear",authorship==true); put("comment",feedbackComment) }) != null) { result="Your feedback is saved."; feedbackConsent=false; feedbackComment="" }
            } }
        } else if (route.contains("privacy")) {
            TrustText("Export and deletion are separate from canceling store billing. A job finishes only after every data domain acknowledges it.")
            Button("Manage Google Play subscriptions", ButtonVariant.SECONDARY, block = true) { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://play.google.com/store/account/subscriptions"))) }
            Row { listOf("account", "creator", "thread").forEach { value -> Button(value, ButtonVariant.QUIET) { scope = value } } }
            TrustText("Data scope: $scope", "label")
            if (scope != "account") TrustField("Creator ID", creatorId) { creatorId = it }
            if (scope == "thread") TrustField("Conversation ID", threadId) { threadId = it }
            if (local) { TrustText("Synthetic local account: type LOCAL DEVELOPMENT to confirm.", "caption"); TrustField("Local confirmation", proof) { proof = it } }
            else if (verificationMethod == "current_session") TrustText("Your sign-in must be recent. Continue with Pantopus again if asked to verify your account.", "caption")
            else if (verificationConfigured) TrustField("Account verification receipt", proof) { proof = it }
            else TrustText("Fresh account verification must be connected before requesting data changes.", "caption")
            val disabled = busy || !privateReady || !verificationConfigured || (if (local) proof != "LOCAL DEVELOPMENT" else verificationMethod != "current_session" && proof.isEmpty()) || (scope != "account" && !validTrustId(creatorId)) || (scope == "thread" && !validTrustId(threadId))
            Button("Request export", ButtonVariant.SECONDARY, block = true, disabled = disabled) { launchPrivate { privacyCommand("export") } }
            Button("Request deletion", ButtonVariant.SECONDARY, block = true, disabled = disabled) { confirmDelete = true }
            jobs.takeIf { privateVisible }.orEmpty().forEach { job -> key(job.text("id")) {
                TrustText("Requested " + job.text("created_at"), "caption")
                val label = job.text("kind") + ", " + job.text("scope") + ", " + job.text("state").replace('_', ' ') + ", requested " + job.text("created_at") + ", job " + job.text("id")
                Button(job.text("kind") + " · " + job.text("scope") + " · " + job.text("state").replace('_', ' '), ButtonVariant.QUIET, block = true, disabled = busy || !privateReady, modifier = Modifier.semantics { contentDescription = label }) { launchPrivate { jobDetail(job.text("id")) } }
            } }
            selectedJob?.takeIf { privateVisible }?.let { job ->
                TrustText("Job " + job.text("id"), "caption")
                job["tasks"]?.jsonArray?.forEach { item -> val task = item.jsonObject; TrustText(task.text("domain") + ": " + task.text("state").replace('_', ' ') + task.text("error_code").takeIf { it.isNotEmpty() }?.let { " · " + it.replace('_', ' ') }.orEmpty()) }
                job["retained"]?.jsonArray?.forEach { item -> val retained = item.jsonObject; TrustText("Retained: " + retained.text("category").replace('_',' '),"label"); TrustText(retained.text("reason")); retained.text("until").takeIf { it.isNotEmpty() }?.let { TrustText("Until $it","caption") } }
                if (job.text("state") != "complete") Button("Retry incomplete domains", ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { launchPrivate { if (perform("privacy/jobs/" + job.text("id") + "/retry", buildJsonObject {}) != null) { result = "Incomplete domains queued again."; jobDetail(job.text("id")) } } }
                if (job.text("state") == "complete" && job.text("kind") == "export") Button("Save export", ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { launchPrivate {
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
                        catch (failure: Exception) { if (trustReady(model) && workEpoch == epoch) { pendingExport = null; error = failure.message ?: "Reconnect and retry your export." } }
                        finally { finishWork(epoch) }
                    }
                } }
            }
        } else {
            listOf("support", "ai_report", "abuse", "block", "crisis").chunked(2).forEach { choices -> Row { choices.forEach { value -> Button(value.replace('_', ' '), ButtonVariant.QUIET) { kind = value } } } }
            TrustText("Report type: " + kind.replace('_', ' '), "label")
            if (kind == "ai_report" || kind == "abuse" || kind == "block") TrustField("Creator ID", creatorId) { creatorId = it }
            if (kind == "ai_report") TrustField("AI message ID", messageId) { messageId = it }
            if (kind == "support") TrustField("Request ID (optional)", requestId) { requestId = it }
            if (kind == "crisis") TrustCrisisHelp(context,help)
            TrustField("What happened?", reason, true) { reason = it }
            Button(if(kind=="block") "Block creator" else "Send report", ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady || reason.trim().length < 12 || (kind=="support" && requestId.isNotEmpty() && !validTrustId(requestId)) || (kind=="block" && !validTrustId(creatorId)) || (kind=="ai_report" && (!validTrustId(creatorId) || !validTrustId(messageId)))) { launchPrivate {
                if(kind=="block") {
                    if(perform("blocks",buildJsonObject { put("creatorId",creatorId.lowercase()); put("reason",reason); put("idempotencyKey",key) }) != null) { result="Your block is saved. Enforcement in connected domains follows their current denial checks."; reason=""; load() }
                    return@launchPrivate
                }
                val input = buildJsonObject { put("kind", kind); put("reason", reason); put("idempotencyKey", key); if (kind!="support" && creatorId.isNotEmpty()) put("creatorId", creatorId.lowercase()); if (kind == "ai_report") put("messageId", messageId.lowercase()); if (kind == "support" && requestId.isNotEmpty()) put("requestId",requestId.lowercase()) }
                perform("reports", input)?.let { result = "CASE-" + it.text("number") + " is saved. No provider action is implied."; reason = ""; load() }
            } }
            TrustText("Your cases", "title")
            cases.takeIf { privateVisible }.orEmpty().forEach { item ->
                TrustText("CASE-" + item.text("number") + " · " + item.text("kind").replace('_', ' ') + " · " + item.text("state"), "body-strong")
                if (item.text("state") == "resolved") Button("Appeal CASE-" + item.text("number"), ButtonVariant.SECONDARY, disabled = busy || !privateReady || reason.trim().length < 12) { launchPrivate {
                    if (perform("cases/" + item.text("id") + "/appeals", buildJsonObject { put("version", item["version"]!!); put("reason", reason); put("idempotencyKey", key) }) != null) { result = "Your appeal is saved for a different reviewer."; reason = ""; load() }
                } }
            }
            TrustText("Trust inbox", "title")
            notices.takeIf { privateVisible }.orEmpty().forEach { item -> TrustText(item.text("type").replace('_', ' '), "label"); TrustText(item.text("reason")) }
        }
        Button("Refresh", ButtonVariant.SECONDARY, block = true, disabled = busy || model.checkingSession || model.busy) { refreshOperation?.cancel(); refreshOperation = coroutine.launch { model.refresh() } }
    }
    if (confirmDelete && privateReady) Dialog(onDismissRequest = { confirmDelete = false }) {
        Column(Modifier.background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TrustText("Delete this data scope?", "title")
            TrustText("Access closes immediately. Purging waits for every domain. Store subscriptions must be canceled separately.")
            Button("Request deletion", ButtonVariant.SECONDARY, block = true, disabled = busy || !privateReady) { confirmDelete = false; launchPrivate { privacyCommand("delete") } }
            Button("Keep data", ButtonVariant.QUIET, block = true) { confirmDelete = false }
        }
    }
}
private fun JsonObject.text(key: String): String = get(key)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content.orEmpty()
private fun JsonObject.items(): List<JsonObject> = get("items")?.jsonArray?.map { it.jsonObject }.orEmpty()
private fun validTrustId(value: String) = runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)
@Composable private fun TrustCrisisHelp(context: Context,help: JsonObject?) {
    TrustText(help?.text("emergencyMessage")?.takeIf { it.isNotEmpty() } ?: "If you are in immediate danger, contact local emergency services. An AI cannot provide emergency help.","body-strong")
    TrustText("Reports do not require paid access. Urgent cases need a staffed safety responder. This service does not claim continuous emergency monitoring or a guaranteed response time.")
    val resources=help?.get("resources")?.jsonArray.orEmpty()
    if(help!=null && resources.isEmpty()) TrustText("Regional help resources are not configured in this environment.","caption")
    resources.forEach { item -> val resource=item.jsonObject; val uri=android.net.Uri.parse(resource.text("url")); if(uri.scheme=="https") Button(resource.text("name") + " · " + resource.text("region"),ButtonVariant.QUIET,block=true) { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW,uri)) }; resource.text("phone").takeIf { it.isNotEmpty() }?.let { TrustText(it) } }
}
@Composable private fun TrustText(text: String, style: String = "body") { BasicText(text, style = qText(style).copy(color = qColor("ink"))) }
@Composable private fun TrustField(label: String, value: String, multiline: Boolean = false, changed: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { TrustText(label, "label"); BasicTextField(value, { changed(it.take(if (multiline) 2000 else 2048)) }, Modifier.fillMaxWidth().heightIn(min = if (multiline) 96.dp else 48.dp).background(qColor("surface")).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink")), singleLine = !multiline) }
}
