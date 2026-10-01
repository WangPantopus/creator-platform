import type { PoolClient } from "pg";
import type { CapabilitySnapshot } from "../../../../../packages/api/src/commerce/contracts.js";
import { assertThreadScope, type ThreadScope } from "./scope.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import {
  assertGenerationPrivacyFamily,
  type GenerationPrivacyAuthority,
  type GenerationPrivacyFamily,
  type GenerationPrivacyJob,
} from "../commerce/generation-privacy.js";

export type CostAllowanceSettlement = {
  policyVersion: string;
  outputDelivered: boolean;
} & (
  | { state: "unknown" }
  | { state: "final"; units: number; reference: string }
);

/** W2 source audiences use real tier IDs, independently of spend counters.
 * Group grants require their canonical producer; absence confers no group access. */
export async function sourceAudienceSnapshot(
  client: PoolClient,
  scope: ThreadScope,
) {
  assertThreadScope(scope);
  const memberships = await client.query<{
    tier_id: string;
    version: number;
    valid_until: Date;
  }>(
    `SELECT m.tier_id,m.version,least(g.valid_until,CASE WHEN m.state='grace' THEN m.grace_end ELSE m.period_end END) AS valid_until
     FROM creator.commerce_membership m JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
     WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.state IN ('active','grace','cancelled')
     AND g.state='active' AND g.source='membership' AND g.valid_from<=now() AND g.valid_until>now()
     AND CASE WHEN m.state='grace' THEN m.grace_end>now() ELSE m.period_end>now() END
     ORDER BY m.tier_id,m.id`,
    [scope.creatorId, scope.fanId],
  );
  return {
    revision: contentHash({
      creatorId: scope.creatorId,
      fanId: scope.fanId,
      memberships: memberships.rows,
    }),
    tierIds: [...new Set(memberships.rows.map((m) => m.tier_id))],
    groupIds: [] as string[],
    validUntil: new Date(
      Math.min(
        Date.now() + 60_000,
        ...memberships.rows.map((m) => m.valid_until.getTime()),
      ),
    ).toISOString(),
  };
}

/** Select one authoritative AI grant; overlapping equivalent allowances never sum. */
export async function capabilitySnapshot(
  client: PoolClient,
  scope: ThreadScope,
): Promise<CapabilitySnapshot> {
  assertThreadScope(scope);
  const grants = await client.query<{
    id: string;
    source: string;
    capabilities: string[];
    allowance: number;
    used: number;
    reserved: number;
    valid_until: Date;
  }>(
    `SELECT id,source,capabilities,allowance,used,reserved,valid_until FROM creator.access_grant
 WHERE creator_id=$1 AND fan_id=$2 AND state='active' AND valid_from<=now() AND valid_until>now()
 ORDER BY CASE source WHEN 'membership' THEN 0 WHEN 'comp' THEN 1 WHEN 'commitment' THEN 2 WHEN 'pass_slot' THEN 3 ELSE 4 END, valid_until DESC,id`,
    [scope.creatorId, scope.fanId],
  );
  const ai = grants.rows.find((g) => g.capabilities.includes("ai_message"));
  const pass =
    ai?.source === "pass_slot"
      ? (
          await client.query<{
            id: string;
            allowance: number;
            used: number;
            reserved: number;
            version: number;
          }>(
            "SELECT p.id,p.allowance,p.used,p.reserved,p.version FROM creator.commerce_pass p JOIN creator.commerce_pass_slot s ON s.pass_id=p.id WHERE s.grant_id=$1 AND s.state='active' AND p.state IN('active','cancelled') AND p.cycle_end>now()",
            [ai.id],
          )
        ).rows[0]
      : undefined;
  return {
    creatorId: scope.creatorId,
    fanId: scope.fanId,
    version: contentHash({
      pass: pass ?? null,
      grants: grants.rows.map((g) => ({
        id: g.id,
        source: g.source,
        capabilities: [...g.capabilities].sort(),
        allowance: g.allowance,
        used: g.used,
        reserved: g.reserved,
        validUntil: g.valid_until.toISOString(),
      })),
    }),
    validUntil: grants.rows.length
      ? new Date(
          Math.min(...grants.rows.map((g) => g.valid_until.getTime())),
        ).toISOString()
      : null,
    capabilities: [
      ...new Set(
        grants.rows.flatMap((g) =>
          g.source === "pass_slot"
            ? g.capabilities.filter((c) => c === "ai_message")
            : g.capabilities,
        ),
      ),
    ],
    allowance: {
      available: pass
        ? pass.allowance - pass.used - pass.reserved
        : ai?.source === "pass_slot"
          ? 0
          : ai
            ? ai.allowance - ai.used - ai.reserved
            : 0,
      unit: "cost_unit",
    },
    sources: grants.rows.map((g) => ({
      id: g.id,
      source: g.source,
      validUntil: g.valid_until.toISOString(),
    })),
  };
}

/** W3 calls this inside its own durable acceptance transaction. */
export async function reserveCostAllowance(
  client: PoolClient,
  scope: ThreadScope,
  key: string,
  units: number,
  policyVersion?: string,
) {
  assertThreadScope(scope);
  invariant(
    Number.isSafeInteger(units) && units > 0 && units <= 2147483647,
    "invalid_cost_units",
    "A positive cost reservation is required.",
  );
  invariant(
    policyVersion === undefined ||
      (policyVersion.length > 0 && policyVersion.length <= 200),
    "cost_policy_required",
    "An immutable reviewed cost policy is required.",
  );
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `allowance:${scope.creatorId}:${scope.fanId}`,
  ]);
  const prior = await client.query<{
    id: string;
    units: number;
    state: string;
    cost_policy_version?: string | null;
  }>(
    "SELECT id,units,state,to_jsonb(r)->>'cost_policy_version' AS cost_policy_version FROM creator.commerce_allowance_reservation r WHERE creator_id=$1 AND fan_id=$2 AND key=$3",
    [scope.creatorId, scope.fanId, key],
  );
  if (prior.rows[0]) {
    invariant(
      prior.rows[0].units === units &&
        (prior.rows[0].cost_policy_version ?? undefined) === policyVersion,
      "idempotency_conflict",
      "Reservation parameters changed.",
    );
    return prior.rows[0];
  }
  const eligible = await client.query<{ id: string; source: string }>(
    `SELECT id,source FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2 AND 'ai_message'=ANY(capabilities) AND state='active' AND valid_from<=now() AND valid_until>now()
 ORDER BY CASE source WHEN 'membership' THEN 0 WHEN 'comp' THEN 1 WHEN 'commitment' THEN 2 WHEN 'pass_slot' THEN 3 ELSE 4 END,valid_until DESC,id LIMIT 1`,
    [scope.creatorId, scope.fanId],
  );
  const grant = eligible.rows[0];
  invariant(grant, "ai_access_unavailable", "AI access is unavailable.");
  const pass =
    grant.source === "pass_slot"
      ? (
          await client.query<{ id: string; cycle_start: string }>(
            "SELECT p.id,p.cycle_start::text AS cycle_start FROM creator.commerce_pass p JOIN creator.commerce_pass_slot s ON s.pass_id=p.id WHERE s.grant_id=$1 AND s.state='active' AND p.state IN('active','cancelled') AND p.cycle_end>now() FOR UPDATE OF p",
            [grant.id],
          )
        ).rows[0]
      : undefined;
  if (grant.source === "pass_slot") {
    invariant(pass, "pass_expired", "Pass access ended.");
    const budget = await client.query(
      "UPDATE creator.commerce_pass SET reserved=reserved+$2,version=version+1 WHERE id=$1 AND used+reserved+$2<=allowance RETURNING id",
      [pass.id, units],
    );
    invariant(
      budget.rowCount === 1,
      "allowance_unavailable",
      "The shared pass allowance is unavailable.",
    );
  }
  const reserved = await client.query(
    "UPDATE creator.access_grant SET reserved=reserved+$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='active' AND valid_until>now() AND used+reserved+$4<=allowance RETURNING id",
    [grant.id, scope.creatorId, scope.fanId, units],
  );
  invariant(
    reserved.rowCount === 1,
    "allowance_unavailable",
    "The message allowance is unavailable.",
  );
  return (
    await client.query<{ id: string; units: number; state: string }>(
      `INSERT INTO creator.commerce_allowance_reservation(creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle${policyVersion === undefined ? "" : ",cost_policy_version"}) VALUES($1,$2,$3,$4,$5,'reserved',$6,$7${policyVersion === undefined ? "" : ",$8"}) RETURNING id,units,state`,
      [
        scope.creatorId,
        scope.fanId,
        grant.id,
        key,
        units,
        pass?.id ?? null,
        pass?.cycle_start ?? null,
        ...(policyVersion === undefined ? [] : [policyVersion]),
      ],
    )
  ).rows[0]!;
}
export async function settleCostAllowance(
  client: PoolClient,
  scope: ThreadScope,
  id: string,
  outcome: boolean | CostAllowanceSettlement,
) {
  assertThreadScope(scope);
  return settleVerifiedCostAllowance(client, scope, id, outcome);
}

/** Lifecycle settlement does not issue an interactive ThreadScope. Actual W8
 * family authority and the durable generation/grant/key are checked before and
 * after the shared accounting operation. Unknown usage cannot authorize purge. */
export async function settleCostAllowanceForPrivacy(
  client: PoolClient,
  job: GenerationPrivacyJob,
  family: GenerationPrivacyFamily,
  authority: GenerationPrivacyAuthority,
  generationId: string,
  id: string,
  outcome: Extract<CostAllowanceSettlement, { state: "final" }>,
) {
  await assertGenerationPrivacyFamily(client, job, family, authority);
  const bound = await client.query(
    `SELECT r.id FROM creator.generation g JOIN creator.commerce_allowance_reservation r
     ON r.creator_id=g.creator_id AND r.fan_id=g.fan_id AND r.grant_id=g.grant_id AND r.key='generation:'||g.id::text
     WHERE g.id=$1 AND g.thread_id=$2 AND g.creator_id=$3 AND g.fan_id=$4 AND r.id=$5`,
    [generationId, family.threadId, family.creatorId, family.fanId, id],
  );
  invariant(
    bound.rowCount === 1 && outcome.state === "final",
    "privacy_reservation_mismatch",
    "The settled allowance must belong to this exact durable generation family.",
  );
  await settleVerifiedCostAllowance(client, family, id, outcome);
  await assertGenerationPrivacyFamily(client, job, family, authority);
}

async function settleVerifiedCostAllowance(
  client: PoolClient,
  scope: Pick<ThreadScope, "creatorId" | "fanId">,
  id: string,
  outcome: boolean | CostAllowanceSettlement,
) {
  const weighted = typeof outcome !== "boolean";
  const row = (
    await client.query<{
      grant_id: string;
      units: number;
      state: string;
      pass_id: string | null;
      pass_cycle: string | null;
      cost_policy_version?: string | null;
      settled_units?: number | null;
      settlement_ref?: string | null;
      output_delivered?: boolean | null;
    }>(
      `SELECT grant_id,units,state,pass_id,pass_cycle::text AS pass_cycle,to_jsonb(r)->>'cost_policy_version' AS cost_policy_version${weighted ? ",settled_units,settlement_ref,output_delivered" : ""} FROM creator.commerce_allowance_reservation r WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE`,
      [id, scope.creatorId, scope.fanId],
    )
  ).rows[0];
  invariant(
    row,
    "reservation_unavailable",
    "Allowance reservation is unavailable.",
  );
  invariant(
    weighted || !row.cost_policy_version,
    "cost_receipt_required",
    "A weighted reservation requires current attributed usage; retain its hold.",
  );
  const outputDelivered = weighted ? outcome.outputDelivered : outcome;
  if (weighted) {
    invariant(
      outcome.state === "unknown" || outcome.state === "final",
      "cost_receipt_invalid",
      "Current attributed generation usage is required; retain its hold.",
    );
    invariant(
      row.cost_policy_version &&
        row.cost_policy_version === outcome.policyVersion,
      "cost_policy_mismatch",
      "Settle this reservation using its original reviewed cost policy.",
    );
    invariant(
      row.output_delivered == null || row.output_delivered === outputDelivered,
      "generation_output_changed",
      "The terminal generation output evidence changed.",
    );
    if (row.output_delivered == null) {
      await client.query(
        "UPDATE creator.commerce_allowance_reservation SET output_delivered=$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [id, scope.creatorId, scope.fanId, outputDelivered],
      );
      // A used membership cannot become an unused refund while cost is unknown.
      if (outputDelivered)
        await markAllowanceFirstUse(client, scope, row.grant_id, id);
    }
    // Cancellation, a missing terminal provider receipt or an interrupted
    // usage journal cannot free the held ceiling. Delivery can still complete.
    if (outcome.state === "unknown") return;
    invariant(
      Number.isSafeInteger(outcome.units) &&
        outcome.units >= 0 &&
        outcome.units <= row.units &&
        outcome.reference.length > 0 &&
        outcome.reference.length <= 200,
      "cost_receipt_invalid",
      "A bounded final cost receipt is required; retain the original hold.",
    );
  }
  const units = weighted
    ? outcome.state === "final"
      ? outcome.units
      : 0
    : outcome
      ? row.units
      : 0;
  const state = units > 0 ? "consumed" : "released";
  if (row.state !== "reserved") {
    invariant(
      row.state === state &&
        (!weighted ||
          (row.settled_units === units &&
            outcome.state === "final" &&
            row.settlement_ref === outcome.reference)),
      "reservation_settled",
      "Allowance was already settled.",
    );
    return;
  }
  // Match Billing's membership -> grant order even for historical fixed-unit
  // reservations. A refund cannot hold membership while this holds its grant.
  if (!weighted && outputDelivered)
    await markAllowanceFirstUse(client, scope, row.grant_id, id);
  if (row.pass_id) {
    const pass = (
      await client.query<{ cycle_start: string }>(
        "SELECT cycle_start::text AS cycle_start FROM creator.commerce_pass WHERE id=$1 FOR UPDATE",
        [row.pass_id],
      )
    ).rows[0];
    invariant(
      pass,
      "allowance_inconsistent",
      "Pass allowance reconciliation is required.",
    );
    // Compare canonical SQL date strings. pg decodes DATE as distinct local-time
    // Date objects, whose identity equality fails even for the same paid cycle.
    // A prior-period generation cannot decrement the new cycle's counter.
    if (pass.cycle_start === row.pass_cycle) {
      const updated = await client.query(
        "UPDATE creator.commerce_pass SET reserved=reserved-$2,used=used+$3,version=version+1 WHERE id=$1 AND reserved >= $2 RETURNING id",
        [row.pass_id, row.units, units],
      );
      invariant(
        updated.rowCount === 1,
        "allowance_inconsistent",
        "Pass allowance reconciliation is required.",
      );
    }
  }
  const updated = await client.query(
    "UPDATE creator.access_grant SET reserved=reserved-$4,used=used+$5 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND reserved >= $4 RETURNING id",
    [row.grant_id, scope.creatorId, scope.fanId, row.units, units],
  );
  invariant(
    updated.rowCount === 1,
    "allowance_inconsistent",
    "Allowance reconciliation is required.",
  );
  await client.query(
    `UPDATE creator.commerce_allowance_reservation SET state=$4${weighted ? ",settled_units=$5,settlement_ref=$6" : ""} WHERE id=$1 AND creator_id=$2 AND fan_id=$3`,
    [
      id,
      scope.creatorId,
      scope.fanId,
      state,
      ...(weighted && outcome.state === "final"
        ? [units, outcome.reference]
        : []),
    ],
  );
}
/** W3 records this atomically with the first real visible sentence. */
export async function recordCostAllowanceOutput(
  client: PoolClient,
  scope: ThreadScope,
  reservationId: string,
  grantId: string,
) {
  assertThreadScope(scope);
  const recorded = await client.query(
    `UPDATE creator.commerce_allowance_reservation SET output_delivered=true
     WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND grant_id=$4
       AND state='reserved' AND cost_policy_version IS NOT NULL
       AND (output_delivered IS NULL OR output_delivered=true) RETURNING id`,
    [reservationId, scope.creatorId, scope.fanId, grantId],
  );
  invariant(
    recorded.rowCount === 1,
    "generation_output_unavailable",
    "The generation has no current output reservation.",
  );
  await markAllowanceFirstUse(client, scope, grantId, reservationId);
}
async function markAllowanceFirstUse(
  client: PoolClient,
  scope: Pick<ThreadScope, "creatorId" | "fanId">,
  grantId: string,
  reservationId: string,
) {
  await client.query(
    "INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind) SELECT creator_id,fan_id,id,$4,'ai_message' FROM creator.commerce_membership WHERE grant_id=$1 AND creator_id=$2 AND fan_id=$3 ON CONFLICT DO NOTHING",
    [grantId, scope.creatorId, scope.fanId, `allowance:${reservationId}`],
  );
  await client.query(
    "UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,now()) WHERE grant_id=$1 AND creator_id=$2 AND fan_id=$3",
    [grantId, scope.creatorId, scope.fanId],
  );
}
