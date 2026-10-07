import { createHash } from "node:crypto";
import pg, { type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "../trust/contracts.js";
import { ContentHeldClient } from "./held-client-cleanup.js";
import { contentPrivacyExportCustody } from "./privacy-export-custody.js";

export const CONTENT_PRIVACY_EXPORT_MIGRATION =
  "0198_w5_content_privacy_export";
export const CONTENT_PRIVACY_EXPORT_CHECKSUM =
  "faff9c4be7b6f27601032756a6be845d656969d81f15e89ad10611e639a83ff8";
type Job = Parameters<PrivacyHook["run"]>[0];
/** W8 supplies its restored, held-client task authority after owner options.
 * These IDs are not passed to the Content purpose as a permission. */
export type ContentPrivacyTaskAuthority = (
  client: PoolClient,
  job: Job,
) => Promise<readonly string[]>;
const purpose = "creator_w5_content_privacy_export";
const custody = structuredClone(contentPrivacyExportCustody);
const issued = new WeakSet<ContentPrivacyExport>();
const task = z.strictObject({
  jobId: z.uuid(),
  accountId: z.uuid(),
  kind: z.literal("export"),
  scope: z.enum(["account", "creator", "thread"]),
  creatorId: z.uuid().nullable(),
  threadId: z.uuid().nullable(),
  leaseToken: z.uuid(),
  idempotencyKey: z.string(),
});
const records = z.array(z.record(z.string(), z.unknown())).max(1000);
const projection = z.strictObject({
  replies: records,
  quotePermissions: records,
  reactions: records,
  thanks: records,
  revisions: records,
  indexes: records,
  publications: records,
  drafts: records,
  consents: records,
  preferences: records,
  replyReads: records,
  replyReviews: records,
  fanEffects: records,
  effects: records,
  tombstones: records,
});
function unavailable(cause?: unknown): DomainError {
  const failure = new DomainError(
    "content_privacy_purpose_unavailable",
    "Current Content export authority is unavailable.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
  return failure;
}
function equal(actual: unknown, expected: unknown) {
  if (contentHash(actual) !== contentHash(expected)) throw unavailable();
}
function unordered(rows: readonly unknown[]) {
  return rows.map((row) => contentHash(row)).sort();
}

/** Export-only, worker-only purpose. Preparation checks source custody; each
 * operation rechecks it on the actual task client before any body projection.
 * The SQL independently binds original job/lease/ownership and defers its last
 * wall-clock check to COMMIT. No empty default or caller-supplied owned IDs. */
export class ContentPrivacyExport {
  private constructor(private readonly pool: Pool) {}

  static async prepare(pool: Pool): Promise<ContentPrivacyExport> {
    if (
      !(pool instanceof pg.Pool) ||
      requestAuthority.getStore() ||
      !Number.isFinite(pool.options.connectionTimeoutMillis) ||
      (pool.options.connectionTimeoutMillis ?? 0) <= 0 ||
      (pool.options.connectionTimeoutMillis ?? 0) > 5000
    )
      throw unavailable();
    const owner = new ContentPrivacyExport(pool);
    const client = await pool.connect();
    const held = new ContentHeldClient(client, AbortSignal.timeout(6000), pool);
    let failure: unknown;
    try {
      await held.begin();
      await held.run(() => client.query("SET TRANSACTION READ ONLY"));
      await owner.assertCatalog(client);
      issued.add(owner);
      return owner;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await held.settle(failure);
    }
  }

  assertPool(pool: Pool): void {
    if (!issued.has(this) || this.pool !== pool) throw unavailable();
  }

  async export(
    input: Job,
    authority: ContentPrivacyTaskAuthority,
  ): ReturnType<PrivacyHook["run"]> {
    this.assertPool(this.pool);
    if (
      requestAuthority.getStore() ||
      !input.signal ||
      typeof authority !== "function"
    )
      throw unavailable();
    const parsed = task.safeParse({
      jobId: input.jobId,
      accountId: input.accountId,
      kind: input.kind,
      scope: input.scope,
      creatorId: input.creatorId,
      threadId: input.threadId,
      leaseToken: input.leaseToken,
      idempotencyKey: input.idempotencyKey,
    });
    if (
      !parsed.success ||
      input.idempotencyKey !== `${input.jobId}:content` ||
      (input.scope === "account" && (input.creatorId || input.threadId)) ||
      (input.scope === "creator" && (!input.creatorId || input.threadId)) ||
      (input.scope === "thread" && (!input.creatorId || !input.threadId))
    )
      throw unavailable();
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(45_000)]);
    signal.throwIfAborted();
    // The prepared pool has a bounded checkout. If cancellation arrives while
    // queued, acquire and close that late client before this operation settles.
    const client = await this.pool.connect();
    const held = new ContentHeldClient(client, signal, this.pool);
    let failure: unknown;
    try {
      await held.begin();
      await held.run(() =>
        client.query(
          "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
        ),
      );
      // Negative/restoration task authority precedes all domain body reads.
      await authority(client, input);
      signal.throwIfAborted();
      await this.assertCatalog(client);
      signal.throwIfAborted();
      const result = await held.run(() =>
        client.query<{ data: unknown }>(
          "SELECT creator.content_privacy_export($1,$2,$3,$4,$5,$6) AS data",
          [
            input.jobId,
            input.accountId,
            input.scope,
            input.creatorId,
            input.threadId,
            input.leaseToken,
          ],
        ),
      );
      const data = projection.parse(result.rows[0]?.data);
      const counts = Object.fromEntries(
        Object.entries(data).map(([name, values]) => [name, values.length]),
      );
      await authority(client, input);
      signal.throwIfAborted();
      // Both the genuine W8 task fence and Content's independently bound
      // lease trigger execute here. No SQL follows this separate COMMIT.
      await held.commit();
      signal.throwIfAborted();
      return {
        receipt: {
          domain: "content",
          jobId: input.jobId,
          scope: input.scope,
          complete: true,
          counts,
        },
        data,
      };
    } catch (error) {
      failure = error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["42501", "42883", "42P01", "55P03", "40001", "23514"].includes(
          String(error.code),
        )
      )
        throw unavailable(error);
      throw error;
    } finally {
      await held.settle(failure);
    }
  }

  private async assertCatalog(client: PoolClient): Promise<void> {
    try {
      const state = (
        await client.query<{ valid: boolean; ai: boolean }>(
          `SELECT current_user=session_user AND session_user='creator_runtime'
           AND EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
           AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
           AND nullif(current_setting('app.generation_scope_nonce',true),'') IS NULL
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND to_regrole($3) IS NOT NULL AS valid,
           EXISTS(SELECT FROM creator.schema_migration WHERE version='0186_w5_generation_content_origin' AND checksum='2f1c4b30133a0c8707b16b15c1e42a9daf539cb5edeeb48ad6a835352a4f444d') AS ai`,
          [
            CONTENT_PRIVACY_EXPORT_MIGRATION,
            CONTENT_PRIVACY_EXPORT_CHECKSUM,
            purpose,
          ],
        )
      ).rows[0];
      if (!state?.valid) throw unavailable();
      const boundaries = (
        await client.query<{ valid: boolean }>(
          `SELECT NOT EXISTS(SELECT FROM pg_auth_members WHERE member=$1::regrole OR roleid=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_default_acl WHERE defaclrole=$1::regrole OR EXISTS(SELECT FROM aclexplode(defaclacl) a WHERE a.grantee=$1::regrole))
           AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper f CROSS JOIN LATERAL aclexplode(f.fdwacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_foreign_server f CROSS JOIN LATERAL aclexplode(f.srvacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_largeobject_metadata l CROSS JOIN LATERAL aclexplode(l.lomacl) a WHERE a.grantee=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=$1::regrole)
           AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=$1::regrole AND oid<>to_regclass('creator.content_privacy_export_scope'))
           AND NOT EXISTS(SELECT FROM pg_type WHERE typowner=$1::regrole AND typrelid<>to_regclass('creator.content_privacy_export_scope') AND oid<>(SELECT typarray FROM pg_type WHERE typrelid=to_regclass('creator.content_privacy_export_scope')))
           AND NOT EXISTS(SELECT FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE r.relkind IN('r','p','v','m','S','f') AND n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND r.relowner<>$1::regrole AND (has_table_privilege($1,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR CASE WHEN r.relkind='S' THEN has_sequence_privilege($1,r.oid,'USAGE,SELECT,UPDATE') ELSE false END))
           AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.content_privacy_export_scope') AND relowner=$1::regrole AND relkind='r' AND relrowsecurity AND relforcerowsecurity)
           AND (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('creator.content_privacy_export_scope') AND NOT tgisinternal)=1
           AND EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('creator.content_privacy_export_scope') AND tgname='content_privacy_export_commit_current' AND tgfoid=to_regprocedure('creator.finish_content_privacy_export_scope()') AND tgdeferrable AND tginitdeferred AND tgenabled='O' AND tgtype=5)
           AND (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('creator.content_privacy_export_scope') AND contype<>'t')=1
           AND EXISTS(SELECT FROM pg_constraint WHERE conrelid=to_regclass('creator.content_privacy_export_scope') AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (pid, xid)') AS valid`,
          [purpose],
        )
      ).rows[0];
      if (!boundaries?.valid) throw unavailable();
      const functions = (
        await client.query(
          "SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,p.prosecdef,p.provolatile,p.proconfig,pg_get_userbyid(p.proowner) AS owner FROM pg_proc p WHERE p.proowner=$1::regrole ORDER BY 1",
          [purpose],
        )
      ).rows.map(({ definition, ...row }) => ({
        ...row,
        definitionSHA256: createHash("sha256").update(definition).digest("hex"),
      }));
      equal(unordered(functions), unordered(custody.functions));
      const catalogues = [
        [
          "columnCapabilities",
          "SELECT n.nspname AS schema,r.relname AS relation,a.attname AS column,acl.privilege_type AS privilege,acl.is_grantable,pg_get_userbyid(acl.grantor) AS grantor FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attnum>0 AND NOT a.attisdropped AND acl.grantee=$1::regrole",
        ],
        [
          "policies",
          "SELECT n.nspname AS schema,r.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_policy p JOIN pg_class r ON r.oid=p.polrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE $1::regrole=ANY(p.polroles)",
        ],
        [
          "roles",
          "SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolconfig FROM pg_roles WHERE rolname=$1",
        ],
        [
          "schemas",
          "SELECT n.nspname AS schema,acl.privilege_type AS privilege,acl.is_grantable,pg_get_userbyid(acl.grantor) AS grantor FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) acl WHERE acl.grantee=$1::regrole",
        ],
        [
          "functionACL",
          "SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(acl.grantee) AS grantee,acl.privilege_type AS privilege,acl.is_grantable,pg_get_userbyid(acl.grantor) AS grantor FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.proowner=$1::regrole OR acl.grantee=$1::regrole",
        ],
        [
          "tableACL",
          "SELECT n.nspname AS schema,r.relname AS relation,pg_get_userbyid(acl.grantee) AS grantee,acl.privilege_type AS privilege,acl.is_grantable,pg_get_userbyid(acl.grantor) AS grantor FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(r.relacl,acldefault(CASE WHEN r.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,r.relowner))) acl WHERE r.relkind IN('r','p','v','m','S','f') AND (r.relowner=$1::regrole OR acl.grantee=$1::regrole)",
        ],
      ] as const;
      for (const [name, sql] of catalogues) {
        const expected: unknown[] = [...custody[name]];
        if (name === "columnCapabilities" && state.ai)
          for (const column of [
            "ai_reuse_public_text",
            "ai_reuse_source_hash",
            "ai_reuse_command_hash",
          ])
            expected.push({
              schema: "creator",
              relation: "content_revision",
              column,
              privilege: "SELECT",
              is_grantable: false,
              grantor: "creator_owner",
            });
        equal(
          unordered((await client.query(sql, [purpose])).rows),
          unordered(expected),
        );
      }
      const relations = (
        await client.query<{ relation: string; columns: string[] }>(
          "SELECT r.relname AS relation,array_agg(a.attname::text ORDER BY a.attnum) AS columns FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace JOIN pg_attribute a ON a.attrelid=r.oid WHERE n.nspname='creator' AND r.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped GROUP BY r.relname",
          [custody.relationColumns.map((row) => row.relation)],
        )
      ).rows;
      const expectedColumns = custody.relationColumns.map((row) => ({
        relation: row.relation,
        columns: [
          ...row.columns,
          ...(state.ai && row.relation === "content_revision"
            ? [
                "ai_reuse_public_text",
                "ai_reuse_source_hash",
                "ai_reuse_command_hash",
              ]
            : []),
        ],
      }));
      equal(unordered(relations), unordered(expectedColumns));
      equal(
        (
          await client.query(
            "SELECT attname,format_type(atttypid,atttypmod) AS type,attnotnull FROM pg_attribute WHERE attrelid=to_regclass('creator.content_privacy_export_scope') AND attnum>0 AND NOT attisdropped ORDER BY attnum",
          )
        ).rows,
        [
          ["pid", "integer"],
          ["xid", "xid8"],
          ["caller", "name"],
          ["job_id", "uuid"],
          ["lease_token", "uuid"],
          ["binding", "jsonb"],
        ].map(([attname, type]) => ({ attname, type, attnotnull: true })),
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw unavailable(error);
    }
  }
}
