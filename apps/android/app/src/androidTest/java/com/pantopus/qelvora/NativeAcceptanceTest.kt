package com.pantopus.qelvora

import androidx.activity.compose.setContent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.pantopus.qelvora.ui.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/** Runtime checks on an Android emulator. Pixel equivalence is reviewed separately. */
@RunWith(AndroidJUnit4::class)
class NativeAcceptanceTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun unavailableSignInNeverPretendsToAuthenticate() {
        compose.onNodeWithText("Her AI answers you now. She answers in person when you ask.").assertIsDisplayed()
        compose.onNodeWithText("Continue with Pantopus").performClick()
        compose.onNodeWithText("Pantopus sign-in is not connected in this local build.").assertIsDisplayed()
    }

    @Test fun arrivalContextCanBeRemoved() {
        compose.onNodeWithContentDescription("Remove this post from your first message").performClick()
        compose.onNodeWithText("Maya · Ceramics · Kiln Club").assertDoesNotExist()
    }

    @Test fun catalogSelectsRealInteractiveModeList() {
        compose.activity.runOnUiThread { compose.activity.setContent { QelvoraTheme(false) { NativeFoundationCatalog() } } }
        compose.onNodeWithText("Component · Mark").performClick()
        compose.onNodeWithText("ModeList").performScrollTo().performClick()
        compose.onNodeWithText("Written reply").assertIsDisplayed()
        compose.onNodeWithText("Voice note").performClick()
        compose.onNode(hasText("Voice note") and isSelectable()).assertIsSelected()
        compose.onNode(hasText("Ten-minute call") and isSelectable()).assertIsNotEnabled()
    }
}
