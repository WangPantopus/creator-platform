"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy, formatCopy } from "@qelvora/copy";
import { CapacityHeader, EmptyState, Note } from "@qelvora/ui-web";
import type { ContentView } from "../../../../../packages/api/src/content";
import { ContentReplyList } from "../../../../../packages/api/src/content";
import { studioRequest } from "../api";
import { time } from "../shared/format";
import type { Creator, Page, Queue } from "../shared/types";
type Part<T> =
  | { state: "loading" }
  | { state: "ready"; value: T }
  | { state: "unavailable"; message: string };
type AiStatus = { paused: boolean; live: number | null };
const loading = { state: "loading" } as const;
/** Today (WP 6.2, contract C10): the creator's five minutes in one place. Each
 * part is read from the one place that owns it, once on open and again when the
 * creator comes back to the tab; nothing here polls on a timer. */
export function Today({ creator }: { creator: Creator }) {
  const { id, viewerAccountId, owned } = creator;
  const canWrite = owned || creator.roles.includes("drafter");
  const canReview = owned || creator.roles.includes("triage");
  const [note, setNote] = useState<Part<ContentView | null>>(loading),
    [replies, setReplies] =
      useState<Part<{ count: number; more: boolean }>>(loading),
    [queue, setQueue] = useState<Part<Queue>>(loading),
    [ai, setAi] = useState<Part<AiStatus>>(loading);
  const generation = useRef(0);
  const load = useCallback(() => {
    const current = ++generation.current;
    // Each part settles on its own, so one unavailable producer never hides the rest.
    const settle = <T,>(set: (part: Part<T>) => void, work: Promise<T>) =>
      void work.then(
        (value) => {
          if (current === generation.current) set({ state: "ready", value });
        },
        (failure: unknown) => {
          if (current === generation.current)
            set({
              state: "unavailable",
              message:
                failure instanceof Error
                  ? failure.message
                  : copy.studioTodayUnavailable,
            });
        },
      );
    settle(
      setNote,
      studioRequest<Page<ContentView>>(
        "content",
        `${id}/studio?state=published&limit=20`,
        undefined,
        viewerAccountId,
      ).then(
        (page) =>
          page.items
            .filter((item) => item.document.kind === "note")
            .sort((a, b) =>
              (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
            )[0] ?? null,
      ),
    );
    if (canReview)
      settle(
        setReplies,
        studioRequest(
          "content",
          `${id}/studio/replies?filter=unread&limit=50`,
          undefined,
          viewerAccountId,
        ).then((value) => {
          const page = ContentReplyList.parse(value);
          return { count: page.items.length, more: !!page.nextCursor };
        }),
      );
    if (owned) {
      settle(
        setQueue,
        studioRequest<Queue>(
          "studio",
          `${id}/queue?limit=1`,
          undefined,
          viewerAccountId,
        ),
      );
      // My AI belongs to the signed-in creator's own session (lane 3).
      settle(
        setAi,
        studioRequest<{
          creator: { id: string };
          paused: boolean;
          liveVersion: { number: number } | null;
        }>("studio", "ai/state", undefined, viewerAccountId).then((state) => {
          if (state.creator.id !== id)
            throw new Error(copy.studioTodayUnavailable);
          return {
            paused: state.paused,
            live: state.liveVersion?.number ?? null,
          };
        }),
      );
    }
  }, [id, viewerAccountId, owned, canReview]);
  useEffect(() => {
    load();
    const back = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      generation.current++;
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, [load]);
  const status = (part: Part<unknown>) =>
    part.state === "loading" ? (
      <p className="qv-help" role="status">
        {copy.studioTodayLoading}
      </p>
    ) : part.state === "unavailable" ? (
      <p className="qv-help" role="status">
        {part.message}
      </p>
    ) : null;
  return (
    <section className="w5-today">
      <header className="w5-heading">
        <h1>{copy.studioTodayTitle}</h1>
        {canWrite && (
          <Link
            className="qv-btn qv-btn--maya"
            href={`/studio/${id}/compose?from=today`}
          >
            {copy.studioNewNote}
          </Link>
        )}
      </header>
      <section className="w5-today-part" aria-labelledby="w5-today-note">
        <div className="w5-today-head">
          <h2 id="w5-today-note" className="qv-meta">
            {copy.studioTodayLatestNote}
          </h2>
          {/* Notes is reached from Today (founder, 2026-10-15). */}
          <Link className="qv-link-btn" href={`/studio/${id}/notes`}>
            {copy.navNotes}
          </Link>
        </div>
        {status(note)}
        {note.state === "ready" &&
          (note.value ? (
            <Note
              name={creator.display_name}
              audience={note.value.audienceLabel}
              time={time(note.value.publishedAt)}
              signedActId={note.value.signedActId ?? undefined}
              audienceSize={note.value.audienceCount ?? undefined}
              reply={false}
            >
              {note.value.document.text}
            </Note>
          ) : (
            <EmptyState
              title={copy.studioFirstNoteTitle}
              body={copy.studioFirstNoteBody}
            />
          ))}
      </section>
      {canReview && (
        <section className="w5-today-part" aria-labelledby="w5-today-replies">
          <h2 id="w5-today-replies" className="qv-meta">
            {copy.studioTodayReplies}
          </h2>
          {status(replies)}
          {replies.state === "ready" && (
            <Link
              className="w5-card w5-today-link"
              href={`/studio/${id}/notes`}
            >
              <strong>
                {replies.value.count === 0
                  ? copy.studioTodayNoUnreadReplies
                  : replies.value.count === 1 && !replies.value.more
                    ? copy.studioTodayUnreadReply
                    : formatCopy("studioTodayUnreadReplies", {
                        count: `${replies.value.count}${replies.value.more ? "+" : ""}`,
                      })}
              </strong>
              <span className="qv-help">{copy.studioTodayRepliesHelp}</span>
            </Link>
          )}
        </section>
      )}
      {owned && (
        <section className="w5-today-part" aria-labelledby="w5-today-requests">
          <h2 id="w5-today-requests" className="qv-meta">
            {copy.studioTodayRequests}
          </h2>
          {status(queue)}
          {queue.state === "ready" && (
            <>
              {queue.value.capacity.length > 0 && (
                <CapacityHeader
                  rows={queue.value.capacity.map((c) => ({
                    mode: c.title,
                    used: c.used + c.reserved,
                    limit: c.weekly_limit,
                  }))}
                />
              )}
              <Link
                className="w5-card w5-today-link"
                href={`/studio/${id}/requests`}
              >
                <strong>
                  {queue.value.requests > 0
                    ? formatCopy("waiting", { count: queue.value.requests })
                    : copy.studioTodayRequestsNone}
                </strong>
              </Link>
            </>
          )}
        </section>
      )}
      {owned && (
        <section className="w5-today-part" aria-labelledby="w5-today-ai">
          <h2 id="w5-today-ai" className="qv-meta">
            {copy.studioTodayMyAI}
          </h2>
          {status(ai)}
          {ai.state === "ready" && (
            <Link className="w5-card w5-today-link" href="/studio/ai">
              <strong>
                {ai.value.paused
                  ? copy.studioTodayAiPaused
                  : ai.value.live !== null
                    ? formatCopy("studioLive", { version: `v${ai.value.live}` })
                    : copy.studioTodayAiNotPublished}
              </strong>
            </Link>
          )}
        </section>
      )}
      <Link className="qv-link-btn w5-today-switch" href="/studio/workspace">
        {copy.studioChooseStudio}
      </Link>
    </section>
  );
}
