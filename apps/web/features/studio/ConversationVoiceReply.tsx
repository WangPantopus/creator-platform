"use client";
import { useEffect, useRef, useState } from "react";
import { copy } from "@qelvora/copy";
import {
  ConversationRecordingInputSchema,
  ConversationRecordingResultSchema,
} from "../../../../packages/api/src/conversation/contracts";
import {
  ThreadRecordingPolicySchema,
  type MediaAsset,
} from "../../../../packages/api/src/media";
import { useConversationRequest } from "../conversation/api";
import { useIdentityRequest } from "../identity/session-boundary";
import { VoiceRecording } from "../media/VoiceRecorder";
import { mediaRequest } from "../media/api";
import {
  purgeRecordingRetries,
  recordingRetryStoragePrefix as storagePrefix,
  recordingRetryIdentityStorage as identityStorage,
} from "../media/recording-retry-storage";

/** A human recording is signed by W1, credentialed by W6, then associated by
 * W3. The remembered command is retry metadata; it supplies no authority. */
export function ConversationVoiceReply({
  creatorId,
  fanId,
  threadId,
  creatorName,
  expectedAccountId,
  current,
  onPendingChange,
  onDelivered,
}: {
  creatorId: string;
  fanId: string;
  threadId: string;
  creatorName: string;
  expectedAccountId: string;
  current: boolean;
  onPendingChange: (pending: boolean) => void;
  onDelivered: () => void;
}) {
  const request = useRef(useConversationRequest()).current;
  const { signal, session } = useRef(useIdentityRequest()).current;
  const [available, setAvailable] = useState(false);
  const [limit, setLimit] = useState<number | null>(null);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [delivered, setDelivered] = useState(false);
  const command = useRef<ReturnType<
    typeof ConversationRecordingInputSchema.parse
  > | null>(null);
  const sending = useRef(false);
  const storage = `${storagePrefix}${expectedAccountId}:${creatorId}:${fanId}:${threadId}`;
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      request<{ recordingDeliveryAvailable?: boolean }>(
        "capabilities",
        undefined,
        abort.signal,
      ),
      mediaRequest(`threads/${creatorId}/${fanId}/recording-policy`, {
        signal: AbortSignal.any([abort.signal, signal]),
        expectedAccountId,
        expectedSessionId: session.sessionId,
      }),
    ])
      .then(([value, raw]) => {
        const policy = ThreadRecordingPolicySchema.parse(raw);
        if (
          policy.creatorId !== creatorId ||
          policy.fanId !== fanId ||
          policy.threadId !== threadId
        )
          throw new Error(copy.w6SelectedConversationChanged);
        if (!abort.signal.aborted && !signal.aborted) {
          setLimit(policy.maxDurationMs);
          setAvailable(value.recordingDeliveryAvailable === true);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted && !signal.aborted) setAvailable(false);
      });
    return () => abort.abort();
  }, [
    request,
    creatorId,
    fanId,
    threadId,
    expectedAccountId,
    signal,
    session.sessionId,
  ]);
  useEffect(() => {
    try {
      const marker = JSON.stringify([session.accountId, session.sessionId]);
      if (!signal.aborted && session.accountId === expectedAccountId) {
        if (sessionStorage.getItem(identityStorage) !== marker)
          purgeRecordingRetries();
        sessionStorage.setItem(identityStorage, marker);
      }
      const raw = !signal.aborted ? sessionStorage.getItem(storage) : null;
      if (raw) {
        const remembered = JSON.parse(raw);
        const restored = ConversationRecordingInputSchema.safeParse(
          remembered.command,
        );
        if (
          restored.success &&
          remembered.accountId === session.accountId &&
          remembered.sessionId === session.sessionId &&
          session.accountId === expectedAccountId &&
          !signal.aborted
        ) {
          command.current = restored.data;
          setPending(true);
        } else sessionStorage.removeItem(storage);
      }
    } catch {
      /* Current server authority remains mandatory on every retry. */
      try {
        sessionStorage.removeItem(storage);
      } catch {
        /* Optional storage. */
      }
    }
    const dispose = () => {
      command.current = null;
      sending.current = false;
      setAsset(null);
      setAvailable(false);
      setLimit(null);
      setPending(false);
      setBusy(false);
      setError("");
      setDelivered(false);
    };
    signal.addEventListener("abort", dispose, { once: true });
    if (signal.aborted) dispose();
    return () => signal.removeEventListener("abort", dispose);
  }, [
    storage,
    signal,
    session.accountId,
    session.sessionId,
    expectedAccountId,
  ]);
  useEffect(() => {
    onPendingChange(pending || busy);
    return () => onPendingChange(false);
  }, [pending, busy, onPendingChange]);

  const ready =
    asset?.threadId === threadId &&
    asset.purpose === "human_reply" &&
    asset.state === "ready" &&
    asset.mimeType === "audio/mp4" &&
    asset.durationMs &&
    asset.signedActId &&
    asset.provenance?.c2paVerified === true &&
    Date.parse(asset.expiresAt) > Date.now();
  async function deliver() {
    if (
      sending.current ||
      !available ||
      !current ||
      signal.aborted ||
      session.accountId !== expectedAccountId
    )
      return;
    if (!command.current) {
      if (!asset || !ready) return;
      command.current = ConversationRecordingInputSchema.parse({
        evidence: {
          assetId: asset.id,
          version: asset.version,
          sha256: asset.sha256,
          mimeType: asset.mimeType,
          durationMs: asset.durationMs,
          bytes: asset.bytes,
        },
        signedActId: asset.signedActId,
        idempotencyKey: crypto.randomUUID(),
      });
      try {
        sessionStorage.setItem(
          storage,
          JSON.stringify({
            accountId: session.accountId,
            sessionId: session.sessionId,
            command: command.current,
          }),
        );
      } catch {
        /* Keep the exact in-memory retry. */
      }
    }
    sending.current = true;
    setBusy(true);
    setPending(true);
    setError("");
    try {
      const original = command.current;
      const result = ConversationRecordingResultSchema.parse(
        await request(`${creatorId}/${fanId}/recordings`, original),
      );
      if (signal.aborted || command.current !== original) return;
      if (
        result.threadId !== threadId ||
        result.signedActId !== original.signedActId
      )
        throw new Error(copy.w6SelectedConversationChanged);
      // Receipt validation precedes clearing the retry. A refresh failure must
      // not turn a confirmed delivery into a new send with a different key.
      try {
        sessionStorage.removeItem(storage);
      } catch {
        /* No authority is stored here. */
      }
      command.current = null;
      setPending(false);
      setDelivered(true);
      onDelivered();
    } catch (failure) {
      if (!signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : copy.w6RecordingDeliveryIsUnconfirmed,
        );
    } finally {
      if (!signal.aborted) {
        sending.current = false;
        setBusy(false);
      }
    }
  }
  if (signal.aborted || !available || !limit)
    return <p role="status">{copy.w6VoiceReplyUnavailable}</p>;
  return (
    <section aria-label={copy.w6RecordAVoiceReply}>
      {!pending && !delivered && (
        <VoiceRecording
          creatorId={creatorId}
          fanId={fanId}
          creatorName={creatorName}
          purpose="human_reply"
          maxDurationMs={limit}
          expectedAccountId={expectedAccountId}
          embedded
          onAssetChange={setAsset}
          actionsDisabled={!current || busy}
        />
      )}
      {asset && asset.threadId !== threadId && (
        <p role="status">{copy.w6SelectedConversationChanged}</p>
      )}
      {asset?.signedActId && !ready && !pending && (
        <p role="status">{copy.w6RecordingCredentialsAreProcessing}</p>
      )}
      {pending && <p role="status">{copy.w6RecordingDeliveryIsUnconfirmed}</p>}
      {error && <p role="alert">{error}</p>}
      {delivered ? (
        <p role="status">{copy.w6RecordingDelivered}</p>
      ) : (
        <button
          className="qv-btn qv-btn--maya"
          disabled={busy || !current || (!pending && !ready)}
          onClick={() => {
            void deliver();
          }}
        >
          {pending
            ? copy.w6RetryRecordingDelivery
            : copy.w6DeliverThisRecording}
        </button>
      )}
    </section>
  );
}
