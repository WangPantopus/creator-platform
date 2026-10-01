"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice } from "@qelvora/ui-web";
import {
  ConversationCorrectionCommandSchema,
  ConversationCorrectionInputSchema,
  ConversationCorrectionMessageSchema as SourceSchema,
  ConversationCorrectionReceiptSchema,
  type ConversationCorrectionInput,
} from "../../../../packages/api/src/conversation/correction";
import { SignedActReview } from "../identity/signing";
import { StudioFailure, studioRequest } from "./api";

export function CorrectionReply({
  creator,
  fanId,
  threadId,
  originalMessageId,
  originalVersion,
  onDelivered,
  onPendingChange,
}: {
  creator: {
    id: string;
    display_name: string;
    owned: boolean;
    viewerAccountId: string;
  };
  fanId: string;
  threadId: string;
  originalMessageId: string;
  originalVersion?: number;
  onDelivered(): Promise<void>;
  onPendingChange(pending: boolean): void;
}) {
  const root = `${creator.id}/${fanId}/messages`;
  const [source, setSource] = useState<ReturnType<
      typeof SourceSchema.parse
    > | null>(null),
    [text, setText] = useState(""),
    [current, setCurrent] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<ConversationCorrectionInput | null>(null),
    [delivered, setDelivered] = useState<string | null>(null),
    [error, setError] = useState("");
  const node = useRef<HTMLElement | null>(null),
    mounted = useRef(false),
    active = useRef(false),
    currentAccess = useRef(false),
    refreshing = useRef(false),
    working = useRef(false),
    generation = useRef(0),
    checkedAt = useRef(0),
    currentSource = useRef<typeof source>(null);
  const request = useCallback(
    <T,>(path: string, body?: unknown) =>
      studioRequest<T>(
        "conversations",
        `${root}/${path}`,
        body,
        creator.viewerAccountId,
        { signal: AbortSignal.timeout(4000) },
      ),
    [root, creator.viewerAccountId],
  );
  const suspend = useCallback(() => {
    currentAccess.current = false;
    setCurrent(false);
    setReview(false);
  }, []);
  const failure = useCallback(
    (value: unknown) => {
      if (!mounted.current) return;
      suspend();
      if (
        value instanceof StudioFailure &&
        ([401, 403].includes(value.status) ||
          ["session_account_changed", "session_changed"].includes(value.code))
      ) {
        generation.current++;
        currentSource.current = null;
        setSource(null);
        setText("");
        setPending(null);
        onPendingChange(false);
        setDelivered(null);
      }
      setError(
        value instanceof Error
          ? value.message
          : "The correction is unavailable.",
      );
    },
    [suspend, onPendingChange],
  );
  const readSource = useCallback(async () => {
    const parsed = SourceSchema.safeParse(await request(originalMessageId));
    if (!parsed.success)
      throw new Error(
        "The current original answer and its version are unavailable.",
      );
    const actual = parsed.data;
    if (
      actual.id !== originalMessageId ||
      actual.threadId !== threadId ||
      actual.authorKind !== "ai" ||
      (originalVersion !== undefined && actual.version !== originalVersion) ||
      !["delivered", "interrupted"].includes(actual.deliveryState) ||
      !actual.text.trim() ||
      !Number.isSafeInteger(actual.version) ||
      actual.version <= 0
    )
      throw new Error(
        "The original AI answer is not available for correction.",
      );
    return actual;
  }, [request, originalMessageId, originalVersion, threadId]);
  const refresh = useCallback(async () => {
    if (refreshing.current || working.current || !active.current) return;
    refreshing.current = true;
    const epoch = generation.current,
      started = performance.now();
    try {
      const actual = await readSource();
      if (!mounted.current || epoch !== generation.current) return;
      if (currentSource.current?.version !== actual.version) setReview(false);
      currentSource.current = actual;
      setSource(actual);
      checkedAt.current = started;
      currentAccess.current =
        active.current && performance.now() - started < 5000;
      setCurrent(currentAccess.current);
      setError("");
    } catch (value) {
      if (epoch === generation.current) failure(value);
    } finally {
      refreshing.current = false;
    }
  }, [readSource, failure]);
  useEffect(() => {
    mounted.current = true;
    const visibility = () => {
      let visible = !document.hidden;
      for (
        let ancestor = node.current?.parentElement;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        if (
          ancestor.hidden ||
          ancestor.inert ||
          ancestor.getAttribute("aria-hidden") === "true" ||
          (ancestor instanceof HTMLDialogElement && !ancestor.open)
        )
          visible = false;
      }
      if (active.current !== visible) {
        active.current = visible;
        if (visible) void refresh();
        else {
          generation.current++;
          suspend();
        }
      }
    };
    const observer = new MutationObserver(visibility);
    for (
      let ancestor = node.current?.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    )
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "open"],
      });
    visibility();
    const polling = setInterval(() => void refresh(), 4000),
      expiry = setInterval(() => {
        if (performance.now() - checkedAt.current >= 5000) suspend();
      }, 500);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      active.current = false;
      currentAccess.current = false;
      generation.current++;
      observer.disconnect();
      clearInterval(polling);
      clearInterval(expiry);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, suspend]);
  const submit = async (body: ConversationCorrectionInput) => {
    if (
      working.current ||
      !currentAccess.current ||
      !active.current ||
      performance.now() - checkedAt.current >= 5000
    )
      throw new Error(
        "Check current conversation access before sending this correction.",
      );
    working.current = true;
    generation.current++;
    const epoch = generation.current,
      started = performance.now();
    setBusy(true);
    setError("");
    try {
      const parsedReceipt = ConversationCorrectionReceiptSchema.safeParse(
        await request(`${originalMessageId}/corrections`, body),
      );
      if (!parsedReceipt.success)
        throw new Error(
          "Correction delivery could not be confirmed. Retry this exact act.",
        );
      const receipt = parsedReceipt.data;
      if (
        receipt.threadId !== threadId ||
        receipt.originalMessageId !== originalMessageId ||
        receipt.originalVersion !== body.command.content.messageVersion ||
        receipt.signedActId !== body.signedActId
      )
        throw new Error(
          "Correction delivery could not be confirmed. Retry this exact act.",
        );
      const parsedMessage = SourceSchema.safeParse(
        await request(receipt.messageId),
      );
      if (!parsedMessage.success)
        throw new Error(
          "The delivered correction could not be read back. Retry this exact act.",
        );
      const message = parsedMessage.data;
      const correction = message.correction;
      if (
        message.id !== receipt.messageId ||
        message.threadId !== threadId ||
        message.authorKind !== "human_creator" ||
        message.deliveryState !== "delivered" ||
        message.authorAccountId !== creator.viewerAccountId ||
        message.signedActId !== body.signedActId ||
        message.text !== body.command.content.text ||
        correction?.originalMessageId !== originalMessageId ||
        correction.originalVersion !== body.command.content.messageVersion
      )
        throw new Error(
          "The delivered correction could not be read back. Retry this exact act.",
        );
      if (
        !mounted.current ||
        epoch !== generation.current ||
        !active.current ||
        performance.now() - started >= 5000
      )
        throw new Error(
          "Check current conversation access before confirming this correction.",
        );
      checkedAt.current = started;
      currentAccess.current = true;
      setCurrent(true);
      setPending(null);
      onPendingChange(false);
      setReview(false);
      setText("");
      setDelivered(message.id);
      await onDelivered();
    } catch (value) {
      if (mounted.current && epoch === generation.current) failure(value);
      throw value;
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const command =
    source &&
    ConversationCorrectionCommandSchema.safeParse({
      actType: "correction",
      subjectId: originalMessageId,
      content: {
        kind: "conversation_correction",
        creatorId: creator.id,
        threadId,
        fanId,
        messageVersion: source.version,
        text,
      },
    });
  return (
    <section ref={node}>
      {!current && (
        <p role="status">
          Checking current conversation access. Your unsent words stay here
          during a connection interruption.
        </p>
      )}
      {error && (
        <Notice tone="error" title="Correction status">
          {error}
        </Notice>
      )}
      <div hidden={!current} inert={!current}>
        {source && (
          <>
            <p className="qv-help">
              Adds a signed correction to this AI answer. The original answer
              stays visible.
            </p>
            <blockquote>{source.text}</blockquote>
            <p className="qv-meta">
              ORIGINAL ANSWER · VERSION {source.version}
            </p>
          </>
        )}
        <label className="w5-field">
          Your correction
          <textarea
            rows={4}
            maxLength={10000}
            value={text}
            disabled={busy || !!pending || !!delivered}
            onChange={(event) => {
              setText(event.target.value);
              setReview(false);
            }}
          />
        </label>
        {pending ? (
          <>
            <p className="qv-help">
              The send result is unconfirmed. Confirm this correction before
              starting another. This editor keeps your reviewed words while
              access is rechecked.
            </p>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy}
              onClick={() => void submit(pending).catch(() => {})}
            >
              Confirm pending correction
            </button>
          </>
        ) : (
          <button
            className="qv-btn qv-btn--maya"
            disabled={
              !creator.owned || busy || !command?.success || !!delivered
            }
            onClick={() => setReview(true)}
          >
            Review signed correction
          </button>
        )}
        {review && current && !pending && command?.success && (
          <SignedActReview
            creatorId={creator.id}
            fanId={fanId}
            creatorName={creator.display_name}
            command={command.data}
            text={text}
            title="Send this correction"
            rows={[
              ["Attached to", `AI answer · version ${source?.version}`],
              ["Fan sees", creator.display_name],
            ]}
            onSigned={async (signedActId, exactCommand) => {
              const exact =
                ConversationCorrectionCommandSchema.parse(exactCommand);
              if (
                !currentAccess.current ||
                !active.current ||
                performance.now() - checkedAt.current >= 5000 ||
                exact.content.messageVersion !==
                  currentSource.current?.version ||
                JSON.stringify(exact) !== JSON.stringify(command.data)
              )
                throw new Error(
                  "The correction changed. Check current access before sending.",
                );
              const body = ConversationCorrectionInputSchema.parse({
                command: exact,
                signedActId,
                idempotencyKey: crypto.randomUUID(),
              });
              setPending(body);
              onPendingChange(true);
              setReview(false);
              await submit(body);
            }}
          />
        )}
        {delivered && (
          <Notice title="Signed correction delivered">
            The correction is attached to the original answer in this
            conversation.
          </Notice>
        )}
      </div>
      {!current && (
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Check current access
        </button>
      )}
    </section>
  );
}
