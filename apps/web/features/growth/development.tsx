"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
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
          : (result.error?.message ?? growthCopy.growthActionUnavailable),
      );
    } catch {
      setMessage(growthCopy.growthTheDevelopmentServerIsUnavailable);
    }
  }
  return (
    <section className="growth-stack">
      <h1>{growthCopy.growthW7DevelopmentControls}</h1>
      <p>
        Synthetic actors and producer projections. These actions exercise W7
        persistence; they do not prove canonical AI/content/signature/provider
        integrations.
      </p>
      <fieldset>
        <legend>{growthCopy.growthDevelopmentActor}</legend>
        {["signed_out", "fan", "creator"].map((actor) => (
          <button
            key={actor}
            className="qv-btn qv-btn--secondary"
            onClick={() => void action({ action: "actor", actor })}
          >
            {growthFormat("growthUse", { value1: actor.replaceAll("_", " ") })}
          </button>
        ))}
      </fieldset>
      <fieldset>
        <legend>{growthCopy.growthPublicCreatorProjection}</legend>
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
          {growthCopy.growthPublishSyntheticPublicNote}
        </button>
      </fieldset>
      <fieldset>
        <legend>{growthCopy.growthDistinctFanInsightSignal}</legend>
        <label>
          {growthCopy.growthSyntheticEvidenceWeek}
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
          {growthCopy.growthTopic}
          <select
            className="qv-input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="bisque-temperature">
              {growthCopy.growthBisqueTemperature}
            </option>
            <option value="first-kiln">{growthCopy.growthFirstKiln}</option>
          </select>
        </label>
        <label>
          {growthCopy.growthFanNumber}
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
          {growthCopy.growthSourceVersion}
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
          {growthCopy.growthStillUnresolved}
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
          {growthCopy.growthRecordSyntheticCategoricalSignal}
        </button>
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() =>
            void action({ action: "close-insights", input: { window } })
          }
        >
          {growthCopy.growthCloseTheSyntheticEvidenceWindow}
        </button>
      </fieldset>
      <p role="status">{message}</p>
      <a href="/discover">{growthCopy.growthOpenDiscover}</a>
      <a href="/home">{growthCopy.growthOpenHome}</a>
      <a href="/notifications">{growthCopy.growthOpenNotifications}</a>
      <a href="/studio/insights">{growthCopy.growthOpenInsights}</a>
    </section>
  );
}
