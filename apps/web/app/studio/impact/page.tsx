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
          <span className="growth-meta">YOUR WEEK · IMPACT</span>
          <h1>The people you helped this week.</h1>
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
                  [impact.ai_conversations, "AI conversations"],
                  [impact.personal_replies, "Personal replies"],
                  [impact.thanks_count, "Thanks"],
                  [impact.notes, "Notes"],
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
                Seven days from {impact.window_start.slice(0, 10)}. Thanks
                appear only when fans choose to share them.
              </p>
            </>
          ) : (
            <NoData title="Your first digest is on its way">
              A weekly digest appears when the activity and consented Thanks
              sources are connected. No activity is inferred.
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
