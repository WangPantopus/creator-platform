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
            <span className="growth-meta">INSIGHTS · LAST CLOSED WEEK</span>
            <h1>What fans asked, and your sources couldn't answer</h1>
            <p className="growth-help">
              Only groups with at least five distinct fans appear. Closed weekly
              windows prevent repeated small filters from revealing individual
              questions.
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
                      {c.questionCount} unresolved signals from {c.fanCount}{" "}
                      fans · 7 days
                    </p>
                  </div>
                  <a
                    href={`#producer-${c.topicKey}`}
                    className="qv-btn qv-btn--secondary"
                  >
                    Answer once for everyone
                  </a>
                </article>
              ))
            ) : (
              <NoData title="No eligible question groups yet">
                Groups appear after a complete weekly evidence window, with at
                least five distinct fans. Individual questions stay private.
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
