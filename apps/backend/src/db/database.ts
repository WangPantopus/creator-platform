import type { Pool, PoolClient } from "pg";
import {
  assertThreadScope,
  type ThreadScope,
} from "../modules/access/scope.js";
import { DomainError } from "../core/errors.js";
import { assertCurrentSession } from "../modules/identity/request-authority.js";
import type { ScopeRestriction } from "../modules/access/scope.js";

export type ThreadLockMode = "read" | "write";

export class Database {
  constructor(
    readonly pool: Pool,
    private readonly observeQuery?: (query: {
      scope: ThreadScope;
      sql: string;
      parameters: readonly unknown[];
    }) => void,
    private readonly assertAllowed?: ScopeRestriction,
  ) {}
  async assertRuntimeRole(): Promise<void> {
    const result = await this.pool.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      owns: boolean;
      unsafe_tables: boolean;
    }>(`SELECT r.rolsuper, r.rolbypassrls,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relowner=r.oid) AS owns,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relkind='r' AND c.relname IN ('thread','message','memory','generation','thread_audit','event') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS unsafe_tables
      FROM pg_roles r WHERE r.rolname=current_user`);
    const role = result.rows[0];
    if (
      !role ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.owns ||
      role.unsafe_tables
    )
      throw new DomainError(
        "unsafe_database_role",
        "The runtime database role must be a non-owner with enforced row security.",
        503,
      );
    const schema = await this.pool.query(
      "SELECT to_regclass('creator.thread') AS relation",
    );
    if (!schema.rows[0]?.relation)
      throw new DomainError(
        "database_not_migrated",
        "Creator database migrations are required.",
        503,
      );
  }
  async withThread<T>(
    scope: ThreadScope,
    work: (client: PoolClient) => Promise<T>,
    lockMode: ThreadLockMode = "write",
  ): Promise<T> {
    assertThreadScope(scope);
    if (lockMode !== "read" && lockMode !== "write")
      throw new DomainError(
        "thread_lock_invalid",
        "The conversation operation is unavailable.",
        400,
      );
    // Reviewed reads opt into SHARE. Unannotated producer operations take
    // UPDATE during authorization, before domain/idempotency/allowance locks.
    // Concurrent writers must not both take
    // SHARE and deadlock when they subsequently upgrade to UPDATE.
    const threadLock = lockMode === "write" ? "UPDATE" : "SHARE";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true), set_config('app.fan_id',$2,true), set_config('app.account_id',$3,true)",
        [scope.creatorId, scope.fanId, scope.actorAccountId],
      );
      await assertCurrentSession(client, scope.actorAccountId);
      // Issued scopes are not durable authority. Recheck role/verification before
      // any scoped read or mutation, including a queued request using an old scope.
      const authority = await client.query<{ fan_account_id: string }>(
        `SELECT f.account_id AS fan_account_id FROM creator.thread t JOIN creator.creator_profile c ON c.id=t.creator_id JOIN creator.fan_profile f ON f.id=t.fan_id
         WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 AND c.account_id=$6 AND t.deleted_at IS NULL AND (
         ($5='fan' AND f.account_id=$4) OR ($5='creator' AND c.account_id=$4 AND c.verification='verified') OR
         ($5='triage' AND c.verification='verified' AND EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=c.id AND tm.account_id=$4 AND tm.revoked_at IS NULL AND 'triage'=ANY(tm.roles))))
         FOR ${threadLock} OF t`,
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
          scope.authority,
          scope.creatorAccountId,
        ],
      );
      if (!authority.rowCount)
        throw new DomainError(
          "thread_unavailable",
          "This conversation is unavailable.",
          404,
        );
      // FOR SHARE also applies a table's UPDATE RLS policy. The fan may lock
      // their own profile, but cannot lock the creator's profile under fan RLS.
      // Scope the single, read-only creator lock to its already verified owner,
      // then restore the request account before any restriction or domain work.
      // No UPDATE privilege or policy is widened, and errors roll back the GUC.
      if (scope.authority === "fan") {
        const fan = await client.query(
          "SELECT 1 FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
          [scope.fanId, scope.actorAccountId],
        );
        if (!fan.rowCount)
          throw new DomainError(
            "thread_unavailable",
            "This conversation is unavailable.",
            404,
          );
      } else {
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          scope.creatorAccountId,
        ]);
        const creator = await client.query(
          "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' FOR SHARE",
          [scope.creatorId, scope.creatorAccountId],
        );
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          scope.actorAccountId,
        ]);
        if (!creator.rowCount)
          throw new DomainError(
            "thread_unavailable",
            "This conversation is unavailable.",
            404,
          );
      }
      if (scope.authority === "triage") {
        const membership = await client.query(
          "SELECT 1 FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL AND 'triage'=ANY(roles) FOR SHARE",
          [scope.creatorId, scope.actorAccountId],
        );
        if (!membership.rowCount)
          throw new DomainError(
            "thread_unavailable",
            "This conversation is unavailable.",
            404,
          );
      }
      await this.assertAllowed?.(
        { accountId: scope.actorAccountId, adultEligible: true },
        scope.creatorId,
        scope.threadId,
        {
          fanAccountId: authority.rows[0]!.fan_account_id,
          creatorAccountId: scope.creatorAccountId,
        },
      );
      // Instrument the actual SQL method, so a future assembler query cannot omit its family predicate silently.
      const scopedClient = this.observeQuery
        ? new Proxy(client, {
            get: (target, property) => {
              if (property !== "query") return Reflect.get(target, property);
              return (sql: string, parameters: unknown[] = []) => {
                this.observeQuery?.({ scope, sql, parameters });
                return target.query(sql, parameters);
              };
            },
          })
        : client;
      const value = await work(scopedClient);
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
