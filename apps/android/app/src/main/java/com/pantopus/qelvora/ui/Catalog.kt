package com.pantopus.qelvora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.Modifier
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens

object NativeComponentRegistry {
    val implemented = listOf("Mark", "Seal", "Avatar", "AuthorLabel", "IdentityStrip", "ThreadHeader", "SignedMarker", "SystemLine", "Message", "Note", "ReactionChip", "CitationChip", "MemoryChip", "Correction", "ContextCard", "VoiceNote", "Composer", "StepIn", "AccessLines", "ModeList", "IncludeList", "TermsBlock", "EtaLine", "RequestStatus", "Receipt", "SpendLimit", "QueueCard", "CapacityHeader", "LabelPreview", "SigningSheet", "AuditBanner", "SourceRow", "Button", "TabBar", "Segmented", "Notice", "NotificationRow", "EmptyState", "ShareCard", "CallChip", "ReservedLabel", "Countdown", "InsteadMenu", "TestConsole", "VersionList", "DigestItem", "StudioTabBar", "Sidebar", "Sheet", "Dialog", "Toast", "Skeleton", "EmailFrame")
    val pending = emptyList<String>()
}

@Composable
fun NativeFoundationCatalog(component: String? = null) {
    var selected by remember { mutableStateOf("Mark") }
    var choosing by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(QelvoraTokens.space4), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space6)) {
        if (component == null) {
            Button("Component · $selected", ButtonVariant.SECONDARY, block = true, onClick = { choosing = !choosing })
            if (choosing) Column(Modifier.heightIn(max = QelvoraTokens.skeletonWidth).verticalScroll(rememberScrollState())) { NativeComponentRegistry.implemented.forEach { name -> TextLine(name, "label", modifier = Modifier.fillMaxWidth().heightIn(min = QelvoraTokens.touchTarget).clickable(role = Role.Button) { selected = name; choosing = false }.padding(QelvoraTokens.space3)) } }
        }
        listOf(component ?: selected).forEach { name ->
            Column(verticalArrangement = Arrangement.spacedBy(QelvoraTokens.space4)) {
                BasicText(name, style = qText("display-md").copy(color = qColor("ink")))
                NativeComponentPreview(name)
            }
        }
    }
}
