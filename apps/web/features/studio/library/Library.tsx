"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EmptyState, Notice } from "@qelvora/ui-web";
import type { ContentView } from "../../../../../packages/api/src/content";
import { studioRequest } from "../api";
import { Compose } from "../notes/Compose";
import { Feedback, useAction } from "../shared/action";
import { contentStateLabel, key, time } from "../shared/format";
import type { Creator, Page } from "../shared/types";
export function Library({ creator }: { creator: Creator }) {
  const [page, setPage] = useState<Page<ContentView>>({
      items: [],
      nextCursor: null,
    }),
    [editing, setEditing] = useState<
      { id?: string; post: boolean } | undefined
    >(undefined),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [reading, setReading] = useState(true),
    [readError, setReadError] = useState<string | null>(null),
    action = useAction();
  const searchKey = JSON.stringify([
    creator.id,
    creator.viewerAccountId,
    filter,
    query,
  ]);
  const reads = useRef({
    generation: 0,
    mounted: true,
    controller: null as AbortController | null,
    searchKey,
  });
  const load = useCallback(
    async (cursor?: string) => {
      if (reads.current.searchKey !== searchKey) return;
      const generation = ++reads.current.generation;
      reads.current.controller?.abort();
      const controller = new AbortController();
      reads.current.controller = controller;
      setReading(true);
      setReadError(null);
      try {
        const next = await studioRequest<Page<ContentView>>(
          "content",
          `${creator.id}/studio?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(filter ? { state: filter } : {}), ...(query ? { query } : {}) })}`,
          undefined,
          creator.viewerAccountId,
          { signal: controller.signal },
        );
        if (
          !reads.current.mounted ||
          generation !== reads.current.generation ||
          reads.current.searchKey !== searchKey
        )
          return;
        setPage((previous) =>
          cursor
            ? {
                items: [...previous.items, ...next.items].filter(
                  (item, index, all) =>
                    all.findIndex((other) => other.id === item.id) === index,
                ),
                nextCursor: next.nextCursor,
              }
            : next,
        );
      } catch (error) {
        if (
          reads.current.mounted &&
          generation === reads.current.generation &&
          !controller.signal.aborted
        )
          setReadError(
            error instanceof Error
              ? error.message
              : "Your current library could not be read.",
          );
      } finally {
        if (reads.current.mounted && generation === reads.current.generation)
          setReading(false);
      }
    },
    [creator.id, creator.viewerAccountId, filter, query, searchKey],
  );
  useEffect(() => {
    reads.current.mounted = true;
    reads.current.searchKey = searchKey;
    setPage({ items: [], nextCursor: null });
    setReading(true);
    setReadError(null);
    // A new search supersedes the old read even while a mutation is pending.
    // Keep read cancellation separate from the command/retry boundary.
    const timer = setTimeout(() => void load(), 200);
    if (new URLSearchParams(location.search).has("packet"))
      setEditing({ post: true });
    return () => {
      clearTimeout(timer);
      reads.current.mounted = false;
      reads.current.generation++;
      reads.current.controller?.abort();
    };
  }, [load, searchKey]);
  if (editing !== undefined)
    return (
      <Compose
        key={`${creator.viewerAccountId}:${creator.id}:${editing.id ?? "new"}`}
        creator={creator}
        id={editing.id}
        post={editing.post}
        onDone={() => {
          setEditing(undefined);
          void load();
        }}
      />
    );
  return (
    <section className="w5-library w5-gutter">
      <header className="w5-heading">
        <h1>Publish</h1>
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() => setEditing({ post: true })}
        >
          New post
        </button>
      </header>
      <Feedback action={action} />
      {readError && (
        <Notice tone="error" title="Library unavailable">
          {readError}
          <button
            className="qv-btn qv-btn--secondary"
            disabled={reading}
            onClick={() => void load()}
          >
            Retry current search
          </button>
        </Notice>
      )}
      {reading && <p role="status">Checking your current library…</p>}
      <p className="qv-help">
        Audience controls who can see it. AI-source approval is separate.
      </p>
      <label className="w5-field">
        Search your library
        <input
          type="search"
          maxLength={180}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="w5-field">
        State
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All states</option>
          {[
            "draft",
            "media_pending",
            "scheduled",
            "published",
            "unpublished",
            "archived",
          ].map((s) => (
            <option key={s} value={s}>
              {contentStateLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="w5-actions">
        <button
          className="qv-link-btn"
          disabled={reading || action.busy}
          onClick={() => void load()}
        >
          Refresh library
        </button>
      </div>
      {page.items.map((item) => (
        <article key={item.id} className="w5-card">
          <h2>
            {item.document.title ||
              (item.document.kind === "note"
                ? "Untitled Note"
                : "Untitled post")}
          </h2>
          <p className="qv-meta">
            {contentStateLabel(item.state)} · REV {item.version} ·{" "}
            {item.audienceLabel}
          </p>
          <p>{item.document.text}</p>
          <p className="qv-help">
            {
              {
                not_requested: "Separate from AI sources",
                candidate_pending: "Waiting to add an AI source candidate",
                candidate: "AI source candidate · approval happens in My AI",
                revocation_pending: "AI source removal pending",
                revoked: "AI use is off",
              }[item.sourceState]
            }
            {item.document.scheduledAt &&
              ` · Scheduled ${time(item.document.scheduledAt)}`}
          </p>
          <div className="w5-actions">
            <button
              className="qv-btn qv-btn--secondary"
              onClick={() =>
                setEditing({
                  id: item.id,
                  post: item.document.kind !== "note",
                })
              }
            >
              Edit and review again
            </button>
            {item.state === "published" && (
              <Link href={`/content/${creator.id}/${item.id}`}>
                Open current fan view
              </Link>
            )}
            {["unpublish", "archive"].map((operation) => (
              <button
                key={operation}
                className="qv-btn qv-btn--quiet"
                disabled={
                  action.busy ||
                  item.state === "archived" ||
                  (operation === "unpublish" &&
                    !["published", "scheduled", "media_pending"].includes(
                      item.state,
                    ))
                }
                onClick={() =>
                  void action.run(async () => {
                    await studioRequest(
                      "content",
                      `${creator.id}/${item.id}/${operation}`,
                      { version: item.version, idempotencyKey: key() },
                      creator.viewerAccountId,
                    );
                    await load();
                  })
                }
              >
                {operation === "unpublish" ? "Unpublish" : "Archive"}
              </button>
            ))}
          </div>
        </article>
      ))}
      {!page.items.length &&
        !reading &&
        !readError &&
        !action.busy &&
        !action.error && (
          <EmptyState
            title={
              query || filter ? "No matching items" : "Your library is empty"
            }
            body={
              query || filter
                ? "Try another search or choose All states."
                : "Save a draft, choose its audience, and review its exact publication."
            }
          />
        )}
      {page.nextCursor && (
        <button
          className="qv-btn qv-btn--secondary"
          disabled={reading || action.busy}
          onClick={() => void load(page.nextCursor!)}
        >
          More content
        </button>
      )}
    </section>
  );
}
