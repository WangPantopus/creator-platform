import Link from "next/link";
import { Button, Field, Panel } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function InterviewScreen({
  ai,
  state,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
}) {
  const {
    action,
    api,
    boundaries,
    controlsDisabled,
    router,
    setBoundaries,
    setStory,
    story,
  } = ai;
  return (
    <div className="w2-interview">
      <p>
        Tell your AI what you teach, how you speak, and where your boundaries
        are. Save and return whenever you like.
      </p>
      <Panel title="YOUR STORY">
        <Field label="Your story, experience and approach">
          <textarea
            rows={10}
            maxLength={20000}
            value={story}
            onChange={(e) => setStory(e.target.value)}
          />
        </Field>
        <Field label="Boundaries and subjects you avoid">
          <textarea
            rows={5}
            maxLength={10000}
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
          />
        </Field>
        <div className="w2-actions">
          <Button
            disabled={controlsDisabled}
            onClick={() =>
              void action(async () => {
                await api(
                  "interview",
                  {
                    expectedRevision: state.revision,
                    story,
                    boundaries,
                    audioConsent: false,
                  },
                  "PUT",
                );
              }, "Interview draft saved. It is not an approved source yet.")
            }
          >
            Save interview draft
          </Button>
          <Button
            disabled={controlsDisabled || !story.trim()}
            onClick={() =>
              void action(async () => {
                await api("sources", {
                  title: "Your interview",
                  text: `${story}\n\nBoundaries:\n${boundaries}`,
                  origin: "interview",
                  audience: { kind: "public" },
                  rightsEvidence:
                    "Creator-owned interview text submitted for explicit review and approved AI reuse.",
                  expiresAt: null,
                });
                router.push("/studio/ai/sources");
              }, "Interview candidate created. Review before approval.")
            }
          >
            Review as a source
          </Button>
        </div>
        <Button disabled>Record interview audio</Button>
        <span className="qv-help">
          Consented recording needs the configured media/transcription service.
          Text interviewing is available.
        </span>
      </Panel>
      <Link className="qv-link-btn" href="/studio/ai/sources">
        Skip interview and add your own sources
      </Link>
    </div>
  );
}
