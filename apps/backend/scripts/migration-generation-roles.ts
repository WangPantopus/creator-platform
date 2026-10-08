import type { PoolClient, QueryConfig, QueryResultRow } from "pg";
import { readFile } from "node:fs/promises";
import purposeReview from "../../../infra/migrations/reviews/20261007-generation-purpose-roles.json" with { type: "json" };
import contentReview from "../../../infra/migrations/reviews/20261007-content-privacy.json" with { type: "json" };
import outputReview from "../../../infra/migrations/reviews/20261007-generation-first-visible.json" with { type: "json" };
import partialRecoveryReview from "../../../infra/migrations/reviews/20261007-partial-generation-recovery.json" with { type: "json" };
import recoveryReview from "../../../infra/migrations/reviews/20261007-generation-recovery.json" with { type: "json" };
import publicAIReview from "../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
import { publicAIPurposeCatalogue } from "../src/modules/identity/public-ai-catalogue.js";
import { ContentPrivacyExport } from "../src/modules/content/privacy-export.js";
import { contentHash } from "../src/core/canonical.js";
import { generationConsumerCatalogue } from "../src/core/purpose-catalogue.js";
import { repositoryRoot, schemaCustody, sha256 } from "./migration-custody.js";
import {
  assertWaveRoleSafety,
  WaveRoleSafetyError,
} from "./migration-wave-roles.js";

/** Closed operator metadata only. This reader issues no task, private scope,
 * registration or runtime permission. Its owner must retain the original
 * transaction and settle/destroy the client after an uncertain read. */
export async function generationWavePurposeCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const query = async <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ) => {
    signal?.throwIfAborted();
    const result = await client.query<R>({
      text,
      values,
      query_timeout: 5000,
    } as QueryConfig & { query_timeout: number });
    signal?.throwIfAborted();
    return result;
  };
  await query("SAVEPOINT w8_generation_wave_catalogue");
  let completed = false;
  try {
    await query("SET LOCAL search_path=pg_catalog");
    const roles = (
      await query(
        `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
         rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig
         FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
        [purposeReview.roles],
      )
    ).rows;
    const memberships = (
      await query(
        `SELECT pg_get_userbyid(m.roleid) AS role,pg_get_userbyid(m.member) AS member,
         pg_get_userbyid(m.grantor) AS grantor,m.admin_option,m.inherit_option,m.set_option
         FROM pg_auth_members m
         WHERE m.roleid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
          OR m.member IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[])) ORDER BY role,member`,
        [purposeReview.roles],
      )
    ).rows;
    const settings = (
      await query(
        `SELECT pg_get_userbyid(setrole) AS role,
         CASE WHEN setdatabase=0 THEN 'all'
          WHEN setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current'
          ELSE 'other' END AS database,setconfig
         FROM pg_db_role_setting WHERE setrole IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
         ORDER BY role,database`,
        [purposeReview.roles],
      )
    ).rows;
    const dependencies = (
      await query(
        `SELECT pg_get_userbyid(d.refobjid) AS role,d.deptype,a.type,a.object_names,a.object_args
         FROM pg_shdepend d CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
         WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
          AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
         ORDER BY role,d.deptype,a.type,a.object_names,a.object_args`,
        [purposeReview.roles],
      )
    ).rows;
    const functions = (
      await query(
        `SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,
         p.prokind,p.prosecdef,p.provolatile,p.proconfig,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition,
         ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
          ORDER BY a::text COLLATE "C") AS grants
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
          AND (p.proowner IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
           OR EXISTS(SELECT FROM unnest($1::text[]) r WHERE has_function_privilege(r,p.oid,'EXECUTE')))
         ORDER BY p.oid::regprocedure::text COLLATE "C"`,
        [purposeReview.roles],
      )
    ).rows;
    const permissions: Record<string, unknown> = {};
    for (const role of purposeReview.roles)
      permissions[role] = await generationConsumerCatalogue(client, role, {
        queryTimeout: 5000,
        signal,
      });
    signal?.throwIfAborted();
    // Complete application shape/ACLs also detect grants to an existing core
    // role that would not change a new table owner's effective permissions.
    const schema = await schemaCustody(client);
    signal?.throwIfAborted();
    // Preserve every internal check and its enabled/deferred behavior while
    // replacing only recognized generated FK names. Include the FK's owning
    // relation and retain text type: PostgreSQL name truncates at63 bytes and
    // can otherwise collapse distinct checks into an unstable ordering.
    const internalTriggers = (
      await query(
        `SELECT schema,relation,identity,enabled,is_deferrable,initially_deferred,constraint_definition,
         function_definition,definition FROM (
         SELECT n.nspname AS schema,c.relname AS relation,
          CASE WHEN stable.known THEN k.conrelid::regclass::text||':'||k.conname||':'||p.proname||':'||t.tgtype::text
           ELSE t.tgname::text END AS identity,
          t.tgenabled AS enabled,t.tgdeferrable AS is_deferrable,t.tginitdeferred AS initially_deferred,
          pg_get_constraintdef(k.oid) AS constraint_definition,
          pg_get_functiondef(p.oid) AS function_definition,
          CASE WHEN stable.known THEN replace(pg_get_triggerdef(t.oid),format('TRIGGER %I ',t.tgname),
           format('TRIGGER %I ',k.conrelid::regclass::text||':'||k.conname||':'||p.proname||':'||t.tgtype::text))
           ELSE pg_get_triggerdef(t.oid) END AS definition
         FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
         JOIN pg_namespace fn ON fn.oid=p.pronamespace LEFT JOIN pg_constraint k ON k.oid=t.tgconstraint
         CROSS JOIN LATERAL (SELECT k.contype='f' AND fn.nspname='pg_catalog'
          AND t.tgname ~ '^RI_ConstraintTrigger_[ac]_[0-9]+$'
          AND p.proname IN('RI_FKey_check_ins','RI_FKey_check_upd','RI_FKey_noaction_del','RI_FKey_noaction_upd',
           'RI_FKey_restrict_del','RI_FKey_restrict_upd','RI_FKey_cascade_del','RI_FKey_cascade_upd',
           'RI_FKey_setnull_del','RI_FKey_setnull_upd','RI_FKey_setdefault_del','RI_FKey_setdefault_upd') AS known) stable
         WHERE n.nspname IN('creator','creator_trust','growth') AND t.tgisinternal
        ) reviewed ORDER BY schema COLLATE "C",relation COLLATE "C",identity COLLATE "C"`,
      )
    ).rows;
    completed = true;
    return {
      roles,
      memberships,
      settings,
      dependencies,
      functions,
      permissions,
      schema,
      internalTriggers,
    };
  } finally {
    if (completed) {
      await query("ROLLBACK TO SAVEPOINT w8_generation_wave_catalogue");
      await query("RELEASE SAVEPOINT w8_generation_wave_catalogue");
    }
  }
}

/** Fixed closed-review profiles only. This supplements the original wave
 * checker; the activation runner, backup/restore, privacy guards and actual
 * application preparations must still qualify independently. */
export async function assertGenerationWaveRoleSafety(
  client: PoolClient,
  extension?:
    | "content-privacy"
    | "generation-output"
    | "public-ai"
    | "generation-recovery"
    | "partial-generation-recovery",
) {
  if (
    purposeReview.schemaVersion !== 1 ||
    purposeReview.postgresMajor !== 17 ||
    purposeReview.sourceReview !== "20261007-generation-privacy" ||
    purposeReview.roles.length !== 28 ||
    !purposeReview.catalogueSha256.length
  )
    throw new WaveRoleSafetyError(
      "Generation-purpose wave review is unavailable.",
    );
  const recovery =
    extension === "generation-recovery" ||
    extension === "partial-generation-recovery";
  const selectedRecovery =
    extension === "partial-generation-recovery"
      ? partialRecoveryReview
      : recoveryReview;
  const original = await assertWaveRoleSafety(client, {
    trust: true,
    media: true,
    content: true,
    interactive: true,
    generationDenial: true,
    publicAI: extension === "public-ai" || recovery,
  });
  const catalogue = await generationWavePurposeCatalogue(client);
  const accepted = extension
    ? (recovery
        ? selectedRecovery
        : extension === "public-ai"
          ? publicAIReview
          : extension === "generation-output"
            ? outputReview
            : contentReview
      ).purposeProfiles.map((profile) => profile.sha256)
    : purposeReview.catalogueSha256;
  if (!(accepted as string[]).includes(contentHash(catalogue)))
    throw new WaveRoleSafetyError("Generation-purpose wave catalogue changed.");
  if (extension) {
    const source = contentReview.source;
    if (
      contentReview.schemaVersion !== 1 ||
      source.version !== "0198_w5_content_privacy_export" ||
      sha256(await readFile(new URL(source.path, repositoryRoot))) !==
        source.checksum ||
      !(
        await client.query(
          "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
          [source.version, source.checksum],
        )
      ).rowCount
    )
      throw new WaveRoleSafetyError("Exact Content export source is required.");
    if (
      extension === "generation-output" ||
      extension === "public-ai" ||
      recovery
    ) {
      const repair = outputReview.source;
      if (
        outputReview.schemaVersion !== 1 ||
        repair.version !== "0234_w3_generation_first_visible_read" ||
        sha256(await readFile(new URL(repair.path, repositoryRoot))) !==
          repair.checksum ||
        !(
          await client.query(
            "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
            [repair.version, repair.checksum],
          )
        ).rowCount
      )
        throw new WaveRoleSafetyError(
          "Exact generation output repair source is required.",
        );
    }
    if (extension === "public-ai" || recovery) {
      for (const source of publicAIReview.sources)
        if (
          sha256(await readFile(new URL(source.path, repositoryRoot))) !==
            source.checksum ||
          !(
            await client.query(
              "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
              [source.version, source.checksum],
            )
          ).rowCount
        )
          throw new WaveRoleSafetyError(
            "Exact public metadata and denial sources are required.",
          );
      if (
        contentHash(await publicAIPurposeCatalogue(client)) !==
        publicAIReview.publicCatalogueChecksum
      )
        throw new WaveRoleSafetyError("Public AI purpose catalogue changed.");
    }
    if (recovery) {
      for (const source of extension === "partial-generation-recovery"
        ? [recoveryReview.source, partialRecoveryReview.source]
        : [recoveryReview.source]) {
        if (
          sha256(await readFile(new URL(source.path, repositoryRoot))) !==
            source.checksum ||
          !(
            await client.query(
              "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
              [source.version, source.checksum],
            )
          ).rowCount
        )
          throw new WaveRoleSafetyError(
            "Exact terminal recovery source is required.",
          );
      }
    }
    try {
      await client.query("SET SESSION AUTHORIZATION creator_runtime");
      await ContentPrivacyExport.assertCatalogueForReview(client);
    } finally {
      // An uncertain read belongs to the caller's original rollback custody.
      await client.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
    }
  }
  return {
    original,
    purposeRoles:
      purposeReview.roles.length +
      (extension ? 1 : 0) +
      (extension === "public-ai" || recovery ? 1 : 0),
  };
}
