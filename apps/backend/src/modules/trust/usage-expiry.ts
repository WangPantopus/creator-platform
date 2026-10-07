import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DomainError, invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { AgentRepository, CreatorScope } from "../agent/repository.js";
import { agentPreparationRead } from "../agent/preparation-read.js";
import {
  PreparedUsageRetention,
  type UsageExpiryAuthority,
} from "../agent/usage-retention.js";
import { assertAccountingRetentionIntegrity } from "../agent/retention-integrity.js";
import { accountingRetentionPolicy } from "./accounting-retention-policy.js";
import { assertUsageExpiryCatalogue } from "./usage-expiry-catalogue.js";
import { TrustStore } from "./store.js";
import { trustTransaction } from "./transaction.js";

const Claimed = z.strictObject({
  job_id: z.uuid(),
  creator_id: z.uuid(),
  account_id: z.uuid(),
  policy_version: z.literal(accountingRetentionPolicy.version),
  lease_token: z.uuid(),
});
type Claim = Readonly<z.infer<typeof Claimed> & { signal: AbortSignal }>;
export type UsageExpiryPass = Readonly<{
  claimed: number;
  completed: number;
  expiredRecords: number;
}>;

/** The actual W8 producer owns discovery and claim. The public authority port
 * has no caller-selected lease or dates and refuses outside its original run.
 * SQL records real deleted IDs and finalizes the lease at the owner's COMMIT.
 */
export class PreparedUsageExpiryOwner {
  private readonly current = new AsyncLocalStorage<Claim>();
  private readonly state = { busy: false, lifetime: false };
  readonly authority: UsageExpiryAuthority;

  private constructor(
    private readonly runtimePool: Pool,
    private readonly workerPool: Pool,
    private readonly database: string,
    private readonly assertRestoredInTransaction: (
      client: PoolClient,
    ) => Promise<void>,
  ) {
    this.authority = Object.freeze({
      assertExpiry: (client: PoolClient, scope: CreatorScope, policy: string) =>
        this.assertExpiry(client, scope, policy),
    });
  }

  static async prepare(input: {
    runtimePool: Pool;
    workerPool: Pool;
    assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
    signal?: AbortSignal;
  }): Promise<PreparedUsageExpiryOwner> {
    invariant(
      input.runtimePool !== input.workerPool &&
        !requestAuthority.getStore() &&
        typeof input.assertRestoredInTransaction === "function",
      "usage_expiry_unconfigured",
      "Use the original separate runtime/Trust worker pools and held restoration authority.",
    );
    const database = await agentPreparationRead(
      input.runtimePool,
      async (client) => {
        await input.assertRestoredInTransaction(client);
        await assertAccountingRetentionIntegrity(client, input.signal);
        await assertUsageExpiryCatalogue(client, input.signal);
        const database = (
          await client.query<{ name: string }>(
            "SELECT current_database() AS name",
          )
        ).rows[0]!.name;
        await input.assertRestoredInTransaction(client);
        return database;
      },
      input.signal,
    );
    await new TrustStore(input.workerPool).assertRole(true);
    await trustTransaction(
      input.workerPool,
      async (client) => {
        await input.assertRestoredInTransaction(client);
        await assertUsageExpiryCatalogue(client, input.signal);
        const current = (
          await client.query<{ name: string }>(
            "SELECT current_database() AS name",
          )
        ).rows[0]!.name;
        invariant(
          current === database,
          "usage_expiry_database_mismatch",
          "Expiry pools must retain the same original database.",
        );
        await input.assertRestoredInTransaction(client);
      },
      { readOnly: true, signal: input.signal },
    );
    const owner = new PreparedUsageExpiryOwner(
      input.runtimePool,
      input.workerPool,
      database,
      input.assertRestoredInTransaction,
    );
    Object.freeze(owner);
    return owner;
  }

  private async assertDatabase(client: PoolClient) {
    const { rows } = await client.query<{ same: boolean }>(
      "SELECT current_database()=$1 AS same",
      [this.database],
    );
    invariant(
      rows[0]?.same === true,
      "usage_expiry_database_mismatch",
      "Retain the original expiry database.",
    );
  }

  private async assertExpiry(
    client: PoolClient,
    scope: CreatorScope,
    policy: string,
  ) {
    const claim = this.current.getStore();
    invariant(
      claim &&
        !requestAuthority.getStore() &&
        !scope.development &&
        scope.creatorId === claim.creator_id &&
        scope.accountId === claim.account_id &&
        policy === claim.policy_version,
      "usage_expiry_lease_required",
      "Only the original claimed expiry operation may bind its held client.",
    );
    claim.signal.throwIfAborted();
    await this.assertDatabase(client);
    await this.assertRestoredInTransaction(client);
    await assertUsageExpiryCatalogue(client, claim.signal);
    await client.query(
      "SELECT creator_trust.fence_usage_expiry($1,$2,$3,$4,$5)",
      [
        claim.job_id,
        claim.lease_token,
        scope.creatorId,
        scope.accountId,
        policy,
      ],
    );
    await this.assertRestoredInTransaction(client);
    claim.signal.throwIfAborted();
  }

  assertComposition(
    repository: AgentRepository,
    retention: PreparedUsageRetention,
  ) {
    invariant(
      retention instanceof PreparedUsageRetention &&
        repository.pool === this.runtimePool &&
        retention.policyVersion === accountingRetentionPolicy.version,
      "accounting_expiry_composition_mismatch",
      "Use the original Agent repository and current approved retention producer.",
    );
    retention.assertExpiryOwner(this.runtimePool, this.authority);
  }

  /** Claim immediately before one bounded expiry. A serial worker never ages
   * a batch of unused leases while it waits for the first source to finish. */
  async runPass(
    repository: AgentRepository,
    retention: PreparedUsageRetention,
    signal: AbortSignal,
  ): Promise<UsageExpiryPass> {
    invariant(
      !this.state.lifetime,
      "usage_expiry_running",
      "This expiry owner already has a running lifetime.",
    );
    return this.pass(repository, retention, signal);
  }

  private async pass(
    repository: AgentRepository,
    retention: PreparedUsageRetention,
    signal: AbortSignal,
  ): Promise<UsageExpiryPass> {
    invariant(
      !this.state.busy,
      "usage_expiry_busy",
      "Await the original expiry pass before claiming again.",
    );
    this.state.busy = true;
    try {
      return Object.freeze(await this.execute(repository, retention, signal));
    } finally {
      this.state.busy = false;
    }
  }

  /** The host owns both pools and must await this lifetime before closing
   * either one. Cancellation drains the original callback and COMMIT. */
  async run(
    repository: AgentRepository,
    retention: PreparedUsageRetention,
    signal: AbortSignal,
    onPass?: (result: UsageExpiryPass) => void,
  ): Promise<void> {
    this.assertComposition(repository, retention);
    invariant(
      !this.state.lifetime && !this.state.busy && !requestAuthority.getStore(),
      "usage_expiry_running",
      "Run the original expiry owner once outside request authority.",
    );
    this.state.lifetime = true;
    try {
      while (!signal.aborted) {
        const result = await this.pass(repository, retention, signal);
        onPass?.(result);
        try {
          await delay(result.claimed ? 1000 : 60_000, undefined, { signal });
        } catch (cause) {
          if (!signal.aborted) throw cause;
        }
      }
    } catch (cause) {
      // A cleanup/source failure after cancellation still rejects done/close.
      if (!signal.aborted || cause !== signal.reason) throw cause;
    } finally {
      this.state.lifetime = false;
    }
  }

  private async execute(
    repository: AgentRepository,
    retention: PreparedUsageRetention,
    signal: AbortSignal,
  ) {
    this.assertComposition(repository, retention);
    invariant(
      !requestAuthority.getStore(),
      "usage_expiry_lease_required",
      "Expiry runs outside request authority.",
    );
    signal.throwIfAborted();
    const claims = await trustTransaction(
      this.workerPool,
      async (client) => {
        await this.assertDatabase(client);
        await this.assertRestoredInTransaction(client);
        await assertUsageExpiryCatalogue(client, signal);
        const { rows } = await client.query(
          "SELECT * FROM creator_trust.claim_usage_expiry_tasks(1)",
        );
        const claims = z.array(Claimed).max(1).parse(rows);
        await this.assertRestoredInTransaction(client);
        signal.throwIfAborted();
        return claims;
      },
      { signal },
    );
    const claimed = claims[0];
    if (!claimed) return { claimed: 0, completed: 0, expiredRecords: 0 };
    const claim = Object.freeze({ ...claimed, signal });
    try {
      const result = await this.current.run(claim, () =>
        retention.expire(
          repository,
          {
            creatorId: claim.creator_id,
            accountId: claim.account_id,
            development: false,
          },
          200,
          signal,
        ),
      );
      // The actual deferred SQL fence committed the batch and its real IDs.
      // No later worker ACK or caller-supplied receipt can invent completion.
      return {
        claimed: 1,
        completed: 1,
        expiredRecords: result.expiredIds.length,
      };
    } catch (error) {
      // An uncertain COMMIT may already have completed the original job.
      // This fixed retry only affects the same still-running empty receipt;
      // it cannot erase an actual completion or reuse a replaced lease.
      if (!signal.aborted) {
        try {
          await trustTransaction(
            this.workerPool,
            async (client) => {
              await this.assertDatabase(client);
              await this.assertRestoredInTransaction(client);
              await assertUsageExpiryCatalogue(client, signal);
              const code =
                error instanceof DomainError &&
                /^[a-z0-9_]{1,80}$/.test(error.code)
                  ? error.code
                  : "usage_expiry_failed";
              await client.query(
                "SELECT creator_trust.retry_usage_expiry_task($1,$2,$3)",
                [claim.job_id, claim.lease_token, code],
              );
              await this.assertRestoredInTransaction(client);
            },
            { signal },
          );
        } catch (retryError) {
          throw new AggregateError(
            [error, retryError],
            "Original usage expiry and retry failed.",
          );
        }
      }
      throw error;
    }
  }
}
