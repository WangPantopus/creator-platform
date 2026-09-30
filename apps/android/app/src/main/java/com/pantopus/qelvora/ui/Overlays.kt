package com.pantopus.qelvora.ui

import android.animation.ValueAnimator
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.DialogProperties
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens as T
import kotlinx.coroutines.delay

@Composable
fun Notice(tone: String = "neutral", title: String? = null, children: String) {
    val shape = RoundedCornerShape(T.radiusMd)
    var modifier = Modifier.fillMaxWidth().background(qColor(if (tone in listOf("paused", "offline")) "surface-sunken" else "surface"), shape)
    if (tone == "offline") modifier = modifier.dashedBorder(qColor("line"), T.radiusMd, T.hairline)
    else if (tone != "paused") modifier = modifier.border(T.hairline, qColor(if (tone == "error") "alert" else "line"), shape)
    Row(modifier.padding(horizontal = T.messagePadding, vertical = T.space3).semantics { liveRegion = if (tone == "error") LiveRegionMode.Assertive else LiveRegionMode.Polite }, horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = T.hairline)) { Glyph(if (tone == "error") "alert" else if (tone == "paused") "pause" else "info", T.space4, qColor(if (tone == "error") "alert" else "ink-muted")) }
        Column(Modifier.weight(1f)) {
            if (title != null) BasicText(title, style = qText("control-body", true).copy(color = qColor("ink")))
            BasicText(children, style = qText("control-body").copy(color = qColor("ink")))
        }
    }
}

@Composable
fun EmptyState(title: String, body: String? = null, action: @Composable () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(horizontal = T.space6, vertical = T.welcomeBottom), verticalArrangement = Arrangement.spacedBy(T.composerGap), horizontalAlignment = Alignment.CenterHorizontally) {
        BasicText(title, Modifier.semantics { heading() }, style = qText("display-md").copy(color = qColor("ink"), textAlign = TextAlign.Center))
        if (body != null) BasicText(body, Modifier.widthIn(max = T.skeletonWidth), style = qText("body").copy(color = qColor("ink-muted"), textAlign = TextAlign.Center))
        action()
    }
}

@Composable
fun Sheet(title: String, meta: String? = null, onClose: () -> Unit = {}, actions: @Composable () -> Unit = {}, children: @Composable () -> Unit) {
    val shape = RoundedCornerShape(topStart = T.radiusXl, topEnd = T.radiusXl)
    Column(Modifier.widthIn(max = T.phoneWidth).fillMaxWidth().qShadow("shadow-sheet", T.radiusXl).background(qColor("surface"), shape).padding(start = T.space5, end = T.space5, top = T.space3, bottom = T.welcomeGap).semantics { paneTitle = title }, verticalArrangement = Arrangement.spacedBy(T.space4)) {
        Box(Modifier.align(Alignment.CenterHorizontally).size(T.sheetGrabberWidth, T.sheetGrabberHeight).background(qColor("line"), RoundedCornerShape(T.sheetGrabberRadius)))
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space1)) {
                if (meta != null) BasicText(meta, style = qText("data-sm").copy(color = qColor("ink-muted")))
                BasicText(title, Modifier.semantics { heading() }, style = qText("display-lg").copy(color = qColor("ink")))
            }
            Box(Modifier.offset(x = T.space3, y = -T.space2).size(T.touchTarget).clickable(role = Role.Button, onClick = onClose).semantics { contentDescription = QelvoraCopy.text("close") }, contentAlignment = Alignment.Center) { Glyph("close", T.space4, qColor("ink-muted")) }
        }
        children()
        Column(verticalArrangement = Arrangement.spacedBy(T.space2)) { actions() }
    }
}

@Composable
fun Dialog(title: String, confirm: String = QelvoraCopy.text("confirm"), cancel: String = QelvoraCopy.text("cancel"), destructive: Boolean = false, onConfirm: () -> Unit = {}, onCancel: () -> Unit = {}, children: @Composable () -> Unit) {
    val requester = remember { FocusRequester() }
    androidx.compose.ui.window.Dialog(onDismissRequest = onCancel, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        DisposableEffect(window) {
            val original = window?.attributes?.dimAmount
            window?.setDimAmount(0f)
            onDispose { if (original != null) window.setDimAmount(original) }
        }
        DialogSurface(title, confirm, cancel, destructive, onConfirm, onCancel, Modifier.focusRequester(requester), children)
        // Request after the dialog's own focus target has entered composition.
        LaunchedEffect(title) { requester.requestFocus() }
    }
}


/** The production window and deterministic screenshot host share one visual surface. */
@Composable
internal fun DialogSurface(title: String, confirm: String, cancel: String, destructive: Boolean, onConfirm: () -> Unit = {}, onCancel: () -> Unit = {}, safeActionModifier: Modifier = Modifier, children: @Composable () -> Unit) {
        Box(Modifier.fillMaxSize().background(qColor("overlay-scrim")).semantics { paneTitle = title }, contentAlignment = Alignment.Center) {
            val shape = RoundedCornerShape(T.radiusXl)
            Column(Modifier.widthIn(max = T.dialogWidth).fillMaxWidth().qShadow("shadow-sheet", T.radiusXl).background(qColor("surface"), shape).border(T.hairline, qColor("line"), shape).padding(start = T.dialogPadding, end = T.dialogPadding, top = T.dialogPadding, bottom = T.space3), verticalArrangement = Arrangement.spacedBy(T.space3)) {
                BasicText(title, Modifier.semantics { heading() }, style = qText("title").copy(color = qColor("ink")))
                Column(verticalArrangement = Arrangement.spacedBy(T.space2)) { children() }
                Row(Modifier.fillMaxWidth().padding(top = T.space1), horizontalArrangement = Arrangement.spacedBy(T.space2, Alignment.End)) {
                    Button(cancel, ButtonVariant.QUIET, modifier = safeActionModifier, onClick = onCancel)
                    Box(Modifier.semantics { if (destructive) contentDescription = confirm }) { Button(confirm, ButtonVariant.SECONDARY, onClick = onConfirm) }
                }
            }
        }

}

@Composable
fun Toast(children: String, action: String? = null, onAction: () -> Unit = {}, onDismiss: () -> Unit = {}) {
    val accessibility = LocalAccessibilityManager.current
    LaunchedEffect(children) {
        delay(accessibility?.calculateRecommendedTimeoutMillis(4000, containsIcons = true, containsText = true, containsControls = action != null) ?: 4000)
        onDismiss()
    }
    val shape = RoundedCornerShape(T.radiusMd)
    Row(Modifier.widthIn(max = T.toastWidth).heightIn(min = T.space12).background(qColor("surface"), shape).border(T.hairline, qColor("control-line"), shape).padding(start = T.messagePadding, end = T.authorGap, top = T.authorGap, bottom = T.authorGap).semantics { liveRegion = LiveRegionMode.Polite }, horizontalArrangement = Arrangement.spacedBy(T.composerGap), verticalAlignment = Alignment.CenterVertically) {
        Glyph("check", T.space4, qColor("ink-muted"))
        BasicText(children, Modifier.weight(1f), style = qText("control-body").copy(color = qColor("ink")))
        if (action != null) Box(Modifier.heightIn(min = T.touchTarget).clickable(role = Role.Button, onClick = onAction).padding(horizontal = T.segmentRadius), contentAlignment = Alignment.Center) { BasicText(action, style = qText("caption", true).copy(color = qColor("ink"))) }
    }
}

@Composable
fun Skeleton(kind: String = "message") {
    var shown by remember { mutableStateOf(false) }
    val alpha = remember { Animatable(1f) }
    LaunchedEffect(kind) {
        delay(300)
        shown = true
        if (ValueAnimator.areAnimatorsEnabled()) alpha.animateTo(.5f, infiniteRepeatable(tween(800), RepeatMode.Reverse))
    }
    if (shown) SkeletonShape(kind, alpha.value)
}

/** Shared visible geometry; runtime Skeleton owns the delay and motion. */
@Composable
internal fun SkeletonShape(kind: String = "message", opacity: Float = 1f) {

        val ink = qColor("line")
        val shape = RoundedCornerShape(T.skeletonRadius)
        if (kind == "row") Row(Modifier.fillMaxWidth().padding(vertical = T.space3).alpha(opacity).clearAndSetSemantics { }, horizontalArrangement = Arrangement.spacedBy(T.space3), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(T.avatarSize).background(ink, RoundedCornerShape(T.avatarRadius)))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(T.space2)) {
                Box(Modifier.fillMaxWidth(.4f).height(T.space3).background(ink, shape))
                Box(Modifier.fillMaxWidth(.8f).height(T.space3).background(ink, shape))
            }
        } else Column(Modifier.widthIn(max = T.skeletonWidth).fillMaxWidth().alpha(opacity).clearAndSetSemantics { }, verticalArrangement = Arrangement.spacedBy(T.space2)) {
            Box(Modifier.width(T.skeletonLabelWidth).height(T.space3).background(ink, shape))
            Box(Modifier.fillMaxWidth().height(T.skeletonBubbleHeight).background(ink, RoundedCornerShape(topStart = T.radiusTail, topEnd = T.radiusLg, bottomStart = T.radiusLg, bottomEnd = T.radiusLg)))
        }
}
