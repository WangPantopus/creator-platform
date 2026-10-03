"use client";
import { useEffect } from "react";
import { sessionChannel } from "../identity/session-boundary";
import { purgeRecordingRetries } from "./recording-retry-storage";

/** Load the existing producer's negative observer on cold Account pages too.
 * It can only discard W6 metadata; it issues no session or request authority. */
export function RecordingRetryCleanup() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(sessionChannel);
    channel.onmessage = (event) => {
      if (event.data === "ended") purgeRecordingRetries();
    };
    return () => channel.close();
  }, []);
  return null;
}
