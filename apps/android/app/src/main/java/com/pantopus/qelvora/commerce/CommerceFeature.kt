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
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import com.pantopus.qelvora.generated.QelvoraTokens as T
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanFeatureRegistration
import com.pantopus.qelvora.ui.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

object CommerceFanFeature {
    fun registration(context: Context, baseURL: String?) = FanFeatureRegistration({ destination -> val path = destination.substringBefore("?"); path == "/requests" || (path.startsWith("/commerce/") && path.substringAfterLast("/") in listOf("requests", "spending", "access", "packet", "checkout", "status", "pass", "membership")) || (path.startsWith("/creators/") && path.endsWith("/access")) }) { session -> CommerceFeature(context, baseURL, session) }
}

@Composable private fun CommerceFeature(context: Context, baseURL: String?, session: FanSession) {
    val api = remember(baseURL,session.session?.accountId) { baseURL?.let { CommerceClient(context, it) } }; val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<CommerceOverview?>(null) }; var detail by remember { mutableStateOf<CommerceDetail?>(null) }
    val arrival = remember(session.destination) { Uri.parse(session.destination) }; val arrivalPath = arrival.path.orEmpty()
    var screen by remember { mutableStateOf(if (arrivalPath.startsWith("/commerce/")) arrivalPath.substringAfterLast("/") else if (arrivalPath.endsWith("/access")) "access" else "requests") }
    var category by remember { mutableStateOf("Open") }; var creator by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }; var failure by remember { mutableStateOf("") }; var notice by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }; var choice by remember { mutableStateOf<String?>(null) }; var reminders by remember { mutableStateOf(true) }
    var summary by remember { mutableStateOf("") }; var info by remember { mutableStateOf("") }; var selectedMode by remember { mutableStateOf<String?>(null) }
    var passSelection by remember { mutableStateOf(setOf<String>()) }
    var replacement by remember { mutableStateOf("") }
    val keys = remember { mutableMapOf<String, String>() }
    suspend fun report(error: Exception) {
        if (error is CancellationException) throw error
        failure = if (error is CommerceFailure || error is IllegalArgumentException) error.message.orEmpty() else "Reconnect to refresh. Your input is kept; actions are unavailable while offline."
        if (error is CommerceFailure && error.status == 401) { data = null; detail = null; session.refresh() }
    }
    suspend fun refresh() {
        val client = api ?: run { failure = "Commerce is not connected yet."; return }; busy = true
        try { val current = client.overview(); data = current; if (creator.isEmpty()) creator = current.creators.firstOrNull()?.id.orEmpty(); detail?.let { detail = client.detail(it.packet.id) }; failure = "" }
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
                CommerceText("Spending and time", "display-md"); CommerceText(commerceMoney(current.exposure?.captured ?: 0, current.policy.currency), "spend-total"); CommerceText("Charged this calendar month", "caption")
                val limit = current.limits.firstOrNull { it.currency == current.policy.currency }
                CommercePanel {
                    CommerceRow("Current limit", limit?.let { if (it.explicit_none) "No limit" else commerceMoney(it.amount?.toLongOrNull() ?: 0, it.currency) } ?: "Choose before your first paid action")
                    CommerceRow("Held, not charged", commerceMoney(current.exposure?.held ?: 0, current.policy.currency))
                    limit?.effective_at?.let { CommerceText("Your increase takes effect ${commerceWhen(it)}.", "caption") }
                }
                SpendLimit(options = listOf("Choose an amount", "No limit"), selected = choice, onSelect = { choice = it })
                if (choice == "Choose an amount") CommerceField("Monthly amount in ${current.policy.currency}", amount, { amount = it })
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
                    AccessLines(name, "Review current offers and manage requests.", if (current.memberships.any { it.creator_id == creator && it.state in listOf("active", "grace") }) "Your current membership." else "No active membership for this creator.", "Human services below, subject to capacity.", "Memberships renew separately from requests; pass reach grants no tier depth.")
                } else { CommerceText("Change anything; nothing is sent until you do."); IncludeList(summary, name = name, onSummary = { summary = it }) }
                ModeList(modes.map { RequestMode(it.title, "${it.delivery_hours} h · ${maxOf(0, it.weekly_limit - it.used - it.reserved)} left", it.amount?.toLongOrNull()?.let { value -> commerceMoney(value, it.currency) } ?: "Price not set", selectedMode == it.id, it.state != "offered" || it.used + it.reserved >= it.weekly_limit) }) { index -> selectedMode = modes[index].id }
                if (screen == "access") { Button("Ask $name to step in", ButtonVariant.SECONDARY, block = true, disabled = modes.isEmpty()) { screen = "packet" }; Button("Manage membership", ButtonVariant.QUIET, block = true) { screen = "membership" } }
                else { Notice(title = "Payment unavailable", children = "Paid written and voice requests are unavailable in this native app. Your draft stays on this screen."); Button("Send request", ButtonVariant.SECONDARY, block = true, disabled = true) {} }
            }
            "checkout" -> Notice(title = "Payment unavailable", children = "Paid written and voice requests are unavailable in this native app.")
            "status" -> detail?.let { value ->
                val packet = value.packet
                CommerceText(packet.snapshot.title, "display-md"); RequestStatus(reqId = commerceID(packet.id), mode = packet.snapshot.title, price = commerceMoney(packet.snapshot.amount, packet.snapshot.currency), outcome = commerceOutcome(packet))
                CommerceRow("Decision deadline", commerceWhen(packet.decision_at)); CommerceRow("Bank authorization expires", commerceWhen(packet.hold_expires_at)); value.commitment?.let { CommerceRow("Delivery deadline", commerceWhen(it.due_at)) }
                if (packet.state == "more_info") {
                    CommerceText(packet.question ?: "The creator asked for more information."); CommerceField("Your answer", info, { info = it }, 4)
                    Button("Send answer", ButtonVariant.SECONDARY, block = true, disabled = busy || info.isBlank()) { scope.launch { mutate("packets/${packet.id}/info", buildJsonObject { put("version", packet.version); put("text", info) }, "Your answer is saved.") } }
                }
                if (packet.state in listOf("submitting", "submitted", "more_info", "offer_pending")) Button("Withdraw request", ButtonVariant.SECONDARY, block = true, disabled = busy) { scope.launch { mutate("packets/${packet.id}/withdraw", buildJsonObject { put("version", packet.version) }, "Hold release is being confirmed.") } }
                if (packet.payment_state in listOf("unknown", "requires_action")) Notice(title = "Payment processing", children = "The provider must confirm payment. No completion is inferred from this screen.")
                if (value.commitment?.state == "delivered") {
                    CommercePanel { CommerceText("Receipt", "receipt-title"); CommerceRow("Charged", commerceMoney(packet.snapshot.amount, packet.snapshot.currency)); CommerceRow("Delivered", commerceWhen(value.commitment.delivered_at)); CommerceText("Signed proof is available with the delivered reply.", "caption") }
                    Button(if (value.share?.fan_choice == true) "Revoke sharing" else "Allow sharing without your handle", ButtonVariant.SECONDARY, block = true, disabled = busy || !packet.snapshot.shareable || value.share?.revoked_at != null) { scope.launch { mutate("packets/${packet.id}/share", buildJsonObject { put("version", value.share?.version ?: 1); put("enabled", value.share?.fan_choice != true); put("handleDisplay", "hidden") }, "Your sharing choice is saved.") } }
                }
            }
            "membership" -> {
                CommerceText("Manage membership", "display-md")
                if (current.memberships.isEmpty()) CommerceText("No memberships yet")
                current.memberships.forEach { member -> CommercePanel { CommerceText(member.name, "title"); CommerceRow("Status", member.state); CommerceRow("Access until", commerceWhen(member.period_end)); CommerceRow("Billing provider", member.provider) } }
                val accountId=session.session?.accountId
                if(current.capabilities.storePurchasesAvailable && api!=null && accountId!=null) StoreMembershipPane(context,accountId,api,current.tiers.filter {it.state=="active"}.mapNotNull {it.catalog.google}) {refresh()}
                else Notice(title = "Purchase and restore unavailable", children = "Store products must be configured and verified by the server before access is granted.")
                CommerceText("Unused memberships cancelled within seven days qualify for a full refund. Later refunds follow the remaining paid period; store refunds follow that store's process.", "caption")
            }
            "pass" -> {
                CommerceText("Your pass", "display-md")
                if (!current.policy.passEnabled) Notice(title = "Pass is unavailable", children = "Memberships are the current way to deepen access. The pass is not open yet.")
                if(current.policy.passEnabled) current.pass.firstOrNull()?.let { pass ->
                    CommerceText("${pass.used + pass.reserved} of ${pass.allowance} shared AI cost units used or reserved.")
                    current.passChoices.creators.forEach { candidate -> Row(Modifier.fillMaxWidth().heightIn(min=48.dp).toggleable(passSelection.contains(candidate.id),role=Role.Checkbox) { selected -> passSelection=if(selected)passSelection+candidate.id else passSelection-candidate.id }.padding(12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)) { Box(Modifier.size(T.checkboxSize).background(if(passSelection.contains(candidate.id))qColor("ink") else qColor("surface"),RoundedCornerShape(T.radiusTail)).border(T.hairline,qColor("control-line"),RoundedCornerShape(T.radiusTail)),contentAlignment=Alignment.Center) {if(passSelection.contains(candidate.id))Glyph("check",T.space4,qColor("surface"))}; CommerceText(candidate.display_name) } }
                    val occupied=current.slots.filter { it.cycle_start==pass.cycle_start && it.state in listOf("active","ended_readable","replaced") }.map { it.position }.toSet().size
                    if(occupied<pass.slot_capacity) Button("Fill available slots",ButtonVariant.SECONDARY,block=true,disabled=busy || passSelection.isEmpty() || passSelection.size>pass.slot_capacity-occupied) { scope.launch { mutate("pass/initial",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},"Your current choices are saved.") } }
                    Button("Save next month’s choices",ButtonVariant.SECONDARY,block=true,disabled=busy || passSelection.size>pass.slot_capacity) { scope.launch { mutate("pass/draft",buildJsonObject {put("version",pass.version);putJsonArray("creatorIds") {passSelection.sorted().forEach {add(it)}}},"Your next-month draft is saved.") } }
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
                val visible = current.packets.filter { if (category == "Delivered") it.commitment_state == "delivered" else if (category == "Closed") it.state in listOf("draft", "declined", "withdrawn", "expired") else it.state !in listOf("draft", "declined", "withdrawn", "expired") && it.commitment_state != "delivered" }
                if (visible.isEmpty()) CommerceText("No requests here. Requests appear after you send them. Nothing is held or charged here.")
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
@Composable private fun CommerceField(label: String, value: String, onChange: (String) -> Unit, lines: Int = 1) { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { CommerceText(label, "label"); BasicTextField(value, onChange, Modifier.fillMaxWidth().heightIn(min = 48.dp).background(qColor("surface"), RoundedCornerShape(12.dp)).border(1.dp, qColor("control-line"), RoundedCornerShape(12.dp)).padding(12.dp).semantics { contentDescription = label }, textStyle = qText("body").copy(color = qColor("ink")), minLines = lines) } }
private fun commerceWhen(value: String?): String = value?.let { runCatching { DateTimeFormatter.ofPattern("MMM d, uuuu HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it) } ?: "—"
private fun commerceID(value: String) = "REQ-" + value.take(8).uppercase()
private fun commerceOutcome(packet: CommercePacket): String = mapOf("released" to "Hold released · nothing charged", "failed" to "Payment failed · nothing charged", "unknown" to "Confirming payment", "requires_action" to "Payment authentication needed", "refund_pending" to "Refund processing", "refunded" to "Refund confirmed")[packet.payment_state] ?: if (packet.commitment_state == "delivered") "Delivered" else packet.state.replace('_', ' ')
