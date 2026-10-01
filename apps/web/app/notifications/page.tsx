import { copy as growthCopy } from "@qelvora/copy";
import { growthRequest } from "../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import { Inbox, Connection } from "../../features/growth/actions";
import type { InboxItem } from "../../features/growth/types";
export const dynamic = "force-dynamic";
export default async function Notifications() {
  try {
    const [{ notifications }, preferences] = await Promise.all([
      growthRequest<{
        notifications: InboxItem[];
      }>("notifications"),
      growthRequest<{ timeZone: string }>("preferences"),
    ]);
    return (
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
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/notifications" />
      </GrowthShell>
    );
  }
}
