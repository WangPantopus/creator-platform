"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCopy } from "@qelvora/copy";
import { EmptyState, Message, Note, ReactionChip } from "@qelvora/ui-web";
import type {
  ContentView,
  PrivateNoteReply,
} from "../../../../../packages/api/src/content";
import { ContentReplyList } from "../../../../../packages/api/src/content";
import { SignedActReview } from "../../identity/signing";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import { Modal } from "../shared/Modal";
import type { Creator, Page } from "../shared/types";
export function Notes({ creator }: { creator: Creator }) {
  const canReviewReplies = creator.owned || creator.roles.includes("triage");
  const [notes, setNotes] = useState<Page<ContentView>>({
      items: [],
      nextCursor: null,
    }),
    [replies, setReplies] = useState<Page<PrivateNoteReply>>({
      items: [],
      nextCursor: null,
    }),
    [replyFilter, setReplyFilter] = useState("all"),
    [reaction, setReaction] = useState<PrivateNoteReply | null>(null),
    [freshUntil, setFreshUntil] = useState(0),
    action = useAction();
  const reads = useRef({ generation: 0, mounted: true });
  const replyCursors = useRef<(string | null)[]>([null]);
  const load = useCallback(async () => {
    const request = ++reads.current.generation;
    const started = performance.now();
    const cursor = replyCursors.current.at(-1);
    // Revalidate only the visible bounded page. Re-fetching every previously
    // loaded page can exhaust the five-second lease as the feed grows.
    const [n, current] = await Promise.all([
      studioRequest<Page<ContentView>>(
        "content",
        `${creator.id}/studio`,
        undefined,
        creator.viewerAccountId,
      ),
      canReviewReplies
        ? studioRequest(
            "content",
            `${creator.id}/studio/replies?${new URLSearchParams({ filter: replyFilter, ...(cursor ? { cursor } : {}) })}`,
            undefined,
            creator.viewerAccountId,
          ).then((value) => ContentReplyList.parse(value))
        : Promise.resolve<Page<PrivateNoteReply>>({
            items: [],
            nextCursor: null,
          }),
    ]);
    if (!reads.current.mounted || request !== reads.current.generation) return;
    if (document.hidden || performance.now() >= started + 5000)
      throw new Error("Current Note and reply access must be checked again.");
    setNotes(n);
    setReplies(current);
    setFreshUntil(started + 5000);
    setReaction((previous) =>
      previous
        ? (current.items.find(
            (reply) =>
              reply.id === previous.id &&
              reply.version === previous.version &&
              reply.safetyState === "allowed",
          ) ?? null)
        : null,
    );
  }, [canReviewReplies, creator.id, creator.viewerAccountId, replyFilter]);
  useEffect(() => {
    reads.current.mounted = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        await action.run(load);
      } finally {
        pending = false;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        reads.current.generation++;
        setFreshUntil(0);
      } else void refresh();
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      reads.current.mounted = false;
      reads.current.generation++;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (!freshUntil) return;
    const timer = setTimeout(
      () => setFreshUntil(0),
      Math.max(0, freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [freshUntil]);
  return (
    <section className="w5-notes">
      <header className="w5-heading">
        <h1>Notes</h1>
        {(creator.owned || creator.roles.includes("drafter")) && (
          <Link
            className="qv-btn qv-btn--maya"
            href={`/studio/${creator.id}/compose`}
          >
            New Note
          </Link>
        )}
      </header>
      <Feedback action={action} />
      {!freshUntil && (
        <div className="w5-gutter">
          <p role="status">Checking current Note and private reply access.</p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={action.busy}
            onClick={() => void action.run(load)}
          >
            Check current access
          </button>
        </div>
      )}
      <div hidden={!freshUntil} inert={!freshUntil}>
        <div className="w5-note-list">
          {notes.items
            .filter((n) => n.document.kind === "note")
            .map((n) => (
              <div key={n.id}>
                {n.state === "draft" ? (
                  <article className="w5-card">
                    <p className="qv-meta">Draft · not signed or sent</p>
                    <p className="w5-content-text">{n.document.text}</p>
                  </article>
                ) : (
                  <Note
                    name={creator.display_name}
                    audience={n.audienceLabel}
                    time={time(n.publishedAt)}
                    signedActId={n.signedActId ?? undefined}
                    audienceSize={n.audienceCount ?? undefined}
                    reply={false}
                  >
                    {n.document.text}
                  </Note>
                )}
                <p className="qv-help">
                  {n.state === "published"
                    ? "Broadcast"
                    : contentStateLabel(n.state)}{" "}
                  ·{" "}
                  {n.sourceState === "not_requested"
                    ? "Separate from AI sources"
                    : "AI-source review required"}
                </p>
                {["draft", "scheduled", "media_pending"].includes(n.state) && (
                  <Link
                    href={`/studio/${creator.id}/compose/${n.id}`}
                    className="qv-link-btn w5-note-edit"
                  >
                    Edit draft
                  </Link>
                )}
                {n.state === "media_pending" && (
                  <p className="qv-help">
                    Signed. Delivery waits for verified media credentials. You
                    can edit or withdraw this publication.
                  </p>
                )}
              </div>
            ))}
          {!notes.items.some((n) => n.document.kind === "note") &&
            !action.busy &&
            !action.error && (
              <EmptyState
                title="Your first Note"
                body="Write one Note for your audience. Each fan's reply stays private."
              />
            )}
        </div>
        {canReviewReplies && (
          <div className="w5-replies">
            <div className="w5-replies-title">
              <span className="qv-meta">
                REPLIES ·{" "}
                {action.busy
                  ? "loading"
                  : action.error
                    ? "unavailable"
                    : `${replies.items.length} on this page`}
              </span>
              <span className="qv-help">
                Only you and your triage team see these
              </span>
            </div>
            <label className="w5-field">
              Show replies
              <select
                value={replyFilter}
                onChange={(e) => {
                  replyCursors.current = [null];
                  setFreshUntil(0);
                  setReplyFilter(e.target.value);
                }}
              >
                <option value="all">All reviewed replies</option>
                <option value="unread">Unread</option>
                <option value="reacted">Reacted</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
            {replies.items.map((r) => (
              <article className="w5-reply" key={r.id}>
                <div className="w5-row">
                  <strong>@{r.handle}</strong>
                  <time className="qv-meta">{time(r.createdAt)}</time>
                </div>
                {r.tenure?.milestone && (
                  <p className="qv-meta">
                    {formatCopy("contentConfirmedTenure", {
                      days: r.tenure.confirmedDays,
                    })}
                  </p>
                )}
                <p>{r.text}</p>
                {!r.read && (
                  <button
                    className="qv-btn qv-btn--quiet"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await studioRequest(
                          "content",
                          `${creator.id}/replies/${r.id}/read`,
                          { version: r.version, idempotencyKey: key() },
                          creator.viewerAccountId,
                        );
                        await load();
                      })
                    }
                  >
                    Mark read
                  </button>
                )}
                {r.safetyState === "flagged" ? (
                  <p className="qv-help">
                    Withheld from the feed · sent for safety review. Private
                    text is not shown here.
                  </p>
                ) : r.reaction ? (
                  <ReactionChip
                    name={creator.display_name}
                    signedActId={r.reaction.signedActId}
                  />
                ) : (
                  <div className="w5-actions">
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={!creator.owned || action.busy}
                      onClick={() => setReaction(r)}
                    >
                      React
                    </button>
                    {r.consent.shareText ? (
                      <Link
                        className="qv-btn qv-btn--quiet"
                        href={`/studio/${creator.id}/compose?quote=${r.id}`}
                      >
                        Quote in a Note
                      </Link>
                    ) : (
                      <button className="qv-btn qv-btn--quiet" disabled>
                        Sharing consent required
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            <nav className="w5-actions" aria-label="Private reply pages">
              {replyCursors.current.length > 1 && (
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      replyCursors.current.pop();
                      setFreshUntil(0);
                      setReaction(null);
                      await load();
                    })
                  }
                >
                  Previous replies
                </button>
              )}
              {replies.nextCursor && (
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      replyCursors.current.push(replies.nextCursor);
                      setFreshUntil(0);
                      setReaction(null);
                      await load();
                    })
                  }
                >
                  Next replies
                </button>
              )}
            </nav>
            {!replies.items.length && !action.busy && !action.error && (
              <p className="qv-help">
                Reviewed private replies appear here when fans reply to a
                published Note. Replies waiting for safety review stay out of
                the feed.
              </p>
            )}
          </div>
        )}
        {reaction && (
          <Modal
            title="React to this private reply"
            onClose={() => setReaction(null)}
          >
            <Message kind="fan">{reaction.text}</Message>
            <SignedActReview
              creatorId={creator.id}
              command={{
                actType: "reaction",
                subjectId: reaction.id,
                content: {
                  kind: "content_reaction",
                  creatorId: creator.id,
                  replyVersion: reaction.version,
                  reaction: "heart",
                },
              }}
              creatorName={creator.display_name}
              text="A heart reaction to this reply"
              title="Review reaction"
              rows={[
                ["Fan sees", `${creator.display_name} reacted to your reply`],
              ]}
              onSigned={async (signedActId) => {
                await studioRequest(
                  "content",
                  `${creator.id}/replies/${reaction.id}/reaction`,
                  {
                    version: reaction.version,
                    kind: "heart",
                    signedActId,
                    idempotencyKey: key(),
                  },
                  creator.viewerAccountId,
                );
                setReaction(null);
                await load();
              }}
            />
          </Modal>
        )}
      </div>
    </section>
  );
}
