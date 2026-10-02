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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.BuildConfig
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.Json

data class ArrivalContext(val source: String, val title: String, val creatorName: String)
class FanSession(private val context: Context, private val baseURL: String?, returnTo: String) {
    private val storage = SecureSessionStorage(context, baseURL)
    fun currentToken(): String? = storage.read()
    val api = baseURL?.let { CreatorAPIClient(it) { storage.read() } }
    var session by mutableStateOf<APISession?>(null); private set
    var hasSavedCredential by mutableStateOf(false); private set
    var checkingSession by mutableStateOf(baseURL != null); private set
    var destination by mutableStateOf(if (ApplicationDestination.isPermitted(returnTo)) returnTo else "/home")
    var error by mutableStateOf("")
    var busy by mutableStateOf(false)
    var choosingActor by mutableStateOf(false)
    var actors by mutableStateOf<List<APIIdentityCapabilitiesDevelopmentActorsItem>>(emptyList())
    var localPurgeFailed by mutableStateOf(false); private set
    var purgingPrivateState by mutableStateOf(false); private set
    var arrival by mutableStateOf<ArrivalContext?>(null); private set
    private var generation = 0
    private var rotatingCredential = false
    private var refreshingSession = false
    private var removedArrivalFor: String? = null
    suspend fun purge(): Boolean = withContext(NonCancellable) {
        if (purgingPrivateState) return@withContext false
        val pushCredential = runCatching { currentToken() }.getOrNull()
        purgingPrivateState = true; localPurgeFailed = true
        try {
            generation++; session = null; hasSavedCredential = false; checkingSession = false; actors = emptyList(); choosingActor = false; error = ""
            GrowthPush.clearSession(context, pushCredential)
            var cleared = true
            try { storage.save(null) } catch (_: Exception) { cleared = false }
            try { com.pantopus.qelvora.conversation.W3FanFeatures.clearPrivateState(context) } catch (_: Exception) { cleared = false }
            localPurgeFailed = !cleared
            if (!cleared) error = QelvoraCopy.text("identityPrivateClearFailed")
            cleared
        } finally { purgingPrivateState = false }
    }
    suspend fun refresh() {
        if (rotatingCredential || refreshingSession || purgingPrivateState) return
        val client = api ?: run { checkingSession = false; return }
        val current = generation
        refreshingSession = true; checkingSession = true
        try {
            val token = try { currentToken() } catch (_: Exception) {
                if (current == generation && purge()) error = QelvoraCopy.text("identitySessionReadFailed")
                return
            }
            if (current != generation) return
            hasSavedCredential = token != null
            if (token == null) { if (session != null) purge(); return }
            try {
                val value = client.identitySession()
                if (current != generation) return
                if (session?.accountId != null && session?.accountId != value.accountId) {
                    if (purge()) error = "The account changed. Continue with Pantopus again."
                    return
                }
                session = value; error = ""
            } catch (failure: CreatorAPIError) {
                if (current != generation) return
                if (failure.status == 401) {
                    if (!busy) {
                        // A completed rotation performs its own guarded fresh read.
                        refreshingSession = false
                        refreshCredentials()
                    } else if (purge()) error = "Your session ended. Continue with Pantopus again."
                } else error = message(failure)
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (current == generation) error = "Reconnect to refresh your account. Actions are unavailable while offline."
            }
        } finally { refreshingSession = false; checkingSession = false }
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
        try {
            if (localPurgeFailed && !purge()) return
            val client = api ?: error("unconfigured")
            val capability = client.identityCapabilities()
            val available = capability.developmentActors.orEmpty()
            if (!capability.signInAvailable) error = QelvoraCopy.text("pantopusUnavailable")
            else if (BuildConfig.DEBUG && capability.mode == APIIdentityCapabilitiesMode.DEVELOPMENT && available.isNotEmpty()) { actors = available; choosingActor = true }
            else error = "Pantopus account authorization is not connected for this native app. Your destination is kept."
        }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { error = QelvoraCopy.text("pantopusUnavailable") }
        finally { busy = false }
    }
    suspend fun selectActor(id: String) {
        if (!BuildConfig.DEBUG || busy) return; val client = api ?: return; busy = true
        try {
            val continuation = client.continueWithPantopus(APIIdentityContinue(destination)); val result = client.completeIdentity(APICompleteIdentity(continuation.continuationId ?: error("missing continuation"), id))
            if (!purge()) return
            currentCoroutineContext().ensureActive()
            try { storage.save(result.token) } catch (_: Exception) { if (purge()) error = QelvoraCopy.text("identitySessionSaveFailed"); return }
            destination = result.returnTo; choosingActor = false; refresh()
        }
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
    /** Preserves the current handle and never writes using a switched credential. */
    suspend fun saveIntro(intro: String, accountId: String, sessionId: String): Boolean {
        val origin = baseURL ?: return false
        val current = session ?: return false
        val fan = current.fan ?: return false
        if (busy || current.accountId != accountId || current.sessionId != sessionId) return false
        val snapshot = generation
        val credential = currentToken() ?: return false
        busy = true
        try {
            val text = intro.trim()
            val client = CreatorAPIClient(origin) { credential }
            val saved = client.saveFanIntro(APIFanIntroInput(text, fan.version))
            currentCoroutineContext().ensureActive()
            if (snapshot != generation || session?.accountId != accountId || session?.sessionId != sessionId || currentToken() != credential || saved.id != fan.id || saved.intro != text) return false
            refresh()
            return snapshot == generation && session?.accountId == accountId && session?.sessionId == sessionId
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { if (snapshot == generation) error = message(failure); return false }
        finally { busy = false }
    }
    suspend fun logout(all: Boolean = false) {
        if (busy) return; val client = api ?: run { purge(); return }; busy = true
        try { if (all) client.revokeSessions() else client.logout(); purge() }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: CreatorAPIError) { if (failure.status == 401) purge() else error = message(failure) }
        catch (_: Exception) { error = "Sign-out could not reach the server. Retry to revoke the session." }
        finally { busy = false }
    }
    suspend fun refreshCredentials() {
        if (busy) return; val client = api ?: return; busy = true; rotatingCredential = true; generation++; val current = generation
        try {
            val previous = currentToken() ?: run { purge(); return }
            // A foreground cancellation must not discard a completed one-use rotation.
            val persisted = withContext(NonCancellable) {
                val result = client.refreshSession()
                if (current != generation) return@withContext false
                try { storage.save(result.token, replacing = previous); true }
                catch (_: Exception) { if (purge()) error = QelvoraCopy.text("identitySessionSaveFailed"); false }
            }
            if (!persisted || current != generation) return
            generation++; rotatingCredential = false; refresh()
        }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: CreatorAPIError) { if (current == generation) { if (failure.status == 401) { if (purge()) error = message(failure) } else error = message(failure) } }
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
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(returnTo, destinationDelivery) { model.open(returnTo) }
    LaunchedEffect(model.destination) { model.loadArrival() }
    LaunchedEffect(model, foreground) { if (foreground) { model.refresh(); while (true) { delay(4000); if (!model.choosingActor && !model.busy) model.refresh() } } }
    LaunchedEffect(model.session) { GrowthPush.refresh(context) }
    LaunchedEffect(notificationID, destinationDelivery, model.session?.accountId) {
        val id = notificationID ?: return@LaunchedEffect
        if (model.session == null) return@LaunchedEffect
        val captured = runCatching { model.currentToken() }.getOrNull() ?: return@LaunchedEffect
        val sameCredential = { runCatching { model.currentToken() }.getOrNull() == captured }
        val origin = baseURL ?: return@LaunchedEffect
        try { val target = GrowthPush.resolveTap(GrowthClient(origin, model::currentToken), id, captured); if (sameCredential()) model.open(target) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { if (sameCredential()) { model.open("/notifications"); model.error = QelvoraCopy.text("growthUpdateUnavailable") } }
        finally { if (sameCredential()) onNotificationConsumed() }
    }
    Column(Modifier.fillMaxSize().background(qColor("ground")).windowInsetsPadding(WindowInsets.safeDrawing)) {
        if (model.error.isNotEmpty()) Notice("error", "Account status", model.error)
        if (model.localPurgeFailed) Button(QelvoraCopy.text("identityPrivateClearRetry"), ButtonVariant.SECONDARY, block = true, disabled = model.busy || model.purgingPrivateState) { scope.launch { model.purge() } }
        when {
            model.choosingActor -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Notice(title = "Development identity", children = "Synthetic isolated accounts. Pantopus production sign-in is not connected.")
                model.actors.forEach { actor -> Button(actor.label, ButtonVariant.SECONDARY, block = true, disabled = model.busy) { scope.launch { model.selectActor(actor.id) } } }
                Button("Cancel", ButtonVariant.QUIET) { model.choosingActor = false }
            }
            model.session == null && features.any { it.matches(model.destination) && it.allowsSignedOut(model.destination) } -> key(model.destination, destinationDelivery) { features.first { it.matches(model.destination) && it.allowsSignedOut(model.destination) }.screen(model) }
            model.session == null && model.hasSavedCredential -> Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                BasicText(QelvoraCopy.text(if (model.checkingSession && model.error.isEmpty()) "growthLoading" else "accountUnavailableTitle"), style = qText("display-md").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
                BasicText(QelvoraCopy.text("accountUnavailableBody"), style = qText("body").copy(color = qColor("ink-muted")))
                Button(QelvoraCopy.text("retry"), ButtonVariant.SECONDARY, block = true, disabled = model.busy || model.checkingSession) { scope.launch { model.refresh() } }
            }
            model.session == null && model.checkingSession -> BasicText(QelvoraCopy.text("growthLoading"), style = qText("body").copy(color = qColor("ink")), modifier = Modifier.padding(16.dp))
            model.session == null -> Welcome(returnTo = model.destination, showContext = model.arrival != null, contextSource = model.arrival?.source, contextTitle = model.arrival?.title, bodyCopy = model.arrival?.let { "Every message says who wrote it: ${it.creatorName}'s AI, ${it.creatorName}, or their team. You'll always know which." } ?: "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which.", onRemoveContext = model::removeArrival, onContinue = { scope.launch { model.beginSignIn() } })
            model.session?.fan == null && features.any { it.matches(model.destination) && it.allowsSignedOut(model.destination) } -> key(model.session?.accountId, model.destination) { features.first { it.matches(model.destination) && it.allowsSignedOut(model.destination) }.screen(model) }
            (model.session?.fan == null && model.destination != "/identity/account") || model.destination == "/onboarding/handle" -> HandleForm(model)
            else -> {
                if (model.session?.mode == APISessionMode.DEVELOPMENT) Notice(title = "Development identity", children = "Synthetic account · actual local API.")
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    val feature = features.firstOrNull { it.matches(model.destination) }
                    if (model.destination == "/identity/account" || (model.destination == "/you" && feature == null)) Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        BasicText("Your account", style = qText("display-md").copy(color = qColor("ink")))
                        model.session?.fan?.handle?.let { handle -> BasicText("@$handle", style = qText("body").copy(color = qColor("ink"))) }
                        Button(QelvoraCopy.text(if (model.session?.fan == null) "identityChooseHandle" else "identityEditPublicProfile"), ButtonVariant.SECONDARY, block = true) { model.destination = "/onboarding/handle" }
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
                val path = model.destination.substringBefore('?')
                val accountDestination = path.startsWith("/identity/") || path == "/support" || path.startsWith("/support/") || path == "/notifications/settings"
                val selectedTab = if (accountDestination) "navYou" else labels.firstOrNull { path == it.second || path.startsWith(it.second + "/") }?.first ?: "navHome"
                TabBar(QelvoraCopy.text(selectedTab)) { label -> model.destination = labels.first { QelvoraCopy.text(it.first) == label }.second }
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
                if (model.session?.fan != null) {
                    Column(Modifier.background(qColor("surface"), RoundedCornerShape(16.dp)).border(1.dp, qColor("line"), RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        BasicText("A LINE ABOUT YOU · OPTIONAL", style = qText("data-sm").copy(color = qColor("ink-muted")))
                        BasicTextField(intro, { intro = it.take(240) }, Modifier.fillMaxWidth().heightIn(min = 90.dp).semantics { contentDescription = "A line about you, optional" }, textStyle = qText("body").copy(color = qColor("ink")))
                        BasicText("You choose, per creator, whether their AI may use this.", style = qText("caption").copy(color = qColor("ink-muted")))
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
            Button(if (model.busy) "Saving…" else "Continue", ButtonVariant.SECONDARY, "lg", block = true, disabled = model.busy) { scope.launch { model.saveHandle(handle, if (model.session?.fan == null) "" else intro) } }
        }
    }
}
