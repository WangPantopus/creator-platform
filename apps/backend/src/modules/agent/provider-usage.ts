import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { AgentModel } from "./model.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { StreamProposal } from "./streaming.js";
import { invariant } from "../../core/errors.js";

async function openProviderUsage(
  repository: AgentRepository,
  scope: CreatorScope,
  model: AgentModel,
  versionHash: string,
  category: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const started = performance.now();
  const admittedScope = Object.freeze({ ...scope });
  const fingerprint = model.fingerprint;
  const pool = repository.pool;
  const id = await repository.transaction(admittedScope, async (client) => {
    const row = await client.query<{ id: string }>(
      "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,'configured',$3,0,0,NULL,$4,0) RETURNING id",
      [admittedScope.creatorId, versionHash, fingerprint, category],
    );
    return row.rows[0]!.id;
  });
  let completed = false;
  // Only this private closure holds the actual pre-call row's custody. It
  // records an already admitted charge after revocation without permitting
  // another admission, creating a workspace or invoking an owner callback.
  return async (usage: Usage) => {
    invariant(
      !completed,
      "usage_already_completed",
      "This call already completed.",
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [admittedScope.creatorId, admittedScope.accountId],
      );
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [admittedScope.creatorId],
      );
      const admitted = await client.query(
        `SELECT id FROM creator.ai_usage WHERE creator_id=$1 AND id=$2
         AND version_hash=$3 AND category=$4 AND provider='configured' AND model=$5
         AND cost_micros IS NULL AND input_tokens=0 AND output_tokens=0`,
        [admittedScope.creatorId, id, versionHash, category, fingerprint],
      );
      invariant(
        admitted.rowCount === 1,
        "usage_admission_missing",
        "Completion requires this call's original admitted usage row.",
      );
      await client.query(
        "UPDATE creator.ai_usage SET provider=$3,model=$4,input_tokens=$5,output_tokens=$6,cost_micros=$7,duration_ms=$8 WHERE creator_id=$1 AND id=$2",
        [
          admittedScope.creatorId,
          id,
          usage.provider,
          usage.model,
          usage.inputTokens,
          usage.outputTokens,
          usage.costMicros,
          Math.round(performance.now() - started),
        ],
      );
      await client.query("COMMIT");
      completed = true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

function unknownUsage(model: AgentModel): Usage {
  return {
    provider: "configured",
    model: model.fingerprint,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: null,
  };
}

/** Records completed usage even when the later draft write fails. A provider
 * request without final usage remains uncertain rather than becoming free. */
export async function withProviderUsage<T extends { usage: Usage }>(
  repository: AgentRepository,
  scope: CreatorScope,
  model: AgentModel,
  versionHash: string,
  category: string,
  signal: AbortSignal,
  call: () => Promise<T>,
): Promise<T> {
  const finish = await openProviderUsage(
    repository,
    scope,
    model,
    versionHash,
    category,
    signal,
  );
  let usage = unknownUsage(model);
  try {
    const result = await call();
    usage = result.usage;
    return result;
  } finally {
    await finish(usage);
  }
}

/** The durable unknown row precedes opening the remote stream. A cancelled,
 * interrupted or guardrail-stopped stream without final usage remains unknown. */
export async function* withProviderStreamUsage(
  repository: AgentRepository,
  scope: CreatorScope,
  model: AgentModel,
  versionHash: string,
  category: string,
  signal: AbortSignal,
  call: () => AsyncIterable<StreamProposal>,
): AsyncIterable<StreamProposal> {
  const finish = await openProviderUsage(
    repository,
    scope,
    model,
    versionHash,
    category,
    signal,
  );
  let usage = unknownUsage(model);
  try {
    for await (const proposal of call()) {
      if ("usage" in proposal) usage = proposal.usage;
      yield proposal;
    }
  } finally {
    await finish(usage);
  }
}
