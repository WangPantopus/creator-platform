import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { formatCopy } from "@qelvora/copy";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import { trustPublicCreatorDenial } from "../trust/scope-restriction.js";

/** Lane 1's public creator check (W8): false while ops has paused or suspended
 * the creator or revoked her license, or while the signed-in visitor is denied
 * her; it throws when it cannot answer. A host may pass its restoration-gated
 * form; lane 1's plain check is the default. */
export type PublicCreatorCheck = (
  client: PoolClient,
  creatorId: string,
) => Promise<boolean>;
const lane1PublicCreatorCheck: PublicCreatorCheck = trustPublicCreatorDenial();

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
  /** Only members whose tier includes requests can ask (T-07): show
   * `modeMembersOnly` beside it. */
  membersOnly: boolean;
}>;
export type CommercePublicSummary = Readonly<{
  creatorId: string;
  offers: readonly CommercePublicOffer[];
  /** "{name} answers {mode} within {deadline} · {n} of {cap} left this week."
   * for the first offer any fan can ask for (the first offer when all are for
   * members), or "" when nothing is offered. */
  capacity: string;
  /** "{name} usually decides in {range}" needs the creator's decision record,
   * which waits for its migration: "" until then, never an invented range. */
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
/** 48 hours and under in hours ("1 hour" alone); whole days beyond. */
export const deadlinePhrase = (hours: number) =>
  hours === 1
    ? "1 hour"
    : hours <= 48 || hours % 24 !== 0
      ? `${hours} hours`
      : `${hours / 24} days`;

/** Needs no account: offers and capacity are world-readable rows. A signed-in
 * visitor is checked by lane 1 as that visitor. */
export async function commercePublicSummary(
  pool: Pool,
  creatorId: string,
  publicCreator: PublicCreatorCheck = lane1PublicCreatorCheck,
): Promise<CommercePublicSummary | null> {
  invariant(
    z.uuid().safeParse(creatorId).success,
    "invalid_request",
    "Check the information and try again.",
  );
  const visitor = requestAuthority.getStore();
  const client = await pool.connect();
  try {
    // Lane 1's check holds the visitor's session row, which a read-only
    // transaction refuses; everything read after it is read-only.
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SET LOCAL statement_timeout = 5000");
    const creator = (
      await client.query<{ display_name: string }>(
        "SELECT display_name FROM creator.creator_profile WHERE id=$1 AND verification='verified' AND NOT recovery_required",
        [creatorId],
      )
    ).rows[0];
    // Lane 1 cannot answer for a creator that does not exist: unknown first.
    if (!creator) {
      await client.query("COMMIT");
      return null;
    }
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      visitor?.accountId ?? "",
    ]);
    // A creator ops has paused, suspended or revoked offers nothing in public,
    // and reads as unknown, so the ops action is not revealed. Checked before
    // any offer is read and held to commit; no answer means no summary.
    if (!(await publicCreator(client, creatorId))) {
      await client.query("COMMIT");
      return null;
    }
    await client.query("SET TRANSACTION READ ONLY");
    const rows = (
      await client.query<{
        id: string;
        kind: string;
        title: string;
        amount: string;
        currency: string;
        delivery_hours: number;
        weekly_limit: number;
        eligibility: string[];
        used: number;
        reserved: number;
        window_end: Date;
      }>(
        `SELECT m.id,m.kind,m.title,m.amount,m.currency,m.delivery_hours,m.weekly_limit,m.eligibility,
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
        membersOnly: m.eligibility.length > 0,
      });
    });
    const first = offers.find((o) => !o.membersOnly) ?? offers[0];
    const capacity = first
      ? formatCopy("capacity", {
          name: creator.display_name,
          mode: phrases[first.kind] ?? first.title.toLowerCase(),
          deadline: deadlinePhrase(first.deliveryHours),
          n: first.left,
          cap: first.cap,
        })
      : "";
    return Object.freeze({
      creatorId,
      offers,
      capacity,
      reliability: "",
      version: contentHash({ offers, capacity, reliability: "" }),
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
