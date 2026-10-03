"use client";
import { useEffect } from "react";
import { discardPrivateSessionBuffers } from "./private-session-buffers";
import { sessionChannel } from "./session-boundary";

/** One canonical negative observer also covers public documents and departed
 * features. It creates no identity, request signal or session lifetime. */
export function PrivateSessionCleanup() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(sessionChannel);
    } catch {
      // Local explicit and genuine scoped cleanup do not depend on this API.
      return;
    }
    channel.onmessage = (event) => {
      if (event.data === "ended") discardPrivateSessionBuffers();
    };
    return () => channel.close();
  }, []);
  return null;
}
