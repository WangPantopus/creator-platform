"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CreatorPostVoiceRecording,
  type CreatorVoiceRecordingProps,
} from "../media/VoiceRecorder";
import { readCreatorMediaPolicy } from "../media/api";

/** W6 resolves the actual saved object and current configured purpose policy.
 * A transport ceiling or the separate Note rule cannot supply a product limit. */
export function PostVoiceAttachment(props: CreatorVoiceRecordingProps) {
  const [limit, setLimit] = useState<number | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const read = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const policy = await readCreatorMediaPolicy({
          creatorId: props.creatorId,
          objectId: props.objectId,
          purpose: "post_audio",
          signal,
        });
        if (
          policy.creatorId !== props.creatorId ||
          policy.objectId !== props.objectId ||
          policy.purpose !== "post_audio" ||
          !Number.isSafeInteger(policy.maxBytes) ||
          policy.maxBytes <= 0 ||
          !Number.isSafeInteger(policy.maxDurationMs) ||
          policy.maxDurationMs <= 0 ||
          policy.maxDurationMs > 3_600_000
        )
          throw new Error(
            "The approved recording limit is unavailable for this saved Post.",
          );
        if (!signal?.aborted) setLimit(policy.maxDurationMs);
      } catch (failure) {
        if (!signal?.aborted) {
          setLimit(null);
          setError(
            failure instanceof Error
              ? failure.message
              : "The current recording policy is unavailable.",
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [props.creatorId, props.objectId],
  );
  useEffect(() => {
    const abort = new AbortController();
    void read(abort.signal);
    return () => abort.abort();
  }, [read]);
  return (
    <section aria-label="Post voice attachment">
      {limit === null ? (
        <>
          <p role="status">
            {loading
              ? "Checking the approved Post recording limit…"
              : "Post recording is unavailable. Your written draft is saved."}
          </p>
          {error && <p className="qv-help">{error}</p>}
          <button
            className="qv-btn qv-btn--secondary"
            disabled={loading}
            onClick={() => void read()}
          >
            Check recording availability
          </button>
        </>
      ) : (
        <CreatorPostVoiceRecording {...props} maxDurationMs={limit} />
      )}
    </section>
  );
}
