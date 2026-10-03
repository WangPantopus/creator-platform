"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { createContext, useContext, useEffect, useState } from "react";
import { SessionSchema } from "@qelvora/api";
import { sessionChannel } from "../identity/session-boundary";
interface PassAccess {
  enabled: boolean;
  markers: {
    creatorId: string;
    state: "active" | "draft_next" | "none";
    startsAt: string | null;
  }[];
}
const Context = createContext<PassAccess | null>(null);
export function PassAccessProvider({
  children,
  creatorIds,
  accountId,
  sessionId,
}: {
  children: React.ReactNode;
  creatorIds: string[];
  accountId?: string;
  sessionId?: string;
}) {
  const [access, setAccess] = useState<PassAccess | null>(null);
  const creators = creatorIds.join(",");
  useEffect(() => {
    let controller: AbortController | null = null;
    setAccess(null);
    if (!accountId || !sessionId || !creators) return;
    let revision = 0;
    let ended = false;
    const clear = () => {
      revision++;
      controller?.abort();
      controller = null;
      setAccess(null);
    };
    const load = () => {
      if (document.visibilityState !== "visible") {
        clear();
        return;
      }
      if (ended || controller) return;
      const current = ++revision;
      const pending = new AbortController();
      controller = pending;
      const options = {
        headers: { "X-Expected-Account-Id": accountId },
        signal: AbortSignal.any([pending.signal, AbortSignal.timeout(10000)]),
        cache: "no-store",
      } satisfies RequestInit;
      const originalSession = async () => {
        const response = await fetch("/api/platform/identity/session", options);
        if (!response.ok) throw new Error("Current session unavailable.");
        const session = SessionSchema.parse(await response.json());
        if (
          session.accountId !== accountId ||
          session.sessionId !== sessionId
        ) {
          ended = true;
          throw new Error("Session changed.");
        }
      };
      void (async () => {
        // Actual W1 session reads bookend private markers. The expected
        // account header is a mismatch precondition, never authority.
        await originalSession();
        const response = await fetch(
          "/api/growth/discovery-access?creators=" +
            encodeURIComponent(creators),
          options,
        );
        const result = response.ok
          ? ((await response.json()) as PassAccess)
          : null;
        await originalSession();
        if (
          !pending.signal.aborted &&
          current === revision &&
          document.visibilityState === "visible"
        )
          setAccess(result);
      })()
        .catch(() => {
          if (current === revision) setAccess(null);
        })
        .finally(() => {
          if (controller === pending) controller = null;
        });
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(sessionChannel);
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") {
          ended = true;
          clear();
        }
      };
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", load);
    const timer = setInterval(load, 4000);
    load();
    return () => {
      revision++;
      controller?.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [creators, accountId, sessionId]);
  return <Context.Provider value={access}>{children}</Context.Provider>;
}
export function PassMarker({ creatorId }: { creatorId: string }) {
  const access = useContext(Context);
  if (!access?.enabled) return null;
  const marker = access.markers.find((value) => value.creatorId === creatorId);
  if (!marker) return null;
  return (
    <p className="growth-meta">
      {marker.state === "active"
        ? growthCopy.growthInYourPass
        : marker.state === "draft_next" && marker.startsAt
          ? growthFormat("growthJoins", {
              value1: new Date(marker.startsAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }),
            })
          : growthCopy.growthNotInYourPass}
    </p>
  );
}
