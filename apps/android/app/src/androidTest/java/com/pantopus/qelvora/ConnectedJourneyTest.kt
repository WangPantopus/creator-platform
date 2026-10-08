package com.pantopus.qelvora

import android.content.Intent
import android.graphics.Bitmap
import android.os.SystemClock
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import android.view.KeyEvent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assume.assumeTrue
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in journey through the real app, sign-in and preserved backend. No fixtures. */
@RunWith(AndroidJUnit4::class)
class ConnectedJourneyTest {
    @get:Rule val compose = createEmptyComposeRule()

    /** Actual UI reuse of a question explicitly included earlier in this
     * preserved journey. No consent, sample, provider or account is seeded. */
    @Test fun comparisonChoiceAndQuestion() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("journeyApiUrl")
        val destination = args.getString("journeyThread")
        val sourceId = args.getString("journeyComparisonMessageId")
        assumeTrue(origin != null && destination != null && sourceId != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java).putExtra("api_url", origin)
            .putExtra("return_to", destination).putExtra("appearance", args.getString("journeyAppearance") ?: "light")
        ActivityScenario.launch<MainActivity>(intent).use {
            try {
                compose.waitUntil(30_000) { compose.onAllNodesWithText("AI comparison options").fetchSemanticsNodes().isNotEmpty() }
                val target = hasTestTag("comparison-options-$sourceId")
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(target)
                compose.onNode(target).assertIsDisplayed().performClick()
                compose.waitUntil(20_000) { compose.onAllNodesWithText("Allowed for this creator").fetchSemanticsNodes().isNotEmpty() }
                compose.onNode(hasScrollToNodeAction() and hasAnyDescendant(hasText("Your question")))
                    .performScrollToNode(hasText("Include this question"))
                capture("comparison-choice")
                clickReady("Include this question")
                val result = "A general version of this question is saved for AI comparisons. You can withdraw your choice in Me and privacy."
                compose.waitUntil(70_000) { compose.onAllNodesWithText(result).fetchSemanticsNodes().isNotEmpty() }
                compose.onNodeWithText(result).performScrollTo().assertIsDisplayed()
                capture("comparison-question-included")
                clickReady("Close")
                compose.waitUntil(30_000) { compose.onAllNodesWithText("Me and privacy").fetchSemanticsNodes().isNotEmpty() }
                clickReady("Me and privacy")
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("AI comparisons"))
                compose.waitUntil(20_000) { compose.onAllNodesWithText("Allowed for this creator").fetchSemanticsNodes().isNotEmpty() }
                capture("comparison-privacy-choice")
            } finally { capture("comparison-final-state") }
        }
    }

    /** Explicit opt-in: this makes one real provider-backed send in the selected
     * development conversation. It never retries by creating another message. */
    @Test fun sendMessageWithKeyboard() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("journeyApiUrl")
        val destination = args.getString("journeyThread")
        val creator = args.getString("journeyCreator")
        val prompt = args.getString("journeyPrompt")
        val expected = args.getString("journeyReplyContains")
        assumeTrue("Requires an explicitly authorized live development send.",
            origin != null && destination != null && creator != null && prompt != null && expected != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java).putExtra("api_url", origin)
            .putExtra("return_to", destination).putExtra("appearance", args.getString("journeyAppearance") ?: "light")
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            try {
                val composer = hasContentDescription("Message $creator's AI") and hasSetTextAction()
                compose.waitUntil(30_000) { compose.onAllNodes(composer).fetchSemanticsNodes().isNotEmpty() }
                compose.onNode(composer).performClick().performTextInput(prompt!!)
                compose.waitUntil(10_000) {
                    var shown = false
                    scenario.onActivity { shown = it.window.decorView.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime()) == true }
                    shown
                }
                capture("send-keyboard-ready")
                clickReady("Send")
                val started = SystemClock.elapsedRealtime()
                capture("send-keyboard-pending")
                compose.waitUntil(90_000) {
                    compose.onAllNodes(composer).fetchSemanticsNodes().singleOrNull()
                        ?.config?.getOrNull(SemanticsProperties.EditableText)?.text == ""
                }
                val accepted = SystemClock.elapsedRealtime() - started
                // A nonempty unsent draft makes Send's actual availability
                // observable; it remains disabled while generation is active.
                compose.onNode(composer).performTextInput("Unsent verification draft")
                compose.waitUntil(90_000) {
                    compose.onAllNodes(hasText("Send") and isEnabled()).fetchSemanticsNodes().isNotEmpty()
                }
                val completed = SystemClock.elapsedRealtime() - started
                compose.onNode(composer).assertTextContains("Unsent verification draft")
                // A delivered reply alone does not prove account refresh has
                // recovered. Require the actual shell's denial banner to clear.
                compose.waitUntil(30_000) { compose.onAllNodesWithText("Account status").fetchSemanticsNodes().isEmpty() }
                compose.onNode(composer).performTextClearance()
                compose.waitUntil(10_000) {
                    var shown = false
                    scenario.onActivity { shown = it.window.decorView.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime()) == true }
                    shown
                }
                val reply = hasText(expected!!, substring = true, ignoreCase = true)
                compose.onAllNodes(reply).onLast().assertIsDisplayed()
                compose.onNodeWithText("Ask $creator to step in").assertIsDisplayed()
                capture("send-keyboard-completed")
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
                awaitKeyboardHidden(scenario)
                compose.onAllNodes(reply).onLast().assertIsDisplayed()
                compose.onNodeWithText("Ask $creator to step in").assertIsDisplayed()
                capture("send-visible-reply")
                val root = File(context.getExternalFilesDir(null), "connected-journey-evidence")
                File(root, "${System.currentTimeMillis()}-send-timing.json").writeText(
                    "{\"draftClearedAfterMs\":$accepted,\"sendAvailableAfterMs\":$completed,\"scope\":\"UI observations; not HTTP timing or percentile qualification\"}\n")
            } finally { capture("send-final-state") }
        }
    }

    /** Read-only keyboard/layout check against the actual retained reply. */
    @Test fun keyboardKeepsLatestReply() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("journeyApiUrl")
        val destination = args.getString("journeyThread")
        val creator = args.getString("journeyCreator")
        val expected = args.getString("journeyLatestText")
        assumeTrue(origin != null && destination != null && creator != null && expected != null)
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java).putExtra("api_url", origin)
            .putExtra("return_to", destination).putExtra("appearance", args.getString("journeyAppearance") ?: "light")
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            try {
                val composer = hasContentDescription("Message $creator's AI") and hasSetTextAction()
                compose.waitUntil(30_000) { compose.onAllNodes(composer).fetchSemanticsNodes().isNotEmpty() }
                compose.onNode(composer).performClick().performTextInput("Unsent keyboard check")
                compose.waitUntil(10_000) {
                    var shown = false
                    scenario.onActivity { shown = it.window.decorView.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime()) == true }
                    shown
                }
                compose.onAllNodesWithText(expected!!).onLast().assertIsDisplayed()
                compose.onNodeWithText("Ask $creator to step in").assertIsDisplayed()
                capture("read-keyboard-visible")
                compose.onNode(composer).performTextClearance()
                InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
                awaitKeyboardHidden(scenario)
                compose.onAllNodesWithText(expected).onLast().assertIsDisplayed()
                compose.onNodeWithText("Ask $creator to step in").assertIsDisplayed()
                capture("read-keyboard-hidden-reply")
            } finally { capture("read-keyboard-final-state") }
        }
    }

    private fun awaitKeyboardHidden(scenario: ActivityScenario<MainActivity>) {
        // Insets change at the start of the OS hide animation. Require the
        // hidden state to settle before asserting the resized conversation.
        var hiddenSince: Long? = null
        compose.waitUntil(10_000) {
            var shown = true
            scenario.onActivity { shown = it.window.decorView.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime()) == true }
            if (shown) hiddenSince = null else if (hiddenSince == null) hiddenSince = SystemClock.elapsedRealtime()
            hiddenSince?.let { SystemClock.elapsedRealtime() - it >= 600 } == true
        }
        compose.waitForIdle()
    }

    @Test fun publishedConversationAndCurrentConsent() {
        val args = InstrumentationRegistry.getArguments()
        val origin = args.getString("journeyApiUrl")
        val destination = args.getString("journeyThread")
        val actor = args.getString("journeyActor")
        val creator = args.getString("journeyCreator")
        assumeTrue("Requires an explicitly selected running development journey.",
            origin != null && destination != null && actor != null && creator != null)
        val resume = args.getString("journeyPhase") == "resume"
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java)
            .putExtra("api_url", origin).putExtra("appearance", args.getString("journeyAppearance") ?: "light")
        if (!resume) intent.putExtra("return_to", destination)
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            try {
                val composer = hasContentDescription("Message $creator's AI") and hasSetTextAction()
                if (!resume) {
                    compose.waitUntil(30_000) {
                        compose.onAllNodes(composer).fetchSemanticsNodes().isNotEmpty() ||
                            compose.onAllNodesWithText("Continue with Pantopus").fetchSemanticsNodes().isNotEmpty()
                    }
                    if (compose.onAllNodesWithText("Continue with Pantopus").fetchSemanticsNodes().isNotEmpty()) {
                        clickReady("Continue with Pantopus")
                        awaitText(actor!!)
                        compose.onNodeWithText(actor).performClick()
                    }
                }
                compose.waitUntil(30_000) { compose.onAllNodes(composer).fetchSemanticsNodes().isNotEmpty() }
                compose.onNode(composer).assertIsDisplayed()
                compose.onNodeWithText("Ask $creator to step in").assertIsDisplayed()
                compose.onNodeWithText("Send").assertIsNotEnabled()
                args.getString("journeyLatestText")?.let { text ->
                    awaitText(text)
                    compose.onNodeWithText(text).assertIsDisplayed()
                    assertTrue("The latest reply must remain above the composer",
                        compose.onNodeWithText(text).fetchSemanticsNode().boundsInRoot.bottom <=
                            compose.onNode(composer).fetchSemanticsNode().boundsInRoot.top)
                }
                capture("$resume-published-conversation")

                val citation = hasText("Read the original passage", substring = true)
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(citation)
                // Read older history through the real periodic refresh.
                val readingPosition = compose.onAllNodes(citation)[0].fetchSemanticsNode().boundsInRoot.top
                // Keep Compose's clock and the app's effects advancing while
                // spanning real time; blocking the test thread freezes them.
                val readingStarted = SystemClock.elapsedRealtime()
                compose.waitUntil(20_000) { SystemClock.elapsedRealtime() - readingStarted >= 16_000 }
                compose.onAllNodes(citation)[0].assertIsDisplayed()
                assertTrue("Refresh must keep the reader's position",
                    kotlin.math.abs(compose.onAllNodes(citation)[0].fetchSemanticsNode().boundsInRoot.top - readingPosition) <= 2)
                capture("$resume-history-position-after-refresh")
                compose.onAllNodes(citation)[0].performClick()
                awaitText("Original source")
                capture("$resume-original-source")
                compose.onNodeWithText("Close").performClick()

                scenario.recreate()
                compose.waitUntil(30_000) { compose.onAllNodes(composer).fetchSemanticsNodes().isNotEmpty() }
                compose.onNodeWithText("Me and privacy").performClick()
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("AI providers"))
                awaitText("Withdraw AI provider consent")
                val withdraw = hasText("Withdraw AI provider consent")
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(withdraw)
                compose.onNode(withdraw).assertIsDisplayed()
                capture("$resume-current-provider-consent")
                compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("Back"))
                compose.onNodeWithText("Back").performClick()
            } finally { capture("$resume-final-state") }
        }
        // Optional genuine account boundary operation. These are ordinary app
        // sign-outs/sign-ins; the harness never supplies or edits a credential.
        args.getString("journeyOtherActor")?.let { otherActor ->
            fun launch(target: String? = null): ActivityScenario<MainActivity> {
                val next = Intent(context, MainActivity::class.java).putExtra("api_url", origin)
                    .putExtra("appearance", args.getString("journeyAppearance") ?: "light")
                if (target != null) next.putExtra("return_to", target)
                return ActivityScenario.launch(next)
            }
            launch("/home").use {
                awaitText("Your people")
                compose.onNodeWithContentDescription("Message $creator's AI").assertDoesNotExist()
                capture("explicit-home-overrides-saved-thread")
            }
            launch("/identity/account").use {
                awaitText("Your account")
                compose.onNodeWithText("Sign out", substring = false).performClick()
                awaitText("Continue with Pantopus")
                clickReady("Continue with Pantopus")
                awaitText(otherActor)
                compose.onNodeWithText(otherActor).performClick()
                awaitText("Your account")
                args.getString("journeyOtherAccountLabel")?.let { awaitText(it) }
                capture("replacement-account")
            }
            launch().use {
                awaitText("Your account")
                args.getString("journeyOtherAccountLabel")?.let { awaitText(it) }
                compose.onNodeWithContentDescription("Message $creator's AI").assertDoesNotExist()
                capture("replacement-account-cold-route")
                compose.onNodeWithText("Sign out", substring = false).performClick()
                awaitText("Continue with Pantopus")
                clickReady("Continue with Pantopus")
                awaitText(actor!!)
                compose.onNodeWithText(actor).performClick()
                awaitText("Your account")
            }
            launch(destination).use {
                compose.waitUntil(30_000) { compose.onAllNodesWithContentDescription("Message $creator's AI").fetchSemanticsNodes().isNotEmpty() }
                capture("original-fan-restored-through-sign-in")
            }
        }
    }

    private fun awaitText(text: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun clickReady(text: String) {
        val ready = hasText(text) and hasClickAction() and isEnabled()
        compose.waitUntil(30_000) { compose.onAllNodes(ready).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(ready).performClick()
    }

    private fun capture(name: String) {
        compose.waitForIdle()
        // A newly composed dialog can precede the OS compositor's frame.
        // Advance the running app before capturing the whole display.
        val drawnAfter = SystemClock.elapsedRealtime() + 250
        compose.waitUntil(2_000) { SystemClock.elapsedRealtime() >= drawnAfter }
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val root = File(instrumentation.targetContext.getExternalFilesDir(null), "connected-journey-evidence")
        root.mkdirs()
        val stamp = System.currentTimeMillis()
        instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
            File(root, "$stamp-$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
        File(root, "$stamp-$name-accessibility.txt").writeText(
            compose.onAllNodes(isRoot(), useUnmergedTree = true).fetchSemanticsNodes().indices.joinToString("\n") {
                compose.onAllNodes(isRoot(), useUnmergedTree = true)[it].printToString()
            })
    }
}
