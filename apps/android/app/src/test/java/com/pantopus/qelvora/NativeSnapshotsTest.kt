package com.pantopus.qelvora

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.resources.Density
import com.pantopus.qelvora.ui.*
import org.junit.Rule
import org.junit.Test
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import com.pantopus.qelvora.generated.QelvoraTokens as T

class NativeSnapshotsTest {
    @get:Rule val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5.copy(screenWidth = 390, screenHeight = 844, xdpi = 160, ydpi = 160, density = Density.MEDIUM), showSystemUi = false)
    @Test fun welcomeLight() { paparazzi.snapshot { QelvoraTheme(false) { Welcome() } } }
    @Test fun welcomeNight() { paparazzi.snapshot { QelvoraTheme(true) { Welcome() } } }
    @Test fun catalogLight() { paparazzi.snapshot { QelvoraTheme(false) { NativeFoundationCatalog() } } }
    @Test fun catalogNight() { paparazzi.snapshot { QelvoraTheme(true) { NativeFoundationCatalog() } } }
    @Test fun componentsLight() { components(false) }
    @Test fun componentsNight() { components(true) }
    @Test fun threadStatesLight() { threadStates(false) }
    @Test fun threadStatesNight() { threadStates(true) }

    private fun components(night: Boolean) {
        NativeComponentRegistry.implemented.forEach { component ->
            if (component == "Skeleton") {
                paparazzi.snapshot(name = component) {
                    QelvoraTheme(night) {
                        Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4), verticalArrangement = Arrangement.spacedBy(T.space4)) {
                            TextLine("Skeleton", "display-md")
                            SkeletonShape()
                            SkeletonShape("row")
                        }
                    }
                }
            } else if (component == "Dialog") {
                // Paparazzi does not lay out a separate Android window reliably.
                // The shared surface is captured directly; instrumentation tests the real window.
                paparazzi.snapshot(name = component) {
                    QelvoraTheme(night) {
                        Box(Modifier.fillMaxSize().background(qColor("ground"))) {
                            DialogSurface("Delete this conversation?", "Delete", "Cancel", true) {
                                TextLine("This removes the conversation and its memories from your account.", "body")
                            }
                        }
                    }
                }
            } else paparazzi.snapshot(name = component) { QelvoraTheme(night) { NativeFoundationCatalog(component) } }
        }
    }

    private fun threadStates(night: Boolean) {
        Delivery.entries.forEach { delivery ->
            paparazzi.snapshot(name = "delivery_${delivery.name}") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4)) { Message(if (delivery in listOf(Delivery.PENDING, Delivery.FAILED)) MessageKind.FAN else MessageKind.AI, "Let the first coat dry before adding another.", delivery = delivery) } } }
        }
        DraftTreatment.entries.forEach { treatment ->
            paparazzi.snapshot(name = "draft_${treatment.name}") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4)) { Message(MessageKind.APPROVED_DRAFT, "Thin the glaze to 1.45 specific gravity.", time = "OCT 4", treatment = treatment) } } }
        }
        ComposerState.entries.forEach { state ->
            paparazzi.snapshot(name = "composer_${state.name}") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState())) { Composer(state) } } }
        }
        paparazzi.snapshot(name = "note_no_reply") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4)) { Note("The studio is closed next week while I teach in Portland.", reply = false) } } }
        paparazzi.snapshot(name = "note_retracted") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4)) { Note("", retracted = true) } } }
        paparazzi.snapshot(name = "sponsor") { QelvoraTheme(night) { Column(Modifier.fillMaxSize().background(qColor("ground")).padding(T.space4)) { Message(children = "Maya starts with Glazeco's satin base.", sponsor = "Glazeco") } } }
    }
}
