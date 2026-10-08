import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { AgentModel } from "../agent/model.js";
import { agentPreparationRead } from "../agent/preparation-read.js";
import {
  licensed,
  licenseRow,
  type AgentRepository,
  type CreatorScope,
} from "../agent/repository.js";
import {
  withProviderUsage,
  type HeldProviderUsageAdmission,
} from "../agent/provider-usage.js";
import { trustTransaction } from "../trust/transaction.js";
import {
  comparisonStorageSource,
  comparisonPrivacySource,
  comparisonWriterSource,
} from "./comparison-privacy.js";
import {
  comparisonArtifactSource,
  comparisonAttemptSource,
  comparisonArtifactPrivacySource,
} from "../trust/comparison-artifacts.js";
import {
  comparisonSanitizerReference,
  type ComparisonSanitizerOperation,
  type ComparisonSanitizerRequest,
} from "./comparison-sanitizer.js";

export interface PreparedComparisonOperation
  extends ComparisonSanitizerOperation {
  /** Original completed usage identities, never caller-provided receipts. */
  completedReference(sanitizer: string): string;
}

/** This owner adds no raw-message reader. Conversation supplies the current
 * source check on its genuine held fan transaction for each individual call.
 * The original usage journal records costs without artificial reply jobs or
 * fan allowance consumption. Source text/identifiers never enter its receipts. */
export class PreparedComparisonSanitizerProvider {
  readonly modelFingerprint: string;
  private constructor(
    private readonly db: Database,
    private readonly repository: AgentRepository,
    private readonly model: AgentModel,
    private readonly assertPrepared: (client: PoolClient) => Promise<void>,
  ) {
    this.modelFingerprint = model.fingerprint;
  }

  static async prepare(input: {
    db: Database;
    repository: AgentRepository;
    model: AgentModel;
    assertPrepared: (client: PoolClient) => Promise<void>;
    signal: AbortSignal;
  }) {
    invariant(
      input.repository.pool === input.db.pool &&
        input.repository.usageJournal &&
        input.model.pricingConfigured &&
        /^[a-f0-9]{64}$/u.test(input.model.fingerprint),
      "comparison_provider_unavailable",
      "The original journal, model pricing and source owner are required.",
    );
    input.repository.usageJournal.assertPool(input.db.pool);
    const prepared = new PreparedComparisonSanitizerProvider(
      input.db,
      input.repository,
      input.model,
      input.assertPrepared,
    );
    await agentPreparationRead(
      input.db.pool,
      async (client) => {
        await input.repository.assertRuntimeRoleInTransaction(client);
        await input.repository.usageJournal!.assertClient(client);
        await prepared.assertStorage(client, input.signal);
      },
      input.signal,
    );
    return prepared;
  }

  private async assertStorage(client: PoolClient, signal: AbortSignal) {
    for (const source of [
      comparisonStorageSource,
      comparisonPrivacySource,
      comparisonArtifactSource,
      comparisonAttemptSource,
      comparisonArtifactPrivacySource,
      comparisonWriterSource,
    ])
      await assertRegisteredMigration(client, source, signal);
    await this.assertPrepared(client);
    signal.throwIfAborted();
  }

  assertDatabase(db: Database) {
    invariant(
      db === this.db && db.pool === this.repository.pool,
      "comparison_provider_changed",
      "Use this provider's original conversation owner.",
    );
  }

  operation(input: {
    scope: ThreadScope;
    signal: AbortSignal;
    sourceHash: string;
    assertSource: (client: PoolClient) => Promise<void>;
  }): PreparedComparisonOperation {
    const { scope, signal } = input;
    const sourceHash = z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .parse(input.sourceHash);
    assertThreadScope(scope);
    invariant(
      scope.authority === "fan" && scope.actorAccountId === scope.fanAccountId,
      "comparison_fan_required",
      "Use the original fan's separately consented conversation.",
    );
    const checked = async (client: PoolClient) => {
      signal.throwIfAborted();
      invariant(
        this.model.fingerprint === this.modelFingerprint &&
          this.model.pricingConfigured,
        "comparison_provider_changed",
        "The original configured provider changed.",
      );
      this.db.assertHeldThread(scope, client);
      await this.assertStorage(client, signal);
      await input.assertSource(client);
      signal.throwIfAborted();
    };
    const assertCurrent = () =>
      this.db.withThread(
        scope,
        async (client) => {
          await checked(client);
          this.db.finalizeHeldThreadBeforeCommit(scope, client, () =>
            checked(client),
          );
        },
        "read",
        signal,
      );
    const stages = new Set<string>();
    const completedStages = new Set<string>();
    const receipts = new Map<string, string>();
    let active = false;
    return Object.freeze({
      signal,
      modelFingerprint: this.modelFingerprint,
      assertCurrent,
      completedReference: (sanitizer: string) => {
        signal.throwIfAborted();
        invariant(
          !active &&
            completedStages.size === 2 &&
            receipts.size === 2 &&
            sanitizer === comparisonSanitizerReference(this.modelFingerprint),
          "comparison_receipt_unavailable",
          "Both original comparison calls must complete before saving a question.",
        );
        return `${sanitizer}:${receipts.get("paraphrase")!}:${receipts.get("privacy_review")!}`;
      },
      call: async <T>(request: ComparisonSanitizerRequest<T>): Promise<T> => {
        invariant(
          ["paraphrase", "privacy_review"].includes(request.stage) &&
            !active &&
            !stages.has(request.stage) &&
            (request.stage === "paraphrase" ||
              completedStages.has("paraphrase")) &&
            request.route ===
              (request.stage === "paraphrase" ? "small" : "large"),
          "comparison_stage_changed",
          "Use each original comparison processing stage once and in order.",
        );
        invariant(
          Buffer.byteLength(request.instructions) <= 16000 &&
            Buffer.byteLength(request.data) <= 96000,
          "comparison_source_invalid",
          "Comparison processing exceeded its original input bound.",
        );
        active = true;
        stages.add(request.stage);
        const purpose =
          request.stage === "paraphrase"
            ? "comparison_paraphrase"
            : "comparison_privacy_review";
        const versionHash = contentHash({
          sanitizer: comparisonSanitizerReference(this.model.fingerprint),
          source: sourceHash,
          purpose,
        });
        const accounting: CreatorScope = {
          creatorId: scope.creatorId,
          accountId: scope.actorAccountId,
          development: false,
        };
        let committedHold: string | undefined;
        let committedUsage: string | undefined;
        let ceiling = 0;
        const admission: HeldProviderUsageAdmission = {
          purpose,
          admit: async <V>(
            journal: (client: PoolClient, creatorHoldId: string) => Promise<V>,
          ) => {
            const result = await this.db.withThread(
              scope,
              async (client) => {
                await checked(client);
                const budget = await this.budget(client, scope);
                const maximum = this.model.maximumRunCostMicros(
                  Buffer.byteLength(request.instructions) +
                    Buffer.byteLength(request.data),
                );
                invariant(
                  maximum !== null &&
                    Number.isSafeInteger(maximum) &&
                    maximum > 0,
                  "pricing_required",
                  "Verified provider ceilings are required for comparison processing.",
                );
                ceiling = maximum;
                const totals = (
                  await client.query<{
                    spent: string;
                    unknown: string;
                    reserved: string;
                  }>(
                    `SELECT coalesce(sum(cost_micros) FILTER(WHERE created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::text AS spent,
                 count(*) FILTER(WHERE cost_micros IS NULL)::text AS unknown,
                 (SELECT coalesce(sum(amount_micros),0)::text FROM creator.ai_cost_hold WHERE creator_id=$1 AND state='held') AS reserved
                 FROM creator.ai_usage WHERE creator_id=$1 AND category IN('reply','guardrail','memory','provider_unknown')`,
                    [scope.creatorId],
                  )
                ).rows[0]!;
                invariant(
                  Number(totals.unknown) === 0 &&
                    Number(totals.spent) + Number(totals.reserved) + maximum <=
                      budget.cap,
                  "creator_cost_cap",
                  "AI is paused at its daily cap or until uncertain provider costs are reconciled.",
                );
                const hold = randomUUID();
                await client.query(
                  "INSERT INTO creator.ai_cost_hold(id,creator_id,amount_micros,state,expires_at) VALUES($1,$2,$3,'held',clock_timestamp()+interval '5 minutes')",
                  [hold, scope.creatorId, maximum],
                );
                const value = await journal(client, hold);
                this.db.finalizeHeldThreadBeforeCommit(
                  scope,
                  client,
                  async () => {
                    await checked(client);
                    invariant(
                      contentHash(await this.budget(client, scope)) ===
                        contentHash(budget),
                      "comparison_budget_changed",
                      "The creator's current AI authorization changed before admission.",
                    );
                  },
                );
                return { value, hold };
              },
              "read",
              signal,
            );
            committedHold = result.hold;
            committedUsage = z.uuid().parse(result.value);
            return result.value;
          },
        };
        let value: T;
        try {
          const result = await withProviderUsage(
            this.repository,
            accounting,
            this.model,
            versionHash,
            "guardrail",
            signal,
            () =>
              this.model.structured(
                request.instructions,
                [request.data],
                request.schema,
                request.route,
                signal,
              ),
            undefined,
            admission,
          );
          invariant(
            result.usage.costMicros !== null,
            "comparison_cost_unknown",
            "This provider cost needs reconciliation before comparison processing can continue.",
          );
          value = result.value;
        } finally {
          try {
            // Completion custody survives account/consent revocation. Never
            // release a hold when usage or the completion response is uncertain.
            if (committedHold)
              await this.settleKnownHold(
                accounting,
                committedHold,
                versionHash,
                purpose,
                ceiling,
              );
          } finally {
            active = false;
          }
        }
        completedStages.add(request.stage);
        receipts.set(request.stage, committedUsage!);
        return value;
      },
    });
  }

  private async budget(client: PoolClient, scope: ThreadScope) {
    this.db.assertHeldThread(scope, client);
    const row = (
      await client.query<{
        live_version_id: string;
        configuration: { dailyCostCapMicros: number };
      }>(
        `SELECT w.live_version_id,v.configuration FROM creator.ai_workspace w
       JOIN creator.ai_version v ON v.id=w.live_version_id AND v.creator_id=w.creator_id AND v.state='live'
       WHERE w.creator_id=$1 AND NOT w.paused AND w.deleted_at IS NULL FOR UPDATE OF w NOWAIT`,
        [scope.creatorId],
      )
    ).rows[0];
    const license = await licenseRow(client, scope.creatorId);
    invariant(
      row && licensed(license),
      "comparison_creator_unavailable",
      "The creator's current AI authorization is required for comparisons.",
    );
    const cap = z
      .number()
      .int()
      .positive()
      .safe()
      .parse(row.configuration.dailyCostCapMicros);
    return { liveVersionId: row.live_version_id, cap, license };
  }

  private async settleKnownHold(
    scope: CreatorScope,
    hold: string,
    versionHash: string,
    purpose: string,
    ceiling: number,
  ) {
    await trustTransaction(this.repository.pool, async (client) => {
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [scope.creatorId, scope.accountId],
      );
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE NOWAIT",
        [scope.creatorId],
      );
      await this.repository.usageJournal!.assertClient(client);
      const receipt = (
        await client.query<{ known: boolean }>(
          `SELECT count(*)=1 AND bool_and(provider_state='completed' AND cost_micros IS NOT NULL AND cost_micros BETWEEN 0 AND $5
          AND version_hash=$3 AND purpose=$4 AND category='guardrail' AND generation_id IS NULL AND attempt_id IS NULL) AS known
         FROM creator.ai_usage WHERE creator_id=$1 AND creator_hold_id=$2`,
          [scope.creatorId, hold, versionHash, purpose, ceiling],
        )
      ).rows[0];
      if (receipt?.known === true)
        await client.query(
          "UPDATE creator.ai_cost_hold SET state='settled' WHERE id=$1 AND creator_id=$2 AND amount_micros=$3 AND state='held'",
          [hold, scope.creatorId, ceiling],
        );
    });
  }
}
