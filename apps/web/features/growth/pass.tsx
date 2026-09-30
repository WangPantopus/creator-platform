"use client";
import { createContext, useContext, useEffect, useState } from "react";
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
}: {
  children: React.ReactNode;
}) {
  const [access, setAccess] = useState<PassAccess | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/growth/discovery-access", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok) setAccess(await response.json());
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
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
        ? "In your pass"
        : marker.state === "draft_next" && marker.startsAt
          ? `Joins ${new Date(marker.startsAt).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}`
          : "Not in your pass"}
    </p>
  );
}
