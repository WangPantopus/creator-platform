package com.pantopus.qelvora.commerce

import android.content.Context
import android.net.Uri
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
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.serialization.json.*

object CommerceFanFeature {
    fun registration(context: Context, baseURL: String?) = FanFeatureRegistration({ destination -> val path = destination.substringBefore("?"); path == "/requests" || (path.startsWith("/commerce/") && path.substringAfterLast("/") in listOf("requests", "spending", "access", "packet", "checkout", "status", "pass", "membership")) || (path.startsWith("/creators/") && path.endsWith("/access")) }) { session -> CommerceFeature(context, baseURL, session) }
}

@Composable private fun CommerceFeature(context: Context, baseURL: String?, session: FanSession) {
    val api = remember(baseURL,session.session?.accountId) { baseURL?.let { CommerceClient(context, it, session.session?.accountId) } }; val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<CommerceOverview?>(null) }; var detail by remember { mutableStateOf<CommerceDetail?>(null) }
    val arrival = remember(session.destination) { Uri.parse(session.destination) }; val arrivalPath = arrival.path.orEmpty()
    var screen by remember { mutableStateOf(if (arrivalPath.startsWith("/commerce/")) arrivalPath.substringAfterLast("/") else if (arrivalPath.endsWith("/access")) "access" else "requests") }
    var category by remember { mutableStateOf("Open") }; var creator by remember { mutableStateOf("") }
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
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    suspend fun report(error: Exception) {
        if (error is CancellationException) throw error
        failure = if (error is CommerceFailure || error is IllegalArgumentException) error.message.orEmpty() else "Reconnect to refresh. Your input is kept; actions are unavailable while offline."
        if (error is CommerceFailure && error.status == 401) { data = null; detail = null; session.refresh() }
    }
    suspend fun refresh() {
        val client = api ?: run { failure = "Commerce is not connected yet."; return }; busy = true
        try {
            val accountId = session.session?.accountId
            val current = client.overview()
            if (accountId != session.session?.accountId) return
            data = current
            current.limits.firstOrNull { it.currency == current.policy.currency }?.let { limit ->
                if (limit.version != limitVersion) {
                    val pending = limit.effective_at != null
                    choice = if (if (pending) limit.pending_none == true else limit.explicit_none) "No limit" else "Choose an amount"
                    amount = (if (pending) limit.pending_amount else limit.amount)?.toBigDecimal()?.movePointLeft(java.util.Currency.getInstance(limit.currency).defaultFractionDigits)?.stripTrailingZeros()?.toPlainString().orEmpty()
                    reminders = limit.reminders_on; limitVersion = limit.version
                }
            }
            if (creator.isEmpty()) creator = current.creators.firstOrNull()?.id.orEmpty(); detail?.let { detail = client.detail(it.packet.id) }; failure = ""
        }
        catch (error: Exception) { report(error) } finally { busy = false }
    }
    suspend fun mutate(path: String, values: JsonObject, message: String) {
        if (busy) return; val client = api ?: return; busy = true
        try {
            val signature = path + values.toString(); val key = keys.getOrPut(signature) { UUID.randomUUID().toString() }
            client.request(path, JsonObject(values + ("idempotencyKey" to JsonPrimitive(key)))); notice = message; failure = ""; refresh()
        } catch (error: Exception) { report(error) } finally { busy = false }
    }
    LaunchedEffect(session.session?.accountId, session.destination) {
        refresh()
        creator = arrival.getQueryParameter("creatorId") ?: data?.creators?.firstOrNull { arrivalPath.startsWith("/creators/${it.handle}/") }?.id ?: creator
        if (screen == "status") arrival.getQueryParameter("packetId")?.let { id -> try { detail = api?.detail(id) } catch (error: Exception) { report(error) } }
    }
    LaunchedEffect(screen, creator, data?.fan?.id, foreground) {
        access = null; accessReceivedAt = null
        val fanId = data?.fan?.id
        val client = api
        if (screen != "access" || !foreground || creator.isEmpty() || fanId == null || client == null) return@LaunchedEffect
        val creatorId = creator; val accountId = session.session?.accountId
        while (isActive) {
            val checkedAt = Instant.now()
            try {
                val value = client.access(creatorId, fanId)
                if (!isActive || session.session?.accountId != accountId || value.creatorId != creatorId || value.fanId != fanId) return@LaunchedEffect
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
            if (screen != "requests") Button("Back", ButtonVariant.QUIET) { screen = "requests"; detail = null }
            Button("Refresh", ButtonVariant.QUIET, disabled = busy) { scope.launch { refresh() } }
        }
        if (failure.isNotEmpty()) Notice("error", "Connection status", failure)
        if (notice.isNotEmpty()) Notice(title = "Saved", children = notice)
        val current = data
        if (current == null) { CommerceText(if (busy) "Loading commerce…" else "This information is unavailable", "display-md") }
        else when (screen) {
            "spending" -> {
                CommerceText("Spending and time", "display-md")
                BasicText(commerceMoney(current.exposure?.captured ?: 0, current.policy.currency), style = qText("data-lg").copy(fontSize = 44.sp, lineHeight = 48.sp, color = qColor("ink")))
                CommerceText("Charged this UTC calendar month", "caption")
                current.exposure?.month?.let { CommerceText("$it · UTC", "data-sm") }
                val limit = current.limits.firstOrNull { it.currency == current.policy.currency }
                CommercePanel {
                    CommerceRow("Current limit", limit?.let { if (it.explicit_none) "No limit" else commerceMoney(it.amount?.toLongOrNull() ?: 0, it.currency) } ?: "Choose before your first paid action")
                    CommerceRow("Held, not charged", commerceMoney(current.exposure?.held ?: 0, current.policy.currency))
                    current.exposure?.refunded?.let { CommerceRow("Refunds recorded", commerceMoney(it, current.policy.currency)) }
                    limit?.effective_at?.let { CommerceText("Your increase takes effect ${commerceWhen(it)}.", "caption") }
                }
                SpendLimit(options = listOf("Choose an amount", "No limit"), selected = choice, remindersOn = limit?.reminders_on, onSelect = { choice = it })
                if (choice == "Choose an amount") CommerceField("Monthly amount in ${current.policy.currency}", amount, { amount = it }, keyboardType = KeyboardType.Decimal)
                Button(if (reminders) "Reminders at 50% and 100% · on" else "Reminders at 50% and 100% · off", ButtonVariant.QUIET, block = true) { reminders = !reminders }
                CommerceText("Increases take 24 hours. Decreases are immediate and affect new requests. Existing obligations remain.", "caption")
                Button(if (busy) "Saving…" else "Save limit", ButtonVariant.SECONDARY, block = true, disabled = busy || choice == null) { scope.launch {
                    try { val value = if (choice == "No limit") null else commerceMinor(amount, current.policy.currency); mutate("spend-limit", buildJsonObject { put("currency", current.policy.currency); put("amount", value?.let { JsonPrimitive(it) } ?: JsonNull); put("explicitNone", choice == "No limit"); put("remindersOn", reminders) }, "Your spending choice is saved.") } catch (error: Exception) { report(error) }
                } }
                current.spendingNotices.forEach { notice -> CommerceText("You’ve reached ${notice.threshold}% of your monthly limit.") }
                Notice(title = "AI time", children = "Your time summary is unavailable until conversation activity is connected.")
            }
            "access", "packet" -> {
                val name = current.creators.firstOrNull { it.id == creator }?.display_name ?: "the creator"; val modes = current.modes.filter { it.creator_id == creator }
                CommerceText(if (screen == "access") "Access" else "Included in your request", "display-md")
                if (screen == "access") {
                    current.creators.forEach { owner -> Button(owner.display_name, ButtonVariant.QUIET, block = true) { creator = owner.id } }
                    val currentAccess = access?.takeIf { value -> value.creatorId == creator && value.fanId == current.fan?.id && accessReceivedAt?.plusSeconds(5)?.isAfter(accessNow) == true && (value.validUntil == null || runCatching { Instant.parse(value.validUntil).isAfter(accessNow) }.getOrDefault(false)) }
                    val can = currentAccess?.let { value -> listOf(
                        if (value.capabilities.contains("ai_message")) if (value.allowance.available > 0) "Message this AI." else "Your AI allowance is used for this period." else "",
                        if (value.capabilities.contains("note")) "Read included notes." else "",
                        if (value.capabilities.contains("request")) "Request available services." else ""
                    ).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { "Read your existing conversations." } } ?: "Current access is unavailable. Refresh to try again."
                    val labels = mapOf("membership" to "Membership", "comp" to "Gifted access", "commitment" to "Accepted service", "pass_slot" to "Pass AI reach", "trial" to "Conversation trial")
                    val included = currentAccess?.sources?.map { labels[it.source] ?: "Current access" }?.distinct()?.sorted()?.joinToString(", ")?.ifEmpty { "No included access for this creator." } ?: "Benefits cannot be confirmed."
                    val paid = current.memberships.filter { it.creator_id == creator && it.state in listOf("active", "grace", "cancelled") && runCatching { Instant.parse(it.period_end).isAfter(accessNow) }.getOrDefault(false) }
                    val availableModes = modes.filter { it.state == "offered" && it.used + it.reserved < it.weekly_limit }
                    val changes = (paid.map { "${it.name}: ${if (it.cancel_at_end || it.state == "cancelled") "ends" else "renews"} ${commerceWhen(it.period_end)}" } + (currentAccess?.sources?.filter { it.source != "membership" }?.map { "${labels[it.source] ?: "Access"} ends ${commerceWhen(it.validUntil)}" } ?: emptyList())).joinToString("; ")
                    AccessLines(name, can, included, if (availableModes.isEmpty()) "No human modes are currently available." else availableModes.joinToString(", ") { it.title }, changes.ifEmpty { "Access refreshes from the server." })
                } else { CommerceText("Change anything; nothing is sent until you do."); IncludeList(summary, name = name, onSummary = { summary = it }) }
                ModeList(modes.map { RequestMode(it.title, "${it.delivery_hours} h · ${maxOf(0, it.weekly_limit - it.used - it.reserved)} left", it.amount?.toLongOrNull()?.let { value -> commerceMoney(value, it.currency) } ?: "Price not set", selectedMode == it.id, it.state != "offered" || it.used + it.reserved >= it.weekly_limit) }) { index -> selectedMode = modes[index].id }
                if (screen == "access") { Button("Ask $name to step in", ButtonVariant.SECONDARY, block = true, disabled = modes.none { it.state == "offered" && it.used + it.reserved < it.weekly_limit }) { screen = "packet" }; Button("Manage membership", ButtonVariant.QUIET, block = true) { screen = "membership" } }
                else { Notice(title = "Payment unavailable", children = "Paid written and voice requests are unavailable in this native app. Your draft stays on this screen."); Button("Send request", ButtonVariant.SECONDARY, block = true, disabled = true) {} }
            }
            "checkout" -> Notice(title = "Payment unavailable", children = "Paid written and voice requests are unavailable in this native app.")
            "status" -> detail?.let { value ->
                val packet = value.packet
                val name = current.creators.firstOrNull { it.id == packet.creator_id }?.display_name ?: "the creator"
                CommerceText(packet.snapshot.title, "display-md"); RequestStatus(reqId = commerceID(packet.id), mode = packet.snapshot.title, price = commerceMoney(packet.snapshot.amount, packet.snapshot.currency), outcome = commerceOutcome(packet))
                CommerceRow("Decision deadline", commerceWhen(packet.decision_at)); CommerceRow("Bank authorization expires", commerceWhen(packet.hold_expires_at)); value.commitment?.let { CommerceRow("Delivery deadline", commerceWhen(it.due_at)) }
                value.callTransport?.let { transport ->
                    Notice(title = "System · call status", children = if (transport.state == "closed_unresolved") "The call room closed after neither participant joined during the arrival window. The service outcome remains unresolved. Recorded ${commerceWhen(transport.recordedAt)}. Check the current receipt for billing status." else "Current call status is unavailable. Your recorded receipt remains available.")
                }
                if (packet.state == "more_info") {
                    CommerceText(packet.question ?: "The creator asked for more information."); CommerceField("Your answer", info, { info = it }, 4)
                    Button("Send answer", ButtonVariant.SECONDARY, block = true, disabled = busy || info.isBlank()) { scope.launch { mutate("packets/${packet.id}/info", buildJsonObject { put("version", packet.version); put("text", info) }, "Your answer is saved.") } }
                }
                if (packet.state in listOf("submitting", "submitted", "more_info", "offer_pending")) Button("Withdraw request", ButtonVariant.SECONDARY, block = true, disabled = busy) { scope.launch { mutate("packets/${packet.id}/withdraw", buildJsonObject { put("version", packet.version) }, "Hold release is being confirmed.") } }
                if (packet.payment_state in listOf("unknown", "requires_action")) Notice(title = "Payment processing", children = "The provider must confirm payment. No completion is inferred from this screen.")
                if (value.commitment?.delivered_at != null && value.commitment.state in listOf("delivered", "refunded", "resolved")) {
                    val signedActId = value.commitment.evidence?.signedActId ?: value.commitment.accept_act_id
                    val label = when (value.commitment.evidence?.authorKind) {
                        "approved_draft" -> "Prepared by AI · approved by $name"
                        "human_creator" -> "${packet.snapshot.title} · personally fulfilled by $name"
                        "human_call" -> "Personal call · provider-confirmed outcome"
                        "system" -> "System delivery notice"
                        else -> "Delivery recorded"
                    }
                    val refund = value.ledger.filter { it.kind == "refund" && it.currency == packet.snapshot.currency }.sumOf { it.amount.toLong() }
                    val rows = listOf("Charged" to commerceMoney(packet.snapshot.amount, packet.snapshot.currency), "Delivered" to commerceWhen(value.commitment.delivered_at)) + if (refund > 0) listOf("Refund confirmed" to commerceMoney(refund, packet.snapshot.currency)) else emptyList()
                    if (signedActId != null) Receipt(name = name, reqId = commerceID(packet.id), title = packet.snapshot.title, rows = rows, label = label, onVerify = { session.destination = "/verify/$signedActId" })
                    else CommercePanel { CommerceText("Receipt", "receipt-title"); rows.forEach { (label, amount) -> CommerceRow(label, amount) }; CommerceText(label, "caption") }
                    if (value.commitment.state == "delivered" || value.share?.fan_choice == true) Button(if (value.share?.fan_choice == true) "Revoke sharing" else "Allow sharing without your handle", ButtonVariant.SECONDARY, block = true, disabled = busy || (!packet.snapshot.shareable && value.share?.fan_choice != true) || value.share?.revoked_at != null) { scope.launch { mutate("packets/${packet.id}/share", buildJsonObject { put("version", value.share?.version ?: 1); put("enabled", value.share?.fan_choice != true); put("handleDisplay", "hidden") }, "Your sharing choice is saved.") } }
                }
            }
            "membership" -> {
                CommerceText("Manage membership", "display-md")
                if (current.memberships.isEmpty()) CommerceText("No memberships yet")
                current.memberships.forEach { member -> CommercePanel { CommerceText(member.name, "title"); CommerceRow("Status", member.state); CommerceRow("Access until", commerceWhen(member.period_end)); CommerceRow("Billing provider", member.provider) } }
                val accountId=session.session?.accountId
                if(current.capabilities.storePurchasesAvailable && api!=null && accountId!=null) StoreMembershipPane(context,accountId,api,current.tiers.filter {it.state=="active"}.mapNotNull {it.catalog.google}) {refresh()}
                else {
                    Notice(title = "Purchase and restore unavailable", children = "Store products must be configured and verified by the server before access is granted.")
                    if(current.memberships.any {it.provider=="google"}) key(accountId) {StoreSubscriptionManagement(context)}
                }
                CommerceText("Unused memberships cancelled within seven days qualify for a full refund. Later refunds follow the remaining paid period; store refunds follow that store's process.", "caption")
            }
            "pass" -> {
                CommerceText("Your pass", "display-md")
                if (!current.policy.passEnabled) Notice(title = "Pass is unavailable", children = "Memberships are the current way to deepen access. The pass is not open yet.")
                if(current.policy.passEnabled) current.pass.firstOrNull()?.let { pass ->
                    val passCurrent = pass.state in listOf("active", "cancelled") && runCatching { Instant.parse(pass.cycle_end.take(10) + "T00:00:00Z").isAfter(accessNow) }.getOrDefault(false)
                    CommerceText("${pass.used + pass.reserved} of ${pass.allowance} shared AI cost units used or reserved.")
                    current.passChoices.creators.forEach { candidate -> Row(Modifier.fillMaxWidth().heightIn(min=48.dp).toggleable(passSelection.contains(candidate.id),role=Role.Checkbox) { selected -> passSelection=if(selected)passSelection+candidate.id else passSelection-candidate.id }.padding(12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) { Box(Modifier.size(T.checkboxSize).background(if(passSelection.contains(candidate.id))qColor("ink") else qColor("surface"),RoundedCornerShape(T.radiusTail)).border(T.hairline,qColor("control-line"),RoundedCornerShape(T.radiusTail)),contentAlignment=Alignment.Center) {if(passSelection.contains(candidate.id))Glyph("check",T.space4,qColor("surface"))}; CommerceText(candidate.display_name) } }
                    val occupied=current.slots.filter { it.cycle_start==pass.cycle_start && it.state in listOf("active","draft_next","ended_readable","replaced") }.map { it.position }.toSet().size
                    if(occupied<pass.slot_capacity) Button("Fill available slots",ButtonVariant.SECONDARY,block=true,disabled=busy || !passCurrent || passSelection.isEmpty() || passSelection.size>pass.slot_capacity-occupied) { scope.launch { mutate("pass/initial",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},"Your current choices are saved.") } }
                    Button("Save next month’s choices",ButtonVariant.SECONDARY,block=true,disabled=busy || !passCurrent || passSelection.size>pass.slot_capacity) { scope.launch { mutate("pass/draft",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},"Your next-month draft is saved.") } }
                    CommerceText("Complete all ${pass.slot_capacity} choices. An incomplete draft carries forward your current selection.","caption")
                }
                current.slots.forEach { slot -> CommercePanel {
                    CommerceRow(slot.display_name, slot.state.replace('_', ' ')); CommerceText("Through ${commerceWhen(slot.ends_at)}", "caption")
                    if(current.policy.passEnabled && current.passChoices.replaceableSlotIds.contains(slot.id)) current.pass.firstOrNull()?.let { pass ->
                        CommerceText("Free replacement", "label")
                        current.passChoices.creators.filter { candidate -> current.slots.none { it.state=="active" && it.creator_id==candidate.id } }.forEach { candidate -> Button(candidate.display_name,ButtonVariant.QUIET,block=true) {replacement=candidate.id} }
                        Button("Replace unavailable creator",ButtonVariant.SECONDARY,block=true,disabled=busy || replacement.isEmpty()) { scope.launch { mutate("pass/slots/${slot.id}/replace",buildJsonObject {put("version",pass.version);put("creatorId",replacement)},"Your replacement is saved.") } }
                    }
                } }
                CommerceText("A pass grants AI reach. Separate memberships grant tier depth and do not consume a slot.")
            }
            else -> {
                CommerceText("Requests", "display-lg"); Segmented(listOf("Open", "Delivered", "Closed"), category) { category = it }
                val visible = current.packets.filter { commerceRequestCategory(it) == category }
                if (visible.isEmpty()) CommerceText(if (current.packets.isEmpty()) "No requests here. Requests appear after you send them." else "No requests here. Choose another category to view your requests and retained receipts.")
                visible.forEach { packet ->
                    RequestStatus(reqId = commerceID(packet.id), mode = packet.snapshot.title, price = commerceMoney(packet.snapshot.amount, packet.snapshot.currency), outcome = commerceOutcome(packet))
                    Button("View request", ButtonVariant.SECONDARY, block = true, disabled = busy) { scope.launch { try { busy = true; detail = api?.detail(packet.id); screen = "status" } catch (error: Exception) { report(error) } finally { busy = false } } }
                }
                Button("Spending and time", ButtonVariant.SECONDARY, block = true) { screen = "spending" }
                Button("Creator access", ButtonVariant.SECONDARY, block = true) { screen = "access" }
                Button("Manage membership", ButtonVariant.QUIET, block = true) { screen = "membership" }
                Button("Your pass", ButtonVariant.QUIET, block = true) { screen = "pass" }
            }
        }
    }
}
@Composable private fun CommerceText(text: String, style: String = "body") { BasicText(text, style = qText(style).copy(color = qColor("ink"))) }
@Composable private fun CommercePanel(content: @Composable ColumnScope.() -> Unit) { Column(Modifier.fillMaxWidth().background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("line"), RoundedCornerShape(12.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) }
@Composable private fun CommerceRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) { Box(Modifier.weight(1f)) { CommerceText(label) }; Box(Modifier.weight(1f)) { CommerceText(value, "data-md") } } }
@Composable private fun CommerceField(label: String, value: String, onChange: (String) -> Unit, lines: Int = 1, keyboardType: KeyboardType = KeyboardType.Text) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { CommerceText(label, "label"); BasicTextField(value, onChange, Modifier.fillMaxWidth().heightIn(min = 48.dp).background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("control-line"), RoundedCornerShape(12.dp)).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink")), minLines = lines, keyboardOptions = KeyboardOptions(keyboardType = keyboardType)) } }
private fun commerceWhen(value: String?): String = value?.let { runCatching { DateTimeFormatter.ofPattern("MMM d, uuuu HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it) } ?: "—"
private fun commerceID(value: String) = "REQ-" + value.take(8).uppercase()
private fun commerceRequestCategory(packet: CommercePacket): String = when {
    packet.delivered_at != null || packet.commitment_state == "delivered" -> "Delivered"
    packet.state in listOf("draft", "declined", "withdrawn", "expired") || packet.commitment_state in listOf("refunded", "resolved") -> "Closed"
    else -> "Open"
}
private fun commerceOutcome(packet: CommercePacket): String = mapOf("released" to "Hold released · nothing charged", "failed" to "Payment failed · nothing charged", "unknown" to "Confirming payment", "requires_action" to "Payment authentication needed", "refund_pending" to "Refund processing", "refunded" to "Refund confirmed")[packet.payment_state] ?: if (packet.delivered_at != null || packet.commitment_state == "delivered") "Delivered" else packet.state.replace('_', ' ')
