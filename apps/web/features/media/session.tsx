"use client";
import { useEffect, useState } from "react";
import { useIdentityRequest } from "../identity/session-boundary";
import { configureMediaRequests } from "./api";

/** Mount only after requests carry the same account and cancellation boundary. */
export function MediaSession({ children }: { children: React.ReactNode }) {
  const { session, signal, end } = useIdentityRequest();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const release = configureMediaRequests({
      accountId: session.accountId,
      signal,
      end,
    });
    setReady(true);
    return release;
  }, [session.accountId, signal, end]);
  return ready ? children : <p role="status">Checking your current account…</p>;
}
