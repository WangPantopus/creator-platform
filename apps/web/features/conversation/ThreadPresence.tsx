"use client";

import { useEffect, useRef, useState } from "react";
import { Note, ReactionChip } from "@qelvora/ui-web";
import { formatCopy } from "@qelvora/copy";
import {
  ThreadPresencePage,
  type ThreadPresenceItem,
} from "../../../../packages/api/src/content";
import { useIdentityRequest } from "../identity/session-boundary";
import { useConversationRequest } from "./api";

const noPresence: ThreadPresenceItem[] = [];

/** C4 is a current audience projection, never a stored message or an offline
 * snapshot. Re-read the head and latest four older cursors together so withdrawal,
 * edits and lost membership replace the whole visible projection atomically. */
export function useThreadPresence(creatorId: string, online: boolean) {
  const request = useConversationRequest("content");
  const identity = useIdentityRequest();
  const scope = `${identity.session.sessionId}:${creatorId}`;
  const [state, setState] = useState<{
    scope: string;
    items: ThreadPresenceItem[];
    hasOlder: boolean;
    busy: boolean;
    failed: boolean;
    freshUntil: number;
  }>({
    scope,
    items: [],
    hasOlder: false,
    busy: false,
    failed: false,
    freshUntil: 0,
  });
  const load = useRef<(older?: boolean) => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let readController: AbortController | undefined;
    let cursors: (string | null)[] = [null];
    let nextBefore: string | null = null;
    let olderPending: string | null = null;
    let running = false,
      again = false,
      suspended = document.visibilityState !== "visible",
      generation = 0;
    const clear = () =>
      setState({
        scope,
        items: [],
        hasOlder: false,
        busy: false,
        failed: false,
        freshUntil: 0,
      });
    const refresh = async () => {
      if (controller.signal.aborted || !online || suspended) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      do {
        again = false;
        const started = generation;
        // A click during a refresh queues one cursor for the next cycle. Keep
        // each cycle fixed, bounded and concurrent under one freshness budget.
        const includesOlder = olderPending !== null;
        const readCursors = includesOlder
          ? [...cursors, olderPending]
          : [...cursors];
        if (readCursors.length > 5) readCursors.splice(1, 1);
        const freshUntil = performance.now() + 5000;
        readController = new AbortController();
        const signal = AbortSignal.any([
          controller.signal,
          readController.signal,
          AbortSignal.timeout(5000),
        ]);
        setState((previous) => ({ ...previous, busy: olderPending !== null }));
        try {
          const pages = await Promise.all(
            readCursors.map(async (before) => {
              const query = new URLSearchParams({ limit: "50" });
              if (before) query.set("before", before);
              return ThreadPresencePage.parse(
                await request<unknown>(
                  `${creatorId}/presence?${query}`,
                  undefined,
                  signal,
                ),
              );
            }),
          );
          const items = new Map<string, ThreadPresenceItem>();
          // Promise.all keeps cursor order even when responses arrive out of
          // order. Prefer the head's current version over overlapping pages.
          for (const page of pages) {
            for (const item of page.items) {
              if (item.creatorId !== creatorId)
                throw new Error("Wrong creator");
              const key = `${item.authorKind}:${item.id}`;
              if (!items.has(key)) items.set(key, item);
            }
          }
          const before = pages[pages.length - 1]!.nextBefore;
          if (before !== null && readCursors.includes(before))
            throw new Error("Repeated cursor");
          signal.throwIfAborted();
          if (suspended || started !== generation) continue;
          if (performance.now() >= freshUntil) throw new Error("Read expired");
          cursors = readCursors;
          nextBefore = before;
          if (includesOlder) olderPending = null;
          setState({
            scope,
            items: [...items.values()].sort(
              (a, b) =>
                a.occurredAt.localeCompare(b.occurredAt) ||
                a.id.localeCompare(b.id),
            ),
            hasOlder: before !== null,
            busy: olderPending !== null,
            failed: false,
            freshUntil,
          });
        } catch {
          // One failed sibling invalidates the entire retained window.
          readController.abort();
          if (
            !controller.signal.aborted &&
            !suspended &&
            started === generation
          ) {
            if (includesOlder) olderPending = null;
            setState({
              scope,
              items: [],
              hasOlder: false,
              busy: olderPending !== null,
              failed: true,
              freshUntil: 0,
            });
          }
        }
      } while (again && !controller.signal.aborted && !suspended);
      running = false;
    };
    load.current = (older = false) => {
      if (older) {
        if (olderPending !== null || nextBefore === null) return;
        olderPending = nextBefore;
        setState((previous) => ({ ...previous, busy: true }));
      }
      void refresh();
    };
    const conceal = () => {
      suspended = true;
      generation++;
      olderPending = null;
      readController?.abort();
      clear();
    };
    const visible = () => {
      if (document.visibilityState !== "visible") {
        conceal();
      } else if (navigator.onLine) {
        suspended = false;
        void refresh();
      }
    };
    const ended = () => {
      controller.abort();
      clear();
    };
    clear();
    if (online && !identity.signal.aborted) void refresh();
    identity.signal.addEventListener("abort", ended, { once: true });
    window.addEventListener("focus", visible);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(visible, 2000);
    return () => {
      controller.abort();
      load.current = () => {};
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
      identity.signal.removeEventListener("abort", ended);
    };
  }, [creatorId, scope, request, online, identity.signal]);

  // Match the Content view's five-second current-access window, measured from
  // the read's start. A stalled refresh cannot extend an older audience read.
  useEffect(() => {
    if (!state.freshUntil) return;
    const timer = setTimeout(
      () => {
        setState((previous) =>
          previous.freshUntil === state.freshUntil
            ? {
                ...previous,
                items: [],
                hasOlder: false,
                failed: true,
                freshUntil: 0,
              }
            : previous,
        );
      },
      Math.max(0, state.freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [state.freshUntil]);

  const current = online && state.scope === scope;
  const fresh = current && state.freshUntil > performance.now();
  return {
    items: fresh ? state.items : noPresence,
    hasOlder: fresh && state.hasOlder,
    busy: current && state.busy,
    failed: current && state.failed,
    loadOlder: () => load.current(true),
    refresh: () => load.current(),
  };
}

export function PresenceItem({ item }: { item: ThreadPresenceItem }) {
  return (
    <div data-presence-id={item.id}>
      {item.authorKind === "human_broadcast" ? (
        <Note
          name={item.creatorName}
          audience={item.audience.label}
          authorLabel={item.authorLabel}
          signedActId={item.signedActId}
          reply={false}
        >
          <span dir="auto" style={{ whiteSpace: "pre-wrap" }}>
            {item.text}
          </span>
        </Note>
      ) : (
        <ReactionChip
          name={item.creatorName}
          authorLabel={item.authorLabel}
          signedActId={item.signedActId}
        />
      )}
      {item.authorKind === "human_broadcast" && (
        <a
          className="qv-link-btn"
          href={`/content/${item.creatorId}/${item.id}`}
        >
          {formatCopy("noteReplyLabel", { name: item.creatorName })}
        </a>
      )}
    </div>
  );
}
