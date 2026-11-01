"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import type { StudioFailure } from "../api";

/** The open screen's read, re-run by the server on Studio's live stream
 * (backend `modules/studio/live.ts`). */
export type LiveView = {
  view: "notes" | "threads" | "thread" | "team" | "thanks";
  fan?: string;
  filter?: string;
  cursor?: string | null;
};
/** `revision` grows when the read's fingerprint changes and once after each
 * reconnect that was not a routine renewal; the screen then reads again.
 * `error` is the server's refusal of that read: the screen hides its content. */
export type LiveViewState = {
  key: string;
  revision: number;
  error?: StudioFailure;
};
export const liveQuery = ({ view, fan, filter, cursor }: LiveView) =>
  new URLSearchParams(
    Object.entries({ view, fan, filter, cursor }).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    ),
  ).toString();
export const StudioLive = createContext<{
  state?: LiveViewState;
  watch(query: string): void;
}>({ watch: () => undefined });
/** Declares the screen's read and returns its live state. */
export function useLiveView(view: LiveView) {
  const live = useContext(StudioLive),
    key = liveQuery(view);
  const { watch } = live;
  useEffect(() => {
    watch(key);
    return () => watch("");
  }, [watch, key]);
  return live.state?.key === key
    ? live.state
    : { key, revision: 0, error: undefined };
}
/** For panels inside a screen: the screen's live state without declaring a read. */
export function useLiveState() {
  return useContext(StudioLive).state;
}
/** Reads whenever the live revision grows. A revision that arrives during a
 * read is read once more afterwards, never dropped; a hidden tab waits for the
 * reconnect that follows its return. */
export function useLiveReload(
  state: { key: string; revision: number },
  read: () => Promise<unknown>,
) {
  const latest = useRef(read),
    progress = useRef({
      key: "",
      running: false,
      mounted: false,
      wanted: 0,
      done: 0,
    });
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    const p = progress.current;
    p.mounted = true;
    return () => {
      p.mounted = false;
    };
  }, []);
  useEffect(() => {
    const p = progress.current;
    if (p.key !== state.key)
      Object.assign(p, { key: state.key, wanted: 0, done: 0 });
    p.wanted = state.revision;
    if (!p.running) {
      p.running = true;
      void (async () => {
        try {
          while (p.mounted && p.done < p.wanted && !document.hidden) {
            p.done = p.wanted;
            await latest.current().catch(() => undefined);
          }
        } finally {
          p.running = false;
        }
      })();
    }
    // A screen discards a read in flight when its effects restart, so a
    // restarted effect reads this revision again.
    return () => {
      p.done = 0;
    };
  }, [state.key, state.revision]);
}
