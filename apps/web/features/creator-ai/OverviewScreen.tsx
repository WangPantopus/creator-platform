import Link from "next/link";
import { brand } from "@qelvora/brand";
import { AuthorLabel } from "@qelvora/ui-web";
import { Button } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function OverviewScreen({
  ai,
  state,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
}) {
  const { action, api, controlsDisabled, versionNumber } = ai;
  return (
    <>
      <p className="w2-intro">
        Uses your approved writing and sources. It stays labeled as AI and never
        claims human feelings, memories or promises your time.
      </p>
      <section className="w2-live">
        <div className="w2-between">
          <AuthorLabel kind="ai" name={state.creator.name} />
          <span className="qv-badge qv-ink-ai">
            {versionNumber
              ? `${state.paused ? "Paused" : "Live"} · v${versionNumber}`
              : "Draft · not published"}
          </span>
        </div>
        <div className="w2-stats">
          {["conversations this week", "asked for you", "flagged by you"].map(
            (label) => (
              <div key={label}>
                <span>—</span>
                <span className="qv-help">{label}</span>
              </div>
            ),
          )}
        </div>
        <p className="qv-help">
          Conversation activity appears when the thread and digest services are
          connected.
        </p>
        <div className="w2-actions">
          <Button
            disabled={controlsDisabled || !state.liveVersionId}
            onClick={() =>
              void action(async () => {
                await api("pause");
              }, "Your AI is paused.")
            }
          >
            Pause my AI
          </Button>
          <Link className="qv-btn qv-btn--quiet" href="/studio/ai/test">
            Test it as a fan
          </Link>
        </div>
      </section>
      <section className="w2-digest">
        <span className="qv-meta">
          {versionNumber
            ? `SINCE YOU PUBLISHED V${versionNumber}`
            : "YOUR FIRST PUBLISHED AI"}
        </span>
        <p>
          For the first 72 hours after publication, every AI reply is available
          for your review.
        </p>
        <p className="qv-help">
          {state.liveVersionId
            ? "The reply digest needs the connected conversation service."
            : "No replies yet. Approve sources, define your style, and run the boundary evaluations before publication."}
        </p>
        <div className="w2-actions">
          <Link className="qv-btn qv-btn--secondary" href="/studio/ai/sources">
            Sources
          </Link>
          <Link className="qv-btn qv-btn--secondary" href="/studio/ai/style">
            Style and rules
          </Link>
          <Link className="qv-btn qv-btn--secondary" href="/studio/ai/license">
            License and sponsorships
          </Link>
          <Link className="qv-btn qv-btn--quiet" href="/studio/ai/interview">
            Your interview
          </Link>
        </div>
        <p className="qv-help">
          Sources, style, rules and versions are easier on a bigger screen. Open{" "}
          {brand.studioName} on your computer.
        </p>
      </section>
    </>
  );
}
