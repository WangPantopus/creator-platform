-- W7 proposal only: UNNUMBERED, UNREGISTERED, UNAPPLIED. W8/W1 must review
-- narrow cross-owner metadata custody and allocate within0044-0060 first.
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
    OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r
      ON r.oid=m.member OR r.oid=m.roleid WHERE r.rolname='creator_growth_follow_metadata')
    OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname='creator_growth_follow_metadata'
      AND n.nspname IN('creator','growth'))
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
    OR a IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
    OR c IS DISTINCT FROM nullif(current_setting('app.creator_id',true),'')::uuid
    OR nullif(current_setting('app.fan_id',true),'') IS NULL
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
COMMIT;
