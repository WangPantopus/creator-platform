import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";
import { FULFILLMENT_PUBLICATION_ORIGINAL_SOURCES } from "./fulfillment-publication-original-catalogue.js";
import { fulfillmentPublicationDenialPurposeCatalogue } from "../trust/fulfillment-publication-denial-catalog.js";
import {
  assertPublicationWorkerOutputCatalogue,
  publicationWorkerOutputCatalogueQuery,
  publicationWorkerOutputSource,
} from "../conversation/publication-worker-output.js";

/** Metadata inspection for the immutable original worker and its separate W3
 * writer. Reading this catalogue grants no permission. The complete published
 * owner graph must be independently qualified before a factory can accept it.
 */
export const FULFILLMENT_PUBLICATION_WORKER_CATALOGUE_QUERY = `WITH roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname IN('creator_publication_authority','creator_publication_worker','creator_fulfillment_publication_metadata','creator_trust_fulfillment_publication_denial','creator_fulfillment_publication_original_hash','creator_fulfillment_publication_worker','creator_w3_publication_output')
), relations AS (
 SELECT c.oid,n.nspname AS schema,c.relname,c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
 AND ((n.nspname='creator' AND c.relname IN('publication_preparation','publication_worker_scope','content_index','content_revision','content_publication',
 'creator_profile','fan_profile','team_membership','passkey_credential','signed_act','signed_act_consumption','signed_publication','signed_verification',
 'commerce_fulfillment_publication_scope','commerce_fulfillment_plan','commerce_fulfillment_member','commerce_group_delivery',
 'commerce_packet','commerce_commitment','commerce_mode','commerce_ledger','commerce_effect','commerce_share_grant',
 'thread','message','event','commerce_event','publication_worker_system_binding'))
  OR c.relowner IN(SELECT oid FROM roles)
  OR EXISTS(SELECT FROM roles r WHERE CASE WHEN c.relkind IN('r','p','v','m','f') THEN
   has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'SELECT,UPDATE,USAGE') ELSE false END))
) SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname COLLATE "C") FROM roles r),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
  'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
  ORDER BY pg_get_userbyid(m.roleid),pg_get_userbyid(m.member)) FROM pg_auth_members m
  WHERE m.roleid IN(SELECT oid FROM roles) OR m.member IN(SELECT oid FROM roles)),
 'settings',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(s.setrole),'database',
  CASE WHEN s.setdatabase=0 THEN 'all' WHEN s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current' ELSE 'other' END,
  'configuration',s.setconfig) ORDER BY pg_get_userbyid(s.setrole),s.setdatabase) FROM pg_db_role_setting s WHERE s.setrole IN(SELECT oid FROM roles)),
 'dependencies',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.refobjid),'kind',d.deptype,
  'type',a.type,'names',a.object_names,'arguments',a.object_args) ORDER BY pg_get_userbyid(d.refobjid),d.deptype,a.type,a.object_names,a.object_args)
  FROM pg_shdepend d CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
  WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM roles)
   AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))),
 'executables',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'securityDefiner',p.prosecdef,'volatility',p.provolatile,'configuration',p.proconfig,'definition',pg_get_functiondef(p.oid),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
   ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g)) ORDER BY p.oid::regprocedure::text COLLATE "C")
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE CASE WHEN n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p') THEN
   p.proowner IN(SELECT oid FROM roles) OR EXISTS(SELECT FROM pg_trigger t WHERE t.tgfoid=p.oid AND t.tgrelid IN(SELECT oid FROM relations)) OR p.oid=ANY(ARRAY[to_regprocedure('creator.commerce_group_delivery_exact()'),to_regprocedure('creator.fence_signature_metadata_write()'),
     to_regprocedure('creator.fence_public_packet_write()'),to_regprocedure('creator.fence_public_mode_write()')])
    OR EXISTS(SELECT FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')) ELSE false END),
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',o.schema,'name',o.relname,'owner',pg_get_userbyid(o.relowner),'kind',o.relkind,
  'rls',o.relrowsecurity,'forced',o.relforcerowsecurity,'partition',o.relispartition,
  'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),
   'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
    'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
    ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type) FROM aclexplode(a.attacl) g))
   ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=o.oid AND a.attnum>0 AND NOT a.attisdropped),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
   ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type)
   FROM aclexplode(coalesce(o.relacl,acldefault('r',o.relowner))) g),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r
    ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END COLLATE "C"),
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname COLLATE "C") FROM pg_policy p WHERE p.polrelid=o.oid),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
   'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=o.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'live',x.indislive,
   'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=o.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=o.oid AND NOT t.tgisinternal)) ORDER BY o.schema COLLATE "C",o.relname COLLATE "C") FROM relations o),
 'effectivePrivileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,'relation',c.relname,'kind',c.relkind,
  'table',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
   WHERE CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_table_privilege(r.oid,c.oid,privilege) ELSE false END ORDER BY privilege),
  'sequence',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege
   WHERE CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,privilege) ELSE false END ORDER BY privilege),
  'columns',(SELECT jsonb_agg(jsonb_build_object('column',a.attname,'privilege',privilege) ORDER BY a.attname,privilege)
   FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege(r.oid,c.oid,a.attnum,privilege) ELSE false END))
  ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C",c.relname COLLATE "C")
  FROM roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,
  'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),'create',has_schema_privilege(r.oid,n.oid,'CREATE'))
  ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C") FROM roles r CROSS JOIN pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
) AS catalogue`;

export async function fulfillmentPublicationWorkerPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w4_publication_worker_catalogue");
  await client.query("SET LOCAL search_path=pg_catalog");
  const catalogue = (
    await client.query<{ catalogue: unknown }>(
      FULFILLMENT_PUBLICATION_WORKER_CATALOGUE_QUERY,
    )
  ).rows[0]?.catalogue;
  const denial = await fulfillmentPublicationDenialPurposeCatalogue(client);
  const output = (
    await client.query<{ catalogue: unknown }>(
      publicationWorkerOutputCatalogueQuery,
    )
  ).rows[0]?.catalogue;
  // A failed read can remain in flight. Preserve it for the genuine owner;
  // only confirmed successful reads enqueue normal savepoint restoration.
  await client.query("ROLLBACK TO SAVEPOINT w4_publication_worker_catalogue");
  await client.query("RELEASE SAVEPOINT w4_publication_worker_catalogue");
  return { catalogue, denial, output };
}

export const FULFILLMENT_PUBLICATION_WORKER_SOURCE = Object.freeze({
  name: "w4_fulfillment_publication_worker",
  path: "apps/backend/src/modules/commerce/schema-fulfillment-publication-worker.sql",
  owner: "W4",
  checksum: "1e65d539ea81e7cfd4d003b792940b19aa111eb0f06dbca950b20ce8c31259f2",
});

// The actual W3 writer/proof/ending source is consumed. The complete combined
// owner graph and original ending/COMMIT still need independent qualification.
// Keep this absent; neither startup metadata nor a caller supplies a pin.
const reviewedCompleteOwnerCatalogue: string | undefined = undefined;

function unavailable(cause?: unknown): never {
  throw new DomainError(
    "fulfillment_publication_worker_unavailable",
    "Current fulfillment for this answer is unavailable. Try again later.",
    503,
    { cause },
  );
}

/** Fixed source/executable/ledger and complete current owner metadata gate.
 * A held reservation or an installed function grants no worker permission.
 */
export async function assertFulfillmentPublicationWorkerCatalogue(
  client: PoolClient,
): Promise<void> {
  if (requestAuthority.getStore()) unavailable();
  try {
    for (const source of [
      ...FULFILLMENT_PUBLICATION_ORIGINAL_SOURCES,
      FULFILLMENT_PUBLICATION_WORKER_SOURCE,
      publicationWorkerOutputSource,
    ])
      await assertRegisteredMigration(client, source);
    if (!reviewedCompleteOwnerCatalogue) unavailable();
    await assertPublicationWorkerOutputCatalogue(client);
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT current_user=session_user AND session_user='creator_publication_worker'
          AND current_setting('transaction_isolation')='read committed'
          AND to_regprocedure('creator.publication_worker_system_link(uuid,uuid,uuid,uuid)') IS NOT NULL
          AND to_regprocedure('creator.publication_worker_system_link_matches(uuid,uuid,uuid,uuid,uuid,uuid)') IS NOT NULL
          AND to_regprocedure('creator.end_publication_worker_system_links(uuid,uuid)') IS NOT NULL
          AND to_regprocedure('creator.fulfillment_publication_worker_end_system_links(uuid,uuid)') IS NOT NULL
          AND EXISTS(SELECT FROM pg_database d WHERE d.datname=current_database()
            AND d.datconnlimit<>0 AND shobj_description(d.oid,'pg_database')
              IS DISTINCT FROM 'creator-platform:restored-traffic-closed') AS ready`,
      )
    ).rows[0]?.ready;
    if (
      ready !== true ||
      contentHash(
        await fulfillmentPublicationWorkerPurposeCatalogue(client),
      ) !== reviewedCompleteOwnerCatalogue
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}
