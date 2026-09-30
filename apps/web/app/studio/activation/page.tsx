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
          <h1>Your first 72 hours</h1>
          {!activation ? (
            <NoData title="Publish your AI to start">
              Your first digest appears after the 72-hour observation window
              closes.
            </NoData>
          ) : activation.state !== "sent" || !activation.document ? (
            <NoData
              title={
                activation.state === "blocked"
                  ? "Your digest needs a connected source"
                  : "Your digest is being prepared"
              }
            >
              The observation window closes{" "}
              {new Date(activation.due_at).toLocaleDateString("en")}. Counts
              will appear after current publication and source evidence are
              checked.
            </NoData>
          ) : (
            <>
              <p className="growth-meta">
                PUBLISHED AI VERSION {activation.agent_version}
              </p>
              <div className="growth-metrics">
                <div>
                  <strong>{activation.document.sourceCount}</strong>
                  <p>approved sources</p>
                </div>
                <div>
                  <strong>{activation.document.conversations}</strong>
                  <p>conversations</p>
                </div>
                <div>
                  <strong>{activation.document.usefulAnswers}</strong>
                  <p>useful answers</p>
                </div>
              </div>
              <h2>What to review next</h2>
              <p>
                {activation.document.nextStep === "review_sources"
                  ? "Review the sources your AI can use."
                  : activation.document.nextStep === "review_boundaries"
                    ? "Review your AI's boundaries and unresolved topics."
                    : "Keep your sources current and return when you have something useful to share."}
              </p>
              {activation.document.unresolvedTopics.map((topic) => (
                <p key={topic.topicKey}>
                  {topic.topicKey.replaceAll("-", " ")} · {topic.distinctFans}{" "}
                  distinct fans
                </p>
              ))}
              <a href="/studio/insights">Open Insights</a>
              <a href="/studio/launch">Open your launch kit</a>
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
