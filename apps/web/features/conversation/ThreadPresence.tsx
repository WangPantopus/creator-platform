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
 * snapshot. Re-read every loaded page so withdrawal, edits and lost membership
 * replace the whole projection rather than leaving older private text behind. */
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
    let depth = 1,
      running = false,
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
        const freshUntil = performance.now() + 5000;
        readController = new AbortController();
        const signal = AbortSignal.any([
          controller.signal,
          readController.signal,
          AbortSignal.timeout(5000),
        ]);
        setState((previous) => ({ ...previous, busy: true }));
        try {
          const items = new Map<string, ThreadPresenceItem>();
          let before: string | null = null;
          for (let index = 0; index < depth; index++) {
            const query = new URLSearchParams({ limit: "50" });
            if (before) query.set("before", before);
            const page = ThreadPresencePage.parse(
              await request<unknown>(
                `${creatorId}/presence?${query}`,
                undefined,
                signal,
              ),
            );
            for (const item of page.items) {
              if (item.creatorId !== creatorId)
                throw new Error("Wrong creator");
              items.set(`${item.authorKind}:${item.id}`, item);
            }
            before = page.nextBefore;
            if (!before) {
              depth = index + 1;
              break;
            }
          }
          signal.throwIfAborted();
          if (suspended || started !== generation) continue;
          if (performance.now() >= freshUntil) throw new Error("Read expired");
          setState({
            scope,
            items: [...items.values()].sort(
              (a, b) =>
                a.occurredAt.localeCompare(b.occurredAt) ||
                a.id.localeCompare(b.id),
            ),
            hasOlder: before !== null,
            busy: false,
            failed: false,
            freshUntil,
          });
        } catch {
          if (
            !controller.signal.aborted &&
            !suspended &&
            started === generation
          )
            setState({
              scope,
              items: [],
              hasOlder: false,
              busy: false,
              failed: true,
              freshUntil: 0,
            });
        }
      } while (again && !controller.signal.aborted && !suspended);
      running = false;
    };
    load.current = (older = false) => {
      if (older && !running) depth++;
      void refresh();
    };
    const conceal = () => {
      suspended = true;
      generation++;
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
