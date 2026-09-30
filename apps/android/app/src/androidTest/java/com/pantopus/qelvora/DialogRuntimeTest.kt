package com.pantopus.qelvora

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.pantopus.qelvora.ui.Dialog
import com.pantopus.qelvora.ui.QelvoraTheme
import com.pantopus.qelvora.ui.TextLine
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DialogRuntimeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun dialogActionsFitAndSafeActionReceivesClicks() {
        for (night in listOf(false, true)) {
            var cancelled = false
            var confirmed = false
            compose.activity.runOnUiThread {
                compose.activity.setContent {
                    QelvoraTheme(night) {
                        Dialog("Delete this conversation?", confirm = "Delete", destructive = true, onCancel = { cancelled = true }, onConfirm = { confirmed = true }) {
                            TextLine("This removes the conversation and its memories from your account.", "body")
                        }
                    }
                }
            }
            compose.onNodeWithText("Delete this conversation?").assertIsDisplayed()
            val confirmBounds = compose.onNodeWithText("Delete").fetchSemanticsNode().boundsInRoot
            val cancelBounds = compose.onNodeWithText("Cancel").fetchSemanticsNode().boundsInRoot
            val screenWidth = compose.activity.resources.displayMetrics.widthPixels
            assertTrue("Confirm action must fit within the screen", confirmBounds.right <= screenWidth)
            assertTrue("Cancel action must fit within the screen", cancelBounds.left >= 0)
            compose.onNodeWithText("Cancel").performClick()
            compose.runOnIdle { assertTrue(cancelled); assertFalse(confirmed) }
        }
    }
}
