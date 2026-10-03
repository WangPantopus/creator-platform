"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FanProfileSchema } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { ConversationIntroOfferSchema } from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest } from "../conversation/api";
import { useIdentityRequest } from "./session-boundary";

/** Only a server-issued, currently authorized pending offer can render this UI. */
export function IntroOffer({
  root,
  offeredId,
  enabled,
  online,
}: {
  root: string;
  offeredId: string | null;
  enabled: boolean;
  online: boolean;
}) {
  const identity = useIdentityRequest();
  const request = useConversationRequest();
  const [offerId, setOfferId] = useState<string | null>(null);
  const [intro, setIntro] = useState("");
  const [disposition, setDisposition] = useState<"saved" | "skipped" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const inputId = useId();
  const storedIntro = identity.session.fan?.intro;
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
    };
  }, [root, identity.session.accountId]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!enabled) setOfferId(null);
    else if (online) {
      void request<unknown>(`${root}/intro-offer`, undefined, controller.signal)
        .then((result) => {
          if (!active) return;
          const pending = ConversationIntroOfferSchema.parse(result);
          setOfferId(pending.offerId);
          if (pending.offerId && storedIntro?.trim())
            setDisposition((value) => value ?? "saved");
        })
        .catch(() => {
          // Absence of an approved policy is not permission to invent an offer.
        });
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [root, request, enabled, online, offeredId, storedIntro]);

  if (!offerId || !identity.session.fan) return null;
  const acknowledge = async (current: number, id: string) => {
    const result = await request<{ acknowledged: boolean }>(
      `${root}/intro-offer/acknowledgement`,
      { offerId: id },
    );
    if (!result.acknowledged) throw new Error(copy.introOfferAckUnavailable);
    if (generation.current === current) setOfferId(null);
  };
  const finish = async (save: boolean) => {
    if (busy || !online || !offerId) return;
    const current = generation.current;
    const id = offerId;
    const fan = identity.session.fan!;
    setBusy(true);
    setError("");
    let choice = disposition;
    try {
      if (!choice && save) {
        const text = intro.trim();
        if (!text) return;
        const response = await identity.request("fan-profile/intro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intro: text, expectedVersion: fan.version }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error?.message ?? copy.introOfferUnavailable);
        const saved = FanProfileSchema.parse(result);
        if (saved.id !== fan.id || saved.intro !== text)
          throw new Error(copy.introOfferUnavailable);
        if (generation.current !== current) return;
        choice = "saved";
      } else if (!choice) choice = "skipped";
      if (generation.current !== current) return;
      setDisposition(choice);
      await acknowledge(current, id);
    } catch (failure) {
      if (generation.current === current)
        setError(
          failure instanceof Error
            ? failure.message
            : choice
              ? copy.introOfferAckUnavailable
              : copy.introOfferUnavailable,
        );
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  return (
    <section
      className="identity-intro-offer"
      aria-labelledby={`${inputId}-title`}
    >
      <h2 id={`${inputId}-title`}>{copy.introOfferTitle}</h2>
      <p id={`${inputId}-help`} className="qv-help">
        {copy.introOfferBody}
      </p>
      {disposition ? (
        <p role="status">
          {disposition === "saved"
            ? copy.introOfferSavedPending
            : copy.introOfferSkippedPending}
        </p>
      ) : (
        <div className="qv-field">
          <label className="qv-field__label" htmlFor={inputId}>
            {copy.introOfferLabel}
          </label>
          <textarea
            id={inputId}
            className="qv-input"
            rows={3}
            maxLength={240}
            value={intro}
            onChange={(event) => setIntro(event.target.value)}
            aria-describedby={`${inputId}-help`}
            disabled={busy}
          />
        </div>
      )}
      {error && (
        <div role="alert">
          <Notice tone="error" title={copy.introOfferTitle}>
            {error}
          </Notice>
        </div>
      )}
      <div className="identity-intro-offer__actions">
        {disposition ? (
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || !online}
            onClick={() => void finish(false)}
          >
            {busy ? copy.introOfferAcknowledging : copy.introOfferFinish}
          </button>
        ) : (
          <>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={busy || !online || !intro.trim()}
              onClick={() => void finish(true)}
            >
              {busy ? copy.introOfferSaving : copy.introOfferSave}
            </button>
            <button
              className="qv-btn qv-btn--quiet"
              disabled={busy || !online}
              onClick={() => void finish(false)}
            >
              {copy.introOfferSkip}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
