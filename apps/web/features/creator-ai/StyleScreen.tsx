import Link from "next/link";
import {
  FAQ_MIN_QUESTIONS,
  FAQ_PASS_RATE,
} from "../../../../packages/api/src/agent/contracts";
import { copy } from "@qelvora/copy";
import { FaqEditor } from "./FaqEditor";
import { Button, Field, Lines, Panel } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function StyleScreen({
  ai,
  state,
  configuration,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
  configuration: NonNullable<CreatorAIView["configuration"]>;
}) {
  const {
    action,
    api,
    busy,
    controlsDisabled,
    dirty,
    dirtyRef,
    draftEvaluationLink,
    draftRevision,
    edit,
    example,
    exampleEditors,
    exampleInput,
    navigate,
    pendingExampleFocus,
    save,
    setConfiguration,
    setDirty,
    setExample,
    setMessage,
    writeDraft,
  } = ai;
  return (
    <>
      <div className="w2-mode-grid">
        {(["expert", "companion", "blend"] as const).map((mode) => (
          <label
            key={mode}
            className={`w2-mode ${configuration.mode === mode ? "is-selected" : ""}`}
          >
            <span>
              <input
                type="radio"
                name="mode"
                checked={configuration.mode === mode}
                onChange={() => edit({ ...configuration, mode })}
              />
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </span>
            <span className="qv-help">
              {mode === "expert"
                ? "Answers only from your sources, hands off when it can’t."
                : mode === "companion"
                  ? "Your voice and memory, with stricter guardrails on closeness."
                  : "Both: expert answers, companion warmth."}
            </span>
          </label>
        ))}
      </div>
      <div className="w2-two-grid">
        <Panel title="STYLE CARD · FROM YOUR OWN REPLIES">
          <Field label="Style card">
            <textarea
              className="w2-style-card"
              rows={4}
              maxLength={4000}
              value={configuration.styleCard}
              onChange={(e) =>
                edit({ ...configuration, styleCard: e.target.value })
              }
            />
          </Field>
          <div className="w2-segments" role="group" aria-label="Tone">
            {(["Plainer", "As written", "Warmer"] as const).map((tone) => (
              <button
                key={tone}
                aria-pressed={tone === configuration.tone}
                onClick={() => edit({ ...configuration, tone })}
              >
                {tone}
              </button>
            ))}
          </div>
          <p className="qv-help">
            {configuration.examples.filter((e) => e.fixed && e.approved).length}{" "}
            fixed example replies anchor this voice ·{" "}
            {
              configuration.examples.filter((e) => !e.fixed && e.approved)
                .length
            }{" "}
            more in the pool · up to 20 fixed and 5 retrieved per turn
          </p>
          <details>
            <summary>Edit examples</summary>
            {configuration.examples.map((item) => (
              <div className="w2-example" key={item.id}>
                <textarea
                  ref={(editor) => {
                    if (editor) exampleEditors.current.set(item.id, editor);
                    else exampleEditors.current.delete(item.id);
                  }}
                  rows={2}
                  aria-label="Your own reply example"
                  value={item.text}
                  onChange={(e) =>
                    edit({
                      ...configuration,
                      examples: configuration.examples.map((ex) =>
                        ex.id === item.id
                          ? {
                              ...ex,
                              text: e.target.value,
                              approved: false,
                            }
                          : ex,
                      ),
                    })
                  }
                />
                <label>
                  <input
                    type="checkbox"
                    checked={item.approved}
                    onChange={(e) =>
                      edit({
                        ...configuration,
                        examples: configuration.examples.map((ex) =>
                          ex.id === item.id
                            ? { ...ex, approved: e.target.checked }
                            : ex,
                        ),
                      })
                    }
                  />{" "}
                  Creator-owned and approved
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={item.fixed}
                    onChange={(e) =>
                      edit({
                        ...configuration,
                        examples: configuration.examples.map((ex) =>
                          ex.id === item.id
                            ? { ...ex, fixed: e.target.checked }
                            : ex,
                        ),
                      })
                    }
                  />{" "}
                  Fixed in the version prefix
                </label>
                <Button
                  variant="quiet"
                  onClick={() => {
                    const index = configuration.examples.findIndex(
                      (example) => example.id === item.id,
                    );
                    pendingExampleFocus.current = {
                      id:
                        configuration.examples[index + 1]?.id ??
                        configuration.examples[index - 1]?.id ??
                        null,
                      from: document.activeElement,
                    };
                    edit({
                      ...configuration,
                      examples: configuration.examples.filter(
                        (ex) => ex.id !== item.id,
                      ),
                    });
                  }}
                >
                  Remove example
                </Button>
              </div>
            ))}
            <Field label="Add your own reply">
              <textarea
                ref={exampleInput}
                rows={3}
                value={example}
                maxLength={2000}
                onChange={(e) => setExample(e.target.value)}
              />
            </Field>
            <Button
              disabled={!example.trim()}
              onClick={() => {
                const id = crypto.randomUUID();
                pendingExampleFocus.current = {
                  id,
                  from: document.activeElement,
                };
                edit({
                  ...configuration,
                  examples: [
                    ...configuration.examples,
                    {
                      id,
                      text: example,
                      fixed:
                        configuration.examples.filter((e) => e.fixed).length <
                        20,
                      approved: false,
                    },
                  ],
                });
                setExample("");
              }}
            >
              Add example
            </Button>
          </details>
          <Button
            disabled={controlsDisabled || dirty || !state.capabilities.model}
            onClick={() =>
              void action(async () => {
                await api("style-card", {
                  expectedRevision: state.revision,
                });
              }, "Style card generated from approved replies.")
            }
          >
            Generate style card
          </Button>
          <span className="qv-help">
            Save approved examples first. A configured model is required;
            generation only runs when you ask.
          </span>
        </Panel>
        <Panel title="RULES">
          <Field label="Rules (one per line)">
            <Lines
              value={configuration.rules}
              onChange={(rules) => edit({ ...configuration, rules })}
              placeholder="No medical, legal or financial advice"
            />
          </Field>
          <span className="qv-meta">NEVER REVEAL</span>
          <Field label="Never-reveal details (one exact value per line)">
            <Lines
              value={configuration.neverReveal}
              onChange={(neverReveal) =>
                edit({ ...configuration, neverReveal })
              }
              placeholder="Private addresses, names, or sensitive facts"
            />
          </Field>
          <Field label="Hand off to you when">
            <textarea
              rows={2}
              value={configuration.handoff}
              maxLength={1000}
              onChange={(e) =>
                edit({ ...configuration, handoff: e.target.value })
              }
            />
          </Field>
          <Field label="Daily AI cost cap (USD; 0 pauses generation)">
            <input
              type="number"
              min={0}
              max={1000}
              step={0.01}
              value={configuration.dailyCostCapMicros / 1_000_000}
              onChange={(e) =>
                edit({
                  ...configuration,
                  dailyCostCapMicros: Math.round(
                    Number(e.target.value) * 1_000_000,
                  ),
                })
              }
            />
          </Field>
          <Field label="Companion session reminder (minutes)">
            <input
              type="number"
              min={15}
              max={90}
              value={configuration.sessionNudgeMinutes}
              onChange={(e) =>
                edit({
                  ...configuration,
                  sessionNudgeMinutes: Number(e.target.value),
                })
              }
            />
          </Field>
        </Panel>
        <Panel title="YOUR EVALUATION CRITERIA">
          <Field label="What makes an answer useful">
            <textarea
              value={configuration.usefulnessCriteria}
              rows={3}
              maxLength={2000}
              onChange={(e) =>
                edit({
                  ...configuration,
                  usefulnessCriteria: e.target.value,
                })
              }
            />
          </Field>
          <Field label="What sounds like your writing">
            <textarea
              value={configuration.styleCriteria}
              rows={3}
              maxLength={2000}
              onChange={(e) =>
                edit({
                  ...configuration,
                  styleCriteria: e.target.value,
                })
              }
            />
          </Field>
          <p className="qv-help">
            The fan always sees the AI label. Criteria measure usefulness and
            style.
          </p>
        </Panel>
        <Panel title={copy.creatorAiFaqTitle}>
          <FaqEditor
            value={configuration.faq ?? []}
            onChange={(faq) => edit({ ...configuration, faq })}
            disabled={controlsDisabled}
            minimum={FAQ_MIN_QUESTIONS}
            percent={Math.round(FAQ_PASS_RATE * 100)}
            live={Boolean(state.liveVersionId)}
          />
        </Panel>
      </div>
      <div className="w2-actions">
        <Button
          variant="ai"
          disabled={controlsDisabled || !dirty}
          onClick={() =>
            void action(
              save,
              "Draft saved. Previous evaluation evidence is invalidated.",
              draftEvaluationLink.current,
            )
          }
        >
          {busy ? "Saving…" : "Save draft"}
        </Button>
        {dirty && (
          <Button
            disabled={controlsDisabled}
            variant="quiet"
            onClick={() => {
              setConfiguration(state.configuration);
              dirtyRef.current = false;
              draftRevision.current = null;
              setDirty(false);
              writeDraft(
                "w2-config",
                state.actorAccountId,
                state.creator.id,
                null,
              );
              setMessage("Saved draft reloaded.");
            }}
          >
            Reload saved draft
          </Button>
        )}
        <Link
          ref={draftEvaluationLink}
          className="qv-btn qv-btn--quiet"
          href="/studio/ai/test"
          onClick={(e) => navigate(e, "/studio/ai/test")}
        >
          Run boundary evaluations
        </Link>
      </div>
    </>
  );
}
