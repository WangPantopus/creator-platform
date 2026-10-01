import { randomUUID } from "node:crypto";
import type { AgentRepository, CreatorScope } from "./repository.js";
import { invariant } from "../../core/errors.js";
import type { PoolClient } from "pg";
export async function reserveCreatorCost(
  repository: AgentRepository,
  scope: CreatorScope,
  capMicros: number,
  maximumCostMicros: number | null,
) {
  invariant(
    maximumCostMicros !== null &&
      Number.isSafeInteger(maximumCostMicros) &&
      maximumCostMicros > 0,
    "pricing_required",
    "Verified provider rates are required before live generation.",
  );
  await repository.transaction(scope, async (client) => {
    // An expired hold can be an orphaned provider call after a crash. Its cost is
    // uncertain, so expiry alone must not silently restore the daily budget.
    await client.query(
      `WITH expired AS (UPDATE creator.ai_cost_hold SET state='settled'
       WHERE creator_id=$1 AND state='held' AND expires_at<=now() RETURNING id)
       INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms)
       SELECT $1,id::text,'unreconciled','expired-cost-hold',0,0,NULL,'provider_unknown',0 FROM expired`,
      [scope.creatorId],
    );
  });
  return repository.transaction(scope, async (client) => {
    const usage = await client.query<{ total: string; unknown: string }>(
      "SELECT coalesce(sum(cost_micros) FILTER(WHERE created_at>=date_trunc('day',now())),0)::text AS total,count(*) FILTER(WHERE cost_micros IS NULL)::text AS unknown FROM creator.ai_usage WHERE creator_id=$1 AND category IN ('reply','guardrail','memory','provider_unknown')",
      [scope.creatorId],
    );
    const holds = await client.query<{ total: string }>(
      "SELECT coalesce(sum(amount_micros),0)::text AS total FROM creator.ai_cost_hold WHERE creator_id=$1 AND state='held' AND expires_at>now()",
      [scope.creatorId],
    );
    invariant(
      Number(usage.rows[0]!.unknown) === 0 &&
        capMicros > 0 &&
        Number(usage.rows[0]!.total) +
          Number(holds.rows[0]!.total) +
          maximumCostMicros <=
          capMicros,
      "creator_cost_cap",
      "AI is paused at its daily cost cap or until uncertain provider costs are reconciled.",
    );
    const id = randomUUID();
    await client.query(
      "INSERT INTO creator.ai_cost_hold(id,creator_id,amount_micros,state,expires_at) VALUES($1,$2,$3,'held',now()+interval '5 minutes')",
      [id, scope.creatorId, maximumCostMicros],
    );
    return id;
  });
}
export async function settleCreatorCost(
  repository: AgentRepository,
  scope: CreatorScope,
  id: string,
  completed: boolean,
  provider: string,
  model: string,
  versionHash: string,
) {
  return repository.transaction(scope, (client) =>
    settleCreatorCostInTransaction(
      client,
      scope,
      id,
      completed,
      provider,
      model,
      versionHash,
    ),
  );
}
/** W3 supplies its existing final admission transaction after memory work. */
export async function settleCreatorCostInTransaction(
  client: PoolClient,
  scope: CreatorScope,
  id: string,
  completed: boolean,
  provider: string,
  model: string,
  versionHash: string,
) {
  // Serialize with reserveCreatorCost's workspace lock: a reservation must
  // observe either the still-held ceiling or all usage before its release.
  await client.query(
    "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
    [scope.creatorId],
  );
  const settled = await client.query(
    "UPDATE creator.ai_cost_hold SET state=$3 WHERE id=$1 AND creator_id=$2 AND state='held' RETURNING id",
    [id, scope.creatorId, completed ? "settled" : "released"],
  );
  if (settled.rowCount && !completed)
    await client.query(
      "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,$3,$4,0,0,NULL,'provider_unknown',0)",
      [scope.creatorId, versionHash, provider, model],
    );
}
