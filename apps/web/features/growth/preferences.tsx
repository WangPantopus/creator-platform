"use client";
import { notificationKindLabel } from "./copy";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useId, useRef, useState } from "react";
import { GrowthActionError, mutate } from "./actions";
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
    [busy, setBusy] = useState(false),
    [requiresSignIn, setRequiresSignIn] = useState(false),
    [invalid, setInvalid] = useState({ quietHours: false, timeZone: false });
  const fromInput = useRef<HTMLInputElement>(null),
    untilInput = useRef<HTMLInputElement>(null),
    zoneInput = useRef<HTMLInputElement>(null),
    errorId = useId();
  const update = (patch: Partial<PreferencesValue>) => {
    setValue((current) => ({ ...current, ...patch }));
    setMessage("");
    setInvalid((current) => ({
      quietHours:
        "quietStart" in patch || "quietEnd" in patch
          ? false
          : current.quietHours,
      timeZone: "timeZone" in patch ? false : current.timeZone,
    }));
  };
  return (
    <form
      className="growth-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setMessage("");
        const quietHours =
          (value.quietStart === null) !== (value.quietEnd === null);
        let timeZone = false;
        try {
          new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
        } catch {
          timeZone = true;
        }
        setInvalid({ quietHours, timeZone });
        if (quietHours || timeZone) {
          const input = quietHours
            ? value.quietStart === null
              ? fromInput
              : untilInput
            : zoneInput;
          input.current?.focus();
          return;
        }
        setBusy(true);
        setRequiresSignIn(false);
        try {
          await mutate("preferences", value, "PUT");
          setMessage(
            growthCopy.growthPreferencesSavedYourInAppRecordRemainsAvailable,
          );
        } catch (e) {
          setRequiresSignIn(e instanceof GrowthActionError && e.status === 401);
          setMessage(
            e instanceof GrowthActionError && e.status === 400
              ? growthCopy.growthPreferencesWereNotSaved
              : e instanceof Error
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
          disabled={busy}
          checked={value.push}
          onChange={(e) => update({ push: e.target.checked })}
        />
        {growthCopy.growthPushNotifications}
      </label>
      <label>
        <input
          type="checkbox"
          disabled={busy}
          checked={value.email}
          onChange={(e) => update({ email: e.target.checked })}
        />
        {growthCopy.growthEmailDigest}
      </label>
      <label>
        <input
          type="checkbox"
          disabled={busy}
          checked={value.hideSensitive}
          onChange={(e) => update({ hideSensitive: e.target.checked })}
        />
        {growthCopy.growthHideSensitivePreviews}
      </label>
      <fieldset disabled={busy}>
        <legend>{growthCopy.growthQuietHours}</legend>
        <label>
          {growthCopy.growthFrom}
          <input
            ref={fromInput}
            type="time"
            aria-invalid={invalid.quietHours || undefined}
            aria-describedby={
              invalid.quietHours ? `${errorId}-quiet` : undefined
            }
            value={time(value.quietStart)}
            onInput={(e) => update({ quietStart: minutes(e.currentTarget.value) })}
            onChange={(e) => update({ quietStart: minutes(e.target.value) })}
          />
        </label>
        <label>
          {growthCopy.growthUntil}
          <input
            ref={untilInput}
            type="time"
            aria-invalid={invalid.quietHours || undefined}
            aria-describedby={
              invalid.quietHours ? `${errorId}-quiet` : undefined
            }
            value={time(value.quietEnd)}
            onInput={(e) => update({ quietEnd: minutes(e.currentTarget.value) })}
            onChange={(e) => update({ quietEnd: minutes(e.target.value) })}
          />
        </label>
        {invalid.quietHours && (
          <p id={`${errorId}-quiet`} role="alert" className="growth-error">
            {growthCopy.growthErrorQuietHoursPair}
          </p>
        )}
        <label>
          {growthCopy.growthTimeZone}
          <input
            ref={zoneInput}
            className="qv-input"
            aria-invalid={invalid.timeZone || undefined}
            aria-describedby={invalid.timeZone ? `${errorId}-zone` : undefined}
            value={value.timeZone}
            maxLength={80}
            onChange={(e) => update({ timeZone: e.target.value })}
          />
        </label>
        {invalid.timeZone && (
          <p id={`${errorId}-zone`} role="alert" className="growth-error">
            {growthCopy.growthErrorTimeZone}
          </p>
        )}
        <p className="growth-help">
          {growthCopy.growthLeaveBothTimesEmptyForNoQuietHoursMatchingTimes}
        </p>
      </fieldset>
      <fieldset disabled={busy}>
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
      <fieldset disabled={busy}>
        <legend>{growthCopy.growthNotificationTypes}</legend>
        {kinds.map((kind) => (
          <div key={kind} role="group" aria-labelledby={`${errorId}-${kind}`}>
            <strong id={`${errorId}-${kind}`}>
              {notificationKindLabel(kind)}
            </strong>
            {(["push", "email"] as const).map((channel) => {
              const key =
                channel === "push" ? "disabledPushTypes" : "disabledEmailTypes";
              return (
                <label key={channel}>
                  <input
                    type="checkbox"
                    aria-labelledby={`${errorId}-${kind}-${channel} ${errorId}-${kind}`}
                    checked={!value[key].includes(kind)}
                    onChange={(e) =>
                      update({
                        [key]: e.target.checked
                          ? value[key].filter((k) => k !== kind)
                          : [...value[key], kind],
                      })
                    }
                  />
                  <span id={`${errorId}-${kind}-${channel}`}>
                    {channel === "push"
                      ? growthCopy.growthPush
                      : growthCopy.growthEmail}
                  </span>
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
      {requiresSignIn ? (
        <a
          className="qv-btn qv-btn--secondary"
          href="/auth/continue?returnTo=%2Fnotifications%2Fsettings"
        >
          {growthCopy.continueWithPantopus}
        </a>
      ) : null}
    </form>
  );
}
