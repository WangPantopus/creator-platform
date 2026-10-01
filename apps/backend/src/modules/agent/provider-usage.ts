import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { AgentModel } from "./model.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { StreamProposal } from "./streaming.js";
import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";

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
  const admittedScope = Object.freeze({ ...scope });
  const fingerprint = model.fingerprint;
  const journal = repository.usageJournal;
  const pool = repository.pool;
  const lineage = execution && {
    generationId: execution.generationId,
    attemptId: execution.attemptId,
  };
  const insert = async (client: PoolClient) => {
    if (journal)
      return journal.open(
        client,
        admittedScope,
        { versionHash, model: fingerprint, category },
        execution,
      );
    const row = await client.query<{ id: string }>(
      "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,'configured',$3,0,0,NULL,$4,0) RETURNING id",
      [admittedScope.creatorId, versionHash, fingerprint, category],
    );
    return row.rows[0]!.id;
  };
  // W3 holds current thread/session/lease/processor authority through this
  // admission commit. No nested transaction and no provider I/O in its callback.
  const id = execution
    ? await execution.admit(insert)
    : await repository.transaction(admittedScope, insert);
  let completed = false;
  // This private closure holds only custody of the row actually committed
  // before provider I/O. Session revocation forbids new commands/admissions,
  // but cannot turn an existing provider charge into an unrecorded/free call.
  // No caller-supplied SQL callback, workspace creation or owner action runs here.
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
      // Preserve journal/export/seal lock order without requiring a current
      // interactive session or recreating deleted configuration.
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
      if (journal) {
        const attributed = await client.query(
          `SELECT id FROM creator.ai_usage WHERE creator_id=$1 AND id=$2
           AND generation_id IS NOT DISTINCT FROM $3::uuid
           AND attempt_id IS NOT DISTINCT FROM $4::uuid
           AND purpose=$5 AND provider_state='admitted'`,
          [
            admittedScope.creatorId,
            id,
            lineage?.generationId ?? null,
            lineage?.attemptId ?? null,
            category,
          ],
        );
        invariant(
          attributed.rowCount === 1,
          "usage_lineage_changed",
          "Completion must retain its actual generation and attempt custody.",
        );
        await journal.finish(
          client,
          admittedScope,
          id,
          usage,
          Math.round(performance.now() - started),
        );
      } else
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
