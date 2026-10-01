"use client";
import { useEffect, useRef, useState } from "react";
import {
  BeginSignedActSchema,
  SignedChallengeSchema,
  SignedActResultSchema,
  type SignedActCommand,
} from "@qelvora/api";
import { Message, Notice, SigningSheet } from "@qelvora/ui-web";
import { assertPasskey, passkeysAvailable } from "./passkey";

async function post(path: string, body: unknown) {
  const response = await fetch(`/api/platform/identity/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error?.message ?? "Signing is unavailable. Nothing was sent.",
    );
  return value;
}
/** The domain supplies its canonical command and exact review projection. Publication
 * must consume the returned signature in that domain's transaction. */
export function SignedActReview({
  creatorId,
  fanId,
  command,
  creatorName,
  text,
  approvedDraft = false,
  title,
  rows,
  onSigned,
}: {
  creatorId: string;
  fanId?: string;
  command: SignedActCommand;
  creatorName: string;
  text: string;
  approvedDraft?: boolean;
  title: string;
  rows: [string, string][];
  onSigned: (
    signedActId: string,
    exactCommand: SignedActCommand,
  ) => Promise<void>;
}) {
  const [phase, setPhase] = useState<
    "idle" | "signing" | "publishing" | "unknown"
  >("idle");
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const busy = phase !== "idle";
  const operation = useRef<AbortController | null>(null);
  const version = JSON.stringify(command);
  const current = useRef(version);
  current.current = version;
  useEffect(() => {
    setAvailable(passkeysAvailable());
    return () => {
      operation.current?.abort();
    };
  }, []);
  useEffect(() => {
    operation.current?.abort();
  }, [version]);
  const sign = async () => {
    if (busy) return;
    setPhase("signing");
    setError("");
    const controller = new AbortController();
    operation.current = controller;
    const snapshot = version;
    let challengeId: string | undefined;
    let publishing = false;
    try {
      const request = BeginSignedActSchema.parse({
        ...(fanId ? { fanId } : {}),
        command,
      });
      const challenge = SignedChallengeSchema.parse(
        await post(`${creatorId}/signed-acts/begin`, request),
      );
      challengeId = challenge.challengeId;
      const assertion = await assertPasskey(
        challenge.publicKey,
        controller.signal,
      );
      if (controller.signal.aborted || current.current !== snapshot)
        throw new Error(
          "The act changed. Review it and sign again. Nothing was sent.",
        );
      const signature = SignedActResultSchema.parse(
        await post("signed-acts/verify", { challengeId, assertion }),
      );
      if (controller.signal.aborted || current.current !== snapshot)
        throw new Error(
          "The act changed. Review it and sign again. Nothing was sent.",
        );
      // After publication begins, cancellation cannot undo the owner's transaction.
      // A lost response needs owner reconciliation before a second act is attempted.
      publishing = true;
      operation.current = null;
      setPhase("publishing");
      await onSigned(signature.signedActId, request.command);
      setPhase("idle");
    } catch (failure) {
      if (publishing) {
        setPhase("unknown");
        setError(
          "Publication could not be confirmed. Check this act's status before trying again.",
        );
      } else {
        setPhase("idle");
        setError(
          controller.signal.aborted
            ? "Signing cancelled. Nothing was sent."
            : failure instanceof Error
              ? failure.message
              : "Signing could not complete. Nothing was sent.",
        );
        if (challengeId)
          await post(`signed-acts/${challengeId}/cancel`, {}).catch(() => {});
      }
    } finally {
      operation.current = null;
    }
  };
  return (
    <section className="signed-act-review">
      <div className="signed-act-preview">
        <Message
          kind={approvedDraft ? "approved_draft" : "human_creator"}
          name={creatorName}
          time="DRAFT"
        >
          {text}
        </Message>
      </div>
      <SigningSheet
        title={title}
        rows={rows}
        action={
          phase === "publishing"
            ? "Sending signed act…"
            : phase === "unknown"
              ? "Check publication status"
              : busy
                ? "Signing…"
                : "Sign with your passkey"
        }
        helper="Your passkey signs exactly this. Any change needs a new signature."
        onSign={sign}
        disabled={!available || busy}
        signing={phase === "signing" || phase === "publishing"}
      />
      {phase === "signing" && (
        <button
          className="qv-btn qv-btn--quiet"
          type="button"
          onClick={() => operation.current?.abort()}
        >
          Cancel signing
        </button>
      )}
      {!available && (
        <Notice title="Passkey signing unavailable">
          Use a supported browser and device. No weaker signature is
          substituted.
        </Notice>
      )}
      {error && (
        <div>
          <Notice tone="error" title="Signing status">
            {error}
          </Notice>
        </div>
      )}
    </section>
  );
}
