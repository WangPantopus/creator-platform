import { copy as growthCopy } from "@qelvora/copy";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../features/growth/server";
import { currentSession } from "../../../lib/session";
import { GrowthSessionBoundary } from "../../../features/growth/private-view";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import {
  PreferenceForm,
  type PreferencesValue,
} from "../../../features/growth/preferences";
import { FeedbackForm } from "../../../features/growth/feedback";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const session = await currentSession("/notifications/settings");
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
    const [preferences, directory] = await Promise.all([
      growthRequest<PreferencesValue>("preferences", init),
      growthRequest<{ creators: { id: string; name: string }[] }>(
        "preferences/creators",
        init,
      ),
    ]);
    return (
      <GrowthSessionBoundary
        initial={session}
        returnTo="/notifications/settings"
      >
        <GrowthShell>
          <header className="growth-header">
            <h1>{growthCopy.growthNotificationSettings}</h1>
          </header>
          <PreferenceForm initial={preferences} creators={directory.creators} />
          <FeedbackForm />
        </GrowthShell>
      </GrowthSessionBoundary>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/notifications/settings" />
      </GrowthShell>
    );
  }
}
