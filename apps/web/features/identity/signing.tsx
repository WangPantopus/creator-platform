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
import { useIdentityRequest } from "./session-boundary";

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) immutable(nested);
    Object.freeze(value);
  }
  return value;
}
type Phase = "idle" | "signing" | "publishing" | "unknown";
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
  const identity = useIdentityRequest();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseNow = useRef<Phase>("idle");
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const busy = phase !== "idle";
  const operation = useRef<AbortController | null>(null);
  const cancellation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const activeIdentity = useRef(identity.signal);
  activeIdentity.current = identity.signal;
  const version = JSON.stringify([
    creatorId,
    fanId ?? null,
    command,
    creatorName,
    text,
    approvedDraft,
    title,
    rows,
  ]);
  const current = useRef(version);
  current.current = version;
  useEffect(() => {
    mounted.current = true;
    setAvailable(passkeysAvailable());
    const leave = () => {
      operation.current?.abort();
      cancellation.current?.abort();
    };
    const visibility = () => {
      if (document.hidden) leave();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      leave();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    operation.current?.abort();
    cancellation.current?.abort();
    if (phaseNow.current === "signing") {
      phaseNow.current = "idle";
      setPhase("idle");
      setError("The act changed. Review it and sign again.");
    }
  }, [version, identity.signal]);
  const sign = async () => {
    if (
      phaseNow.current !== "idle" ||
      operation.current ||
      !mounted.current ||
      identity.signal.aborted ||
      document.hidden
    )
      return;
    phaseNow.current = "signing";
    setPhase("signing");
    setError("");
    const controller = new AbortController();
    operation.current = controller;
    const snapshot = version;
    const originalIdentity = identity.signal;
    const sameView = () =>
      mounted.current &&
      activeIdentity.current === originalIdentity &&
      !originalIdentity.aborted;
    const assertOriginal = (signal: AbortSignal) => {
      signal.throwIfAborted();
      if (!sameView() || current.current !== snapshot || document.hidden)
        throw new DOMException(
          "The original signing view ended.",
          "AbortError",
        );
    };
    const post = async (path: string, body: unknown, signal: AbortSignal) => {
      assertOriginal(signal);
      const response = await identity.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      assertOriginal(signal);
      const value = await response.json();
      assertOriginal(signal);
      if (!response.ok)
        throw new Error(
          value.error?.message ??
            "Signing is unavailable. Nothing was published.",
        );
      return value;
    };
    let challengeId: string | undefined;
    let publishing = false;
    try {
      assertOriginal(controller.signal);
      const [originalCreator, originalFan, originalCommand] = JSON.parse(
        snapshot,
      ) as [string, string | null, SignedActCommand, ...unknown[]];
      const request = immutable(
        BeginSignedActSchema.parse({
          ...(originalFan ? { fanId: originalFan } : {}),
          command: originalCommand,
        }),
      );
      const challenge = SignedChallengeSchema.parse(
        await post(
          `${originalCreator}/signed-acts/begin`,
          request,
          controller.signal,
        ),
      );
      challengeId = challenge.challengeId;
      const assertion = await assertPasskey(
        challenge.publicKey,
        AbortSignal.any([controller.signal, originalIdentity]),
      );
      assertOriginal(controller.signal);
      const signature = SignedActResultSchema.parse(
        await post(
          "signed-acts/verify",
          { challengeId, assertion },
          controller.signal,
        ),
      );
      assertOriginal(controller.signal);
      // After publication begins, cancellation cannot undo the owner's transaction.
      // A lost response needs owner reconciliation before a second act is attempted.
      publishing = true;
      phaseNow.current = "publishing";
      setPhase("publishing");
      await onSigned(signature.signedActId, request.command);
      if (sameView()) {
        const changed = current.current !== snapshot;
        phaseNow.current = changed ? "unknown" : "idle";
        setPhase(phaseNow.current);
        if (changed)
          setError(
            "The review changed while publication finished. Check the original act's status before signing again.",
          );
      }
    } catch (failure) {
      if (publishing) {
        if (sameView()) {
          phaseNow.current = "unknown";
          setPhase("unknown");
          setError(
            "Publication could not be confirmed. Check this act's status before trying again.",
          );
        }
      } else {
        // Manual cancellation can cancel this original challenge only while
        // the same visible account/review remains. Abandoned views never
        // cancel through a replacement identity.
        if (
          challengeId &&
          sameView() &&
          current.current === snapshot &&
          !document.hidden
        ) {
          const cleanup = new AbortController();
          cancellation.current = cleanup;
          try {
            await post(`signed-acts/${challengeId}/cancel`, {}, cleanup.signal);
          } catch {
            // The original challenge expires; no cleanup success is invented.
          } finally {
            if (cancellation.current === cleanup) cancellation.current = null;
          }
        }
        if (sameView() && current.current === snapshot) {
          phaseNow.current = "idle";
          setPhase("idle");
          setError(
            controller.signal.aborted
              ? "Signing cancelled. No publication was started."
              : failure instanceof Error
                ? failure.message
                : "Signing could not complete. No publication was started.",
          );
        }
      }
    } finally {
      if (operation.current === controller) operation.current = null;
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
