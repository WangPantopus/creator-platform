"use client";
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
          setMessage("Feedback saved. Thank you.");
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Feedback was not saved.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Optional feedback</h2>
      <p className="growth-help">
        Choose a topic and rating. No conversation text is collected.
      </p>
      <label>
        Topic
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="discovery_fit">Finding creators</option>
          <option value="usefulness">Usefulness</option>
          <option value="notification">Notifications</option>
          <option value="departure">Leaving</option>
        </select>
      </label>
      <label>
        Rating
        <select
          value={score}
          onChange={(event) => setScore(event.target.value)}
        >
          <option value="">Skip rating</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} out of 5
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="qv-btn qv-btn--secondary"
        disabled={busy}
      >
        {busy ? "Saving…" : "Send feedback"}
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
          setMessage("Draft proposal saved. No experiment has been activated.");
          form.reset();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Proposal was not saved.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Propose an experiment</h2>
      <p className="growth-help">
        Drafts require an agreed review before activation. Saving a draft does
        not change fan experiences.
      </p>
      <label>
        Hypothesis
        <textarea name="hypothesis" required minLength={12} maxLength={800} />
      </label>
      <label>
        Success criterion
        <textarea name="success" required minLength={12} maxLength={800} />
      </label>
      <label>
        Stop criterion
        <textarea name="stop" required minLength={12} maxLength={800} />
      </label>
      <button className="qv-btn qv-btn--secondary" disabled={busy}>
        {busy ? "Saving…" : "Save draft proposal"}
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
      <h2>Your experiment proposals</h2>
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
                      : "Could not stop this proposal.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Stop this proposal
            </button>
          )}
        </article>
      ))}
      <p role="status">{message}</p>
    </section>
  ) : null;
}
