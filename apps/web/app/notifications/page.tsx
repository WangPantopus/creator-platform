import { copy as growthCopy } from "@qelvora/copy";
import { growthRequest, GrowthUnavailable } from "../../features/growth/server";
import { currentSession } from "../../lib/session";
import { GrowthSessionBoundary } from "../../features/growth/private-view";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import { Inbox, Connection } from "../../features/growth/actions";
import type { InboxItem } from "../../features/growth/types";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  const session = await currentSession("/notifications");
  try {
    if (!session)
      throw new GrowthUnavailable(
        401,
        "session_required",
        growthCopy.growthContinueWithPantopusToOpenYourAccountSCurrentState,
      );
    const init = {
      headers: {
        "X-Expected-Account-Id": session.accountId,
        "X-Expected-Session-Id": session.sessionId,
      },
    };
    const [{ notifications }, preferences] = await Promise.all([
      growthRequest<{
        notifications: InboxItem[];
      }>("notifications", init),
      growthRequest<{ timeZone: string }>("preferences", init),
    ]);
    return (
      <GrowthSessionBoundary initial={session} returnTo="/notifications">
        <GrowthShell>
          <Connection />
          <header className="growth-header">
            <h1>{growthCopy.growthNotifications}</h1>
            <a href="/notifications/settings">{growthCopy.growthSettings}</a>
          </header>
          <section className="growth-stack">
            {notifications.length ? (
              <Inbox items={notifications} timeZone={preferences.timeZone} />
            ) : (
              <NoData title={growthCopy.growthNoUpdatesYet}>
                {growthCopy.growthYourInAppRecordWillAppearHerePushAndEmail}
              </NoData>
            )}
          </section>
        </GrowthShell>
      </GrowthSessionBoundary>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/notifications" />
      </GrowthShell>
    );
  }
}
