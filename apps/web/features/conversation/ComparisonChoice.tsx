"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Notice } from "@qelvora/ui-web";
import {
  ComparisonConsentStateSchema,
  ComparisonQuestionResultSchema,
  type ComparisonConsentInput,
  type ComparisonConsentState,
  type ConversationMessage,
} from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest } from "./api";

export function useComparisonsAvailable(enabled: boolean) {
  const request = useConversationRequest();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(false);
    if (!enabled) return;
    const controller = new AbortController();
    void request<{ comparisonsAvailable?: boolean }>(
      "capabilities",
      undefined,
      controller.signal,
    )
      .then((caps) => {
        if (!controller.signal.aborted)
          setAvailable(caps.comparisonsAvailable === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [enabled, request]);
  return enabled && available;
}

/** Never stores a notice or consent offline. Every mounted view rechecks the
 * current account-bound choice; closing/hiding aborts its provider request. */
export function ComparisonChoice({
  root,
  messageId,
}: {
  root: string;
  messageId?: string;
}) {
  const request = useConversationRequest();
  const [choice, setChoice] = useState<ComparisonConsentState | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const controller = useRef<AbortController | null>(null);
  const conceal = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setChoice(null);
    setAvailable(null);
    setBusy(false);
    setStatus("");
    setFailure("");
  }, []);
  const refresh = useCallback(async () => {
    conceal();
    if (document.visibilityState !== "visible") return;
    if (!navigator.onLine) {
      setFailure("Reconnect to view your comparison choice.");
      return;
    }
    const operation = new AbortController();
    controller.current = operation;
    try {
      const caps = await request<{ comparisonsAvailable?: boolean }>(
        "capabilities",
        undefined,
        operation.signal,
      );
      operation.signal.throwIfAborted();
      setAvailable(caps.comparisonsAvailable === true);
      if (!caps.comparisonsAvailable) return;
      const fresh = ComparisonConsentStateSchema.parse(
        await request(
          `${root}/comparison-consent`,
          undefined,
          operation.signal,
        ),
      );
      operation.signal.throwIfAborted();
      setChoice(fresh);
    } catch (error) {
      if (!operation.signal.aborted)
        setFailure(
          error instanceof Error
            ? error.message
            : "Your comparison choice is unavailable.",
        );
    }
  }, [conceal, request, root]);
  useEffect(() => {
    const offline = () => {
      conceal();
      setFailure("Reconnect to view your comparison choice.");
    };
    void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      conceal();
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh, conceal]);
  useEffect(() => {
    if (!choice?.expiresAt) return;
    const delay = Date.parse(choice.expiresAt) - Date.now();
    if (delay > 2_147_483_647) return;
    const timer = setTimeout(() => void refresh(), Math.max(0, delay));
    return () => clearTimeout(timer);
  }, [choice?.expiresAt, refresh]);
  const act = async (input: ComparisonConsentInput | "include") => {
    if (
      busy ||
      !choice ||
      !controller.current ||
      controller.current.signal.aborted
    )
      return;
    const operation = controller.current;
    setBusy(true);
    setFailure("");
    setStatus("");
    try {
      if (input === "include") {
        if (!messageId || !choice.allowed) return;
        const result = ComparisonQuestionResultSchema.parse(
          await request(
            `${root}/messages/${messageId}/comparison`,
            {},
            operation.signal,
          ),
        );
        operation.signal.throwIfAborted();
        setStatus(
          result.included
            ? "A general version of this question is saved for AI comparisons. You can withdraw your choice in Me and privacy."
            : "This question was not included. It did not pass the comparison privacy checks.",
        );
      } else {
        const fresh = ComparisonConsentStateSchema.parse(
          await request(`${root}/comparison-consent`, input, operation.signal),
        );
        operation.signal.throwIfAborted();
        setChoice(fresh);
        setStatus(
          input.action === "withdraw"
            ? "Your comparison choice is withdrawn. Saved comparison questions and text have been removed. Affected exports remain unavailable while their files are removed."
            : "Your comparison choice is saved. Choose a question in the conversation to include it.",
        );
      }
    } catch (error) {
      if (!operation.signal.aborted)
        setFailure(
          error instanceof Error
            ? error.message
            : "The result could not be confirmed. Refresh your choice before continuing.",
        );
    } finally {
      if (!operation.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="comparison-choice">
      {failure && (
        <>
          <Notice title="Comparison status" tone="error">
            {failure}
          </Notice>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh comparison choice
          </button>
        </>
      )}
      {available === false && <p>AI comparisons are not available yet.</p>}
      {!choice && available !== false && !failure && (
        <p role="status">Loading your comparison choice…</p>
      )}
      {choice && (
        <>
          <p className="qv-meta">
            {choice.allowed ? "Allowed for this creator" : "Off · optional"}
          </p>
          {choice.policy ? (
            <p>{choice.policy.notice}</p>
          ) : (
            <p>
              The current comparison notice is unavailable. No new questions can
              be included.
            </p>
          )}
          {choice.allowed && choice.expiresAt && (
            <p className="qv-help">
              Your choice ends{" "}
              <time dateTime={choice.expiresAt}>
                {new Date(choice.expiresAt).toLocaleString()}
              </time>
              .
            </p>
          )}
          {busy && (
            <p role="status">
              {messageId
                ? "Saving your comparison choice or checking this question…"
                : "Saving your comparison choice…"}
            </p>
          )}
          {status && <p role="status">{status}</p>}
          <div className="qv-sheet__actions">
            {choice.allowed ? (
              <>
                {messageId && (
                  <button
                    className="qv-btn qv-btn--ai"
                    disabled={busy}
                    onClick={() => void act("include")}
                  >
                    Include this question
                  </button>
                )}
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={busy}
                  onClick={() => void act({ action: "withdraw" })}
                >
                  Withdraw comparison choice
                </button>
              </>
            ) : (
              choice.policy && (
                <button
                  className="qv-btn qv-btn--ai"
                  disabled={busy}
                  onClick={() =>
                    void act({
                      action: "allow",
                      policyVersion: choice.policy!.version,
                      consent: true,
                    })
                  }
                >
                  Allow questions for AI comparisons
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ComparisonQuestionSheet({
  root,
  message,
  onClose,
}: {
  root: string;
  message: ConversationMessage;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="qv qv-sheet comparison-sheet"
      aria-labelledby={heading}
      onCancel={onClose}
    >
      <div className="qv-sign__grab" aria-hidden="true" />
      <div className="qv-sheet__head">
        <span className="qv-meta">Your question</span>
        <h2 id={heading} className="qv-sheet__title">
          AI comparisons
        </h2>
        <button
          className="qv-icon-btn qv-sheet__close"
          aria-label="Close AI comparison options"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="qv-sheet__body">
        <blockquote className="comparison-question">{message.text}</blockquote>
        <ComparisonChoice root={root} messageId={message.id} />
      </div>
    </dialog>
  );
}
