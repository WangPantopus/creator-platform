import type { PoolClient } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import type { PaidCoverageJournal } from "./paid-coverage.js";

export type CurrentTenure = Readonly<{
  since: string | null;
  continuous: boolean;
  /** Observed paid intervals establish coverage, not complete provider lifetime
   * history. Unknown/imported gaps are never filled from purchase age. */
  historyComplete: false;
  basis: "confirmed_stripe_paid_periods" | "confirmed_paid_periods";
}>;

/** The host must hold current caller/creator/fan denials on this same client.
 * The reader issues neither an actor nor an audience permission. */
export type TenureAuthority = (
  client: PoolClient,
  creatorId: string,
  fanId: string,
) => Promise<void>;

export function createCommerceTenureReader(
  assertAllowed: TenureAuthority,
  nativeCoverage?: PaidCoverageJournal,
) {
  invariant(
    typeof assertAllowed === "function",
    "tenure_authority_required",
    "Membership tenure needs current authority on the reading transaction.",
  );
  return async function currentTenure(
    client: PoolClient,
    creatorId: string,
    fanId: string,
  ): Promise<CurrentTenure> {
    z.uuid().parse(creatorId);
    z.uuid().parse(fanId);
    const context = (
      await client.query<{
        account_id: string | null;
        creator_id: string | null;
        fan_id: string | null;
      }>(
        "SELECT current_setting('app.account_id',true) AS account_id,current_setting('app.creator_id',true) AS creator_id,current_setting('app.fan_id',true) AS fan_id",
      )
    ).rows[0]!;
    invariant(
      context.account_id && z.uuid().safeParse(context.account_id).success,
      "tenure_scope_required",
      "The real caller account is required for membership tenure.",
    );
    await assertCurrentSession(client, context.account_id);
    await nativeCoverage?.assertReadable();
    await assertAllowed(client, creatorId, fanId);
    const authorized = (
      await client.query<{
        allowed: boolean;
        fan_owned: boolean;
        caller_retained: boolean;
      }>(
        "SELECT creator.commerce_scope($1::uuid,$2::uuid) AS allowed,creator.commerce_scope(NULL,$2::uuid) AS fan_owned,current_setting('app.account_id',true)=$3 AS caller_retained",
        [creatorId, fanId, context.account_id],
      )
    ).rows[0]!;
    invariant(
      authorized.allowed && authorized.caller_retained,
      "tenure_scope_required",
      "Only this fan or the current creator can read membership tenure.",
    );
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
      [creatorId, fanId],
    );
    // The configured authority already holds current creator denials/state.
    // A fan cannot row-lock creator_profile through its owner-only UPDATE RLS;
    // retain the actual account and recheck under that held authority instead.
    const creator = await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND verification='verified' AND NOT recovery_required",
      [creatorId],
    );
    invariant(
      creator.rowCount === 1,
      "creator_unavailable",
      "Current creator authority is required for membership tenure.",
    );
    // Hold membership before grants, as cancellation and reconciliation do.
    // Pending original refunds are excluded below even before cash settles.
    const memberships = (
      await client.query<{ id: string }>(
        "SELECT id FROM creator.commerce_membership WHERE creator_id=$1 AND fan_id=$2 ORDER BY id LIMIT 1001 FOR SHARE",
        [creatorId, fanId],
      )
    ).rows;
    invariant(
      memberships.length <= 1000,
      "tenure_reconciliation_required",
      "Membership history needs reconciliation before tenure can be shown.",
    );
    await client.query(
      `SELECT g.id FROM creator.access_grant g
       JOIN creator.commerce_membership m ON m.grant_id=g.id
         AND m.creator_id=g.creator_id AND m.fan_id=g.fan_id
       WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.id=ANY($3::uuid[]) ORDER BY g.id FOR SHARE OF g`,
      [creatorId, fanId, memberships.map((membership) => membership.id)],
    );
    // Aggregate complete immutable paid intervals, not current overwritten
    // membership dates or spend. PostgreSQL merges overlap and exact adjacency;
    // no time gap or unpaid grace interval can be bridged by this projection.
    const result = (
      await client.query<{ since: Date | null }>(
        `WITH paid AS (
          SELECT r.membership_id,r.period_start,r.period_end,
            tstzrange(r.period_start,r.period_end,'[)') AS coverage
          FROM creator.commerce_membership_receipt r
          JOIN creator.commerce_membership m ON m.id=r.membership_id
            AND m.creator_id=r.creator_id AND m.fan_id=r.fan_id AND m.provider='stripe'
          WHERE r.creator_id=$1 AND r.fan_id=$2 AND r.paid_minor>0 AND m.id=ANY($4::uuid[])
            -- Billing-effect RLS belongs to the real fan. A creator can read
            -- only the current established period until a held historical
            -- refund projection exists; never impersonate the fan to extend it.
            AND (${nativeCoverage ? "true" : "$3::boolean"} OR (m.period_start=r.period_start AND m.period_end=r.period_end
              AND m.state IN('active','grace','cancelled') AND m.period_start<=now() AND m.period_end>now()
              AND EXISTS(SELECT 1 FROM creator.access_grant g WHERE g.id=m.grant_id
                AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id AND g.source='membership'
                AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now())))
            AND EXISTS(SELECT 1 FROM creator.commerce_ledger l
              WHERE l.creator_id=r.creator_id AND l.fan_id=r.fan_id
                AND l.currency=r.currency AND l.kind='capture'
                AND l.cause='invoice_line:'||r.line_ref AND l.amount=r.paid_minor
                AND l.refs->>'membershipId'=r.membership_id::text
                AND l.refs->>'invoiceId'=r.invoice_ref)
            AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l
              WHERE l.creator_id=r.creator_id AND l.fan_id=r.fan_id
                AND l.currency=r.currency AND l.kind='refund' AND l.amount>0
                AND l.refs->>'membershipId'=r.membership_id::text
                AND l.refs->>'invoiceId'=r.invoice_ref
                AND l.cause='credit_note:'||l.provider_ref||':'||r.line_ref)
            AND ${
              nativeCoverage
                ? "NOT creator.commerce_paid_receipt_refund_held(r.id)"
                : `NOT EXISTS(SELECT 1 FROM creator.commerce_billing_effect e
              WHERE e.fan_id=r.fan_id AND e.state IN('pending','processing','unknown','done')
                AND (e.operation='refund' OR (e.operation='cancel' AND e.request->>'atEnd'='false'))
                AND coalesce(e.request->>'membershipId',e.request->'receipt'->>'membership_id')=r.membership_id::text
                AND e.request->'receipt'->>'line_ref'=r.line_ref
                AND e.request->'receipt'->>'invoice_ref'=r.invoice_ref)`
            }
          ${
            nativeCoverage
              ? `UNION ALL
          SELECT r.membership_id,r.period_start,r.period_end,tstzrange(r.period_start,r.period_end,'[)') AS coverage
          FROM creator.commerce_paid_coverage r JOIN creator.commerce_membership m ON m.id=r.membership_id
            AND m.creator_id=r.creator_id AND m.fan_id=r.fan_id AND m.provider=r.provider
          WHERE r.creator_id=$1 AND r.fan_id=$2 AND m.id=ANY($4::uuid[])
            AND NOT EXISTS(SELECT 1 FROM creator.commerce_paid_coverage_denial d
              WHERE d.provider=r.provider AND d.proof_reference=r.proof_reference
                AND d.reason IN('refund','revoked','unpaid'))`
              : ""
          }
        ), chain AS (
          SELECT unnest(range_agg(coverage)) AS coverage FROM paid
        )
        SELECT lower(chain.coverage) AS since FROM chain
        WHERE chain.coverage @> now() AND EXISTS(
          SELECT 1 FROM paid p JOIN creator.commerce_membership m ON m.id=p.membership_id
          JOIN creator.access_grant g ON g.id=m.grant_id
            AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
          WHERE p.coverage @> now() AND m.state IN('active','grace','cancelled')
            AND m.period_start<=now() AND m.period_end>now()
            AND g.source='membership' AND g.state='active'
            AND g.valid_from<=now() AND g.valid_until>now()
        )`,
        [
          creatorId,
          fanId,
          authorized.fan_owned,
          memberships.map((membership) => membership.id),
        ],
      )
    ).rows[0];
    // Any guard/query failure requires the owning transaction to roll back.
    // Successful reads restore their pair and retain the real account throughout.
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
      [context.creator_id ?? "", context.fan_id ?? ""],
    );
    return Object.freeze({
      since: result?.since?.toISOString() ?? null,
      continuous: Boolean(result?.since),
      historyComplete: false,
      basis: nativeCoverage
        ? "confirmed_paid_periods"
        : "confirmed_stripe_paid_periods",
    });
  };
}
