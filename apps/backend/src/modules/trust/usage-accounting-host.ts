import type { Pool, PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { PreparedGenerationJournal } from "../agent/generation-journal.js";
import { PreparedUsageRetention } from "../agent/usage-retention.js";
import type { AgentRepository } from "../agent/repository.js";
import { startUsageExpiryWorker } from "../../workers/usage-expiry.js";
import { accountingRetentionPolicy } from "./accounting-retention-policy.js";
import {
  assertPrivacyConsumersRegistered,
  installPrivacyConsumers,
} from "./privacy-consumers.js";
import { PreparedUsageExpiryOwner } from "./usage-expiry.js";
import type { TrustWorker } from "./worker.js";

export type HostUsageAccounting = Readonly<{
  journal: PreparedGenerationJournal;
  retention: PreparedUsageRetention;
  assertPrivacyRegistered: () => Promise<void>;
  bindRepository: (repository: AgentRepository) => void;
}>;

/** One lifetime owned by the original Trust runtime. Preparation registers no
 * tasks and creates no accounting records. SQL remains the expiry authority. */
export function createUsageAccountingHost(
  worker: TrustWorker,
  assertRestoredInTransaction: (client: PoolClient) => Promise<void>,
) {
  installPrivacyConsumers(worker);
  const hooks = worker.privacyHooks;
  const coordinator = worker.pool;
  let pool: Pool | undefined;
  let preparation: Promise<HostUsageAccounting | undefined> | undefined;
  let owner: PreparedUsageExpiryOwner | undefined;
  let accounting: HostUsageAccounting | undefined;
  let repository: AgentRepository | undefined;
  let lifetime: ReturnType<typeof startUsageExpiryWorker> | undefined;
  let stopping = false;
  let invalidated = false;
  let failed = false;
  let passed = false;
  let started = false;
  const assertRegistered = async () => {
    invariant(
      !invalidated &&
        !failed &&
        pool &&
        worker.pool === coordinator &&
        worker.privacyHooks === hooks,
      "privacy_consumers_unregistered",
      "Accounting requires this host's current original privacy registration.",
    );
    assertPrivacyConsumersRegistered(
      worker,
      pool,
      repository && accounting
        ? { repository, retention: accounting.retention }
        : undefined,
    );
  };
  const prepare = async (): Promise<HostUsageAccounting | undefined> => {
    const journalMigration = await registeredMigration({
      name: "w2_usage_lineage",
      owner: "W2",
      path: "apps/backend/src/modules/agent/migrations/0048_w2_usage_lineage.sql",
      checksum:
        "16dddc80bebe32979f822104d8f411e0f545b4e212da6dc147c72f959e660f17",
    });
    const retentionMigration = await registeredMigration({
      name: "w2_usage_retention_expiry",
      owner: "W2",
      path: "apps/backend/src/modules/agent/migrations/0067_w2_usage_retention_expiry.sql",
      checksum:
        "1c118f5ec90a5a3f3578e056af14d5e56b1379464977c4a79bd6c2b62be7f17e",
    });
    if (!journalMigration && !retentionMigration) return undefined;
    invariant(
      journalMigration && retentionMigration,
      "usage_accounting_unconfigured",
      "Both original accounting sources must be registered.",
    );
    await assertRegistered();
    owner = await PreparedUsageExpiryOwner.prepare({
      runtimePool: pool!,
      workerPool: coordinator,
      assertRestoredInTransaction: async (client) => {
        await assertRegistered();
        await assertRestoredInTransaction(client);
        await assertRegistered();
      },
    });
    const journal = await PreparedGenerationJournal.prepare(pool!, {
      migration: journalMigration,
      retentionPolicyVersion: accountingRetentionPolicy.version,
      assertPrivacyRegistered: assertRegistered,
    });
    const retention = await PreparedUsageRetention.prepare(pool!, {
      migration: retentionMigration,
      policyVersion: accountingRetentionPolicy.version,
      authority: owner.authority,
      assertPrivacyRegistered: assertRegistered,
    });
    retention.assertJournal(journal);
    await assertRegistered();
    accounting = Object.freeze({
      journal,
      retention,
      assertPrivacyRegistered: assertRegistered,
      bindRepository(candidate: AgentRepository) {
        invariant(
          !stopping &&
            !started &&
            (!repository || repository === candidate) &&
            candidate.usageJournal === journal,
          "usage_accounting_composition_mismatch",
          "Bind the original Agent repository once before starting this host.",
        );
        owner!.assertComposition(candidate, retention);
        assertPrivacyConsumersRegistered(worker, pool!, {
          repository: candidate,
          retention,
        });
        repository = candidate;
      },
    });
    return accounting;
  };
  return {
    prepare(runtimePool: Pool) {
      invariant(
        !stopping && !started && (!pool || pool === runtimePool),
        "usage_accounting_composition_mismatch",
        "Prepare accounting once on this host's original pool.",
      );
      pool = runtimePool;
      return (preparation ??= prepare());
    },
    async start() {
      invariant(
        !stopping && !started,
        "usage_expiry_running",
        "Start the original accounting lifetime once.",
      );
      started = true;
      await preparation;
      if (!accounting) return;
      await assertRegistered();
      invariant(
        !stopping && !invalidated && owner && repository,
        "usage_accounting_composition_mismatch",
        "Bind the actual privacy repository before starting accounting expiry on a live host.",
      );
      lifetime = startUsageExpiryWorker(
        { owner, repository, retention: accounting.retention },
        () => {
          passed = true;
        },
      );
      void lifetime.done.catch(() => {
        failed = true;
      });
    },
    async stop() {
      stopping = true;
      // A failed preparation still settles before the runtime releases pools.
      await preparation;
      await lifetime?.close();
    },
    invalidate() {
      invalidated = true;
    },
    async readiness() {
      await assertRegistered();
      return {
        state:
          lifetime && passed && !stopping
            ? ("available" as const)
            : ("unavailable" as const),
        code:
          lifetime && passed && !stopping
            ? "original_usage_expiry_running"
            : "usage_expiry_not_running",
      };
    },
  };
}
