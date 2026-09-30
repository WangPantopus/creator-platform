package com.pantopus.qelvora.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.platform.LocalDensity
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.generated.QelvoraTokens
import kotlinx.coroutines.launch
import java.util.UUID

data class PantopusIdentity(val accountId: UUID)
interface PantopusSignInProvider { suspend fun signIn(returnTo: String): PantopusIdentity }
class PantopusUnavailable : IllegalStateException("Pantopus sign-in is not connected")
object UnavailablePantopusSignIn : PantopusSignInProvider { override suspend fun signIn(returnTo: String): PantopusIdentity = throw PantopusUnavailable() }

@Composable
fun Welcome(returnTo: String = "/creators/maya", signIn: PantopusSignInProvider = UnavailablePantopusSignIn, showContext: Boolean = true, contextSource: String? = null, contextTitle: String? = null, bodyCopy: String? = null, onRemoveContext: (() -> Unit)? = null, onContinue: (() -> Unit)? = null, onAuthenticated: (PantopusIdentity, String) -> Unit = { _, _ -> }) {
    var hasContext by remember(showContext, contextTitle) { mutableStateOf(showContext) }
    var connecting by remember { mutableStateOf(false) }
    var unavailable by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ai = qColor("ai-ink"); val plate = qColor("maya-surface"); val accent = qColor("maya-accent")
    val largeText = LocalDensity.current.fontScale > 1.3f
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxSize().background(qColor("ground")).then(if (largeText) Modifier.verticalScroll(scroll) else Modifier).padding(start = QelvoraTokens.space6, end = QelvoraTokens.space6, top = QelvoraTokens.welcomeTop, bottom = QelvoraTokens.welcomeBottom)) {
        BasicText(QelvoraCopy.brandName, style = wordmarkStyle().copy(color = qColor("ink")))
        Column((if (largeText) Modifier.padding(vertical = QelvoraTokens.space6) else Modifier.weight(1f)).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(QelvoraTokens.welcomeGap, Alignment.CenterVertically)) {
            Canvas(Modifier.size(QelvoraTokens.welcomeMarkWidth, QelvoraTokens.welcomeMarkHeight)) {
                val s = this.size.height / 56f
                drawCircle(ai,22f*s, Offset(28f*s,28f*s),style = Stroke(2f*s)); drawCircle(ai,5f*s,Offset(28f*s,28f*s)); drawCircle(plate,26f*s,Offset(80f*s,28f*s)); drawCircle(accent,12f*s,Offset(80f*s,28f*s))
            }
            BasicText(QelvoraCopy.text("welcomeTitle"), style = welcomeTitleStyle().copy(color = qColor("ink")))
            BasicText(bodyCopy ?: QelvoraCopy.text("welcomeBody"), style = qText("body").copy(color = qColor("ink-muted")))
        }
        Column(verticalArrangement = Arrangement.spacedBy(QelvoraTokens.messagePadding)) {
            if (hasContext) ContextCard(contextSource ?: QelvoraCopy.text("welcomeSource"), contextTitle ?: QelvoraCopy.text("welcomeContext")) { hasContext = false; onRemoveContext?.invoke() }
            Button(QelvoraCopy.text("continueWithPantopus"), ButtonVariant.SECONDARY, "lg", block = true, disabled = connecting) {
                if (onContinue != null) { onContinue(); return@Button }
                if (!connecting) scope.launch {
                    connecting = true; unavailable = false
                    try { onAuthenticated(signIn.signIn(returnTo), returnTo) } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { unavailable = true } finally { connecting = false }
                }
            }
            BasicText(QelvoraCopy.text("pantopusAccount"), style = qText("caption").copy(color = qColor("ink-muted"), textAlign = TextAlign.Center))
            if (unavailable) BasicText(QelvoraCopy.text("pantopusUnavailable"), style = qText("caption").copy(color = qColor("alert")))
        }
    }
}

@Preview(name = "4A Welcome Light", widthDp = 390, heightDp = 844)
@Composable
private fun WelcomeLight() { QelvoraTheme(night = false) { Welcome() } }
@Preview(name = "4A Welcome Night", widthDp = 390, heightDp = 844)
@Composable
private fun WelcomeNight() { QelvoraTheme(night = true) { Welcome() } }
