import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import type { GenerationTerminalPurposeConsumer } from "./generation-scope.js";
import { requestAuthority } from "./request-authority.js";
import { assertGenerationTerminalPageCatalogue } from "./generation-terminal-page.js";

export const generationTerminalDiscoverySource = Object.freeze({
  owner: "W1",
  name: "w1_generation_terminal_discovery",
  path: "apps/backend/src/modules/identity/schema-generation-terminal-discovery.sql",
  checksum: "83a56963f6c37e05b0850fa6a0e97475282fbfa3e90d1372f86bea701622e7bc",
});

/** Actual closed PostgreSQL definition, not an activation or caller capability. */
export const generationTerminalDiscoveryConsumer: GenerationTerminalPurposeConsumer =
  Object.freeze({
    purpose: "generation_terminal",
    migration: Object.freeze({
      version: "0218_w1_generation_terminal_discovery",
      checksum: generationTerminalDiscoverySource.checksum,
    }),
    owner: "creator_generation_terminal_discovery",
    signature: "creator.pending_generation_terminal_cursors(integer)",
    definitionChecksum:
      "36036c26c440e7af694b8a5702c43d96985fcf2ce8c65188f91e130f6f31c00e",
  });

// The whole original caller graph, drift and restoration review is pending.
// A minimal compilation pin or startup readback cannot approve that graph.
export const generationTerminalDiscoveryCatalogueChecksum: string | undefined =
  undefined;

export const generationTerminalDiscoveryCatalogueQuery = `SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname) FROM (
  SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
  FROM pg_roles WHERE rolname IN('creator_generation_terminal_discovery','creator_generation_terminal_authority')) r),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),
  'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member)) FROM pg_auth_members
  WHERE roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_terminal_discovery','creator_generation_terminal_authority'))
   OR member IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_terminal_discovery','creator_generation_terminal_authority'))),
 'settings',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(setrole),
  'database',CASE WHEN setdatabase=0 THEN 'all' WHEN setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current' ELSE 'other' END,
  'configuration',setconfig) ORDER BY pg_get_userbyid(setrole),setdatabase) FROM pg_db_role_setting
  WHERE setrole IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_terminal_discovery','creator_generation_terminal_authority'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition',pg_get_functiondef(p.oid),'grants',(SELECT jsonb_agg(jsonb_build_object(
   'role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),
   'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE CASE WHEN ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema' AND p.prokind IN('f','p') THEN
   pg_get_userbyid(p.proowner) IN('creator_generation_terminal_discovery','creator_generation_terminal_authority')
   OR has_function_privilege('creator_generation_terminal_discovery',p.oid,'EXECUTE')
   OR has_function_privilege('creator_generation_terminal_authority',p.oid,'EXECUTE') ELSE false END)
) AS catalogue`;

function unavailable(cause?: unknown): never {
  throw new DomainError(
    "generation_terminal_discovery_unconfigured",
    "Reviewed original terminal candidate metadata is unavailable.",
    503,
    { cause },
  );
}

/** The actual original transaction client only; metadata grants no settlement,
 * input, body, token, lease, financial authority or new provider admission. */
export async function assertGenerationTerminalDiscoveryCatalogue(
  client: PoolClient,
): Promise<void> {
  if (
    requestAuthority.getStore() ||
    !generationTerminalDiscoveryCatalogueChecksum
  )
    unavailable();
  try {
    await assertRegisteredMigration(client, generationTerminalDiscoverySource);
    await assertGenerationTerminalPageCatalogue(client);
    await client.query("SAVEPOINT w1_generation_terminal_discovery_catalogue");
    await client.query("SET LOCAL search_path=pg_catalog");
    const discovery = await generationConsumerCatalogue(
      client,
      "creator_generation_terminal_discovery",
    );
    const original = await generationConsumerCatalogue(
      client,
      "creator_generation_terminal_authority",
    );
    const catalogue = (
      await client.query<{ catalogue: unknown }>(
        generationTerminalDiscoveryCatalogueQuery,
      )
    ).rows[0]?.catalogue;
    if (
      contentHash({ discovery, original, catalogue }) !==
      generationTerminalDiscoveryCatalogueChecksum
    )
      unavailable();
    // An uncertain or failed response escapes directly to original custody.
    // Savepoint restoration occurs only after every metadata read succeeds.
    await client.query(
      "ROLLBACK TO SAVEPOINT w1_generation_terminal_discovery_catalogue",
    );
    await client.query(
      "RELEASE SAVEPOINT w1_generation_terminal_discovery_catalogue",
    );
  } catch (cause) {
    unavailable(cause);
  }
}
