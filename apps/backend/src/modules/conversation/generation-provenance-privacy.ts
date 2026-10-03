import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryConfig, QueryResultRow } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "../trust/contracts.js";
import { assertOriginalPrivacyFamilyCatalog } from "../trust/privacy-family-catalog.js";
import {
  assertConversationPrivacyPool,
  conversationPrivacyCause,
  conversationPrivacyReadUncertain,
} from "./privacy-cancellation.js";
import { GENERATION_OUTPUT_SOURCE_SHA256 } from "./generation-output.js";
import {
  fenceConversationPrivacyTask,
  type ConversationPrivacyAuthority,
  type ConversationPrivacyFamily,
} from "./privacy.js";

type Job = Parameters<PrivacyHook["run"]>[0];
const purpose = "creator_w3_generation_privacy";
export const generationProvenancePurgeSource = Object.freeze({
  name: "w3_generation_provenance_purge",
  owner: "W3",
  path: "apps/backend/migrations/0217_w3_generation_provenance_purge.sql",
  checksum: "f2318d7a49151544796e105fe62990dc43af6fe67e49fae253b7578a0c01684e",
});
export const generationProvenancePurgeSignature =
  "creator.purge_generation_sentence_provenance(uuid,uuid,uuid,uuid,uuid)";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
type Custody = Readonly<{
  definitionSha256: string;
  catalogueChecksum: string;
}>;

function unavailable(cause?: unknown): never {
  const failure = new DomainError(
    "conversation_provenance_purge_unavailable",
    "Reviewed original conversation provenance deletion is unavailable.",
    503,
  );
  if (cause !== undefined) conversationPrivacyCause(failure, cause);
  throw failure;
}

/** Real metadata reads have a finite driver budget. A failure escapes directly
 * to the original connection custodian; no helper savepoint SQL follows it. */
function metadataBudget(client: PoolClient) {
  const original = (
    client as PoolClient & {
      connectionParameters?: { query_timeout?: unknown };
    }
  ).connectionParameters?.query_timeout;
  if (
    typeof original !== "number" ||
    !Number.isSafeInteger(original) ||
    original < 1
  )
    unavailable();
  return Math.min(original, 5000);
}

async function metadata<Row extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const query: QueryConfig & { query_timeout: number } = {
    text,
    values,
    query_timeout: metadataBudget(client),
  };
  const result = await client.query<Row>(query);
  signal?.throwIfAborted();
  return result;
}

/** W3's exact purger metadata only. W8 owns its separate combined214/217
 * checker/caller catalogue; this function neither replaces nor approves it. */
export async function generationProvenancePurgeCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const permissions = await generationConsumerCatalogue(client, purpose, {
    queryTimeout: metadataBudget(client),
    signal,
  });
  const roles = (
    await metadata(
      client,
      `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
    rolreplication,rolbypassrls,rolconfig,
    EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS memberships,
    EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
    FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
      [[purpose, "creator_runtime"]],
      signal,
    )
  ).rows;
  const dependencies = (
    await metadata(
      client,
      `SELECT d.deptype,a.type,a.object_names,a.object_args
    FROM pg_shdepend d CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
    WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1)
     AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
    ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
      [purpose],
      signal,
    )
  ).rows;
  const executables = (
    await metadata(
      client,
      `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,pg_get_functiondef(p.oid) AS definition,
    ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a ORDER BY a::text COLLATE "C") AS grants
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
     AND (p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1) OR has_function_privilege($1,p.oid,'EXECUTE'))
    ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
      [purpose],
      signal,
    )
  ).rows;
  const relation = (
    await metadata(
      client,
      `SELECT c.relkind,c.relispartition,c.relrowsecurity,c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) AS owner,
    ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,acldefault('r',c.relowner))) a ORDER BY a::text COLLATE "C") AS grants,
    ARRAY(SELECT i.inhparent::regclass::text FROM pg_inherits i WHERE i.inhrelid=c.oid ORDER BY i.inhseqno) AS parents,
    ARRAY(SELECT i.inhrelid::regclass::text FROM pg_inherits i WHERE i.inhparent=c.oid ORDER BY i.inhrelid::regclass::text) AS children,
    (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'required',a.attnotnull,'dimensions',a.attndims,'identity',a.attidentity,'generated',a.attgenerated,'inherited',a.attinhcount,
      'collation',a.attcollation::regcollation::text,'default',pg_get_expr(d.adbin,d.adrelid),
      'grants',ARRAY(SELECT acl::text FROM unnest(a.attacl) acl ORDER BY acl::text COLLATE "C")) ORDER BY a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
      'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
     FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
    (SELECT jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(i.oid),
      'valid',x.indisvalid,'ready',x.indisready,'live',x.indislive) ORDER BY i.relname)
     FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid) AS indexes,
    (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r ORDER BY r),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
     FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
    (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid),
      'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname)
     FROM pg_trigger t WHERE t.tgrelid=c.oid) AS triggers
    FROM pg_class c WHERE c.oid=to_regclass('creator.generation_sentence_provenance')`,
      [],
      signal,
    )
  ).rows;
  return { permissions, roles, dependencies, executables, relation };
}

/** Prepared only from independently reviewed source/definition/effective
 * custody. It owns no transaction, task, retention decision or acknowledgement. */
export class PreparedGenerationProvenancePurge {
  private constructor(
    private readonly pool: Pool,
    private readonly authority: ConversationPrivacyAuthority,
    private readonly custody: Custody,
  ) {}

  assertRuntime(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
  }) {
    invariant(
      input.pool === this.pool && input.authority === this.authority,
      "conversation_provenance_purge_owner_changed",
      "Use the actual prepared pool and original conversation task authority.",
    );
  }

  static async prepare(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
    /** Never populated from startup database readback or a matching ledger. */
    custody?: Custody;
  }): Promise<PreparedGenerationProvenancePurge> {
    if (requestAuthority.getStore()) unavailable();
    try {
      if (!(await registeredMigration(generationProvenancePurgeSource)))
        unavailable();
    } catch (cause) {
      unavailable(cause);
    }
    if (
      !input.custody ||
      !hash.safeParse(input.custody.definitionSha256).success ||
      !hash.safeParse(input.custody.catalogueChecksum).success ||
      typeof input.authority.fenceTaskInTransaction !== "function" ||
      typeof input.authority.assertFamily !== "function"
    )
      unavailable();
    assertConversationPrivacyPool(input.pool);
    invariant(
      Number.isSafeInteger(input.pool.options.connectionTimeoutMillis) &&
        input.pool.options.connectionTimeoutMillis! > 0 &&
        input.pool.options.connectionTimeoutMillis! <= 5000,
      "conversation_provenance_purge_pool_unconfigured",
      "Use the bounded original conversation pool.",
    );
    // W8's genuine family guard retains the same client and its own metadata
    // queries. Its reads must inherit an actual finite driver deadline too.
    invariant(
      Number.isSafeInteger(input.pool.options.query_timeout) &&
        input.pool.options.query_timeout! > 0 &&
        input.pool.options.query_timeout! <= 5000,
      "conversation_provenance_purge_pool_unconfigured",
      "Bound reads on the actual original conversation client.",
    );
    const prepared = new PreparedGenerationProvenancePurge(
      input.pool,
      input.authority,
      Object.freeze({ ...input.custody }),
    );
    const client = await input.pool.connect();
    let discard = true;
    let cleanupFailed = false;
    const failures: unknown[] = [];
    const transport = (cause: Error) => {
      failures.push(cause);
      discard = true;
    };
    client.on("error", transport);
    try {
      await metadata(client, "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
      await metadata(
        client,
        "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
      );
      await prepared.assertCatalogue(client);
      const rollback = await metadata(client, "ROLLBACK");
      invariant(
        rollback.command === "ROLLBACK",
        "conversation_provenance_purge_rollback_unavailable",
        "The original qualification must return its actual rollback receipt.",
      );
      discard = failures.length > 0;
    } catch (cause) {
      failures.push(cause);
      // An uncertain metadata response must not receive later cleanup SQL.
      discard = true;
    } finally {
      if (discard)
        await client.end().catch((cause: unknown) => {
          failures.push(cause);
          cleanupFailed = true;
        });
      try {
        client.release(discard);
      } catch (cause) {
        failures.push(cause);
        cleanupFailed = true;
      }
      client.removeListener("error", transport);
    }
    if (failures.length) {
      const cause = new AggregateError(
        [...new Set(failures)],
        "Original provenance qualification/cleanup failed.",
      );
      if (cleanupFailed || conversationPrivacyReadUncertain(cause)) {
        const failure = new DomainError(
          "conversation_provenance_purge_cleanup_unavailable",
          "The original provenance qualification connection could not settle safely.",
          503,
        );
        conversationPrivacyCause(failure, cause);
        throw failure;
      }
      unavailable(cause);
    }
    return prepared;
  }

  private async assertCatalogue(client: PoolClient, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (requestAuthority.getStore()) unavailable();
    await assertRegisteredMigration(
      client,
      generationProvenancePurgeSource,
      signal,
    );
    signal?.throwIfAborted();
    await assertRegisteredMigration(
      client,
      {
        name: "w3_generation_worker_output",
        owner: "W3",
        path: "apps/backend/src/modules/conversation/migrations/pending_w3_worker_output.sql",
        checksum: GENERATION_OUTPUT_SOURCE_SHA256,
      },
      signal,
    );
    signal?.throwIfAborted();
    // Actual W8 must approve its additive isolated DELETE-checker caller.
    // The original214-only catalogue cannot be substituted after217 grants.
    await assertOriginalPrivacyFamilyCatalog(client, signal);
    signal?.throwIfAborted();
    const ready = (
      await metadata<{ ready: boolean; definition: string }>(
        client,
        `SELECT
      current_user=session_user AND session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
      AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$1 AND NOT r.rolcanlogin AND NOT r.rolinherit
       AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
       AND r.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
       AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
       AND (SELECT count(*) FROM pg_proc WHERE proowner=r.oid)=1)
      AND NOT has_table_privilege($1,'creator.generation_sentence_provenance','SELECT')
      AND p.prosecdef AND p.provolatile='v' AND p.prokind='f' AND pg_get_userbyid(p.proowner)=$1
      AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND has_function_privilege('creator_runtime',p.oid,'EXECUTE')
      AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       WHERE a.privilege_type<>'EXECUTE' OR a.is_grantable OR a.grantor<>p.proowner
        OR (a.grantee<>p.proowner AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='creator_runtime')))
      AND EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND datconnlimit<>0
       AND shobj_description(oid,'pg_database') IS DISTINCT FROM 'creator-platform:restored-traffic-closed') AS ready,
      pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($2)`,
        [purpose, generationProvenancePurgeSignature],
        signal,
      )
    ).rows[0];
    if (
      !ready?.ready ||
      createHash("sha256").update(ready.definition, "utf8").digest("hex") !==
        this.custody.definitionSha256 ||
      contentHash(await generationProvenancePurgeCatalogue(client, signal)) !==
        this.custody.catalogueChecksum
    )
      unavailable();
  }

  async purgeFamily(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
  ) {
    invariant(
      job.kind === "delete" &&
        job.signal &&
        z.uuid().safeParse(job.leaseToken).success &&
        job.idempotencyKey === `${job.jobId}:conversation`,
      "conversation_provenance_delete_required",
      "Use the actual original leased Conversation DELETE task.",
    );
    const signal = job.signal;
    let removed = 0;
    for (;;) {
      signal.throwIfAborted();
      await fenceConversationPrivacyTask(this.authority, client, job);
      signal.throwIfAborted();
      await this.authority.assertFamily(client, job, family);
      signal.throwIfAborted();
      await this.assertCatalogue(client, signal);
      signal.throwIfAborted();
      const result = await metadata<{ removed: unknown }>(
        client,
        "SELECT creator.purge_generation_sentence_provenance($1,$2,$3,$4,$5) AS removed",
        [
          job.jobId,
          job.leaseToken,
          family.threadId,
          family.creatorId,
          family.fanId,
        ],
        signal,
      );
      invariant(
        result.rowCount === 1 && result.rows.length === 1,
        "conversation_provenance_purge_receipt_unavailable",
        "Use the original fixed page's actual receipt.",
      );
      const page = z.int().min(0).max(500).parse(result.rows[0]?.removed);
      signal.throwIfAborted();
      await this.authority.assertFamily(client, job, family);
      signal.throwIfAborted();
      invariant(
        Number.isSafeInteger(removed + page),
        "bounded_subjob_required",
        "Split this original deletion into bounded subjobs.",
      );
      removed += page;
      // A short page is not EOF. Only this real zero response on the still-held
      // original transaction permits deleting the generation/message parents.
      if (page === 0) return { removed };
    }
  }
}
