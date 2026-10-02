package com.pantopus.qelvora.ui

import android.content.Context
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
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.SecureSessionStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Uses W1's canonical secure storage. No additional identity or token persistence. */
class TrustClient(private val baseURL: String, private val token: () -> String?) {
    suspend fun request(path: String, input: JsonObject? = null): JsonObject = withContext(Dispatchers.IO) {
        val connection = URL(baseURL.trimEnd('/') + "/v1/trust/" + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = if (input == null) "GET" else "POST"
            connection.setRequestProperty("X-Correlation-Id", UUID.randomUUID().toString())
            connection.connectTimeout = 5000; connection.readTimeout = 15000; connection.useCaches = false
            connection.setRequestProperty("Content-Type", "application/json")
            // Public help must remain reachable when secure account storage is unavailable.
            val needsAccount = input != null || path !in setOf("capabilities", "help", "status")
            if (needsAccount) token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (input != null) { connection.doOutput = true; connection.outputStream.use { it.write(input.toString().toByteArray(Charsets.UTF_8)) } }
            val status = connection.responseCode
            val data = (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { stream ->
                val bytes = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val count = stream.read(buffer); if (count < 0) break; if (bytes.size() + count > 32 * 1024 * 1024) throw IllegalStateException("This response exceeds the native download limit. Open Your data on the web."); bytes.write(buffer,0,count) }
                bytes.toString(Charsets.UTF_8.name())
            }.orEmpty()
            val result = runCatching { Json.parseToJsonElement(data).jsonObject }.getOrElse { throw IllegalStateException("The trust service returned an unreadable response. Reconnect and retry.") }
            if (status !in 200..299) {
                val detail = result["error"]?.jsonObject
                throw IllegalStateException((detail?.get("message")?.jsonPrimitive?.content ?: "Reconnect and try again.") + (detail?.get("correlationId")?.jsonPrimitive?.content?.let { " Reference $it" } ?: ""))
            }
            result
        } finally { connection.disconnect() }
    }
}

fun trustFanRegistration(context: Context, baseURL: String?) = FanFeatureRegistration(
    matches = { it.startsWith("/support") || it.startsWith("/trust") },
    allowsSignedOut = { it.startsWith("/trust") },
    screen = { model ->
        val account = model.session?.accountId
        key(account) { TrustFanFeature(context, baseURL, model.destination) {
            val credential = model.currentToken()
            check(account != null && model.session?.accountId == account) { "Your account changed. Reopen this screen before continuing." }
            credential
        } }
    }
)

/** Missing phone composition is recorded; use established tokens and controls at 16dp gutters. */
@Composable
fun TrustFanFeature(context: Context, baseURL: String?, destination: String = "/support", token: () -> String? = { SecureSessionStorage(context, baseURL).read() }) {
    val client = remember(baseURL) { baseURL?.let { TrustClient(it, token) } }
    val coroutine = rememberCoroutineScope()
    var route by remember { mutableStateOf(destination) }
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
    val entry = remember(destination) { android.net.Uri.parse(destination) }
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
    var pendingExport by remember { mutableStateOf<ByteArray?>(null) }
    var history by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var help by remember { mutableStateOf<JsonObject?>(null) }
    var useful by remember { mutableStateOf<Boolean?>(null) }
    var authorship by remember { mutableStateOf<Boolean?>(null) }
    var feedbackConsent by remember { mutableStateOf(false) }
    var feedbackComment by remember { mutableStateOf("") }
    val saveExport = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val payload = pendingExport
        if (uri != null && payload != null) coroutine.launch {
            busy = true
            try {
                withContext(Dispatchers.IO) {
                    val stream = context.contentResolver.openOutputStream(uri, "w") ?: throw IllegalStateException("Choose a writable export destination.")
                    stream.use { it.write(payload) }
                }
                result = "Your export was saved to the destination you chose."
                error = ""
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { error = failure.message ?: "The export could not be saved." }
            finally { pendingExport = null; busy = false }
        } else pendingExport = null
    }
    // Public crisis help never waits on capability or account data: a restored or
    // degraded host can refuse those while help stays available. A failed capability
    // read clears the old value so data requests cannot submit on stale verification.
    suspend fun load() {
        if (client == null) { error = "The trust service is not configured."; return }
        busy = true
        var failure: Exception? = null
        try {
            try { help = client.request("help") }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (current: Exception) { failure = current }
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
            error = failure?.let { it.message ?: "Reconnect and try again." } ?: ""
        } finally { busy = false }
    }
    suspend fun perform(path: String, input: JsonObject): JsonObject? {
        if (client == null || busy) return null
        busy = true
        return try { client.request(path, input).also { error = ""; key = UUID.randomUUID().toString() } }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = failure.message ?: "Reconnect and try again."; null }
        finally { busy = false }
    }
    suspend fun jobDetail(id: String) {
        if (client == null || busy) return
        busy = true
        pendingExport = null
        try {
            val detail = client.request("privacy/jobs/$id")
            selectedJob = detail
            jobs = jobs.map { if (it.text("id") == id) detail else it }
            error = ""
        }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { selectedJob = null; error = failure.message ?: "Reconnect and try again." }
        finally { busy = false }
    }
    suspend fun privacyCommand(action: String) {
        val input = buildJsonObject { put("kind", action); put("scope", scope); put("proof", if (verificationMethod == "current_session") "CURRENT_SESSION" else proof); put("idempotencyKey", key); if (scope != "account") put("creatorId", creatorId.lowercase()); if (scope == "thread") put("threadId", threadId.lowercase()) }
        perform("privacy/jobs", input)?.let { result = "Request saved; inspect each domain's progress."; load(); jobDetail(it.text("id")) }
    }
    LaunchedEffect(route) { load() }
    LaunchedEffect(kind,reason,creatorId,messageId,requestId,threadId,scope,proof) { key=UUID.randomUUID().toString() }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TrustText(if (route.contains("privacy")) "Your data" else if (route.contains("access")) "Case access history" else if (route.contains("feedback")) "Optional product feedback" else if (route.startsWith("/trust")) "Crisis help protocol" else "Help and reports", "display-md")
        TrustText("Reports are available without paid access. Evidence is limited to what you report.")
        Row { Button("Support", ButtonVariant.QUIET) { route = "/support" }; Button("Your data", ButtonVariant.QUIET) { route = "/support/privacy" } }
        Row { Button("Access history", ButtonVariant.QUIET) { route = "/support/access" }; Button("Feedback", ButtonVariant.QUIET) { route = "/support/feedback" } }
        Button("Crisis help", ButtonVariant.QUIET) { route = "/trust/crisis" }
        if (busy) TrustText("Loading…")
        if (error.isNotEmpty()) Notice("error", "Could not complete", error)
        if (result.isNotEmpty()) Notice(title = "Saved", children = result)
        if (route.startsWith("/trust")) {
            TrustCrisisHelp(context,help)
        } else if (route.contains("access")) {
            TrustText("These records show when an authorized operations account opened your case evidence and its purpose. Opening a case does not mean someone read every word.")
            if (history.isEmpty() && !busy) TrustText("No case accesses yet.","caption")
            history.forEach { item -> TrustText(item.text("action").replace('_',' ') + " · " + item.text("created_at"),"caption"); TrustText(item.text("purpose")) }
        } else if (route.contains("feedback")) {
            TrustText("Your answers help evaluate usefulness and clear authorship. They do not affect access, ranking or payment. Feedback is retained for 90 days and included in account deletion.")
            TrustText("Was the conversation useful?" + (useful?.let { if(it) " Yes" else " No" } ?: " Choose an answer"),"label")
            Row { Button("Yes",ButtonVariant.QUIET) { useful=true }; Button("No",ButtonVariant.QUIET) { useful=false } }
            TrustText("Was it clear who wrote each message?" + (authorship?.let { if(it) " Yes" else " No" } ?: " Choose an answer"),"label")
            Row { Button("Yes",ButtonVariant.QUIET) { authorship=true }; Button("No",ButtonVariant.QUIET) { authorship=false } }
            TrustField("Anything to improve? (optional)",feedbackComment,true) { feedbackComment=it }
            Box(Modifier.semantics { role=Role.Checkbox; stateDescription=if(feedbackConsent) "Agreed" else "Not agreed" }) { Button(if(feedbackConsent) "Agreed to share feedback" else "I agree to share these answers for product feedback",ButtonVariant.QUIET,block=true) { feedbackConsent=!feedbackConsent } }
            Button("Send feedback",ButtonVariant.SECONDARY,block=true,disabled=busy || !feedbackConsent || useful==null || authorship==null) { coroutine.launch {
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
            val disabled = busy || !verificationConfigured || (if (local) proof != "LOCAL DEVELOPMENT" else verificationMethod != "current_session" && proof.isEmpty()) || (scope != "account" && !validTrustId(creatorId)) || (scope == "thread" && !validTrustId(threadId))
            Button("Request export", ButtonVariant.SECONDARY, block = true, disabled = disabled) { coroutine.launch { privacyCommand("export") } }
            Button("Request deletion", ButtonVariant.SECONDARY, block = true, disabled = disabled) { confirmDelete = true }
            jobs.forEach { job -> Button(job.text("kind") + " · " + job.text("scope") + " · " + job.text("state").replace('_', ' '), ButtonVariant.QUIET, block = true, disabled = busy) { coroutine.launch { jobDetail(job.text("id")) } } }
            selectedJob?.let { job ->
                TrustText("Job " + job.text("id"), "caption")
                job["tasks"]?.jsonArray?.forEach { item -> val task = item.jsonObject; TrustText(task.text("domain") + ": " + task.text("state").replace('_', ' ') + task.text("error_code").takeIf { it.isNotEmpty() }?.let { " · " + it.replace('_', ' ') }.orEmpty()) }
                job["retained"]?.jsonArray?.forEach { item -> val retained = item.jsonObject; TrustText("Retained: " + retained.text("category").replace('_',' '),"label"); TrustText(retained.text("reason")); retained.text("until").takeIf { it.isNotEmpty() }?.let { TrustText("Until $it","caption") } }
                if (job.text("state") != "complete") Button("Retry incomplete domains", ButtonVariant.SECONDARY, block = true, disabled = busy) { coroutine.launch { if (perform("privacy/jobs/" + job.text("id") + "/retry", buildJsonObject {}) != null) { result = "Incomplete domains queued again."; jobDetail(job.text("id")) } } }
                if (job.text("state") == "complete" && job.text("kind") == "export") Button("Save export", ButtonVariant.SECONDARY, block = true, disabled = busy) { coroutine.launch {
                    if (client != null) {
                        busy = true
                        try {
                            val payload = withContext(Dispatchers.IO) { client.request("privacy/jobs/" + job.text("id") + "/download").toString().toByteArray(Charsets.UTF_8) }
                            if (payload.size > 32 * 1024 * 1024) throw IllegalStateException("This export exceeds the native download limit. Open Your data on the web.")
                            pendingExport = payload
                            saveExport.launch("creator-data.json")
                            error = ""
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (failure: Exception) { pendingExport = null; error = failure.message ?: "Reconnect and retry your export." }
                        finally { busy = false }
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
            Button(if(kind=="block") "Block creator" else "Send report", ButtonVariant.SECONDARY, block = true, disabled = busy || reason.trim().length < 12 || (kind=="support" && requestId.isNotEmpty() && !validTrustId(requestId)) || (kind=="block" && !validTrustId(creatorId)) || (kind=="ai_report" && (!validTrustId(creatorId) || !validTrustId(messageId)))) { coroutine.launch {
                if(kind=="block") {
                    if(perform("blocks",buildJsonObject { put("creatorId",creatorId.lowercase()); put("reason",reason); put("idempotencyKey",key) }) != null) { result="Your block is saved. Enforcement in connected domains follows their current denial checks."; reason=""; load() }
                    return@launch
                }
                val input = buildJsonObject { put("kind", kind); put("reason", reason); put("idempotencyKey", key); if (kind!="support" && creatorId.isNotEmpty()) put("creatorId", creatorId.lowercase()); if (kind == "ai_report") put("messageId", messageId.lowercase()); if (kind == "support" && requestId.isNotEmpty()) put("requestId",requestId.lowercase()) }
                perform("reports", input)?.let { result = "CASE-" + it.text("number") + " is saved. No provider action is implied."; reason = ""; load() }
            } }
            TrustText("Your cases", "title")
            cases.forEach { item ->
                TrustText("CASE-" + item.text("number") + " · " + item.text("kind").replace('_', ' ') + " · " + item.text("state"), "body-strong")
                if (item.text("state") == "resolved") Button("Appeal CASE-" + item.text("number"), ButtonVariant.SECONDARY, disabled = busy || reason.trim().length < 12) { coroutine.launch {
                    if (perform("cases/" + item.text("id") + "/appeals", buildJsonObject { put("version", item["version"]!!); put("reason", reason); put("idempotencyKey", key) }) != null) { result = "Your appeal is saved for a different reviewer."; reason = ""; load() }
                } }
            }
            TrustText("Trust inbox", "title")
            notices.forEach { item -> TrustText(item.text("type").replace('_', ' '), "label"); TrustText(item.text("reason")) }
        }
        Button("Refresh", ButtonVariant.SECONDARY, block = true, disabled = busy) { coroutine.launch { load() } }
    }
    if (confirmDelete) Dialog(onDismissRequest = { confirmDelete = false }) {
        Column(Modifier.background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TrustText("Delete this data scope?", "title")
            TrustText("Access closes immediately. Purging waits for every domain. Store subscriptions must be canceled separately.")
            Button("Request deletion", ButtonVariant.SECONDARY, block = true) { confirmDelete = false; coroutine.launch { privacyCommand("delete") } }
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
