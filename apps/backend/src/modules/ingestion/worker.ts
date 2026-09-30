import type { AgentRepository, CreatorScope } from "../agent/repository.js";
import { bump, event } from "../agent/repository.js";
import type { AgentModel } from "../agent/model.js";
import { DomainError } from "../../core/errors.js";
import { chunkText } from "./chunking.js";

/** Creator-keyed durable work with a lease; abandoned jobs are reclaimed after restart. */
export class IngestionWorker {
  private active = false;
  constructor(
    private readonly repository: AgentRepository,
    private readonly model: AgentModel | null,
  ) {}
  async tick(scope: CreatorScope, signal: AbortSignal) {
    if (this.active || signal.aborted) return;
    this.active = true;
    try {
      const job = await this.repository.transaction(scope, async (client) => {
        if (this.model) {
          const changed = await client.query(
            "UPDATE creator.ai_source s SET state='failed',index_state='failed',error='Embedding configuration changed. Retry to rebuild this source.',progress=20 WHERE s.creator_id=$1 AND s.state='approved' AND NOT EXISTS(SELECT 1 FROM creator.ai_chunk c WHERE c.creator_id=$1 AND c.source_id=s.id AND c.source_revision=s.revision AND c.embedding_model=$2 AND c.embedding IS NOT NULL) RETURNING s.id",
            [scope.creatorId, this.model.embeddingModel],
          );
          if (changed.rowCount) {
            await client.query(
              "UPDATE creator.ai_workspace SET paused=true,revision=revision+1 WHERE creator_id=$1",
              [scope.creatorId],
            );
            await client.query(
              "UPDATE creator.ai_version SET state='paused' WHERE creator_id=$1 AND state='live'",
              [scope.creatorId],
            );
          }
        }
        const rows = await client.query<{
          id: string;
          source_id: string;
          source_revision: number;
          attempts: number;
          text_content: string;
        }>(
          `SELECT j.*,s.text_content FROM creator.ai_ingestion j JOIN creator.ai_source s ON s.id=j.source_id AND s.creator_id=j.creator_id WHERE j.creator_id=$1 AND s.state='processing' AND s.revision=j.source_revision AND (j.state='queued' OR (j.state='running' AND j.lease_until<now())) ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`,
          [scope.creatorId],
        );
        const row = rows.rows[0];
        if (!row) return null;
        await client.query(
          "UPDATE creator.ai_ingestion SET state='running',attempts=attempts+1,lease_until=now()+interval '3 minutes' WHERE id=$1 AND creator_id=$2",
          [row.id, scope.creatorId],
        );
        return row;
      });
      if (!job) return;
      try {
        if (!this.model)
          throw new DomainError(
            "embeddings_unconfigured",
            "Embedding provider is not configured; review is saved. Retry once it is connected.",
            503,
          );
        if (job.attempts >= 5)
          throw new DomainError(
            "ingestion_attempt_limit",
            "This import reached its retry limit. Revise the source to start again.",
            409,
          );
        const chunks = chunkText(job.text_content);
        const vectorById = new Map<string, number[]>();
        for (let offset = 0; offset < chunks.length; offset += 16) {
          signal.throwIfAborted();
          const batch = chunks.slice(offset, offset + 16);
          const embedded = await this.model.embed(
            batch.map((c) => c.text),
            signal,
          );
          batch.forEach((chunk, index) =>
            vectorById.set(chunk.id, embedded.vectors[index]!),
          );
          const valid = await this.repository.transaction(
            scope,
            async (client) => {
              await client.query(
                "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,'ingestion',0)",
                [
                  scope.creatorId,
                  job.source_id,
                  embedded.usage.provider,
                  embedded.usage.model,
                  embedded.usage.inputTokens,
                  0,
                  embedded.usage.costMicros,
                ],
              );
              const updated = await client.query(
                "UPDATE creator.ai_source SET progress=$4 WHERE id=$1 AND creator_id=$2 AND revision=$3 AND state='processing' RETURNING id",
                [
                  job.source_id,
                  scope.creatorId,
                  job.source_revision,
                  20 +
                    Math.round(
                      (70 * Math.min(offset + 16, chunks.length)) /
                        chunks.length,
                    ),
                ],
              );
              await client.query(
                "UPDATE creator.ai_ingestion SET lease_until=now()+interval '3 minutes' WHERE id=$1 AND creator_id=$2 AND state='running'",
                [job.id, scope.creatorId],
              );
              return updated.rowCount === 1;
            },
          );
          if (!valid) return;
        }
        await this.repository.transaction(scope, async (client, workspace) => {
          const current = await client.query(
            "SELECT id FROM creator.ai_source WHERE id=$1 AND creator_id=$2 AND revision=$3 AND state='processing' FOR UPDATE",
            [job.source_id, scope.creatorId, job.source_revision],
          );
          if (!current.rowCount) return;
          await client.query(
            "DELETE FROM creator.ai_chunk WHERE source_id=$1 AND creator_id=$2",
            [job.source_id, scope.creatorId],
          );
          for (const chunk of chunks)
            await client.query(
              "INSERT INTO creator.ai_chunk(id,creator_id,source_id,source_revision,ordinal,passage,start_offset,end_offset,embedding,embedding_model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10)",
              [
                chunk.id,
                scope.creatorId,
                job.source_id,
                job.source_revision,
                chunk.ordinal,
                chunk.text,
                chunk.start,
                chunk.end,
                JSON.stringify(vectorById.get(chunk.id)),
                this.model!.embeddingModel,
              ],
            );
          await client.query(
            "UPDATE creator.ai_source SET state='approved',index_state='ready',progress=100,error=NULL WHERE id=$1 AND creator_id=$2",
            [job.source_id, scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_ingestion SET state='completed',lease_until=NULL WHERE id=$1 AND creator_id=$2",
            [job.id, scope.creatorId],
          );
          await bump(client, scope.creatorId);
          await event(
            client,
            scope.creatorId,
            "source.approved",
            workspace.revision + 1,
            {
              sourceId: job.source_id,
              revision: job.source_revision,
              chunks: chunks.length,
            },
          );
        });
      } catch (error) {
        const message =
          error instanceof DomainError
            ? error.message
            : signal.aborted
              ? "Import interrupted; retry to resume."
              : "Source processing did not finish. Retry the import.";
        await this.repository.transaction(scope, async (client) => {
          await client.query(
            "UPDATE creator.ai_ingestion SET state='failed',lease_until=NULL,error=$3 WHERE id=$1 AND creator_id=$2 AND state='running'",
            [job.id, scope.creatorId, message],
          );
          await client.query(
            "UPDATE creator.ai_source SET state='failed',index_state='failed',error=$4 WHERE id=$1 AND creator_id=$2 AND revision=$3 AND state='processing'",
            [job.source_id, scope.creatorId, job.source_revision, message],
          );
        });
      }
    } finally {
      this.active = false;
    }
  }
}
