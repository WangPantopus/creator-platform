package com.pantopus.qelvora.identity

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.BuildConfig
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

data class ArrivalContext(val source: String, val title: String, val creatorName: String)
class FanSession(private val context: Context, private val baseURL: String?, returnTo: String) {
    private val storage = SecureSessionStorage(context)
    fun currentToken(): String? = storage.read()
    val api = baseURL?.let { CreatorAPIClient(it) { storage.read() } }
    var session by mutableStateOf<APISession?>(null); private set
    var destination by mutableStateOf(if (ApplicationDestination.isPermitted(returnTo)) returnTo else "/home")
    var error by mutableStateOf("")
    var busy by mutableStateOf(false)
    var choosingActor by mutableStateOf(false)
    var actors by mutableStateOf<List<APIIdentityCapabilitiesDevelopmentActorsItem>>(emptyList())
    var arrival by mutableStateOf<ArrivalContext?>(null); private set
    private var generation = 0
    private var rotatingCredential = false
    private var removedArrivalFor: String? = null
    private suspend fun purge() { GrowthPush.clearSession(context, currentToken()); generation++; session = null; actors = emptyList(); error = ""; storage.save(null); com.pantopus.qelvora.conversation.W3FanFeatures.clearPrivateState(context) }
    suspend fun refresh() {
        if (rotatingCredential) return
        val client = api ?: return; val current = generation
        if (currentToken() == null) { session = null; return }
        try { val value = client.identitySession(); if (current != generation) return; if (session?.accountId != null && session?.accountId != value.accountId) { purge(); error = "The account changed. Continue with Pantopus again."; return }; session = value; error = "" }
        catch (failure: CreatorAPIError) { if (current != generation) return; if (failure.status == 401) { if (!busy) refreshCredentials() else { purge(); error = "Your session ended. Continue with Pantopus again." } } else error = message(failure) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { if (current == generation) error = "Reconnect to refresh your account. Actions are unavailable while offline." }
    }
    suspend fun loadArrival() {
        val snapshot = destination; arrival = null; val origin = baseURL ?: return
        if (snapshot.substringBefore('?') == removedArrivalFor) return
        val handle = snapshot.removePrefix("/creators/").substringBefore('/').substringBefore('?')
        if (!snapshot.startsWith("/creators/")) return
        try { val creator = GrowthClient(origin).request("public/creators/$handle").getJSONObject("creator"); if (snapshot == destination) { val name = creator.getString("name"); arrival = ArrivalContext("You came from $name's page", "$name · ${creator.getString("category")}", name) } }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { /* No invented public projection. */ }
    }
    fun removeArrival() { arrival = null; removedArrivalFor = destination.substringBefore('?'); destination = removedArrivalFor!! }
    suspend fun beginSignIn() {
        if (busy) return; busy = true
        try { val client = api ?: error("unconfigured"); val capability = client.identityCapabilities(); if (BuildConfig.DEBUG && capability.mode == APIIdentityCapabilitiesMode.DEVELOPMENT) { actors = capability.developmentActors.orEmpty(); choosingActor = true } else error = "Pantopus account authorization is not connected for this native app. Your destination is kept." }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { error = QelvoraCopy.text("pantopusUnavailable") }
        finally { busy = false }
    }
    suspend fun selectActor(id: String) {
        if (!BuildConfig.DEBUG || busy) return; val client = api ?: return; busy = true
        try { val continuation = client.continueWithPantopus(APIIdentityContinue(destination)); val result = client.completeIdentity(APICompleteIdentity(continuation.continuationId ?: error("missing continuation"), id)); purge(); storage.save(result.token); destination = result.returnTo; choosingActor = false; refresh() }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { error = message(failure) }
        finally { busy = false }
    }
    suspend fun saveHandle(handle: String, intro: String) {
        if (busy) return; val client = api ?: return; busy = true
        try { client.saveFanProfile(APIFanProfileInput(handle, intro)); refresh(); if (session?.fan != null && destination == "/onboarding/handle") destination = "/you" }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { error = message(failure) }
        finally { busy = false }
    }
    suspend fun logout(all: Boolean = false) {
        if (busy) return; val client = api ?: return; busy = true
        try { if (all) client.revokeSessions() else client.logout(); purge() }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: CreatorAPIError) { if (failure.status == 401) purge() else error = message(failure) }
        catch (_: Exception) { error = "Sign-out could not reach the server. Retry to revoke the session." }
        finally { busy = false }
    }
    suspend fun refreshCredentials() {
        if (busy) return; val client = api ?: return; busy = true; rotatingCredential = true; generation++; val current = generation
        try { val result = client.refreshSession(); if (current != generation) return; storage.save(result.token); generation++; rotatingCredential = false; refresh() }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: CreatorAPIError) { if (current == generation) { if (failure.status == 401) purge(); error = message(failure) } }
        catch (_: Exception) { if (current == generation) error = "Session refresh could not complete. Reconnect and try again." }
        finally { busy = false; rotatingCredential = false }
    }
    fun open(target: String) { if (ApplicationDestination.isPermitted(target)) { removedArrivalFor = null; destination = target } else error = "This link is unavailable. Open the object from the app." }
    private fun message(failure: Exception): String = if (failure is CreatorAPIError) runCatching { Json.decodeFromString<APIError>(failure.body).error.message }.getOrDefault("This action could not complete. Reconnect and try again.") else "This action could not complete. Reconnect and try again."
}

class FanFeatureRegistration(val matches: (String) -> Boolean, val allowsSignedOut: (String) -> Boolean = { false }, val screen: @Composable (FanSession) -> Unit)

@Composable
fun FanAppShell(context: Context, baseURL: String? = null, returnTo: String = "/home", features: List<FanFeatureRegistration> = emptyList(), destinationDelivery: Long = 0L, notificationID: String? = null, onNotificationConsumed: () -> Unit = {}) {
    val model = remember(baseURL) { FanSession(context, baseURL, returnTo) }; val scope = rememberCoroutineScope()
    LaunchedEffect(returnTo, destinationDelivery) { model.open(returnTo) }
    LaunchedEffect(model.destination) { model.loadArrival() }
    LaunchedEffect(model) { model.refresh(); while (true) { delay(4000); if (model.session != null) model.refresh() } }
    LaunchedEffect(model.session?.accountId, model.currentToken()) { GrowthPush.refresh(context) }
    LaunchedEffect(notificationID, destinationDelivery, model.session?.accountId) {
        val id = notificationID ?: return@LaunchedEffect
        if (model.session == null) return@LaunchedEffect
        val captured = model.currentToken() ?: return@LaunchedEffect
        val origin = baseURL ?: return@LaunchedEffect
        try { val target = GrowthPush.resolveTap(GrowthClient(origin, model::currentToken), id, captured); if (model.currentToken() == captured) model.open(target) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { if (model.currentToken() == captured) { model.open("/notifications"); model.error = QelvoraCopy.text("growthUpdateUnavailable") } }
        finally { if (model.currentToken() == captured) onNotificationConsumed() }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).windowInsetsPadding(WindowInsets.safeDrawing)) {
        if (model.error.isNotEmpty()) Notice("error", "Account status", model.error)
        when {
            model.choosingActor -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Notice(title = "Development identity", children = "Synthetic isolated accounts. Pantopus production sign-in is not connected.")
                model.actors.forEach { actor -> Button(actor.label, ButtonVariant.SECONDARY, block = true, disabled = model.busy) { scope.launch { model.selectActor(actor.id) } } }
                Button("Cancel", ButtonVariant.QUIET) { model.choosingActor = false }
            }
            model.session == null && features.any { it.matches(model.destination) && it.allowsSignedOut(model.destination) } -> key(model.destination, destinationDelivery) { features.first { it.matches(model.destination) && it.allowsSignedOut(model.destination) }.screen(model) }
            model.session == null -> Welcome(returnTo = model.destination, showContext = model.arrival != null, contextSource = model.arrival?.source, contextTitle = model.arrival?.title, bodyCopy = model.arrival?.let { "Every message says who wrote it: ${it.creatorName}'s AI, ${it.creatorName}, or their team. You'll always know which." } ?: "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which.", onRemoveContext = model::removeArrival, onContinue = { scope.launch { model.beginSignIn() } })
            model.session?.fan == null || model.destination == "/onboarding/handle" -> HandleForm(model)
            else -> {
                if (model.session?.mode == APISessionMode.DEVELOPMENT) Notice(title = "Development identity", children = "Synthetic account · actual local API.")
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    val feature = features.firstOrNull { it.matches(model.destination) }
                    if (model.destination == "/identity/account" || (model.destination == "/you" && feature == null)) Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        BasicText("Your account", style = qText("display-md").copy(color = qColor("ink")))
                        BasicText("@" + model.session?.fan?.handle.orEmpty(), style = qText("body").copy(color = qColor("ink")))
                        Button("Edit public profile", ButtonVariant.SECONDARY, block = true) { model.destination = "/onboarding/handle" }
                        Button("Sign out", ButtonVariant.SECONDARY, block = true) { scope.launch { model.logout() } }
                        Button("Refresh session", ButtonVariant.SECONDARY, block = true, disabled = model.busy) { scope.launch { model.refreshCredentials() } }
                        Button("Sign out on all devices", ButtonVariant.QUIET, block = true) { scope.launch { model.logout(true) } }
                        Button("Help and reports", ButtonVariant.QUIET, block = true) { model.open("/support") }
                        Button("Your data", ButtonVariant.QUIET, block = true) { model.open("/support/privacy") }
                        Button("Notification settings", ButtonVariant.QUIET, block = true) { model.open("/notifications/settings") }
                        if (model.session?.creator != null && context is android.app.Activity) CredentialSettings(context, model)
                    } else if (feature != null) key(model.session?.accountId, model.destination, destinationDelivery) { feature.screen(model) }
                    else Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { BasicText("This destination is not connected yet", style = qText("title").copy(color = qColor("ink"))); BasicText("Your account and arrival context are kept.", style = qText("body").copy(color = qColor("ink-muted"))); Button("Your account", ButtonVariant.SECONDARY) { model.destination = "/you" } }
                }
                val labels = listOf("navHome" to "/home", "navDiscover" to "/discover", "navRequests" to "/requests", "navYou" to "/you")
                TabBar(labels.firstOrNull { it.second == model.destination }?.let { QelvoraCopy.text(it.first) } ?: QelvoraCopy.text("navHome")) { label -> model.destination = labels.first { QelvoraCopy.text(it.first) == label }.second }
            }
        }
    }
}

@Composable
private fun HandleForm(model: FanSession) {
    var handle by remember(model.session?.accountId) { mutableStateOf(model.session?.fan?.handle.orEmpty()) }; var intro by remember(model.session?.accountId) { mutableStateOf(model.session?.fan?.intro.orEmpty()) }; val scope = rememberCoroutineScope()
    BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
        val available = maxHeight
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = available).padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 36.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(44.dp).clickable(role = Role.Button) { model.open("/you") }.semantics { contentDescription = "Back" }, contentAlignment = Alignment.Center) { Glyph("back", 22.dp, qColor("ink")) }
                    BasicText(if (model.session?.mode == APISessionMode.DEVELOPMENT) "DEVELOPMENT SIGN-IN" else "SIGNED IN WITH PANTOPUS", style = qText("data-sm").copy(color = qColor("ink-muted")))
                }
                BasicText("How creators will know you", Modifier.semantics { heading() }, style = qText("display-lg").copy(color = qColor("ink")))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    BasicText("Handle", style = qText("caption", true).copy(color = qColor("ink-muted")))
                    BasicTextField(handle, { handle = it.take(31) }, Modifier.fillMaxWidth().heightIn(min = 44.dp).background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("control-line"), RoundedCornerShape(12.dp)).padding(12.dp).semantics { contentDescription = "Public handle, a pseudonym is allowed" }, textStyle = qText("body").copy(color = qColor("ink")), singleLine = true, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false))
                    BasicText("Creators and their teams see your handle, never your name or city unless you share them in a request.", style = qText("caption").copy(color = qColor("ink-muted")))
                }
                Column(Modifier.background(qColor("surface"), RoundedCornerShape(16.dp)).border(1.dp, qColor("line"), RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    BasicText("A LINE ABOUT YOU · OPTIONAL", style = qText("data-sm").copy(color = qColor("ink-muted")))
                    BasicTextField(intro, { intro = it.take(240) }, Modifier.fillMaxWidth().heightIn(min = 90.dp).semantics { contentDescription = "A line about you, optional" }, textStyle = qText("body").copy(color = qColor("ink")))
                    BasicText("You choose, per creator, whether their AI may use this.", style = qText("caption").copy(color = qColor("ink-muted")))
                }
                Spacer(Modifier.height(24.dp))
            }
            Button(if (model.busy) "Saving…" else "Continue", ButtonVariant.SECONDARY, "lg", block = true, disabled = model.busy) { scope.launch { model.saveHandle(handle, intro) } }
        }
    }
}
