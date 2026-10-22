package com.pantopus.qelvora.identity

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.pantopus.qelvora.BuildConfig
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

internal enum class NativeIdentityProvider(val value: String, val title: String) {
    GOOGLE("google", "signInWithGoogle");
    val isConfigured: Boolean get() = BuildConfig.CREATOR_GOOGLE_SERVER_CLIENT_ID.isNotBlank()
}
internal data class NativeIdentityCredential(val idToken: String, val authorizationCode: String? = null)
internal class NativeIdentityUnavailable : Exception()
internal fun identityDeadline(value: String): Instant? = runCatching { Instant.parse(value) }.getOrNull()

/** Explicit Google button: no auto-selection, no token or email kept by this adapter. */
internal suspend fun googleIdentityCredential(activity: Activity, nonce: String): NativeIdentityCredential {
    val clientId = BuildConfig.CREATOR_GOOGLE_SERVER_CLIENT_ID
    if (clientId.isBlank()) throw NativeIdentityUnavailable()
    val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(nonce).build()
    val result = CredentialManager.create(activity).getCredential(activity, GetCredentialRequest(listOf(option)))
    val credential = result.credential as? CustomCredential ?: throw NativeIdentityUnavailable()
    if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) throw NativeIdentityUnavailable()
    return NativeIdentityCredential(GoogleIdTokenCredential.createFrom(credential.data).idToken)
}

/** No rememberSaveable for dates, continuations or provider tokens.
 * The shell owns [scope]: successful account cleanup removes this pane before
 * the secure credential save finishes, so a pane-owned job would be cancelled.
 */
@Composable
internal fun NativeSignInPane(model: FanSession, scope: CoroutineScope) {
    val activity = LocalContext.current as? Activity
    var birthDate by remember(model.ageConfirmation?.ageContinuationId) { mutableStateOf("") }
    var showPolicy by remember { mutableStateOf(false) }
    val age = model.ageConfirmation
    LaunchedEffect(age?.ageContinuationId) {
        if (age != null) {
            val deadline = identityDeadline(age.expiresAt)
            if (deadline != null) delay((deadline.toEpochMilli() - System.currentTimeMillis()).coerceAtLeast(0))
            model.expireSignInAge(age.ageContinuationId)
        }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        if (model.adultEligibilityDenied) {
            BasicText(QelvoraCopy.text("adultOnlyTitle"), style = qText("display-md").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
            TextLine(QelvoraCopy.text("adultOnlyBody"))
            Button(QelvoraCopy.text("underageLink"), ButtonVariant.QUIET) { showPolicy = !showPolicy }
            if (showPolicy) {
                TextLine(QelvoraCopy.text("underagePolicyOpening"))
                TextLine(QelvoraCopy.text("underagePolicyNotKept"))
                TextLine(QelvoraCopy.text("underagePolicyKept"))
            }
        } else if (age != null) {
            BasicText(QelvoraCopy.text("signInAgeTitle"), style = qText("display-md").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
            TextLine(QelvoraCopy.text("signInAgeNote"))
            val dateLabel = QelvoraCopy.text("signInAgeTitle")
            BasicTextField(birthDate, onValueChange = { birthDate = it.take(10) }, enabled = !model.busy,
                singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                textStyle = qText("body").copy(color = qColor("ink")),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("sign-in-birth-date").semantics { contentDescription = dateLabel },
                decorationBox = { inner -> Box(Modifier.padding(12.dp)) { if (birthDate.isEmpty()) TextLine("YYYY-MM-DD"); inner() } })
            Button(QelvoraCopy.text("signInAgeContinue"), ButtonVariant.SECONDARY, block = true, disabled = model.busy || birthDate.isEmpty()) {
                val date = birthDate
                scope.launch { model.confirmSignInAge(date) }
            }
            Button(QelvoraCopy.text("cancel"), ButtonVariant.QUIET, disabled = model.busy) { birthDate = ""; model.cancelSignIn() }
        } else {
            BasicText(QelvoraCopy.text("growthSignInToContinue"), style = qText("display-md").copy(color = qColor("ink")), modifier = Modifier.semantics { heading() })
            model.signInProviders.forEach { provider ->
                Button(QelvoraCopy.text(provider.title), ButtonVariant.SECONDARY, block = true, disabled = model.busy || activity == null) {
                    scope.launch { model.signIn(provider) { nonce -> googleIdentityCredential(activity ?: throw NativeIdentityUnavailable(), nonce) } }
                }
            }
            if (BuildConfig.DEBUG && model.actors.isNotEmpty()) {
                Button("Use a development account", ButtonVariant.QUIET, disabled = model.busy) { model.cancelSignIn(); model.choosingActor = true }
            }
            Button(QelvoraCopy.text("cancel"), ButtonVariant.QUIET, disabled = model.busy) { model.cancelSignIn() }
        }
    }
}
