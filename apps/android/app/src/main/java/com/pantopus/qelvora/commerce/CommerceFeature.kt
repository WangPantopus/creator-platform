package com.pantopus.qelvora.commerce

import com.pantopus.qelvora.generated.QelvoraCopy

import android.content.Context
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import com.pantopus.qelvora.generated.QelvoraTokens as T
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.ui.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.serialization.json.*
import androidx.compose.ui.semantics.heading

private data class SpendingDraftOwner(val origin: String, val accountId: String, val sessionId: String, val route: String)
private data class SpendingFormDraft(val amount: String, val choice: String?, val reminders: Boolean)

/** Original-session configuration memory only. No storage, saved state,
 * credential, session model, idempotency key, request or private result. */
private class SpendingConfigurationDrafts : ViewModel() {
    private var parked: Pair<SpendingDraftOwner, SpendingFormDraft>? = null
    fun park(owner: SpendingDraftOwner, draft: SpendingFormDraft) { parked = owner to draft }
    fun clear() { parked = null }
    fun take(owner: SpendingDraftOwner?): SpendingFormDraft? {
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
                check(modelClass == SpendingConfigurationDrafts::class.java)
                return SpendingConfigurationDrafts() as T
            }
        }
    }
}
private fun spendingConfigurationDrafts(context: Context): SpendingConfigurationDrafts? =
    (context as? ComponentActivity)?.let { ViewModelProvider(it, SpendingConfigurationDrafts.factory)["qelvora.commerce.configuration.spending", SpendingConfigurationDrafts::class.java] }
private fun spendingDraftOwner(baseURL: String?, model: FanSession): SpendingDraftOwner? =
    baseURL?.let { origin -> model.session?.let { SpendingDraftOwner(origin, it.accountId, it.sessionId, model.destination) } }

@Composable
private fun spendingConfigurationBoundary(context: Context, baseURL: String?, model: FanSession) {
    val memory = remember(context) { spendingConfigurationDrafts(context) }
    val accountId = model.session?.accountId; val sessionId = model.session?.sessionId
    val route = model.destination; val checking = model.checkingSession; val saved = model.hasSavedCredential
    val purging = model.purgingPrivateState; val failed = model.localPurgeFailed; val choosing = model.choosingActor
    SideEffect { memory?.observe(baseURL, route, accountId, sessionId, checking, saved, purging, failed, choosing) }
}

object CommerceFanFeature {
    fun registration(context: Context, baseURL: String?) = FanFeatureRegistration(
        matches = { destination -> val path = destination.substringBefore("?"); path == "/requests" || (path.startsWith("/commerce/") && path.substringAfterLast("/") in listOf("requests", "spending", "access", "packet", "checkout", "status", "pass", "membership")) || (path.startsWith("/creators/") && path.endsWith("/access")) },
        rootObserver = { model -> spendingConfigurationBoundary(context, baseURL, model) },
        screen = { session -> key(session.session?.accountId, session.session?.sessionId) { CommerceFeature(context, baseURL, session) } },
    )
}

@Composable private fun CommerceFeature(context: Context, baseURL: String?, session: FanSession) {
    val activity = context as? ComponentActivity
    val draftMemory = remember(context) { spendingConfigurationDrafts(context) }
    val draftOwner = spendingDraftOwner(baseURL, session)
    var draftRestorationAttempted by remember { mutableStateOf(false) }
    var spendingEdited by remember { mutableStateOf(false) }
    var commandInFlight by remember { mutableStateOf(false) }
    val originalAccount = remember { session.session?.accountId }
    val originalSession = remember { session.session?.sessionId }
    val originalDestination = remember { session.destination }
    val api = remember(baseURL,session,originalAccount,originalSession,originalDestination) {
        if (baseURL != null && originalAccount != null && originalSession != null) CommerceClient(session, originalAccount, originalSession, originalDestination) else null
    }; val scope = rememberCoroutineScope()
    var disposed by remember { mutableStateOf(false) }
    fun originalViewCurrent(): Boolean = !disposed && originalAccount != null && originalSession != null && session.session?.accountId == originalAccount && session.session?.sessionId == originalSession && session.destination == originalDestination
    fun privateVisible(): Boolean = originalViewCurrent() &&
        !session.busy && session.error.isEmpty() && !session.purgingPrivateState && !session.localPurgeFailed
    fun privateReady(): Boolean = privateVisible() && !session.checkingSession
    val ready = privateReady()
    val visible = privateVisible()
    var data by remember { mutableStateOf<CommerceOverview?>(null) }; var detail by remember { mutableStateOf<CommerceDetail?>(null) }
    val arrival = remember(originalDestination) { Uri.parse(originalDestination) }; val arrivalPath = arrival.path.orEmpty()
    var screen by remember { mutableStateOf(if (arrivalPath.startsWith("/commerce/")) arrivalPath.substringAfterLast("/") else if (arrivalPath.endsWith("/access")) "access" else "requests") }
    // Back leaves a step opened inside this screen first, then goes back through where the person came from.
    val arrivalScreen = remember { screen }
    BackHandler(enabled = screen != arrivalScreen) { screen = arrivalScreen; detail = null }
    var category by remember { mutableStateOf(QelvoraCopy.text("nativeOpen")) }; var creator by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }; var failure by remember { mutableStateOf("") }; var notice by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }; var choice by remember { mutableStateOf<String?>(null) }; var reminders by remember { mutableStateOf(false) }
    var summary by remember { mutableStateOf("") }; var info by remember { mutableStateOf("") }; var selectedMode by remember { mutableStateOf<String?>(null) }
    var passSelection by remember { mutableStateOf(setOf<String>()) }
    var replacement by remember { mutableStateOf("") }
    val keys = remember { mutableMapOf<String, String>() }
    var access by remember { mutableStateOf<CommerceAccess?>(null) }
    var accessReceivedAt by remember { mutableStateOf<Instant?>(null) }
    var accessNow by remember { mutableStateOf(Instant.now()) }
    var limitVersion by remember { mutableStateOf<Int?>(null) }
    var commerceAvailable by remember { mutableStateOf(false) }
    var arrived by remember { mutableStateOf(false) }
    val commandDisabled = busy || !ready || !commerceAvailable
    val refreshDisabled = busy || !originalViewCurrent() || session.busy || session.checkingSession || session.purgingPrivateState || session.localPurgeFailed
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    DisposableEffect(Unit) {
        onDispose {
            if (activity?.isChangingConfigurations == true && screen == "spending" && spendingEdited &&
                draftOwner != null && draftOwner == spendingDraftOwner(baseURL, session) &&
                !session.purgingPrivateState && !session.localPurgeFailed && !session.choosingActor && !commandInFlight) {
                draftMemory?.park(draftOwner, SpendingFormDraft(amount, choice, reminders))
            } else draftMemory?.clear()
            disposed = true
            data = null; detail = null; access = null; accessReceivedAt = null; commerceAvailable = false
            amount = ""; choice = null; reminders = false; summary = ""; info = ""; selectedMode = null
            creator = ""; passSelection = emptySet(); replacement = ""; keys.clear(); notice = ""; failure = ""; limitVersion = null
        }
    }
    suspend fun report(error: Exception) {
        if (error is CancellationException) throw error
        if (!privateReady()) return
        failure = if (error is CommerceFailure) error.message else QelvoraCopy.text("nativeReconnectToRefreshYourInputIs")
        if (error !is CommerceFailure || error.status >= 500 || error.status == 401 || error.status == 409) commerceAvailable = false
        if (error is CommerceFailure && (error.code == "session_account_changed" || error.code == "session_view_changed")) {
            data = null; detail = null; access = null; amount = ""; choice = null; summary = ""; info = ""; keys.clear(); notice = ""; session.refresh()
        } else if (error is CommerceFailure && error.status == 401) { data = null; detail = null; session.refresh() }
    }
    suspend fun refresh(allowBusy: Boolean = false) {
        if (!privateReady() || (busy && !allowBusy)) return
        val client = api ?: run { failure = QelvoraCopy.text("nativeCommerceIsNotConnectedYetReconnect"); return }; busy = true
        try {
            val accountId = session.session?.accountId
            val current = client.overview()
            if (!privateReady() || accountId != session.session?.accountId) return
            data = current; commerceAvailable = true
            current.limits.firstOrNull { it.currency == current.policy.currency }?.let { limit ->
                if (limit.version != limitVersion) {
                    val pending = limit.effective_at != null
                    choice = if (if (pending) limit.pending_none == true else limit.explicit_none) QelvoraCopy.text("noLimit") else QelvoraCopy.text("nativeChooseAnAmount")
                    amount = (if (pending) limit.pending_amount else limit.amount)?.toBigDecimal()?.movePointLeft(java.util.Currency.getInstance(limit.currency).defaultFractionDigits)?.stripTrailingZeros()?.toPlainString().orEmpty()
                    reminders = limit.reminders_on; limitVersion = limit.version
                }
            }
            if (creator.isEmpty()) creator = current.creators.firstOrNull()?.id.orEmpty()
            detail?.let { val value = client.detail(it.packet.id); if (!privateReady()) return; detail = value }; failure = ""
        }
        catch (error: Exception) { report(error) } finally { busy = false }
    }
    suspend fun mutate(path: String, values: JsonObject, message: String) {
        if (busy || !privateReady() || !commerceAvailable) return; val client = api ?: return; busy = true; commandInFlight = true
        try {
            val signature = path + values.toString(); val key = keys.getOrPut(signature) { UUID.randomUUID().toString() }
            client.request(path, JsonObject(values + ("idempotencyKey" to JsonPrimitive(key)))); if (!privateReady()) return; notice = message; failure = ""; refresh(allowBusy = true)
        } catch (error: Exception) { report(error) } finally { busy = false; commandInFlight = false }
    }
    suspend fun retry() {
        if (busy || !originalViewCurrent() || session.busy || session.checkingSession || session.purgingPrivateState || session.localPurgeFailed) return
        if (!privateReady()) session.refresh()
        if (privateReady()) refresh()
    }
    LaunchedEffect(ready) {
        if (!ready) return@LaunchedEffect
        refresh()
        if (!arrived && privateReady()) {
            arrived = true
            creator = arrival.getQueryParameter("creatorId") ?: data?.creators?.firstOrNull { arrivalPath.startsWith("/creators/${it.handle}/") }?.id ?: creator
            if (screen == "status") arrival.getQueryParameter("packetId")?.let { id -> try { val value = api?.detail(id); if (privateReady()) detail = value } catch (error: Exception) { report(error) } }
        }
    }
    LaunchedEffect(ready, commerceAvailable) {
        // Read the actual saved limit first. Otherwise that initial overview
        // could overwrite a restored unsent form with the server's default.
        if (privateReady() && commerceAvailable && !draftRestorationAttempted) {
            draftRestorationAttempted = true
            val restored = draftMemory?.take(draftOwner)
            if (restored != null && !spendingEdited && !commandInFlight) {
                screen = "spending"; amount = restored.amount; choice = restored.choice; reminders = restored.reminders
                spendingEdited = true
            }
        }
    }
    LaunchedEffect(screen, creator, data?.fan?.id, foreground, ready) {
        access = null; accessReceivedAt = null
        val fanId = data?.fan?.id
        val client = api
        if (!ready || screen != "access" || !foreground || creator.isEmpty() || fanId == null || client == null) return@LaunchedEffect
        val creatorId = creator; val accountId = session.session?.accountId
        while (isActive) {
            val checkedAt = Instant.now()
            try {
                val value = client.access(creatorId, fanId)
                if (!isActive || !privateReady() || session.session?.accountId != accountId || value.creatorId != creatorId || value.fanId != fanId) return@LaunchedEffect
                access = value; accessReceivedAt = checkedAt; accessNow = Instant.now()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                access = null; accessReceivedAt = null
            }
            delay(4000)
        }
    }
    LaunchedEffect(screen, foreground) {
        while (screen == "access" && foreground && isActive) { accessNow = Instant.now(); delay(1000) }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = if (screen == "packet") 20.dp else 16.dp).padding(top = 20.dp, bottom = 36.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            if (screen != "requests") Button(QelvoraCopy.text("back"), ButtonVariant.QUIET) {
                if (screen != arrivalScreen) { screen = arrivalScreen; detail = null }
                else session.back()
            }
            Button(QelvoraCopy.text("nativeRefresh"), ButtonVariant.QUIET, disabled = refreshDisabled) { scope.launch { retry() } }
        }
        if (!visible) Notice(title = QelvoraCopy.text("nativeAccountStatus"), children = QelvoraCopy.text("nativeReconnectToCheckYourAccountYour"))
        if (visible && failure.isNotEmpty()) Notice("error", QelvoraCopy.text("nativeConnectionStatus"), failure)
        if (visible && notice.isNotEmpty()) Notice(title = QelvoraCopy.text("nativeSaved"), children = notice)
        val current = data.takeIf { visible }
        if (visible && current == null) { CommerceText(if (busy) QelvoraCopy.text("nativeLoadingCommerce") else QelvoraCopy.text("nativeThisInformationIsUnavailable"), "display-md") }
        else if (visible && current != null) when (screen) {
            "spending" -> {
                CommerceText(QelvoraCopy.text("nativeSpendingAndTime"), "display-md")
                BasicText(commerceMoney(current.exposure?.captured ?: 0, current.policy.currency), style = qText("data-lg").copy(fontSize = 44.sp, lineHeight = 48.sp, color = qColor("ink")))
                CommerceText(QelvoraCopy.text("nativeChargedThisUTCCalendarMonth"), "caption")
                current.exposure?.month?.let { CommerceText(QelvoraCopy.text("nativeMonthUTC", mapOf("month" to it)), "data-sm") }
                val limit = current.limits.firstOrNull { it.currency == current.policy.currency }
                CommercePanel {
                    CommerceRow(QelvoraCopy.text("nativeCurrentLimit"), limit?.let { if (it.explicit_none) QelvoraCopy.text("noLimit") else commerceMoney(it.amount?.toLongOrNull() ?: 0, it.currency) } ?: QelvoraCopy.text("nativeChooseBeforeYourFirstPaidAction"))
                    CommerceRow(QelvoraCopy.text("nativeHeldNotCharged"), commerceMoney(current.exposure?.held ?: 0, current.policy.currency))
                    current.exposure?.refunded?.let { CommerceRow(QelvoraCopy.text("nativeRefundsRecorded"), commerceMoney(it, current.policy.currency)) }
                    limit?.effective_at?.let { CommerceText(QelvoraCopy.text("nativeYourIncreaseTakesEffectDate", mapOf("date" to commerceWhen(it))), "caption") }
                }
                SpendLimit(options = listOf(QelvoraCopy.text("nativeChooseAnAmount"), QelvoraCopy.text("noLimit")), selected = choice, remindersOn = limit?.reminders_on, onSelect = { spendingEdited = true; choice = it })
                if (choice == QelvoraCopy.text("nativeChooseAnAmount")) CommerceField(QelvoraCopy.text("nativeMonthlyAmountInCurrency", mapOf("currency" to current.policy.currency)), amount, { spendingEdited = true; amount = it }, keyboardType = KeyboardType.Decimal)
                ToggleRow(QelvoraCopy.text("nativeRemindMeAt50And100"), checked = reminders) { spendingEdited = true; reminders = it }
                CommerceText(QelvoraCopy.text("nativeIncreasesTake24HoursDecreases"), "caption")
                Button(if (commandInFlight) QelvoraCopy.text("nativeSaving") else QelvoraCopy.text("nativeSaveLimit"), ButtonVariant.SECONDARY, block = true, disabled = commandDisabled || choice == null) { scope.launch {
                    try { val value = if (choice == QelvoraCopy.text("noLimit")) null else commerceMinor(amount, current.policy.currency); mutate("spend-limit", buildJsonObject { put("currency", current.policy.currency); put("amount", value?.let { JsonPrimitive(it) } ?: JsonNull); put("explicitNone", choice == QelvoraCopy.text("noLimit")); put("remindersOn", reminders) }, QelvoraCopy.text("nativeYourSpendingChoiceIsSaved")) } catch (error: Exception) { report(error) }
                } }
                current.spendingNotices.forEach { notice -> CommerceText(QelvoraCopy.text("nativeYouveReachedThresholdOfYourMonthly", mapOf("threshold" to notice.threshold.toString()))) }
                Notice(title = QelvoraCopy.text("nativeAITime"), children = QelvoraCopy.text("nativeYourTimeSummaryIsUnavailable"))
            }
            "access", "packet" -> {
                val name = current.creators.firstOrNull { it.id == creator }?.display_name ?: QelvoraCopy.text("nativeTheCreator"); val modes = current.modes.filter { it.creator_id == creator }
                CommerceText(if (screen == "access") QelvoraCopy.text("navAccess") else QelvoraCopy.text("includedInRequest"), "display-md")
                if (screen == "access") {
                    current.creators.forEach { owner -> Button(owner.display_name, ButtonVariant.QUIET, block = true) { creator = owner.id } }
                    val currentAccess = access?.takeIf { value -> value.creatorId == creator && value.fanId == current.fan?.id && accessReceivedAt?.plusSeconds(5)?.isAfter(accessNow) == true && (value.validUntil == null || runCatching { Instant.parse(value.validUntil).isAfter(accessNow) }.getOrDefault(false)) }
                    val can = currentAccess?.let { value -> listOf(
                        if (value.capabilities.contains("ai_message")) if (value.allowance.available > 0) QelvoraCopy.text("nativeMessageThisAI") else QelvoraCopy.text("nativeYourAIAllowanceIsUsedFor") else "",
                        if (value.capabilities.contains("note")) QelvoraCopy.text("nativeReadIncludedNotes") else "",
                        if (value.capabilities.contains("request")) QelvoraCopy.text("nativeRequestAvailableServices") else ""
                    ).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { QelvoraCopy.text("nativeReadYourExistingConversations") } } ?: QelvoraCopy.text("nativeCurrentAccessIsUnavailableRefresh")
                    val labels = mapOf("membership" to QelvoraCopy.text("nativeMembership"), "comp" to QelvoraCopy.text("nativeGiftedAccess"), "commitment" to QelvoraCopy.text("nativeAcceptedService"), "pass_slot" to QelvoraCopy.text("nativePassAIReach"), "trial" to QelvoraCopy.text("nativeConversationTrial"))
                    val included = currentAccess?.sources?.map { labels[it.source] ?: QelvoraCopy.text("nativeCurrentAccess") }?.distinct()?.sorted()?.joinToString(", ")?.ifEmpty { QelvoraCopy.text("nativeNoIncludedAccessForThisCreator") } ?: QelvoraCopy.text("nativeBenefitsCannotBeConfirmed")
                    val paid = current.memberships.filter { it.creator_id == creator && it.state in listOf("active", "grace", "cancelled") && runCatching { Instant.parse(it.period_end).isAfter(accessNow) }.getOrDefault(false) }
                    val availableModes = modes.filter { it.state == "offered" && it.used + it.reserved < it.weekly_limit }
                    val changes = (paid.map { QelvoraCopy.text(if (it.cancel_at_end || it.state == "cancelled") "nativeNameEndsDate" else "nativeNameRenewsDate", mapOf("name" to it.name, "date" to commerceWhen(it.period_end))) } + (currentAccess?.sources?.filter { it.source != "membership" }?.map { QelvoraCopy.text("nativeLabelEndsDate", mapOf("label" to (labels[it.source] ?: QelvoraCopy.text("navAccess")), "date" to commerceWhen(it.validUntil))) } ?: emptyList())).joinToString("; ")
                    AccessLines(name, can, included, if (availableModes.isEmpty()) QelvoraCopy.text("nativeNoHumanModesAreCurrentlyAvailable") else availableModes.joinToString(", ") { it.title }, changes.ifEmpty { QelvoraCopy.text("nativeAccessRefreshesFromTheServer") })
                } else { CommerceText(QelvoraCopy.text("nativeChangeAnythingNothingIsSentUntil")); IncludeList(summary, name = name, onSummary = { summary = it }) }
                ModeList(modes.map { RequestMode(it.title, QelvoraCopy.text("nativeHoursHRemainingLeft", mapOf("hours" to it.delivery_hours.toString(), "remaining" to maxOf(0, it.weekly_limit - it.used - it.reserved).toString())), it.amount?.toLongOrNull()?.let { value -> commerceMoney(value, it.currency) } ?: QelvoraCopy.text("nativePriceUnavailable"), selectedMode == it.id, it.state != "offered" || it.used + it.reserved >= it.weekly_limit) }) { index -> selectedMode = modes[index].id }
                if (screen == "access") { Button(QelvoraCopy.text("stepIn", mapOf("name" to name)), ButtonVariant.SECONDARY, block = true, disabled = modes.none { it.state == "offered" && it.used + it.reserved < it.weekly_limit }) { screen = "packet" }; Button(QelvoraCopy.text("nativeManageMembership"), ButtonVariant.QUIET, block = true) { screen = "membership" } }
                else {
                    // WP 7.4 P9: the chosen mode's terms, as the web packet shows them; its
                    // decision time is the deadline. The ETA line waits on lane 4's summary.
                    modes.firstOrNull { it.id == selectedMode }?.let { mode -> TermsBlock(name, mode.amount?.toLongOrNull()?.let { value -> commerceMoney(value, mode.currency) } ?: QelvoraCopy.text("nativePriceUnavailable"), "${mode.decision_hours} h") }
                    Notice(title = QelvoraCopy.text("nativePaymentUnavailable"), children = QelvoraCopy.text("nativePaidWrittenAndVoiceRequestsAre")); Button(QelvoraCopy.text("nativeSendRequest"), ButtonVariant.SECONDARY, block = true, disabled = true) {}
                }
            }
            "checkout" -> Notice(title = QelvoraCopy.text("nativePaymentUnavailable"), children = QelvoraCopy.text("nativePaidWrittenAndVoiceRequestsAreUnavailable"))
            "status" -> detail?.let { value ->
                val packet = value.packet
                val name = current.creators.firstOrNull { it.id == packet.creator_id }?.display_name ?: QelvoraCopy.text("nativeTheCreator")
                CommerceText(packet.snapshot.title, "display-md"); RequestStatus(reqId = commerceID(packet.id), mode = packet.snapshot.title, price = commerceMoney(packet.snapshot.amount, packet.snapshot.currency), outcome = commerceOutcome(packet))
                CommerceRow(QelvoraCopy.text("nativeDecisionDeadline"), commerceWhen(packet.decision_at)); CommerceRow(QelvoraCopy.text("nativeBankAuthorizationExpires"), commerceWhen(packet.hold_expires_at)); value.commitment?.let { CommerceRow(QelvoraCopy.text("nativeDeliveryDeadline"), commerceWhen(it.due_at)) }
                value.callTransport?.let { transport ->
                    Notice(title = QelvoraCopy.text("nativeSystemCallStatus"), children = if (transport.state == "closed_unresolved") QelvoraCopy.text("nativeTheCallRoomClosedAfterNeither", mapOf("time" to commerceWhen(transport.recordedAt))) else QelvoraCopy.text("nativeCurrentCallStatusIsUnavailable"))
                }
                if (packet.state == "more_info") {
                    CommerceText(packet.question ?: QelvoraCopy.text("nativeTheCreatorAskedForMoreInformation")); CommerceField(QelvoraCopy.text("nativeYourAnswer"), info, { info = it }, 4)
                    Button(QelvoraCopy.text("nativeSendAnswer"), ButtonVariant.SECONDARY, block = true, disabled = commandDisabled || info.isBlank()) { scope.launch { mutate("packets/${packet.id}/info", buildJsonObject { put("version", packet.version); put("text", info) }, QelvoraCopy.text("nativeYourAnswerIsSaved")) } }
                }
                if (packet.state in listOf("submitting", "submitted", "more_info", "offer_pending")) Button(QelvoraCopy.text("nativeWithdrawRequest"), ButtonVariant.SECONDARY, block = true, disabled = commandDisabled) { scope.launch { mutate("packets/${packet.id}/withdraw", buildJsonObject { put("version", packet.version) }, QelvoraCopy.text("nativeHoldReleaseIsBeingConfirmed")) } }
                if (packet.payment_state in listOf("unknown", "requires_action")) Notice(title = QelvoraCopy.text("nativePaymentProcessing"), children = QelvoraCopy.text("nativeTheProviderMustConfirmPayment"))
                if (value.commitment?.delivered_at != null && value.commitment.state in listOf("delivered", "refunded", "resolved")) {
                    val signedActId = value.commitment.evidence?.signedActId ?: value.commitment.accept_act_id
                    val label = when (value.commitment.evidence?.authorKind) {
                        "approved_draft" -> QelvoraCopy.text("approvedAuthor", mapOf("name" to name))
                        "human_creator" -> QelvoraCopy.text("nativeTitlePersonallyFulfilledByName", mapOf("title" to packet.snapshot.title, "name" to name))
                        "human_call" -> QelvoraCopy.text("nativePersonalCallProviderConfirmed")
                        "system" -> QelvoraCopy.text("nativeSystemDeliveryNotice")
                        else -> QelvoraCopy.text("nativeDeliveryRecorded")
                    }
                    val refund = value.ledger.filter { it.kind == "refund" && it.currency == packet.snapshot.currency }.sumOf { it.amount.toLong() }
                    val rows = listOf(QelvoraCopy.text("nativeCharged") to commerceMoney(packet.snapshot.amount, packet.snapshot.currency), QelvoraCopy.text("nativeDelivered") to commerceWhen(value.commitment.delivered_at)) + if (refund > 0) listOf(QelvoraCopy.text("nativeRefundConfirmed") to commerceMoney(refund, packet.snapshot.currency)) else emptyList()
                    if (signedActId != null) Receipt(name = name, reqId = commerceID(packet.id), title = packet.snapshot.title, rows = rows, label = label, onVerify = { session.destination = "/verify/$signedActId" })
                    else CommercePanel { CommerceText(QelvoraCopy.text("receipt"), "receipt-title"); rows.forEach { (label, amount) -> CommerceRow(label, amount) }; CommerceText(label, "caption") }
                    if (value.commitment.state == "delivered" || value.share?.fan_choice == true) Button(if (value.share?.fan_choice == true) QelvoraCopy.text("nativeRevokeSharing") else QelvoraCopy.text("nativeAllowSharingWithoutYourHandle"), ButtonVariant.SECONDARY, block = true, disabled = commandDisabled || (!packet.snapshot.shareable && value.share?.fan_choice != true) || value.share?.revoked_at != null) { scope.launch { mutate("packets/${packet.id}/share", buildJsonObject { put("version", value.share?.version ?: 1); put("enabled", value.share?.fan_choice != true); put("handleDisplay", "hidden") }, QelvoraCopy.text("nativeYourSharingChoiceIsSaved")) } }
                }
            }
            "membership" -> {
                CommerceText(QelvoraCopy.text("nativeManageMembership"), "display-md")
                if (current.memberships.isEmpty()) CommerceText(QelvoraCopy.text("nativeNoMembershipsYet"))
                current.memberships.forEach { member -> CommercePanel { CommerceText(member.name, "title"); CommerceRow(QelvoraCopy.text("nativeStatus"), member.state); CommerceRow(QelvoraCopy.text("nativeAccessUntil"), commerceWhen(member.period_end)); CommerceRow(QelvoraCopy.text("nativeBillingProvider"), member.provider) } }
                val accountId=session.session?.accountId
                if(current.capabilities.storePurchasesAvailable && api!=null && accountId!=null) StoreMembershipPane(context,accountId,api,current.tiers.filter {it.state=="active"}.mapNotNull {it.catalog.google},available=!commandDisabled) {refresh()}
                else {
                    Notice(title = QelvoraCopy.text("nativePurchaseAndRestoreUnavailable"), children = QelvoraCopy.text("nativeStoreProductsMustBeConfigured"))
                    if(current.memberships.any {it.provider=="google"}) key(accountId) {StoreSubscriptionManagement(context)}
                }
                CommerceText(QelvoraCopy.text("nativeUnusedMembershipsCancelledWithin"), "caption")
            }
            "pass" -> {
                CommerceText(QelvoraCopy.text("nativeYourPass"), "display-md")
                if (!current.policy.passEnabled) Notice(title = QelvoraCopy.text("nativePassIsUnavailable"), children = QelvoraCopy.text("nativeMembershipsAreTheCurrentWayTo"))
                if(current.policy.passEnabled) current.pass.firstOrNull()?.let { pass ->
                    val passCurrent = pass.state in listOf("active", "cancelled") && runCatching { Instant.parse(pass.cycle_end.take(10) + "T00:00:00Z").isAfter(accessNow) }.getOrDefault(false)
                    CommerceText(QelvoraCopy.text("nativeUsedOfAllowanceSharedAICost", mapOf("used" to (pass.used + pass.reserved).toString(), "allowance" to pass.allowance.toString())))
                    current.passChoices.creators.forEach { candidate -> Row(Modifier.fillMaxWidth().heightIn(min=48.dp).toggleable(passSelection.contains(candidate.id),role=Role.Checkbox) { selected -> passSelection=if(selected)passSelection+candidate.id else passSelection-candidate.id }.padding(12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) { Box(Modifier.size(T.checkboxSize).background(if(passSelection.contains(candidate.id))qColor("ink") else qColor("surface"),RoundedCornerShape(T.radiusTail)).border(T.hairline,qColor("control-line"),RoundedCornerShape(T.radiusTail)),contentAlignment=Alignment.Center) {if(passSelection.contains(candidate.id))Glyph("check",T.space4,qColor("surface"))}; CommerceText(candidate.display_name) } }
                    val occupied=current.slots.filter { it.cycle_start==pass.cycle_start && it.state in listOf("active","draft_next","ended_readable","replaced") }.map { it.position }.toSet().size
                    if(occupied<pass.slot_capacity) Button(QelvoraCopy.text("nativeFillAvailableSlots"),ButtonVariant.SECONDARY,block=true,disabled=commandDisabled || !passCurrent || passSelection.isEmpty() || passSelection.size>pass.slot_capacity-occupied) { scope.launch { mutate("pass/initial",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},QelvoraCopy.text("nativeYourCurrentChoicesAreSaved")) } }
                    Button(QelvoraCopy.text("nativeSaveNextMonthsChoices"),ButtonVariant.SECONDARY,block=true,disabled=commandDisabled || !passCurrent || passSelection.size>pass.slot_capacity) { scope.launch { mutate("pass/draft",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},QelvoraCopy.text("nativeYourNextMonthDraftIsSaved")) } }
                    CommerceText(QelvoraCopy.text("nativeCompleteAllSlotcapacityChoices", mapOf("slotCapacity" to pass.slot_capacity.toString())),"caption")
                }
                current.slots.forEach { slot -> CommercePanel {
                    CommerceRow(slot.display_name, slot.state.replace('_', ' ')); CommerceText(QelvoraCopy.text("nativeThroughDate", mapOf("date" to commerceWhen(slot.ends_at))), "caption")
                    if(current.policy.passEnabled && current.passChoices.replaceableSlotIds.contains(slot.id)) current.pass.firstOrNull()?.let { pass ->
                        CommerceText(QelvoraCopy.text("nativeFreeReplacement"), "label")
                        current.passChoices.creators.filter { candidate -> current.slots.none { it.state=="active" && it.creator_id==candidate.id } }.forEach { candidate -> Button(candidate.display_name,ButtonVariant.QUIET,block=true) {replacement=candidate.id} }
                        Button(QelvoraCopy.text("nativeReplaceUnavailableCreator"),ButtonVariant.SECONDARY,block=true,disabled=commandDisabled || replacement.isEmpty()) { scope.launch { mutate("pass/slots/${slot.id}/replace",buildJsonObject {put("version",pass.version);put("creatorId",replacement)},QelvoraCopy.text("nativeYourReplacementIsSaved")) } }
                    }
                } }
                CommerceText(QelvoraCopy.text("nativeAPassGrantsAIReachSeparate"))
            }
            else -> {
                CommerceText(QelvoraCopy.text("navRequests"), "display-lg"); Segmented(listOf(QelvoraCopy.text("nativeOpen"), QelvoraCopy.text("nativeDelivered"), QelvoraCopy.text("nativeClosed")), category) { category = it }
                val visible = current.packets.filter { commerceRequestCategory(it) == category }
                if (visible.isEmpty()) CommerceText(QelvoraCopy.text("nativeNoRequestsHere") + ". " + if (current.packets.isEmpty()) QelvoraCopy.text("nativeRequestsAppearAfterYouSendThem") else QelvoraCopy.text("nativeChooseAnotherCategoryToViewYour"))
                visible.forEach { packet ->
                    RequestStatus(reqId = commerceID(packet.id), mode = packet.snapshot.title, price = commerceMoney(packet.snapshot.amount, packet.snapshot.currency), outcome = commerceOutcome(packet))
                    Button(QelvoraCopy.text("nativeViewRequest"), ButtonVariant.SECONDARY, block = true, disabled = busy || !ready) { scope.launch { try { busy = true; val value = api?.detail(packet.id); if (privateReady()) { detail = value; screen = "status" } } catch (error: Exception) { report(error) } finally { busy = false } } }
                }
                Button(QelvoraCopy.text("nativeSpendingAndTime"), ButtonVariant.SECONDARY, block = true) { screen = "spending" }
                Button(QelvoraCopy.text("nativeCreatorAccess"), ButtonVariant.SECONDARY, block = true) { screen = "access" }
                Button(QelvoraCopy.text("nativeManageMembership"), ButtonVariant.QUIET, block = true) { screen = "membership" }
                Button(QelvoraCopy.text("nativeYourPass"), ButtonVariant.QUIET, block = true) { screen = "pass" }
            }
        }
    }
}
// A screen title (a display style) is a heading, as on iOS.
@Composable private fun CommerceText(text: String, style: String = "body") { BasicText(text, if (style.startsWith("display")) Modifier.semantics { heading() } else Modifier, style = qText(style).copy(color = qColor("ink"))) }
@Composable private fun CommercePanel(content: @Composable ColumnScope.() -> Unit) { Column(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("line"), RoundedCornerShape(12.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) }
@Composable private fun CommerceRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) { Box(Modifier.weight(1f)) { CommerceText(label) }; Box(Modifier.weight(1f)) { CommerceText(value, "data-md") } } }
@Composable private fun CommerceField(label: String, value: String, onChange: (String) -> Unit, lines: Int = 1, keyboardType: KeyboardType = KeyboardType.Text) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { CommerceText(label, "label"); BasicTextField(value, onChange, Modifier.fillMaxWidth().heightIn(min = 48.dp).background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("control-line"), RoundedCornerShape(12.dp)).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink")), minLines = lines, keyboardOptions = KeyboardOptions(keyboardType = keyboardType)) } }
private fun commerceWhen(value: String?): String = value?.let { runCatching { DateTimeFormatter.ofPattern("MMM d, uuuu HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it) } ?: "—"
private fun commerceID(value: String) = "REQ-" + value.take(8).uppercase()
private fun commerceRequestCategory(packet: CommercePacket): String = when {
    packet.delivered_at != null || packet.commitment_state == "delivered" -> QelvoraCopy.text("nativeDelivered")
    packet.state in listOf("draft", "declined", "withdrawn", "expired") || packet.commitment_state in listOf("refunded", "resolved") -> QelvoraCopy.text("nativeClosed")
    else -> QelvoraCopy.text("nativeOpen")
}
private fun commerceOutcome(packet: CommercePacket): String = mapOf("released" to QelvoraCopy.text("nativeHoldReleasedNothingCharged"), "failed" to QelvoraCopy.text("nativePaymentFailedNothingCharged"), "unknown" to QelvoraCopy.text("nativeConfirmingPayment"), "requires_action" to QelvoraCopy.text("nativePaymentAuthenticationNeeded"), "refund_pending" to QelvoraCopy.text("nativeRefundProcessing"), "refunded" to QelvoraCopy.text("nativeRefundConfirmed"))[packet.payment_state] ?: if (packet.delivered_at != null || packet.commitment_state == "delivered") QelvoraCopy.text("nativeDelivered") else packet.state.replace('_', ' ')
