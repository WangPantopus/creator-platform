package com.pantopus.qelvora.content

import android.content.Context
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.SecureSessionStorage
import com.pantopus.qelvora.ui.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*

private class ContentFailure(val status:Int,message:String,val code:String?=null):Exception(message) {
    val accountChanged get()=code in listOf("content_account_changed","session_account_changed","session_changed")
    val authorityDenied get()=status in listOf(401,403) || accountChanged
}
private class ContentClient(context: Context, private val baseURL: String) {
    private val storage = SecureSessionStorage(context)
    suspend fun request(path: String, body: JsonObject? = null, expectedAccountId:String? = null): JsonElement = withContext(Dispatchers.IO) {
        val token = storage.read() ?: throw ContentFailure(401,"Your session ended. Continue with Pantopus again.")
        val connection = URL(baseURL.trimEnd('/') + "/v1/content/" + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 10000; connection.readTimeout = 15000; connection.useCaches = false
            connection.requestMethod = if (body == null) "GET" else "POST"
            expectedAccountId?.let{connection.setRequestProperty("x-qelvora-expected-account",it)}
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            val status = connection.responseCode
            val data = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val value = Json.parseToJsonElement(data)
            if (status !in 200..299) {
                val failure=value.jsonObject["error"]?.jsonObject
                throw ContentFailure(status,failure?.get("message")?.jsonPrimitive?.content ?: "Content is unavailable. Refresh current access.",failure?.get("code")?.jsonPrimitive?.contentOrNull)
            }
            value
        } finally { connection.disconnect() }
    }
}
private fun JsonObject.text(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.flag(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: false
private fun JsonObject.number(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: 0

@Composable
private fun QText(text: String, token: String, modifier: Modifier = Modifier) {
    BasicText(text, modifier, qText(token).copy(color = qColor("ink")))
}

object ContentFanFeature {
    private fun matches(destination: String): Boolean { val parts = destination.split('/').filter { it.isNotEmpty() }; return parts.size == 3 && parts[0] == "content" && parts.drop(1).all { runCatching { UUID.fromString(it) }.isSuccess } }
    fun registration(context: Context, baseURL: String?) = FanFeatureRegistration(matches = ::matches, screen = { model -> ContentScreen(context, baseURL, model) })
}

@Composable
private fun ContentChoice(label: String, checked: Boolean, disabled: Boolean, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).toggleable(value=checked,enabled=!disabled,role=Role.Checkbox,onValueChange=change).semantics { contentDescription = label + if (checked) ", selected" else ", not selected" }.padding(vertical = 8.dp)) { QText(if (checked) "☑ " else "☐ ", "body"); QText(label, "body") }
}
@Composable
private fun ContentInput(label: String, value: String, max: Int, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { QText(label, "caption"); BasicTextField(value, { change(it.take(max)) }, Modifier.fillMaxWidth().heightIn(min = 64.dp).background(qColor("surface")).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink"))) }
}

@Composable
private fun ContentScreen(context: Context, baseURL: String?, model: FanSession) {
    val parts = model.destination.split('/').filter { it.isNotEmpty() }; val creatorId = parts[1]; val contentId = parts[2]
    key(creatorId, contentId) { ContentObjectScreen(context, baseURL, model, creatorId, contentId) }
}

@Composable
private fun ContentObjectScreen(context: Context, baseURL: String?, model: FanSession, creatorId: String, contentId: String) {
    val client = remember(baseURL) { baseURL?.let { ContentClient(context, it) } }; val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var content by remember { mutableStateOf<JsonObject?>(null) }; var replies by remember { mutableStateOf<List<JsonObject>>(emptyList()) }; var cursor by remember { mutableStateOf<String?>(null) }
    var replyText by remember { mutableStateOf("") }; var thanks by remember { mutableStateOf<JsonObject?>(null) }; var thanksText by remember { mutableStateOf("") }
    var share by remember { mutableStateOf(false) }; var identity by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf("") }
    var signature by remember { mutableStateOf<String?>(null) }; var signatureStatus by remember { mutableStateOf("") }
    var viewerAccountId by remember{mutableStateOf<String?>(null)};var loadGeneration by remember{mutableIntStateOf(0)}
    var currentAccess by remember { mutableStateOf(false) }
    var replyAccess by remember { mutableStateOf(false) }
    var thanksAccess by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var checkedAt by remember { mutableLongStateOf(0L) }
    var replyDepth by remember { mutableIntStateOf(1) }
    val retryKeys=remember { mutableMapOf<String,String>() }
    fun suspendAccess() { currentAccess = false; replyAccess = false; thanksAccess = false; signature = null; signatureStatus = "" }
    fun clearAuthority() {
        suspendAccess(); content = null; replies = emptyList(); thanks = null; cursor = null
        viewerAccountId = null; replyText = ""; thanksText = ""; share = false; identity = false; retryKeys.clear()
    }
    suspend fun load(resetThanks:Boolean=true) {
        if (loading) return; loading = true
        val cycleStartedAt = SystemClock.elapsedRealtime()
        loadGeneration++;val generation=loadGeneration
        try {
            val api=client?:error("The content service is not connected.")
            val before=api.request("$creatorId/mute").jsonObject
            val statuses=mutableListOf<String>()
            val view=try{api.request("$creatorId/$contentId", expectedAccountId=before.text("accountId")).jsonObject}catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && (failure.status==401 || failure.accountChanged))throw failure
                statuses.add(failure.message?:"Reconnect to refresh content. Your input is kept.");null
            }
            val depth=if(before.text("accountId")==viewerAccountId)replyDepth else 1
            var page:JsonObject?=null;var currentReplies:List<JsonObject> = emptyList();var repliesAvailable=false
            try {
                var fresh=api.request("$creatorId/replies", expectedAccountId=before.text("accountId")).jsonObject
                val items=fresh["items"]!!.jsonArray.map{it.jsonObject}.toMutableList()
                for(n in 1 until depth){
                    val next=fresh["nextCursor"]?.jsonPrimitive?.contentOrNull?:break
                    fresh=api.request("$creatorId/replies?cursor=$next", expectedAccountId=before.text("accountId")).jsonObject
                    items.addAll(fresh["items"]!!.jsonArray.map{it.jsonObject})
                }
                page=fresh;currentReplies=items;repliesAvailable=true
            }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && failure.authorityDenied)throw failure
                statuses.add("Private replies are unavailable. Refresh to try again.")
            }
            var mine:JsonObject?=null;var thanksAvailable=false
            try {
                val saved=api.request("$creatorId/thanks?targetKind=content&targetId=$contentId", expectedAccountId=before.text("accountId"))
                mine=if(saved is JsonNull)null else saved.jsonObject;thanksAvailable=true
            }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && failure.authorityDenied)throw failure
                statuses.add("Thanks is unavailable. Your input is kept; refresh before saving.")
            }
            val after=api.request("$creatorId/mute", expectedAccountId=before.text("accountId")).jsonObject
            if(generation!=loadGeneration)return
            if(before.text("accountId")!=after.text("accountId")){clearAuthority();error="The signed-in account changed. Refresh before continuing.";return}
            val changed=viewerAccountId!=before.text("accountId")
            if(changed){replyText="";thanksText="";share=false;identity=false;retryKeys.clear();signature=null;replyDepth=1}
            viewerAccountId=before.text("accountId");content=view;replies=currentReplies;cursor=page?.get("nextCursor")?.jsonPrimitive?.contentOrNull;thanks=mine;replyAccess=repliesAvailable;thanksAccess=thanksAvailable
            if(thanksAvailable && (resetThanks||changed)){thanksText=mine?.text("text").orEmpty();share=mine?.flag("shareWithCreatorDigest")?:false;identity=mine?.flag("showIdentity")?:false}
            error=statuses.joinToString("\n")
            checkedAt = cycleStartedAt; currentAccess = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && SystemClock.elapsedRealtime() - cycleStartedAt < 5000
        }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
            if(generation!=loadGeneration)return
            suspendAccess()
            content=null;replies=emptyList();thanks=null;cursor=null
            if(failure is ContentFailure && failure.authorityDenied){clearAuthority()}
            error=failure.message?:"Reconnect to refresh current access. Your input is kept."
        } finally { loading = false }
    }
    suspend fun mutate(path: String, body: JsonObject, resetThanks: Boolean = false, clearReply: Boolean = false) {
        if (busy || !currentAccess || viewerAccountId==null) return
        if ((path=="thanks" && !thanksAccess) || (path=="$contentId/replies" && !replyAccess)) return
        busy = true
        val fields=body.toMutableMap();fields.remove("idempotencyKey")
        val fingerprint=path+JsonObject(fields.toSortedMap()).toString()
        val command=if(body["idempotencyKey"]==null)body else JsonObject(fields+ ("idempotencyKey" to JsonPrimitive(retryKeys.getOrPut(fingerprint){UUID.randomUUID().toString()})))
        try { client?.request("$creatorId/$path", command, expectedAccountId=viewerAccountId) ?: error("The content service is not connected."); retryKeys.remove(fingerprint); if (clearReply) replyText = ""; load(resetThanks) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { if(failure is ContentFailure && failure.status in 400..499)retryKeys.remove(fingerprint); if(failure is ContentFailure && failure.authorityDenied)clearAuthority(); error = failure.message ?: "This action could not complete. Your input is kept." }
        finally { busy = false }
    }
    LaunchedEffect(client, contentId) {
        var refreshStarted = SystemClock.elapsedRealtime()
        load()
        while (true) {
            // Schedule from the read's start so network time does not consume
            // the next refresh window and repeatedly unmount a focused editor.
            delay((2000 - (SystemClock.elapsedRealtime() - refreshStarted)).coerceAtLeast(250))
            refreshStarted = SystemClock.elapsedRealtime()
            if (!busy) load(false)
        }
    }
    LaunchedEffect(client, contentId) { while (true) { delay(500); if (SystemClock.elapsedRealtime() - checkedAt >= 5000) suspendAccess() } }
    DisposableEffect(lifecycle, client, contentId) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) scope.launch { load(false) }
            else if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) suspendAccess()
        }
        lifecycle.addObserver(observer)
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) suspendAccess()
        onDispose { lifecycle.removeObserver(observer); loadGeneration++; suspendAccess() }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (error.isNotEmpty()) Notice("error", "Content status", error)
        if (!currentAccess) {
            QText("Checking current access. Your input is kept during a connection interruption.", "body")
            Button("Check current access", ButtonVariant.SECONDARY, disabled=busy) { scope.launch { load(false) } }
        } else {
        val current = content
        if (current == null) {
            QText("Content unavailable", "display-md");Button("Refresh",ButtonVariant.SECONDARY,disabled=busy){scope.launch{load()}}
            replies.filter{it.text("contentId")==contentId}.forEach{reply->key(reply.text("id")){
                QText(reply.text("text"),"body");val consent=reply["consent"]!!.jsonObject
                if(consent.flag("shareText")||consent.flag("showHandle"))Button("Withdraw quote permission",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/consent",buildJsonObject{put("version",consent.number("version"));put("shareText",false);put("showHandle",false);put("idempotencyKey",UUID.randomUUID().toString())})}}
                Button("Withdraw private reply",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/withdraw",buildJsonObject{put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString())})}}
            }}
            if (cursor != null) Button("Older replies", ButtonVariant.SECONDARY, disabled = busy || replyDepth >= 5) { scope.launch { if (!busy && replyDepth < 5) { busy = true; try { replyDepth++; load(false) } finally { busy = false } } } }
            if(thanks!=null && thanks?.flag("withdrawn")==false)Button("Withdraw Thanks",ButtonVariant.QUIET,disabled=busy || !thanksAccess){scope.launch{mutate("thanks",buildJsonObject{put("targetKind","content");put("targetId",contentId);put("text","");put("shareWithCreatorDigest",false);put("showIdentity",false);put("withdrawn",true);put("expectedVersion",thanks?.number("version")?:0);put("idempotencyKey",UUID.randomUUID().toString())},resetThanks=true)}}
            Button("Unmute Notes from this creator",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("mute",buildJsonObject{put("muted",false)})}}
        }
        else {
            val document = current["document"]!!.jsonObject; val creator = current.text("creatorName")
            if (document.text("kind") == "note") Note(current.text("displayText"), name = creator, audience = current.text("audienceLabel"), time = current.text("publishedAt"), reply = false, onVerify = { signature = current["signedActId"]?.jsonPrimitive?.contentOrNull })
            else { QText(current.text("authorLabel"), "label"); QText(document.text("title"), "display-md", modifier = Modifier.semantics { heading() }); current["quotedText"]?.jsonPrimitive?.contentOrNull?.let { QText(it, "body");current["quotedHandle"]?.jsonPrimitive?.contentOrNull?.let{handle->QText("@$handle","caption")} }; QText(current.text("displayText"), "body"); if(current["signedActId"]?.jsonPrimitive?.contentOrNull != null) Button("Signed", ButtonVariant.QUIET) { signature = current["signedActId"]?.jsonPrimitive?.contentOrNull } }
            current["audienceCount"]?.jsonPrimitive?.intOrNull?.let { QText("Audience size · $it","caption") }
            if(current.text("displayText")!=document.text("text")) { QText(if(current["signedActId"]?.jsonPrimitive?.contentOrNull != null) "Signed original" else "Original text","label");QText(document.text("text"),"body") }
            val media = document["media"]?.jsonArray
            val publicationVersion = current["version"]?.jsonPrimitive?.intOrNull
            if (baseURL != null && viewerAccountId != null && media != null && publicationVersion != null && publicationVersion > 0) {
                if (media.size <= 10) {
                media.forEach { value ->
                    val attachment = value.jsonObject
                    val actualVersion = attachment["version"]?.jsonPrimitive?.intOrNull
                    if (actualVersion != null && actualVersion > 0 && attachment["version"]?.jsonPrimitive?.isString == false) {
                        val actual = ContentAttachmentValue(attachment.text("kind"), attachment.text("assetId"), actualVersion, attachment.text("sha256"), attachment["alt"]?.jsonPrimitive?.contentOrNull)
                        key(viewerAccountId, current.text("id"), publicationVersion, actual.id, actual.version, actual.sha256) {
                            NativeContentAttachment(context, baseURL, viewerAccountId!!, creatorId, current.text("id"), document.text("kind"), creator, actual)
                        }
                    } else QText("Attachment information is unavailable. Refresh current access.", "caption")
                }
                } else QText("Attachment information is unavailable. Refresh current access.", "caption")
            }
            if (document.text("kind") == "note") {
                QText("Your private replies", "display-md", modifier = Modifier.semantics { heading() }); QText("Only you, the creator, and their permitted team can read your replies. A Note is a broadcast.", "caption")
                ContentInput("Reply privately", replyText, 4000) { replyText = it }
                Button("Send private reply", ButtonVariant.SECONDARY, block = true, disabled = busy || !replyAccess || replyText.isBlank()) { scope.launch { mutate("$contentId/replies", buildJsonObject { put("text", replyText); put("idempotencyKey", UUID.randomUUID().toString()) }, clearReply = true) } }
                replies.filter { it.text("contentId") == contentId }.forEach { reply ->
                    key(reply.text("id")) { Column(Modifier.background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        QText(reply.text("text"), "body")
                        if(reply.text("safetyState")!="allowed") QText(if(reply.text("safetyState")=="flagged") "This reply is withheld for safety review." else "Waiting for safety review. It has not reached the creator’s feed.","caption")
                        if(reply.text("safetyState")=="pending" && reply.flag("safetyReviewAvailable")) Button("Retry safety review",ButtonVariant.QUIET,disabled=busy) { scope.launch { mutate("replies/${reply.text("id")}/review",buildJsonObject { put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString()) }) } }
                        val reaction = reply["reaction"]?.takeUnless { it is JsonNull }?.jsonObject
                        if (reaction != null) { QText("$creator reacted · ${reaction.text("kind")}", "caption"); Button("Verify reaction", ButtonVariant.QUIET) { signature = reaction.text("signedActId") } }
                        Button("Withdraw private reply",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/withdraw",buildJsonObject{put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString())})}}
                        val consent = reply["consent"]!!.jsonObject
                        fun choice(text: Boolean, handle: Boolean) { scope.launch { mutate("replies/${reply.text("id")}/consent", buildJsonObject { put("version", consent.number("version")); put("shareText", text); put("showHandle", handle); put("idempotencyKey", UUID.randomUUID().toString()) }) } }
                        ContentChoice("Allow this reply to be quoted", consent.flag("shareText"), busy) { choice(it, it && consent.flag("showHandle")) }
                        ContentChoice("Show my handle on the quote", consent.flag("showHandle"), busy || !consent.flag("shareText")) { choice(true, it) }
                    } }
                }
                if (cursor != null) Button("Older replies", ButtonVariant.SECONDARY, disabled = busy || replyDepth >= 5) { scope.launch { if (!busy && replyDepth < 5) { busy = true; try { replyDepth++; load(false) } finally { busy = false } } } }
                Button("Mute Notes from this creator", ButtonVariant.QUIET, disabled = busy) { scope.launch { mutate("mute", buildJsonObject { put("muted", true) }) } }
            }
            QText("This helped", "display-md", modifier = Modifier.semantics { heading() }); ContentInput("Thanks · optional", thanksText, 2000) { thanksText = it }
            ContentChoice("Share this text with the creator’s digest", share, busy || !thanksAccess) { share = it; if (!it) identity = false }; ContentChoice("Include my handle", identity, busy || !thanksAccess || !share) { identity = it }
            fun sendThanks(withdraw: Boolean) { scope.launch { mutate("thanks", buildJsonObject { put("targetKind", "content"); put("targetId", contentId); put("text", if (withdraw) "" else thanksText); put("shareWithCreatorDigest", !withdraw && share); put("showIdentity", !withdraw && identity); put("withdrawn", withdraw); put("expectedVersion", thanks?.number("version") ?: 0); put("idempotencyKey", UUID.randomUUID().toString()) }, resetThanks = true) } }
            Button(if (thanks != null && thanks?.flag("withdrawn") == false) "Update Thanks" else "This helped", ButtonVariant.SECONDARY, disabled = busy || !thanksAccess) { sendThanks(false) }
            if (thanks != null && thanks?.flag("withdrawn") == false) Button("Withdraw Thanks", ButtonVariant.QUIET, disabled = busy || !thanksAccess) { sendThanks(true) }
        }
        }
    }
    if (currentAccess && signature != null) Dialog(onDismissRequest = { signature = null; signatureStatus = "" }) {
        LaunchedEffect(signature) { try { val proof = model.api!!.publicSignature(signature!!); signatureStatus = proof.creatorName + " · " + proof.status.toString() + "\n" + proof.explanation } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { signatureStatus = "This signature is private or unavailable. Content access does not grant public verification access." } }
        Column(Modifier.background(qColor("surface")).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { QText("Signature", "display-md"); QText(signatureStatus.ifEmpty { "Checking current signature…" }, "body"); Button("Done", ButtonVariant.SECONDARY) { signature = null; signatureStatus = "" } }
    }
}
