"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import { GrowthActionError, useGrowthSession } from "./session";
export function FeedbackForm() {
  const { request, signal } = useGrowthSession();
  const [category, setCategory] = useState("notification"),
    [score, setScore] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState("");
  const pending = useRef(false);
  const intent = useRef<{
    idempotencyKey: string;
    category: string;
    score: number | null;
  } | null>(null);
  const edited = () => {
    intent.current = null;
    setConfirmed(false);
    setMessage("");
  };
  return (
    <form
      className="growth-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current || confirmed) return;
        pending.current = true;
        intent.current ??= {
          idempotencyKey: crypto.randomUUID(),
          category,
          score: score ? Number(score) : null,
        };
        setBusy(true);
        setMessage("");
        try {
          await request("feedback", {
            method: "POST",
            body: JSON.stringify(intent.current),
          });
          setConfirmed(true);
          setMessage(growthCopy.growthFeedbackSavedThankYou);
        } catch (error) {
          if (signal.aborted) return;
          setMessage(
            error instanceof GrowthActionError && error.status < 500
              ? error.message
              : growthCopy.productFeedbackUnconfirmed,
          );
        } finally {
          pending.current = false;
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
          disabled={busy}
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            edited();
          }}
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
          disabled={busy}
          value={score}
          onChange={(event) => {
            setScore(event.target.value);
            edited();
          }}
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
        disabled={busy || confirmed}
      >
        {busy ? growthCopy.growthSaving : growthCopy.growthSendFeedback}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function ExperimentForm() {
  const { request, signal } = useGrowthSession();
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
          await request("experiments", {
            method: "POST",
            body: JSON.stringify({
              hypothesis: data.get("hypothesis"),
              successCriterion: data.get("success"),
              stopCriterion: data.get("stop"),
            }),
          });
          setMessage(
            growthCopy.growthDraftProposalSavedNoExperimentHasBeenActivated,
          );
          form.reset();
        } catch (error) {
          if (signal.aborted) return;
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
  const { request, signal } = useGrowthSession();
  const [items, setItems] = useState<
      { id: string; hypothesis: string; state: string }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void request<{
      experiments: { id: string; hypothesis: string; state: string }[];
    }>("experiments")
      .then((result) => {
        if (active) setItems(result.experiments);
      })
      .catch((error) => {
        if (active && !signal.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : growthCopy.growthThisFeatureIsUnavailable,
          );
      });
    return () => {
      active = false;
    };
  }, [request, signal]);
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
                  await request(`experiments/${item.id}/stop`, {
                    method: "PUT",
                    body: "{}",
                  });
                  setItems((current) =>
                    current.map((value) =>
                      value.id === item.id
                        ? { ...value, state: "stopped" }
                        : value,
                    ),
                  );
                } catch (error) {
                  if (signal.aborted) return;
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
  ) : message ? (
    <p role="status" className="growth-help">
      {message}
    </p>
  ) : null;
}
