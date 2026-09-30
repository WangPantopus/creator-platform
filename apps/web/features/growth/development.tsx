"use client";
import { useState } from "react";
export function DevelopmentControls() {
  const [message, setMessage] = useState("");
  const [fan, setFan] = useState(1);
  const [topic, setTopic] = useState("bisque-temperature");
  const [version, setVersion] = useState(1);
  const [unresolved, setUnresolved] = useState(true);
  const [window, setWindow] = useState("2026-09-14");
  async function action(value: unknown) {
    try {
      const response = await fetch("/api/growth-development", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? JSON.stringify(result)
          : (result.error?.message ?? "Action unavailable."),
      );
    } catch {
      setMessage("The development server is unavailable.");
    }
  }
  return (
    <section className="growth-stack">
      <h1>W7 development controls</h1>
      <p>
        Synthetic actors and producer projections. These actions exercise W7
        persistence; they do not prove canonical AI/content/signature/provider
        integrations.
      </p>
      <fieldset>
        <legend>Development actor</legend>
        {["signed_out", "fan", "creator"].map((actor) => (
          <button
            key={actor}
            className="qv-btn qv-btn--secondary"
            onClick={() => void action({ action: "actor", actor })}
          >
            Use {actor.replaceAll("_", " ")}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend>Public creator projection</legend>
        {["published", "paused", "unpublished", "revoked"].map((state) => (
          <button
            key={state}
            className="qv-btn qv-btn--secondary"
            onClick={() => void action({ action: "publish", input: { state } })}
          >
            {state}
          </button>
        ))}
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() => void action({ action: "post" })}
        >
          Publish synthetic public Note
        </button>
      </fieldset>
      <fieldset>
        <legend>Distinct-fan insight signal</legend>
        <label>
          Synthetic evidence week
          <select
            className="qv-input"
            value={window}
            onChange={(event) => setWindow(event.target.value)}
          >
            {["2026-09-07", "2026-09-14", "2026-09-21"].map((week) => (
              <option key={week}>{week}</option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <select
            className="qv-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="bisque-temperature">Bisque temperature</option>
            <option value="first-kiln">First kiln</option>
          </select>
        </label>
        <label>
          Fan number
          <input
            className="qv-input"
            type="number"
            min={1}
            max={20}
            value={fan}
            onChange={(e) => setFan(Number(e.target.value))}
          />
        </label>
        <label>
          Source version
          <input
            className="qv-input"
            type="number"
            min={1}
            value={version}
            onChange={(e) => setVersion(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={unresolved}
            onChange={(e) => setUnresolved(e.target.checked)}
          />{" "}
          Still unresolved
        </label>
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() =>
            void action({
              action: "insight",
              input: { fan, topic, version, unresolved, window },
            })
          }
        >
          Record synthetic categorical signal
        </button>
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() =>
            void action({ action: "close-insights", input: { window } })
          }
        >
          Close the synthetic evidence window
        </button>
      </fieldset>
      <p role="status">{message}</p>
      <a href="/discover">Open Discover</a>
      <a href="/home">Open Home</a>
      <a href="/notifications">Open Notifications</a>
      <a href="/studio/insights">Open Insights</a>
    </section>
  );
}
