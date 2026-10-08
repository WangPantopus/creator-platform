import type { PoolClient } from "pg";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";

/** Read-only metadata for the fixed public reader, never publication authority. */
export async function publicAIPurposeCatalogue(client: PoolClient) {
  const role = "creator_public_ai_authority";
  return {
    permissions: await generationConsumerCatalogue(client, role),
    roles: (
      await client.query(
        `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
       rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig
       FROM pg_roles WHERE rolname=$1`,
        [role],
      )
    ).rows,
    memberships: (
      await client.query(
        `SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
       admin_option,inherit_option,set_option FROM pg_auth_members
       WHERE roleid=$1::regrole OR member=$1::regrole`,
        [role],
      )
    ).rows,
    settings: (
      await client.query(
        "SELECT setconfig FROM pg_db_role_setting WHERE setrole=$1::regrole",
        [role],
      )
    ).rows,
    functions: (
      await client.query(
        `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,
       encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition,
       ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
        ORDER BY a::text COLLATE "C") AS grants
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN('creator','creator_trust','growth') AND p.prokind IN('f','p')
        AND (p.proowner=$1::regrole OR has_function_privilege($1,p.oid,'EXECUTE'))
       ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [role],
      )
    ).rows,
  };
}
