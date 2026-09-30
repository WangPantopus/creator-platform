package com.pantopus.qelvora.identity

import android.app.Activity
import android.os.Build
import androidx.credentials.CredentialManager
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

class UnsupportedSigningDevice : Exception("Signing requires Android 9 or newer and a configured passkey provider. No weaker signature is substituted.")
/** Activity-scoped system UI. Digital Asset Links and signing-certificate origin remain release gates. */
class PasskeyCeremony(private val activity: Activity) {
    private fun requireSupported() { if (Build.VERSION.SDK_INT < 28) throw UnsupportedSigningDevice() }
    suspend fun register(options: JsonElement): JsonElement {
        requireSupported()
        val response = CredentialManager.create(activity).createCredential(activity, CreatePublicKeyCredentialRequest(options.toString())) as? CreatePublicKeyCredentialResponse ?: throw UnsupportedSigningDevice()
        return Json.parseToJsonElement(response.registrationResponseJson)
    }
    suspend fun assert(options: JsonElement): JsonElement {
        requireSupported()
        val response = CredentialManager.create(activity).getCredential(activity, GetCredentialRequest(listOf(GetPublicKeyCredentialOption(options.toString()))))
        val credential = response.credential as? PublicKeyCredential ?: throw UnsupportedSigningDevice()
        return Json.parseToJsonElement(credential.authenticationResponseJson)
    }
}
