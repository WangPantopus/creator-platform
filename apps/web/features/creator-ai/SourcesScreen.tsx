import type { FormEvent } from "react";
import Link from "next/link";
import { Button, Field, Panel } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function SourcesScreen({
  ai,
  state,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
}) {
  const {
    actSource,
    action,
    actorKey,
    api,
    confirmed,
    controlsDisabled,
    current,
    dialog,
    expiry,
    failAction,
    identitySignal,
    loadReview,
    review,
    rights,
    scopeIds,
    scopeKind,
    setConfirmation,
    setConfirmed,
    setError,
    setExpiry,
    setMessage,
    setReview,
    setRights,
    setScopeIds,
    setScopeKind,
    setSourceForm,
    setSourceOrigin,
    setStatusText,
    setText,
    setTitle,
    sourceFileSequence,
    sourceForm,
    sourceOrigin,
    sourceReviewButtons,
    sourceRows,
    statusText,
    studioHeading,
    text,
    title,
  } = ai;
  return (
    <div className="w2-source-grid">
      <section className="w2-list">
        <div className="w2-between">
          <span className="qv-meta">
            APPROVED · {sourceRows.filter((s) => s.state === "approved").length}{" "}
            · WAITING FOR YOU ·{" "}
            {sourceRows.filter((s) => s.state === "candidate").length}
          </span>
          <Button
            variant="quiet"
            disabled={
              controlsDisabled ||
              !sourceRows.some((s) => s.state === "candidate") ||
              sourceRows
                .filter((s) => s.state === "candidate")
                .some((s) => !confirmed[`${s.id}:${s.revision}`])
            }
            onClick={() =>
              void action(async () => {
                for (const source of sourceRows.filter(
                  (s) => s.state === "candidate",
                ))
                  await actSource(source, "approve");
              }, "Reviewed sources queued for ingestion.")
            }
          >
            Approve all waiting
          </Button>
        </div>
        {!sourceRows.length && (
          <Panel title="NO SOURCES YET">
            <p>
              Add your own writing or files. Candidates are not used until you
              approve them.
            </p>
            <Link href="/studio/ai/interview" className="qv-link-btn">
              Start with your interview
            </Link>
          </Panel>
        )}
        {sourceRows.map((source) => (
          <div key={source.id}>
            <div className="qv-source">
              <div className="qv-source__text">
                <button
                  ref={(button) => {
                    if (button)
                      sourceReviewButtons.current.set(source.id, button);
                    else sourceReviewButtons.current.delete(source.id);
                  }}
                  className="w2-source-title"
                  onClick={() => void loadReview(source)}
                >
                  {source.title}
                </button>
                <span className="qv-help">
                  {source.state === "candidate"
                    ? "Found · not used until you approve"
                    : source.state === "processing"
                      ? state.capabilities.embeddings
                        ? `Processing · ${source.progress}%`
                        : "Indexing unavailable · import kept"
                      : source.state === "revoked"
                        ? "Revoked · no longer used"
                        : source.state === "failed"
                          ? source.error
                          : source.expiresAt &&
                              Date.parse(source.expiresAt) <= Date.now()
                            ? "Expired · no longer used"
                            : `Approved · ${new Date(source.reviewedAt ?? source.createdAt).toLocaleDateString()}`}{" "}
                  · revision {source.revision}
                </span>
              </div>
              <span
                className={`qv-scope ${source.audience.kind !== "public" ? "qv-scope--tier" : ""}`}
              >
                {source.audience.kind === "public"
                  ? "Public"
                  : `${source.audience.kind} · ${source.audience.ids.length}`}
              </span>
              <Button
                variant={source.state === "candidate" ? "secondary" : "quiet"}
                disabled={
                  controlsDisabled ||
                  (["candidate", "revoked"].includes(source.state) &&
                    !confirmed[`${source.id}:${source.revision}`])
                }
                onClick={() => {
                  const operation =
                    source.state === "candidate"
                      ? "approve"
                      : source.state === "failed"
                        ? "retry"
                        : source.state === "revoked"
                          ? "restore"
                          : source.state === "processing"
                            ? "cancel"
                            : "revoke";
                  if (operation === "revoke" || operation === "cancel")
                    setConfirmation({
                      title:
                        operation === "revoke"
                          ? "Revoke this source"
                          : "Cancel this import",
                      confirm:
                        operation === "revoke"
                          ? "Revoke source"
                          : "Cancel import",
                      body: "New replies stop using this source. A live version using it is paused. Historical replies remain, and source access closes.",
                      run: async () => {
                        await actSource(source, operation);
                      },
                    });
                  else
                    void action(
                      () => actSource(source, operation),
                      "Source action saved.",
                    );
                }}
              >
                {source.state === "candidate"
                  ? "Approve"
                  : source.state === "failed"
                    ? "Retry"
                    : source.state === "revoked"
                      ? "Restore"
                      : source.state === "processing"
                        ? "Cancel"
                        : "Revoke"}
              </Button>
            </div>
            {source.state === "processing" && state.capabilities.embeddings && (
              <progress
                value={source.progress}
                max={100}
                aria-label={`Processing ${source.title}`}
              />
            )}
            <details className="w2-source-review">
              <summary>Rights and audience review</summary>
              <p>{source.rightsEvidence}</p>
              <p className="qv-help">
                {source.expiresAt
                  ? `Expires ${new Date(source.expiresAt).toLocaleString()}`
                  : "No source expiry set"}{" "}
                · {source.origin}
              </p>
              {(source.state === "candidate" || source.state === "failed") && (
                <Button
                  disabled={controlsDisabled}
                  variant="quiet"
                  onClick={() =>
                    setConfirmation({
                      title: "Revoke this source",
                      confirm: "Revoke source",
                      body: "This source is removed from future replies and its index is deleted. You can review it again before restoring it.",
                      run: () => actSource(source, "revoke"),
                    })
                  }
                >
                  Revoke source
                </Button>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={
                    confirmed[`${source.id}:${source.revision}`] ?? false
                  }
                  onChange={(e) =>
                    setConfirmed({
                      ...confirmed,
                      [`${source.id}:${source.revision}`]: e.target.checked,
                    })
                  }
                />{" "}
                I reviewed this exact source, its audience and permission for AI
                reuse.
              </label>
            </details>
          </div>
        ))}
        {review && (
          <Panel title={`REVIEW · ${review.title}`}>
            <Field label="Exact stored source text">
              <textarea
                rows={8}
                value={review.text}
                onChange={(e) => setReview({ ...review, text: e.target.value })}
              />
            </Field>
            <p className="qv-help">{review.rightsEvidence}</p>
            <div className="w2-actions">
              <Button
                disabled={controlsDisabled}
                onClick={() =>
                  void action(
                    async () => {
                      const source = sourceRows.find(
                        (s) => s.id === review.id,
                      )!;
                      await api(
                        `sources/${review.id}`,
                        {
                          expectedRevision: review.revision,
                          title: review.title,
                          text: review.text,
                          origin: source.origin,
                          originReference: source.originReference ?? undefined,
                          audience: source.audience,
                          rightsEvidence: source.rightsEvidence,
                          expiresAt: source.expiresAt,
                        },
                        "PUT",
                      );
                      setReview(null);
                    },
                    "Revision saved; review and approve it again.",
                    sourceReviewButtons.current.get(review.id) ??
                      studioHeading.current,
                  )
                }
              >
                Save revision
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  const opener =
                    sourceReviewButtons.current.get(review.id) ??
                    studioHeading.current;
                  setReview(null);
                  // Close removes this control; retain the original
                  // source's place in the keyboard reading order.
                  if (
                    !identitySignal?.aborted &&
                    !dialog.current?.open &&
                    opener?.isConnected &&
                    opener.getClientRects().length &&
                    !opener.matches(":disabled")
                  )
                    opener.focus();
                }}
              >
                Close source
              </Button>
            </div>
          </Panel>
        )}
        {current === "onboard" && (
          <Link className="qv-btn qv-btn--secondary" href="/studio/ai/test">
            Continue to boundary evaluations
          </Link>
        )}
      </section>
      <aside className="w2-aside">
        <Panel title="ADD A SOURCE">
          <Button disabled onClick={() => undefined}>
            Connect YouTube
          </Button>
          <p className="qv-help">
            Creator OAuth and approved caption reuse policy must be connected
            first.
          </p>
          <Button onClick={() => setSourceForm(!sourceForm)}>
            Upload files
          </Button>
          <Button variant="quiet" onClick={() => setSourceForm(!sourceForm)}>
            Add text
          </Button>
          <span className="qv-help">
            Podcast and newsletter next. Instagram and TikTok arrive through
            their data exports.
          </span>
          {sourceForm && (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void action(
                  async () => {
                    const audience =
                      scopeKind === "public"
                        ? { kind: "public" }
                        : {
                            kind: scopeKind,
                            ids: scopeIds
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          };
                    const result = await api("sources", {
                      title,
                      text,
                      origin: sourceOrigin,
                      audience,
                      rightsEvidence: rights,
                      expiresAt: expiry ? new Date(expiry).toISOString() : null,
                    });
                    if (result.duplicate)
                      return "This source already exists; no duplicate was created.";
                    else {
                      setTitle("");
                      setText("");
                      setRights("");
                      setSourceOrigin("manual_text");
                      setSourceForm(false);
                    }
                  },
                  "Source saved as a candidate. Review before approving.",
                  studioHeading.current,
                );
              }}
              className="w2-form"
            >
              <Field label="Upload UTF-8 text (up to 1 MB)">
                <input
                  type="file"
                  accept=".txt,.md,.vtt,.csv,text/plain,text/markdown"
                  onChange={(e) => {
                    const sequence = ++sourceFileSequence.current;
                    const expectedActor = actorKey.current;
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setMessage("");
                    setError("");
                    // Permit selecting the same file after fixing it.
                    e.target.value = "";
                    if (file.size > 1_000_000) {
                      failAction(
                        "This file is too large. Split it into files up to 1 MB.",
                      );
                      return;
                    }
                    const currentRead = () =>
                      sourceFileSequence.current === sequence &&
                      actorKey.current === expectedActor &&
                      !identitySignal?.aborted;
                    void file
                      .arrayBuffer()
                      .then((bytes) => {
                        const content = new TextDecoder("utf-8", {
                          fatal: true,
                        }).decode(bytes);
                        if (!currentRead()) return;
                        if (content.length > 250_000) {
                          failAction(
                            "Split this source into files with at most 250,000 characters.",
                          );
                          return;
                        }
                        setError("");
                        setMessage("");
                        setText(content);
                        setTitle(file.name);
                        setSourceOrigin("manual_upload");
                      })
                      .catch(() => {
                        if (currentRead())
                          failAction(
                            "This file could not be read as UTF-8 text. Save it as UTF-8 and try again.",
                          );
                      });
                  }}
                />
              </Field>
              <Field label="Source title">
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Source text">
                <textarea
                  required
                  maxLength={250000}
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
              <Field label="Rights evidence">
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={rights}
                  onChange={(e) => setRights(e.target.value)}
                  placeholder="Rights holder, permitted AI use, and permission reference"
                />
              </Field>
              <Field label="Who may hear answers from this source">
                <select
                  value={scopeKind}
                  onChange={(e) => setScopeKind(e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="tier">Specific tiers</option>
                  <option value="group">Specific groups</option>
                </select>
              </Field>
              {scopeKind !== "public" && (
                <Field label="Authorized tier or group IDs (comma separated)">
                  <input
                    required
                    value={scopeIds}
                    onChange={(e) => setScopeIds(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Source expiry (optional)">
                <input
                  type="datetime-local"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={controlsDisabled}>
                Save candidate
              </Button>
            </form>
          )}
        </Panel>
        <Panel title="THIS WEEK’S UPDATE">
          <Field label="This week’s update">
            <textarea
              rows={3}
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              maxLength={2000}
            />
          </Field>
          <span className="qv-help">
            Your AI mentions this when it’s relevant. Expires after seven days.
          </span>
          <Button
            disabled={controlsDisabled}
            onClick={() =>
              void action(async () => {
                await api(
                  "status",
                  {
                    text: statusText,
                    expiresAt: new Date(
                      Date.now() + 7 * 86400000 - 1000,
                    ).toISOString(),
                  },
                  "PUT",
                );
              }, "Weekly update saved.")
            }
          >
            Save this week’s update
          </Button>
        </Panel>
        <p className="qv-help">
          Sources are evidence, never instructions. Scope decides who can hear
          answers drawn from each one.
        </p>
      </aside>
    </div>
  );
}
