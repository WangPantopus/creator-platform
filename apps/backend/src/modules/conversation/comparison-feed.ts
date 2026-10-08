import type { PoolClient, QueryConfig } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import { agentPreparationRead } from "../agent/preparation-read.js";
import { agentPrivacyQueryTimeout } from "../agent/privacy-transaction.js";
import type { CreatorScope } from "../agent/repository.js";
import type { PrivacyParaphrasePort } from "../agent/comparison-feed.js";
import type { ShadowSample } from "../agent/shadow-samples.js";
import {
  requestAuthority,
  assertCurrentSession,
} from "../identity/request-authority.js";
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
  ComparisonPolicySchema,
  type ComparisonPolicy,
} from "./comparison-consent.js";

export const comparisonReaderSource = Object.freeze({
  owner: "W3",
  name: "w3_comparison_reader",
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_comparison_reader.sql",
  checksum: "f0a7ec9e16838c7b838dc0befa6097484c8683dfc67ea7b940fad00a3c7facba",
});
const ReaderOwner = "creator_comparison_reader";
const sources = [
  comparisonStorageSource,
  comparisonPrivacySource,
  comparisonArtifactSource,
  comparisonAttemptSource,
  comparisonArtifactPrivacySource,
  comparisonWriterSource,
  comparisonReaderSource,
];
export interface ComparisonCreatorReadAuthority {
  current(scope: CreatorScope, client: PoolClient): Promise<ComparisonPolicy>;
}

async function query(
  client: PoolClient,
  text: string,
  values: unknown[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const config: QueryConfig & { query_timeout: number } = {
    text,
    values,
    query_timeout: agentPrivacyQueryTimeout(client, 5000),
  };
  const result = await client.query(config);
  signal?.throwIfAborted();
  return result;
}

/** Operator metadata only. This is not registry approval, fan consent or source
 * authority. Review the complete graph, including the original writer and privacy owners,
 * before allocating this still-pending migration. */
export async function comparisonReaderCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  // PostgreSQL's displayed type/function names depend on search_path. Keep the
  // review stable without changing the original source transaction's settings.
  // A failed query is left to that original owner's uncertain-query cleanup.
  await query(client, "SAVEPOINT comparison_reader_catalogue", [], signal);
  await query(client, "SET LOCAL search_path=pg_catalog", [], signal);
  const catalogue = await readComparisonReaderCatalogue(client, signal);
  await query(
    client,
    "ROLLBACK TO SAVEPOINT comparison_reader_catalogue",
    [],
    signal,
  );
  await query(
    client,
    "RELEASE SAVEPOINT comparison_reader_catalogue",
    [],
    signal,
  );
  return catalogue;
}

async function readComparisonReaderCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const visibility = await generationConsumerCatalogue(client, ReaderOwner, {
    queryTimeout: agentPrivacyQueryTimeout(client, 5000),
    ...(signal ? { signal } : {}),
  });
  const functions = (
    await query(
      client,
      `SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,
       pg_get_userbyid(p.proowner) AS owner,
       ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
        ||':'||a.privilege_type||':'||a.is_grantable::text
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ORDER BY 1) AS acl
       FROM pg_proc p WHERE p.proowner=to_regrole($1) ORDER BY p.oid::regprocedure::text COLLATE "C"`,
      [ReaderOwner],
      signal,
    )
  ).rows;
  const storage = (
    await query(
      client,
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
       FROM pg_class c WHERE c.oid=to_regclass('creator.comparison_read_scope')`,
      [],
      signal,
    )
  ).rows;
  const triggers = (
    await query(
      client,
      `SELECT t.tgrelid::regclass::text AS relation,t.tgname,t.tgenabled,
       pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE NOT t.tgisinternal AND n.nspname='creator' AND c.relname='comparison_read_scope'
       ORDER BY t.tgrelid::regclass::text COLLATE "C",t.tgname COLLATE "C"`,
      [],
      signal,
    )
  ).rows;
  const dependencies = (
    await query(
      client,
      `SELECT d.deptype,a.type,a.object_names,a.object_args FROM pg_shdepend d
       CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
       WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
        AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
       ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
      [ReaderOwner],
      signal,
    )
  ).rows;
  return { visibility, functions, storage, triggers, dependencies };
}

/** The configured host's original reader. Only sanitized rows cross to Agent;
 * SQL retains all participant checks and its private finite COMMIT scope. */
export class PreparedComparisonFeed implements PrivacyParaphrasePort {
  private constructor(
    private readonly runtime: BackendRuntime,
    private readonly authority: ComparisonCreatorReadAuthority,
    private readonly catalogueChecksum: string,
    private readonly assertPrepared: (client: PoolClient) => Promise<void>,
    private readonly database: string,
  ) {}
  static async prepare(input: {
    runtime: BackendRuntime;
    authority: ComparisonCreatorReadAuthority;
    catalogueChecksum: string;
    assertPrepared: (client: PoolClient) => Promise<void>;
    signal: AbortSignal;
  }) {
    z.string()
      .regex(/^[a-f0-9]{64}$/u)
      .parse(input.catalogueChecksum);
    invariant(
      isConfiguredBackendRuntime(input.runtime) &&
        input.runtime.pool === input.runtime.database.pool &&
        typeof input.runtime.assertRestoredInTransaction === "function" &&
        typeof input.runtime.assertCreatorAllowedInTransaction === "function",
      "comparison_reader_unavailable",
      "The original configured comparison host is required.",
    );
    return agentPreparationRead(
      input.runtime.pool,
      async (client) => {
        const database = (
          await query(
            client,
            "SELECT current_database() AS name",
            [],
            input.signal,
          )
        ).rows[0]!.name as string;
        const prepared = new PreparedComparisonFeed(
          input.runtime,
          input.authority,
          input.catalogueChecksum,
          input.assertPrepared,
          database,
        );
        await prepared.assertClient(client, input.signal);
        return prepared;
      },
      input.signal,
    );
  }
  private async assertClient(client: PoolClient, signal?: AbortSignal) {
    invariant(
      isConfiguredBackendRuntime(this.runtime) &&
        this.runtime.pool === this.runtime.database.pool,
      "comparison_reader_changed",
      "Use the original configured comparison host.",
    );
    for (const source of sources)
      await assertRegisteredMigration(client, source, signal);
    await this.assertPrepared(client);
    const ready = (
      await query(
        client,
        `SELECT current_database()=$2 AND session_user='creator_runtime'
   AND current_user=session_user AND current_setting('transaction_isolation')='read committed'
   AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls
    AND NOT rolinherit AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
   AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND NOT r.rolcanlogin AND NOT r.rolinherit
    AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND r.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
    AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
    AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
    AND (SELECT count(*)=3 FROM pg_proc WHERE proowner=r.oid)
    AND (SELECT count(*)=1 FROM pg_class WHERE relowner=r.oid AND relkind='r')
    AND NOT has_column_privilege(r.oid,'creator.message','text','SELECT')
    AND NOT has_table_privilege('creator_runtime','creator.comparison_read_scope','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege('creator_runtime','creator.comparison_read_scope','SELECT,INSERT,UPDATE,REFERENCES')) AS ready`,
        [ReaderOwner, this.database],
        signal,
      )
    ).rows[0];
    invariant(
      ready?.ready === true &&
        contentHash(await comparisonReaderCatalogue(client, signal)) ===
          this.catalogueChecksum,
      "comparison_reader_changed",
      "The original reviewed comparison reader changed.",
    );
  }
  async verifiedParaphrases(
    scope: CreatorScope,
    client: PoolClient,
  ): Promise<readonly ShadowSample[]> {
    const request = requestAuthority.getStore();
    invariant(
      request?.actor?.adultEligible === true &&
        request.actor.accountId === scope.accountId &&
        request.accountId === scope.accountId,
      "comparison_creator_required",
      "Use the current creator account for AI comparisons.",
    );
    await assertCurrentSession(client, scope.accountId);
    await this.runtime.assertRestoredInTransaction!(client);
    await this.runtime.assertCreatorAllowedInTransaction!(
      request.actor,
      scope.creatorId,
      client,
    );
    await this.assertClient(client);
    const policy = ComparisonPolicySchema.parse(
      await this.authority.current(scope, client),
    );
    const row = (
      await query(
        client,
        "SELECT creator.read_comparison_cohort($1,$2,$3) AS cohort",
        [scope.creatorId, policy.version, policy.processorPolicyVersion],
      )
    ).rows[0];
    // Repeat policy/restoration after the original complete SQL result. Agent's
    // finalizer repeats this entire read and SQL rechecks it at actual COMMIT.
    const after = ComparisonPolicySchema.parse(
      await this.authority.current(scope, client),
    );
    await this.runtime.assertRestoredInTransaction!(client);
    invariant(
      contentHash(policy) === contentHash(after),
      "comparison_policy_changed",
      "The comparison policy changed. Refresh the comparison.",
    );
    return z
      .array(
        z.strictObject({
          sampleId: z.uuid(),
          occurredAt: z.iso.datetime(),
          paraphrasedPrompt: z.string().min(5).max(1000),
          sanitizerReference: z.string().min(1).max(512),
        }),
      )
      .max(200)
      .parse(row?.cohort);
  }
}
