"use client";
import { useMemo } from "react";
import { CreatorAI } from "./CreatorAI";
import { useIdentityRequest } from "../identity/session-boundary";

export function CreatorAISession({ section }: { section: string }) {
  const { session, signal, end } = useIdentityRequest();
  const identity = useMemo(
    () => ({
      accountId: session.accountId,
      sessionId: session.sessionId,
      signal,
      end,
    }),
    [session.accountId, session.sessionId, signal, end],
  );
  return (
    <CreatorAI
      section={section}
      creatorId={session.creator?.id}
      identity={identity}
    />
  );
}
