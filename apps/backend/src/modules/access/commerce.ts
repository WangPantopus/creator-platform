import type { PoolClient } from "pg";
import type { CapabilitySnapshot } from "../../../../../packages/api/src/commerce/contracts.js";
import { assertThreadScope, type ThreadScope } from "./scope.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { commerceAudience } from "../commerce/audience.js";

/** W2 source audiences use real tier IDs, independently of spend counters.
 * Group grants require their canonical producer; absence confers no group access. */
export async function sourceAudienceSnapshot(
  client: PoolClient,
  scope: ThreadScope,
) {
  return commerceAudience(client, scope);
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
) {
  assertThreadScope(scope);
  invariant(
    Number.isSafeInteger(units) && units > 0,
    "invalid_cost_units",
    "A positive cost reservation is required.",
  );
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `allowance:${scope.creatorId}:${scope.fanId}`,
  ]);
  const prior = await client.query<{
    id: string;
    units: number;
    state: string;
  }>(
    "SELECT id,units,state FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2 AND key=$3",
    [scope.creatorId, scope.fanId, key],
  );
  if (prior.rows[0]) {
    invariant(
      prior.rows[0].units === units,
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
      `INSERT INTO creator.commerce_allowance_reservation(creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle) VALUES($1,$2,$3,$4,$5,'reserved',$6,$7) RETURNING id,units,state`,
      [
        scope.creatorId,
        scope.fanId,
        grant.id,
        key,
        units,
        pass?.id ?? null,
        pass?.cycle_start ?? null,
      ],
    )
  ).rows[0]!;
}
export async function settleCostAllowance(
  client: PoolClient,
  scope: ThreadScope,
  id: string,
  consumed: boolean,
) {
  assertThreadScope(scope);
  const row = (
    await client.query<{
      grant_id: string;
      units: number;
      state: string;
      pass_id: string | null;
      pass_cycle: string | null;
    }>(
      "SELECT grant_id,units,state,pass_id,pass_cycle::text AS pass_cycle FROM creator.commerce_allowance_reservation WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
      [id, scope.creatorId, scope.fanId],
    )
  ).rows[0];
  invariant(
    row,
    "reservation_unavailable",
    "Allowance reservation is unavailable.",
  );
  const state = consumed ? "consumed" : "released";
  if (row.state !== "reserved") {
    invariant(
      row.state === state,
      "reservation_settled",
      "Allowance was already settled.",
    );
    return;
  }
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
    // Compare canonical SQL date strings, rather than distinct pg Date objects.
    // A prior-period generation cannot decrement the new cycle's counter.
    if (pass.cycle_start === row.pass_cycle) {
      const updated = await client.query(
        "UPDATE creator.commerce_pass SET reserved=reserved-$2,used=used+$3,version=version+1 WHERE id=$1 AND reserved >= $2 RETURNING id",
        [row.pass_id, row.units, consumed ? row.units : 0],
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
    [
      row.grant_id,
      scope.creatorId,
      scope.fanId,
      row.units,
      consumed ? row.units : 0,
    ],
  );
  invariant(
    updated.rowCount === 1,
    "allowance_inconsistent",
    "Allowance reconciliation is required.",
  );
  await client.query(
    "UPDATE creator.commerce_allowance_reservation SET state=$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
    [id, scope.creatorId, scope.fanId, state],
  );
  if (consumed) {
    await client.query(
      "INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind) SELECT creator_id,fan_id,id,$4,'ai_message' FROM creator.commerce_membership WHERE grant_id=$1 AND creator_id=$2 AND fan_id=$3 ON CONFLICT DO NOTHING",
      [row.grant_id, scope.creatorId, scope.fanId, `allowance:${id}`],
    );
    await client.query(
      "UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,now()) WHERE grant_id=$1 AND creator_id=$2 AND fan_id=$3",
      [row.grant_id, scope.creatorId, scope.fanId],
    );
  }
}
