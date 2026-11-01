"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Notice } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { time } from "../shared/format";
import type { Creator } from "../shared/types";
import { useLiveReload, useLiveView } from "../shell/live";
export function ThanksFeed({ creator }: { creator: Creator }) {
  const [rows, setRows] = useState<
      { id: string; text: string; handle: string | null; created_at: string }[]
    >([]),
    [error, setError] = useState(""),
    [current, setCurrent] = useState(false);
  // Studio's live stream re-checks this read on the server and says when it
  // changed or was refused; nothing here runs on a timer.
  const live = useLiveView({ view: "thanks" });
  const reads = useRef({
    generation: 0,
    closed: false,
    controller: null as AbortController | null,
  });
  const load = useCallback(async () => {
    const r = reads.current;
    if (r.closed || document.hidden || r.controller) return;
    const request = ++r.generation;
    const started = performance.now();
    const currentController = new AbortController();
    r.controller = currentController;
    try {
      const current = await studioRequest<typeof rows>(
        "content",
        `${creator.id}/studio/thanks`,
        undefined,
        creator.viewerAccountId,
        {
          signal: AbortSignal.any([
            currentController.signal,
            AbortSignal.timeout(4000),
          ]),
        },
      );
      if (r.closed || request !== r.generation) return;
      if (document.hidden || performance.now() >= started + 5000)
        throw new Error("Current sharing permission must be checked again.");
      setRows(current);
      setCurrent(true);
      setError("");
    } catch (failure) {
      if (r.closed || request !== r.generation) return;
      setRows([]);
      setCurrent(false);
      setError(
        failure instanceof Error
          ? failure.message
          : "Current sharing permission is unavailable.",
      );
    } finally {
      if (r.controller === currentController) r.controller = null;
    }
  }, [creator.id, creator.viewerAccountId]);
  useEffect(() => {
    const r = reads.current;
    r.closed = false;
    const onVisibility = () => {
      if (document.hidden) {
        r.generation++;
        r.controller?.abort();
        r.controller = null;
        setRows([]);
        setCurrent(false);
      }
    };
    setRows([]);
    setCurrent(false);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      r.closed = true;
      r.generation++;
      r.controller?.abort();
      r.controller = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [creator.id, creator.viewerAccountId]);
  useLiveReload(live, load);
  useEffect(() => {
    if (!live.error) return;
    setRows([]);
    setCurrent(false);
    setError(live.error.message);
  }, [live.error]);
  return (
    <section className="w5-gutter">
      <header className="w5-heading">
        <h1>Thanks</h1>
      </header>
      {error && (
        <Notice tone="error" title="Thanks unavailable">
          {error}
        </Notice>
      )}
      <p className="qv-help">
        Only notes fans consented to share with your digest appear here.
      </p>
      {!error && current && rows.length === 0 && (
        <EmptyState
          title="No shared thanks yet"
          body="When a fan chooses to share a thanks with your digest, it appears here. Their private thanks stay private."
        />
      )}
      {!error && !current && (
        <p role="status" className="qv-help">
          Checking current sharing permission…
        </p>
      )}
      {rows.map((r) => (
        <article className="w5-card" key={r.id}>
          {r.handle && <strong>@{r.handle}</strong>}
          <p>{r.text || "This helped"}</p>
          <time className="qv-meta">{time(r.created_at)}</time>
        </article>
      ))}
    </section>
  );
}
