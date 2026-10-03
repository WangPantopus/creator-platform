"use client";
import { useEffect, useState } from "react";
import { growthContracts } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import type { PostEntryContext } from "../../../../packages/api/src/growth";
import { useGrowthSession } from "../growth/session";

/** Display metadata on the actual current account lifetime. Neither this
 * reference nor the expected-account header grants generation permission. */
export function PostEntryReference({
  handle,
  creatorId,
  contentId,
}: {
  handle: string;
  creatorId: string;
  contentId: string;
}) {
  const { request, signal } = useGrowthSession();
  const [post, setPost] = useState<PostEntryContext | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    let reading = false;
    const conceal = () => {
      sequence++;
      setPost(null);
    };
    const refresh = async () => {
      if (document.visibilityState !== "visible") {
        conceal();
        return;
      }
      if (reading || controller.signal.aborted || signal.aborted) return;
      reading = true;
      conceal();
      const current = sequence;
      setError("");
      try {
        const result = await request<unknown>(
          `creators/${encodeURIComponent(handle)}/posts/${contentId}/context`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(5000),
            ]),
          },
        );
        const value =
          growthContracts.PostEntryContextResponseSchema.parse(result).context;
        if (
          value.creatorId !== creatorId ||
          value.contentId !== contentId ||
          value.destination !== `/creators/${handle}/posts/${contentId}`
        )
          throw new Error();
        if (
          sequence === current &&
          !signal.aborted &&
          !controller.signal.aborted &&
          document.visibilityState === "visible"
        )
          setPost(value);
      } catch {
        if (
          sequence === current &&
          !controller.signal.aborted &&
          !signal.aborted
        )
          setError(copy.growthThisDestinationIsUnavailableReconnectAndTryAgain);
      } finally {
        reading = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    signal.addEventListener("abort", conceal);
    void refresh();
    return () => {
      sequence++;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      signal.removeEventListener("abort", conceal);
    };
  }, [handle, creatorId, contentId, request, signal]);
  return (
    <>
      {post && (
        <div className="qv qv-context">
          <div className="qv-context__text">
            <span className="qv-meta">{copy.growthFromAPost}</span>
            <span>{post.title}</span>
          </div>
          <a
            className="qv-icon-btn"
            aria-label={copy.removeContext}
            href={`/creators/${handle}/chat`}
          >
            ×
          </a>
        </div>
      )}
      {error && <Notice title="Post context unavailable">{error}</Notice>}
    </>
  );
}
