import { validReturnTarget } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import { currentSession } from "../../../lib/session";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
import { OpenNotification } from "../../../features/growth/notification-arrival";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** An ID is an arrival reference. The current authenticated owner lookup,
 * rather than cached list data or URL payload, supplies the destination. */
export default async function NotificationArrival({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const validId =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(id);
  const session = validId ? await currentSession(`/notifications/${id}`) : null;
  try {
    if (!validId)
      throw new GrowthUnavailable(
        404,
        "notification_unavailable",
        copy.growthThisDestinationIsNoLongerAvailable,
      );
    if (!session)
      throw new GrowthUnavailable(
        401,
        "session_required",
        copy.growthContinueWithPantopusToOpenYourAccountSCurrentState,
      );
    const current = await growthRequest<{
      id: string;
      available: boolean;
      destination: string;
    }>(`notifications/${id}`, {
      headers: { "X-Expected-Account-Id": session.accountId },
    });
    if (
      current.id !== id ||
      current.available !== true ||
      !validReturnTarget(current.destination)
    )
      throw new GrowthUnavailable(
        404,
        "notification_unavailable",
        copy.growthThisDestinationIsNoLongerAvailable,
      );
    return (
      <IdentitySessionBoundary
        key={session.sessionId}
        initial={session}
        returnTo={`/notifications/${id}`}
      >
        <GrowthShell>
          <OpenNotification id={id} />
        </GrowthShell>
      </IdentitySessionBoundary>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure
          error={error}
          returnTo={validId ? `/notifications/${id}` : "/notifications"}
        />
      </GrowthShell>
    );
  }
}
