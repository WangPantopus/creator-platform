import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import {
  originalPrivacyFamilyRegisteredExtension,
  assertOriginalPrivacyFamilyGenerationCatalog,
  assertOriginalPrivacyFamilyContentCatalog,
  assertOriginalPrivacyFamilyPublicCatalogForReview,
  originalPrivacyBindingSignature,
  originalPrivacyBindingDefinition,
} from "./privacy-family-catalog.js";
import generationReview from "../../../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };
import contentReview from "../../../../../infra/migrations/reviews/20261007-content-privacy.json" with { type: "json" };
import publicAIReview from "../../../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
import outputReview from "../../../../../infra/migrations/reviews/20261007-generation-first-visible.json" with { type: "json" };
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { contentHash } from "../../core/canonical.js";
import {
  accountDetachedUsageCatalogue,
  accountDetachedUsageExpectedCatalogue,
  accountDeleteBindingSignature,
  accountDeleteBindingDefinition,
} from "./account-detached-usage-catalogue.js";
import {
  accountingBoundaryCatalogue,
  accountingBoundaryExpectedCatalogue,
  accountingBoundaryBindingSignature,
  accountingBoundaryBindingDefinition,
} from "./accounting-boundary-catalogue.js";
import { accountDetachedUsageRegisteredExtension } from "./account-detached-usage-catalogue.js";
import { accountingBoundaryRegisteredExtension } from "./accounting-boundary-catalogue.js";

const functions = [
  {
    signature:
      "creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)",
    sha256: "89545999948ddf8a7d237e0298df721426aea055e706e4edc82b60879ce18e6c",
  },
  {
    signature: "creator_trust.finish_privacy_task_scope()",
    sha256: "87ca3cb473206101c6590c79c598695cfd2e7e491e14c5e490e3d21a06ff426d",
  },
];
const columns = [
  ...[
    "id",
    "account_id",
    "kind",
    "scope",
    "creator_id",
    "thread_id",
    "state",
    "verified_at",
    "verification_ref",
    "owned_creator_ids",
    "ownership_ref",
  ].map((column) => ({
    relation: "privacy_job",
    column,
    privilege: "SELECT",
  })),
  { relation: "privacy_job", column: "id", privilege: "UPDATE" },
  ...["job_id", "domain", "state", "lease_token", "lease_until"].map(
    (column) => ({ relation: "privacy_task", column, privilege: "SELECT" }),
  ),
  { relation: "privacy_task", column: "job_id", privilege: "UPDATE" },
];

/** Exact activated lifecycle source and metadata-only purpose custody. A
 * manually installed proposal, extra grant/owner/membership or early trigger
 * is unavailable. Do not cache this across the real held transaction. */
export async function assertPrivacyTaskCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const family = await originalPrivacyFamilyRegisteredExtension(client, signal);
  const detached = await accountDetachedUsageRegisteredExtension(
    client,
    signal,
  );
  const boundary = await accountingBoundaryRegisteredExtension(client, signal);
  return assertPrivacyTaskMetadata(
    client,
    { family, detached, boundary },
    signal,
  );
}

/** Exact canonical0087 metadata for the migration operator before any
 * generation DDL. This issues no task authority and rejects every extension;
 * runtime callers must use assertPrivacyTaskCatalog and its registered graph. */
export async function assertCanonicalPrivacyTaskCatalog(
  client: PoolClient,
  signal?: AbortSignal,
) {
  return assertPrivacyTaskMetadata(client, {}, signal);
}

/** Fixed100 metadata for the closed migration operator after later Content
 * registration. This supplies no task authority and accepts no caller pins;
 * runtime callers retain the live registered graph above. */
export async function assertGenerationPrivacyTaskCatalogForReview(
  client: PoolClient,
  signal?: AbortSignal,
) {
  return assertPrivacyExtensionForReview(client, "generation", signal);
}

/** Fixed102 operator metadata before public-AI DDL. No task authority or
 * caller-provided checksums; runtime retains its complete registered graph. */
export async function assertOutputPrivacyTaskCatalogForReview(
  client: PoolClient,
  signal?: AbortSignal,
) {
  return assertPrivacyExtensionForReview(client, "output", signal);
}

/** Fixed104–106 operator metadata before comparison activation. The two
 * recovery sources do not change these original privacy owners. Runtime paths
 * still require the entire current registered graph and real held task. */
export async function assertPublicPrivacyTaskCatalogForReview(
  client: PoolClient,
  signal?: AbortSignal,
) {
  return assertPrivacyExtensionForReview(client, "public", signal);
}

async function assertPrivacyExtensionForReview(
  client: PoolClient,
  profile: "generation" | "output" | "public",
  signal?: AbortSignal,
) {
  for (const source of generationReview.sources)
    await assertRegisteredMigration(client, source, signal);
  if (profile !== "generation") {
    await assertRegisteredMigration(client, contentReview.source, signal);
    await assertRegisteredMigration(client, outputReview.source, signal);
    if (profile === "public") {
      for (const source of publicAIReview.sources)
        await assertRegisteredMigration(client, source, signal);
      await assertOriginalPrivacyFamilyPublicCatalogForReview(client, signal);
    } else await assertOriginalPrivacyFamilyContentCatalog(client, signal);
  } else await assertOriginalPrivacyFamilyGenerationCatalog(client, signal);
  if (
    contentHash(await accountDetachedUsageCatalogue(client, signal)) !==
      (profile === "public"
        ? publicAIReview.runtimeCatalogues.detached
        : profile === "output"
          ? outputReview.runtimeCatalogues.detached
          : accountDetachedUsageExpectedCatalogue) ||
    contentHash(await accountingBoundaryCatalogue(client, signal)) !==
      (profile === "public"
        ? publicAIReview.runtimeCatalogues.boundary
        : profile === "output"
          ? outputReview.runtimeCatalogues.boundary
          : accountingBoundaryExpectedCatalogue)
  )
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "Original generation privacy metadata changed.",
      503,
    );
  return assertPrivacyTaskMetadata(
    client,
    {
      family: {
        signature: originalPrivacyBindingSignature,
        sha256: originalPrivacyBindingDefinition,
      },
      detached: {
        signature: accountDeleteBindingSignature,
        sha256: accountDeleteBindingDefinition,
      },
      boundary: {
        signature: accountingBoundaryBindingSignature,
        sha256: accountingBoundaryBindingDefinition,
      },
    },
    signal,
  );
}

async function assertPrivacyTaskMetadata(
  client: PoolClient,
  extensions: {
    family?: { signature: string; sha256: string };
    detached?: { signature: string; sha256: string };
    boundary?: { signature: string; sha256: string };
  },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const { family, detached, boundary } = extensions;
  const expectedFunctions = [
    ...functions,
    ...(family ? [family] : []),
    ...(detached ? [detached] : []),
    ...(boundary ? [boundary] : []),
  ];
  const expectedColumns = family
    ? [
        ...columns,
        { relation: "privacy_job", column: "created_at", privilege: "SELECT" },
      ]
    : columns;
  const ready = (
    await client.query<{ ready: boolean }>(
      `WITH role AS (
        SELECT oid FROM pg_roles WHERE rolname='creator_privacy_fence'
        AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
      ), scope AS (
        SELECT c.oid,c.reltype,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator_trust' AND c.relname='privacy_commit_scope' AND c.relkind='r'
        AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner=(SELECT oid FROM role)
      ), expected_functions AS (
        SELECT to_regprocedure(signature) AS oid,sha256 FROM jsonb_to_recordset($3::jsonb) AS f(signature text,sha256 text)
      ), expected_columns AS (
        SELECT relation,"column",privilege FROM jsonb_to_recordset($4::jsonb) AS c(relation text,"column" text,privilege text)
      ), actual_columns AS (
        SELECT n.nspname,c.relname AS relation,a.attname AS "column",acl.privilege_type AS privilege,
        acl.is_grantable,acl.grantor=c.relowner AS owner_granted
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attnum>0 AND NOT a.attisdropped
        AND acl.grantee=(SELECT oid FROM role)
      ) SELECT
        current_user=session_user AND session_user='creator_runtime'
        AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls
          AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND rolconfig IS NULL)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user))
        AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
        AND (SELECT count(*)=1 FROM role) AND (SELECT count(*)=1 FROM scope)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM role) OR roleid=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN((SELECT oid FROM role),(SELECT oid FROM pg_roles WHERE rolname=current_user)))
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=(SELECT oid FROM role) AND relkind IN('r','p','v','m','S','f') AND oid<>(SELECT oid FROM scope))
        AND NOT EXISTS(SELECT FROM pg_type t WHERE t.typowner=(SELECT oid FROM role)
          AND t.oid<>(SELECT reltype FROM scope) AND t.typelem<>(SELECT reltype FROM scope))
        AND (SELECT count(*)=$5 FROM pg_proc p JOIN expected_functions e ON p.oid=e.oid
          WHERE p.proowner=(SELECT oid FROM role) AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
          AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.sha256)
        AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=(SELECT oid FROM role) AND oid NOT IN(SELECT oid FROM expected_functions))
        AND NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE (acl.grantee=(SELECT oid FROM role) AND p.oid NOT IN(SELECT oid FROM expected_functions))
          OR (p.oid IN(SELECT oid FROM expected_functions) AND
            (acl.privilege_type<>'EXECUTE' OR acl.is_grantable OR acl.grantor<>(SELECT oid FROM role)
              OR (acl.grantee<>(SELECT oid FROM role) AND NOT(
                (p.oid=to_regprocedure('creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)')
                 AND acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='creator_runtime'))
                OR ($6::boolean AND p.oid=to_regprocedure('creator_trust.privacy_task_original_binding(uuid,text,uuid)')
                 AND acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='creator_privacy_family'))
                OR ($7::boolean AND p.oid=to_regprocedure('creator_trust.usage_account_delete_bound(uuid)')
                 AND acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='creator_usage_detachment'))
                OR ($8::boolean AND p.oid=to_regprocedure('creator_trust.privacy_accounting_original_scope(uuid,text,uuid)')
                 AND acl.grantee=(SELECT oid FROM pg_roles WHERE rolname='creator_privacy_accounting_boundary')))))))
        AND has_function_privilege(current_user,to_regprocedure('creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)'),'EXECUTE')
        AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) acl
          WHERE c.relkind IN('r','p','v','m','S','f') AND acl.grantee=(SELECT oid FROM role) AND c.oid<>(SELECT oid FROM scope))
        AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
          WHERE c.oid=(SELECT oid FROM scope) AND (acl.grantee<>c.relowner OR acl.grantor<>c.relowner OR acl.is_grantable))
        AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
          WHERE n.nspname IN('creator','creator_trust','growth') AND acl.grantee=0)
        AND NOT EXISTS(SELECT FROM actual_columns a WHERE a.nspname<>'creator_trust' OR a.is_grantable OR NOT a.owner_granted
          OR NOT EXISTS(SELECT FROM expected_columns e WHERE e.relation=a.relation AND e."column"=a."column" AND e.privilege=a.privilege))
        AND (SELECT count(*) FROM actual_columns)=(SELECT count(*) FROM expected_columns)
        AND NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
          WHERE acl.grantee=(SELECT oid FROM role) AND (n.nspname<>'creator_trust' OR acl.privilege_type<>'USAGE' OR acl.is_grantable OR acl.grantor<>n.nspowner))
        AND has_schema_privilege((SELECT oid FROM role),'creator_trust','USAGE')
        AND NOT EXISTS(SELECT FROM pg_default_acl d LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true WHERE d.defaclrole=(SELECT oid FROM role) OR acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w CROSS JOIN LATERAL aclexplode(w.fdwacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND (SELECT count(*)=7 FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attnum>0 AND NOT attisdropped
          AND attname=ANY(ARRAY['pid','xid','caller','job_id','domain','lease_token','binding']))
        AND (SELECT count(*)=7 FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attnum>0 AND NOT attisdropped)
        AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid=(SELECT oid FROM scope) AND contype='p'
          AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attname='pid'),
            (SELECT attnum FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attname='xid')]::smallint[])
        AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=(SELECT oid FROM scope) AND NOT tgisinternal
          AND tgname='privacy_task_commit_current' AND tgenabled='O' AND tgdeferrable AND tginitdeferred
          AND tgfoid=to_regprocedure('creator_trust.finish_privacy_task_scope()'))
        AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=(SELECT oid FROM scope) AND NOT tgisinternal)
        AND (SELECT count(*)=1 FROM pg_policy WHERE polrelid=(SELECT oid FROM scope)
          AND polname='fence_private' AND polroles=ARRAY[(SELECT oid FROM role)] AND polcmd='*' AND polpermissive
          AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true')
        AND (SELECT count(*)=1 FROM pg_policy WHERE polrelid=(SELECT oid FROM scope))
        AND (SELECT count(*)=4 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='creator_trust' AND c.relname IN('privacy_job','privacy_task') AND p.polroles=ARRAY[(SELECT oid FROM role)]
          AND p.polpermissive AND pg_get_expr(p.polqual,p.polrelid)='true'
          AND ((p.polname='privacy_fence_metadata' AND p.polcmd='r' AND p.polwithcheck IS NULL)
            OR (p.polname='privacy_fence_lock' AND p.polcmd='w' AND pg_get_expr(p.polwithcheck,p.polrelid)='false')))
        AND (SELECT count(*)=4 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='creator_trust' AND c.relname IN('privacy_job','privacy_task')
          AND ((SELECT oid FROM role)=ANY(p.polroles) OR 0=ANY(p.polroles))) AS ready`,
      [
        "0087_w8_privacy_task_commit_fence",
        "33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef",
        JSON.stringify(expectedFunctions),
        JSON.stringify(expectedColumns),
        expectedFunctions.length,
        family !== undefined,
        detached !== undefined,
        boundary !== undefined,
      ],
    )
  ).rows[0]?.ready;
  signal?.throwIfAborted();
  if (ready !== true)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "Registered lifecycle authority is unavailable.",
      503,
    );
}
