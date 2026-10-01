"use client";
import { copy, formatCopy } from "@qelvora/copy";
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
      throw new Error(failed?.error?.message ?? copy.w6SigningIsUnavailable);
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
        copy.w6SignatureSubmissionIsUnconfirmedRetryThisExactActOrRefresh,
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
          : copy.w6SigningWasCancelledNothingWasShared,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w6-card">
      <strong>{copy.w6SignThisExactRecording}</strong>
      <p>
        {formatCopy("w6SecondsM4AVersion", {
          value1: Math.round((asset.durationMs ?? 0) / 1000),
          value2: asset.version,
        })}
      </p>
      <details>
        <summary>{copy.w6RecordingFingerprint}</summary>
        <code style={{ overflowWrap: "anywhere" }}>{asset.sha256}</code>
      </details>
      <p className="qv-help">
        {copy.w6ReviewTheProcessedRecordingBeforeSigningASignatureAppliesTo}
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
          ? copy.w6SignatureSaved
          : busy
            ? copy.w6WaitingForYourPasskey
            : copy.w6SignRecording}
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
          {copy.w6RetryThisExactSignature}
        </button>
      )}
    </section>
  );
}
