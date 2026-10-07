import { copy } from "@qelvora/copy";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import { growthTransaction } from "./transaction.js";

export class GrowthDatabase {
  actorFence?: (
    client: PoolClient,
    accountId: string,
    creatorId: string | null,
  ) => Promise<void>;
  constructor(
    readonly runtime: Pool,
    readonly worker: Pool,
  ) {}
  async ready() {
    const roles = await Promise.all(
      [this.runtime, this.worker].map(
        async (pool) =>
          (await pool.query("SELECT current_user AS name")).rows[0]?.name,
      ),
    );
    if (roles[0] === roles[1])
      throw new DomainError(
        "separate_growth_roles_required",
        copy.growthErrorSeparateGrowthRolesRequired,
        503,
      );
    const runtimeAccess = (
      await this.runtime.query(
        "SELECT pg_has_role(current_user,'growth_runtime','MEMBER') AS runtime,pg_has_role(current_user,'growth_worker','MEMBER') AS worker",
      )
    ).rows[0];
    const workerAccess = (
      await this.worker.query(
        "SELECT pg_has_role(current_user,'growth_worker','MEMBER') AS worker",
      )
    ).rows[0];
    if (
      !runtimeAccess?.runtime ||
      runtimeAccess.worker ||
      !workerAccess?.worker
    )
      throw new DomainError(
        "unsafe_growth_membership",
        copy.growthErrorUnsafeGrowthMembership,
        503,
      );
    for (const pool of [this.runtime, this.worker]) {
      const result = await pool.query(`SELECT r.rolsuper,r.rolbypassrls,
        EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='growth' AND c.relowner=r.oid) AS owns
        FROM pg_roles r WHERE r.rolname=current_user`);
      const row = result.rows[0];
      if (!row || row.rolsuper || row.rolbypassrls || row.owns)
        throw new DomainError(
          "unsafe_growth_role",
          copy.growthErrorUnsafeGrowthRole,
          503,
        );
    }
    const schema = await this.worker.query(`SELECT
      to_regclass('growth.provider_receipt') IS NOT NULL AND
      to_regclass('growth.insight_window') IS NOT NULL AND
      EXISTS(SELECT FROM information_schema.columns WHERE table_schema='growth' AND table_name='insight_signal' AND column_name='version') AND
      EXISTS(SELECT FROM information_schema.columns WHERE table_schema='growth' AND table_name='activation_job' AND column_name='document') AND
      EXISTS(SELECT FROM information_schema.columns WHERE table_schema='growth' AND table_name='delivery' AND column_name='digest_id') AS current`);
    if (!schema.rows[0]?.current)
      throw new DomainError(
        "growth_migration_required",
        copy.growthErrorGrowthMigrationRequired,
        503,
      );
  }
  async actor<T>(
    actor: Actor,
    creatorId: string | null,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!actor.adultEligible)
      throw new DomainError(
        "adult_eligibility_required",
        copy.growthErrorAdultEligibilityRequired,
      );
    const perform = () =>
      this.transaction(this.runtime, async (client) => {
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          actor.accountId,
        ]);
        await assertCurrentSession(client, actor.accountId);
        await client.query(
          "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true)",
          [actor.accountId, creatorId ?? ""],
        );
        return work(client);
      });
    if (!this.actorFence) return perform();
    return this.transaction(this.worker, async (client) => {
      await this.actorFence!(client, actor.accountId, creatorId);
      return perform();
    });
  }
  async transaction<T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return growthTransaction(pool, work, signal);
  }
  /** Worker-only tables used by account controls still lock the canonical session and erasure scope. */
  async workerActor<T>(
    actor: Actor,
    creatorId: string,
    work: (client: PoolClient) => Promise<T>,
  ) {
    if (!actor.adultEligible || !this.actorFence)
      throw new DomainError(
        "growth_authority_required",
        copy.growthErrorGrowthAuthorityRequired,
        503,
      );
    return this.transaction(this.worker, async (worker) => {
      await this.actorFence!(worker, actor.accountId, creatorId);
      return this.transaction(this.runtime, async (runtime) => {
        await runtime.query("SELECT set_config('app.account_id',$1,true)", [
          actor.accountId,
        ]);
        await assertCurrentSession(runtime, actor.accountId);
        return work(worker);
      });
    });
  }
}
