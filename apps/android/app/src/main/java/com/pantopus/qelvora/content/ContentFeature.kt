package com.pantopus.qelvora.content

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
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

private class ContentFailure(val status:Int,message:String):Exception(message)
private class ContentClient(context: Context, private val baseURL: String) {
    private val storage = SecureSessionStorage(context)
    suspend fun request(path: String, body: JsonObject? = null): JsonElement = withContext(Dispatchers.IO) {
        val token = storage.read() ?: throw ContentFailure(401,"Your session ended. Continue with Pantopus again.")
        val connection = URL(baseURL.trimEnd('/') + "/v1/content/" + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 10000; connection.readTimeout = 15000; connection.useCaches = false
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            val status = connection.responseCode
            val data = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            val value = Json.parseToJsonElement(data)
            if (status !in 200..299) throw ContentFailure(status,value.jsonObject["error"]?.jsonObject?.get("message")?.jsonPrimitive?.content ?: "Content is unavailable. Refresh current access.")
            value
        } finally { connection.disconnect() }
    }
}
private fun JsonObject.text(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.flag(key: String): Boolean = this[key]?.jsonPrimitive?.booleanOrNull ?: false
private fun JsonObject.number(key: String): Int = this[key]?.jsonPrimitive?.intOrNull ?: 0

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
    val client = remember(baseURL) { baseURL?.let { ContentClient(context, it) } }; val scope = rememberCoroutineScope()
    var content by remember { mutableStateOf<JsonObject?>(null) }; var replies by remember { mutableStateOf<List<JsonObject>>(emptyList()) }; var cursor by remember { mutableStateOf<String?>(null) }
    var replyText by remember { mutableStateOf("") }; var thanks by remember { mutableStateOf<JsonObject?>(null) }; var thanksText by remember { mutableStateOf("") }
    var share by remember { mutableStateOf(false) }; var identity by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }; var error by remember { mutableStateOf("") }
    var signature by remember { mutableStateOf<String?>(null) }; var signatureStatus by remember { mutableStateOf("") }
    val retryKeys=remember { mutableMapOf<String,String>() }
    suspend fun load(resetThanks: Boolean = true) {
        try {
            val api = client ?: error("The content service is not connected.")
            val value = api.request("$creatorId/$contentId").jsonObject; content = value
            run { val page = api.request("$creatorId/replies").jsonObject; replies = page["items"]!!.jsonArray.map { it.jsonObject }; cursor = page["nextCursor"]?.jsonPrimitive?.contentOrNull }
            run { val mine = api.request("$creatorId/thanks?targetKind=content&targetId=$contentId"); thanks = if (mine is JsonNull) null else mine.jsonObject; if(resetThanks) { thanksText = thanks?.text("text").orEmpty(); share = thanks?.flag("shareWithCreatorDigest") ?: false; identity = thanks?.flag("showIdentity") ?: false } }
            error = ""
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) {
            content=null;error=failure.message?:"Reconnect to refresh content. Your input is kept."
            if(failure is ContentFailure && failure.status == 401){replies=emptyList();thanks=null;replyText="";thanksText="";retryKeys.clear();return}
            try { val page=client!!.request("$creatorId/replies").jsonObject;replies=page["items"]!!.jsonArray.map{it.jsonObject};cursor=page["nextCursor"]?.jsonPrimitive?.contentOrNull } catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled} catch(_:Exception){replies=emptyList();cursor=null}
            try { val mine=client!!.request("$creatorId/thanks?targetKind=content&targetId=$contentId");thanks=if(mine is JsonNull)null else mine.jsonObject } catch(cancelled:kotlinx.coroutines.CancellationException){throw cancelled} catch(_:Exception){thanks=null}
        }
    }
    suspend fun mutate(path: String, body: JsonObject, resetThanks: Boolean = false, clearReply: Boolean = false) {
        if (busy) return; busy = true
        val fields=body.toMutableMap();fields.remove("idempotencyKey")
        val fingerprint=path+JsonObject(fields.toSortedMap()).toString()
        val command=if(body["idempotencyKey"]==null)body else JsonObject(fields+ ("idempotencyKey" to JsonPrimitive(retryKeys.getOrPut(fingerprint){UUID.randomUUID().toString()})))
        try { client?.request("$creatorId/$path", command) ?: error("The content service is not connected."); retryKeys.remove(fingerprint); if (clearReply) replyText = ""; load(resetThanks) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { if(failure is ContentFailure && failure.status in 400..499)retryKeys.remove(fingerprint);error = failure.message ?: "This action could not complete. Your input is kept." }
        finally { busy = false }
    }
    LaunchedEffect(client, contentId) { load(); while (true) { delay(4000); if (!busy) load(false) } }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (error.isNotEmpty()) Notice("error", "Content status", error)
        val current = content
        if (current == null) {
            QText("Content unavailable", "display-md");Button("Refresh",ButtonVariant.SECONDARY,disabled=busy){scope.launch{load()}}
            replies.filter{it.text("contentId")==contentId}.forEach{reply->key(reply.text("id")){
                QText(reply.text("text"),"body");val consent=reply["consent"]!!.jsonObject
                if(consent.flag("shareText")||consent.flag("showHandle"))Button("Withdraw quote permission",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/consent",buildJsonObject{put("version",consent.number("version"));put("shareText",false);put("showHandle",false);put("idempotencyKey",UUID.randomUUID().toString())})}}
                Button("Withdraw private reply",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/withdraw",buildJsonObject{put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString())})}}
            }}
            if(thanks!=null && thanks?.flag("withdrawn")==false)Button("Withdraw Thanks",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("thanks",buildJsonObject{put("targetKind","content");put("targetId",contentId);put("text","");put("shareWithCreatorDigest",false);put("showIdentity",false);put("withdrawn",true);put("expectedVersion",thanks?.number("version")?:0);put("idempotencyKey",UUID.randomUUID().toString())},resetThanks=true)}}
            Button("Unmute Notes from this creator",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("mute",buildJsonObject{put("muted",false)})}}
        }
        else {
            val document = current["document"]!!.jsonObject; val creator = current.text("creatorName")
            if (document.text("kind") == "note") Note(current.text("displayText"), name = creator, audience = current.text("audienceLabel"), time = current.text("publishedAt"), reply = false, onVerify = { signature = current["signedActId"]?.jsonPrimitive?.contentOrNull })
            else { QText(current.text("authorLabel"), "label"); QText(document.text("title"), "display-md", modifier = Modifier.semantics { heading() }); current["quotedText"]?.jsonPrimitive?.contentOrNull?.let { QText(it, "body") }; QText(current.text("displayText"), "body"); Button("Signed", ButtonVariant.QUIET) { signature = current["signedActId"]?.jsonPrimitive?.contentOrNull } }
            if(current.text("displayText")!=document.text("text")) { QText("Signed original","label");QText(document.text("text"),"body") }
            if (document.text("kind") == "note") {
                QText("Your private replies", "display-md", modifier = Modifier.semantics { heading() }); QText("Only you, the creator, and their permitted team can read your replies. A Note is a broadcast.", "caption")
                ContentInput("Reply privately", replyText, 4000) { replyText = it }
                Button("Send private reply", ButtonVariant.SECONDARY, block = true, disabled = busy || replyText.isBlank()) { scope.launch { mutate("$contentId/replies", buildJsonObject { put("text", replyText); put("idempotencyKey", UUID.randomUUID().toString()) }, clearReply = true) } }
                replies.filter { it.text("contentId") == contentId }.forEach { reply ->
                    key(reply.text("id")) { Column(Modifier.background(qColor("surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        QText(reply.text("text"), "body")
                        val reaction = reply["reaction"]?.takeUnless { it is JsonNull }?.jsonObject
                        if (reaction != null) { QText("$creator reacted · ${reaction.text("kind")}", "caption"); Button("Verify reaction", ButtonVariant.QUIET) { signature = reaction.text("signedActId") } }
                        Button("Withdraw private reply",ButtonVariant.QUIET,disabled=busy){scope.launch{mutate("replies/${reply.text("id")}/withdraw",buildJsonObject{put("version",reply.number("version"));put("idempotencyKey",UUID.randomUUID().toString())})}}
                        val consent = reply["consent"]!!.jsonObject
                        fun choice(text: Boolean, handle: Boolean) { scope.launch { mutate("replies/${reply.text("id")}/consent", buildJsonObject { put("version", consent.number("version")); put("shareText", text); put("showHandle", handle); put("idempotencyKey", UUID.randomUUID().toString()) }) } }
                        ContentChoice("Allow this reply to be quoted", consent.flag("shareText"), busy) { choice(it, it && consent.flag("showHandle")) }
                        ContentChoice("Show my handle on the quote", consent.flag("showHandle"), busy || !consent.flag("shareText")) { choice(true, it) }
                    } }
                }
                if (cursor != null) Button("Older replies", ButtonVariant.SECONDARY, disabled = busy) { scope.launch { busy = true; try { val page = client!!.request("$creatorId/replies?cursor=$cursor").jsonObject; replies = replies + page["items"]!!.jsonArray.map { it.jsonObject }; cursor = page["nextCursor"]?.jsonPrimitive?.contentOrNull } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { error = "Older replies are unavailable. Retry after reconnecting." } finally { busy = false } } }
                Button("Mute Notes from this creator", ButtonVariant.QUIET, disabled = busy) { scope.launch { mutate("mute", buildJsonObject { put("muted", true) }) } }
            }
            QText("This helped", "display-md", modifier = Modifier.semantics { heading() }); ContentInput("Thanks · optional", thanksText, 2000) { thanksText = it }
            ContentChoice("Share this text with the creator’s digest", share, busy) { share = it; if (!it) identity = false }; ContentChoice("Include my handle", identity, busy || !share) { identity = it }
            fun sendThanks(withdraw: Boolean) { scope.launch { mutate("thanks", buildJsonObject { put("targetKind", "content"); put("targetId", contentId); put("text", if (withdraw) "" else thanksText); put("shareWithCreatorDigest", !withdraw && share); put("showIdentity", !withdraw && identity); put("withdrawn", withdraw); put("expectedVersion", thanks?.number("version") ?: 0); put("idempotencyKey", UUID.randomUUID().toString()) }, resetThanks = true) } }
            Button(if (thanks != null && thanks?.flag("withdrawn") == false) "Update Thanks" else "This helped", ButtonVariant.SECONDARY, disabled = busy) { sendThanks(false) }
            if (thanks != null && thanks?.flag("withdrawn") == false) Button("Withdraw Thanks", ButtonVariant.QUIET, disabled = busy) { sendThanks(true) }
        }
    }
    if (signature != null) Dialog(onDismissRequest = { signature = null; signatureStatus = "" }) {
        LaunchedEffect(signature) { try { val proof = model.api!!.publicSignature(signature!!); signatureStatus = proof.creatorName + " · " + proof.status.toString() + "\n" + proof.explanation } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { signatureStatus = "This signature is private or unavailable. Content access does not grant public verification access." } }
        Column(Modifier.background(qColor("surface")).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { QText("Signature", "display-md"); QText(signatureStatus.ifEmpty { "Checking current signature…" }, "body"); Button("Done", ButtonVariant.SECONDARY) { signature = null; signatureStatus = "" } }
    }
}
