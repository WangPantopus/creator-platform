import type { PoolClient } from "pg";
import review from "../../../../../infra/migrations/reviews/20261023-studio-reply-authority.json" with { type: "json" };
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredComparisonProfile } from "../../db/comparison-profile.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const creatorFanDenialMigration = Object.freeze({
  version: "0173_w8_creator_fan_denial",
  checksum: "0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860",
});
const purpose = "creator_trust_denial";
const sources = [
  {
    name: "w8_runtime_denial_projection",
    path: "apps/backend/migrations/0053_w8_runtime_denial_projection.sql",
    owner: "W8",
    checksum:
      "4da2e2b56f51f70e39336c6c7d26646e1732703f2e3f39c35f700ff959237185",
  },
  {
    name: "w8_content_runtime_denial",
    path: "apps/backend/migrations/0074_w8_content_runtime_denial.sql",
    owner: "W8",
    checksum:
      "61866894c579039cfc2bf11522edeaf46fa03bd51761cca3791ab3471fb9b2f3",
  },
  {
    name: "w8_interactive_denial_try_fence",
    path: "apps/backend/migrations/0082_w8_interactive_denial_try_fence.sql",
    owner: "W8",
    checksum:
      "3742b1e6b7f367ca626176615c5362ecf002fe5fcc5a96ea941d35a4708e8686",
  },
  {
    name: "w8_creator_fan_denial",
    path: "apps/backend/migrations/0089_w8_creator_fan_denial.sql",
    owner: "W8",
    checksum: creatorFanDenialMigration.checksum,
  },
] as const;

function unavailable(cause?: unknown): never {
  const failure = new DomainError(
    "scope_denial_unconfigured",
    "Current scope authority is not configured.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
  throw failure;
}

/** Closed metadata only: no session, pair, positive permission or receipt is
 * issued. The whole existing denial purpose remains isolated, including its
 * effective relation grants and every reachable SECURITY DEFINER dependency. */
export async function creatorFanDenialPurposeCatalogue(client: PoolClient) {
  await client.query("SAVEPOINT w8_creator_fan_denial_catalog");
  let completed = false;
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose);
    const roles = (
      await client.query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
         rolreplication,rolbypassrls,rolconfig,
         coalesce((SELECT jsonb_agg(jsonb_build_object('member',pg_get_userbyid(m.member),
           'role',pg_get_userbyid(m.roleid),'grantor',pg_get_userbyid(m.grantor),
           'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
           ORDER BY pg_get_userbyid(m.member) COLLATE "C",pg_get_userbyid(m.roleid) COLLATE "C",
            pg_get_userbyid(m.grantor) COLLATE "C") FROM pg_auth_members m
          WHERE m.member=r.oid OR m.roleid=r.oid),'[]'::jsonb) AS memberships,
         EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
         FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
        [[purpose, "creator_runtime"]],
      )
    ).rows;
    const dependencies = (
      await client.query(
        `SELECT d.deptype,a.type,a.object_names,a.object_args
         FROM pg_shdepend d CROSS JOIN LATERAL
          pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
         WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
          AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
         ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
        [purpose],
      )
    ).rows;
    const executables = (
      await client.query(
        `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition,
         ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
          ORDER BY a::text COLLATE "C") AS grants
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
          AND (p.proowner=to_regrole($1) OR p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE'))
         ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [purpose],
      )
    ).rows;
    completed = true;
    return { permissions, roles, dependencies, executables };
  } finally {
    // Unknown/incomplete reads belong to the transaction's settlement owner.
    if (completed) {
      await client.query("ROLLBACK TO SAVEPOINT w8_creator_fan_denial_catalog");
      await client.query("RELEASE SAVEPOINT w8_creator_fan_denial_catalog");
    }
  }
}

/** Explicit fixed review for the closed source/operator qualification. */
export async function assertCreatorFanDenialPurposeCatalog(client: PoolClient) {
  try {
    if (
      ![
        review.creatorFanDenialCatalogueChecksum,
        review.creatorFanDenialIncomingCatalogueChecksum,
      ].includes(contentHash(await creatorFanDenialPurposeCatalogue(client)))
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}

/** Rechecked on the original held core request before the SQL-by-name call.
 * Hand-installed SQL and ledger rows cannot select executable authority. */
export async function assertCreatorFanDenialCatalog(client: PoolClient) {
  try {
    for (const source of sources)
      await assertRegisteredMigration(client, source);
    const profile = await registeredComparisonProfile();
    if (
      !profile ||
      !("creatorFanDenialCatalogueChecksum" in profile) ||
      !("creatorFanDenialIncomingCatalogueChecksum" in profile)
    )
      unavailable();
    const ready = (
      await client.query<{ ready: boolean }>(`SELECT current_user=session_user
       AND session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
       AND EXISTS(SELECT FROM pg_roles r WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
        AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid)
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) AS ready`)
    ).rows[0]?.ready;
    if (
      ready !== true ||
      ![
        profile.creatorFanDenialCatalogueChecksum,
        profile.creatorFanDenialIncomingCatalogueChecksum,
      ].includes(contentHash(await creatorFanDenialPurposeCatalogue(client)))
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}
