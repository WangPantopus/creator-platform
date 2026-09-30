import type { Configuration } from "../../../../../packages/api/src/agent/contracts.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { AgentModel } from "./model.js";
import { contentHash } from "../../core/canonical.js";
export async function indexStyleExamples(
  repository: AgentRepository,
  scope: CreatorScope,
  configuration: Configuration,
  model: AgentModel,
  signal: AbortSignal,
) {
  const examples = configuration.examples.filter((e) => e.approved);
  for (let offset = 0; offset < examples.length; offset += 16) {
    const batch = examples.slice(offset, offset + 16);
    const existing = await repository.transaction(scope, async (client) => {
      const rows = await client.query<{
        example_id: string;
        text_hash: string;
      }>(
        "SELECT example_id,text_hash FROM creator.ai_style_embedding WHERE creator_id=$1 AND example_id=ANY($2::uuid[]) AND model=$3",
        [scope.creatorId, batch.map((e) => e.id), model.embeddingModel],
      );
      return rows.rows;
    });
    const missing = batch.filter(
      (e) =>
        !existing.some(
          (row) =>
            row.example_id === e.id &&
            row.text_hash === contentHash({ text: e.text }),
        ),
    );
    if (!missing.length) continue;
    const embedded = await model.embed(
      missing.map((e) => e.text),
      signal,
    );
    await repository.transaction(scope, async (client) => {
      for (const [index, example] of missing.entries())
        await client.query(
          "INSERT INTO creator.ai_style_embedding(creator_id,example_id,text_hash,embedding,model) VALUES($1,$2,$3,$4::vector,$5) ON CONFLICT DO NOTHING",
          [
            scope.creatorId,
            example.id,
            contentHash({ text: example.text }),
            JSON.stringify(embedded.vectors[index]),
            model.embeddingModel,
          ],
        );
      await client.query(
        "INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms) VALUES($1,$2,$3,$4,$5,0,$6,'style_index',0)",
        [
          scope.creatorId,
          contentHash({ examples: missing.map((e) => e.id) }),
          embedded.usage.provider,
          embedded.usage.model,
          embedded.usage.inputTokens,
          embedded.usage.costMicros,
        ],
      );
    });
  }
}
export async function nearestStyleExamples(
  repository: AgentRepository,
  scope: CreatorScope,
  configuration: Configuration,
  vector: number[],
  model: AgentModel,
) {
  const pool = configuration.examples
    .filter((e) => e.approved && !e.fixed)
    .map((e) => ({
      id: e.id,
      hash: contentHash({ text: e.text }),
      text: e.text,
    }));
  if (!pool.length) return [];
  return repository.transaction(scope, async (client) => {
    const rows = await client.query<{ text: string }>(
      "SELECT v.text FROM creator.ai_style_embedding s JOIN jsonb_to_recordset($2::jsonb) AS v(id uuid,hash text,text text) ON v.id=s.example_id AND v.hash=s.text_hash WHERE s.creator_id=$1 AND s.model=$4 ORDER BY s.embedding <=> $3::vector,s.example_id LIMIT 5",
      [
        scope.creatorId,
        JSON.stringify(pool),
        JSON.stringify(vector),
        model.embeddingModel,
      ],
    );
    return rows.rows.map((row) => row.text);
  });
}
