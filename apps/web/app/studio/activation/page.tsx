import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { growthRequest } from "../../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
export const dynamic = "force-dynamic";
interface Activation {
  state: string;
  agent_version: number;
  due_at: string;
  completed_at: string | null;
  document: null | {
    sourceCount: number;
    conversations: number;
    usefulAnswers: number;
    unresolvedTopics: { topicKey: string; distinctFans: number }[];
    nextStep: string;
  };
}
export default async function ActivationPage() {
  try {
    const { activation } = await growthRequest<{
      activation: Activation | null;
    }>("activation");
    return (
      <GrowthShell studio>
        <section className="growth-stack">
          <h1>{growthCopy.growthYourFirst72Hours}</h1>
          {!activation ? (
            <NoData title={growthCopy.growthPublishYourAiToStart}>
              {
                growthCopy.growthYourFirstDigestAppearsAfterThe72HourObservationWindow
              }
            </NoData>
          ) : activation.state !== "sent" || !activation.document ? (
            <NoData
              title={
                activation.state === "blocked"
                  ? growthCopy.growthYourDigestNeedsAConnectedSource
                  : growthCopy.growthYourDigestIsBeingPrepared
              }
            >
              {growthFormat(
                "growthTheObservationWindowClosesCountsWillAppearAfterCurrentPublication",
                {
                  value1: new Date(activation.due_at).toLocaleDateString("en"),
                },
              )}
            </NoData>
          ) : (
            <>
              <p className="growth-meta">
                {growthFormat("growthPublishedAiVersion", {
                  value1: activation.agent_version,
                })}
              </p>
              <div className="growth-metrics">
                <div>
                  <strong>{activation.document.sourceCount}</strong>
                  <p>{growthCopy.growthApprovedSources}</p>
                </div>
                <div>
                  <strong>{activation.document.conversations}</strong>
                  <p>conversations</p>
                </div>
                <div>
                  <strong>{activation.document.usefulAnswers}</strong>
                  <p>{growthCopy.growthUsefulAnswers}</p>
                </div>
              </div>
              <h2>{growthCopy.growthWhatToReviewNext}</h2>
              <p>
                {activation.document.nextStep === "review_sources"
                  ? growthCopy.growthReviewTheSourcesYourAiCanUse
                  : activation.document.nextStep === "review_boundaries"
                    ? growthCopy.growthReviewYourAiSBoundariesAndUnresolvedTopics
                    : growthCopy.growthKeepYourSourcesCurrentAndReturnWhenYouHaveSomething}
              </p>
              {activation.document.unresolvedTopics.map((topic) => (
                <p key={topic.topicKey}>
                  {growthFormat("growthDistinctFans", {
                    value1: topic.topicKey.replaceAll("-", " "),
                    value2: topic.distinctFans,
                  })}
                </p>
              ))}
              <a href="/studio/insights">{growthCopy.growthOpenInsights}</a>
              <a href="/studio/launch">{growthCopy.growthOpenYourLaunchKit}</a>
            </>
          )}
        </section>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell studio>
        <Failure error={error} returnTo="/studio/activation" />
      </GrowthShell>
    );
  }
}
