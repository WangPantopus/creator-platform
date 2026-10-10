"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useCallback, useEffect, useState } from "react";
import { useGrowthSession } from "./session";
interface LaunchState {
  publicPage: { path: string; name: string } | null;
  canInvite: boolean;
}
export function LaunchKit() {
  const { request, signal } = useGrowthSession();
  const [current, setCurrent] = useState<LaunchState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const value = await request<LaunchState>("launch");
      setCurrent(value);
      setLoadError("");
    } catch (error) {
      if (signal.aborted) return;
      setCurrent(null);
      setLoadError(
        error instanceof Error
          ? error.message
          : growthCopy.growthThisFeatureIsUnavailable,
      );
    }
  }, [request, signal]);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);
  return (
    <div className="growth-stack">
      <h1>{growthCopy.growthYourLaunchKit}</h1>
      <p>
        {growthCopy.growthShareYourPublicCreatorPageOrAnInvitationWithPeople}
      </p>
      {loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => void load()}
          >
            {growthCopy.growthTryAgain}
          </button>
        </div>
      ) : null}
      {current?.publicPage ? (
        <section className="growth-stack">
          <a href={current.publicPage.path}>
            {growthFormat("growthSPage", { value1: current.publicPage.name })}
          </a>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                // A handle or publication can change while this tab stays open.
                const fresh = await request<LaunchState>("launch");
                setCurrent(fresh);
                if (!fresh.publicPage)
                  throw new Error(growthCopy.growthCreatorUnavailable);
                const url = new URL(
                  fresh.publicPage.path,
                  window.location.origin,
                ).href;
                if (navigator.share)
                  await navigator.share({
                    url,
                    title: growthFormat("growthSPage", {
                      value1: fresh.publicPage.name,
                    }),
                  });
                else {
                  await navigator.clipboard.writeText(url);
                  signal.throwIfAborted();
                  setMessage(growthCopy.growthLinkCopied);
                }
              } catch (error) {
                if (signal.aborted) return;
                setMessage(
                  error instanceof Error
                    ? error.message
                    : growthCopy.growthTheLinkWasNotShared,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {growthCopy.growthShareLink}
          </button>
        </section>
      ) : current ? (
        <a href="/studio/ai">{growthCopy.growthPublishYourAiToStart}</a>
      ) : null}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy || !current?.canInvite}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setMessage("");
          try {
            const result = await request<{ id: string; expires_at: string }>(
              "invites",
              { method: "POST", body: JSON.stringify({ contextId: null }) },
            );
            const link = `${window.location.origin}/invite/${result.id}`;
            await navigator.clipboard.writeText(link);
            signal.throwIfAborted();
            setMessage(
              growthFormat("growthInvitationCopiedExpires", {
                value1: new Date(result.expires_at).toLocaleDateString(),
              }),
            );
          } catch (e) {
            if (signal.aborted) return;
            setMessage(
              e instanceof Error
                ? e.message
                : growthCopy.growthInvitationUnavailable,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {growthCopy.growthCreateAndCopyInvitation}
      </button>
      <p role="status">{message}</p>
      <p className="growth-help">
        {
          growthCopy.growthInvitationsExpireAfter30DaysNoMessagesAreSentAutomatically
        }
      </p>
      <section className="growth-stack">
        <h2>{growthCopy.growthWhatToReviewNext}</h2>
        <ol>
          <li>
            <a href="/studio/setup">{growthCopy.identityEditPublicProfile}</a>
          </li>
          <li>
            <a href="/studio/ai/sources">
              {growthCopy.growthReviewTheSourcesYourAiCanUse}
            </a>
          </li>
          <li>
            <a href="/studio/ai/test">
              {growthCopy.growthReviewYourAiSBoundariesAndUnresolvedTopics}
            </a>
          </li>
          <li>
            <a href="/notifications/settings">
              {growthCopy.growthNotificationSettings}
            </a>
          </li>
        </ol>
      </section>
    </div>
  );
}
