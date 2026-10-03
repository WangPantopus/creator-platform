import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const FULFILLMENT_ORIGINAL_HASH_MIGRATION =
  "0202_w4_fulfillment_original_hash";
export const FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256 =
  "167b04e53310b6cba5dfa61cafba58f69242836698611a4d2c7e4136132583f5";
const Owner = "creator_fulfillment_original_hash";
const RoleCatalogue =
  "1aa00174ae0fdfde77a28f336122836a0908430710a4e5a7ea63c7425d034e74";
const Definitions = Object.freeze({
  "creator.commerce_fulfillment_originals_match(uuid)":
    "7cec5bbaf4bb23fe8a4d60c4f8a3f9804c8fe0808275ababb7961673260226be",
  "creator.commerce_fulfillment_original_hash_bound(uuid,uuid,uuid,uuid)":
    "f9d99fec672a6b7d9e40f5cf20f3ab4dccab10acf70b845ba25597be76d502e7",
});

export const FULFILLMENT_ORIGINAL_HASH_CATALOGUE_QUERY = `WITH metadata AS (
 SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='creator' AND p.proname IN('commerce_fulfillment_originals_match','commerce_fulfillment_original_hash_bound')),
 'effectiveExecutables',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE CASE WHEN n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
   THEN has_function_privilege('creator_fulfillment_original_hash',p.oid,'EXECUTE') ELSE false END)
 ) AS value)
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') AS checksum FROM metadata`;

// Filled only from the actual isolated SQL/operator review, never startup data.
export const FULFILLMENT_ORIGINAL_HASH_CATALOGUE_SHA256 =
  "2fe29055f29bc8b070c1eb52a5411718b304696d733a3b04b259d15da477e34c";

export function originalHashUnavailable(): never {
  throw new DomainError(
    "fulfillment_original_hash_unavailable",
    "The original request inputs cannot be verified. Refresh and try again.",
    503,
  );
}

/** Metadata integrity only. This neither issues a viewer scope nor authorizes
 * a private input/body read. Both genuine owners use this same current proof. */
export async function assertFulfillmentOriginalHashCatalogue(
  client: PoolClient,
): Promise<void> {
  try {
    await assertRegisteredMigration(client, {
      name: "w4_fulfillment_original_hash",
      path: "apps/backend/src/modules/commerce/schema-fulfillment-original-hash.sql",
      owner: "W4",
      checksum: FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256,
    });
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT session_user='creator_runtime' AND current_user=session_user
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0199_w4_fulfillment_plan_read'
        AND checksum='534f5c36b3d58eb2099f9a9a12452a60b287e4f1f3040c4ebeba99a3c8e96684')
       AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$3 AND NOT r.rolcanlogin
        AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid))
       AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$3))
       AND NOT has_schema_privilege($3,'creator','CREATE')
       AND NOT has_column_privilege($3,'creator.identity_session','token_hash','SELECT')
       AND NOT has_column_privilege($3,'creator.identity_session','upstream_cipher','SELECT')
       AND NOT has_column_privilege($3,'creator.passkey_credential','public_key','SELECT')
       AND NOT has_column_privilege($3,'creator.signed_act','assertion','SELECT')
       AND NOT has_column_privilege($3,'creator.content_revision','document','SELECT')
       AND has_function_privilege(current_user,'creator.commerce_fulfillment_originals_match(uuid)','EXECUTE')
       AND NOT has_function_privilege(current_user,'creator.commerce_fulfillment_original_hash_bound(uuid,uuid,uuid,uuid)','EXECUTE') AS ready`,
        [
          FULFILLMENT_ORIGINAL_HASH_MIGRATION,
          FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256,
          Owner,
        ],
      )
    ).rows[0]?.ready;
    if (
      ready !== true ||
      contentHash(await generationConsumerCatalogue(client, Owner)) !==
        RoleCatalogue ||
      (
        await client.query<{ checksum: string }>(
          FULFILLMENT_ORIGINAL_HASH_CATALOGUE_QUERY,
        )
      ).rows[0]?.checksum !== FULFILLMENT_ORIGINAL_HASH_CATALOGUE_SHA256
    )
      originalHashUnavailable();
    for (const [signature, checksum] of Object.entries(Definitions)) {
      const row = (
        await client.query<{ ready: boolean; definition: string }>(
          `SELECT p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
         AND ((p.proname='commerce_fulfillment_originals_match' AND p.prosecdef AND pg_get_userbyid(p.proowner)=$2)
          OR (p.proname='commerce_fulfillment_original_hash_bound' AND NOT p.prosecdef AND pg_get_userbyid(p.proowner)='creator_owner'))
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ready,
         pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
          [signature, Owner],
        )
      ).rows[0];
      if (
        row?.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !== checksum
      )
        originalHashUnavailable();
    }
  } catch {
    originalHashUnavailable();
  }
}
