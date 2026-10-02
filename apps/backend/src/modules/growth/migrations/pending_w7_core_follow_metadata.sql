-- W7 proposal only: UNNUMBERED, UNREGISTERED, UNAPPLIED. W8/W1 must review
-- narrow cross-owner metadata custody. W8 reserved HELD0101 metadata only;
-- W7 must not apply it above the human's0044-0060 activation ceiling.
-- Caller already holds genuine W1/W8 current audience/negative family gates;
-- this fixed Boolean read neither issues a scope nor authorizes content.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_growth_follow_metadata') THEN
  CREATE ROLE creator_growth_follow_metadata NOLOGIN NOINHERIT NOSUPERUSER
    NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_growth_follow_metadata'
    AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls)
    OR EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_growth_follow_metadata'
      AND r.rolconfig IS NOT NULL AND cardinality(r.rolconfig)>0)
    OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r
      ON r.oid=m.member OR r.oid=m.roleid WHERE r.rolname='creator_growth_follow_metadata')
    OR EXISTS(SELECT FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
      WHERE r.rolname='creator_growth_follow_metadata')
    OR EXISTS(SELECT FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
      WHERE r.rolname='creator_growth_follow_metadata')
    OR EXISTS(SELECT FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE r.rolname='creator_growth_follow_metadata')
 THEN RAISE EXCEPTION 'Unsafe core Follow metadata role'; END IF;
 IF NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='growth' AND c.relname='follow' AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'Forced Follow row security is required'; END IF;
 IF EXISTS(SELECT FROM pg_namespace n WHERE n.nspname='creator_growth_metadata'
     AND n.nspowner<>'growth_owner'::regrole::oid)
 THEN RAISE EXCEPTION 'Unsafe core Follow metadata namespace'; END IF;
 IF NOT EXISTS(SELECT FROM pg_namespace WHERE nspname='creator_growth_metadata') THEN
  CREATE SCHEMA creator_growth_metadata AUTHORIZATION growth_owner;
 END IF;
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='creator_growth_metadata')
    OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='creator_growth_metadata')
 THEN RAISE EXCEPTION 'Core Follow metadata namespace must be dedicated'; END IF;
END $$;

SET LOCAL ROLE creator_owner;
-- Exact session ownership/expiry/revocation only: no token/hash/cipher read.
-- Do not change this private bearer-resolution table's existing RLS behavior.
GRANT USAGE ON SCHEMA creator TO creator_growth_follow_metadata;
GRANT SELECT(id,account_id,revoked_at,expires_at) ON creator.identity_session TO creator_growth_follow_metadata;
RESET ROLE;
SET LOCAL ROLE growth_owner;
GRANT USAGE ON SCHEMA growth TO creator_growth_follow_metadata;
REVOKE ALL ON SCHEMA creator_growth_metadata FROM PUBLIC;
GRANT USAGE ON SCHEMA creator_growth_metadata TO creator_runtime;
GRANT USAGE,CREATE ON SCHEMA creator_growth_metadata TO creator_growth_follow_metadata;
GRANT SELECT(account_id,creator_id),UPDATE(created_at) ON growth.follow TO creator_growth_follow_metadata;
CREATE POLICY core_follow_metadata_select ON growth.follow FOR SELECT TO creator_growth_follow_metadata
 USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
-- PostgreSQL needs UPDATE on at least one column for FOR SHARE. Only the
-- unloginable/no-membership fixed-function owner receives this privilege.
CREATE POLICY core_follow_metadata_lock ON growth.follow FOR UPDATE TO creator_growth_follow_metadata
 USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid)
 WITH CHECK(false);
RESET ROLE;
SET LOCAL ROLE creator_growth_follow_metadata;
CREATE FUNCTION creator_growth_metadata.core_follow(s uuid,a uuid,c uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog SET row_security=on AS $$
DECLARE following boolean;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_growth_follow_metadata'
    OR current_setting('transaction_isolation')<>'read committed'
    OR pg_current_xact_id_if_assigned() IS NULL OR s IS NULL OR a IS NULL OR c IS NULL
    OR s IS DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid
    OR a IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
    OR c IS DISTINCT FROM nullif(current_setting('app.creator_id',true),'')::uuid
 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT FROM creator.identity_session
    WHERE id=s AND account_id=a AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN NULL; END IF;
 -- Exact primary-key pair, held to caller commit. Unfollow/account deletion
 -- waits on the same row. Never wait behind a writer after positive family locks.
 SELECT true INTO following FROM growth.follow
    WHERE account_id=a AND creator_id=c FOR SHARE NOWAIT;
 RETURN coalesce(following,false);
EXCEPTION WHEN lock_not_available OR invalid_text_representation THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION creator_growth_metadata.core_follow(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_growth_metadata.core_follow(uuid,uuid,uuid) TO creator_runtime;
RESET ROLE;
SET LOCAL ROLE growth_owner;
REVOKE CREATE ON SCHEMA creator_growth_metadata FROM creator_growth_follow_metadata;
RESET ROLE;
DO $$ DECLARE owner_id oid:='creator_growth_follow_metadata'::regrole::oid;
 function_id oid:=to_regprocedure('creator_growth_metadata.core_follow(uuid,uuid,uuid)');
BEGIN
 IF function_id IS NULL
   OR EXISTS(SELECT FROM pg_namespace n WHERE has_schema_privilege(owner_id,n.oid,'CREATE'))
   OR EXISTS(SELECT FROM pg_namespace n WHERE n.nspowner=owner_id)
   OR EXISTS(SELECT FROM pg_class c WHERE c.relowner=owner_id)
   OR EXISTS(SELECT FROM pg_proc p WHERE p.proowner=owner_id AND p.oid<>function_id)
   OR EXISTS(SELECT FROM pg_proc p,
     LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=function_id AND a.privilege_type='EXECUTE'
       AND a.grantee NOT IN(owner_id,'creator_runtime'::regrole::oid))
   OR EXISTS(SELECT FROM pg_attribute col JOIN pg_class rel ON rel.oid=col.attrelid
     JOIN pg_namespace n ON n.oid=rel.relnamespace
     WHERE col.attnum>0 AND NOT col.attisdropped AND rel.relkind IN('r','p','v','m','f')
       AND n.nspname IN('creator','growth') AND (
       (has_column_privilege(owner_id,rel.oid,col.attnum,'SELECT') AND NOT (
         (n.nspname='creator' AND rel.relname='identity_session' AND col.attname IN('id','account_id','revoked_at','expires_at'))
         OR(n.nspname='growth' AND rel.relname='follow' AND col.attname IN('account_id','creator_id'))))
       OR has_column_privilege(owner_id,rel.oid,col.attnum,'INSERT,REFERENCES')
       OR(has_column_privilege(owner_id,rel.oid,col.attnum,'UPDATE') AND NOT (
         n.nspname='growth' AND rel.relname='follow' AND col.attname='created_at'))))
   OR EXISTS(SELECT FROM pg_class rel JOIN pg_namespace n ON n.oid=rel.relnamespace
     WHERE n.nspname IN('creator','growth') AND rel.relkind IN('r','p','v','m','f')
       AND has_table_privilege(owner_id,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 THEN RAISE EXCEPTION 'Unsafe final core Follow metadata custody'; END IF;
END $$;
COMMIT;
