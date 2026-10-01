"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { commerceApprovalContracts } from "@qelvora/api";
import { Message, Notice } from "@qelvora/ui-web";
import { SignedActReview } from "../identity/signing";
import { studioRequest } from "./api";

type Draft = commerceApprovalContracts.ReplyDraft;
type Sources = {
  items: { id: string; version: number; text: string; sequence: number }[];
  nextSequence: number | null;
};

/** Text stays in memory. Only the scoped opaque draft reference survives reload. */
export function ApproveDraft({
  creator,
  fanId,
  onDelivered,
  deliveryAllowed = true,
  onReady,
}: {
  creator: {
    id: string;
    display_name: string;
    owned: boolean;
    viewerAccountId: string;
  };
  fanId: string;
  onDelivered: () => Promise<void>;
  deliveryAllowed?: boolean;
  onReady?: () => Promise<void>;
}) {
  const [sources, setSources] = useState<Sources | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [text, setText] = useState(""),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [freshUntil, setFreshUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const current = useRef(true),
    edited = useRef(false),
    revision = useRef<Draft | null>(null),
    root = `creators/${creator.id}/fans/${fanId}`,
    reference = `w4.approval.${creator.viewerAccountId}.${creator.id}.${fanId}`;
  const request = useCallback(
    <T,>(path: string, body?: unknown) =>
      studioRequest<T>(
        "commerce-approvals",
        `${root}/${path}`,
        body,
        creator.viewerAccountId,
      ),
    [root, creator.viewerAccountId],
  );
  const accept = useCallback((value: Draft, validUntil = Date.now() + 5000) => {
    if (!current.current) return;
    const prior = revision.current;
    if (prior?.id === value.id && value.version < prior.version) return;
    if (prior && prior.version !== value.version) {
      setReview(false);
      if (edited.current) {
        setConflict(true);
        setError(
          "This draft changed elsewhere. Your unsaved text is kept. Review the saved revision before editing again.",
        );
      }
    }
    revision.current = value;
    setDraft(value);
    if (!edited.current) setText(value.text);
    setNow(Date.now());
    setFreshUntil(validUntil);
    if (value.approval && !value.approval.invalidatedAt) setReview(false);
  }, []);
  const refresh = useCallback(async () => {
    let id = revision.current?.id;
    if (!id) {
      try {
        id = sessionStorage.getItem(reference) ?? undefined;
      } catch {
        /* Browser storage does not grant draft authority. */
      }
    }
    if (id && /^[a-f0-9-]{36}$/u.test(id)) {
      const validUntil = Date.now() + 5000;
      const value = await request<Draft>(`drafts/${id}`);
      if (!revision.current || revision.current.id === id)
        accept(value, validUntil);
    } else {
      const value = await request<Sources>("drafts/sources");
      if (current.current) setSources(value);
    }
  }, [accept, reference, request]);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      if (current.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : "This action could not complete. Refresh its current status.",
        );
        setFreshUntil(0);
        setReview(false);
      }
    } finally {
      if (current.current) setBusy(false);
    }
  };
  useEffect(() => {
    current.current = true;
    void refresh().catch((failure) => {
      if (current.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Drafts are unavailable.",
        );
    });
    const timer = setInterval(() => {
      setNow(Date.now());
      if (revision.current)
        void refresh().catch((failure) => {
          if (current.current) {
            setFreshUntil(0);
            setReview(false);
            setError(
              failure instanceof Error
                ? failure.message
                : "Refresh this draft before continuing.",
            );
          }
        });
    }, 4000);
    return () => {
      current.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!freshUntil) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, freshUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [freshUntil]);
  const fresh = now < freshUntil,
    approval = draft?.approval,
    validApproval =
      approval && !approval.invalidatedAt && !approval.deliveredMessageId;
  return (
    <div className="w5-approval">
      {error && (
        <div role="alert">
          <Notice tone="error" title="Draft status">
            {error}
          </Notice>
        </div>
      )}
      <p className="qv-help">
        Review an AI answer from this conversation. Any saved edit needs a new
        personal approval.
      </p>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        Refresh draft status
      </button>
      {!draft ? (
        <>
          {sources?.items.map((source) => (
            <article className="w5-card" key={source.id}>
              <Message kind="ai" name={creator.display_name} actions={false}>
                {source.text}
              </Message>
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const validUntil = Date.now() + 5000;
                    const value = await request<Draft>("drafts", {
                      sourceMessageId: source.id,
                      sourceMessageVersion: source.version,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (!current.current) return;
                    accept(value, validUntil);
                    try {
                      sessionStorage.setItem(reference, value.id);
                    } catch {
                      /* Continue with the current in-memory draft. */
                    }
                  })
                }
              >
                Prepare this answer for review
              </button>
            </article>
          ))}
          {sources?.items.length === 0 && (
            <p>
              No completed AI answer is available in this conversation. You can
              send a personal reply from the audited thread.
            </p>
          )}
          {sources?.nextSequence && (
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const next = await request<Sources>(
                    `drafts/sources?beforeSequence=${sources.nextSequence}`,
                  );
                  if (current.current)
                    setSources((value) => ({
                      items: [...(value?.items ?? []), ...next.items],
                      nextSequence: next.nextSequence,
                    }));
                })
              }
            >
              Load earlier answers
            </button>
          )}
        </>
      ) : (
        <>
          <p className="qv-meta">Saved draft · revision {draft.version}</p>
          <label className="w5-field">
            Exact reply
            <textarea
              rows={6}
              maxLength={8000}
              value={text}
              disabled={busy || Boolean(approval?.deliveredMessageId)}
              onChange={(event) => {
                setText(event.target.value);
                setDirty(true);
                edited.current = true;
                setReview(false);
              }}
            />
          </label>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={
              busy ||
              !fresh ||
              conflict ||
              !dirty ||
              !text.trim() ||
              Boolean(approval?.deliveredMessageId)
            }
            onClick={() =>
              void run(async () => {
                const validUntil = Date.now() + 5000;
                const value = await request<Draft>(`drafts/${draft.id}/edit`, {
                  version: draft.version,
                  text,
                  idempotencyKey: crypto.randomUUID(),
                });
                edited.current = false;
                setDirty(false);
                setReview(false);
                accept(value, validUntil);
              })
            }
          >
            Save exact revision
          </button>
          {conflict && (
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy}
              onClick={() => {
                setText(draft.text);
                edited.current = false;
                setDirty(false);
                setConflict(false);
                setReview(false);
                setError("");
              }}
            >
              Use current saved revision
            </button>
          )}
          {dirty && (
            <p className="qv-help">
              Save your changes before reviewing or sending. A saved change
              invalidates an unsent approval.
            </p>
          )}
          {approval?.invalidatedAt && (
            <p role="status">
              This approval is no longer valid. Review and sign the current
              saved revision.
            </p>
          )}
          {approval?.deliveredMessageId ? (
            <Notice title="Approved reply delivered">
              The conversation retains the exact personally approved message.
            </Notice>
          ) : (
            <>
              <button
                className="qv-btn qv-btn--maya"
                disabled={
                  busy ||
                  dirty ||
                  !fresh ||
                  !creator.owned ||
                  Boolean(validApproval)
                }
                onClick={() =>
                  void run(async () => {
                    const validUntil = Date.now() + 5000;
                    const value = await request<Draft>(`drafts/${draft.id}`);
                    accept(value, validUntil);
                    setReview(true);
                  })
                }
              >
                Review personal approval
              </button>
              {review && fresh && !dirty && (
                <SignedActReview
                  key={`${draft.id}:${draft.version}`}
                  creatorId={creator.id}
                  fanId={fanId}
                  creatorName={creator.display_name}
                  approvedDraft
                  command={commerceApprovalContracts.replyDraftApprovalCommand(
                    draft,
                  )}
                  text={draft.text}
                  title="Approve this exact reply"
                  rows={[
                    ["Draft revision", String(draft.version)],
                    [
                      "Fan sees",
                      `${creator.display_name} · personally approved AI draft`,
                    ],
                  ]}
                  onSigned={async (signedActId) => {
                    await request(`drafts/${draft.id}/approve`, {
                      version: draft.version,
                      signedActId,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    setReview(false);
                    await refresh();
                  }}
                />
              )}
              {validApproval && deliveryAllowed && (
                <>
                  <p className="qv-help">
                    This exact saved revision has your personal approval.
                    Sending requires you to hold the conversation.
                  </p>
                  <button
                    className="qv-btn qv-btn--maya"
                    disabled={busy || dirty || !fresh || !creator.owned}
                    onClick={() =>
                      void run(async () => {
                        await request("deliver", {
                          approvalId: approval.id,
                          idempotencyKey: crypto.randomUUID(),
                        });
                        await refresh();
                        await onDelivered();
                      })
                    }
                  >
                    Send personally approved reply
                  </button>
                </>
              )}
              {validApproval && !deliveryAllowed && onReady && (
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={busy || dirty || !fresh || !creator.owned}
                  onClick={() => void run(onReady)}
                >
                  Review request acceptance
                </button>
              )}
            </>
          )}
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy || review}
            onClick={() =>
              void run(async () => {
                try {
                  sessionStorage.removeItem(reference);
                } catch {
                  /* The in-memory reference is cleared below. */
                }
                revision.current = null;
                edited.current = false;
                setDirty(false);
                setConflict(false);
                setDraft(null);
                setText("");
                setFreshUntil(0);
                await refresh();
              })
            }
          >
            Choose another AI answer
          </button>
        </>
      )}
    </div>
  );
}
