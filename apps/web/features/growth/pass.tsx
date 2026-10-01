"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { createContext, useContext, useEffect, useState } from "react";
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
}: {
  children: React.ReactNode;
  creatorIds: string[];
  accountId?: string;
}) {
  const [access, setAccess] = useState<PassAccess | null>(null);
  const creators = creatorIds.join(",");
  useEffect(() => {
    const controller = new AbortController();
    setAccess(null);
    if (!accountId || !creators) return;
    let revision = 0;
    const load = () => {
      const current = ++revision;
      setAccess(null);
      void fetch(
        "/api/growth/discovery-access?creators=" + encodeURIComponent(creators),
        {
          headers: { "X-Expected-Account-Id": accountId },
          signal: controller.signal,
          cache: "no-store",
        },
      )
        .then(async (response) => {
          const result = response.ok
            ? ((await response.json()) as PassAccess)
            : null;
          if (!controller.signal.aborted && current === revision)
            setAccess(result);
        })
        .catch(() => {});
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(sessionChannel);
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") {
          controller.abort();
          setAccess(null);
        }
      };
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", load);
    load();
    return () => {
      controller.abort();
      channel?.close();
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [creators, accountId]);
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
