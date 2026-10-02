import { redirect } from "next/navigation";
import { validReturnTarget } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";

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
  let target: string;
  try {
    if (!validId)
      throw new GrowthUnavailable(
        404,
        "notification_unavailable",
        copy.growthThisDestinationIsNoLongerAvailable,
      );
    const current = await growthRequest<{
      id: string;
      available: boolean;
      destination: string;
    }>(`notifications/${id}`);
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
    target = current.destination;
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
  // Next redirect throws; it must remain outside the lookup/recovery catch.
  redirect(target);
}
