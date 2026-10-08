"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Notice } from "@qelvora/ui-web";
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
  if (!session.creator)
    return (
      <main className="foundation">
        <h1>Set up your creator identity</h1>
        <Notice title="Continue setting up">
          Add your creator name and public handle before configuring your AI.
          Your draft stays private while verification is pending.
        </Notice>
        <Link className="qv-link-btn" href="/studio/setup">
          Continue creator setup
        </Link>
      </main>
    );
  return (
    <CreatorAI
      section={section}
      creatorId={session.creator?.id}
      identity={identity}
    />
  );
}
