"use client";
import { useState } from "react";
import { mutate } from "./actions";
const kinds = [
  "ai_reply",
  "approved_draft",
  "personal_reply",
  "request_status",
  "call_reminder",
  "answered_publicly",
  "content_match",
  "announcement",
  "creator_offer",
  "slot_change",
  "new_packet",
  "commitment_due",
  "guardrail",
  "pool_share",
  "note",
  "reaction",
  "public_answer",
  "spending_reminder",
  "weekly_impact",
];
export interface PreferencesValue {
  push: boolean;
  email: boolean;
  hideSensitive: boolean;
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string;
  mutedCreators: string[];
  disabledPushTypes: string[];
  disabledEmailTypes: string[];
}
function time(value: number | null) {
  return value === null
    ? ""
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
function minutes(value: string) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function PreferenceForm({
  initial,
  creators,
}: {
  initial: PreferencesValue;
  creators: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (patch: Partial<PreferencesValue>) =>
    setValue({ ...value, ...patch });
  return (
    <form
      className="growth-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await mutate("preferences", value, "PUT");
          setMessage(
            "Preferences saved. Your in-app record remains available.",
          );
        } catch (e) {
          setMessage(
            e instanceof Error ? e.message : "Preferences were not saved.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="growth-help">
        Your in-app notification record cannot be turned off. Push and email are
        optional. Email delivery is grouped daily for creators and weekly for
        fans.
      </p>
      <label>
        <input
          type="checkbox"
          checked={value.push}
          onChange={(e) => update({ push: e.target.checked })}
        />
        Push notifications
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.email}
          onChange={(e) => update({ email: e.target.checked })}
        />
        Email digest
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.hideSensitive}
          onChange={(e) => update({ hideSensitive: e.target.checked })}
        />
        Hide sensitive previews
      </label>
      <fieldset>
        <legend>Quiet hours</legend>
        <label>
          From
          <input
            type="time"
            value={time(value.quietStart)}
            onChange={(e) => update({ quietStart: minutes(e.target.value) })}
          />
        </label>
        <label>
          Until
          <input
            type="time"
            value={time(value.quietEnd)}
            onChange={(e) => update({ quietEnd: minutes(e.target.value) })}
          />
        </label>
        <label>
          Time zone
          <input
            className="qv-input"
            value={value.timeZone}
            maxLength={80}
            onChange={(e) => update({ timeZone: e.target.value })}
          />
        </label>
        <p className="growth-help">
          Leave both times empty for no quiet hours. Matching times pause
          optional delivery all day.
        </p>
      </fieldset>
      <fieldset>
        <legend>Updates from creators</legend>
        {creators.length ? (
          creators.map((creator) => (
            <label key={creator.id}>
              <input
                type="checkbox"
                checked={!value.mutedCreators.includes(creator.id)}
                onChange={(e) =>
                  update({
                    mutedCreators: e.target.checked
                      ? value.mutedCreators.filter((id) => id !== creator.id)
                      : [...value.mutedCreators, creator.id],
                  })
                }
              />
              {creator.name} · push and email
            </label>
          ))
        ) : (
          <p className="growth-help">
            Creators you follow or receive updates from appear here.
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>Notification types</legend>
        {kinds.map((kind) => (
          <div key={kind}>
            <strong>{kind.replaceAll("_", " ")}</strong>
            {(["push", "email"] as const).map((channel) => {
              const key =
                channel === "push" ? "disabledPushTypes" : "disabledEmailTypes";
              return (
                <label key={channel}>
                  <input
                    type="checkbox"
                    checked={!value[key].includes(kind)}
                    onChange={(e) =>
                      update({
                        [key]: e.target.checked
                          ? value[key].filter((k) => k !== kind)
                          : [...value[key], kind],
                      })
                    }
                  />
                  {channel === "push" ? "Push" : "Email"}
                </label>
              );
            })}
          </div>
        ))}
      </fieldset>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        type="submit"
      >
        {busy ? "Saving…" : "Save preferences"}
      </button>
      <p role="status" className="growth-help">
        {message}
      </p>
    </form>
  );
}
