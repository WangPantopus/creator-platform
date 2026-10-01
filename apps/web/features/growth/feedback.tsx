"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useEffect, useState } from "react";
import { mutate } from "./actions";
export function FeedbackForm() {
  const [category, setCategory] = useState("notification"),
    [score, setScore] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="growth-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await mutate("feedback", {
            category,
            score: score ? Number(score) : null,
          });
          setMessage(growthCopy.growthFeedbackSavedThankYou);
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : growthCopy.growthFeedbackWasNotSaved,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{growthCopy.growthOptionalFeedback}</h2>
      <p className="growth-help">
        {growthCopy.growthChooseATopicAndRatingNoConversationTextIsCollected}
      </p>
      <label>
        {growthCopy.growthTopic}
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="discovery_fit">
            {growthCopy.growthFindingCreators}
          </option>
          <option value="usefulness">{growthCopy.growthUsefulness}</option>
          <option value="notification">{growthCopy.growthNotifications}</option>
          <option value="departure">{growthCopy.growthLeaving}</option>
        </select>
      </label>
      <label>
        {growthCopy.growthRating}
        <select
          value={score}
          onChange={(event) => setScore(event.target.value)}
        >
          <option value="">{growthCopy.growthSkipRating}</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {growthFormat("growthOutOf5", { value1: value })}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="qv-btn qv-btn--secondary"
        disabled={busy}
      >
        {busy ? growthCopy.growthSaving : growthCopy.growthSendFeedback}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ExperimentForm() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="growth-card growth-card-body growth-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget,
          data = new FormData(form);
        setBusy(true);
        try {
          await mutate("experiments", {
            hypothesis: data.get("hypothesis"),
            successCriterion: data.get("success"),
            stopCriterion: data.get("stop"),
          });
          setMessage(
            growthCopy.growthDraftProposalSavedNoExperimentHasBeenActivated,
          );
          form.reset();
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : growthCopy.growthProposalWasNotSaved,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>{growthCopy.growthProposeAnExperiment}</h2>
      <p className="growth-help">
        {
          growthCopy.growthDraftsRequireAnAgreedReviewBeforeActivationSavingADraft
        }
      </p>
      <label>
        {growthCopy.growthHypothesis}
        <textarea name="hypothesis" required minLength={12} maxLength={800} />
      </label>
      <label>
        {growthCopy.growthSuccessCriterion}
        <textarea name="success" required minLength={12} maxLength={800} />
      </label>
      <label>
        {growthCopy.growthStopCriterion}
        <textarea name="stop" required minLength={12} maxLength={800} />
      </label>
      <button className="qv-btn qv-btn--secondary" disabled={busy}>
        {busy ? growthCopy.growthSaving : growthCopy.growthSaveDraftProposal}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}

export function ExperimentChoices() {
  const [items, setItems] = useState<
      { id: string; hypothesis: string; state: string }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/growth/experiments")
      .then(async (response) => {
        if (response.ok && active)
          setItems((await response.json()).experiments);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return items.length ? (
    <section className="growth-stack">
      <h2>{growthCopy.growthYourExperimentProposals}</h2>
      {items.map((item) => (
        <article className="growth-card growth-card-body" key={item.id}>
          <p>{item.hypothesis}</p>
          <p>State: {item.state}</p>
          {["draft", "active"].includes(item.state) && (
            <button
              className="qv-btn qv-btn--quiet"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMessage("");
                try {
                  await mutate(`experiments/${item.id}/stop`, {}, "PUT");
                  setItems((current) =>
                    current.map((value) =>
                      value.id === item.id
                        ? { ...value, state: "stopped" }
                        : value,
                    ),
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : growthCopy.growthCouldNotStopThisProposal,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {growthCopy.growthStopThisProposal}
            </button>
          )}
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  ) : null;
}
