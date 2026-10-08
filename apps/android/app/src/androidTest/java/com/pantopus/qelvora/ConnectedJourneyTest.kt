package com.pantopus.qelvora

import android.content.Intent
import android.graphics.Bitmap
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
                Thread.sleep(16_000)
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
