package com.pantopus.qelvora

import com.pantopus.qelvora.generated.APIFrame
import com.pantopus.qelvora.generated.APIFrameControl
import com.pantopus.qelvora.generated.APIIdentityCapabilities
import com.pantopus.qelvora.generated.APISignedChallengePublicKeyUserVerification
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class GeneratedContractTest {
    @Test fun identityCapabilityRejectsIndependentAccounts() {
        val valid = Json.decodeFromString<APIIdentityCapabilities>("""{"signInAvailable":false,"localAccountsAllowed":false}""")
        assertFalse(valid.localAccountsAllowed.value)
        assertThrows(SerializationException::class.java) { Json.decodeFromString<APIIdentityCapabilities>("""{"signInAvailable":true,"localAccountsAllowed":true}""") }
        assertThrows(SerializationException::class.java) { Json.decodeFromString<APISignedChallengePublicKeyUserVerification>("\"preferred\"") }
    }

    @Test fun realtimeControlFrameDecodesNullableGeneration() {
        val frame = Json.decodeFromString<APIFrame>("""{"threadId":"thread","cursor":4,"epoch":2,"kind":"control","messageId":"message","authorKind":"system","text":"Maya is here","generationId":null,"sequence":0,"control":"human_active"}""")
        assertNull(frame.generationId)
        assertEquals(APIFrameControl.HUMAN_ACTIVE, frame.control)
        assertEquals(2L, frame.epoch)
        assertEquals(frame, Json.decodeFromString<APIFrame>(Json.encodeToString(frame)))
    }
}
