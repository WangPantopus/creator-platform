import { copy } from "@qelvora/copy";
import type { PoolClient } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";

/** Actual W8 registry receipt, never a fabricated purpose or family scope.
 * W8 reserved 0101; this descriptor does not register or activate its SQL. */
export interface CoreFollowMigration {
  version: string;
  checksum: string;
}
const Migration = z.strictObject({
  version: z.literal("0101_w7_core_follow_metadata"),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
});

function unavailable() {
  return new DomainError(
    "growth_core_follow_unconfigured",
    copy.growthErrorGrowthAuthorityRequired,
    503,
  );
}

/** Bounded Follow metadata on the real canonical core client. The caller must
 * first retain W1/W8's actual audience/family and negative gates on this same
 * transaction. This callback issues no Actor/scope/GUC or content permission.
 * W4's opaque source host separately enforces exact graph/pool custody. */
export function canonicalCoreContentFollows(registered?: CoreFollowMigration) {
  const migration = registered ? Migration.parse(registered) : null;
  return async (client: PoolClient, accountId: string, creatorId: string) => {
    z.uuid().parse(accountId);
    z.uuid().parse(creatorId);
    const authority = requestAuthority.getStore();
    if (!migration || !authority || authority.accountId !== accountId)
      throw unavailable();
    z.uuid().parse(authority.sessionId);
    const context = (
      await client.query<{
        account_id: string;
        creator_id: string;
        held: boolean;
        safe: boolean;
        fan: boolean;
      }>(
        `SELECT current_setting('app.account_id',true) AS account_id,
       current_setting('app.creator_id',true) AS creator_id,
       pg_current_xact_id_if_assigned() IS NOT NULL AND current_setting('transaction_isolation')='read committed' AS held,
       current_user='creator_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls
       AND NOT pg_has_role(current_user,'growth_runtime','MEMBER')
       AND NOT pg_has_role(current_user,'growth_worker','MEMBER')
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN('growth','creator') AND c.relowner=r.oid) AS safe,
       EXISTS(SELECT FROM creator.fan_profile f WHERE f.account_id=$1) AS fan
       FROM pg_roles r WHERE r.rolname=current_user`,
        [accountId],
      )
    ).rows[0];
    if (
      context?.account_id !== accountId ||
      context.creator_id !== creatorId ||
      !context.held ||
      !context.safe ||
      !context.fan
    )
      throw unavailable();
    await assertCurrentSession(client, accountId);
    const session = await client.query<{ id: string | null }>(
      "SELECT current_setting('app.identity_session_id',true) AS id",
    );
    if (session.rows[0]?.id !== authority.sessionId) throw unavailable();
    const schema = (
      await client.query<{ ready: boolean }>(
        `SELECT
       EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
         WHERE p.oid=to_regprocedure('creator_growth_metadata.core_follow(uuid,uuid,uuid)')
         AND p.prosecdef AND p.provolatile='v' AND p.prorettype='boolean'::regtype
         AND p.proconfig=ARRAY['search_path=pg_catalog','row_security=on']::text[]
         AND r.rolname='creator_growth_follow_metadata' AND NOT r.rolcanlogin
         AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
         AND NOT r.rolinherit AND NOT r.rolreplication
         AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
         AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
         AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class c WHERE c.relowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_proc other WHERE other.proowner=r.oid AND other.oid<>p.oid)
         AND has_function_privilege(current_user,p.oid,'EXECUTE')
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
           WHERE a.privilege_type='EXECUTE' AND a.grantee NOT IN(r.oid,'creator_runtime'::regrole::oid))
         AND NOT EXISTS(SELECT FROM pg_namespace n WHERE has_schema_privilege(r.oid,n.oid,'CREATE'))
         AND EXISTS(SELECT FROM pg_namespace n WHERE n.oid=p.pronamespace
           AND n.nspowner='growth_owner'::regrole::oid
           AND has_schema_privilege(current_user,n.oid,'USAGE')
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
             WHERE a.grantee=0 AND a.privilege_type IN('USAGE','CREATE')))
         AND NOT EXISTS(SELECT FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.oid<>p.oid)
         AND NOT EXISTS(SELECT FROM pg_class rel WHERE rel.relnamespace=p.pronamespace)
         AND NOT EXISTS(SELECT FROM pg_attribute col JOIN pg_class rel ON rel.oid=col.attrelid
           JOIN pg_namespace n ON n.oid=rel.relnamespace
           WHERE col.attnum>0 AND NOT col.attisdropped AND rel.relkind IN('r','p','v','m','f')
           AND n.nspname IN('creator','growth') AND (
             (has_column_privilege(r.oid,rel.oid,col.attnum,'SELECT') AND NOT (
               (n.nspname='creator' AND rel.relname='identity_session' AND col.attname IN('id','account_id','revoked_at','expires_at'))
               OR (n.nspname='growth' AND rel.relname='follow' AND col.attname IN('account_id','creator_id'))))
             OR has_column_privilege(r.oid,rel.oid,col.attnum,'INSERT,REFERENCES')
             OR (has_column_privilege(r.oid,rel.oid,col.attnum,'UPDATE') AND NOT (
               n.nspname='growth' AND rel.relname='follow' AND col.attname='created_at'))))
         AND NOT EXISTS(SELECT FROM pg_class rel JOIN pg_namespace n ON n.oid=rel.relnamespace
           WHERE n.nspname IN('creator','growth') AND rel.relkind IN('r','p','v','m','f')
           AND has_table_privilege(r.oid,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
         AND EXISTS(SELECT FROM pg_policy policy JOIN pg_class rel ON rel.oid=policy.polrelid
           JOIN pg_namespace n ON n.oid=rel.relnamespace WHERE n.nspname='growth' AND rel.relname='follow'
           AND policy.polname='core_follow_metadata_lock' AND policy.polcmd='w'
           AND policy.polroles=ARRAY[r.oid] AND pg_get_expr(policy.polwithcheck,policy.polrelid)='false'))
       AND EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='growth' AND c.relname='follow' AND c.relrowsecurity AND c.relforcerowsecurity)
       AS ready`,
        [migration.version, migration.checksum],
      )
    ).rows[0];
    if (!schema?.ready) throw unavailable();
    const row = (
      await client.query<{ following: boolean | null }>(
        "SELECT creator_growth_metadata.core_follow($1::uuid,$2::uuid,$3::uuid) AS following",
        [authority.sessionId, accountId, creatorId],
      )
    ).rows[0];
    if (typeof row?.following !== "boolean") throw unavailable();
    return row.following;
  };
}
