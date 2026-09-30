package com.pantopus.qelvora.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T

@Composable
fun TabBar(active: String = QelvoraCopy.text("navHome"), onSelect: (String) -> Unit = {}) {
    val tabs = listOf("navHome" to "home", "navDiscover" to "compass", "navRequests" to "inbox", "navYou" to "user")
    Column(Modifier.fillMaxWidth().background(qColor("surface"))) {
        Box(Modifier.fillMaxWidth().height(T.hairline).background(qColor("line")))
        Row(Modifier.padding(start = T.space2, end = T.space2, top = T.authorGap, bottom = T.space6)) {
            tabs.forEach { (key, glyph) ->
                val title = QelvoraCopy.text(key)
                val ink = qColor(if (title == active) "ink" else "ink-muted")
                Column(Modifier.weight(1f).heightIn(min = T.space12).selectable(title == active, role = Role.Tab) { onSelect(title) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(T.space1, Alignment.CenterVertically)) {
                    Glyph(glyph, T.glyphSize, ink)
                    BasicText(title, style = qText("tab-label").copy(color = ink))
                }
            }
        }
    }
}

@Composable
fun Segmented(items: List<String> = listOf("navChat", "navPosts", "navRequests", "navAccess").map { QelvoraCopy.text(it) }, active: String = items.firstOrNull().orEmpty(), label: String = QelvoraCopy.text("sections"), onSelect: (String) -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(qColor("surface-sunken"), RoundedCornerShape(T.radiusLg)).padding(T.space1).semantics { contentDescription = label }) {
        items.forEach { item ->
            val selected = item == active
            val shape = RoundedCornerShape(T.segmentRadius)
            var modifier = Modifier.weight(1f).height(T.segmentHeight).background(if (selected) qColor("selected-surface") else Color.Transparent, shape)
            if (selected) modifier = modifier.border(T.hairline, qColor("line"), shape)
            Box(modifier.selectable(selected, role = Role.Tab) { onSelect(item) }, contentAlignment = Alignment.Center) {
                BasicText(item, style = qText("label").copy(color = qColor(if (selected) "ink" else "ink-muted")))
            }
        }
    }
}

@Composable
internal fun NavigationCount(count: Int, halo: Boolean = false) {
    val haloColor = qColor("surface")
    Box(Modifier.drawBehind { if (halo) { val border = (T.hairline * 2).toPx(); drawRoundRect(haloColor, Offset(-border, -border), Size(size.width + border * 2, size.height + border * 2), CornerRadius(size.height / 2 + border)) } }.height(T.limitRadioSize).widthIn(min = T.limitRadioSize).background(qColor("ink"), RoundedCornerShape(T.radiusPill)).padding(horizontal = T.space1 + T.hairline).semantics { contentDescription = QelvoraCopy.text("waiting", mapOf("count" to count.toString())) }, contentAlignment = Alignment.Center) {
        BasicText(count.toString(), style = qText("data-sm").copy(color = qColor("ground")))
    }
}

@Composable
fun StudioTabBar(active: String = QelvoraCopy.text("navRequests"), requests: Int = 0, onSelect: (String) -> Unit = {}) {
    val tabs = listOf("navNotes" to "broadcast", "navRequests" to "inbox", "navThreads" to "threads", "navMyAI" to "ring", "navMore" to "more")
    Column(Modifier.fillMaxWidth().background(qColor("surface"))) {
        Box(Modifier.fillMaxWidth().height(T.hairline).background(qColor("line")))
        Row(Modifier.padding(start = T.space2, end = T.space2, top = T.authorGap, bottom = T.space6)) {
            tabs.forEach { (key, glyph) ->
                val title = QelvoraCopy.text(key)
                val ink = qColor(if (title == active) "ink" else "ink-muted")
                Column(Modifier.weight(1f).heightIn(min = T.space12).selectable(title == active, role = Role.Tab) { onSelect(title) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(T.space1, Alignment.CenterVertically)) {
                    Box(Modifier.height(T.glyphSize), contentAlignment = Alignment.Center) {
                        Glyph(glyph, if (key == "navNotes") (T.space4 + T.hairline) else T.glyphSize, ink)
                        if (key == "navRequests" && requests > 0) Box(Modifier.align(Alignment.TopStart).offset(x = T.messagePadding, y = -T.authorGap)) { NavigationCount(requests, halo = true) }
                    }
                    BasicText(title, style = qText("tab-label").copy(color = ink))
                }
            }
        }
    }
}

@Composable
fun Sidebar(name: String = "Maya", active: String = QelvoraCopy.text("navRequests"), requests: Int = 0, status: String = QelvoraCopy.text("studioLive", mapOf("version" to "v4")), onSelect: (String) -> Unit = {}) {
    val main = listOf("navNotes" to "broadcast", "navRequests" to "inbox", "navThreads" to "threads", "navMyAI" to "ring")
    val more = listOf("navOffers" to "tag", "navPublish" to "pen", "navInsights" to "chart", "navEarnings" to "coin", "navTeam" to "people")
    Row(Modifier.width(T.sidebarWidth).heightIn(min = T.sidebarMinHeight).background(qColor("surface"))) {
        Column(Modifier.weight(1f).padding(horizontal = T.space3, vertical = T.space5), verticalArrangement = Arrangement.spacedBy(T.authorGap)) {
            Row(Modifier.padding(start = T.space2, end = T.space2, bottom = T.space4), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) {
                Avatar(initial = name.take(1))
                Column(verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) {
                    BasicText(name, style = qText("body-strong").copy(color = qColor("ink")))
                    BasicText(QelvoraCopy.studioName, style = qText("sidebar-brand").copy(color = qColor("ink-muted"), fontStyle = FontStyle.Italic))
                }
            }
            SidebarGroup(main, active, requests, onSelect)
            Box(Modifier.padding(T.segmentRadius).fillMaxWidth().height(T.hairline).background(qColor("line")))
            SidebarGroup(more, active, requests, onSelect)
            Spacer(Modifier.weight(1f))
            Box(Modifier.fillMaxWidth().height(T.hairline).background(qColor("line")))
            Row(Modifier.padding(start = T.segmentRadius, end = T.segmentRadius, top = T.space3), horizontalArrangement = Arrangement.spacedBy(T.space2), verticalAlignment = Alignment.CenterVertically) {
                Glyph("ring", T.space3, qColor("ai-ink"))
                BasicText(status, style = qText("caption").copy(color = qColor("ink-muted")))
            }
        }
        Box(Modifier.fillMaxHeight().width(T.hairline).background(qColor("line")))
    }
}

@Composable
private fun SidebarGroup(items: List<Pair<String, String>>, active: String, requests: Int, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(T.space1 / 2)) {
        items.forEach { (key, glyph) ->
            val title = QelvoraCopy.text(key)
            val selected = title == active
            val ink = qColor(if (selected) "ink" else "ink-muted")
            Row(Modifier.fillMaxWidth().heightIn(min = T.segmentHeight).background(if (selected) qColor("surface-sunken") else Color.Transparent, RoundedCornerShape(T.radiusMd)).selectable(selected, role = Role.Tab) { onSelect(title) }.padding(horizontal = T.segmentRadius), horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(T.space5), contentAlignment = Alignment.Center) { Glyph(glyph, if (key == "navNotes") T.space3 + T.space1 - T.hairline else T.space5, ink) }
                BasicText(title, Modifier.weight(1f), style = qText("control-body", true).copy(color = ink))
                if (key == "navRequests" && requests > 0) NavigationCount(requests)
            }
        }
    }
}
