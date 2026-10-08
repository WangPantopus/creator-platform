import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";

/** Sanitized data only. These identifiers are not read or publication authority. */
export type ShadowSample = Readonly<{
  sampleId: string;
  occurredAt: string;
  paraphrasedPrompt: string;
  sanitizerReference: string;
}>;

/** Read on the original creator transaction, whose workspace lock serializes
 * collection and publication. Use wall time: transaction now() can go stale. */
export async function currentShadowSamples(
  client: PoolClient,
  creatorId: string,
): Promise<readonly ShadowSample[]> {
  const result = await client.query<{
    sampleId: string;
    occurredAt: Date;
    paraphrasedPrompt: string;
    sanitizerReference: string;
  }>(
    `SELECT id AS "sampleId",created_at AS "occurredAt",
      paraphrased_prompt AS "paraphrasedPrompt",sanitizer_reference AS "sanitizerReference"
     FROM creator.ai_shadow_sample WHERE creator_id=$1
      AND created_at>=clock_timestamp()-interval '7 days'
      AND created_at<=clock_timestamp() AND expires_at>clock_timestamp()
      AND expires_at<=created_at+interval '30 days'
     ORDER BY created_at DESC,id LIMIT 201`,
    [creatorId],
  );
  invariant(
    result.rows.length <= 200,
    "shadow_sample_limit",
    "Refresh the bounded privacy-safe comparison sample.",
  );
  return result.rows.map((row) => ({
    ...row,
    occurredAt: row.occurredAt.toISOString(),
  }));
}
