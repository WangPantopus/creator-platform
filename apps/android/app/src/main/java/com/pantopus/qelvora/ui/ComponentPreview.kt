package com.pantopus.qelvora.ui

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T

/** Design fixtures; the host supplies real network, signatures, payment and voice playback. */
@Composable
fun NativeComponentPreview(name: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(T.space4)) {
        when (name) {
            "Mark" -> AuthorKind.entries.forEach { Mark(it, T.glyphSize) }
            "Seal" -> Row(horizontalArrangement = Arrangement.spacedBy(T.space4)) { Seal(size = T.space4); Seal(size = T.glyphSize); Seal(size = T.space8 - T.hairline * 2); Seal(size = T.touchTarget); Seal(size = T.glyphSize, live = true) }
            "Avatar" -> Row(horizontalArrangement = Arrangement.spacedBy(T.space4)) { Avatar(); Avatar(live = true) }
            "AuthorLabel" -> AuthorKind.entries.forEach { AuthorLabel(it, time = "14:38") }
            "IdentityStrip" -> IdentityState.entries.forEach { IdentityStrip(it) }
            "ThreadHeader" -> { ThreadHeader(); ThreadHeader(live = true) }
            "SignedMarker" -> { SignedMarker(time = "14:38"); SignedMarker(extra = "312 members") }
            "SystemLine" -> { SystemLine(copy("handback", "name" to "Maya")); SystemLine(variant = SystemLineVariant.PRESENCE, time = "14:38"); SystemLine("TODAY · OCT 4", SystemLineVariant.DATE) }
            "Message" -> {
                Message(MessageKind.FAN, "My satin white keeps crawling at the rim.")
                Message(children = "Try a thinner coat. Let each layer dry.", time = "14:32", citation = { CitationChip("Single-dip method", "VIDEO · 2 MIN") })
                Message(MessageKind.HUMAN_CREATOR, "Single dip, count to three, and let it drip off.", time = "14:38", live = true)
                Message(MessageKind.TEAM, "Your workshop seat is confirmed.", time = "16:05")
                DraftTreatment.entries.forEach { Message(MessageKind.APPROVED_DRAFT, "Thin the glaze to 1.45 specific gravity.", time = "OCT 4", treatment = it) }
            }
            "Note" -> Note("Opened the kiln this morning. The new celadon test came out the color of shallow water.", audienceSize = "312", time = "09:12", media = "Photo · three test tiles on the kiln shelf")
            "ReactionChip" -> ReactionChip()
            "CitationChip" -> { CitationChip("Maya's single-dip method", "VIDEO · 2 MIN"); CitationChip("Glaze notes", "PDF · OCT 1", stamp = "PDF"); CitationChip("Old recipe", unavailable = true) }
            "MemoryChip" -> { MemoryChip("You fire cone 6 oxidation."); MemoryChip("Your studio schedule.", MemoryVariant.ASK) }
            "Correction" -> Correction("I use cone 6 for this recipe. The higher firing changes the surface.", aiText = "Fire this glaze to cone 8.", aiTime = "14:32", time = "14:38")
            "ContextCard" -> ContextCard(copy("welcomeSource"), copy("welcomeContext"))
            "VoiceNote" -> { VoiceNote(transcript = "Sponge the rim before it goes into the kiln."); VoiceNote(VoiceKind.AI, transcript = "Maya's AI: let the coat dry before a second dip.") }
            "Composer" -> ComposerState.entries.forEach { Composer(it) }
            "StepIn" -> { StepIn(); StepIn(disabled = true) }
            "AccessLines" -> AccessLines()
            "ModeList" -> ModeList(listOf(RequestMode("Written reply", "Within 48 hours", "$25", selected = true), RequestMode("Voice note", "Within 48 hours", "$40"), RequestMode("Ten-minute call", "Fully booked this week", "$75", disabled = true)))
            "IncludeList" -> IncludeList("My satin white crawls at the rim. Cone 6, dipped.", listOf(IncludeItem("Photo of the test tile", "One attachment", checked = true), IncludeItem("Selected conversation context", checked = false)))
            "TermsBlock" -> TermsBlock()
            "EtaLine" -> EtaLine(ahead = 3)
            "RequestStatus" -> RequestStatus(steps = listOf(RequestStep("Sent to Maya", "OCT 4", RequestStepState.DONE), RequestStep("Waiting for Maya's decision", "31 H LEFT", RequestStepState.CURRENT), RequestStep("Reply delivered")), outcome = copy("declined", "name" to "Maya"))
            "Receipt" -> Receipt(rows = listOf("Mode" to "Written reply", "Paid" to "$25.00", "Delivered" to "OCT 4, 2026"))
            "SpendLimit" -> SpendLimit()
            "QueueCard" -> { QueueCard(summary = "A satin white glaze is crawling at the rim.", shared = "Summary + photo", draftReady = true); QueueCard(QueueKind.COMMITMENT, due = "2 H", summary = "Accepted reply is due.", overdue = true) }
            "CapacityHeader" -> CapacityHeader(listOf(CapacityRow("Written replies", 7, 10), CapacityRow("Voice notes", 3, 4)), "New requests open Monday.")
            "LabelPreview" -> { LabelPreview(); LabelPreview(AuthorKind.HUMAN_CREATOR); LabelPreview(AuthorKind.TEAM) }
            "SigningSheet" -> SigningSheet(rows = listOf("Fan" to "@kilnfire", "Mode" to "Written reply", "Price" to "$25.00", "Deadline" to "OCT 6 · 14:00"))
            "AuditBanner" -> AuditBanner()
            "SourceRow" -> { SourceRow("Glaze notes", "PDF · OCT 1"); SourceRow("Kiln Club recipe", "PDF · SEP 28", "Kiln Club", SourceState.CANDIDATE); SourceRow("Older recipe", "Access removed", state = SourceState.REVOKED) }
            "Button" -> { ButtonVariant.entries.forEach { Button(if (it == ButtonVariant.MAYA) copy("stepIn", "name" to "Maya") else if (it == ButtonVariant.AI) copy("messageAI", "name" to "Maya") else "View request", it) }; Button("Fully booked", ButtonVariant.SECONDARY, disabled = true, disabledReason = "Fully booked this week · opens Monday"); Button(copy("continueWithPantopus"), ButtonVariant.SECONDARY, "lg", true) }
            "TabBar" -> TabBar(copy("navRequests"))
            "Segmented" -> Segmented()
            "Notice" -> listOf("neutral", "paused", "error", "offline").forEach { Notice(it, if (it == "error") "Payment did not go through" else null, if (it == "offline") "You're offline. Your message stays on this device." else "Requests still work.") }
            "NotificationRow" -> NotificationKind.entries.forEach { NotificationRow(if (it == NotificationKind.SYSTEM) "Maya passed · nothing charged." else "Your glaze question has a new reply.", it, time = "14:32", unread = it == NotificationKind.AI) }
            "EmptyState" -> EmptyState("No requests yet", "When you ask Maya to step in, your request appears here.") { Button("Explore Maya's page", ButtonVariant.SECONDARY) }
            "ShareCard" -> ShareCard("Single dip, count to three, and let it drip off. Then sponge the rim.", time = "OCT 4", verify = "EXAMPLE.INVALID/VERIFICATION/CATALOG")
            "CallChip" -> { CallChip(time = "08:42", end = "10:00"); CallChip(time = "08:42", end = "10:00", recording = true) }
            "ReservedLabel" -> ReservedKind.entries.forEach { ReservedLabel(it) }
            "Countdown" -> { Countdown("31 H LEFT TO DECIDE"); Countdown("2 H LEFT", CountdownTone.SOON); Countdown("2 H", CountdownTone.OVERDUE) }
            "InsteadMenu" -> InsteadMenu()
            "TestConsole" -> TestConsole(listOf(BoundaryTest("Authorship boundary"), BoundaryTest("Sponsor disclosure"), BoundaryTest("Scope restriction", TestState.FAIL)), transcript = TestTranscript("Scope restriction", "Show me the members-only recipe.", "Here is the recipe.", "This source belongs to Kiln Club. The public AI must not quote it."))
            "VersionList" -> VersionList(listOf(AgentVersion("v4", VersionState.DRAFT, "OCT 4", "Scope restrictions updated"), AgentVersion("v3", VersionState.LIVE, "OCT 1", "New glaze notes"), AgentVersion("v2", date = "SEP 28", changes = "Previous boundary rules")))
            "DigestItem" -> { DigestItem("Let each coat dry before a second dip.", time = "14:32"); DigestItem("Fire this recipe to cone 8.", filed = true) }
            "StudioTabBar" -> StudioTabBar(requests = 12)
            "Sidebar" -> Sidebar(requests = 12)
            "Sheet" -> Sheet("Ask Maya to step in", "WRITTEN REPLY · $25", actions = { Button("Review request", ButtonVariant.SECONDARY, block = true) }) { TermsBlock() }
            "Dialog" -> Dialog("Delete this conversation?", confirm = "Delete", destructive = true) { TextLine("This removes the conversation and its memories from your account.", "body") }
            "Toast" -> Toast("Monthly limit updated", action = "View limit")
            "Skeleton" -> { Skeleton(); Skeleton("row") }
            "EmailFrame" -> EmailFrame("Maya replied to your request", "Single dip, count to three, and let it drip off.", time = "OCT 4")
            else -> error("Missing native component fixture: $name")
        }
    }
}
