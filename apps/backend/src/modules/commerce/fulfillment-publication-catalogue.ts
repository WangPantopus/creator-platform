import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { requestAuthority } from "../identity/request-authority.js";
import { assertFulfillmentPublicationDenialCatalog } from "../trust/fulfillment-publication-denial-catalog.js";

const publicationOwner = "creator_fulfillment_publication_metadata";
// Captured without compiler-only extensions in the primary's independent
// canonical61 rollback review of unchanged0178/0158/0204 and actual0205.
// Actual0208 and later producer grants require a new combined qualification.
export const FULFILLMENT_PUBLICATION_CATALOGUE_SHA256 =
  "821fd1ce84fd35ffe881ac895504ad3f071f2945fc5676dc282f2e26d99fe8ce";

function unavailable(): never {
  throw new DomainError(
    "fulfillment_publication_owner_unavailable",
    "The original publication authority is unavailable. Try again later.",
    503,
  );
}

/** The original worker checks this before204 preparation and on its same held
 * client before the joint final gate. It issues no task or recipient scope.
 * Actual205 checks executable source/ledger/login custody and its own producer;
 * this additional owner check catches204 grants, body-policy and cleanup drift.
 * Nothing may call it after the last domain/signature read: only COMMIT follows.
 */
export async function assertCommerceFulfillmentPublicationCatalogue(
  client: PoolClient,
): Promise<void> {
  if (requestAuthority.getStore()) unavailable();
  try {
    await assertFulfillmentPublicationDenialCatalog(client);
    const role = await generationConsumerCatalogue(client, publicationOwner);
    const owner = (
      await client.query<{ checksum: string }>(
        FULFILLMENT_PUBLICATION_CATALOGUE_QUERY,
      )
    ).rows[0]?.checksum;
    if (
      contentHash({ role, owner }) !== FULFILLMENT_PUBLICATION_CATALOGUE_SHA256
    )
      unavailable();
  } catch {
    unavailable();
  }
}

/** Metadata-only integrity check. This does not issue recipient authority. */
export const FULFILLMENT_PUBLICATION_CATALOGUE_QUERY = `WITH owned AS (
 SELECT c.oid,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='creator' AND c.relname IN('commerce_fulfillment_publication_scope')
), metadata AS (
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',o.relname,'owner',pg_get_userbyid(o.relowner),
  'rls',o.relrowsecurity,'forced',o.relforcerowsecurity,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
   'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=o.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'kind',c.contype,'definition',pg_get_constraintdef(c.oid,false),
   'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred) ORDER BY c.conname)
   FROM pg_constraint c WHERE c.conrelid=o.oid),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type)
   FROM aclexplode(coalesce(o.relacl,acldefault('r',o.relowner))) a),
  'columnGrants',(SELECT jsonb_agg(jsonb_build_object('column',a.attname,'role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY a.attnum,(CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END) COLLATE "C",g.privilege_type)
   FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE a.attrelid=o.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY o.relname) FROM owned o),
 'policies',(SELECT jsonb_agg(jsonb_build_object('relation',o.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
  'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY (CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END) COLLATE "C") FROM unnest(p.polroles) r),
  'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY o.relname,p.polname)
  FROM pg_policy p JOIN pg_class o ON o.oid=p.polrelid
  WHERE o.oid IN(SELECT oid FROM owned) OR (o.oid='creator.content_revision'::regclass AND p.polname='fulfillment_publication_before_body')),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('relation',o.relname,'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,
  'deferrable',t.tgdeferrable,'deferred',t.tginitdeferred,'function',f.proname,'owner',pg_get_userbyid(f.proowner)) ORDER BY o.relname,t.tgname)
  FROM pg_trigger t JOIN owned o ON o.oid=t.tgrelid JOIN pg_proc f ON f.oid=t.tgfoid WHERE NOT t.tgisinternal),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',f.proname,'owner',pg_get_userbyid(f.proowner),'securityDefiner',f.prosecdef,
  'definition',pg_get_functiondef(f.oid),'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a)) ORDER BY f.proname)
  FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='creator' AND f.proname IN('prepare_commerce_fulfillment_publication','commerce_fulfillment_publication_document_ready',
   'commerce_fulfillment_publication_negative_originals','bind_commerce_fulfillment_publication','commerce_fulfillment_publication_matches',
   'commerce_fulfillment_publication_originals','end_commerce_fulfillment_publication','require_fulfillment_publication_cleanup'))
,
 'effectiveExecutables',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE CASE WHEN n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
   THEN has_function_privilege('creator_fulfillment_publication_metadata',p.oid,'EXECUTE') ELSE false END)
 ) AS value)
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') AS checksum FROM metadata`;
