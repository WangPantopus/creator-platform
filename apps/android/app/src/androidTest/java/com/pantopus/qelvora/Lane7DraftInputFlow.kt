package com.pantopus.qelvora

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in real-app boundary/Unicode entry through the native text-input action. adb's
 * hardware-key mapper cannot type these characters. The external journey then
 * kills/relaunches the app and checks ciphertext and the API request log. */
@RunWith(AndroidJUnit4::class)
class Lane7DraftInputFlow {
    @get:Rule val compose = createEmptyComposeRule()

    @Test fun enterDraft() {
        val mode = InstrumentationRegistry.getArguments().getString("lane7DraftInput")
        assumeTrue(mode == "unicode" || mode == "boundary")
        val text = if (mode == "boundary") "draft7".repeat(334) else "Draft 🙂 שלום مرحبا"
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java)
            .putExtra("api_url", "http://127.0.0.1:56473")
            .putExtra("return_to", "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001")
            .putExtra("appearance", "light")
        ActivityScenario.launch<MainActivity>(intent).use {
            val input = hasContentDescription("Message Maya's AI") and hasSetTextAction()
            compose.waitUntil(30_000) { compose.onAllNodes(input).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(input).performClick().performTextInput(text)
            compose.onNode(input).assertTextEquals(text.take(2000))
            // Waiting for idle allows the actual input-triggered write to be
            // scheduled; the external flow checks its completed file afterward.
            compose.waitForIdle()
        }
    }
}
