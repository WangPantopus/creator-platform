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
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import com.pantopus.qelvora.studio.StudioTeamFeature
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.json.Json

data class ArrivalContext(val source: String, val title: String, val creatorName: String)
private val requestCaptureIssuer = Any()
/** Client lifetime only. Check before a request/handoff and before applying
 * its result. Credentials remain in the actual issuer-bound session model. */
class FanSessionRequestCapture private constructor(
    val client: CreatorAPIClient, val expectedAccountId: String,
    val sessionId: String, val destination: String,
    private val trustReady: () -> Boolean,
    private val current: suspend () -> Boolean,
) {
    @androidx.annotation.MainThread
    suspend fun isCurrent(): Boolean { currentCoroutineContext().ensureActive(); return current() }
    /** Keep the original issuer/client, bounds and cancellable operation. */
    @androidx.annotation.MainThread
    suspend fun trustBytes(path: String, body: ByteArray? = null, binary: Boolean = false): CreatorAPIBinaryResponse {
        check(isCurrent() && trustReady()) { "Refresh your account before continuing." }
        try {
            val response = client.trustBytes(path, expectedAccountId, sessionId, body, binary)
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            return response
        } catch (failure: Exception) {
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            throw failure
        }
    }
    /** Commerce retains this same genuine capture, issuer and bounded client. */
    @androidx.annotation.MainThread
    suspend fun commerceBytes(path: String, body: ByteArray? = null): CreatorAPIBinaryResponse {
        check(isCurrent() && trustReady()) { "Refresh your account before continuing." }
        try {
            val response = client.commerceBytes(path, expectedAccountId, sessionId, body)
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            return response
        } catch (failure: Exception) {
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            throw failure
        }
    }
    /** Content retains this same genuine capture, issuer and bounded client. */
    @androidx.annotation.MainThread
    suspend fun contentBytes(path: String, body: ByteArray? = null, query: List<Pair<String, String?>> = emptyList()): CreatorAPIBinaryResponse {
        check(isCurrent() && trustReady()) { "Refresh your account before continuing." }
        try {
            val response = client.contentBytes(path, expectedAccountId, sessionId, body, query)
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            return response
        } catch (failure: Exception) {
            if (!isCurrent() || !trustReady()) throw kotlinx.coroutines.CancellationException("Your original account view changed.")
            throw failure
        }
    }
    companion object {
        internal fun issue(issuer: Any, client: CreatorAPIClient, accountId: String,
                           sessionId: String, destination: String,
                           trustReady: () -> Boolean,
                           current: suspend () -> Boolean): FanSessionRequestCapture {
            check(issuer === requestCaptureIssuer)
            return FanSessionRequestCapture(client, accountId, sessionId, destination, trustReady, current)
        }
    }
}
class FanSession(private val context: Context, private val baseURL: String?, returnTo: String, restoreSavedDestination: Boolean = returnTo == "/home") {
    private val storage = SecureSessionStorage(context, baseURL)
    fun currentToken(): String? = storage.read()
    val api = baseURL?.let { CreatorAPIClient(it) { storage.read() } }
    var session by mutableStateOf<APISession?>(null); private set
    var hasSavedCredential by mutableStateOf(false); private set
    var checkingSession by mutableStateOf(baseURL != null); private set
    private var currentDestination by mutableStateOf(if (ApplicationDestination.isPermitted(returnTo)) returnTo else "/home")
    var destination: String
        get() = currentDestination
        set(value) { if (value != currentDestination) { destinationGeneration++; navigationRestoreAllowed = false; navigationPersistencePending = true; currentDestination = value; persistDestination() } }
    var error by mutableStateOf("")
    var busy by mutableStateOf(false)
    var choosingActor by mutableStateOf(false)
    var actors by mutableStateOf<List<APIIdentityCapabilitiesDevelopmentActorsItem>>(emptyList())
    var localPurgeFailed by mutableStateOf(false); private set
    var purgingPrivateState by mutableStateOf(false); private set
    var arrival by mutableStateOf<ArrivalContext?>(null); private set
    private var generation = 0
    private var destinationGeneration = 0
    private var rotatingCredential = false
    private var refreshingSession = false
    // Confirmed by the genuine canonical read, never by a stored account marker.
    private var confirmedCredential: String? = null
    private var removedArrivalFor: String? = null
    private var navigationInitialized = false
    private var navigationRestoreAllowed = restoreSavedDestination
    private var navigationPersistencePending = true
    private fun persistDestination() {
        val active = session ?: return
        val credential = confirmedCredential ?: return
        if (!navigationInitialized || !navigationPersistencePending || purgingPrivateState || localPurgeFailed || !ApplicationDestination.isPermitted(destination)) return
        try { storage.saveDestination(destination, active.accountId, credential); navigationPersistencePending = false }
        catch (_: Exception) { error = "Your place in the app could not be kept. You can still open it again." }
    }
    private fun restoreDestination(account: APISession, credential: String) {
        // Navigation during an offline read or credential rotation is retried
        // only after the canonical session has confirmed the current credential.
        if (navigationInitialized) { persistDestination(); return }
        try {
            val saved = storage.readDestination(account.accountId, credential)
            navigationInitialized = true
            val restore = navigationRestoreAllowed
            navigationRestoreAllowed = false
            if (restore && saved != null) destination = saved
            persistDestination()
        } catch (_: Exception) {
            navigationInitialized = true; navigationRestoreAllowed = false
            error = "Your saved place is unavailable. Open it again from the app."
        }
    }
    /** No default/global storage reconstruction. Away-and-back navigation also
     * invalidates an earlier capture, even when account and token are equal. */
    @androidx.annotation.MainThread
    suspend fun captureRequest(from: String, maximumResponseBytes: Int = 268_435_456, timeoutMs: Int = 30_000): FanSessionRequestCapture? {
        currentCoroutineContext().ensureActive()
        if (maximumResponseBytes !in 1..268_435_456 || timeoutMs !in 1..30_000) return null
        val origin = baseURL ?: return null
        val active = session ?: return null
        if (busy || purgingPrivateState || localPurgeFailed || checkingSession || rotatingCredential || error.isNotEmpty() || destination != from) return null
        val snapshot = generation; val navigation = destinationGeneration
        val credential = runCatching { storage.read() }.getOrNull() ?: return null
        if (credential != confirmedCredential) return null
        fun matches(): Boolean = snapshot == generation && navigation == destinationGeneration &&
            destination == from && session?.accountId == active.accountId && session?.sessionId == active.sessionId &&
            credential == confirmedCredential && !purgingPrivateState && !localPurgeFailed && !rotatingCredential
        val capture = FanSessionRequestCapture.issue(requestCaptureIssuer,
            CreatorAPIClient(origin, maximumResponseBytes = maximumResponseBytes, timeoutMs = timeoutMs, expectedAccountId = active.accountId, expectedSessionId = active.sessionId) { credential }, active.accountId, active.sessionId, from,
            trustReady = { !checkingSession && !refreshingSession && !busy && error.isEmpty() }) {
            currentCoroutineContext().ensureActive()
            matches() && runCatching { storage.read() }.getOrNull() == credential && matches()
        }
        return if (capture.isCurrent()) capture else null
    }
    suspend fun purge(): Boolean = withContext(NonCancellable) {
        if (purgingPrivateState) return@withContext false
        val pushCredential = runCatching { currentToken() }.getOrNull()
        purgingPrivateState = true; localPurgeFailed = true
        try {
            generation++; confirmedCredential = null; session = null; hasSavedCredential = false; checkingSession = false; actors = emptyList(); choosingActor = false; error = ""
            navigationInitialized = false; navigationRestoreAllowed = false; navigationPersistencePending = true
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
        val origin = baseURL ?: run { checkingSession = false; return }
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
                // Keep the actual issuer and captured credential. Canonical
                // identity reads use a short I/O budget, not the domain default.
                val client = CreatorAPIClient(origin, maximumResponseBytes = 65_536, timeoutMs = 4_000) { token }
                val value = client.identitySession()
                currentCoroutineContext().ensureActive()
                if (current != generation) return
                if (currentToken() != token) {
                    confirmedCredential = null; session = null
                    error = "Your session changed. Refresh your account before continuing."
                    return
                }
                if (session?.accountId != null && session?.accountId != value.accountId) {
                    if (purge()) error = "The account changed. Continue with Pantopus again."
                    return
                }
                if (BuildConfig.DEBUG && error.isNotEmpty()) android.util.Log.d("QelvoraIdentity", "session_reconfirmed")
                confirmedCredential = token; session = value; error = ""
                restoreDestination(value, token)
            } catch (failure: CreatorAPIError) {
                if (current != generation) return
                confirmedCredential = null
                if (runCatching { currentToken() }.getOrNull() != token) {
                    session = null; error = "Your session changed. Refresh your account before continuing."; return
                }
                if (failure.status == 401) {
                    if (!busy) {
                        // A completed rotation performs its own guarded fresh read.
                        refreshingSession = false
                        refreshCredentials()
                    } else if (purge()) error = "Your session ended. Continue with Pantopus again."
                } else error = message(failure)
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (failure: Exception) {
                // Bounded development diagnostics: no exception text, tokens,
                // account identifiers or server response bodies.
                if (BuildConfig.DEBUG) android.util.Log.d("QelvoraIdentity", when (failure) {
                    is java.net.SocketTimeoutException -> "session_timeout"
                    is java.io.InterruptedIOException -> "session_io_interrupted"
                    is java.net.ProtocolException -> "session_protocol_failed"
                    is java.net.ConnectException -> "session_connect_failed"
                    is java.io.IOException -> "session_transport_failed"
                    is kotlinx.serialization.SerializationException -> "session_decode_failed"
                    else -> "session_local_failed"
                })
                if (current == generation) { confirmedCredential = null; error = "Reconnect to refresh your account. Actions are unavailable while offline." }
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
        val capture = captureRequest(destination, maximumResponseBytes = 65_536, timeoutMs = 10_000) ?: return
        if (!capture.isCurrent() || busy) return
        busy = true
        try {
            if (!capture.isCurrent()) return
            capture.client.saveFanProfile(APIFanProfileInput(handle, intro))
            if (!capture.isCurrent()) return
            refresh()
            if (capture.isCurrent() && session?.fan != null && destination == "/onboarding/handle") destination = "/you"
        }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) {
            if (capture.isCurrent()) error = if (failure is CreatorAPIError) message(failure) else QelvoraCopy.text(if (failure is kotlinx.serialization.SerializationException) "identityInputKeptUnreadable" else "identityInputKeptUnavailable")
        }
        finally { busy = false }
    }
    /** Preserves the current handle and never writes using a switched credential. */
    suspend fun saveIntro(intro: String, accountId: String, sessionId: String): Boolean {
        val current = session ?: return false
        val fan = current.fan ?: return false
        if (busy || current.accountId != accountId || current.sessionId != sessionId) return false
        val capture = captureRequest(destination, maximumResponseBytes = 65_536, timeoutMs = 10_000) ?: return false
        if (!capture.isCurrent()) return false
        busy = true
        try {
            val text = intro.trim()
            val saved = capture.client.saveFanIntro(APIFanIntroInput(text, fan.version))
            if (!capture.isCurrent() || saved.id != fan.id || saved.intro != text) return false
            refresh()
            return capture.isCurrent()
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (failure: Exception) { if (capture.isCurrent()) error = message(failure); return false }
        finally { busy = false }
    }
    /** Navigation only. Reject responses for a departed destination, account or credential. */
    suspend fun resolveCallDestination(callId: String, from: String): Boolean {
        val id = runCatching { java.util.UUID.fromString(callId).also { require(it.toString().equals(callId, ignoreCase = true)) } }.getOrNull() ?: return false
        val capture = captureRequest(from) ?: return false
        try {
            if (!capture.isCurrent()) return false
            val route = capture.client.readAccountCallRoute(id.toString(), capture.expectedAccountId)
            if (!capture.isCurrent()) return false
            val returned = java.util.UUID.fromString(route.sessionId)
            val creator = java.util.UUID.fromString(route.creatorId)
            val fan = java.util.UUID.fromString(route.fanId)
            if (returned != id || !creator.toString().equals(route.creatorId, ignoreCase = true) || !fan.toString().equals(route.fanId, ignoreCase = true)) return false
            open("/calls/$creator/$fan/$id")
            return true
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { return false }
    }
    suspend fun openNotification(id: String): Boolean {
        val origin = baseURL ?: return false
        val capture = captureRequest(destination) ?: return false
        val credential = runCatching { currentToken() }.getOrNull() ?: return false
        try {
            if (!capture.isCurrent()) return false
            val target = GrowthPush.resolveTap(GrowthClient(origin, ::currentToken), id, credential)
            if (!capture.isCurrent()) return false
            open(target)
            return true
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (!capture.isCurrent()) return false
            open("/notifications"); error = QelvoraCopy.text("growthUpdateUnavailable")
            return true
        }
    }
    suspend fun logout(all: Boolean = false) {
        if (busy) return; val client = api ?: run { purge(); return }; busy = true; generation++
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
    fun open(target: String) { if (ApplicationDestination.isPermitted(target)) { navigationRestoreAllowed = false; removedArrivalFor = null; destination = target } else error = "This link is unavailable. Open the object from the app." }
    private fun message(failure: Exception): String = if (failure is CreatorAPIError) runCatching { Json.decodeFromString<APIError>(failure.body).error.message }.getOrDefault("This action could not complete. Reconnect and try again.") else "This action could not complete. Reconnect and try again."
}

class FanFeatureRegistration(
    val matches: (String) -> Boolean,
    val allowsSignedOut: (String) -> Boolean = { false },
    val rootObserver: @Composable (FanSession) -> Unit = {},
    val screen: @Composable (FanSession) -> Unit,
)

@Composable
fun FanAppShell(context: Context, baseURL: String? = null, returnTo: String = "/home", features: List<FanFeatureRegistration> = emptyList(), destinationDelivery: Long = 0L, notificationID: String? = null, restoreSavedDestination: Boolean = returnTo == "/home", onNotificationConsumed: () -> Unit = {}) {
    // This root owns one navigation snapshot. Save the actual route at the
    // lifecycle save, not a mirror that can lag feature-local navigation.
    // Credentials, session authority and feature payloads are never serialized.
    val permittedReturn = returnTo.takeIf(ApplicationDestination::isPermitted) ?: "/home"
    val registry = (context as? ComponentActivity)?.savedStateRegistry
    val model = remember(baseURL) {
        val saved = registry?.consumeRestoredStateForKey("qelvora.fan.navigation")
        val restored = saved?.getString("destination")?.takeIf {
            ApplicationDestination.isPermitted(returnTo) && saved.getString("origin") == baseURL &&
                saved.getString("return") == permittedReturn && saved.getLong("delivery") == destinationDelivery &&
                ApplicationDestination.isPermitted(it)
        }
        FanSession(context, baseURL, restored ?: returnTo, restoreSavedDestination && restored == null)
    }
    // Observe genuine boundaries while a restored/private feature is unmounted.
    // Feature observers issue no session authority and serialize no private data.
    features.forEach { it.rootObserver(model) }
    val currentReturn by rememberUpdatedState(permittedReturn)
    val currentDelivery by rememberUpdatedState(destinationDelivery)
    DisposableEffect(model, registry) {
        registry?.registerSavedStateProvider("qelvora.fan.navigation") {
            Bundle().apply {
                putString("origin", baseURL)
                putString("return", currentReturn)
                putLong("delivery", currentDelivery)
                putString("destination", model.destination.takeIf(ApplicationDestination::isPermitted) ?: "/home")
            }
        }
        onDispose { registry?.unregisterSavedStateProvider("qelvora.fan.navigation") }
    }
    var appliedReturn by remember(baseURL) { mutableStateOf(returnTo) }
    var appliedDelivery by remember(baseURL) { mutableStateOf(destinationDelivery) }
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    var foreground by remember(lifecycleOwner) { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(returnTo, destinationDelivery) {
        // A new explicit delivery takes priority; an unchanged initial intent
        // must not overwrite the route restored for this origin.
        if (!ApplicationDestination.isPermitted(returnTo) || appliedReturn != returnTo || appliedDelivery != destinationDelivery) model.open(returnTo)
        appliedReturn = returnTo; appliedDelivery = destinationDelivery
    }
    LaunchedEffect(model.destination) { model.loadArrival() }
    LaunchedEffect(model, foreground) { if (foreground) { model.refresh(); HarnessLaunch.signInIfRequested(context, model); while (true) { delay(4000); if (!model.choosingActor && !model.busy && (model.session != null || model.hasSavedCredential)) model.refresh() } } }
    LaunchedEffect(model.session?.sessionId, model.checkingSession, foreground) {
        if (foreground && !model.checkingSession) GrowthPush.refresh(context)
    }
    LaunchedEffect(notificationID, destinationDelivery, model.session?.sessionId, model.checkingSession, foreground) {
        val id = notificationID ?: return@LaunchedEffect
        if (foreground && !model.checkingSession && model.openNotification(id)) onNotificationConsumed()
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
            model.session == null && model.hasSavedCredential -> Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                BasicText(QelvoraCopy.text(if (model.checkingSession && model.error.isEmpty()) "growthLoading" else "accountUnavailableTitle"), style = qText("display-md").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
                BasicText(QelvoraCopy.text("accountUnavailableBody"), style = qText("body").copy(color = qColor("ink-muted")))
                Button(QelvoraCopy.text("retry"), ButtonVariant.SECONDARY, block = true, disabled = model.busy || model.checkingSession) { scope.launch { model.refresh() } }
                if (features.any { it.matches("/trust/crisis") && it.allowsSignedOut("/trust/crisis") }) {
                    Button("Crisis help", ButtonVariant.QUIET, block = true) { model.open("/trust/crisis") }
                }
            }
            model.session == null && model.checkingSession -> Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                BasicText(QelvoraCopy.text("growthLoading"), style = qText("body").copy(color = qColor("ink")))
                if (features.any { it.matches("/trust/crisis") && it.allowsSignedOut("/trust/crisis") }) {
                    Button("Crisis help", ButtonVariant.QUIET, block = true) { model.open("/trust/crisis") }
                }
            }
            model.session == null -> Welcome(returnTo = model.destination, showContext = model.arrival != null, contextSource = model.arrival?.source, contextTitle = model.arrival?.title, bodyCopy = model.arrival?.let { "Every message says who wrote it: ${it.creatorName}'s AI, ${it.creatorName}, or their team. You'll always know which." } ?: "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which.", onRemoveContext = model::removeArrival, onContinue = { scope.launch { model.beginSignIn() } }, busy = model.busy || model.purgingPrivateState)
            model.session?.fan == null && features.any { it.matches(model.destination) && it.allowsSignedOut(model.destination) } -> key(model.session?.accountId, model.session?.sessionId, model.destination) { features.first { it.matches(model.destination) && it.allowsSignedOut(model.destination) }.screen(model) }
            (model.session?.fan == null && ApplicationDestination.requiresFanProfile(model.destination)) || model.destination == "/onboarding/handle" -> key(model.session?.accountId, model.session?.sessionId) { HandleForm(model) }
            else -> {
                val isConversation = model.destination.substringBefore('?').startsWith("/threads/")
                if (model.session?.mode == APISessionMode.DEVELOPMENT) {
                    if (isConversation) BasicText("Development identity · synthetic account · actual local API", style = qText("caption").copy(color = qColor("ink")), modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
                    else Notice(title = "Development identity", children = "Synthetic account · actual local API.")
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    val feature = features.firstOrNull { it.matches(model.destination) }
                    if (model.destination == "/identity/account" || (model.destination == "/you" && feature == null)) Column(Modifier.padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        BasicText("Your account", style = qText("display-md").copy(color = qColor("ink")))
                        model.session?.fan?.handle?.let { handle -> BasicText("@$handle", style = qText("body").copy(color = qColor("ink"))) }
                        Button(QelvoraCopy.text(if (model.session?.fan == null) "identityChooseHandle" else "identityEditPublicProfile"), ButtonVariant.SECONDARY, block = true) { model.destination = "/onboarding/handle" }
                        Button(QelvoraCopy.text("w5NativeTeamWorkspace"), ButtonVariant.SECONDARY, block = true, disabled = model.busy || model.checkingSession || model.purgingPrivateState || model.localPurgeFailed || model.error.isNotEmpty()) { model.open("/studio/workspace") }
                        Button("Sign out", ButtonVariant.SECONDARY, block = true) { scope.launch { model.logout() } }
                        Button("Refresh session", ButtonVariant.SECONDARY, block = true, disabled = model.busy) { scope.launch { model.refreshCredentials() } }
                        Button("Sign out on all devices", ButtonVariant.QUIET, block = true) { scope.launch { model.logout(true) } }
                        Button("Help and reports", ButtonVariant.QUIET, block = true) { model.open("/support") }
                        Button("Your data", ButtonVariant.QUIET, block = true) { model.open("/support/privacy") }
                        Button("Notification settings", ButtonVariant.QUIET, block = true) { model.open("/notifications/settings") }
                        if (model.session?.creator != null) Button(QelvoraCopy.text("growthYourWeekImpact"), ButtonVariant.QUIET, block = true) { model.open("/studio/impact") }
                        if (model.session?.creator != null && context is android.app.Activity) CredentialSettings(context, model)
                    } else if (feature != null) key(model.session?.accountId, model.session?.sessionId, model.destination, destinationDelivery) { feature.screen(model) }
                    else Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { BasicText("This destination is not connected yet", style = qText("title").copy(color = qColor("ink"))); BasicText("Your account and arrival context are kept.", style = qText("body").copy(color = qColor("ink-muted"))); Button("Your account", ButtonVariant.SECONDARY) { model.destination = "/you" } }
                }
                val labels = listOf("navHome" to "/home", "navDiscover" to "/discover", "navRequests" to "/requests", "navYou" to "/you")
                val path = model.destination.substringBefore('?')
                val accountDestination = path.startsWith("/identity/") || path == "/support" || path.startsWith("/support/") || path == "/notifications/settings" || path == "/studio/impact" || path == "/commerce/spending" || StudioTeamFeature.matches(path)
                val selectedTab = if (accountDestination) "navYou" else if (path.startsWith("/commerce/")) "navRequests" else labels.firstOrNull { path == it.second || path.startsWith(it.second + "/") }?.first ?: "navHome"
                if (!isConversation) TabBar(QelvoraCopy.text(selectedTab)) { label -> model.destination = labels.first { QelvoraCopy.text(it.first) == label }.second }
            }
        }
    }
}

@Composable
private fun HandleForm(model: FanSession) {
    var handle by remember(model.session?.accountId, model.session?.sessionId) { mutableStateOf(model.session?.fan?.handle.orEmpty()) }; var intro by remember(model.session?.accountId, model.session?.sessionId) { mutableStateOf(model.session?.fan?.intro.orEmpty()) }; val scope = rememberCoroutineScope()
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
