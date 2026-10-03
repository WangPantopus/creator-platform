import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";
import { fulfillmentPublicationDenialPurposeCatalogue } from "../trust/fulfillment-publication-denial-catalog.js";

/** Metadata pattern follows W1 actual12a5ba86, extended to the real five owners
 * and complete original input/consent/financial/write-fence dependencies. No
 * startup readback is accepted as a qualification pin or source activation. */
export const FULFILLMENT_PUBLICATION_ORIGINAL_CATALOGUE_QUERY = `WITH roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname IN('creator_publication_authority','creator_publication_worker','creator_fulfillment_publication_metadata','creator_trust_fulfillment_publication_denial','creator_fulfillment_publication_original_hash')
), relations AS (
 SELECT c.oid,c.relname,c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator'
 AND c.relname IN('publication_preparation','publication_worker_scope','content_index','content_revision','content_publication',
 'creator_profile','fan_profile','team_membership','passkey_credential','signed_act','signed_act_consumption','signed_publication','signed_verification',
 'commerce_fulfillment_publication_scope','commerce_fulfillment_plan','commerce_fulfillment_member','commerce_group_delivery',
 'commerce_packet','commerce_commitment','commerce_mode','commerce_ledger','commerce_effect','commerce_share_grant')
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
   p.proowner IN(SELECT oid FROM roles) OR p.oid=ANY(ARRAY[to_regprocedure('creator.fence_signature_metadata_write()'),
     to_regprocedure('creator.fence_public_packet_write()'),to_regprocedure('creator.fence_public_mode_write()')])
    OR EXISTS(SELECT FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')) ELSE false END),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',o.relname,'owner',pg_get_userbyid(o.relowner),'kind',o.relkind,
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
   FROM pg_trigger t WHERE t.tgrelid=o.oid AND NOT t.tgisinternal)) ORDER BY o.relname COLLATE "C") FROM relations o),
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

/** Closed metadata inspection only. Call before owner positives or the joint
 * final gate, never after W1's last current signature/domain read. */
export async function fulfillmentPublicationOriginalPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w4_publication_original_catalogue");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const catalogue = (
      await client.query<{ catalogue: unknown }>(
        FULFILLMENT_PUBLICATION_ORIGINAL_CATALOGUE_QUERY,
      )
    ).rows[0]?.catalogue;
    const denial = await fulfillmentPublicationDenialPurposeCatalogue(client);
    return { catalogue, denial };
  } finally {
    await client.query(
      "ROLLBACK TO SAVEPOINT w4_publication_original_catalogue",
    );
    await client.query("RELEASE SAVEPOINT w4_publication_original_catalogue");
  }
}

// Primary closed canonical61 qualification of the eleven actual source files,
// including W1 published12a5ba86 and this real213. No startup-derived pin.
export const FULFILLMENT_PUBLICATION_ORIGINAL_CATALOGUE_SHA256 =
  "80f1af201d3c1799718bd60103aa96682cb351deecff89e238341929d2bd25ae";
export const FULFILLMENT_PUBLICATION_ORIGINAL_SOURCES = Object.freeze(
  [
    {
      name: "w4_fulfillment_publication_original_hash",
      path: "apps/backend/src/modules/commerce/schema-fulfillment-publication-original-hash.sql",
      owner: "W4",
      checksum:
        "b1fdfba3880d01d49b7ccff4a2181e373547e970f3190bf2385e3d1ee1bd728b",
    },
    {
      name: "w1_publication_worker_scope",
      path: "apps/backend/src/modules/identity/schema-publication-scope.sql",
      owner: "W1",
      checksum:
        "100e319216568ee1ed27081be0520dbfdb3b7019659946c2c5de1f6859d32cc1",
    },
    {
      name: "w8_publication_worker_denial",
      path: "apps/backend/migrations/0073_w8_publication_worker_denial.sql",
      owner: "W8",
      checksum:
        "87f8766331b59a174e0cf7e837e3a3a9cdfd9d9a1662aa2b39ed9aa2dc308d80",
    },
    {
      name: "w4_public_packet_read",
      path: "apps/backend/src/modules/commerce/schema-public-packet-read.sql",
      owner: "W4",
      checksum:
        "0b11d09a2dcd11cbbe715d1dccf90185270e277fea7ce6f8eabe27a36e30d4b8",
    },
    {
      name: "w1_signature_read_fence",
      path: "apps/backend/src/modules/identity/schema-signature-read-fence.sql",
      owner: "W1",
      checksum:
        "157640de84f22d6d638d788dfe04314fd193efaed80a829f288bec7cbcb815b5",
    },
    {
      name: "w6_provider_callback_ingress",
      path: "apps/backend/src/modules/session/livekit-schema.sql",
      owner: "W6",
      checksum:
        "d3b16596e2dee78df13705414077cc0993f0612022ddf8d05b76ab8c01045a8c",
    },
    {
      name: "w8_worker_migration_metadata",
      path: "apps/backend/migrations/0201_w8_worker_migration_metadata.sql",
      owner: "W8",
      checksum:
        "2fce1ce5aa6c9f571067d999e2a62ac8d71b8e147b97393e7e87091227159e6f",
    },
    {
      name: "w4_fulfillment_plan_custody",
      path: "apps/backend/src/modules/commerce/schema-fulfillment-plans.sql",
      owner: "W4",
      checksum:
        "d728ec3d71f3b9fd11c49b3f2faf91624e7b03868d5ab4b462b0730fddae4aa1",
    },
    {
      name: "w4_fulfillment_publication_consumer",
      path: "apps/backend/src/modules/commerce/schema-fulfillment-publication-consumer.sql",
      owner: "W4",
      checksum:
        "b2eecdea88d937fb46018ceee1a4385502d366f3a82a061b3c4d5de5696981f0",
    },
    {
      name: "w8_fulfillment_publication_denial",
      path: "apps/backend/migrations/0205_w8_fulfillment_publication_denial.sql",
      owner: "W8",
      checksum:
        "b72de739cfcc93d24f2af2f7813d396a7a1e44eb97e7bfc739aef7cb95a9dbf5",
    },
    {
      name: "w1_publication_preparation",
      path: "apps/backend/src/modules/identity/schema-publication-preparation.sql",
      owner: "W1",
      checksum:
        "eb393fac0e580c3b7c58e4586ebd98539f99b696aacc9db1756ea5523c059c07",
    },
  ].map((source) => Object.freeze(source)),
);

function unavailable(): never {
  throw new DomainError(
    "fulfillment_publication_original_unavailable",
    "The original publication inputs cannot be checked. Try again later.",
    503,
  );
}

/** Exact executable/source/ledger and full owner/producer metadata custody on
 * this genuine worker client. Metadata reservations and installed functions
 * alone do not pass. The actual W1 owner calls this before preparation and
 * before its joint final gate; only COMMIT follows that gate. */
export async function assertCommerceFulfillmentPublicationOriginalCatalogue(
  client: PoolClient,
): Promise<void> {
  if (requestAuthority.getStore()) unavailable();
  try {
    for (const source of FULFILLMENT_PUBLICATION_ORIGINAL_SOURCES)
      await assertRegisteredMigration(client, source);
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT current_user=session_user AND session_user='creator_publication_worker'
          AND current_setting('transaction_isolation')='read committed'
          AND EXISTS(SELECT FROM pg_database d WHERE d.datname=current_database()
           AND d.datconnlimit<>0 AND shobj_description(d.oid,'pg_database')
            IS DISTINCT FROM 'creator-platform:restored-traffic-closed') AS ready`,
      )
    ).rows[0]?.ready;
    if (
      ready !== true ||
      contentHash(
        await fulfillmentPublicationOriginalPurposeCatalogue(client),
      ) !== FULFILLMENT_PUBLICATION_ORIGINAL_CATALOGUE_SHA256
    )
      unavailable();
  } catch {
    unavailable();
  }
}
