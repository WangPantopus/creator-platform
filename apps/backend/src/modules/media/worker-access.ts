import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";

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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('media.creator_id',$1,true),set_config('media.owner_account_id',$2,true),set_config('media.fan_id',$3,true),set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
        [
          family.creatorId,
          family.ownerAccountId,
          family.kind === "thread" ? family.fanId : "",
        ],
      );
      const table =
        family.kind === "thread" ? "media_asset" : "creator_media_asset";
      // Missing denial authority cannot permit ingestion. Fully revoked rows
      // need no positive participant authority to erase their retained bytes.
      const live = await client.query(
        `SELECT 1 FROM creator.${table} WHERE creator_id=$1 AND owner_account_id=$2 AND state NOT IN('revoked','deleted') LIMIT 1`,
        [family.creatorId, family.ownerAccountId],
      );
      if (live.rowCount) {
        const denied = await this.denied(family, client);
        if (denied !== false && denied !== true)
          throw new DomainError(
            "media_worker_denial_unavailable",
            "Current media ingestion denial authority is unavailable.",
            503,
          );
        if (denied)
          await client.query(
            `UPDATE creator.${table} SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND owner_account_id=$2 AND state NOT IN('revoked','deleted')`,
            [family.creatorId, family.ownerAccountId],
          );
      }
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
