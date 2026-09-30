"use client";
import { useRef, useState } from "react";
import type { MediaAsset } from "../../../../packages/api/src/media";
import type { SignedActCommand } from "@qelvora/api";
import { mediaRequest } from "./api";
import { assertPasskey } from "../identity/passkey";

export function SignRecording({
  asset,
  creatorId,
  fanId,
  onSigned,
}: {
  asset: MediaAsset;
  creatorId: string;
  fanId: string;
  onSigned: (value: MediaAsset) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const publication = useRef<Record<string, unknown> | null>(null);
  async function platform<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/platform/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failed = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(failed?.error?.message ?? "Signing is unavailable.");
    }
    return response.json() as Promise<T>;
  }
  async function publish() {
    if (!publication.current) return;
    setBusy(true);
    try {
      const result = await mediaRequest<{ asset: MediaAsset }>(
        `threads/${creatorId}/${fanId}/media/${asset.id}/sign`,
        { method: "POST", body: JSON.stringify(publication.current) },
      );
      setUnknown(false);
      setError(null);
      onSigned(result.asset);
    } catch {
      setUnknown(true);
      setError(
        "Signature submission is unconfirmed. Retry this exact act or refresh the recording before signing again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (busy || unknown) return;
    setBusy(true);
    setError(null);
    let challengeId: string | undefined;
    try {
      const command = await mediaRequest<SignedActCommand>(
        `threads/${creatorId}/${fanId}/media/${asset.id}/signing-command`,
      );
      const challenge = await platform<{
        challengeId: string;
        publicKey: Parameters<typeof assertPasskey>[0];
      }>(`identity/${creatorId}/signed-acts/begin`, { fanId, command });
      challengeId = challenge.challengeId;
      const assertion = await assertPasskey(challenge.publicKey);
      const verified = await platform<{ signedActId: string }>(
        "identity/signed-acts/verify",
        { challengeId, assertion },
      );
      publication.current = {
        version: asset.version,
        signedActId: verified.signedActId,
        idempotencyKey: crypto.randomUUID(),
      };
      await publish();
    } catch (e) {
      if (challengeId)
        await platform(`identity/signed-acts/${challengeId}/cancel`, {}).catch(
          () => undefined,
        );
      setError(
        e instanceof Error
          ? e.message
          : "Signing was cancelled. Nothing was shared.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w6-card">
      <strong>Sign this exact recording</strong>
      <p>
        {Math.round((asset.durationMs ?? 0) / 1000)} seconds · M4A · version
        {asset.version}
      </p>
      <details>
        <summary>Recording fingerprint</summary>
        <code style={{ overflowWrap: "anywhere" }}>{asset.sha256}</code>
      </details>
      <p className="qv-help">
        Review the processed recording before signing. A signature applies to
        these exact audio bytes. Adding content credentials is a separate
        processing step.
      </p>
      <button
        className="qv-btn qv-btn--maya"
        disabled={
          busy || unknown || !!asset.signedActId || asset.state !== "ready"
        }
        onClick={() => {
          void sign();
        }}
      >
        {asset.signedActId
          ? "Signature saved"
          : busy
            ? "Waiting for your passkey"
            : "Sign recording"}
      </button>
      {error && <p role="status">{error}</p>}
      {unknown && (
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy}
          onClick={() => {
            void publish();
          }}
        >
          Retry this exact signature
        </button>
      )}
    </section>
  );
}
