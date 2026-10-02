"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy, formatCopy } from "@qelvora/copy";
import {
  AuthorLabel,
  EmptyState,
  Note,
  Notice,
  ReactionChip,
} from "@qelvora/ui-web";
import type {
  ContentView,
  PrivateNoteReply,
  NoteReplyPolicy,
} from "../../../../packages/api/src/content";
import { NoteReplyPolicy as NoteReplyPolicySchema } from "../../../../packages/api/src/content";
import {
  configureStudioRequests,
  studioRequest,
  StudioFailure,
} from "../studio/api";
import { ContentAttachments } from "./MediaAttachments";
import "../studio/studio.css";
import { useIdentityRequest } from "../identity/session-boundary";
type Thanks = {
  version: number;
  text: string;
  shareWithCreatorDigest: boolean;
  showIdentity: boolean;
  withdrawn: boolean;
};
type ReplyPage = { items: PrivateNoteReply[]; nextCursor: string | null };
const accountChanged = (failure: unknown) =>
  failure instanceof StudioFailure &&
  [
    "content_account_changed",
    "session_account_changed",
    "session_changed",
  ].includes(failure.code);
export function FanContent({
  creatorId,
  contentId,
}: {
  creatorId: string;
  contentId: string;
}) {
  const { session, signal } = useIdentityRequest();
  useEffect(
    () => configureStudioRequests({ accountId: session.accountId, signal }),
    [session.accountId, signal],
  );
  const [content, setContent] = useState<ContentView | null>(null),
    [current, setCurrent] = useState(false),
    [signInRequired, setSignInRequired] = useState(false),
    [replies, setReplies] = useState<PrivateNoteReply[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [muted, setMuted] = useState(false);
  const [replyPolicy, setReplyPolicy] = useState<NoteReplyPolicy | null>(null);
  const [thanks, setThanks] = useState<Thanks | null>(null),
    [thanksText, setThanksText] = useState(""),
    [share, setShare] = useState(false),
    [identity, setIdentity] = useState(false),
    [viewer, setViewer] = useState<string | null>(null);
  const dirtyThanks = useRef(false),
    loading = useRef(0),
    reading = useRef(false),
    checkedAt = useRef(0),
    busyRef = useRef(false),
    depth = useRef(1);
  const resetInputs = useCallback(() => {
    setReplyPolicy(null);
    setText("");
    setThanksText("");
    setShare(false);
    setIdentity(false);
    dirtyThanks.current = false;
  }, []);
  const observedViewer = useRef<string | null>(null);
  const load = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    try {
      const cycleStartedAt = Date.now();
      const generation = ++loading.current;
      let before: { accountId: string; muted: boolean };
      try {
        before = await studioRequest("content", `${creatorId}/mute`);
      } catch (failure) {
        if (generation === loading.current) {
          setCurrent(false);
          setSignInRequired(
            failure instanceof StudioFailure && failure.status === 401,
          );
          if (
            failure instanceof StudioFailure &&
            ([401, 403].includes(failure.status) || accountChanged(failure))
          ) {
            setContent(null);
            setReplies([]);
            setThanks(null);
            setViewer(null);
            setCursor(null);
            resetInputs();
          }
          setError((failure as Error).message);
        }
        return;
      }

      const results = await Promise.allSettled([
        studioRequest<ContentView>(
          "content",
          `${creatorId}/${contentId}`,
          undefined,
          before.accountId,
        ),
        studioRequest<Thanks | null>(
          "content",
          `${creatorId}/thanks?targetKind=content&targetId=${contentId}`,
          undefined,
          before.accountId,
        ),
        (async () => {
          let page: ReplyPage = await studioRequest(
            "content",
            `${creatorId}/replies`,
            undefined,
            before.accountId,
          );
          const items = [...page.items];
          for (let n = 1; n < depth.current && page.nextCursor; n++) {
            page = await studioRequest(
              "content",
              `${creatorId}/replies?cursor=${page.nextCursor}`,
              undefined,
              before.accountId,
            );
            items.push(...page.items);
          }
          return { ...page, items };
        })(),
        Promise.resolve(before),
        (async () =>
          NoteReplyPolicySchema.parse(
            await studioRequest(
              "content",
              `${creatorId}/reply-policy`,
              undefined,
              before.accountId,
            ),
          ))(),
      ]);
      try {
        results[3] = {
          status: "fulfilled",
          value: await studioRequest(
            "content",
            `${creatorId}/mute`,
            undefined,
            before.accountId,
          ),
        };
      } catch (reason) {
        results[3] = { status: "rejected", reason };
      }
      if (generation !== loading.current) return;
      if (
        results.some(
          (r, i) =>
            r.status === "rejected" &&
            r.reason instanceof StudioFailure &&
            (r.reason.status === 401 ||
              accountChanged(r.reason) ||
              (i > 0 && r.reason.status === 403)),
        )
      ) {
        setCurrent(false);
        setSignInRequired(
          results.some(
            (r) =>
              r.status === "rejected" &&
              r.reason instanceof StudioFailure &&
              r.reason.status === 401,
          ),
        );
        setContent(null);
        setReplies([]);
        setThanks(null);
        setViewer(null);
        setCursor(null);
        setText("");
        setThanksText("");
        setShare(false);
        setIdentity(false);
        dirtyThanks.current = false;
        setError(
          "Your session or current access changed. Check current access before continuing.",
        );
        return;
      }

      const [view, mine, page, pref] = results;
      setSignInRequired(false);
      if (pref.status !== "fulfilled") {
        setCurrent(false);
        setError("Current access could not be confirmed. Your input is kept.");
        return;
      }
      if (before.accountId !== pref.value.accountId) {
        setCurrent(false);
        setContent(null);
        setReplies([]);
        setThanks(null);
        setViewer(null);
        resetInputs();
        setError("The signed-in account changed. Refresh before continuing.");
        return;
      }
      if (observedViewer.current !== before.accountId) {
        resetInputs();
        depth.current = 1;
        observedViewer.current = before.accountId;
      }
      setViewer(before.accountId);
      setContent(view.status === "fulfilled" ? view.value : null);
      if (mine.status === "fulfilled") {
        setThanks(mine.value);
        if (!dirtyThanks.current) {
          setThanksText(mine.value?.text ?? "");
          setShare(mine.value?.shareWithCreatorDigest ?? false);
          setIdentity(mine.value?.showIdentity ?? false);
        }
      } else setThanks(null);
      if (page.status === "fulfilled") {
        setReplies(page.value.items);
        setCursor(page.value.nextCursor);
      } else {
        setReplies([]);
        setCursor(null);
      }
      if (pref.status === "fulfilled") setMuted(pref.value.muted);
      const policy = results[4];
      if (
        policy.status === "fulfilled" &&
        policy.value.accountId === before.accountId &&
        policy.value.creatorId === creatorId
      )
        setReplyPolicy(policy.value);
      else setReplyPolicy(null);
      const failure = results.find((r) => r.status === "rejected");
      setError(failure?.status === "rejected" ? failure.reason.message : "");
      checkedAt.current = cycleStartedAt;
      setCurrent(Date.now() - cycleStartedAt < 5000);
    } finally {
      reading.current = false;
    }
  }, [creatorId, contentId, resetInputs]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!busyRef.current) void load();
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 4000);
    const expiry = setInterval(() => {
      if (Date.now() - checkedAt.current >= 5000) setCurrent(false);
    }, 500);
    return () => {
      ++loading.current;
      clearInterval(timer);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const act = async (operation: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    ++loading.current;
    setBusy(true);
    setError("");
    try {
      await operation();
      await load();
    } catch (failure) {
      setError((failure as Error).message);
      setSignInRequired(
        failure instanceof StudioFailure && failure.status === 401,
      );
      if (
        failure instanceof StudioFailure &&
        ([401, 403].includes(failure.status) || accountChanged(failure))
      ) {
        setCurrent(false);
        setContent(null);
        setReplies([]);
        setThanks(null);
        setViewer(null);
        setCursor(null);
        resetInputs();
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const contentMutation = <T,>(path: string, body: unknown) => {
    if (!viewer)
      throw new Error("Refresh your current account before sending.");
    return studioRequest<T>("content", path, body, viewer);
  };
  const consent = (
    reply: PrivateNoteReply,
    shareText: boolean,
    showHandle: boolean,
  ) =>
    act(() =>
      contentMutation(`${creatorId}/replies/${reply.id}/consent`, {
        version: reply.consent.version,
        shareText,
        showHandle,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
  const saveThanks = (withdrawn = false) =>
    act(async () => {
      await contentMutation(`${creatorId}/thanks`, {
        targetKind: "content",
        targetId: contentId,
        text: withdrawn ? "" : thanksText,
        shareWithCreatorDigest: !withdrawn && share,
        showIdentity: !withdrawn && identity,
        withdrawn,
        expectedVersion: thanks?.version ?? 0,
        idempotencyKey: crypto.randomUUID(),
      });
      dirtyThanks.current = false;
    });
  const ownReplies = replies.filter((r) => r.contentId === contentId);
  const replyLimit = replyPolicy?.limit ?? 4000;
  return (
    <main className="w5-fan" aria-busy={busy}>
      <nav>
        <Link href="/home">Home</Link>
        <Link href="/you">Your account</Link>
      </nav>
      {error && (
        <Notice tone="error" title="Content status">
          {error}
        </Notice>
      )}
      {!current && (
        <p role="status">
          Checking current access. Your input stays in this tab during a
          connection interruption.
        </p>
      )}
      {!current && (
        <button disabled={busy} onClick={() => void load()}>
          Check current access
        </button>
      )}
      {!current && signInRequired && (
        <Link
          href={`/auth/continue?returnTo=${encodeURIComponent(`/content/${creatorId}/${contentId}`)}`}
        >
          Continue with Pantopus
        </Link>
      )}
      <div hidden={!current} inert={!current}>
        {!content ? (
          <EmptyState
            title="Content unavailable"
            body="Refresh current access. Your own sharing and withdrawal controls remain below."
            action={<button onClick={() => void load()}>Refresh</button>}
          />
        ) : (
          <>
            {content.document.kind === "note" ? (
              <Note
                name={content.creatorName}
                audience={content.audienceLabel}
                time={
                  content.publishedAt
                    ? new Date(content.publishedAt).toLocaleString()
                    : ""
                }
                signedActId={content.signedActId ?? undefined}
                reply={false}
              >
                {content.displayText}
              </Note>
            ) : (
              <article className="w5-paper">
                <AuthorLabel
                  kind={content.authorKind}
                  name={content.creatorName}
                  member={content.teamMember ?? undefined}
                />
                {content.signedActId && (
                  <Link href={`/verify/${content.signedActId}`}>Signed</Link>
                )}
                <h1>
                  {content.document.title || "From " + content.creatorName}
                </h1>
                {content.quotedText && (
                  <blockquote>
                    <p>{content.quotedText}</p>
                    {content.quotedHandle && (
                      <cite>@{content.quotedHandle}</cite>
                    )}
                  </blockquote>
                )}
                <p className="w5-content-text">{content.displayText}</p>
                <p>{content.audienceLabel}</p>
              </article>
            )}
            {content.audienceCount != null && (
              <p className="qv-help">Audience size · {content.audienceCount}</p>
            )}
            {content.displayText !== content.document.text && (
              <details>
                <summary>
                  {content.signedActId ? "Signed original" : "Original text"}
                </summary>
                <p className="w5-content-text">{content.document.text}</p>
              </details>
            )}
            {content.document.live && (
              <p>
                {content.document.kind === "replay" ? "Replay" : "Live session"}{" "}
                · {new Date(content.document.live.startsAt).toLocaleString()} —{" "}
                {new Date(content.document.live.endsAt).toLocaleString()}
              </p>
            )}
            {content.document.media.length > 0 && viewer && (
              <ContentAttachments
                key={`${viewer}:${content.id}:${content.version}`}
                content={content}
                active={current}
                expectedAccountId={viewer}
              />
            )}
          </>
        )}
        {(content?.document.kind === "note" || ownReplies.length > 0) && (
          <section aria-labelledby="private-replies">
            <h2 id="private-replies">Your private replies</h2>
            <p>
              Only you, the creator, and their permitted team can read your
              replies. A Note is a broadcast.
            </p>
            {content?.document.kind === "note" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await contentMutation(`${creatorId}/${contentId}/replies`, {
                      text,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    setText("");
                  });
                }}
              >
                <label htmlFor="private-reply">Reply privately</label>
                {replyPolicy?.milestone !== null &&
                  replyPolicy?.confirmedDays != null && (
                    <p className="qv-help">
                      {formatCopy("contentConfirmedTenure", {
                        days: replyPolicy.confirmedDays,
                      })}
                    </p>
                  )}
                {!replyPolicy && (
                  <p className="qv-help">
                    {copy.contentReplyPolicyUnavailable}
                  </p>
                )}
                <textarea
                  id="private-reply"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={replyLimit}
                  aria-describedby="private-reply-limit"
                  required
                />
                <p id="private-reply-limit" className="qv-help">
                  {formatCopy("contentReplyLimit", {
                    used: text.length,
                    limit: replyLimit,
                  })}
                </p>
                {text.length > replyLimit && (
                  <p role="status">{copy.contentReplyOverLimit}</p>
                )}
                <button
                  disabled={
                    busy || !text.trim() || text.trim().length > replyLimit
                  }
                >
                  Send private reply
                </button>
              </form>
            )}
            {ownReplies.map((reply) => (
              <article key={reply.id} className="w5-paper">
                <p className="w5-content-text">{reply.text}</p>
                <small>{new Date(reply.createdAt).toLocaleString()}</small>
                {reply.safetyState !== "allowed" && (
                  <p role="status">
                    {reply.safetyState === "flagged"
                      ? "This reply is withheld for safety review."
                      : "Waiting for safety review. It has not reached the creator’s feed."}
                  </p>
                )}
                {reply.safetyState === "pending" &&
                  reply.safetyReviewAvailable && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await contentMutation(
                            `${creatorId}/replies/${reply.id}/review`,
                            {
                              version: reply.version,
                              idempotencyKey: crypto.randomUUID(),
                            },
                          );
                          await load();
                        })
                      }
                    >
                      Retry safety review
                    </button>
                  )}
                {reply.reaction && (
                  <ReactionChip
                    name={content?.creatorName ?? "The creator"}
                    signedActId={reply.reaction.signedActId}
                  />
                )}
                <label>
                  <input
                    type="checkbox"
                    disabled={busy || !content}
                    checked={reply.consent.shareText}
                    onChange={(e) =>
                      void consent(
                        reply,
                        e.target.checked,
                        e.target.checked && reply.consent.showHandle,
                      )
                    }
                  />
                  Allow this reply to be quoted
                </label>
                <label>
                  <input
                    type="checkbox"
                    disabled={busy || !content || !reply.consent.shareText}
                    checked={reply.consent.showHandle}
                    onChange={(e) =>
                      void consent(reply, true, e.target.checked)
                    }
                  />
                  Show my handle on the quote
                </label>
                <p>Changing either permission invalidates an earlier quote.</p>
                {(reply.consent.shareText || reply.consent.showHandle) && (
                  <button
                    disabled={busy}
                    onClick={() => void consent(reply, false, false)}
                  >
                    Withdraw quote permission
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(() =>
                      contentMutation(
                        `${creatorId}/replies/${reply.id}/withdraw`,
                        {
                          version: reply.version,
                          idempotencyKey: crypto.randomUUID(),
                        },
                      ),
                    )
                  }
                >
                  Withdraw private reply
                </button>
              </article>
            ))}
          </section>
        )}
        {cursor && (
          <button
            disabled={busy || depth.current >= 5}
            onClick={() =>
              void act(async () => {
                depth.current++;
              })
            }
          >
            Older private replies
          </button>
        )}
        <button
          disabled={busy}
          onClick={() =>
            void act(() =>
              contentMutation(`${creatorId}/mute`, { muted: !muted }),
            )
          }
        >
          {muted
            ? "Unmute Notes from this creator"
            : "Mute Notes from this creator"}
        </button>
        {(content || thanks) && (
          <section aria-labelledby="thanks-heading">
            <h2 id="thanks-heading">This helped</h2>
            <p>
              Thanks is optional. Sharing text with the creator’s digest and
              displaying your handle are separate choices.
            </p>
            {content && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveThanks();
                }}
              >
                <label htmlFor="thanks-text">Thanks · optional</label>
                <textarea
                  id="thanks-text"
                  maxLength={2000}
                  value={thanksText}
                  onChange={(e) => {
                    dirtyThanks.current = true;
                    setThanksText(e.target.value);
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(e) => {
                      dirtyThanks.current = true;
                      setShare(e.target.checked);
                      if (!e.target.checked) setIdentity(false);
                    }}
                  />
                  Share this text with the creator’s digest
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={identity}
                    disabled={!share}
                    onChange={(e) => {
                      dirtyThanks.current = true;
                      setIdentity(e.target.checked);
                    }}
                  />
                  Include my handle
                </label>
                <button disabled={busy}>
                  {thanks && !thanks.withdrawn
                    ? "Update Thanks"
                    : "This helped"}
                </button>
              </form>
            )}
            {thanks && !thanks.withdrawn && (
              <button disabled={busy} onClick={() => void saveThanks(true)}>
                Withdraw Thanks
              </button>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
