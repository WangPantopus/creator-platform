"use client";
import { useEffect, useState } from "react";
import { studioRequest } from "../api";
import type { Creator, Queue } from "../shared/types";
export function useRequestsCount(creator: Creator | null, suspended: boolean) {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    setCount(undefined);
    if (
      !creator ||
      suspended ||
      (!creator.owned && !creator.roles.includes("triage"))
    )
      return;
    let closed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (closed || document.hidden || controller) return;
      const current = new AbortController();
      controller = current;
      try {
        const result = await studioRequest<Queue>(
          "studio",
          `${creator.id}/queue?filter=all&limit=1`,
          undefined,
          creator.viewerAccountId,
          {
            signal: AbortSignal.any([
              current.signal,
              AbortSignal.timeout(4000),
            ]),
          },
        );
        if (!closed && !document.hidden)
          setCount(
            Number.isSafeInteger(result.requests) && result.requests >= 0
              ? result.requests
              : undefined,
          );
      } catch {
        if (!closed) setCount(undefined);
      } finally {
        if (controller === current) controller = null;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        controller?.abort();
        setCount(undefined);
      } else void load();
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      closed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [
    creator?.id,
    creator?.viewerAccountId,
    creator?.owned,
    creator?.roles,
    suspended,
  ]);
  return count;
}
