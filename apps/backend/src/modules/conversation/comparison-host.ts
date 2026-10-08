import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { registeredComparisonProfile } from "../../db/comparison-profile.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import type { AgentModel } from "../agent/model.js";
import type { AgentRepository } from "../agent/repository.js";
import { createDevelopmentComparisonAuthority } from "../trust/development-comparison.js";
import { PreparedComparisonArtifacts } from "../trust/comparison-artifacts.js";
import type { ProviderPolicy } from "../../../../../packages/api/src/conversation/contracts.js";
import { DevelopmentConversationPolicy } from "./development-policy.js";
import { comparisonPrivacyCatalogue } from "./comparison-privacy.js";
import { PreparedComparisonFeed } from "./comparison-feed.js";
import { PreparedComparisonSanitizerProvider } from "./comparison-provider.js";
import { ConversationComparisonConsent } from "./comparison-consent.js";
import { ConversationComparisonSamples } from "./comparison-samples.js";

/** Original host composition only. The feed can be prepared before Agent is
 * constructed; the sanitizer then binds that exact Agent repository/journal.
 * Neither stage creates consent, a provider receipt or an export task. */
export async function prepareDevelopmentComparisonHost(input: {
  runtime: BackendRuntime;
  policy: ProviderPolicy;
  developmentPolicy: DevelopmentConversationPolicy;
  model: AgentModel;
}) {
  const { runtime } = input;
  const review = await registeredComparisonProfile();
  invariant(
    review &&
      runtime.comparisonArtifacts instanceof PreparedComparisonArtifacts,
    "comparison_unconfigured",
    "Comparisons require their complete original privacy and artifact owners.",
  );
  const artifacts = runtime.comparisonArtifacts;
  let closed = false;
  const assertPrepared = async (client: PoolClient) => {
    invariant(
      !closed &&
        isConfiguredBackendRuntime(runtime) &&
        runtime.comparisonArtifacts === artifacts &&
        runtime.assertRestoredInTransaction,
      "comparison_host_changed",
      "The original comparison host is unavailable.",
    );
    await runtime.assertRestoredInTransaction(client);
    for (const source of review.sources)
      await assertRegisteredMigration(client, source);
    await artifacts.assertClient(
      client,
      "creator_runtime",
      AbortSignal.timeout(5000),
    );
    invariant(
      contentHash(await comparisonPrivacyCatalogue(client)) ===
        review.comparison.privacy.catalogueChecksum,
      "comparison_privacy_custody_changed",
      "The original comparison privacy owner changed.",
    );
  };
  const authority = await createDevelopmentComparisonAuthority({
    ...input,
    assertPrepared,
  });
  invariant(
    authority,
    "comparison_policy_unavailable",
    "The explicit development comparison policy is unavailable.",
  );
  try {
    const feed = await PreparedComparisonFeed.prepare({
      runtime,
      authority: authority.creatorRead,
      catalogueChecksum: review.comparison.readerCatalogueChecksum,
      assertPrepared,
      signal: AbortSignal.timeout(10_000),
    });
    let repository: AgentRepository | undefined;
    return {
      feed,
      async bind(original: AgentRepository) {
        invariant(
          !repository && !closed && original.pool === runtime.pool,
          "comparison_host_changed",
          "Bind the original Agent repository once.",
        );
        const provider = await PreparedComparisonSanitizerProvider.prepare({
          db: runtime.database,
          repository: original,
          model: input.model,
          assertPrepared,
          signal: AbortSignal.timeout(10_000),
        });
        repository = original;
        return Object.freeze({
          consent: new ConversationComparisonConsent(
            runtime.database,
            authority.consent,
            assertPrepared,
          ),
          samples: new ConversationComparisonSamples(
            runtime.database,
            authority.use,
            assertPrepared,
            provider,
          ),
        });
      },
      close() {
        closed = true;
        authority.close();
      },
    };
  } catch (cause) {
    closed = true;
    authority.close();
    throw cause;
  }
}
