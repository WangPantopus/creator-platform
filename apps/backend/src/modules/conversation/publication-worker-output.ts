import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";

export const publicationWorkerOutputSource = Object.freeze({
  owner: "W3",
  name: "w3_publication_worker_output",
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_publication_worker_output.sql",
  checksum: "c620daaa66c5ecbd743beee443f1d4b2bb5226184b9051f6b8dc79c6aeafb660",
});
export const publicationWorkerOutputSignatures = Object.freeze({
  writer: "creator.publication_worker_system_link(uuid,uuid,uuid,uuid)",
  proof:
    "creator.publication_worker_system_link_matches(uuid,uuid,uuid,uuid,uuid,uuid)",
  end: "creator.end_publication_worker_system_links(uuid,uuid)",
  cleanup: "creator.require_publication_worker_system_cleanup()",
});

// The genuine W4 ending bridge is integrated. Complete original owner,
// catalogue and task/COMMIT/C10 qualification remains pending; neither startup
// readback nor closed compilation supplies approval.
export const publicationWorkerOutputCatalogueChecksum: string | undefined =
  undefined;

/** Includes the private binding's complete columns, constraints and deferred
 * cleanup trigger, not merely its grants or the public writer's definition. */
export const publicationWorkerOutputCatalogueQuery = `WITH roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname IN('creator_w3_publication_output','creator_fulfillment_publication_worker','creator_publication_worker')
), relations AS (
 SELECT c.oid,c.relname,c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relispartition
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='creator' AND c.relname IN('publication_worker_system_binding','thread','message','event')
) SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname) FROM roles r),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
  'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
  ORDER BY pg_get_userbyid(m.roleid),pg_get_userbyid(m.member)) FROM pg_auth_members m WHERE m.roleid IN(SELECT oid FROM roles) OR m.member IN(SELECT oid FROM roles)),
 'settings',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(s.setrole),'configuration',s.setconfig,
  'database',CASE WHEN s.setdatabase=0 THEN 'all' WHEN s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current' ELSE 'other' END)
  ORDER BY pg_get_userbyid(s.setrole),s.setdatabase) FROM pg_db_role_setting s WHERE s.setrole IN(SELECT oid FROM roles)),
 'dependencies',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.refobjid),'kind',d.deptype,
  'type',a.type,'names',a.object_names,'arguments',a.object_args) ORDER BY pg_get_userbyid(d.refobjid),d.deptype,a.type,a.object_names,a.object_args)
  FROM pg_shdepend d CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
  WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM roles) AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition',pg_get_functiondef(p.oid),'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
   ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,g.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE CASE WHEN n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
   THEN p.proowner IN(SELECT oid FROM roles) OR EXISTS(SELECT FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')) ELSE false END),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',r.relname,'owner',pg_get_userbyid(r.relowner),'kind',r.relkind,
  'rls',r.relrowsecurity,'forced',r.relforcerowsecurity,'partition',r.relispartition,
  'inheritance',(SELECT jsonb_agg(jsonb_build_object('parent',i.inhparent::regclass::text,'order',i.inhseqno) ORDER BY i.inhseqno) FROM pg_inherits i WHERE i.inhrelid=r.oid),
  'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid),'validated',c.convalidated,
   'deferrable',c.condeferrable,'deferred',c.condeferred) ORDER BY c.conname) FROM pg_constraint c WHERE c.conrelid=r.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,
   'definition',pg_get_indexdef(i.indexrelid)) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=r.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal)) ORDER BY r.relname) FROM relations r)
) AS catalogue`;

/** Metadata only on the actual W1-held client. W4 owns recipient/delivery
 * proofs and its final ending bridge; W1 alone owns ending/COMMIT. */
export async function assertPublicationWorkerOutputCatalogue(
  client: PoolClient,
): Promise<void> {
  try {
    if (
      requestAuthority.getStore() ||
      !publicationWorkerOutputCatalogueChecksum
    )
      throw new Error("Original publication output review is pending");
    await assertRegisteredMigration(client, publicationWorkerOutputSource);
    await client.query("SAVEPOINT w3_publication_system_catalogue");
    await client.query("SET LOCAL search_path=pg_catalog");
    const output = await generationConsumerCatalogue(
      client,
      "creator_w3_publication_output",
    );
    const worker = await generationConsumerCatalogue(
      client,
      "creator_publication_worker",
    );
    const fulfillment = await generationConsumerCatalogue(
      client,
      "creator_fulfillment_publication_worker",
    );
    const catalogue = (
      await client.query<{ catalogue: unknown }>(
        publicationWorkerOutputCatalogueQuery,
      )
    ).rows[0]?.catalogue;
    if (
      contentHash({ output, worker, fulfillment, catalogue }) !==
      publicationWorkerOutputCatalogueChecksum
    )
      throw new Error("Original publication output catalogue changed");
    // Uncertain/failed reads escape to W1 custody without another command.
    await client.query("ROLLBACK TO SAVEPOINT w3_publication_system_catalogue");
    await client.query("RELEASE SAVEPOINT w3_publication_system_catalogue");
  } catch (cause) {
    const failure = new DomainError(
      "publication_output_unconfigured",
      "Reviewed original publication output is unavailable.",
      503,
    );
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
    throw failure;
  }
}
