import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { ContentHeldClient } from "../content/held-client-cleanup.js";

const FamilySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("thread"),
    creatorId: z.uuid(),
    fanId: z.uuid(),
    ownerAccountId: z.uuid(),
  }),
  z.strictObject({
    kind: z.literal("creator"),
    creatorId: z.uuid(),
    ownerAccountId: z.uuid(),
  }),
]);
export type MediaWorkerFamily = z.infer<typeof FamilySchema>;
export type MediaWorkerDenial = (
  family: MediaWorkerFamily,
  client: PoolClient,
) => Promise<boolean>;

/** Purpose-scoped binary ingestion, including cleanup after deletion/revocation.
 * No Actor, identity session, request authority or ThreadScope is manufactured. */
export class MediaWorkerDatabase {
  constructor(
    readonly pool: Pool,
    private readonly denied: MediaWorkerDenial,
  ) {}

  async ready() {
    const result = await this.pool
      .query(`SELECT r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolcanlogin,
      pg_has_role(current_user,'creator_runtime','MEMBER') AS runtime,
      pg_has_role(current_user,'creator_owner','MEMBER') AS owner,
      pg_has_role(current_user,'creator_media_discovery','MEMBER') AS discovery_member,
      EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('creator','creator_trust') AND c.relowner=r.oid) AS owns,
      EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relname IN('media_asset','creator_media_asset') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)) AS unsafe,
      to_regprocedure('creator.discover_media_jobs(text,integer)') IS NOT NULL AS discovery
      FROM pg_roles r WHERE r.rolname=current_user`);
    const role = result.rows[0];
    if (
      !role ||
      role.rolname !== "creator_media_worker" ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolinherit ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolreplication ||
      !role.rolcanlogin ||
      role.runtime ||
      role.owner ||
      role.discovery_member ||
      role.owns ||
      role.unsafe ||
      !role.discovery
    )
      throw new DomainError(
        "unsafe_media_worker_role",
        "Media ingestion requires its dedicated scoped worker role and migration.",
        503,
      );
  }

  async discover(after: string, limit = 128) {
    const result = await this.pool.query<{
      cursor_key: string;
      kind: "creator" | "thread";
      creator_id: string;
      fan_id: string | null;
      owner_account_id: string;
    }>("SELECT * FROM creator.discover_media_jobs($1,$2)", [after, limit]);
    return result.rows.map((row) => ({
      cursor: row.cursor_key,
      family: FamilySchema.parse({
        kind: row.kind,
        creatorId: row.creator_id,
        ownerAccountId: row.owner_account_id,
        ...(row.kind === "thread" ? { fanId: row.fan_id } : {}),
      }),
    }));
  }

  async transaction<T>(
    input: MediaWorkerFamily,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const family = FamilySchema.parse(input);
    const connectionBudget = this.pool.options.connectionTimeoutMillis;
    if (
      typeof connectionBudget !== "number" ||
      !Number.isFinite(connectionBudget) ||
      connectionBudget <= 0 ||
      connectionBudget > 5000 ||
      this.pool.options.pipeline === true
    )
      throw new DomainError(
        "media_worker_transaction_unavailable",
        "The current ingestion connection is unavailable. Try again.",
        503,
      );
    // Transport/settlement only. The original ingestion role, discovered family
    // and Trust denial remain the authority; this does not issue a task lease.
    const signal = AbortSignal.timeout(45_000);
    const client = await this.pool.connect();
    const held = new ContentHeldClient(client, signal);
    let failed = false;
    let failure: unknown;
    let result!: T;
    try {
      await held.begin();
      await held.run(() =>
        client.query(
          `SELECT set_config(name,least(nullif(setting::integer,0),
            CASE name WHEN 'statement_timeout' THEN 5000
                      WHEN 'lock_timeout' THEN 2000 ELSE 5000 END)::text,true)
           FROM pg_settings WHERE name IN('statement_timeout','lock_timeout','idle_in_transaction_session_timeout')`,
        ),
      );
      await held.run(() =>
        client.query(
          "SELECT set_config('media.creator_id',$1,true),set_config('media.owner_account_id',$2,true),set_config('media.fan_id',$3,true)",
          [
            family.creatorId,
            family.ownerAccountId,
            family.kind === "thread" ? family.fanId : "",
          ],
        ),
      );
      const table =
        family.kind === "thread" ? "media_asset" : "creator_media_asset";
      // Missing denial authority cannot permit ingestion. Fully revoked rows
      // need no positive participant authority to erase their retained bytes.
      const live = await held.run(() =>
        client.query(
          `SELECT 1 FROM creator.${table} WHERE creator_id=$1 AND owner_account_id=$2 AND state NOT IN('revoked','deleted') LIMIT 1`,
          [family.creatorId, family.ownerAccountId],
        ),
      );
      if (live.rowCount) {
        const denied = await this.denied(family, client);
        signal.throwIfAborted();
        if (denied !== false && denied !== true)
          throw new DomainError(
            "media_worker_denial_unavailable",
            "Current media ingestion denial authority is unavailable.",
            503,
          );
        if (denied)
          await held.run(() =>
            client.query(
              `UPDATE creator.${table} SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND owner_account_id=$2 AND state NOT IN('revoked','deleted')`,
              [family.creatorId, family.ownerAccountId],
            ),
          );
      }
      // Await original work through settlement; socket expiry must not abandon
      // an external file operation and release its client underneath cleanup.
      const value = await work(client);
      signal.throwIfAborted();
      await held.commit();
      signal.throwIfAborted();
      result = value;
    } catch (error) {
      failed = true;
      failure = error;
      if (
        signal.aborted ||
        querySettlementUncertain(error) ||
        (error instanceof DomainError &&
          [
            "content_privacy_begin_unavailable",
            "content_privacy_commit_unavailable",
          ].includes(error.code))
      ) {
        failure = new DomainError(
          "media_worker_transaction_unavailable",
          "The ingestion transaction could not be confirmed. Try again.",
          503,
        );
        Object.defineProperty(failure, "cause", { value: error });
      }
    } finally {
      try {
        await held.settle(failure);
      } catch (cause) {
        failed = true;
        failure = new DomainError(
          "media_worker_settlement_unavailable",
          "The ingestion transaction could not be confirmed. Try again.",
          503,
        );
        Object.defineProperty(failure, "cause", { value: cause });
      }
    }
    if (failed) throw failure;
    return result;
  }
}
