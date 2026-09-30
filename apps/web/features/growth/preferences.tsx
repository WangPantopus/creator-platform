"use client";
import { notificationKindLabel } from "./copy";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
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
            growthCopy.growthPreferencesSavedYourInAppRecordRemainsAvailable,
          );
        } catch (e) {
          setMessage(
            e instanceof Error
              ? e.message
              : growthCopy.growthPreferencesWereNotSaved,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="growth-help">
        {growthCopy.growthYourInAppNotificationRecordCannotBeTurnedOffPush}
      </p>
      <label>
        <input
          type="checkbox"
          checked={value.push}
          onChange={(e) => update({ push: e.target.checked })}
        />
        {growthCopy.growthPushNotifications}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.email}
          onChange={(e) => update({ email: e.target.checked })}
        />
        {growthCopy.growthEmailDigest}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.hideSensitive}
          onChange={(e) => update({ hideSensitive: e.target.checked })}
        />
        {growthCopy.growthHideSensitivePreviews}
      </label>
      <fieldset>
        <legend>{growthCopy.growthQuietHours}</legend>
        <label>
          {growthCopy.growthFrom}
          <input
            type="time"
            value={time(value.quietStart)}
            onChange={(e) => update({ quietStart: minutes(e.target.value) })}
          />
        </label>
        <label>
          {growthCopy.growthUntil}
          <input
            type="time"
            value={time(value.quietEnd)}
            onChange={(e) => update({ quietEnd: minutes(e.target.value) })}
          />
        </label>
        <label>
          {growthCopy.growthTimeZone}
          <input
            className="qv-input"
            value={value.timeZone}
            maxLength={80}
            onChange={(e) => update({ timeZone: e.target.value })}
          />
        </label>
        <p className="growth-help">
          {growthCopy.growthLeaveBothTimesEmptyForNoQuietHoursMatchingTimes}
        </p>
      </fieldset>
      <fieldset>
        <legend>{growthCopy.growthUpdatesFromCreators}</legend>
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
              {growthFormat("growthPushAndEmail2", { name: creator.name })}
            </label>
          ))
        ) : (
          <p className="growth-help">
            {growthCopy.growthCreatorsYouFollowOrReceiveUpdatesFromAppearHere}
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>{growthCopy.growthNotificationTypes}</legend>
        {kinds.map((kind) => (
          <div key={kind}>
            <strong>{notificationKindLabel(kind)}</strong>
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
                  {channel === "push"
                    ? growthCopy.growthPush
                    : growthCopy.growthEmail}
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
        {busy ? growthCopy.growthSaving : growthCopy.growthSavePreferences}
      </button>
      <p role="status" className="growth-help">
        {message}
      </p>
    </form>
  );
}
