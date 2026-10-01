"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IdSchema, MessageSchema } from "@qelvora/api";
import { LabelPreview, Notice } from "@qelvora/ui-web";
import {
  replyDraftApprovalCommand,
  type ReplyDraft,
} from "../../../../packages/api/src/commerce/approval";
import { SignedActReview } from "../identity/signing";
import { StudioFailure, studioRequest } from "./api";

// Validate the owner's current projection before showing approval or delivery.
type SourcePage = {
  items: { id: string; version: number; text: string; sequence: number }[];
  nextSequence: number | null;
};
const positive = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
function readDraft(value: unknown): ReplyDraft {
  if (!value || typeof value !== "object")
    throw new Error("The draft response is incomplete.");
  const draft = value as ReplyDraft;
  if (
    ![draft.id, draft.threadId, draft.sourceMessageId].every(
      (id) => IdSchema.safeParse(id).success,
    ) ||
    !positive(draft.version) ||
    !positive(draft.sourceMessageVersion) ||
    typeof draft.text !== "string" ||
    draft.text.length > 8000
  )
    throw new Error("The draft response is incomplete.");
  const approval = draft.approval;
  if (
    approval !== null &&
    (!approval ||
      !IdSchema.safeParse(approval.id).success ||
      typeof approval.approvedAt !== "string" ||
      (approval.invalidatedAt !== null &&
        typeof approval.invalidatedAt !== "string") ||
      (approval.deliveredMessageId !== null &&
        !IdSchema.safeParse(approval.deliveredMessageId).success))
  )
    throw new Error("The current approval response is incomplete.");
  return draft;
}
function readSources(value: unknown): SourcePage {
  if (!value || typeof value !== "object")
    throw new Error("The AI-prepared replies are unavailable.");
  const page = value as SourcePage;
  if (
    !Array.isArray(page.items) ||
    page.items.length > 20 ||
    (page.nextSequence !== null && !positive(page.nextSequence)) ||
    page.items.some(
      (item) =>
        !item ||
        !IdSchema.safeParse(item.id).success ||
        !positive(item.version) ||
        !positive(item.sequence) ||
        typeof item.text !== "string" ||
        item.text.length > 8000,
    )
  )
    throw new Error("The AI-prepared replies are unavailable.");
  return page;
}

/** W4 creates drafts only from actual durable AI messages. W5 owns this editor;
 * W1 signs its exact command and W3/W4 own the approval and delivered message. */
export function ApprovedReply({
  creator,
  fanId,
  deliveryAllowed,
  deliveryHelp,
  onDelivered,
}: {
  creator: {
    id: string;
    display_name: string;
    owned: boolean;
    viewerAccountId: string;
  };
  fanId: string;
  deliveryAllowed: boolean;
  deliveryHelp: string;
  onDelivered(): Promise<void>;
}) {
  const root = `creators/${creator.id}/fans/${fanId}`;
  const pointerKey = `w5.approval:${creator.viewerAccountId}:${creator.id}:${fanId}`;
  const [sources, setSources] = useState<SourcePage | null>(null),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<ReplyDraft | null>(null),
    [text, setText] = useState(""),
    [dirty, setDirty] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState(false),
    [error, setError] = useState("");
  const pointer = useRef<string | null>(null),
    mounted = useRef(false),
    editing = useRef(false),
    pending = useRef(false),
    refreshing = useRef(false),
    lastCheck = useRef(0),
    generation = useRef(0),
    beforeSequence = useRef<number | null>(null),
    approvalRetry = useRef<{
      draftId: string;
      version: number;
      signedActId: string;
      idempotencyKey: string;
    } | null>(null),
    deliveryRetry = useRef<{
      approvalId: string;
      idempotencyKey: string;
    } | null>(null);
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
  const accept = useCallback(
    (value: unknown, replaceText = false) => {
      const saved = readDraft(value);
      pointer.current = saved.id;
      try {
        sessionStorage.setItem(pointerKey, saved.id);
      } catch {
        /* Reference persistence is optional. */
      }
      setDraft(saved);
      if (replaceText || !editing.current) setText(saved.text);
      if (replaceText) {
        editing.current = false;
        setDirty(false);
      }
      lastCheck.current = Date.now();
      setCurrent(true);
      return saved;
    },
    [pointerKey],
  );
  const failure = useCallback((value: unknown) => {
    if (!mounted.current) return;
    setCurrent(false);
    setReview(false);
    if (
      value instanceof StudioFailure &&
      [401, 403, 404, 409].includes(value.status)
    ) {
      setSources(null);
      if (
        [401, 403].includes(value.status) ||
        value.code === "session_account_changed" ||
        value.code === "session_changed"
      ) {
        setDraft(null);
        setText("");
        editing.current = false;
        setDirty(false);
      }
    }
    setError(
      value instanceof Error
        ? value.message
        : "Exact draft approval is unavailable.",
    );
  }, []);
  const refresh = useCallback(async () => {
    if (refreshing.current || pending.current) return;
    refreshing.current = true;
    const revision = generation.current;
    try {
      if (pointer.current) {
        const value = await request(`drafts/${pointer.current}`);
        if (mounted.current && revision === generation.current) accept(value);
      } else {
        const value = readSources(
          await request(
            `drafts/sources${beforeSequence.current ? `?beforeSequence=${beforeSequence.current}` : ""}`,
          ),
        );
        if (mounted.current && revision === generation.current) {
          setSources(value);
          lastCheck.current = Date.now();
          setCurrent(true);
        }
      }
      if (mounted.current && revision === generation.current) setError("");
    } catch (value) {
      if (revision === generation.current) failure(value);
    } finally {
      refreshing.current = false;
    }
  }, [request, accept, failure]);
  useEffect(() => {
    mounted.current = true;
    try {
      const saved = IdSchema.safeParse(sessionStorage.getItem(pointerKey));
      pointer.current = saved.success ? saved.data : null;
    } catch {
      pointer.current = null;
    }
    void refresh();
    const polling = setInterval(() => void refresh(), 4000);
    const expiry = setInterval(() => {
      if (Date.now() - lastCheck.current >= 5000) {
        setCurrent(false);
        setReview(false);
      }
    }, 500);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(polling);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
    };
  }, [pointerKey, refresh]);
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return;
    generation.current++;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (value) {
      failure(value);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const recordApproval = async () => {
    const command = approvalRetry.current;
    if (!command) return;
    await request(`drafts/${command.draftId}/approve`, {
      version: command.version,
      signedActId: command.signedActId,
      idempotencyKey: command.idempotencyKey,
    });
    const value = await request(`drafts/${command.draftId}`);
    if (mounted.current) {
      accept(value, true);
      approvalRetry.current = null;
      setReview(false);
      setError("");
    }
  };
  const deliver = async () => {
    const approval = draft?.approval;
    if (!deliveryRetry.current) {
      if (!approval || approval.invalidatedAt || approval.deliveredMessageId)
        throw new Error("Refresh the current approval before sending.");
      deliveryRetry.current = {
        approvalId: approval.id,
        idempotencyKey: crypto.randomUUID(),
      };
    }
    MessageSchema.pick({
      id: true,
      threadId: true,
      authorKind: true,
      deliveryState: true,
      signedActId: true,
    })
      .refine(
        (message) =>
          message.threadId === draft?.threadId &&
          message.authorKind === "approved_draft" &&
          message.deliveryState === "delivered" &&
          !!message.signedActId,
      )
      .parse(await request("deliver", deliveryRetry.current));
    const value = await request(`drafts/${pointer.current}`);
    if (mounted.current) {
      accept(value, true);
      deliveryRetry.current = null;
      await onDelivered();
    }
  };
  return (
    <section aria-label="Exact approved draft">
      <p className="qv-help">
        Choose an AI-prepared reply, edit its exact words, then personally
        approve the saved version. Every edit needs a new approval.
      </p>
      {error && (
        <Notice tone="error" title="Draft approval unavailable">
          {error}
        </Notice>
      )}
      {!current && (
        <p role="status">
          Checking current draft authority. Your input stays here during a
          connection interruption.
        </p>
      )}
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh current draft
      </button>
      <div hidden={!current} inert={!current}>
        {!draft && sources && current && (
          <>
            {sources.items.length === 0 ? (
              <p>
                No durable AI-prepared replies are available in this
                conversation.
              </p>
            ) : (
              <fieldset>
                <legend>AI-prepared replies</legend>
                {sources.items.map((item) => (
                  <label className="w5-field" key={item.id}>
                    <span>
                      <input
                        type="radio"
                        name="approval-source"
                        checked={selected === item.id}
                        onChange={() => setSelected(item.id)}
                      />{" "}
                      Reply · revision {item.version}
                    </span>
                    <span>{item.text}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {sources.nextSequence && (
              <button
                className="qv-btn qv-btn--quiet"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    beforeSequence.current = sources.nextSequence;
                    const page = readSources(
                      await request(
                        `drafts/sources?beforeSequence=${sources.nextSequence}`,
                      ),
                    );
                    if (mounted.current) {
                      setSources(page);
                      setSelected("");
                      lastCheck.current = Date.now();
                      setCurrent(true);
                    }
                  })
                }
              >
                Earlier AI-prepared replies
              </button>
            )}
            {beforeSequence.current && (
              <button
                className="qv-btn qv-btn--quiet"
                disabled={busy}
                onClick={() => {
                  beforeSequence.current = null;
                  setSelected("");
                  void refresh();
                }}
              >
                Newest AI-prepared replies
              </button>
            )}
            <button
              className="qv-btn qv-btn--secondary"
              disabled={!selected || busy || !current}
              onClick={() =>
                void run(async () => {
                  const source = sources.items.find(
                    (item) => item.id === selected,
                  );
                  if (!source)
                    throw new Error("Choose a current AI-prepared reply.");
                  const value = await request("drafts", {
                    sourceMessageId: source.id,
                    sourceMessageVersion: source.version,
                    idempotencyKey: crypto.randomUUID(),
                  });
                  if (mounted.current) accept(value, true);
                })
              }
            >
              Create editable draft
            </button>
          </>
        )}
        {draft && (
          <>
            <LabelPreview kind="approved_draft" name={creator.display_name} />
            <p className="qv-meta">
              SAVED REVISION {draft.version}
              {dirty ? " · UNSAVED CHANGES" : ""}
            </p>
            <label className="w5-field">
              Exact reply text
              <textarea
                rows={6}
                maxLength={8000}
                value={text}
                disabled={
                  busy ||
                  !current ||
                  !!approvalRetry.current ||
                  !!deliveryRetry.current
                }
                onChange={(event) => {
                  editing.current = true;
                  setDirty(true);
                  setText(event.target.value);
                  setReview(false);
                }}
              />
            </label>
            {dirty && (
              <p>Save these changes before reviewing a new approval.</p>
            )}
            <div className="w5-actions">
              <button
                className="qv-btn qv-btn--secondary"
                disabled={
                  busy ||
                  !current ||
                  !dirty ||
                  !text.trim() ||
                  !!approvalRetry.current ||
                  !!deliveryRetry.current
                }
                onClick={() =>
                  void run(async () => {
                    const value = await request(`drafts/${draft.id}/edit`, {
                      version: draft.version,
                      text,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (mounted.current) {
                      accept(value, true);
                      setReview(false);
                    }
                  })
                }
              >
                Save edited draft
              </button>
              <button
                className="qv-btn qv-btn--quiet"
                disabled={
                  busy ||
                  !current ||
                  !dirty ||
                  !!approvalRetry.current ||
                  !!deliveryRetry.current
                }
                onClick={() => {
                  setText(draft.text);
                  editing.current = false;
                  setDirty(false);
                  setReview(false);
                }}
              >
                Discard unsaved changes
              </button>
              <button
                className="qv-btn qv-btn--maya"
                disabled={
                  !creator.owned ||
                  busy ||
                  !current ||
                  dirty ||
                  !text.trim() ||
                  !!draft.approval?.deliveredMessageId ||
                  !!approvalRetry.current ||
                  !!deliveryRetry.current
                }
                onClick={() => setReview(true)}
              >
                Review exact approval
              </button>
            </div>
            {!creator.owned && (
              <p>
                Only the creator can personally approve and send this draft.
              </p>
            )}
            {draft.approval?.invalidatedAt && (
              <p role="status">
                The saved approval is invalid. Review and sign the current
                version again.
              </p>
            )}
            {draft.approval?.deliveredMessageId ? (
              <p role="status">
                Delivered approved reply · {draft.approval.deliveredMessageId}
              </p>
            ) : (
              <>
                {!deliveryAllowed && <p>{deliveryHelp}</p>}
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={
                    !creator.owned ||
                    busy ||
                    !current ||
                    dirty ||
                    !deliveryAllowed ||
                    !draft.approval ||
                    !!draft.approval.invalidatedAt ||
                    !!approvalRetry.current
                  }
                  onClick={() => void run(deliver)}
                >
                  {deliveryRetry.current
                    ? "Retry this delivery"
                    : "Send approved reply"}
                </button>
              </>
            )}
            {approvalRetry.current && (
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy}
                onClick={() => void run(recordApproval)}
              >
                Retry this signed approval
              </button>
            )}
            {review && current && !dirty && (
              <SignedActReview
                creatorId={creator.id}
                fanId={fanId}
                creatorName={creator.display_name}
                approvedDraft
                command={replyDraftApprovalCommand(draft)}
                text={draft.text}
                title="Approve these exact words"
                rows={[
                  ["Saved version", String(draft.version)],
                  ["Fan sees", `${creator.display_name} approved this draft`],
                ]}
                onSigned={async (signedActId) => {
                  generation.current++;
                  pending.current = true;
                  setBusy(true);
                  approvalRetry.current = {
                    draftId: draft.id,
                    version: draft.version,
                    signedActId,
                    idempotencyKey: crypto.randomUUID(),
                  };
                  try {
                    await recordApproval();
                  } catch (value) {
                    failure(value);
                    throw value;
                  } finally {
                    pending.current = false;
                    if (mounted.current) setBusy(false);
                  }
                }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
