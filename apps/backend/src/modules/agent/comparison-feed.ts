import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { ShadowSample } from "./shadow-samples.js";

export interface PrivacyParaphrasePort {
  /** Complete current cohort, at most200, on the consumer's original held
   * transaction. The original owner holds consent/exclusion/denial and source
   * locks here; a detached array or new transaction cannot authorize the write.
   * Empty removes cached candidates but cannot pass an upgrade. */
  verifiedParaphrases(
    scope: CreatorScope,
    client: PoolClient,
  ): Promise<readonly ShadowSample[]>;
}

const Batch = z
  .array(
    z.strictObject({
      sampleId: z.uuid(),
      occurredAt: z.iso.datetime(),
      paraphrasedPrompt: z.string().min(5).max(1000),
      sanitizerReference: z.string().trim().min(1).max(512),
    }),
  )
  .max(200);

export const comparisonCohortHash = (samples: readonly ShadowSample[]) =>
  contentHash(
    [...samples].sort((a, b) => a.sampleId.localeCompare(b.sampleId)),
  );

/** Consumer lifecycle only; validation and hashes cannot replace the original
 * privacy owner. Read and final read both use the original workspace lock. */
export async function holdComparisonCohort(
  repository: AgentRepository,
  feed: PrivacyParaphrasePort,
  scope: CreatorScope,
  client: PoolClient,
  expected?: readonly ShadowSample[],
): Promise<readonly ShadowSample[]> {
  const read = async () => {
    repository.assertHeldCreator(scope, client);
    const parsed = Batch.safeParse(
      await feed.verifiedParaphrases(scope, client),
    );
    invariant(
      parsed.success,
      "paraphrase_required",
      "Only a bounded batch of verified privacy-safe questions enters comparison.",
    );
    const samples = parsed.data;
    invariant(
      new Set(samples.map((s) => s.sampleId)).size === samples.length,
      "shadow_sample_limit",
      "Use one bounded comparison cohort with unique identifiers.",
    );
    invariant(
      samples.every(
        (s) =>
          Date.parse(s.occurredAt) >= Date.now() - 7 * 86400000 &&
          Date.parse(s.occurredAt) <= Date.now(),
      ),
      "comparison_changed",
      "Recent comparison questions changed or expired. Refresh them.",
    );
    return samples;
  };
  const samples = await read(),
    fingerprint = comparisonCohortHash(samples);
  invariant(
    expected === undefined || comparisonCohortHash(expected) === fingerprint,
    "comparison_changed",
    "Recent comparison questions changed or expired. Refresh them.",
  );
  repository.finalizeHeldCreatorBeforeCommit(scope, client, async () => {
    invariant(
      comparisonCohortHash(await read()) === fingerprint,
      "comparison_changed",
      "Recent comparison questions changed before completion. Refresh them.",
    );
  });
  return samples;
}
