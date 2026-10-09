"use client";
import { useEffect, useState } from "react";
import { EmptyState, Notice } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { time } from "../shared/format";
import type { Creator } from "../shared/types";
export function ThanksFeed({ creator }: { creator: Creator }) {
  const [rows, setRows] = useState<
      { id: string; text: string; handle: string | null; created_at: string }[]
    >([]),
    [error, setError] = useState(""),
    [freshUntil, setFreshUntil] = useState(0);
  useEffect(() => {
    let generation = 0,
      closed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (closed || document.hidden || controller) return;
      const request = ++generation;
      const started = performance.now();
      const currentController = new AbortController();
      controller = currentController;
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
        if (closed || request !== generation) return;
        if (document.hidden || performance.now() >= started + 5000)
          throw new Error("Current sharing permission must be checked again.");
        setRows(current);
        setFreshUntil(started + 5000);
        setError("");
      } catch (failure) {
        if (closed || request !== generation) return;
        setRows([]);
        setFreshUntil(0);
        setError(
          failure instanceof Error
            ? failure.message
            : "Current sharing permission is unavailable.",
        );
      } finally {
        if (controller === currentController) controller = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        generation++;
        controller?.abort();
        controller = null;
        setRows([]);
        setFreshUntil(0);
      } else void load();
    };
    setRows([]);
    setFreshUntil(0);
    void load();
    const timer = setInterval(() => void load(), 4000);
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [creator.id, creator.viewerAccountId]);
  useEffect(() => {
    if (!freshUntil) return;
    const timer = setTimeout(
      () => {
        setRows([]);
        setFreshUntil(0);
      },
      Math.max(0, freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [freshUntil]);
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
      {!error && freshUntil > 0 && rows.length === 0 && (
        <EmptyState
          title="No shared thanks yet"
          body="When a fan chooses to share a thanks with your digest, it appears here. Their private thanks stay private."
        />
      )}
      {!error && !freshUntil && (
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
