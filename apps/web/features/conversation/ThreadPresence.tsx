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
  }>({ scope, items: [], hasOlder: false, busy: false, failed: false });
  const load = useRef<(older?: boolean) => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let depth = 1,
      running = false,
      again = false;
    const clear = () =>
      setState({
        scope,
        items: [],
        hasOlder: false,
        busy: false,
        failed: false,
      });
    const refresh = async () => {
      if (controller.signal.aborted || !online) return;
      if (running) {
        again = true;
        return;
      }
      running = true;
      do {
        again = false;
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
                controller.signal,
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
          controller.signal.throwIfAborted();
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
          });
        } catch {
          if (!controller.signal.aborted)
            setState({
              scope,
              items: [],
              hasOlder: false,
              busy: false,
              failed: true,
            });
        }
      } while (again && !controller.signal.aborted);
      running = false;
    };
    load.current = (older = false) => {
      if (older && !running) depth++;
      void refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void refresh();
    };
    const ended = () => {
      controller.abort();
      clear();
    };
    clear();
    if (online && !identity.signal.aborted) void refresh();
    identity.signal.addEventListener("abort", ended, { once: true });
    window.addEventListener("focus", visible);
    const timer = setInterval(visible, 15000);
    return () => {
      controller.abort();
      load.current = () => {};
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      identity.signal.removeEventListener("abort", ended);
    };
  }, [creatorId, scope, request, online, identity.signal]);

  const current = online && state.scope === scope;
  return {
    items: current ? state.items : [],
    hasOlder: current && state.hasOlder,
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
