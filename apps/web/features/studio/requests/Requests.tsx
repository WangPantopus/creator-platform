"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CapacityHeader, EmptyState, QueueCard } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { money, time } from "../shared/format";
import type { Creator, Queue } from "../shared/types";
export function Requests({ creator }: { creator: Creator }) {
  const [queue, setQueue] = useState<Queue | null>(null),
    [filter, setFilter] = useState("all"),
    [ready, setReady] = useState(false),
    [reload, setReload] = useState(0),
    action = useAction(),
    router = useRouter();
  const positionKey = `w5.queue:${creator.viewerAccountId}:${creator.id}`;
  const pages = useRef(1),
    restore = useRef<{ pages: number; scroll: number } | null>(null),
    requestGeneration = useRef(0);
  useEffect(() => {
    // Persist only navigation metadata. Every return reloads current authorized
    // producer pages; private packet/disclosure text never enters storage.
    try {
      const stored = JSON.parse(sessionStorage.getItem(positionKey) ?? "null");
      if (
        stored &&
        ["all", "due", "decide", "more_info"].includes(stored.filter) &&
        Number.isInteger(stored.pages) &&
        stored.pages >= 1 &&
        stored.pages <= 50 &&
        Number.isFinite(stored.scroll) &&
        stored.scroll >= 0
      ) {
        setFilter(stored.filter);
        restore.current = { pages: stored.pages, scroll: stored.scroll };
      }
    } catch {
      // Invalid or unavailable storage starts a fresh current queue.
    }
    setReady(true);
  }, [positionKey]);
  useEffect(() => {
    if (!ready) return;
    const current = ++requestGeneration.current;
    let frame: number | undefined;
    const position = restore.current;
    restore.current = null;
    void action.run(async () => {
      let result = await studioRequest<Queue>(
        "studio",
        `${creator.id}/queue?filter=${filter}`,
      );
      if (current !== requestGeneration.current) return;
      setQueue(result);
      let loadedPages = 1;
      while (
        current === requestGeneration.current &&
        result.nextCursor &&
        loadedPages < (position?.pages ?? 1)
      ) {
        const next = await studioRequest<Queue>(
          "studio",
          `${creator.id}/queue?filter=${filter}&cursor=${result.nextCursor}`,
        );
        result = { ...next, items: [...result.items, ...next.items] };
        loadedPages++;
        if (current === requestGeneration.current) setQueue(result);
      }
      if (current !== requestGeneration.current) return;
      pages.current = loadedPages;
      setQueue(result);
      if (position)
        frame = requestAnimationFrame(() =>
          window.scrollTo(0, position.scroll),
        );
    });
    return () => {
      requestGeneration.current++;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [creator.id, filter, ready, reload]);
  const rememberPosition = () => {
    try {
      sessionStorage.setItem(
        positionKey,
        JSON.stringify({
          filter,
          pages: Math.min(pages.current, 50),
          scroll: window.scrollY,
        }),
      );
    } catch {
      // Storage availability never blocks opening a current request.
    }
  };
  return (
    <section className="w5-requests">
      <header className="w5-heading">
        <h1>Requests</h1>
        <button
          className="qv-link-btn"
          disabled={action.busy || !ready}
          onClick={() => {
            restore.current = null;
            pages.current = 1;
            setQueue(null);
            setReload((value) => value + 1);
          }}
        >
          Refresh requests
        </button>
        <span className="qv-meta">
          {queue?.items.length ?? "—"}
          {queue?.nextCursor ? "+" : ""}
        </span>
      </header>
      <Feedback action={action} />
      {queue && (
        <div className="w5-gutter">
          <CapacityHeader
            rows={queue.capacity.map((c) => ({
              mode: c.title,
              used: c.used + c.reserved,
              limit: c.weekly_limit,
            }))}
            line="Used and reserved capacity from Offers"
          />
        </div>
      )}
      <div className="w5-gutter">
        <label className="w5-field">
          Filter
          <select
            value={filter}
            disabled={action.busy || !ready}
            onChange={(e) => {
              restore.current = null;
              pages.current = 1;
              setQueue(null);
              setFilter(e.target.value);
              try {
                sessionStorage.setItem(
                  positionKey,
                  JSON.stringify({
                    filter: e.target.value,
                    pages: 1,
                    scroll: 0,
                  }),
                );
              } catch {
                // The filter still works without browser storage.
              }
            }}
          >
            <option value="all">All</option>
            <option value="due">Due</option>
            <option value="decide">To decide</option>
            <option value="more_info">Waiting for more information</option>
          </select>
        </label>
      </div>
      {[
        "Due",
        "To decide",
        "Waiting for more information",
        "Waiting for fan decision",
      ].map((section, index) => {
        const items =
          queue?.items.filter((p) => {
            const due = Boolean(
              p.commitment_id &&
                ["due", "in_progress"].includes(p.commitment_state ?? ""),
            );
            return index === 0
              ? due
              : !due &&
                  p.state ===
                    ["", "submitted", "more_info", "offer_pending"][index];
          }) ?? [];
        if (index > 1 && !items.length) return null;
        return (
          <div className="w5-queue-section" key={section}>
            <h2>{section}</h2>
            {items.map((p) => (
              <button
                key={p.id}
                className="w5-queue-open"
                onClick={() => {
                  rememberPosition();
                  router.push(`/studio/${creator.id}/packets/${p.id}`);
                }}
              >
                <QueueCard
                  kind={index === 0 ? "commitment" : "packet"}
                  handle={`@${p.handle}`}
                  mode={p.snapshot.title}
                  price={money(p.snapshot.amount, p.snapshot.currency)}
                  due={`${index === 0 ? "DUE" : index === 1 ? "DECIDE BY" : "HOLD EXPIRES"} ${time(p.deadline)}`}
                  summary={p.disclosure.summary ?? "Fan-selected disclosure"}
                  shared="Only the fan's selected disclosure"
                  overdue={
                    index < 2 && new Date(p.deadline).getTime() < Date.now()
                  }
                />
              </button>
            ))}
          </div>
        );
      })}
      {queue?.items.length === 0 && (
        <div className="w5-gutter">
          <EmptyState
            title="You're up to date"
            body="Requests and accepted commitments appear here. Opening them does not charge or fulfill anything."
          />
        </div>
      )}
      {queue?.nextCursor && (
        <button
          disabled={action.busy}
          className="qv-btn qv-btn--secondary"
          onClick={() =>
            void action.run(async () => {
              const next = await studioRequest<Queue>(
                "studio",
                `${creator.id}/queue?filter=${filter}&cursor=${queue.nextCursor}`,
              );
              pages.current++;
              setQueue({ ...next, items: [...queue.items, ...next.items] });
            })
          }
        >
          More requests
        </button>
      )}
    </section>
  );
}
