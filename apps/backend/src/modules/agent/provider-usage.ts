import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { AgentModel } from "./model.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { StreamProposal } from "./streaming.js";
import type { PoolClient } from "pg";

/** Structural consumer of W3's canonical GenerationExecution (7f5f63d).
 * Only the actual scoped processor supplies these callbacks, never HTTP JSON. */
export interface ProviderExecution {
  readonly generationId: string;
  readonly attemptId: string;
  admit<T>(journal: (client: PoolClient) => Promise<T>): Promise<T>;
  sealAdmission<T>(journal: (client: PoolClient) => Promise<T>): Promise<T>;
}

async function openProviderUsage(
  repository: AgentRepository,
  scope: CreatorScope,
  model: AgentModel,
  versionHash: string,
  category: string,
  signal: AbortSignal,
  execution?: ProviderExecution,
) {
  signal.throwIfAborted();
  const started = performance.now();
  const insert = async (client: PoolClient) => {
    if (repository.usageJournal)
      return repository.usageJournal.open(
        client,
        scope,
        { versionHash, model: model.fingerprint, category },
        execution,
      );
    const row = await client.query<{ id: string }>(
      "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,'configured',$3,0,0,NULL,$4,0) RETURNING id",
      [scope.creatorId, versionHash, model.fingerprint, category],
    );
    return row.rows[0]!.id;
  };
  // W3 holds current thread/session/lease/processor authority through this
  // admission commit. No nested transaction and no provider I/O in its callback.
  const id = execution
    ? await execution.admit(insert)
    : await repository.transaction(scope, insert);
  return async (usage: Usage) => {
    await repository.transaction(scope, async (client) => {
      if (repository.usageJournal)
        return repository.usageJournal.finish(
          client,
          scope,
          id,
          usage,
          Math.round(performance.now() - started),
        );
      await client.query(
        "UPDATE creator.ai_usage SET provider=$3,model=$4,input_tokens=$5,output_tokens=$6,cost_micros=$7,duration_ms=$8 WHERE creator_id=$1 AND id=$2",
        [
          scope.creatorId,
          id,
          usage.provider,
          usage.model,
          usage.inputTokens,
          usage.outputTokens,
          usage.costMicros,
          Math.round(performance.now() - started),
        ],
      );
    });
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
  execution?: ProviderExecution,
): Promise<T> {
  const finish = await openProviderUsage(
    repository,
    scope,
    model,
    versionHash,
    category,
    signal,
    execution,
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
  execution?: ProviderExecution,
): AsyncIterable<StreamProposal> {
  const finish = await openProviderUsage(
    repository,
    scope,
    model,
    versionHash,
    category,
    signal,
    execution,
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
