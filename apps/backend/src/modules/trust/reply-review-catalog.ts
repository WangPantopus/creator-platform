import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

export const replyReviewMigration = Object.freeze({
  version: "0156_w8_reply_review",
  checksum: "65a86e17256a872bcbf640006274512a29e3bda31232838c68fe3aa5df2a958a",
});
const purpose = "creator_trust_reply_projection";
// Filled only from the closed, rollback-contained original SQL qualification.
const catalogueChecksum =
  "2f477720a8ab473540e541dd3e15a7433bcd023e58b0aed586ca57a5003c1664";

function unavailable(): never {
  throw new DomainError(
    "reply_review_unavailable",
    "Reply review is unavailable. This reply stays pending.",
    503,
  );
}

/** Metadata only, for closed source review. No request, case access, source body
 * or decision is issued. Keep caller search_path and transaction state intact. */
export async function replyReviewPurposeCatalogue(client: PoolClient) {
  await client.query("SAVEPOINT w8_reply_review_catalog");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose);
    const role = (
      await client.query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
         rolreplication,rolbypassrls,rolconfig,
         EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS memberships,
         EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
         FROM pg_roles r WHERE rolname=$1`,
        [purpose],
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
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind='f'
          AND (p.proowner=to_regrole($1) OR p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE'))
         ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [purpose],
      )
    ).rows;
    const tables = (
      await client.query(
        `SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relkind,c.relispartition,
         c.relrowsecurity,c.relforcerowsecurity,
         ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,acldefault('r',c.relowner))) a
          ORDER BY a::text COLLATE "C") AS grants,
         (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
           'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
           'identity',a.attidentity,'generated',a.attgenerated,
           'default',pg_get_expr(d.adbin,d.adrelid),'inherited',a.attinhcount,
           'collation',a.attcollation::regcollation::text) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
         (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'validated',k.convalidated,
           'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname)
          FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
         (SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,
           'ready',x.indisready,'live',x.indislive,'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname)
          FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid) AS indexes,
         (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
           'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
          FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator_trust' AND c.relname IN('reply_review','reply_review_decision')
         ORDER BY c.relname`,
      )
    ).rows;
    const caseKinds = (
      await client.query(
        `SELECT k.convalidated,pg_get_constraintdef(k.oid) AS definition
         FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator_trust' AND c.relname='safety_case'
          AND k.conname='safety_case_kind_check'`,
      )
    ).rows;
    return { permissions, role, dependencies, executables, tables, caseKinds };
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT w8_reply_review_catalog");
    await client.query("RELEASE SAVEPOINT w8_reply_review_catalog");
  }
}

/** Closed metadata qualification only; application callers also need the active
 * executable registry and their original request/case authority below. */
export async function assertReplyReviewPurposeCatalog(client: PoolClient) {
  try {
    if (
      contentHash(await replyReviewPurposeCatalogue(client)) !==
      catalogueChecksum
    )
      unavailable();
  } catch {
    unavailable();
  }
}

export async function assertReplyReviewCatalog(client: PoolClient) {
  try {
    const active = await registeredMigration({
      name: "w8_reply_review",
      path: "apps/backend/migrations/0069_w8_reply_review.sql",
      owner: "W8",
      checksum: replyReviewMigration.checksum,
    });
    if (!active) unavailable();
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT current_user=session_user AND session_user IN('creator_runtime','creator_trust_runtime')
       AND current_setting('transaction_isolation')='read committed'
       AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
        AND NOT rolreplication AND rolconfig IS NULL)
       AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=to_regrole(current_user))
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole(current_user))
       AND creator_trust.reply_review_registered($1,$2) AS ready`,
        [active.version, active.checksum],
      )
    ).rows[0]?.ready;
    if (ready !== true) unavailable();
    await assertReplyReviewPurposeCatalog(client);
  } catch {
    unavailable();
  }
}
