import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
import { growthRequest } from "../../../features/growth/server";
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
  try {
    const { impact } = await growthRequest<{ impact: Impact | null }>("impact");
    return (
      <GrowthShell>
        <section className="growth-stack growth-invite qv-on-maya">
          <span className="growth-meta">{growthCopy.growthYourWeekImpact}</span>
          <h1>{growthCopy.growthThePeopleYouHelpedThisWeek}</h1>
          {impact ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 28,
                }}
              >
                {[
                  [impact.ai_conversations, growthCopy.growthAiConversations],
                  [impact.personal_replies, growthCopy.growthPersonalReplies],
                  [impact.thanks_count, growthCopy.growthThanks],
                  [impact.notes, growthCopy.navNotes],
                ].map(([n, label]) => (
                  <div key={String(label)}>
                    <strong
                      style={{
                        fontSize: 44,
                        fontFamily: "var(--font-serif)",
                        fontWeight: 400,
                      }}
                    >
                      {n}
                    </strong>
                    <p>{label}</p>
                  </div>
                ))}
              </div>
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
            </>
          ) : (
            <NoData title={growthCopy.growthYourFirstDigestIsOnItsWay}>
              {
                growthCopy.growthAWeeklyDigestAppearsWhenTheActivityAndConsentedThanks
              }
            </NoData>
          )}
        </section>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/studio/impact" />
      </GrowthShell>
    );
  }
}
