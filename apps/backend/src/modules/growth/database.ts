import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";

export class GrowthDatabase {
  constructor(
    readonly runtime: Pool,
    readonly worker: Pool,
  ) {}
  async ready() {
    for (const pool of [this.runtime, this.worker]) {
      const result = await pool.query(`SELECT r.rolsuper,r.rolbypassrls,
        EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='growth' AND c.relowner=r.oid) AS owns
        FROM pg_roles r WHERE r.rolname=current_user`);
      const row = result.rows[0];
      if (!row || row.rolsuper || row.rolbypassrls || row.owns)
        throw new DomainError(
          "unsafe_growth_role",
          "Growth requires a non-owner database role.",
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
        "Growth's registered migrations must be applied before startup.",
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
        "Adult eligibility is required.",
      );
    return this.transaction(this.runtime, async (client) => {
      await client.query(
        "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true)",
        [actor.accountId, creatorId ?? ""],
      );
      return work(client);
    });
  }
  async transaction<T>(
    pool: Pool,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
