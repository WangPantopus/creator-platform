"use client";
import { useEffect } from "react";
import { SessionSchema } from "@qelvora/api";
import {
  capturePrivateBufferMarkers,
  discardInactivePrivateSessionBuffers,
} from "./private-session-buffers";
import { sessionChannel } from "./session-boundary";

/** One canonical negative observer also covers public documents and departed
 * features. A bounded canonical reread supplies no acting scope or lifetime. */
export function PrivateSessionCleanup() {
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(sessionChannel);
    } catch {
      // Canonical load/resume checks and scoped cleanup remain available.
    }
    let active = true;
    let checking = false;
    let pending = false;
    const check = async () => {
      if (!active) return;
      if (checking) {
        pending = true;
        return;
      }
      checking = true;
      const markers = capturePrivateBufferMarkers();
      try {
        const options = {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        } satisfies RequestInit;
        let response = await fetch("/api/platform/identity/session", options);
        if (response.status === 401)
          response = await fetch("/api/platform/identity/session", options);
        if (!active) return;
        const current = response.ok
          ? SessionSchema.parse(await response.json())
          : response.status === 401
            ? null
            : undefined;
        if (active && current !== undefined)
          discardInactivePrivateSessionBuffers(markers, current);
      } catch {
        // An unknown or unreadable response does not establish session end.
      } finally {
        checking = false;
        if (active && pending) {
          pending = false;
          void check();
        }
      }
    };
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") void check();
      };
    const resume = () => {
      if (!document.hidden) void check();
    };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    void check();
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return null;
}
