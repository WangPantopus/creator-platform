import { z } from "zod";
import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import type { AccessService } from "../access/scope.js";
import {
  PreparedGenerationJournal,
  type JournalPrivacyJob,
} from "../agent/generation-journal.js";
import {
  generationAccountingLifecycle,
  type JournalPrivacyRetention,
} from "../agent/journal-privacy.js";
import { PreparedUsageRetention } from "../agent/usage-retention.js";
import { CommerceGenerationAllowance } from "../commerce/generation-allowance.js";
import type {
  GenerationPrivacyConfiguration,
  GenerationPrivacyJob,
} from "../commerce/generation-privacy.js";
import { accountingRetentionPolicy } from "./accounting-retention-policy.js";

function originalJob(job: JournalPrivacyJob): GenerationPrivacyJob {
  const leased = (value: JournalPrivacyJob): value is GenerationPrivacyJob =>
    typeof value.leaseToken === "string" &&
    z.uuid().safeParse(value.leaseToken).success;
  invariant(
    leased(job),
    "privacy_lease_required",
    "Accounting retention requires the original current leased deletion task.",
  );
  return job;
}

/** Concrete policy producer from the existing financial adapter and actual W8
 * registration/family authority. It neither registers hooks nor approves them.
 * Unknown costs remain in reconciliation; this is only the known-cost path. */
export async function prepareGenerationAccountingRetention(input: {
  pool: Pool;
  journal: PreparedGenerationJournal;
  usageRetention: PreparedUsageRetention;
  allowance: CommerceGenerationAllowance;
  access: AccessService;
  configuration: GenerationPrivacyConfiguration;
}) {
  invariant(
    input.journal instanceof PreparedGenerationJournal &&
      input.usageRetention instanceof PreparedUsageRetention &&
      input.allowance instanceof CommerceGenerationAllowance &&
      input.journal.retentionPolicyVersion ===
        accountingRetentionPolicy.version &&
      input.configuration.retentionPolicyVersion ===
        accountingRetentionPolicy.version,
    "accounting_retention_unconfigured",
    "Use the original prepared financial owner and the approved product retention policy.",
  );
  input.journal.assertPool(input.pool);
  input.usageRetention.assertJournal(input.journal);
  input.allowance.assertComposition(input.pool, input.access);
  input.allowance.assertJournal(input.journal);
  const financial = await input.allowance.privacyReconciliation(
    input.access,
    input.configuration,
  );
  const retention = Object.freeze<JournalPrivacyRetention>({
    version: accountingRetentionPolicy.version,
    async current(client, job, family) {
      return {
        ...(await financial.disposition(client, originalJob(job), family)),
        reason:
          "Known provider costs retain their original amounts and references for twelve UTC calendar months from original settlement.",
      };
    },
    knownRetention(client, job, family, generationIds) {
      return financial.knownRetention(
        client,
        originalJob(job),
        family,
        generationIds,
      );
    },
  });
  const accounting = generationAccountingLifecycle({
    journal: input.journal,
    usageRetention: input.usageRetention,
    authority: input.configuration.authority,
    retention,
  });
  return Object.freeze({ financial, retention, accounting });
}
