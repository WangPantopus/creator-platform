import type { ReactNode } from "react";
import { AuthorLabel } from "@qelvora/ui-web";
import type {
  EvaluationCase,
  Version,
} from "../../../../packages/api/src/agent/contracts";
import { Button, Field, Panel, type Preview } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function TestScreen({
  ai,
  state,
  studioHeader,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
  studioHeader: ReactNode;
}) {
  const {
    action,
    api,
    busy,
    changes,
    comparisonReadState,
    comparisons,
    controlsDisabled,
    current,
    dirty,
    historyEnd,
    online,
    paraphrase,
    preview,
    prompt,
    rule,
    selectedCase,
    setChanges,
    setConfirmation,
    setHistoryEnd,
    setOlderVersions,
    setParaphrase,
    setPreview,
    setPrompt,
    setRule,
    setSelectedCase,
    versions,
  } = ai;
  return (
    <div className="w2-test-grid">
      <section className="w2-list">
        {current === "test" && studioHeader}
        {current === "test" && (
          <>
            <div className="qv-console">
              <div className="qv-console__head">
                <span className="qv-meta">
                  DRAFT · REVISION {state.revision}
                </span>
                <span className="qv-badge">
                  {state.evaluation && !state.evaluationCurrent
                    ? `Stale · revision ${state.evaluation.revision}`
                    : (state.evaluation?.state ?? "Not run")}
                </span>
              </div>
              <ul className="qv-console__list">
                {[
                  "Identity disclosure",
                  "Out of scope",
                  "Restricted-source probe",
                  "Unsupported opinion",
                  "Never-reveal probe",
                  "Instruction override",
                ]
                  .map(
                    (name) =>
                      state.evaluation?.cases.find((c) => c.name === name) ?? {
                        name,
                        state: "not run",
                      },
                  )
                  .concat(
                    state.evaluation?.cases.filter(
                      (c) =>
                        ![
                          "Identity disclosure",
                          "Out of scope",
                          "Restricted-source probe",
                          "Unsupported opinion",
                          "Never-reveal probe",
                          "Instruction override",
                        ].includes(c.name),
                    ) ?? [],
                  )
                  .map((item) => (
                    <li
                      key={item.name}
                      className={`qv-console__row ${item.state === "fail" ? "is-fail" : ""}`}
                    >
                      <span className="qv-console__state" aria-hidden="true">
                        {item.state === "pass"
                          ? "✓"
                          : item.state === "fail"
                            ? "×"
                            : "·"}
                      </span>
                      <button
                        className="w2-case"
                        disabled={!("prompt" in item)}
                        aria-expanded={selectedCase?.name === item.name}
                        aria-controls={
                          selectedCase ? "w2-case-transcript" : undefined
                        }
                        onClick={() =>
                          setSelectedCase(
                            "prompt" in item && selectedCase?.name !== item.name
                              ? (item as EvaluationCase)
                              : null,
                          )
                        }
                      >
                        {item.name}
                      </button>
                      <span className="qv-console__result">{item.state}</span>
                    </li>
                  ))}
              </ul>
              {selectedCase && (
                <div
                  id="w2-case-transcript"
                  role="region"
                  aria-label={`${selectedCase.name} evaluation details`}
                  className="qv-console__transcript"
                >
                  <span className="qv-meta">{selectedCase.name}</span>
                  <div className="qv-console__line">
                    <span className="qv-console__who">Fan</span>
                    <span>{selectedCase.prompt}</span>
                  </div>
                  <div className="qv-console__line">
                    <span className="qv-console__who">
                      {state.creator.name}’s AI
                    </span>
                    <span>{selectedCase.answer}</span>
                  </div>
                  <p className="qv-console__why">{selectedCase.reason}</p>
                  {selectedCase.withheld && (
                    <>
                      <p className="qv-console__why">
                        Withheld before delivery ·{" "}
                        {selectedCase.withheld.category}
                      </p>
                      <p>{selectedCase.withheld.text}</p>
                    </>
                  )}
                </div>
              )}
              <div className="qv-console__foot">
                <Button
                  disabled={
                    controlsDisabled ||
                    dirty ||
                    state.evaluation?.state === "running"
                  }
                  onClick={() =>
                    void action(async () => {
                      await api("evaluations", {
                        expectedRevision: state.revision,
                      });
                    }, "Evaluation queued against this exact draft.")
                  }
                >
                  Run boundary evaluations
                </Button>
                {state.evaluation?.state === "running" && (
                  <Button
                    variant="quiet"
                    onClick={() =>
                      void action(async () => {
                        await api("evaluations/cancel");
                      }, "Evaluation cancellation requested.")
                    }
                  >
                    Cancel evaluation
                  </Button>
                )}
                <Field label="What changed in this version">
                  <input
                    value={changes}
                    maxLength={500}
                    onChange={(e) => setChanges(e.target.value)}
                  />
                </Field>
                <Button
                  variant="ai"
                  disabled={
                    controlsDisabled ||
                    dirty ||
                    Boolean(state.gates.length) ||
                    !changes.trim()
                  }
                  onClick={() =>
                    void action(async () => {
                      await api("publish", {
                        expectedRevision: state.revision,
                        evaluationId: state.evaluation?.id,
                        changes,
                      });
                    }, "Immutable version published.")
                  }
                >
                  Publish v{(state.versions[0]?.number ?? 0) + 1}
                </Button>
                {state.gates.map((gate) => (
                  <span key={gate} className="qv-help">
                    {gate}
                  </span>
                ))}
              </div>
            </div>
            <Panel title="TEST IT AS A FAN · PUBLIC AUDIENCE">
              <form
                className="w2-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const revision = state.revision;
                    const result = await api("preview", {
                      expectedRevision: revision,
                      message: prompt,
                    });
                    setPreview({
                      ...(result as unknown as Omit<Preview, "revision">),
                      revision,
                    });
                  }, "Draft preview complete.");
                }}
              >
                <Field label="Fan message">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    required
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                </Field>
                <Button type="submit" disabled={controlsDisabled || dirty}>
                  Send to draft AI
                </Button>
              </form>
              {preview && preview.revision === state.revision && !dirty && (
                <>
                  <p className="qv-meta">
                    Draft preview · revision {preview.revision}
                  </p>
                  <AuthorLabel kind="ai" name={state.creator.name} />
                  {preview.sentences.map((sentence, index) => (
                    <div key={index}>
                      <p>{sentence.text}</p>
                      {sentence.citations.map((id) => (
                        <details key={id}>
                          <summary>Open authorized passage</summary>
                          {preview.passages.find((p) => p.id === id)?.text ??
                            "No longer accessible to you"}
                        </details>
                      ))}
                    </div>
                  ))}
                  <p className="qv-help">
                    Pipeline {preview.durationMs} ms · first approved{" "}
                    {preview.firstApprovedMs ?? "withheld"} ms · cost{" "}
                    {preview.usage.some((u) => u.costMicros === null)
                      ? "awaiting provider usage or rate reconciliation"
                      : `${preview.usage.reduce((sum, u) => sum + (u.costMicros ?? 0), 0)} USD micros`}
                  </p>
                </>
              )}
            </Panel>
            <Panel title="I’D NEVER SAY THAT">
              <p className="qv-help">
                Write a paraphrase of the scenario. Do not paste a fan’s private
                message.
              </p>
              <Field label="Paraphrased regression prompt">
                <textarea
                  rows={3}
                  value={paraphrase}
                  maxLength={1000}
                  onChange={(e) => setParaphrase(e.target.value)}
                />
              </Field>
              <Field label="Your one-line rule">
                <textarea
                  rows={2}
                  value={rule}
                  maxLength={500}
                  onChange={(e) => setRule(e.target.value)}
                />
              </Field>
              <Button
                disabled={
                  controlsDisabled ||
                  dirty ||
                  !rule.trim() ||
                  !paraphrase.trim()
                }
                onClick={() =>
                  void action(async () => {
                    await api("corrections", {
                      expectedRevision: state.revision,
                      paraphrasedPrompt: paraphrase,
                      rule,
                      unacceptableAnswer:
                        preview?.sentences.map((s) => s.text).join("\n") ?? "",
                    });
                    setRule("");
                    setParaphrase("");
                  }, "Correction filed; the rule is added to the draft and its regression runs before publish.")
                }
              >
                File correction
              </Button>
            </Panel>
          </>
        )}
      </section>
      <aside className="w2-aside w2-versions">
        <span className="qv-meta">VERSIONS</span>
        <ul className="qv-versions">
          <li className="qv-version">
            <span className="qv-version__id">Draft</span>
            <div className="qv-version__text">
              <span className="qv-meta">REVISION {state.revision}</span>
              <span className="qv-version__changes">
                {dirty ? "Unsaved edits" : "Editable configuration"}
              </span>
            </div>
          </li>
          {versions.map((version) => (
            <li
              key={version.id}
              className={`qv-version ${version.state === "live" ? "is-live" : ""}`}
            >
              <span className="qv-version__id">v{version.number}</span>
              <div className="qv-version__text">
                <span className="qv-meta">
                  {version.state} ·{" "}
                  {new Date(version.publishedAt).toLocaleDateString()}
                </span>
                <span className="qv-version__changes">{version.changes}</span>
                <span className="qv-help">
                  {version.compiledHash.slice(0, 12)}
                </span>
              </div>
              {version.state !== "live" && (
                <Button
                  variant="quiet"
                  disabled={controlsDisabled}
                  onClick={() =>
                    setConfirmation({
                      title: `Roll back to v${version.number}`,
                      confirm: `Roll back to v${version.number}`,
                      body: "The prior immutable version is reused after current license, source and creator-authority checks.",
                      run: async () => {
                        await api(`versions/${version.id}/rollback`);
                      },
                    })
                  }
                >
                  Roll back
                </Button>
              )}
            </li>
          ))}
        </ul>
        {state.versions.length === 100 && !historyEnd && (
          <Button
            disabled={busy || !online}
            onClick={() =>
              void action(async () => {
                const before = versions[versions.length - 1]!.number;
                const page = (await api(
                  `versions?before=${before}`,
                  undefined,
                  "GET",
                )) as { items: Version[]; nextBefore: number | null };
                setOlderVersions((current) => [...current, ...page.items]);
                setHistoryEnd(page.nextBefore === null);
              }, "Earlier versions loaded.")
            }
          >
            Load earlier versions
          </Button>
        )}
        <a
          className="qv-btn qv-btn--quiet"
          href="/api/studio/ai/export"
          download
        >
          Export sources, rules and examples
        </a>
        <Panel title="COMPARE WITH THE LIVE VERSION">
          <p className="qv-help">
            Replay privacy-safe paraphrases from the last seven days through
            both versions. Fans continue seeing the live version.
          </p>
          {comparisonReadState === "checking" && (
            <p className="qv-help" role="status">
              Checking recent comparisons…
            </p>
          )}
          {comparisonReadState === "unavailable" && (
            <p className="qv-help" role="status">
              Recent comparisons are unavailable. Reconnect to review them.
            </p>
          )}
          {comparisonReadState === "current" && !comparisons.available && (
            <p className="qv-help">
              Recent conversation comparison is waiting for the privacy-safe
              sample feed.
            </p>
          )}
          <Button
            disabled={
              controlsDisabled ||
              dirty ||
              !comparisons.available ||
              !state.liveVersionId ||
              comparisons.items.some((item) => item.state === "running")
            }
            onClick={() =>
              void action(async () => {
                await api("comparisons", {
                  expectedRevision: state.revision,
                });
              }, "Version comparison started. Results appear as each case completes.")
            }
          >
            Compare versions
          </Button>
          {comparisons.items.map((item) => (
            <details key={item.id}>
              <summary>
                Comparison · {item.state} · {item.results.length} scenarios
              </summary>
              {item.error && <p role="status">{item.error}</p>}
              {item.results.map((comparison, index) => (
                <div key={index} className="w2-comparison">
                  <p>{comparison.paraphrase}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Live</th>
                        <th>Draft</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {(["live", "draft"] as const).map((version) => (
                          <td key={version}>
                            <AuthorLabel kind="ai" name={state.creator.name} />
                            {comparison[version].sentences.map(
                              (sentence, i) => (
                                <p key={i}>{sentence.text}</p>
                              ),
                            )}
                            <p className="qv-help">
                              {comparison[version].score.passed
                                ? "Pass"
                                : "Needs correction"}{" "}
                              · {comparison[version].durationMs} ms ·{" "}
                              {comparison[version].costMicros === null
                                ? "Cost unconfirmed"
                                : `$${(comparison[version].costMicros! / 1000000).toFixed(6)}`}
                            </p>
                            <p className="qv-help">
                              {comparison[version].score.reason}
                            </p>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </details>
          ))}
        </Panel>
      </aside>
    </div>
  );
}
