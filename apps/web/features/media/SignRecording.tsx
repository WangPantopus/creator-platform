"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import {
  BeginSignedActSchema,
  SignedActCommandSchema,
  SignedActResultSchema,
  SignedChallengeSchema,
  type SignedActCommand,
} from "@qelvora/api";
import {
  MediaAssetSchema,
  MediaSignSchema,
  type MediaAsset,
} from "../../../../packages/api/src/media";
import { mediaRequest } from "./api";
import { assertPasskey } from "../identity/passkey";
import { useIdentityRequest } from "../identity/session-boundary";

type Props = {
  asset: MediaAsset;
  creatorId: string;
  fanId: string;
  expectedAccountId?: string;
  disabled?: boolean;
  onSigned: (value: MediaAsset) => void;
};
type Identity = ReturnType<typeof useIdentityRequest>;
type Publication = {
  asset: MediaAsset;
  command: SignedActCommand;
  body: ReturnType<typeof MediaSignSchema.parse>;
};
type Operation = {
  controller: AbortController;
  signal: AbortSignal;
  challengeId?: string;
  submitted: boolean;
};

/** W1 supplies authority. Changing the original recording or session disposes
 * the view and its exact signed-act retry, rather than adopting it. */
export function SignRecording(props: Props) {
  const identity = useIdentityRequest();
  const lifetime = useRef({ signal: identity.signal, revision: 0 });
  if (lifetime.current.signal !== identity.signal)
    lifetime.current = {
      signal: identity.signal,
      revision: lifetime.current.revision + 1,
    };
  return (
    <RecordingSignature
      key={`${lifetime.current.revision}/${identity.session.accountId}/${identity.session.sessionId}/${props.creatorId}/${props.fanId}/${JSON.stringify(props.asset)}`}
      {...props}
      identity={identity}
    />
  );
}

function exactContent(command: SignedActCommand, asset: MediaAsset) {
  const content = command.content;
  return (
    typeof content === "object" &&
    content !== null &&
    !Array.isArray(content) &&
    Object.keys(content).length === 6 &&
    content.mediaAssetId === asset.id &&
    content.version === asset.version &&
    content.sha256 === asset.sha256 &&
    content.mimeType === asset.mimeType &&
    content.durationMs === asset.durationMs &&
    content.bytes === asset.bytes &&
    (asset.purpose !== "human_reply" ||
      (command.actType === "reply" && command.subjectId === asset.threadId))
  );
}

function RecordingSignature({
  asset,
  creatorId,
  fanId,
  onSigned,
  expectedAccountId,
  disabled = false,
  identity,
}: Props & { identity: Identity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const surface = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);
  const operation = useRef<Operation | null>(null);
  const cancellation = useRef<AbortController | null>(null);
  const publication = useRef<Publication | null>(null);
  const original = useRef(identity).current;
  const latest = useRef({ identity, disabled, expectedAccountId });
  latest.current = { identity, disabled, expectedAccountId };
  const lifetime = useRef({
    wall: Date.parse(asset.expiresAt),
    monotonic:
      performance.now() + Math.max(0, Date.parse(asset.expiresAt) - Date.now()),
  }).current;
  const family = `threads/${creatorId}/${fanId}/media/${asset.id}`;

  function visible() {
    if (document.hidden || !surface.current?.isConnected) return false;
    for (
      let node: HTMLElement | null = surface.current;
      node;
      node = node.parentElement
    )
      if (
        node.hidden ||
        node.inert ||
        node.getAttribute("aria-hidden") === "true" ||
        (node instanceof HTMLDialogElement && !node.open)
      )
        return false;
    return true;
  }
  function current() {
    const value = latest.current;
    return (
      mounted.current &&
      visible() &&
      !value.disabled &&
      !original.signal.aborted &&
      value.identity.signal === original.signal &&
      value.identity.session.accountId === original.session.accountId &&
      value.identity.session.sessionId === original.session.sessionId &&
      (value.expectedAccountId === undefined ||
        value.expectedAccountId === original.session.accountId) &&
      Number.isFinite(lifetime.wall) &&
      Date.now() < lifetime.wall &&
      performance.now() < lifetime.monotonic
    );
  }
  function check(attempt: Operation) {
    attempt.signal.throwIfAborted();
    if (operation.current !== attempt || !current())
      throw new Error(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
  }
  function begin(): Operation | null {
    if (operation.current) return null;
    if (!current()) {
      if (mounted.current)
        setError(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
      return null;
    }
    cancellation.current?.abort();
    const controller = new AbortController();
    const attempt = {
      controller,
      signal: AbortSignal.any([
        original.signal,
        controller.signal,
        AbortSignal.timeout(
          Math.max(
            1,
            Math.floor(
              Math.min(
                300_000,
                lifetime.wall - Date.now(),
                lifetime.monotonic - performance.now(),
              ),
            ),
          ),
        ),
      ]),
      submitted: false,
    };
    operation.current = attempt;
    setBusy(true);
    setError(null);
    return attempt;
  }
  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      operation.current?.controller.abort();
      cancellation.current?.abort();
    };
    const visibility = () => {
      if (!visible()) cancel();
    };
    const observer = new MutationObserver(visibility);
    for (
      let node: HTMLElement | null = surface.current;
      node;
      node = node.parentElement
    )
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "open"],
      });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", cancel);
    original.signal.addEventListener("abort", cancel);
    return () => {
      mounted.current = false;
      cancel();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", cancel);
      original.signal.removeEventListener("abort", cancel);
    };
  }, [original]);
  useEffect(() => {
    if (
      disabled ||
      identity.signal !== original.signal ||
      (expectedAccountId !== undefined &&
        expectedAccountId !== original.session.accountId)
    ) {
      operation.current?.controller.abort();
      cancellation.current?.abort();
    }
  }, [disabled, identity.signal, original, expectedAccountId]);

  async function platform(path: string, body: unknown, attempt: Operation) {
    check(attempt);
    const response = await original.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: attempt.signal,
    });
    check(attempt);
    const value = await response.json();
    check(attempt);
    if (!response.ok)
      throw new Error(value.error?.message ?? copy.w6SigningIsUnavailable);
    return value;
  }
  async function submit(proof: Publication, attempt: Operation) {
    check(attempt);
    if (
      publication.current !== proof ||
      !exactContent(proof.command, proof.asset)
    )
      throw new Error(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
    // Abort cannot undo a committed owner transaction after dispatch. Retain
    // this original act/version/idempotency key for reconciliation or retry.
    attempt.submitted = true;
    const result = await mediaRequest<{ asset: unknown; command: unknown }>(
      `${family}/sign`,
      {
        method: "POST",
        body: JSON.stringify(proof.body),
        expectedAccountId: original.session.accountId,
        signal: AbortSignal.any([attempt.signal, AbortSignal.timeout(10_000)]),
      },
    );
    check(attempt);
    const saved = MediaAssetSchema.parse(result.asset);
    const command = SignedActCommandSchema.parse(result.command);
    if (
      !exactContent(command, proof.asset) ||
      command.actType !== proof.command.actType ||
      command.subjectId !== proof.command.subjectId ||
      saved.id !== proof.asset.id ||
      saved.threadId !== proof.asset.threadId ||
      saved.purpose !== proof.asset.purpose ||
      saved.state !== "ready" ||
      saved.version !== proof.asset.version ||
      saved.sha256 !== proof.asset.sha256 ||
      saved.mimeType !== proof.asset.mimeType ||
      saved.durationMs !== proof.asset.durationMs ||
      saved.bytes !== proof.asset.bytes ||
      saved.expiresAt !== proof.asset.expiresAt ||
      saved.signedActId !== proof.body.signedActId
    )
      throw new Error(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
    check(attempt);
    setUnknown(false);
    setError(null);
    onSigned(saved);
  }
  function failed(attempt: Operation, failure: unknown) {
    if (!mounted.current || operation.current !== attempt) return;
    if (attempt.submitted) {
      setUnknown(true);
      setError(
        copy.w6SignatureSubmissionIsUnconfirmedRetryThisExactActOrRefresh,
      );
    } else
      setError(
        attempt.signal.aborted
          ? copy.w6SigningWasCancelledNothingWasShared
          : failure instanceof Error
            ? failure.message
            : copy.w6SigningIsUnavailable,
      );
  }
  function finish(attempt: Operation) {
    if (operation.current !== attempt) return;
    operation.current = null;
    attempt.controller.abort();
    if (mounted.current) setBusy(false);
  }
  async function publish() {
    const proof = publication.current;
    if (!proof) return;
    const attempt = begin();
    if (!attempt) return;
    try {
      await submit(proof, attempt);
    } catch (failure) {
      failed(attempt, failure);
    } finally {
      finish(attempt);
    }
  }
  async function sign() {
    if (publication.current || asset.signedActId || asset.state !== "ready")
      return;
    const attempt = begin();
    if (!attempt) return;
    try {
      const recording = MediaAssetSchema.parse(asset);
      const command = SignedActCommandSchema.parse(
        await mediaRequest<unknown>(`${family}/signing-command`, {
          expectedAccountId: original.session.accountId,
          signal: AbortSignal.any([
            attempt.signal,
            AbortSignal.timeout(10_000),
          ]),
        }),
      );
      check(attempt);
      if (!exactContent(command, recording))
        throw new Error(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
      const challenge = SignedChallengeSchema.parse(
        await platform(
          `${creatorId}/signed-acts/begin`,
          BeginSignedActSchema.parse({ fanId, command }),
          attempt,
        ),
      );
      attempt.challengeId = challenge.challengeId;
      check(attempt);
      const assertion = await assertPasskey(
        challenge.publicKey,
        attempt.signal,
      );
      check(attempt);
      const verified = SignedActResultSchema.parse(
        await platform(
          "signed-acts/verify",
          { challengeId: attempt.challengeId, assertion },
          attempt,
        ),
      );
      check(attempt);
      const proof = {
        asset: recording,
        command,
        body: MediaSignSchema.parse({
          version: recording.version,
          signedActId: verified.signedActId,
          idempotencyKey: crypto.randomUUID(),
        }),
      };
      publication.current = proof;
      setUnknown(true);
      await submit(proof, attempt);
    } catch (failure) {
      failed(attempt, failure);
    } finally {
      // Cancel only pre-submission challenges through the original W1 boundary.
      // A replacement account must never cancel this challenge or undo delivery.
      if (attempt.challengeId && !attempt.submitted && current()) {
        const cleanup = new AbortController();
        cancellation.current = cleanup;
        void original
          .request(`signed-acts/${attempt.challengeId}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: AbortSignal.any([
              cleanup.signal,
              AbortSignal.timeout(4000),
            ]),
          })
          .catch(() => undefined)
          .finally(() => {
            if (cancellation.current === cleanup) cancellation.current = null;
          });
      }
      finish(attempt);
    }
  }
  return (
    <section ref={surface} className="w6-card">
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
        type="button"
        className="qv-btn qv-btn--maya"
        disabled={
          disabled ||
          busy ||
          unknown ||
          !!asset.signedActId ||
          asset.state !== "ready" ||
          (expectedAccountId !== undefined &&
            expectedAccountId !== original.session.accountId)
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
      {busy && !operation.current?.submitted && (
        <button
          type="button"
          className="qv-btn qv-btn--quiet"
          onClick={() => operation.current?.controller.abort()}
        >
          {copy.cancel}
        </button>
      )}
      {error && <p role="status">{error}</p>}
      {unknown && (
        <button
          type="button"
          className="qv-btn qv-btn--secondary"
          disabled={disabled || busy}
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
