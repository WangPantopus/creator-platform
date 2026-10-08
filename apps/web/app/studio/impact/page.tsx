import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../features/growth/server";
import { currentSession } from "../../../lib/session";
import { GrowthSessionBoundary } from "../../../features/growth/private-view";
export const dynamic = "force-dynamic";
interface Impact {
  window_start: string;
  unique_fans: number;
  ai_conversations: number;
  personal_replies: number;
  notes: number;
  thanks_count: number;
  consented_thanks: { text: string; displayName: string | null }[];
}
export default async function Impact() {
  const session = await currentSession("/studio/impact");
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
    const { impact } = await growthRequest<{ impact: Impact | null }>(
      "impact",
      init,
    );
    return (
      <GrowthSessionBoundary
        key={session.sessionId}
        initial={session}
        returnTo="/studio/impact"
      >
        <GrowthShell>
          <section className="growth-stack growth-invite qv-on-maya">
            <span className="growth-meta">
              {growthCopy.growthYourWeekImpact}
            </span>
            <h1>
              {impact
                ? growthFormat("growthImpactPeopleHelped", {
                    people: impact.unique_fans.toLocaleString("en-US"),
                  })
                : growthCopy.growthThePeopleYouHelpedThisWeek}
            </h1>
            {impact ? (
              <>
                <div className="growth-impact-counts">
                  {[
                    [impact.ai_conversations, growthCopy.growthAiConversations],
                    [impact.personal_replies, growthCopy.growthPersonalReplies],
                    [impact.thanks_count, growthCopy.growthThanks],
                    [impact.notes, growthCopy.navNotes],
                  ].map(([n, label]) => (
                    <div key={String(label)}>
                      <strong>
                        {typeof n === "number" ? n.toLocaleString("en-US") : n}
                      </strong>
                      <p>{label}</p>
                    </div>
                  ))}
                </div>
                {impact.consented_thanks.length > 0 && (
                  <h2 className="growth-meta">
                    {growthCopy.growthImpactThankYou}
                  </h2>
                )}
                {impact.consented_thanks.map((thanks, index) => (
                  <blockquote key={index} className="growth-voice">
                    “{thanks.text}”
                    {thanks.displayName ? (
                      <footer>{thanks.displayName}</footer>
                    ) : null}
                  </blockquote>
                ))}
                <p className="growth-help">
                  {growthFormat(
                    "growthSevenDaysFromThanksAppearOnlyWhenFansChooseTo",
                    { value1: impact.window_start.slice(0, 10) },
                  )}
                </p>
                <p className="growth-help">
                  {growthCopy.growthImpactWeekCounts}
                </p>
              </>
            ) : (
              <NoData title={growthCopy.growthNoUpdatesYet}>
                {growthCopy.growthImpactNotAvailable}
              </NoData>
            )}
          </section>
        </GrowthShell>
      </GrowthSessionBoundary>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/studio/impact" />
      </GrowthShell>
    );
  }
}
