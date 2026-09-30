"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
} from "../../../../packages/api/src/content";
import { studioRequest, StudioFailure } from "../studio/api";
import "../studio/studio.css";
type Thanks = {
  version: number;
  text: string;
  shareWithCreatorDigest: boolean;
  showIdentity: boolean;
  withdrawn: boolean;
};
type ReplyPage = { items: PrivateNoteReply[]; nextCursor: string | null };
export function FanContent({
  creatorId,
  contentId,
}: {
  creatorId: string;
  contentId: string;
}) {
  const [content, setContent] = useState<ContentView | null>(null),
    [replies, setReplies] = useState<PrivateNoteReply[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [muted, setMuted] = useState(false);
  const [thanks, setThanks] = useState<Thanks | null>(null),
    [thanksText, setThanksText] = useState(""),
    [share, setShare] = useState(false),
    [identity, setIdentity] = useState(false);
  const dirtyThanks = useRef(false),
    loading = useRef(0),
    busyRef = useRef(false),
    depth = useRef(1);
  const load = useCallback(async () => {
    const generation = ++loading.current;
    const results = await Promise.allSettled([
      studioRequest<ContentView>("content", `${creatorId}/${contentId}`),
      studioRequest<Thanks | null>(
        "content",
        `${creatorId}/thanks?targetKind=content&targetId=${contentId}`,
      ),
      (async () => {
        let page: ReplyPage = await studioRequest(
          "content",
          `${creatorId}/replies`,
        );
        const items = [...page.items];
        for (let n = 1; n < depth.current && page.nextCursor; n++) {
          page = await studioRequest(
            "content",
            `${creatorId}/replies?cursor=${page.nextCursor}`,
          );
          items.push(...page.items);
        }
        return { ...page, items };
      })(),
      studioRequest<{ muted: boolean }>("content", `${creatorId}/mute`),
    ]);
    if (generation !== loading.current) return;
    if (
      results.some(
        (r, i) =>
          r.status === "rejected" &&
          r.reason instanceof StudioFailure &&
          (r.reason.status === 401 || (i > 0 && r.reason.status === 403)),
      )
    ) {
      setContent(null);
      setReplies([]);
      setThanks(null);
      setText("");
      setThanksText("");
      setShare(false);
      setIdentity(false);
      dirtyThanks.current = false;
      setError(
        "Your session or current access changed. Sign in again to refresh.",
      );
      return;
    }

    const [view, mine, page, pref] = results;
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
    const failure = results.find((r) => r.status === "rejected");
    setError(failure?.status === "rejected" ? failure.reason.message : "");
  }, [creatorId, contentId]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!busyRef.current) void load();
    };
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 4000);
    return () => {
      ++loading.current;
      clearInterval(timer);
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
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const consent = (
    reply: PrivateNoteReply,
    shareText: boolean,
    showHandle: boolean,
  ) =>
    act(() =>
      studioRequest("content", `${creatorId}/replies/${reply.id}/consent`, {
        version: reply.consent.version,
        shareText,
        showHandle,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
  const saveThanks = (withdrawn = false) =>
    act(async () => {
      await studioRequest("content", `${creatorId}/thanks`, {
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
              audienceSize={content.audienceCount ?? undefined}
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
              <h1>{content.document.title || "From " + content.creatorName}</h1>
              {content.quotedText && (
                <blockquote>
                  <p>{content.quotedText}</p>
                  {content.quotedHandle && <cite>@{content.quotedHandle}</cite>}
                </blockquote>
              )}
              <p className="w5-content-text">{content.displayText}</p>
              <p>{content.audienceLabel}</p>
            </article>
          )}
          {content.displayText !== content.document.text && (
            <details>
              <summary>Signed original</summary>
              <p className="w5-content-text">{content.document.text}</p>
            </details>
          )}
          {content.document.live && (
            <p>
              {content.document.kind === "replay" ? "Replay" : "Live session"} ·{" "}
              {new Date(content.document.live.startsAt).toLocaleString()} —{" "}
              {new Date(content.document.live.endsAt).toLocaleString()}
            </p>
          )}
          {content.document.media.length > 0 && (
            <Notice title="Attachment status">
              Playback requires the connected media service. Refresh to check
              current access.
            </Notice>
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
                  await studioRequest(
                    "content",
                    `${creatorId}/${contentId}/replies`,
                    { text, idempotencyKey: crypto.randomUUID() },
                  );
                  setText("");
                });
              }}
            >
              <label htmlFor="private-reply">Reply privately</label>
              <textarea
                id="private-reply"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4000}
                required
              />
              <button disabled={busy || !text.trim()}>
                Send private reply
              </button>
            </form>
          )}
          {ownReplies.map((reply) => (
            <article key={reply.id} className="w5-paper">
              <p className="w5-content-text">{reply.text}</p>
              <small>{new Date(reply.createdAt).toLocaleString()}</small>
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
                  onChange={(e) => void consent(reply, true, e.target.checked)}
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
                    studioRequest(
                      "content",
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
            studioRequest("content", `${creatorId}/mute`, { muted: !muted }),
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
                {thanks && !thanks.withdrawn ? "Update Thanks" : "This helped"}
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
    </main>
  );
}
