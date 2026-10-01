import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { growthRequest } from "../../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
import { Producer } from "../../../features/growth/actions";
import type { Cluster } from "../../../features/growth/types";
export const dynamic = "force-dynamic";
export default async function Insights() {
  try {
    const { clusters } = await growthRequest<{ clusters: Cluster[] }>(
      "insights",
    );
    return (
      <GrowthShell studio>
        <div className="growth-studio-content">
          <section className="growth-stack">
            <span className="growth-meta">
              {growthCopy.growthInsightsLastClosedWeek}
            </span>
            <h1>{growthCopy.growthWhatFansAskedAndYourSourcesCouldnTAnswer}</h1>
            <p className="growth-help">
              {
                growthCopy.growthOnlyGroupsWithAtLeastFiveDistinctFansAppearClosed
              }
            </p>
            {clusters.length ? (
              clusters.map((c) => (
                <article
                  className="growth-card growth-cluster"
                  key={c.topicKey}
                >
                  <div>
                    <strong>{c.topicKey.replaceAll("-", " ")}</strong>
                    <p className="growth-help">
                      {growthFormat("growthUnresolvedSignalsFromFans7Days", {
                        value1: c.questionCount,
                        value2: c.fanCount,
                      })}
                    </p>
                  </div>
                  <a
                    href={`#producer-${c.topicKey}`}
                    className="qv-btn qv-btn--secondary"
                  >
                    {growthCopy.growthAnswerOnceForEveryone}
                  </a>
                </article>
              ))
            ) : (
              <NoData title={growthCopy.growthNoEligibleQuestionGroupsYet}>
                {
                  growthCopy.growthGroupsAppearAfterACompleteWeeklyEvidenceWindowWithAt
                }
              </NoData>
            )}
          </section>
          <div
            style={{
              marginTop: 64,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {clusters.map((c) => (
              <div key={c.topicKey} id={`producer-${c.topicKey}`}>
                <Producer cluster={c} />
              </div>
            ))}
          </div>
        </div>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell studio>
        <Failure error={error} returnTo="/studio/insights" />
      </GrowthShell>
    );
  }
}
