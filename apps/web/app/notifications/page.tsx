import { copy as growthCopy } from "@qelvora/copy";
import { growthRequest, GrowthUnavailable } from "../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import { Inbox, Connection } from "../../features/growth/actions";
import type { InboxItem } from "../../features/growth/types";
import { currentSession } from "../../lib/session";
import { IdentitySessionBoundary } from "../../features/identity/session-boundary";
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
    const init = { headers: { "X-Expected-Account-Id": session.accountId } };
    const [{ notifications }, preferences] = await Promise.all([
      growthRequest<{
        notifications: InboxItem[];
      }>("notifications", init),
      growthRequest<{ timeZone: string }>("preferences", init),
    ]);
    return (
      <IdentitySessionBoundary
        key={session.sessionId}
        initial={session}
        returnTo="/notifications"
      >
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
      </IdentitySessionBoundary>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/notifications" />
      </GrowthShell>
    );
  }
}
