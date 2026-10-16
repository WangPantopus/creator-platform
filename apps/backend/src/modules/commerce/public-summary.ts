import type { Pool } from "pg";
import { z } from "zod";
import { formatCopy } from "@qelvora/copy";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";

/** What a creator offers by request, and how much of this week is left: the
 * world-readable summary of the capacity commerce enforces (contract C8). It
 * reads only offers, their capacity row and the creator's public identity,
 * which are public by design; never a request, a fan or a price history. */
export type CommercePublicOffer = Readonly<{
  modeId: string;
  kind: string;
  title: string;
  amount: number;
  currency: string;
  deliveryHours: number;
  cap: number;
  left: number;
  /** When a fully booked offer opens again (the next weekly window). */
  opensAt: string | null;
}>;
export type CommercePublicSummary = Readonly<{
  creatorId: string;
  offers: readonly CommercePublicOffer[];
  /** "{name} answers {mode} within {deadline} · {n} of {cap} left this week."
   * for the first offer, or "" when nothing is offered. */
  capacity: string;
  /** "{name} usually decides in {range}" from the creator's decision record
   * (the founder's decision 5): the middle half of how long fans waited over
   * the last 90 days, once there are five outcomes. "" before that, and until
   * the record's migration is registered: never an invented range. */
  reliability: string;
  /** Changes whenever any field above changes. */
  version: string;
  computedAt: string;
}>;

const phrases: Record<string, string> = {
  written_reply: "written replies",
  voice_note: "voice notes",
  audio_call: "audio calls",
  video_call: "video calls",
  group_answer: "group answers",
  guaranteed_review: "reviews",
};
/** 48 hours and under in hours; whole days beyond. */
export const deadlinePhrase = (hours: number) =>
  hours <= 48 || hours % 24 !== 0 ? `${hours} hours` : `${hours / 24} days`;

/** Read with no account: offers and capacity are world-readable rows. */
export async function commercePublicSummary(
  pool: Pool,
  creatorId: string,
): Promise<CommercePublicSummary | null> {
  invariant(
    z.uuid().safeParse(creatorId).success,
    "invalid_request",
    "Check the information and try again.",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = 5000");
    const creator = (
      await client.query<{ display_name: string }>(
        "SELECT display_name FROM creator.creator_profile WHERE id=$1 AND verification='verified' AND NOT recovery_required",
        [creatorId],
      )
    ).rows[0];
    if (!creator) {
      await client.query("COMMIT");
      return null;
    }
    const rows = (
      await client.query<{
        id: string;
        kind: string;
        title: string;
        amount: string;
        currency: string;
        delivery_hours: number;
        weekly_limit: number;
        used: number;
        reserved: number;
        window_end: Date;
      }>(
        `SELECT m.id,m.kind,m.title,m.amount,m.currency,m.delivery_hours,m.weekly_limit,
          coalesce(c.used,0) AS used,coalesce(c.reserved,0) AS reserved,
          (date_trunc('week',now() AT TIME ZONE 'UTC')+interval '7 days') AT TIME ZONE 'UTC' AS window_end
         FROM creator.commerce_mode m
         LEFT JOIN creator.commerce_capacity c ON c.mode_id=m.id
          AND c.window_start=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
         WHERE m.creator_id=$1 AND m.state='offered' AND m.amount IS NOT NULL
         ORDER BY m.amount,m.title,m.id LIMIT 20`,
        [creatorId],
      )
    ).rows;
    // The decision record exists once its migration is registered
    // (schema-decision-record.sql); it answers only the range, and only with
    // five outcomes or more.
    const record = (
      await client.query<{ present: boolean }>(
        "SELECT to_regprocedure('creator.commerce_decision_range(uuid)') IS NOT NULL AS present",
      )
    ).rows[0]!.present
      ? (
          await client.query<{ low_seconds: number; high_seconds: number }>(
            "SELECT low_seconds,high_seconds FROM creator.commerce_decision_range($1)",
            [creatorId],
          )
        ).rows[0]
      : undefined;
    await client.query("COMMIT");
    const offers = rows.map((m) => {
      // A slot can be taken by a request and returned by the creator's limit
      // edit; what is left is never shown below zero.
      const left = Math.max(0, m.weekly_limit - m.used - m.reserved);
      return Object.freeze({
        modeId: m.id,
        kind: m.kind,
        title: m.title,
        amount: Number(m.amount),
        currency: m.currency,
        deliveryHours: m.delivery_hours,
        cap: m.weekly_limit,
        left,
        opensAt: left === 0 ? m.window_end.toISOString() : null,
      });
    });
    const first = offers[0];
    const capacity = first
      ? formatCopy("capacity", {
          name: creator.display_name,
          mode: phrases[first.kind] ?? first.title.toLowerCase(),
          deadline: deadlinePhrase(first.deliveryHours),
          n: first.left,
          cap: first.cap,
        })
      : "";
    const reliability = record
      ? formatCopy("decisionEta", {
          name: creator.display_name,
          range: decisionRange(record.low_seconds, record.high_seconds),
        })
      : "";
    return Object.freeze({
      creatorId,
      offers,
      capacity,
      reliability,
      version: contentHash({ offers, capacity, reliability }),
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The middle half of a creator's decision times in words: hours while the
 * slower end is under 48 hours, whole days beyond ("3 to 10 hours", "1 to 2
 * days", "2 days"), never under one hour or one day. */
export function decisionRange(lowSeconds: number, highSeconds: number) {
  const hours = highSeconds < 48 * 3600;
  const unit = hours ? 3600 : 86400;
  const low = Math.max(1, Math.round(lowSeconds / unit));
  const high = Math.max(1, Math.round(highSeconds / unit));
  const word = hours ? "hour" : "day";
  return low === high
    ? `${low} ${word}${low === 1 ? "" : "s"}`
    : `${low} to ${high} ${word}s`;
}
