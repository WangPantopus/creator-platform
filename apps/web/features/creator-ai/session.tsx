"use client";
import { useMemo } from "react";
import { CreatorAI } from "./CreatorAI";
import { useIdentityRequest } from "../identity/session-boundary";

export function CreatorAISession({ section }: { section: string }) {
  const { session, signal, end, isSessionEnded } = useIdentityRequest();
  const identity = useMemo(
    () => ({
      accountId: session.accountId,
      sessionId: session.sessionId,
      signal,
      end,
      isSessionEnded,
    }),
    [session.accountId, session.sessionId, signal, end, isSessionEnded],
  );
  return (
    <CreatorAI
      section={section}
      creatorId={session.creator?.id}
      identity={identity}
    />
  );
}
