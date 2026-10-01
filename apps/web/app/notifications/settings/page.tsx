import { copy as growthCopy } from "@qelvora/copy";
import { growthRequest } from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import {
  PreferenceForm,
  type PreferencesValue,
} from "../../../features/growth/preferences";
import { FeedbackForm } from "../../../features/growth/feedback";
export const dynamic = "force-dynamic";
export default async function Settings() {
  try {
    const [preferences, directory] = await Promise.all([
      growthRequest<PreferencesValue>("preferences"),
      growthRequest<{ creators: { id: string; name: string }[] }>(
        "preferences/creators",
      ),
    ]);
    return (
      <GrowthShell>
        <header className="growth-header">
          <h1>{growthCopy.growthNotificationSettings}</h1>
        </header>
        <PreferenceForm initial={preferences} creators={directory.creators} />
        <FeedbackForm />
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/notifications/settings" />
      </GrowthShell>
    );
  }
}
