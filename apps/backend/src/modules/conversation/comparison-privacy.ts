import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryConfig, QueryResultRow } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { agentPrivacyTransaction } from "../agent/privacy-transaction.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "../trust/contracts.js";
import {
  fenceConversationPrivacyTask,
  type ConversationPrivacyAuthority,
  type ConversationPrivacyFamily,
} from "./privacy.js";
import { conversationPrivacyQueryTimeout } from "./privacy-cancellation.js";

// Source references are not installation approval. Both remain unregistered
// until the complete graph is independently reviewed and allocated by W8.
export const comparisonStorageSource = Object.freeze({
  owner: "W3",
  name: "w3_comparison_samples",
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_comparison_samples.sql",
  checksum: "49b4fbcf308833c2ff0ede97fad20926ea98eabe8a9d2a1abb279a55662c3a4d",
});
export const comparisonPrivacySource = Object.freeze({
  owner: "W3",
  name: "w3_comparison_privacy",
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_comparison_privacy.sql",
  checksum: "81d9ebedb8346808b32e560ffbd6246f89443423bc267d02f89f6e84465b5bc0",
});
const owner = "creator_comparison_lifecycle";
const signature =
  "creator.purge_conversation_comparisons(uuid,uuid,uuid,uuid,uuid)";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Page = z.strictObject({
  samples_deleted: z.int().min(0).max(500),
  consents_deleted: z.int().min(0).max(1),
});
type Job = Parameters<PrivacyHook["run"]>[0];
type Custody = Readonly<{
  definitionSha256: string;
  /** Complete isolated role, executable, trigger and storage custody, captured
   * independently on the closed graph. Not just effective table privileges. */
  catalogueChecksum: string;
}>;

async function query<Row extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  config: QueryConfig & { query_timeout: number },
) {
  return client.query<Row>(config);
}

/** Read-only operator review; no source, job, or comparison authority is issued. */
export async function comparisonPrivacyCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const metadata = async (text: string, values: unknown[]) => {
    signal?.throwIfAborted();
    const result = await query(client, {
      text,
      values,
      query_timeout: conversationPrivacyQueryTimeout(client, 5000),
    });
    signal?.throwIfAborted();
    return result.rows;
  };
  const visibility = await generationConsumerCatalogue(client, owner, {
    queryTimeout: conversationPrivacyQueryTimeout(client, 5000),
    ...(signal ? { signal } : {}),
  });
  const functions = await metadata(
    `SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,
      pg_get_userbyid(p.proowner) AS owner,
      ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
        ||':'||a.privilege_type||':'||a.is_grantable::text
       FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       ORDER BY 1) AS acl
     FROM pg_proc p WHERE p.proowner=to_regrole($1) ORDER BY p.oid::regprocedure::text COLLATE "C"`,
    [owner],
  );
  const tables = [
    "creator.conversation_comparison_consent",
    "creator.conversation_comparison_sample",
  ];
  const storage = await metadata(
    `SELECT c.oid::regclass::text AS relation,c.relkind,c.relispartition,c.relpersistence,
     (SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
      'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'dropped',a.attisdropped,
      'identity',a.attidentity,'generated',a.attgenerated,'local',a.attislocal,'inherited',a.attinhcount,
      'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=c.oid AND a.attnum>0) AS columns,
     (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
      'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
      FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
     (SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
      'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY pg_get_indexdef(i.indexrelid))
      FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
     FROM pg_class c WHERE c.oid=ANY(ARRAY(SELECT to_regclass(t) FROM unnest($1::text[]) t))
     ORDER BY c.oid::regclass::text COLLATE "C"`,
    [tables],
  );
  const triggers = await metadata(
    `SELECT t.tgrelid::regclass::text AS relation,t.tgname,t.tgenabled,
      pg_get_triggerdef(t.oid,false) AS definition
     FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgrelid=ANY(ARRAY(SELECT to_regclass(r) FROM unnest($1::text[]) r))
     ORDER BY t.tgrelid::regclass::text COLLATE "C",t.tgname COLLATE "C"`,
    [
      [
        ...tables,
        "creator.thread",
        "creator.message",
        "creator.processor_consent",
        "creator.memory_exclusion",
      ],
    ],
  );
  const dependencies = await metadata(
    `SELECT d.deptype,a.type,a.object_names,a.object_args FROM pg_shdepend d
     CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
     WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
      AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
     ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
    [owner],
  );
  return { visibility, functions, storage, triggers, dependencies };
}

export async function comparisonPrivacyInstalled(
  client: Pick<Pool, "query">,
): Promise<boolean> {
  const row = (
    await client.query<{ installed: boolean }>(
      `SELECT to_regclass('creator.conversation_comparison_consent') IS NOT NULL
       OR to_regclass('creator.conversation_comparison_sample') IS NOT NULL AS installed`,
    )
  ).rows[0];
  invariant(
    typeof row?.installed === "boolean",
    "comparison_privacy_unavailable",
    "The comparison storage inventory is unavailable.",
  );
  return row.installed;
}

/** Original W8 task custody remains mandatory. This owner only extends the
 * existing complete export and deletes ordinary comparison data; it issues no
 * interactive scope, comparison consent, provider admission or retention rule. */
export class PreparedComparisonPrivacy {
  private constructor(
    private readonly pool: Pool,
    private readonly authority: ConversationPrivacyAuthority,
    private readonly custody: Custody,
  ) {}

  static async prepare(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
    custody: Custody;
    signal: AbortSignal;
  }): Promise<PreparedComparisonPrivacy> {
    Hash.parse(input.custody.definitionSha256);
    Hash.parse(input.custody.catalogueChecksum);
    const prepared = new PreparedComparisonPrivacy(
      input.pool,
      input.authority,
      Object.freeze({ ...input.custody }),
    );
    await agentPrivacyTransaction(input.pool, input.signal, async (client) => {
      await prepared.assertClient(client, input.signal);
    });
    return prepared;
  }

  assertRuntime(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
  }): void {
    invariant(
      input.pool === this.pool && input.authority === this.authority,
      "comparison_privacy_composition_changed",
      "Use the original prepared comparison privacy pool and task authority.",
    );
  }

  async assertClient(client: PoolClient, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    invariant(
      !requestAuthority.getStore(),
      "comparison_privacy_worker_required",
      "Use the original background privacy task.",
    );
    await assertRegisteredMigration(client, comparisonStorageSource, signal);
    await assertRegisteredMigration(client, comparisonPrivacySource, signal);
    const row = (
      await query<{ ready: boolean; definition: string }>(client, {
        text: `SELECT session_user='creator_runtime' AND current_user=session_user
         AND current_setting('transaction_isolation')='read committed'
         AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
         AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND NOT r.rolcanlogin
          AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
          AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
          AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
          AND (SELECT count(*)=4 FROM pg_proc WHERE proowner=r.oid))
         AND (SELECT count(*)=2 FROM pg_class c WHERE c.oid=ANY(ARRAY[
          to_regclass('creator.conversation_comparison_consent'),to_regclass('creator.conversation_comparison_sample')])
          AND c.relkind='r' AND NOT c.relispartition AND c.relrowsecurity AND c.relforcerowsecurity
          AND pg_get_userbyid(c.relowner)='creator_owner')
         AND p.prosecdef AND p.prokind='f' AND p.provolatile='v'
         AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$1
         AND has_function_privilege('creator_runtime',p.oid,'EXECUTE')
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee<>p.proowner AND (a.grantee=0 OR pg_get_userbyid(a.grantee)<>'creator_runtime'
           OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) AS ready,
         pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p WHERE p.oid=to_regprocedure($2)`,
        values: [owner, signature],
        query_timeout: conversationPrivacyQueryTimeout(client, 5000),
      })
    ).rows[0];
    invariant(
      row?.ready &&
        createHash("sha256").update(row.definition).digest("hex") ===
          this.custody.definitionSha256,
      "comparison_privacy_custody_changed",
      "The original reviewed comparison deletion function is required.",
    );
    const catalogue = await comparisonPrivacyCatalogue(client, signal);
    invariant(
      contentHash(catalogue) === this.custody.catalogueChecksum,
      "comparison_privacy_custody_changed",
      "Current comparison lifecycle visibility must match independent review.",
    );
    signal?.throwIfAborted();
  }

  async purgeFamily(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
  ): Promise<{ samples: number; consents: number }> {
    invariant(
      job.kind === "delete" &&
        job.signal &&
        z.uuid().safeParse(job.leaseToken).success,
      "comparison_privacy_task_required",
      "Use the original leased conversation deletion task.",
    );
    const signal = job.signal;
    await fenceConversationPrivacyTask(this.authority, client, job);
    await this.assertClient(client, signal);
    const removed = { samples: 0, consents: 0 };
    // A full page is never EOF. Refuse overly large family work atomically;
    // the coordinator can split it without retaining a partial success.
    for (let page = 0; page < 21; page++) {
      signal.throwIfAborted();
      await this.authority.assertFamily(client, job, family);
      const rows = await query(client, {
        text: `SELECT * FROM creator.purge_conversation_comparisons($1,$2,$3,$4,$5)`,
        values: [
          job.jobId,
          job.leaseToken,
          family.threadId,
          family.creatorId,
          family.fanId,
        ],
        query_timeout: conversationPrivacyQueryTimeout(client, 5000),
      });
      invariant(
        rows.rowCount === 1,
        "comparison_privacy_source_incomplete",
        "The original comparison purge page is unavailable.",
      );
      const result = Page.parse(rows.rows[0]);
      removed.samples += result.samples_deleted;
      removed.consents += result.consents_deleted;
      if (result.samples_deleted === 0 && result.consents_deleted === 0) {
        await this.assertClient(client, signal);
        await this.authority.assertFamily(client, job, family);
        await fenceConversationPrivacyTask(this.authority, client, job);
        return removed;
      }
    }
    throw new Error(
      "This comparison deletion requires a bounded family subjob.",
    );
  }
}
