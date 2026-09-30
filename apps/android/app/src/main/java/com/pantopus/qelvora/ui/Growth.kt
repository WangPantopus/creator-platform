package com.pantopus.qelvora.ui

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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.input.ImeAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class GrowthRequestFailure(val status: Int): Exception(when(status) {401 -> "Continue with Pantopus to open your account's current state.";403 -> "This action is unavailable to this account.";404 -> "This destination is no longer available.";else -> "The service is unavailable. Reconnect and try again."})

/** Session credential comes from W1; no growth-owned credential persistence. */
class GrowthClient(private val origin: String, private val token: () -> String? = { null }) {
    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(URL(origin), "/v1/growth/$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method; connection.connectTimeout = 5000; connection.readTimeout = 10000
            connection.useCaches = false; connection.setRequestProperty("Content-Type", "application/json")
            if(!path.startsWith("public/")) token()?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) { connection.doOutput = true; connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            if (connection.responseCode !in 200..299) throw GrowthRequestFailure(connection.responseCode)
            val response = connection.inputStream.use { it.readNBytes(1_000_001) }
            if (response.size > 1_000_000) throw IllegalStateException("This response is unavailable.")
            JSONObject(response.toString(Charsets.UTF_8))
        } finally { connection.disconnect() }
    }
    suspend fun registerDevice(installationId: String, registration: String, granted: Boolean) = request("devices", "PUT", JSONObject().put("installationId", installationId).put("platform", "android").put("token", registration).put("permission", if (granted) "granted" else "denied"))
    suspend fun revokeDevice(installationId: String) = request("devices/$installationId", "DELETE")
}

private fun JSONObject.objects(key: String): List<JSONObject> {val values = optJSONArray(key) ?: return emptyList(); return (0 until values.length()).mapNotNull { values.optJSONObject(it) }}

/** W1 registers this fan feature and owns auth, deep-link resolution and permission prompts. */
@Composable
fun GrowthFanFeature(baseUrl: String?, token: () -> String? = { null }, destination: String = "/discover", onSignIn: (String) -> Unit = {}) {
    var route by remember(destination) { mutableStateOf(destination) }
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("For you") }
    var section by remember { mutableStateOf("Chat") }
    var refresh by remember { mutableIntStateOf(0) }
    var creators by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var pass by remember { mutableStateOf<JSONObject?>(null) }
    var creator by remember { mutableStateOf<JSONObject?>(null) }
    var posts by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var home by remember { mutableStateOf<JSONObject?>(null) }
    var invitation by remember { mutableStateOf<JSONObject?>(null) }
    var shared by remember { mutableStateOf<JSONObject?>(null) }
    var following by remember { mutableStateOf(false) }
    var notifications by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var error by remember { mutableStateOf("") }
    var requiresSignIn by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val client = remember(baseUrl) { baseUrl?.let { GrowthClient(it, token) } }
    val ink = qColor("ink")
    fun record(failure: Exception) {requiresSignIn = (failure as? GrowthRequestFailure)?.status == 401;error = if(failure is GrowthRequestFailure) failure.message!! else "This destination is unavailable. Reconnect and try again."}
    LaunchedEffect(route, refresh, category) {
        error = ""; requiresSignIn = false; loading = true
        try {
            creator = null; posts = emptyList(); home = null; invitation = null; shared = null
            if (client == null) throw IllegalStateException("The growth service is not configured.")
            when {
                route == "/discover" -> { val result = client.request("public/creators?q=${URLEncoder.encode(query, "UTF-8")}&category=${if (category == "For you") "" else category}"); creators = result.objects("creators");pass = null;pass = try {client.request("discovery-access")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(_: Exception) {null} }
                route == "/home" -> home = client.request("home")
                route.startsWith("/invite/") -> invitation = client.request("public/invites/${route.removePrefix("/invite/")}")
                route.startsWith("/share/") -> shared = client.request("public/shares/${route.removePrefix("/share/")}")
                route == "/notifications/settings" -> Unit
                route == "/notifications" -> notifications = client.request("notifications").objects("notifications")
                route.startsWith("/creators/") -> {
                    val pieces = route.substringBefore('?').split('/'); val handle = pieces.getOrNull(2) ?: throw IllegalStateException("This creator is unavailable.")
                    val result = if (route.contains("/posts/")) client.request("public/creators/$handle/posts/${pieces.last()}") else client.request("public/creators/$handle")
                    creator = result.getJSONObject("creator"); posts = if (result.has("post")) listOf(result.getJSONObject("post")) else result.objects("posts")
                    if (route.contains("context=")) {val id = route.substringAfter("context="); require(Regex("[a-f0-9-]{36}").matches(id)); val context = client.request("public/creators/$handle/posts/$id").getJSONObject("post"); require(context.getBoolean("aiContextEligible")); posts = listOf(context)}
                    else if (route.contains("/chat")) posts = emptyList()
                    following = try {client.request("follow/${creator!!.getString("id")}").getBoolean("following")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(_: Exception) {false}
                }
                route != "/home" -> throw IllegalStateException("This destination is not connected yet.")
            }
        } catch (cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch (failure: Exception) {creator = null; creators = emptyList(); posts = emptyList(); notifications = emptyList(); record(failure)}
        finally {loading = false}
    }
    Column(Modifier.fillMaxSize().background(qColor("ground"))) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                route == "/notifications/settings" -> GrowthNotificationSettings(client)
                route == "/discover" -> {
                    BasicText("Discover", style = qText("display-lg").copy(color = ink))
                    BasicTextField(query, onValueChange = { query = it.take(120) }, textStyle = qText("body").copy(color = ink), singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = {refresh++}), decorationBox = {inner -> Box {if(query.isEmpty()) BasicText("Search creators, crafts or questions", style = qText("body").copy(color = qColor("ink-muted")));inner()}}, modifier = Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(12.dp)).padding(14.dp).semantics {contentDescription = "Search creators, crafts or questions"})
                    Segmented(listOf("For you", "Crafts", "Music", "Food"), category) { category = it }
                    creators.forEach { item -> GrowthCreatorCard(item, if(pass?.optBoolean("enabled")==true) pass?.objects("markers")?.firstOrNull {it.getString("creatorId")==item.getString("id")}?.getString("state") else null) { route = "/creators/${item.getString("handle")}" } }
                    if (creators.isEmpty() && !loading && error.isEmpty()) EmptyState("No creators found", "Try another need or browse a category.")
                }
                route == "/notifications" -> {
                    BasicText("Notifications", style = qText("display-lg").copy(color = ink));Button("Settings", ButtonVariant.QUIET) {route = "/notifications/settings"}
                    notifications.forEach { item -> Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { scope.launch {try {client?.request("notifications/${item.getString("id")}/read", "PUT", JSONObject());route = item.getString("destination")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(failure: Exception) {record(failure)}} }.padding(vertical = 16.dp).semantics {contentDescription = item.getString("sender") + ". " + item.getString("preview")}, verticalArrangement = Arrangement.spacedBy(6.dp)) {BasicText(item.getString("sender"), style = qText("label").copy(color = ink));BasicText(item.getString("preview"), style = qText("body").copy(color = ink))} }
                    if (notifications.isEmpty() && !loading && error.isEmpty()) EmptyState("No updates yet", "Your in-app record cannot be turned off.")
                }
                creator != null -> {
                    val c = creator!!; val name = c.getString("name"); val handle = c.getString("handle")
                    if (route.contains("/chat")) {
                        BasicText("$name's AI", style = qText("display-md").copy(color = ink))
                        BasicText("You're talking to $name's AI · $name steps in on request.", style = qText("body").copy(color = ink))
                        posts.firstOrNull()?.let {ContextCard("From a post", it.getString("title")) {route = "/creators/$handle/chat"}}
                        Notice(title = "Conversation service not connected", children = "Your entry context is kept. No message has been sent.")
                        Button("Continue with Pantopus", block = true) {onSignIn(route)}
                    } else {
                        if (!route.contains("/posts/")) {
                            GrowthCreatorCard(c) {};BasicText("Official means $name authorized this AI. It does not mean $name read your message.", style = qText("caption").copy(color = ink))
                            Button("Message $name's AI", block = true, disabled = c.getString("state") != "published") {route = "/creators/$handle/chat"}
                            Button(if (following) "Following · unfollow" else "Follow", ButtonVariant.SECONDARY, block = true) {scope.launch {try {following = client!!.request("follow/${c.getString("id")}", "PUT", JSONObject().put("following", !following)).getBoolean("following")}catch(cancelled: kotlinx.coroutines.CancellationException) {throw cancelled} catch(failure: Exception) {record(failure)}}}
                            Segmented(listOf("Chat", "Posts", "Requests", "Access"), section) {section = it}
                            when(section) {
                                "Chat" -> {BasicText("What $name's AI knows", style = qText("title").copy(color = ink));BasicText(c.getString("sourceSummary"), style = qText("body").copy(color = ink));BasicText(c.getJSONArray("topics").let {values -> (0 until values.length()).joinToString(", ") {values.getString(it)}}, style = qText("body").copy(color = ink));BasicText(c.getString("presence"), style = qText("caption").copy(color = ink))}
                                "Requests" -> {BasicText("$name's time, by request", style = qText("title").copy(color = ink));BasicText(c.getString("capacity"), style = qText("body").copy(color = ink));BasicText(c.getString("reliability"), style = qText("caption").copy(color = ink));Notice(title = "Current offers", children = "Requests and prices need the creator's current offer. No offer is connected here yet.")}
                                "Access" -> {BasicText(if(c.isNull("membershipLabel")) "Access" else c.getString("membershipLabel"), style = qText("title").copy(color = ink));val lines = c.getJSONArray("accessLines");(0 until lines.length()).forEach {BasicText(lines.getString(it), style = qText("body").copy(color = ink))}}
                                "Posts" -> if(posts.isEmpty()) EmptyState("No public posts yet", "Come back when $name publishes something.")
                            }
                        }
                        if(route.contains("/posts/")) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            IconButton("back", "Back to $name's page", ink) {route = "/creators/$handle"}
                            Avatar(name.take(1))
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {BasicText(name, style = qText("body-strong").copy(color = ink));BasicText("POST · PUBLIC", style = qText("data-sm").copy(color = qColor("ink-muted")))}
                        }
                        if(route.contains("/posts/") || section == "Posts") posts.forEach { post -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            BasicText(post.getString("authorLabel"), style = qText("label").copy(color = qColor("maya-ink")))
                            BasicText(post.getString("title"), style = qText(if(route.contains("/posts/")) "display-lg" else "title").copy(color = ink))
                            BasicText(post.getString("body"), style = qText("voice-md").copy(color = ink))
                            if(route.contains("/posts/") && post.getBoolean("aiContextEligible")) Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(qColor("ai-surface"), RoundedCornerShape(16.dp)).border(1.dp, qColor("ai-line"), RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                AuthorLabel(AuthorKind.AI, name)
                                BasicText("Ask about this post. The context stays with your conversation.", style = qText("body").copy(color = ink))
                                Button("Ask $name's AI about this", ButtonVariant.AI, block = true) {route = "/creators/$handle/chat?context=${post.getString("id")}"}
                            } else if(!route.contains("/posts/")) Button("Open post", ButtonVariant.SECONDARY, block = true) {route = "/creators/$handle/posts/${post.getString("id")}"}
                        } }
                    }
                }
                route == "/home" && home != null -> {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {BasicText("Your people", style = qText("display-lg").copy(color = ink));Button("Notifications", ButtonVariant.QUIET) {route = "/notifications"}}
                    GrowthPostValuePrompt(client) { route = it }
                    home!!.objects("entries").forEach {entry -> Button(entry.getString("creatorName") + " · " + entry.getString("label"), ButtonVariant.SECONDARY, block = true) {route = entry.getString("destination")} }
                    home!!.objects("posts").forEach {update -> val post = update.getJSONObject("post");BasicText(post.getString("authorLabel"), style = qText("label").copy(color = ink));Button(post.getString("title"), ButtonVariant.SECONDARY, block = true) {route = "/creators/${update.getJSONObject("creator").getString("handle")}/posts/${post.getString("id")}"} }
                    if (home!!.objects("entries").isEmpty() && home!!.objects("posts").isEmpty()) EmptyState("Pick a creator to start", "Find a creator whose work you care about.") {Button("Discover", ButtonVariant.SECONDARY) {route = "/discover"}}
                }
                invitation != null -> {val invite = invitation!!;val name = invite.getJSONObject("creator").getString("name");BasicText("$name invited you in", style = qText("display-lg").copy(color = ink));BasicText("A first conversation of about 24 hours · no card needed.", style = qText("body").copy(color = ink));Button("Accept invitation", block = true) {route = invite.getString("destination")} }
                shared != null -> {val card = shared!!;val source = card.optJSONObject("source");if (card.getString("state") != "valid" || source == null) EmptyState("This card was withdrawn", "Permission to share this reply is no longer current.") else {val name = source.getString("creatorName");BasicText(if (source.getString("authorKind") == "approved_draft") "Prepared by AI · approved by $name" else "$name · personal reply", style = qText("label").copy(color = ink));BasicText(source.getString("text"), style = qText("voice-md").copy(color = ink));BasicText("Signed by $name · version ${source.getInt("version")}", style = qText("caption").copy(color = ink));if (!source.isNull("correction")) Notice(title = "Correction", children = source.getString("correction"))} }
            }
            if (loading) BasicText("Loading…", style = qText("caption").copy(color = ink))
            if (error.isNotEmpty()) {Notice("error", "Unavailable", error);if(requiresSignIn) Button("Continue with Pantopus", block = true) {onSignIn(route)};Button("Try again", ButtonVariant.SECONDARY) {refresh++}}
        }
        if(token() == null) TabBar(if(route == "/discover") "Discover" else "Home") {tab -> if(tab == "Home" || tab == "Discover") route = "/" + tab.lowercase() else onSignIn("/" + tab.lowercase())}
    }
}

@Composable
private fun GrowthCreatorCard(creator: JSONObject, passState: String? = null, onOpen: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(qColor("surface")).clickable(role = Role.Button, onClick = onOpen)) {
        Row(Modifier.fillMaxWidth().height(150.dp).background(qColor("maya-surface")).padding(16.dp), verticalAlignment = Alignment.Bottom) {BasicText(creator.getString("name"), style = qText("display-md").copy(color = qColor("on-maya")));Spacer(Modifier.weight(1f));BasicText(creator.getString("photoCaption"), style = qText("data-sm").copy(color = qColor("on-maya-muted")))}
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {BasicText(creator.getString("category") + " · " + creator.getString("mode").replace('_', ' '), style = qText("body-strong").copy(color = qColor("ink")));BasicText(creator.getString("biography"), style = qText("body").copy(color = qColor("ink")));BasicText(creator.getString("capacity"), style = qText("caption").copy(color = qColor("ink-muted")));if(passState != null) BasicText(when(passState) {"active" -> "In your pass";"draft_next" -> "Draft for your next pass cycle";else -> "Not in your pass"}, style = qText("data-sm").copy(color = qColor("ink-muted")))}
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
            catch (_: Exception) { error = "This choice could not be saved. Try again." }
            finally { busy = false }
        }
    }
    if (target != null) Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        BasicText("Keep useful updates within reach", style = qText("title").copy(color = qColor("ink")))
        BasicText("Choose push or email in settings when you want updates. You can change them any time.", style = qText("body").copy(color = qColor("ink")))
        Button("Choose updates", ButtonVariant.SECONDARY, disabled = busy) { choose("accepted") }
        Button("Later", ButtonVariant.QUIET, disabled = busy) { choose("later") }
        Button("Don't ask again", ButtonVariant.QUIET, disabled = busy) { choose("declined") }
        if (error.isNotEmpty()) Notice("error", "Unavailable", error)
    }
}
