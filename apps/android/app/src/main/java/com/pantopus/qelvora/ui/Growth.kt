package com.pantopus.qelvora.ui

import com.pantopus.qelvora.generated.QelvoraCopy

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import android.content.ClipData
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.ImeAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class GrowthRequestFailure(val status: Int): Exception(when(status) {401 -> QelvoraCopy.text("growthContinueWithPantopusToOpenYourAccountSCurrentState");403 -> QelvoraCopy.text("growthThisActionIsUnavailableToThisAccount");404 -> QelvoraCopy.text("growthThisDestinationIsNoLongerAvailable");else -> QelvoraCopy.text("growthTheServiceIsUnavailableReconnectAndTryAgain")})

/** Session credential comes from W1; no growth-owned credential persistence. */
class GrowthClient(private val origin: String, private val token: () -> String? = { null }) {
    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null, expectedSession: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(URL(origin), "/v1/growth/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method; connection.connectTimeout = 5000; connection.readTimeout = 10000
            connection.useCaches = false; connection.setRequestProperty("Content-Type", "application/json")
            val credential = if(path.startsWith("public/")) null else token()
            if(expectedSession != null && credential != expectedSession) throw GrowthRequestFailure(401)
            credential?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) { connection.doOutput = true; connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            if (connection.responseCode !in 200..299) throw GrowthRequestFailure(connection.responseCode)
            val response = connection.inputStream.use { it.readNBytes(1_000_001) }
            if (response.size > 1_000_000) throw IllegalStateException(QelvoraCopy.text("growthThisResponseIsUnavailable"))
            if(expectedSession != null && token() != credential) throw GrowthRequestFailure(401)
            JSONObject(response.toString(Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
    suspend fun registerDevice(installationId: String, registration: String, granted: Boolean, registrationRevision: Long, expectedSession: String) = request("devices", "PUT", JSONObject().put("installationId", installationId).put("platform", "android").put("token", registration).put("permission", if (granted) "granted" else "denied").put("registrationRevision", registrationRevision), expectedSession)
    suspend fun revokeDevice(installationId: String, registrationRevision: Long, expectedSession: String) = request("devices/$installationId", "DELETE", JSONObject().put("platform", "android").put("registrationRevision", registrationRevision), expectedSession)
}

private fun JSONObject.objects(key: String): List<JSONObject> {val values = optJSONArray(key) ?: return emptyList(); return (0 until values.length()).mapNotNull { values.optJSONObject(it) }}

/** W1 registers this fan feature and owns auth, deep-link resolution and permission prompts. */
@Composable
fun GrowthFanFeature(baseUrl: String?, token: () -> String? = { null }, destination: String = "/discover", onSignIn: (String) -> Unit = {}, onNavigate: ((String) -> Unit)? = null) {
    var route by remember(destination) { mutableStateOf(destination) }
    fun navigate(target: String) { if(onNavigate != null) onNavigate(target) else route = target }
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("For you") }
    var section by remember { mutableStateOf("Chat") }
    var refresh by remember { mutableIntStateOf(0) }
    var creators by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var discoverCursor by remember { mutableStateOf<String?>(null) }
    var discoverNextCursor by remember { mutableStateOf<String?>(null) }
    var discoverQuery by remember { mutableStateOf("") }
    var discoverCategory by remember { mutableStateOf("") }
    var discoverRequestRevision by remember { mutableIntStateOf(0) }
    var pagingDiscover by remember { mutableStateOf(false) }
    var pass by remember { mutableStateOf<JSONObject?>(null) }
    var creator by remember { mutableStateOf<JSONObject?>(null) }
    var posts by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var home by remember { mutableStateOf<JSONObject?>(null) }
    var homePostsCursor by remember { mutableStateOf<String?>(null) }
    var homeThreadsCursor by remember { mutableStateOf<String?>(null) }
    var pagingHome by remember { mutableStateOf(false) }
    var invitation by remember { mutableStateOf<JSONObject?>(null) }
    var shared by remember { mutableStateOf<JSONObject?>(null) }
    var sharingReply by remember { mutableStateOf(false) }
    var replyDocument by remember { mutableStateOf<java.io.File?>(null) }
    var following by remember { mutableStateOf(false) }
    var notifications by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var error by remember { mutableStateOf("") }
    var requiresSignIn by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val documentShare = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        replyDocument?.delete();replyDocument = null
    }
    DisposableEffect(route) { onDispose {replyDocument?.delete();replyDocument = null} }
    val scrollState = rememberScrollState()
    val client = remember(baseUrl) { baseUrl?.let { GrowthClient(it, token) } }
    val ink = qColor("ink")
    fun record(failure: Exception) {requiresSignIn = (failure as? GrowthRequestFailure)?.status == 401;error = if(failure is GrowthRequestFailure) failure.message!! else QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain")}
    suspend fun loadDirectory(cursor: String?, search: String, filter: String, revision: Int) {
        if(client == null || route != "/discover") return
        val currentSession = token()
        val parameters = listOf("q=" + URLEncoder.encode(search, "UTF-8"), "category=" + URLEncoder.encode(filter, "UTF-8"), cursor?.let {"cursor=" + URLEncoder.encode(it, "UTF-8")}).filterNotNull().joinToString("&")
        val page = client.request("public/creators?$parameters")
        val values = page.objects("creators")
        val access = if(currentSession != null && values.isNotEmpty()) try {
            client.request("discovery-access?creators=" + URLEncoder.encode(values.joinToString(",") {it.getString("id")}, "UTF-8"), expectedSession = currentSession)
        } catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(_: Exception) {null} else null
        if(route != "/discover" || discoverRequestRevision != revision) return
        creators = values;pass = if(token() == currentSession) access else null
        discoverCursor = cursor;discoverNextCursor = if(page.isNull("nextCursor")) null else page.getString("nextCursor")
        discoverQuery = search;discoverCategory = filter;error = ""
        scrollState.scrollTo(0)
    }
    fun pageDiscover(cursor: String?) {
        if(route != "/discover" || pagingDiscover || loading || client == null) return
        val revision = ++discoverRequestRevision
        pagingDiscover = true;pass = null
        scope.launch {
            try {loadDirectory(cursor, discoverQuery, discoverCategory, revision)}
            catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled}
            catch(failure: Exception) {if(route == "/discover" && discoverRequestRevision == revision) {pass = null;record(failure)}}
            finally {if(discoverRequestRevision == revision) pagingDiscover = false}
        }
    }
    fun exportSharedReply() {
        val target = route
        if(client == null || !target.startsWith("/share/") || sharingReply) return
        sharingReply = true
        scope.launch {
            var prepared: java.io.File? = null
            try {
                val id = target.removePrefix("/share/")
                val artifact = client.request("public/shares/$id/export")
                if(route != target || artifact.getString("id") != id) return@launch
                val file = growthReplyDocument(context.applicationContext, artifact)
                prepared = file
                if(route != target) return@launch
                val current = client.request("public/shares/$id/export")
                if(route != target || !sameGrowthReplyExport(artifact, current)) throw GrowthRequestFailure(410)
                val uri = FileProvider.getUriForFile(context, context.packageName + ".growth.reply", file)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/pdf"
                    putExtra(Intent.EXTRA_TEXT, artifact.getString("text"))
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = ClipData.newRawUri(QelvoraCopy.text("growthShareCompleteReply"), uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                replyDocument?.delete();replyDocument = file
                documentShare.launch(Intent.createChooser(intent, QelvoraCopy.text("growthShareCompleteReply")))
                prepared = null
                error = ""
            } catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled}
            catch(failure: Exception) {
                if(route == target) {if((failure as? GrowthRequestFailure)?.status == 410) shared = null;record(failure)}
            } finally {prepared?.delete();sharingReply = false}
        }
    }
    fun pageHome(cursor: String?, threadsCursor: String? = null) {
        val previous = home ?: return
        if (route != "/home" || pagingHome || client == null) return
        pagingHome = true
        scope.launch {
            try {
                val currentSession = token() ?: throw GrowthRequestFailure(401)
                val query = listOfNotNull(cursor?.let { "postsCursor=" + URLEncoder.encode(it, "UTF-8") }, threadsCursor?.let { "threadsCursor=" + URLEncoder.encode(it, "UTF-8") }).joinToString("&")
                val page = client.request("home" + if(query.isEmpty()) "" else "?$query", expectedSession = currentSession)
                if (route == "/home" && home === previous) {home = page;homePostsCursor = cursor;homeThreadsCursor = threadsCursor;error = "";scrollState.scrollTo(0)}
            } catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled}
            catch(failure: Exception) {
                if(route == "/home" && home === previous) {
                    if((failure as? GrowthRequestFailure)?.status in listOf(401,403,410)) home = null
                    record(failure)
                }
            } finally {pagingHome = false}
        }
    }
    LaunchedEffect(route, refresh, category) {
        val revision = ++discoverRequestRevision
        pagingDiscover = false
        error = ""; requiresSignIn = false; loading = true
        try {
            creator = null; posts = emptyList(); home = null; invitation = null; shared = null
            if (client == null) throw IllegalStateException(QelvoraCopy.text("growthTheGrowthServiceIsNotConfigured"))
            when {
                route == "/discover" -> {pass = null;loadDirectory(null, query, if(category == "For you") "" else category, revision)}
                route == "/home" -> {homePostsCursor = null;homeThreadsCursor = null;home = client.request("home")}
                route.startsWith("/invite/") -> invitation = client.request("public/invites/${route.removePrefix("/invite/")}")
                route.startsWith("/share/") -> shared = client.request("public/shares/${route.removePrefix("/share/")}")
                route == "/notifications/settings" -> Unit
                route == "/notifications" -> notifications = client.request("notifications").objects("notifications")
                route.startsWith("/notifications/") -> {
                    val openedRoute = route
                    val id = java.util.UUID.fromString(route.removePrefix("/notifications/")).toString()
                    val captured = token() ?: throw GrowthRequestFailure(401)
                    val target = GrowthPush.resolveTap(client, id, captured)
                    if(route == openedRoute && token() == captured) navigate(target)
                }
                route.startsWith("/creators/") -> {
                    val pieces = route.substringBefore('?').split('/'); val handle = pieces.getOrNull(2) ?: throw IllegalStateException(QelvoraCopy.text("growthThisCreatorIsUnavailable"))
                    val result = if (route.contains("/posts/")) client.request("public/creators/$handle/posts/${pieces.last()}") else client.request("public/creators/$handle")
                    creator = result.getJSONObject("creator"); posts = if (result.has("post")) listOf(result.getJSONObject("post")) else result.objects("posts")
                    if (route.contains("context=")) {val id = route.substringAfter("context="); require(Regex("[a-f0-9-]{36}").matches(id)); val context = client.request("public/creators/$handle/posts/$id").getJSONObject("post"); require(context.getBoolean("aiContextEligible")); posts = listOf(context)}
                    else if (route.contains("/chat")) posts = emptyList()
                    following = try {client.request("follow/${creator!!.getString("id")}").getBoolean("following")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(_: Exception) {false}
                }
                route != "/home" -> throw IllegalStateException(QelvoraCopy.text("growthThisDestinationIsNotConnectedYet"))
            }
        } catch (cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch (failure: Exception) {creator = null; creators = emptyList(); posts = emptyList(); notifications = emptyList(); record(failure)}
        finally {loading = false}
    }
    Column(Modifier.fillMaxSize().background(qColor("ground"))) {
        Column(Modifier.weight(1f).verticalScroll(scrollState).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                route == "/notifications/settings" -> GrowthNotificationSettings(client)
                route == "/discover" -> {
                    BasicText(QelvoraCopy.text("navDiscover"), style = qText("display-lg").copy(color = ink), modifier = Modifier.semantics {heading()})
                    BasicTextField(query, onValueChange = { query = it.take(120) }, textStyle = qText("body").copy(color = ink), singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = {refresh++}), decorationBox = {inner -> Box {if(query.isEmpty()) BasicText(QelvoraCopy.text("growthSearchCreatorsCraftsOrQuestions"), style = qText("body").copy(color = qColor("ink-muted")));inner()}}, modifier = Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(12.dp)).padding(14.dp).semantics {contentDescription = QelvoraCopy.text("growthSearchCreatorsCraftsOrQuestions")})
                    Segmented(growthCategories.map(::growthLabel), growthLabel(category)) { label -> category = growthCategories.firstOrNull { growthLabel(it) == label } ?: category }
                    creators.forEach { item -> GrowthCreatorCard(item, if(pass?.optBoolean("enabled")==true) pass?.objects("markers")?.firstOrNull {it.getString("creatorId")==item.getString("id")}?.getString("state") else null) { navigate("/creators/${item.getString("handle")}") } }
                    discoverNextCursor?.let {cursor -> Button(QelvoraCopy.text("growthMoreCreators"), ButtonVariant.SECONDARY, disabled = loading || pagingDiscover) {pageDiscover(cursor)}}
                    if(discoverCursor != null) Button(QelvoraCopy.text("growthFirstPage"), ButtonVariant.QUIET, disabled = loading || pagingDiscover) {pageDiscover(null)}
                    if(pagingDiscover) BasicText(QelvoraCopy.text("growthLoading"), style = qText("caption").copy(color = ink))
                    if (creators.isEmpty() && !loading && error.isEmpty()) EmptyState(QelvoraCopy.text("growthNoCreatorsFound"), QelvoraCopy.text("growthTryAnotherNeedOrBrowseACategory"))
                }
                route.startsWith("/notifications") -> {
                    BasicText(QelvoraCopy.text("growthNotifications"), style = qText("display-lg").copy(color = ink));Button(QelvoraCopy.text("growthSettings"), ButtonVariant.QUIET) {navigate("/notifications/settings")}
                    if(route == "/notifications") notifications.forEach { item -> Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { navigate("/notifications/${item.getString("id")}") }.padding(vertical = 16.dp).semantics {contentDescription = item.getString("sender") + ". " + item.getString("preview")}, verticalArrangement = Arrangement.spacedBy(6.dp)) {BasicText(item.getString("sender"), style = qText("label").copy(color = ink));BasicText(item.getString("preview"), style = qText("body").copy(color = ink))} }
                    if (route == "/notifications" && notifications.isEmpty() && !loading && error.isEmpty()) EmptyState(QelvoraCopy.text("growthNoUpdatesYet"), QelvoraCopy.text("growthYourInAppRecordCannotBeTurnedOff"))
                }
                creator != null -> {
                    val c = creator!!; val name = c.getString("name"); val handle = c.getString("handle")
                    if (route.contains("/chat")) {
                        BasicText(QelvoraCopy.text("aiAuthor", mapOf("name" to name)), style = qText("display-md").copy(color = ink))
                        BasicText(QelvoraCopy.text("identityStrip", mapOf("name" to name)), style = qText("body").copy(color = ink))
                        posts.firstOrNull()?.let {ContextCard(QelvoraCopy.text("growthFromAPost"), it.getString("title")) {navigate("/creators/$handle/chat")}}
                        Notice(title = QelvoraCopy.text("growthConversationServiceNotConnected"), children = QelvoraCopy.text("growthYourEntryContextIsKeptNoMessageHasBeenSent"))
                        Button(QelvoraCopy.text("continueWithPantopus"), block = true) {onSignIn(route)}
                    } else {
                        if (!route.contains("/posts/")) {
                            GrowthCreatorCard(c) {};BasicText(QelvoraCopy.text("growthOfficialMeansAuthorizedThisAiItDoesNotMeanRead2", mapOf("name" to name)), style = qText("caption").copy(color = ink))
                            Button(QelvoraCopy.text("messageAI", mapOf("name" to name)), block = true, disabled = c.getString("state") != "published") {navigate("/creators/$handle/chat")}
                            Button(if (following) QelvoraCopy.text("growthFollowingUnfollow") else QelvoraCopy.text("growthFollow"), ButtonVariant.SECONDARY, block = true) {scope.launch {try {following = client!!.request("follow/${c.getString("id")}", "PUT", JSONObject().put("following", !following)).getBoolean("following")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(failure: Exception) {record(failure)}}}
                            Segmented(growthSections.map(::growthLabel), growthLabel(section)) {label -> section = growthSections.firstOrNull {growthLabel(it) == label} ?: section}
                            when(section) {
                                "Chat" -> {BasicText(QelvoraCopy.text("growthWhatSAiKnows2", mapOf("name" to name)), style = qText("title").copy(color = ink));BasicText(c.getString("sourceSummary"), style = qText("body").copy(color = ink));BasicText(c.getJSONArray("topics").let {values -> (0 until values.length()).joinToString(", ") {values.getString(it)}}, style = qText("body").copy(color = ink));BasicText(c.getString("presence"), style = qText("caption").copy(color = ink))}
                                "Requests" -> {BasicText(QelvoraCopy.text("growthSTimeByRequest2", mapOf("name" to name)), style = qText("title").copy(color = ink));BasicText(c.getString("capacity"), style = qText("body").copy(color = ink));BasicText(c.getString("reliability"), style = qText("caption").copy(color = ink));Notice(title = QelvoraCopy.text("growthCurrentOffers"), children = QelvoraCopy.text("growthRequestsAndPricesNeedTheCreatorSCurrentOfferNo"))}
                                "Access" -> {BasicText(if(c.isNull("membershipLabel")) QelvoraCopy.text("navAccess") else c.getString("membershipLabel"), style = qText("title").copy(color = ink));val lines = c.getJSONArray("accessLines");(0 until lines.length()).forEach {BasicText(lines.getString(it), style = qText("body").copy(color = ink))}}
                                "Posts" -> if(posts.isEmpty()) EmptyState(QelvoraCopy.text("growthNoPublicPostsYet"), QelvoraCopy.text("growthComeBackWhenPublishesSomething2", mapOf("name" to name)))
                            }
                        }
                        if(route.contains("/posts/")) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            IconButton("back", QelvoraCopy.text("growthBackToSPage", mapOf("name" to name)), ink) {navigate("/creators/$handle")}
                            Avatar(name.take(1))
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {BasicText(name, style = qText("body-strong").copy(color = ink));BasicText(QelvoraCopy.text("growthPostPublic"), style = qText("data-sm").copy(color = qColor("ink-muted")))}
                        }
                        if(route.contains("/posts/") || section == "Posts") posts.forEach { post -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            BasicText(post.getString("authorLabel"), style = qText("label").copy(color = qColor("maya-ink")))
                            BasicText(post.getString("title"), style = qText(if(route.contains("/posts/")) "display-lg" else "title").copy(color = ink))
                            BasicText(post.getString("body"), style = qText("voice-md").copy(color = ink))
                            if(route.contains("/posts/") && post.getBoolean("aiContextEligible")) Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(qColor("ai-surface"), RoundedCornerShape(16.dp)).border(1.dp, qColor("ai-line"), RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                AuthorLabel(AuthorKind.AI, name)
                                BasicText(QelvoraCopy.text("growthAskAboutThisPostTheContextStaysWithYourConversation"), style = qText("body").copy(color = ink))
                                Button(QelvoraCopy.text("growthAskSAiAboutThis2", mapOf("name" to name)), ButtonVariant.AI, block = true) {navigate("/creators/$handle/chat?context=${post.getString("id")}")}
                            } else if(!route.contains("/posts/")) Button(QelvoraCopy.text("growthOpenPost"), ButtonVariant.SECONDARY, block = true) {navigate("/creators/$handle/posts/${post.getString("id")}")}
                        } }
                    }
                }
                route == "/home" && home != null -> {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {BasicText(QelvoraCopy.text("growthYourPeople"), style = qText("display-lg").copy(color = ink));Button(QelvoraCopy.text("growthNotifications"), ButtonVariant.QUIET) {navigate("/notifications")}}
                    GrowthPostValuePrompt(client) { navigate(it) }
                    home!!.objects("entries").forEach {entry -> Button(entry.getString("creatorName") + " · " + entry.getString("label"), ButtonVariant.SECONDARY, block = true) {navigate(entry.getString("destination"))} }
                    if(home!!.has("nextThreadsCursor") && !home!!.isNull("nextThreadsCursor")) Button(QelvoraCopy.text("navMore") + ": " + QelvoraCopy.text("growthYourPeople"), ButtonVariant.SECONDARY, disabled = pagingHome) {pageHome(homePostsCursor, home!!.getString("nextThreadsCursor"))}
                    home!!.objects("posts").forEach {update -> val post = update.getJSONObject("post");BasicText(post.getString("authorLabel"), style = qText("label").copy(color = ink));Button(post.getString("title"), ButtonVariant.SECONDARY, block = true) {navigate("/creators/${update.getJSONObject("creator").getString("handle")}/posts/${post.getString("id")}")};BasicText(post.getString("preview"), style = qText("voice-md").copy(color = ink)) }
                    if(home!!.has("nextPostsCursor") && !home!!.isNull("nextPostsCursor")) Button(QelvoraCopy.text("navMore"), ButtonVariant.SECONDARY, disabled = pagingHome) {pageHome(home!!.getString("nextPostsCursor"), homeThreadsCursor)}
                    if(homePostsCursor != null || homeThreadsCursor != null) Button(QelvoraCopy.text("growthLatestFirst"), ButtonVariant.QUIET, disabled = pagingHome) {pageHome(null)}
                    if(pagingHome) BasicText(QelvoraCopy.text("growthLoading"), style = qText("caption").copy(color = ink))
                    if (home!!.objects("entries").isEmpty() && home!!.objects("posts").isEmpty()) EmptyState(QelvoraCopy.text(if(home!!.optInt("followingCount") == 0 && homePostsCursor == null && homeThreadsCursor == null && home!!.isNull("nextThreadsCursor")) "growthPickACreatorToStart" else "growthNoUpdatesYet"), QelvoraCopy.text("growthFindACreatorWhoseWorkYouCareAbout")) {Button(QelvoraCopy.text("navDiscover"), ButtonVariant.SECONDARY) {navigate("/discover")}}
                }
                invitation != null -> {val invite = invitation!!;val name = invite.getJSONObject("creator").getString("name");BasicText(QelvoraCopy.text("growthInvitedYouIn", mapOf("name" to name)), style = qText("display-lg").copy(color = ink));BasicText(QelvoraCopy.text("growthAFirstConversationOfAbout24HoursNoCardNeeded"), style = qText("body").copy(color = ink));Button(QelvoraCopy.text("growthAcceptInvitation"), block = true) {navigate(invite.getString("destination"))} }
                shared != null -> {val card = shared!!;val source = card.optJSONObject("source");if (card.getString("state") != "valid" || source == null) EmptyState(QelvoraCopy.text("growthThisCardWasWithdrawn2"), QelvoraCopy.text("growthPermissionToShareThisReplyIsNoLongerCurrent")) else {val name = source.getString("creatorName");val approved = source.getString("authorKind") == "approved_draft";val cardInk = qColor(if(approved) "ai-ink" else "on-maya");Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(qColor(if(approved) "ai-surface" else "maya-surface")).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {AuthorLabel(kind = if(approved) AuthorKind.APPROVED_DRAFT else AuthorKind.HUMAN_CREATOR, name = name, onMaya = !approved);BasicText(source.getString("text"), style = qText(if(approved) "body" else "voice-md").copy(color = cardInk));BasicText(QelvoraCopy.text("growthSignedByVersion", mapOf("name" to name, "version" to source.getInt("version").toString())), style = qText("caption").copy(color = cardInk))};if (!source.isNull("correction")) Notice(title = QelvoraCopy.text("growthCorrection"), children = source.getString("correction"));if(!card.isNull("verificationURL")) Button(QelvoraCopy.text("growthShareCompleteReply"), ButtonVariant.SECONDARY, block = true, disabled = sharingReply) {exportSharedReply()} else Notice(title = QelvoraCopy.text("growthUnavailable"), children = QelvoraCopy.text("growthImageNeedsOrigin"))} }
            }
            if (loading) BasicText(QelvoraCopy.text("growthLoading2"), style = qText("caption").copy(color = ink))
            if (error.isNotEmpty()) {Notice("error", QelvoraCopy.text("growthUnavailable"), error);if(requiresSignIn) Button(QelvoraCopy.text("continueWithPantopus"), block = true) {onSignIn(route)};Button(QelvoraCopy.text("growthTryAgain"), ButtonVariant.SECONDARY) {refresh++}}
        }
        if(token() == null) TabBar(if(route == "/discover") QelvoraCopy.text("navDiscover") else "Home") {tab -> if(tab == "Home" || tab == "Discover") navigate("/" + tab.lowercase()) else onSignIn("/" + tab.lowercase())}
    }
}

@Composable
private fun GrowthCreatorCard(creator: JSONObject, passState: String? = null, onOpen: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(qColor("surface")).clickable(role = Role.Button, onClick = onOpen)) {
        Row(Modifier.fillMaxWidth().height(150.dp).background(qColor("maya-surface")).padding(16.dp), verticalAlignment = Alignment.Bottom) {BasicText(creator.getString("name"), style = qText("display-md").copy(color = qColor("on-maya")));Spacer(Modifier.weight(1f));BasicText(creator.getString("photoCaption"), style = qText("data-sm").copy(color = qColor("on-maya-muted")))}
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {BasicText(creator.getString("category") + " · " + creator.getString("mode").replace('_', ' '), style = qText("body-strong").copy(color = qColor("ink")));BasicText(creator.getString("biography"), style = qText("body").copy(color = qColor("ink")));BasicText(creator.getString("capacity"), style = qText("caption").copy(color = qColor("ink-muted")));if(passState != null) BasicText(when(passState) {"active" -> QelvoraCopy.text("growthInYourPass");"draft_next" -> QelvoraCopy.text("growthDraftForYourNextPassCycle");else -> QelvoraCopy.text("growthNotInYourPass")}, style = qText("data-sm").copy(color = qColor("ink-muted")))}
    }
}

/** The server requires genuine useful value and persists a shared cap and this retry key. */
@Composable
private fun GrowthPostValuePrompt(client: GrowthClient?, open: (String) -> Unit) {
    val claimId = remember { java.util.UUID.randomUUID().toString() }
    var target by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    LaunchedEffect(client, claimId) {
        try {
            val result = client?.request("engagement/return/claim", "POST", JSONObject().put("id", claimId).put("platform", "android"))
            target = if (result?.optBoolean("eligible") == true) result.getString("target") else null
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { target = null }
    }
    fun choose(choice: String) {
        val destination = target ?: return
        busy = true; error = ""
        scope.launch {
            try {
                client?.request("engagement/return/choice", "PUT", JSONObject().put("id", claimId).put("choice", choice)) ?: throw IllegalStateException()
                target = null
                if (choice == "accepted") open(destination)
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { error = QelvoraCopy.text("growthThisChoiceCouldNotBeSavedTryAgain") }
            finally { busy = false }
        }
    }
    if (target != null) Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText(QelvoraCopy.text("growthKeepUsefulUpdatesWithinReach"), style = qText("title").copy(color = qColor("ink")))
        BasicText(QelvoraCopy.text("growthChoosePushOrEmailInSettingsWhenYouWantUpdates"), style = qText("body").copy(color = qColor("ink")))
        Button(QelvoraCopy.text("growthChooseUpdates"), ButtonVariant.SECONDARY, disabled = busy) { choose("accepted") }
        Button(QelvoraCopy.text("growthLater"), ButtonVariant.QUIET, disabled = busy) { choose("later") }
        Button(QelvoraCopy.text("growthDonTAskAgain"), ButtonVariant.QUIET, disabled = busy) { choose("declined") }
        if (error.isNotEmpty()) Notice("error", QelvoraCopy.text("growthUnavailable"), error)
    }
}

private val growthCategories = listOf("For you", "Crafts", "Music", "Food")
private val growthSections = listOf("Chat", "Posts", "Requests", "Access")
private fun growthLabel(value: String): String {
    val keys = mapOf("For you" to "growthForYou", "Crafts" to "growthCrafts", "Music" to "growthMusic", "Food" to "growthFood", "Chat" to "navChat", "Posts" to "navPosts", "Requests" to "navRequests", "Access" to "navAccess")
    return keys[value]?.let { QelvoraCopy.text(it) } ?: value
}
