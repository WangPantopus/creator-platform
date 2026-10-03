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
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.generated.CreatorAPIError
import com.pantopus.qelvora.ui.*
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.time.Instant

private class ContentFailure(val status:Int,val code:String?=null):Exception() {
    val accountChanged get()=code in listOf("content_account_changed","session_account_changed","session_changed","session_view_changed")
    val authorityDenied get()=status in listOf(401,403) || accountChanged
}
private fun contentFailureCopy(failure: Exception, action: Boolean = false): String {
    val error = failure as? ContentFailure
    val key = when {
        error?.accountChanged == true -> "w5ContentAccountChanged"
        error?.status == 401 -> "w5ContentSessionEnded"
        error?.code in listOf("reply_changed", "consent_changed", "thanks_changed") -> "w5ContentChanged"
        error?.code == "idempotency_conflict" -> "w5ContentDuplicateChanged"
        error?.code == "reply_withdrawn" -> "w5ContentReplyWithdrawn"
        error?.code == "fan_profile_required" -> "w5ContentFanProfileRequired"
        error?.status in listOf(403, 404) || error?.code?.endsWith("_unconfigured") == true -> "w5ContentAccessUnavailable"
        action && error?.code == "invalid_request" -> "w5ContentInvalidRequest"
        action -> "w5ContentActionUnconfirmed"
        else -> "w5ContentRefreshUnavailable"
    }
    return QelvoraCopy.text(key)
}
/** A complete read cycle/action keeps W1's original issued client and lifetime. */
private class ContentClient(val original: FanSessionRequestCapture) {
    suspend fun isCurrent(): Boolean = original.isCurrent()
    suspend fun request(path: String, body: JsonObject? = null, expectedAccountId:String? = null, query: List<Pair<String, String?>> = emptyList()): JsonElement {
        currentCoroutineContext().ensureActive()
        if (expectedAccountId != null && expectedAccountId != original.expectedAccountId)
            throw ContentFailure(403, "content_account_changed")
        if (!isCurrent()) throw CancellationException("Your original content view changed.")
        try {
            val response = original.contentBytes("/v1/content/$path", body = body?.toString()?.toByteArray(Charsets.UTF_8), query = query)
            currentCoroutineContext().ensureActive()
            if (!isCurrent()) throw CancellationException("Your original content view changed.")
            val text = Charsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(response.body)).toString()
            val value = Json.parseToJsonElement(text)
            if (!isCurrent()) throw CancellationException("Your original content view changed.")
            return value
        } catch (failure: Exception) {
            currentCoroutineContext().ensureActive()
            if (!isCurrent()) throw CancellationException("Your original content view changed.")
            if (failure is CreatorAPIError) {
                val code = runCatching { Json.parseToJsonElement(failure.body).jsonObject["error"]?.jsonObject?.get("code")?.jsonPrimitive?.contentOrNull }.getOrNull()
                throw ContentFailure(failure.status, code)
            }
            throw failure
        }
    }
}
private fun JsonObject.text(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.flag(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: false
private fun JsonObject.number(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: 0
private data class ContentReplyPolicy(val limit: Int, val confirmedDays: Int?, val milestone: Int?) {
    companion object {
        fun read(value: JsonObject, accountId: String, creatorId: String): ContentReplyPolicy {
            if (value.text("accountId") != accountId || value.text("creatorId") != creatorId)
                throw ContentFailure(403, "content_account_changed")
            fun integer(key: String): Int? {
                val raw = value[key] ?: error("Missing reply policy")
                if (raw is JsonNull) return null
                check(!raw.jsonPrimitive.isString)
                return raw.jsonPrimitive.intOrNull ?: error("Invalid reply policy")
            }
            val days = integer("confirmedDays"); val milestone = integer("milestone"); val limit = integer("limit") ?: error("Missing reply limit")
            val active = value["longerRepliesActive"]?.jsonPrimitive?.booleanOrNull ?: error("Missing reply policy")
            check(value["longerRepliesActive"]?.jsonPrimitive?.isString == false)
            check(value["historyComplete"]?.jsonPrimitive?.booleanOrNull == false && value["historyComplete"]?.jsonPrimitive?.isString == false)
            check(days == null || days >= 0)
            val expectedMilestone = when { days == null || days < 50 -> null; days >= 365 -> 365; days >= 100 -> 100; else -> 50 }
            val expectedLimit = when { !active || expectedMilestone == null -> 4000; expectedMilestone == 365 -> 12000; expectedMilestone == 100 -> 8000; else -> 6000 }
            val basis = value["basis"]?.jsonPrimitive?.contentOrNull
            check(basis == null || basis in listOf("confirmed_stripe_paid_periods", "confirmed_paid_periods"))
            check(days == null || basis != null)
            check(milestone == expectedMilestone && limit == expectedLimit)
            Instant.parse(value.text("checkedAt"))
            return ContentReplyPolicy(limit, days, milestone)
        }
    }
}

@Composable
private fun QText(text: String, token: String, modifier: Modifier = Modifier) {
    BasicText(text, modifier, qText(token).copy(color = qColor("ink")))
}

object ContentFanFeature {
    private fun matches(destination: String): Boolean { val parts = destination.split('/').filter { it.isNotEmpty() }; return parts.size == 3 && parts[0] == "content" && parts.drop(1).all { runCatching { UUID.fromString(it) }.isSuccess } }
    fun registration(context: Context, baseURL: String?): FanFeatureRegistration {
        ContentMediaCache.prepare(context.cacheDir)
        return FanFeatureRegistration(matches = ::matches, screen = { model -> ContentScreen(context, baseURL, model) })
    }
}

@Composable
private fun ContentChoice(label: String, checked: Boolean, disabled: Boolean, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).toggleable(value=checked,enabled=!disabled,role=Role.Checkbox,onValueChange=change).semantics { contentDescription = label + if (checked) ", selected" else ", not selected" }.padding(vertical = 8.dp)) { QText(if (checked) "☑ " else "☐ ", "body"); QText(label, "body") }
}
@Composable
private fun ContentInput(label: String, value: String, max: Int, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { QText(label, "caption"); BasicTextField(value, { if (it.length <= max || it.length < value.length) change(it) }, Modifier.fillMaxWidth().heightIn(min = 64.dp).background(qColor("surface")).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink"))) }
}

@Composable
private fun ContentScreen(context: Context, baseURL: String?, model: FanSession) {
    val destination = model.destination
    val account = model.session ?: return
    val parts = destination.split('/').filter { it.isNotEmpty() }
    if (parts.size != 3 || parts[0] != "content") return
    val creatorId = parts[1]; val contentId = parts[2]
    key(account.accountId, account.sessionId, destination) { ContentObjectScreen(context, baseURL, model, creatorId, contentId, account.accountId, account.sessionId, destination) }
}

@Composable
private fun ContentObjectScreen(context: Context, baseURL: String?, model: FanSession, creatorId: String, contentId: String, accountId: String, sessionId: String, destination: String) {
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var content by remember { mutableStateOf<JsonObject?>(null) }; var replies by remember { mutableStateOf<List<JsonObject>>(emptyList()) }; var cursor by remember { mutableStateOf<String?>(null) }
    var replyText by remember { mutableStateOf("") }; var thanks by remember { mutableStateOf<JsonObject?>(null) }; var thanksText by remember { mutableStateOf("") }
    var share by remember { mutableStateOf(false) }; var identity by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf("") }
    var signature by remember { mutableStateOf<String?>(null) }; var signatureStatus by remember { mutableStateOf("") }
    var viewerAccountId by remember{mutableStateOf<String?>(null)};var loadGeneration by remember{mutableIntStateOf(0)}
    var currentAccess by remember { mutableStateOf(false) }
    var muted by remember { mutableStateOf<Boolean?>(null) }
    var replyAccess by remember { mutableStateOf(false) }
    var thanksAccess by remember { mutableStateOf(false) }
    var replyPolicy by remember { mutableStateOf<ContentReplyPolicy?>(null) }
    val replyLimit = replyPolicy?.limit ?: 4000
    var loading by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf(true) }
    var checkedAt by remember { mutableLongStateOf(0L) }
    var replyCursors by remember { mutableStateOf<List<String?>>(listOf(null)) }
    val retryKeys=remember { mutableMapOf<String,String>() }
    fun suspendAccess() { currentAccess = false; replyAccess = false; thanksAccess = false; replyPolicy = null; signature = null; signatureStatus = "" }
    fun clearAuthority() {
        suspendAccess(); content = null; replies = emptyList(); thanks = null; cursor = null
        replyCursors = listOf(null)
        viewerAccountId = null; muted = null; replyText = ""; thanksText = ""; share = false; identity = false; retryKeys.clear()
    }
    fun originalViewCurrent(): Boolean = active && lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && model.destination == destination &&
        model.session?.accountId == accountId && model.session?.sessionId == sessionId &&
        !model.checkingSession && !model.busy && model.error.isEmpty() && !model.purgingPrivateState && !model.localPurgeFailed
    suspend fun captureClient(): ContentClient {
        currentCoroutineContext().ensureActive()
        if (baseURL == null || !originalViewCurrent()) throw ContentFailure(503, "content_session_unconfigured")
        val original = model.captureRequest(destination, maximumResponseBytes = 4_194_304, timeoutMs = 5_000)
            ?: throw ContentFailure(503, "content_session_unconfigured")
        if (original.expectedAccountId != accountId || original.sessionId != sessionId || !originalViewCurrent())
            throw CancellationException("Your original content view changed.")
        return ContentClient(original)
    }
    suspend fun load(resetThanks:Boolean=true) {
        if (!active || loading) return; loading = true
        val cycleStartedAt = SystemClock.elapsedRealtime()
        loadGeneration++;val generation=loadGeneration
        try {
            val api = captureClient()
            val before=api.request("$creatorId/mute", expectedAccountId=accountId).jsonObject
            if (before.text("accountId") != accountId) throw ContentFailure(403, "content_account_changed")
            val statuses=mutableListOf<String>()
            val view=try{api.request("$creatorId/$contentId", expectedAccountId=before.text("accountId")).jsonObject}catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && (failure.status==401 || failure.accountChanged))throw failure
                statuses.add(contentFailureCopy(failure));null
            }
            val replyCursor=if(before.text("accountId")==viewerAccountId)replyCursors.last() else null
            var page:JsonObject?=null;var currentReplies:List<JsonObject> = emptyList();var repliesAvailable=false
            try {
                val query = listOf("contentId" to contentId) + (replyCursor?.let { listOf("cursor" to it) } ?: emptyList())
                val fresh=api.request("$creatorId/replies", expectedAccountId=before.text("accountId"), query=query).jsonObject
                page=fresh;currentReplies=fresh["items"]!!.jsonArray.map{it.jsonObject};repliesAvailable=true
            }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && failure.authorityDenied)throw failure
                statuses.add("Private replies are unavailable. Refresh to try again.")
            }
            var mine:JsonObject?=null;var thanksAvailable=false
            try {
                val saved=api.request("$creatorId/thanks", expectedAccountId=before.text("accountId"), query=listOf("targetKind" to "content", "targetId" to contentId))
                mine=if(saved is JsonNull)null else saved.jsonObject;thanksAvailable=true
            }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && failure.authorityDenied)throw failure
                statuses.add("Thanks is unavailable. Your input is kept; refresh before saving.")
            }
            var policy: ContentReplyPolicy? = null
            try {
                policy = ContentReplyPolicy.read(api.request("$creatorId/reply-policy", expectedAccountId=before.text("accountId")).jsonObject, before.text("accountId"), creatorId)
            }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
                if(failure is ContentFailure && failure.authorityDenied)throw failure
                statuses.add(QelvoraCopy.text("contentReplyPolicyUnavailable"))
            }
            val after=api.request("$creatorId/mute", expectedAccountId=before.text("accountId")).jsonObject
            if(generation!=loadGeneration || !originalViewCurrent() || !api.isCurrent())return
            if(before.text("accountId")!=after.text("accountId")){clearAuthority();error=QelvoraCopy.text("w5ContentAccountChanged");return}
            val currentMuted = after["muted"]?.jsonPrimitive?.booleanOrNull ?: throw ContentFailure(503, "note_preferences_unconfigured")
            val changed=viewerAccountId!=before.text("accountId")
            if(changed){replyText="";thanksText="";share=false;identity=false;retryKeys.clear();signature=null;replyCursors=listOf(null)}
            viewerAccountId=before.text("accountId");muted=currentMuted;content=view;replies=currentReplies;cursor=page?.get("nextCursor")?.jsonPrimitive?.contentOrNull;thanks=mine;replyAccess=repliesAvailable;thanksAccess=thanksAvailable;replyPolicy=policy
            if(thanksAvailable && (resetThanks||changed)){thanksText=mine?.text("text").orEmpty();share=mine?.flag("shareWithCreatorDigest")?:false;identity=mine?.flag("showIdentity")?:false}
            error=statuses.joinToString("\n")
            checkedAt = cycleStartedAt; currentAccess = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && SystemClock.elapsedRealtime() - cycleStartedAt < 5000
        }catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled}catch(failure:Exception){
            if(generation!=loadGeneration)return
            suspendAccess()
            content=null;replies=emptyList();thanks=null;cursor=null
            if(failure is ContentFailure && failure.authorityDenied){clearAuthority()}
            error=contentFailureCopy(failure)
        } finally { loading = false }
    }
    suspend fun mutate(path: String, body: JsonObject, resetThanks: Boolean = false, clearReply: Boolean = false) {
        val expectedAccount = viewerAccountId ?: return
        if (busy || !currentAccess || !originalViewCurrent() || expectedAccount != accountId || SystemClock.elapsedRealtime() - checkedAt >= 5000) return
        if ((path=="thanks" && !thanksAccess) || (path=="$contentId/replies" && !replyAccess)) return
        if (path=="$contentId/replies" && replyText.trim().length > replyLimit) return
        busy = true
        val fields=body.toMutableMap();fields.remove("idempotencyKey")
        val fingerprint=accountId+":"+sessionId+":"+path+JsonObject(fields.toSortedMap()).toString()
        val command=if(body["idempotencyKey"]==null)body else JsonObject(fields+ ("idempotencyKey" to JsonPrimitive(retryKeys.getOrPut(fingerprint){UUID.randomUUID().toString()})))
        val originalThanksText = thanksText; val originalShare = share; val originalIdentity = identity
        try {
            val api = captureClient()
            api.request("$creatorId/$path", command, expectedAccountId=expectedAccount)
            if (!originalViewCurrent() || !api.isCurrent()) return
            retryKeys.remove(fingerprint)
            if (clearReply && replyText == body.text("text")) replyText = ""
            load(resetThanks && thanksText == originalThanksText && share == originalShare && identity == originalIdentity)
        }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { if(failure is ContentFailure && failure.status in 400..499)retryKeys.remove(fingerprint); if(failure is ContentFailure && failure.authorityDenied)clearAuthority(); error = contentFailureCopy(failure, action = true) }
        finally { busy = false }
    }
    suspend fun changeReplyPage(next: String? = null, newer: Boolean = false) {
        if (busy || loading || !currentAccess) return
        if (newer) {
            if (replyCursors.size < 2) return
            replyCursors = replyCursors.dropLast(1)
        } else {
            if (next == null || runCatching { UUID.fromString(next) }.isFailure) return
            replyCursors = replyCursors + next
        }
        busy = true
        try { suspendAccess(); replies = emptyList(); cursor = null; load(false) }
        finally { busy = false }
    }
    LaunchedEffect(baseURL, accountId, sessionId, destination) {
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
    LaunchedEffect(baseURL, accountId, sessionId, destination) { while (true) { delay(500); if (SystemClock.elapsedRealtime() - checkedAt >= 5000) suspendAccess() } }
    DisposableEffect(lifecycle, model, accountId, sessionId, destination) {
        active = true
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) scope.launch { load(false) }
            else if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) suspendAccess()
        }
        lifecycle.addObserver(observer)
        if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) suspendAccess()
        onDispose { lifecycle.removeObserver(observer); active = false; loadGeneration++; clearAuthority() }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (error.isNotEmpty()) Notice("error", QelvoraCopy.text("w5ContentStatus"), error)
        if (!currentAccess) {
            QText(QelvoraCopy.text("w5ContentCheckingAccess"), "body")
            Button(QelvoraCopy.text("w5ContentCheckCurrentAccess"), ButtonVariant.SECONDARY, disabled=busy) { scope.launch { load(false) } }
        } else {
        val current = content
        if (current == null) {
            QText("Content unavailable", "display-md");Button("Refresh",ButtonVariant.SECONDARY,disabled=busy){scope.launch{load()}}
            replies.filter{it.text("contentId")==contentId}.forEach{reply->key(reply.text("id")){
                QText(reply.text("text"),"body");val consent=reply["consent"]!!.jsonObject
                if(consent.flag("shareText")||consent.flag("showHandle"))Button("Withdraw quote permission",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/consent",buildJsonObject{put("version",consent.number("version"));put("shareText",false);put("showHandle",false);put("idempotencyKey",UUID.randomUUID().toString())})}}
                Button("Withdraw private reply",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/withdraw",buildJsonObject{put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString())})}}
            }}
            if (replyCursors.size > 1) Button("Newer replies", ButtonVariant.SECONDARY, disabled = busy || loading) { scope.launch { changeReplyPage(newer = true) } }
            cursor?.let { next -> Button("Older replies", ButtonVariant.SECONDARY, disabled = busy || loading) { scope.launch { changeReplyPage(next) } } }
            if(thanks!=null && thanks?.flag("withdrawn")==false)Button("Withdraw Thanks",ButtonVariant.QUIET,disabled=busy || !thanksAccess){scope.launch{mutate("thanks",buildJsonObject{put("targetKind","content");put("targetId",contentId);put("text","");put("shareWithCreatorDigest",false);put("showIdentity",false);put("withdrawn",true);put("expectedVersion",thanks?.number("version")?:0);put("idempotencyKey",UUID.randomUUID().toString())},resetThanks=true)}}
            Button(if(muted==true) "Unmute Notes from this creator" else "Mute Notes from this creator",ButtonVariant.QUIET,disabled=busy || muted==null){scope.launch{val currentMuted=muted?:return@launch;mutate("mute",buildJsonObject{put("muted",!currentMuted)})}}
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
                            NativeContentAttachment(context, model, destination, baseURL, viewerAccountId!!, creatorId, current.text("id"), document.text("kind"), creator, actual)
                        }
                    } else QText("Attachment information is unavailable. Refresh current access.", "caption")
                }
                } else QText("Attachment information is unavailable. Refresh current access.", "caption")
            }
            if (document.text("kind") == "note") {
                QText("Your private replies", "display-md", modifier = Modifier.semantics { heading() }); QText("Only you, the creator, and their permitted team can read your replies. A Note is a broadcast.", "caption")
                replyPolicy?.let { policy -> if (policy.milestone != null && policy.confirmedDays != null) QText(QelvoraCopy.text("contentConfirmedTenure", mapOf("days" to policy.confirmedDays.toString())), "caption") }
                if (replyPolicy == null) QText(QelvoraCopy.text("contentReplyPolicyUnavailable"), "caption")
                ContentInput("Reply privately", replyText, replyLimit) { replyText = it }
                QText(QelvoraCopy.text("contentReplyLimit", mapOf("used" to replyText.length.toString(), "limit" to replyLimit.toString())), "caption")
                if (replyText.length > replyLimit) QText(QelvoraCopy.text("contentReplyOverLimit"), "caption")
                Button("Send private reply", ButtonVariant.SECONDARY, block = true, disabled = busy || !replyAccess || replyText.isBlank() || replyText.trim().length > replyLimit) { scope.launch { mutate("$contentId/replies", buildJsonObject { put("text", replyText); put("idempotencyKey", UUID.randomUUID().toString()) }, clearReply = true) } }
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
                if (replyCursors.size > 1) Button("Newer replies", ButtonVariant.SECONDARY, disabled = busy || loading) { scope.launch { changeReplyPage(newer = true) } }
                cursor?.let { next -> Button("Older replies", ButtonVariant.SECONDARY, disabled = busy || loading) { scope.launch { changeReplyPage(next) } } }
                Button(if(muted==true) "Unmute Notes from this creator" else "Mute Notes from this creator", ButtonVariant.QUIET, disabled = busy || muted==null) { scope.launch { val currentMuted=muted?:return@launch;mutate("mute", buildJsonObject { put("muted", !currentMuted) }) } }
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
        LaunchedEffect(signature) {
            val originalSignature = signature ?: return@LaunchedEffect
            try {
                val api = captureClient()
                val proof = api.original.client.publicSignature(originalSignature)
                if (signature == originalSignature && currentAccess && originalViewCurrent() && api.isCurrent())
                    signatureStatus = proof.creatorName + " · " + proof.status.toString() + "\n" + proof.explanation
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (signature == originalSignature && currentAccess && originalViewCurrent())
                    signatureStatus = "This signature is private or unavailable. Content access does not grant public verification access."
            }
        }
        Column(Modifier.background(qColor("surface")).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { QText("Signature", "display-md"); QText(signatureStatus.ifEmpty { "Checking current signature…" }, "body"); Button("Done", ButtonVariant.SECONDARY) { signature = null; signatureStatus = "" } }
    }
}
