"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { validReturnTarget } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { GrowthActionError, useGrowthSession } from "./session";

/** Only an actually opened page records a read. Server rendering/prefetch is
 * read-only, and every action retains the original W1 session lifetime. */
export function OpenNotification({ id }: { id: string }) {
  const { request, signal } = useGrowthSession();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{
    message: string;
    signIn: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setFailure(null);
    const currentDestination = async () => {
      const current = await request<{
        id: string;
        available: boolean;
        destination: string;
      }>(`notifications/${id}`, { signal: controller.signal });
      if (
        current.id !== id ||
        current.available !== true ||
        !validReturnTarget(current.destination)
      )
        throw new Error(copy.growthThisDestinationIsNoLongerAvailable);
      return current.destination;
    };
    void (async () => {
      await currentDestination();
      const acknowledgement = await request<{ read: boolean }>(
        `notifications/${id}/read`,
        {
          method: "PUT",
          body: "{}",
          signal: controller.signal,
        },
      );
      if (acknowledgement.read !== true)
        throw new Error(copy.growthCouldNotOpenUpdate);
      // The source may have ended while the read was saved. Navigate only to
      // a fresh owner destination, never the server snapshot or URL payload.
      const destination = await currentDestination();
      if (active && !signal.aborted && !controller.signal.aborted)
        router.replace(destination);
    })().catch((error: unknown) => {
      if (!active || signal.aborted || controller.signal.aborted) return;
      setFailure({
        message:
          error instanceof Error
            ? error.message
            : copy.growthCouldNotOpenUpdate,
        signIn: error instanceof GrowthActionError && error.status === 401,
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, request, signal, router, attempt]);

  return (
    <section className="growth-stack">
      <div role={failure ? "alert" : "status"}>
        <Notice title={copy.growthNotifications}>
          {failure?.message ?? copy.growthLoading2}
        </Notice>
      </div>
      {failure &&
        (failure.signIn ? (
          <a
            className="qv-btn qv-btn--secondary"
            href={`/auth/continue?returnTo=${encodeURIComponent(`/notifications/${id}`)}`}
          >
            {copy.continueWithPantopus}
          </a>
        ) : (
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {copy.growthTryAgain}
          </button>
        ))}
      <a className="qv-btn qv-btn--quiet" href="/notifications">
        {copy.growthNotifications}
      </a>
    </section>
  );
}
