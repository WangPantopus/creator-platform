import type { PoolClient, QueryConfig, QueryResultRow } from "pg";
import generationPrivacyReview from "../../../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };
import contentPrivacyReview from "../../../../../infra/migrations/reviews/20261007-content-privacy.json" with { type: "json" };
import publicAIReview from "../../../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
import { registeredContentPrivacyProfile } from "../../db/content-privacy-profile.js";
import { registeredPublicAIProfile } from "../../db/public-ai-profile.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { allScopeOwnershipMigration } from "./privacy-ownership-catalog.js";

const purpose = "creator_privacy_family";
const roles = [
  purpose,
  "creator_privacy_fence",
  "creator_privacy_ownership_metadata",
  "creator_runtime",
];
export const originalPrivacyFamilyMigration = Object.freeze({
  version: "0214_w8_original_privacy_family",
  checksum: "fcb8f6174d48ed89b9a06d8a51ac4f0c5dd4288950f2d18b351825d9d81dd793",
});
export const originalPrivacyBindingSignature =
  "creator_trust.privacy_task_original_binding(uuid,text,uuid)";
export const originalPrivacyBindingDefinition =
  "c183dcbefe669c0918d5165717bc7c5423d9537824f2ba401ff9813db0137e13";
// Only actual closed qualification may fill this value; no startup readback.
const catalogueChecksum =
  "90200a538329f88c8f98f9caa53d1561dd7b51d43b32a01c5a285af858da8279";
// Independently captured with the complete original nine-source chain. Keep
// the original profile above; an unregistered additional grant must refuse.
const provenanceCatalogueChecksum =
  "df126892486f143f606df062490204d4ab1d13aa9e8bdee2cb402dec1b4b0b96";
const provenanceSources = [
  {
    version: "0159_w1_generation_worker_scope",
    name: "w1_generation_worker_scope",
    path: "apps/backend/src/modules/identity/schema-generation-scope.sql",
    owner: "W1",
    checksum:
      "7de41bf10228219d69480e302bac7d69626d8d848d8276bb1fe54e49112a5627",
  },
  {
    version: "0177_w8_generation_worker_denial",
    name: "w8_generation_worker_denial",
    path: "apps/backend/migrations/0093_w8_generation_worker_denial.sql",
    owner: "W8",
    checksum:
      "d47b5916b0ac0c3cc33bd7d50bfdb663f39a9218dcff0b97d3a9dce7b6acc44c",
  },
  {
    version: "0179_w3_generation_purpose_consumers",
    name: "w3_generation_purpose_consumers",
    path: "apps/backend/src/modules/conversation/migrations/0095_w3_generation_purpose_consumers.sql",
    owner: "W3",
    checksum:
      "9449f7f9254aa1c9c77713b1683d5c85076b357f13e573882ee5d2d03d1715e0",
  },
  {
    version: "0180_w2_generation_input_consumers",
    name: "w2_generation_input_consumers",
    path: "apps/backend/src/modules/agent/migrations/0096_w2_generation_input_consumers.sql",
    owner: "W2",
    checksum:
      "25f89ddba69beed4dd780cd23a64eabb9b7481e2dcb5f192b167299a732b2c34",
  },
  {
    version: "0212_w3_generation_worker_output",
    name: "w3_generation_worker_output",
    path: "apps/backend/src/modules/conversation/migrations/pending_w3_worker_output.sql",
    owner: "W3",
    checksum:
      "76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8",
  },
  {
    version: "0216_w1_generation_output_cursor",
    name: "w1_generation_output_cursor",
    path: "apps/backend/src/modules/identity/schema-generation-output-cursor.sql",
    owner: "W1",
    checksum:
      "a4f01c5f1eb1e19d79437b17cce872def1366965ba27c8c46b0d5f9bb73da436",
  },
  {
    version: "0217_w3_generation_provenance_purge",
    name: "w3_generation_provenance_purge",
    path: "apps/backend/migrations/0217_w3_generation_provenance_purge.sql",
    owner: "W3",
    checksum:
      "f2318d7a49151544796e105fe62990dc43af6fe67e49fae253b7578a0c01684e",
  },
] as const;

function unavailable(cause?: unknown): never {
  const failure = new DomainError(
    "privacy_original_family_unavailable",
    "Original data-request family authority is unavailable.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
  throw failure;
}

function responseBudget(client: PoolClient, ceiling: number) {
  const parameters = (
    client as PoolClient & {
      connectionParameters?: { query_timeout?: unknown };
    }
  ).connectionParameters;
  if (!parameters) unavailable();
  const original = parameters.query_timeout;
  if (
    original !== undefined &&
    original !== null &&
    original !== false &&
    original !== 0 &&
    (typeof original !== "number" ||
      !Number.isSafeInteger(original) ||
      original < 1)
  )
    unavailable();
  return typeof original === "number" && original > 0
    ? Math.min(original, ceiling)
    : ceiling;
}

function familyReader(client: PoolClient, signal?: AbortSignal) {
  return async <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
    ceiling = 5000,
  ) => {
    signal?.throwIfAborted();
    const result = await client.query<R>({
      text,
      values,
      query_timeout: responseBudget(client, ceiling),
    } as QueryConfig & { query_timeout: number });
    signal?.throwIfAborted();
    return result;
  };
}

/** Read-only caller qualification. Incoming API children do not supply this
 * literal core login with parent roles or private family/task permission. */
export async function assertOriginalPrivacyFamilyCaller(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const query = familyReader(client, signal);
  const result = await query<{
    ready: boolean;
  }>(`SELECT current_user=session_user AND session_user='creator_runtime'
      AND current_setting('transaction_isolation') IN('read committed','repeatable read')
      AND EXISTS(SELECT FROM pg_roles r WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
       AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) AS ready`);
  if (result.rows[0]?.ready !== true) unavailable();
}

/** Closed metadata review only. No original preparation, task, body or positive
 * permission is issued. Preserve the caller's transaction and search path. */
export async function originalPrivacyFamilyPurposeCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const query = familyReader(client, signal);
  await query("SAVEPOINT w8_original_family_catalog", [], 1500);
  let completed = false;
  try {
    await query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose, {
      queryTimeout: responseBudget(client, 5000),
      signal,
    });
    const issuerPermissions = await generationConsumerCatalogue(
      client,
      "creator_privacy_fence",
      { queryTimeout: responseBudget(client, 5000), signal },
    );
    const projectionPermissions = await generationConsumerCatalogue(
      client,
      "creator_privacy_ownership_metadata",
      { queryTimeout: responseBudget(client, 5000), signal },
    );
    const callerPermissions = await generationConsumerCatalogue(
      client,
      "creator_runtime",
      { queryTimeout: responseBudget(client, 5000), signal },
    );
    const role = (
      await query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
         rolreplication,rolbypassrls,rolconfig,
         EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS memberships,
         EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
         FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
        [roles],
      )
    ).rows;
    const dependencies = (
      await query(
        `SELECT d.deptype,a.type,a.object_names,a.object_args
         FROM pg_shdepend d CROSS JOIN LATERAL
          pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
         WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
          AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
         ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
        [roles],
      )
    ).rows;
    const executables = (
      await query(
        `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition,
         ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
          ORDER BY a::text COLLATE "C") AS grants
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
          AND (p.proowner IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
           OR EXISTS(SELECT FROM unnest($1::text[]) r WHERE has_function_privilege(r,p.oid,'EXECUTE')))
         ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [roles],
      )
    ).rows;
    const relations = (
      await query(
        `SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relkind,c.relispartition,
         c.relrowsecurity,c.relforcerowsecurity,
         (SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           'grantor',pg_get_userbyid(acl.grantor),'privilege',acl.privilege_type,'grantable',acl.is_grantable)
           ORDER BY CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END COLLATE "C",acl.privilege_type)
          FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl) AS grants,
         (SELECT jsonb_agg(jsonb_build_object('name',policy.polname,'command',policy.polcmd,'permissive',policy.polpermissive,
           'roles',ARRAY(SELECT CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END FROM unnest(policy.polroles) role
             ORDER BY CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END COLLATE "C"),
           'using',pg_get_expr(policy.polqual,policy.polrelid),'check',pg_get_expr(policy.polwithcheck,policy.polrelid)) ORDER BY policy.polname COLLATE "C")
          FROM pg_policy policy WHERE policy.polrelid=c.oid) AS policies,
         (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
           'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
           'identity',a.attidentity,'generated',a.attgenerated,
           'default',pg_get_expr(d.adbin,d.adrelid),'inherited',a.attinhcount,
           'collation',a.attcollation::regcollation::text,
           'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
             'grantor',pg_get_userbyid(acl.grantor),'privilege',acl.privilege_type,'grantable',acl.is_grantable)
             ORDER BY CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END COLLATE "C",acl.privilege_type)
            FROM aclexplode(a.attacl) acl)) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
         (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'validated',k.convalidated,
           'definition',pg_get_constraintdef(k.oid),'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
          FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
         (SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,
           'ready',x.indisready,'live',x.indislive,'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname)
          FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid) AS indexes,
         (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
           'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
          FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE (n.nspname='creator_trust' AND c.relname IN('privacy_commit_scope','privacy_job','privacy_task'))
          OR (n.nspname='creator' AND c.relname IN('thread','fan_profile','schema_migration'))
         ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
      )
    ).rows;
    completed = true;
    return {
      permissions,
      issuerPermissions,
      projectionPermissions,
      callerPermissions,
      role,
      dependencies,
      executables,
      relations,
    };
  } finally {
    // A failed read may still be in flight. Its owner must settle or destroy
    // the held connection; never submit helper cleanup behind that read.
    if (completed) {
      await query("ROLLBACK TO SAVEPOINT w8_original_family_catalog", [], 1500);
      await query("RELEASE SAVEPOINT w8_original_family_catalog", [], 1500);
    }
  }
}

async function assertPurposeCatalogue(
  client: PoolClient,
  expected: readonly string[],
  signal?: AbortSignal,
) {
  try {
    if (
      !expected.includes(
        contentHash(
          await originalPrivacyFamilyPurposeCatalogue(client, signal),
        ),
      )
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}

export async function assertOriginalPrivacyFamilyPurposeCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  await assertPurposeCatalogue(client, [catalogueChecksum], signal);
}

/** Closed metadata qualification only. This fixed profile supplies no source
 * registration, original task, private binding, DELETE or COMMIT authority. */
export async function assertOriginalPrivacyFamilyProvenanceCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  await assertPurposeCatalogue(client, [provenanceCatalogueChecksum], signal);
}

/** Closed full-graph metadata qualification only. Both fixed profiles preserve
 * incoming API children. Their membership flag cannot distinguish a forbidden
 * parent role, so the literal caller predicate is inseparable from this check.
 * Source registration, original task/fence and COMMIT checks remain separate. */
export async function assertOriginalPrivacyFamilyGenerationCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  await assertOriginalPrivacyFamilyCaller(client, signal);
  await assertPurposeCatalogue(
    client,
    generationPrivacyReview.originalFamilyProfiles.map(
      (profile) => profile.sha256,
    ),
    signal,
  );
}

/** Closed review of the exact generation-plus-Content graph. This retains the
 * literal core caller check and both original incoming-membership variants;
 * executable registration and every actual ledger entry are checked below. */
export async function assertOriginalPrivacyFamilyContentCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  await assertOriginalPrivacyFamilyCaller(client, signal);
  await assertPurposeCatalogue(
    client,
    contentPrivacyReview.originalFamilyProfiles.map(
      (profile) => profile.sha256,
    ),
    signal,
  );
}

/** Fixed pre-comparison operator metadata for the public/recovery graph.
 * This grants no task authority and accepts no runtime-selected future profile. */
export async function assertOriginalPrivacyFamilyPublicCatalogForReview(
  client: PoolClient,
  signal?: AbortSignal,
) {
  await assertOriginalPrivacyFamilyCaller(client, signal);
  await assertPurposeCatalogue(
    client,
    publicAIReview.originalFamilyProfiles.map((profile) => profile.sha256),
    signal,
  );
}

/** Executable source and ledger gate on this actual held core client. A held
 * proposal or matching manually installed ledger cannot grant family authority. */
export async function originalPrivacyFamilyRegisteredExtension(
  client: PoolClient,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const query = familyReader(client, signal);
  const source = {
    name: "w8_original_privacy_family",
    path: "apps/backend/migrations/0214_w8_original_privacy_family.sql",
    owner: "W8",
    checksum: originalPrivacyFamilyMigration.checksum,
  };
  const active = await registeredMigration(source);
  signal?.throwIfAborted();
  if (!active) return undefined;
  try {
    const ownership = await registeredMigration({
      name: "w8_all_scope_privacy_ownership",
      path: "apps/backend/migrations/0209_w8_all_scope_privacy_ownership.sql",
      owner: "W8",
      checksum: allScopeOwnershipMigration.checksum,
    });
    signal?.throwIfAborted();
    if (
      !ownership ||
      ownership.version !== allScopeOwnershipMigration.version ||
      active.version !== originalPrivacyFamilyMigration.version
    )
      unavailable();
    const migrations = [active, ownership];
    const purgerSource = provenanceSources[provenanceSources.length - 1]!;
    const purger = await registeredMigration(purgerSource);
    signal?.throwIfAborted();
    const cursorSource = generationPrivacyReview.sources.find(
      (dependency) => dependency.version === "0233_w3_privacy_cursor_export",
    );
    if (!cursorSource) unavailable();
    const composed = await registeredMigration(cursorSource);
    signal?.throwIfAborted();
    const contentProfile = composed
      ? await registeredContentPrivacyProfile(signal)
      : undefined;
    const publicProfile = contentProfile
      ? await registeredPublicAIProfile(signal)
      : undefined;
    if (composed) {
      for (const dependency of generationPrivacyReview.sources) {
        const migration = await registeredMigration(dependency);
        signal?.throwIfAborted();
        if (!migration || migration.version !== dependency.version)
          unavailable();
        migrations.push(migration);
      }
      if (contentProfile) {
        migrations.push(contentProfile.source);
        if (publicProfile) migrations.push(...publicProfile.sources);
      }
    } else if (purger) {
      for (const dependency of provenanceSources) {
        const migration =
          dependency === purgerSource
            ? purger
            : await registeredMigration(dependency);
        signal?.throwIfAborted();
        if (!migration || migration.version !== dependency.version)
          unavailable();
        migrations.push(migration);
      }
    }
    for (const migration of migrations) {
      if (
        (
          await query<{ ready: boolean }>(
            "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
            [migration.version, migration.checksum],
          )
        ).rows[0]?.ready !== true
      )
        unavailable();
    }
    if (composed) {
      if (publicProfile) {
        await assertOriginalPrivacyFamilyCaller(client, signal);
        await assertPurposeCatalogue(
          client,
          publicProfile.originalFamilyProfiles.map((profile) => profile.sha256),
          signal,
        );
      } else if (contentProfile)
        await assertOriginalPrivacyFamilyContentCatalog(client, signal);
      else await assertOriginalPrivacyFamilyGenerationCatalog(client, signal);
    } else {
      await assertOriginalPrivacyFamilyCaller(client, signal);
      if (purger)
        await assertOriginalPrivacyFamilyProvenanceCatalog(client, signal);
      else await assertOriginalPrivacyFamilyPurposeCatalog(client, signal);
    }
    return {
      signature: originalPrivacyBindingSignature,
      sha256: originalPrivacyBindingDefinition,
    };
  } catch (cause) {
    unavailable(cause);
  }
}

export async function assertOriginalPrivacyFamilyCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  if (!(await originalPrivacyFamilyRegisteredExtension(client, signal)))
    unavailable();
}
