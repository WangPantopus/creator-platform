import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { trustTransaction } from "./transaction.js";

export class TrustStore {
  constructor(readonly pool: Pool) {}
  async assertRole(worker = false): Promise<void> {
    return trustTransaction(
      this.pool,
      async (client) => {
        const result = await client.query<{
          rolsuper: boolean;
          rolbypassrls: boolean;
          owns: boolean;
          unsafe: boolean;
          role: string;
        }>(
          `SELECT r.rolname AS role,r.rolsuper,r.rolbypassrls,
       EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('creator','creator_trust') AND c.relowner=r.oid) AS owns,
       EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator_trust' AND c.relkind='r' AND c.relname NOT IN ('crisis_counter','service_incident') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS unsafe
       FROM pg_roles r WHERE r.rolname=current_user`,
        );
        const role = result.rows[0];
        if (
          !role ||
          role.rolsuper ||
          role.rolbypassrls ||
          role.owns ||
          role.unsafe ||
          role.role !==
            (worker ? "creator_trust_worker" : "creator_trust_runtime")
        )
          throw new DomainError(
            "unsafe_database_role",
            "Trust needs its non-owner, row-scoped database role.",
            503,
          );
        const schema = await client.query(
          "SELECT to_regclass('creator_trust.tombstone') AS relation",
        );
        if (!schema.rows[0]?.relation)
          throw new DomainError(
            "database_not_migrated",
            "Trust migrations are required.",
            503,
          );
      },
      { readOnly: true },
    );
  }
  async actor<T>(
    actor: Actor,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!actor.adultEligible)
      throw new DomainError(
        "adult_eligibility_required",
        "This app is available to adults aged 18 and over.",
      );
    return trustTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT set_config('app.account_id',$1,true),set_config('lock_timeout','2000',true)",
        [actor.accountId],
      );
      const result = await work(client);
      return result;
    });
  }
}
export async function command<T>(
  client: PoolClient,
  actor: Actor,
  operation: string,
  key: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const hash = contentHash({ operation, input });
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `trust:${actor.accountId}:${operation}:${key}`,
  ]);
  const prior = await priorCommand<T>(client, actor, operation, key, input);
  if (prior !== undefined) return prior;
  const response = await run();
  await client.query(
    "INSERT INTO creator_trust.command(account_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
    [actor.accountId, operation, key, hash, JSON.stringify(response)],
  );
  return response;
}
/** Read-only replay lookup for a negative-authority action whose success can
 * make fresh evidence unavailable. Never use it to return private evidence. */
export async function priorCommand<T>(
  client: PoolClient,
  actor: Actor,
  operation: string,
  key: string,
  input: unknown,
): Promise<T | undefined> {
  const prior = await client.query<{ request_hash: string; response: T }>(
    "SELECT request_hash,response FROM creator_trust.command WHERE account_id=$1 AND operation=$2 AND key=$3",
    [actor.accountId, operation, key],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].request_hash !== contentHash({ operation, input }))
      throw new DomainError(
        "idempotency_conflict",
        "This retry key belongs to a different action.",
        409,
      );
    return prior.rows[0].response;
  }
  return undefined;
}
