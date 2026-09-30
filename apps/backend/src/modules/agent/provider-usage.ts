import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { AgentModel } from "./model.js";
import type { AgentRepository, CreatorScope } from "./repository.js";

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
  signal.throwIfAborted();
  const started = performance.now();
  const id = await repository.transaction(scope, async (client) => {
    const row = await client.query<{ id: string }>(
      "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,'configured',$3,0,0,NULL,$4,0) RETURNING id",
      [scope.creatorId, versionHash, model.fingerprint, category],
    );
    return row.rows[0]!.id;
  });
  let usage: Usage = {
    provider: "configured",
    model: model.fingerprint,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: null,
  };
  try {
    const result = await call();
    usage = result.usage;
    return result;
  } finally {
    await repository.transaction(scope, async (client) => {
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
  }
}
