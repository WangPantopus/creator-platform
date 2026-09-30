"use client";
const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const encode = (value: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
export function passkeysAvailable() {
  return (
    window.isSecureContext &&
    !!window.PublicKeyCredential &&
    !!navigator.credentials
  );
}
export type RegistrationOptions = Omit<
  PublicKeyCredentialCreationOptions,
  "challenge" | "user" | "excludeCredentials"
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, "id"> & { id: string };
  excludeCredentials?: (Omit<PublicKeyCredentialDescriptor, "id"> & {
    id: string;
  })[];
};
export async function registerPasskey(
  options: RegistrationOptions,
  signal?: AbortSignal,
) {
  if (!passkeysAvailable())
    throw new Error(
      "Passkeys are unavailable on this device. Use a supported browser and device; no weaker signature is substituted.",
    );
  const publicKey = {
    ...options,
    challenge: decode(options.challenge),
    user: { ...options.user, id: decode(options.user.id) },
    excludeCredentials: options.excludeCredentials?.map((item) => ({
      ...item,
      id: decode(item.id),
    })),
  } as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({
    publicKey,
    ...(signal ? { signal } : {}),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled.");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: encode(response.clientDataJSON),
      attestationObject: encode(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}
export async function assertPasskey(
  options: {
    challenge: string;
    rpId: string;
    timeout: number;
    userVerification: "required";
    allowCredentials: { id: string; type: "public-key" }[];
  },
  signal?: AbortSignal,
) {
  if (!passkeysAvailable())
    throw new Error(
      "Signing requires a supported passkey device. No weaker signature is substituted.",
    );
  const credential = (await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: decode(options.challenge),
      allowCredentials: options.allowCredentials.map((item) => ({
        ...item,
        id: decode(item.id),
      })),
    },
    ...(signal ? { signal } : {}),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Signing was cancelled. Nothing was sent.");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: encode(response.clientDataJSON),
      authenticatorData: encode(response.authenticatorData),
      signature: encode(response.signature),
      ...(response.userHandle
        ? { userHandle: encode(response.userHandle) }
        : {}),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    ...(credential.authenticatorAttachment
      ? { authenticatorAttachment: credential.authenticatorAttachment }
      : {}),
  };
}
