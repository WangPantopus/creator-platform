-- Held W6 proposal: W8 owns review and ascending registry activation.
-- One exact call UUID yields process-private participant metadata only.
-- No document, recording, provider token, booking permission or worker scope.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_call_metadata') THEN
  CREATE ROLE creator_call_metadata NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_call_metadata'
   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
   AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
     WHERE r.rolname='creator_call_metadata')
 THEN RAISE EXCEPTION 'Isolated call metadata role required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_call_metadata;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_call_metadata;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_call_metadata;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_call_metadata;
GRANT SELECT(id,creator_id,fan_id,deleted_at) ON creator.thread TO creator_call_metadata;
GRANT SELECT(id,creator_id,fan_id,thread_id,commitment_id,state,version,revoked_at,hard_end_at)
 ON creator.call_session TO creator_call_metadata;
SET LOCAL ROLE creator_owner;
CREATE POLICY account_call_metadata ON creator.identity_session FOR SELECT TO creator_call_metadata USING(true);
CREATE POLICY account_call_metadata ON creator.creator_profile FOR SELECT TO creator_call_metadata USING(true);
CREATE POLICY account_call_metadata ON creator.fan_profile FOR SELECT TO creator_call_metadata USING(true);
CREATE POLICY account_call_metadata ON creator.thread FOR SELECT TO creator_call_metadata USING(true);
CREATE POLICY account_call_metadata ON creator.call_session FOR SELECT TO creator_call_metadata USING(true);
CREATE FUNCTION creator.account_call_metadata(call_id uuid)
RETURNS TABLE(session_id uuid,creator_id uuid,fan_id uuid,thread_id uuid,commitment_id uuid,
 creator_account_id uuid,fan_account_id uuid,metadata_version integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; request_session uuid;
BEGIN
 IF current_user<>'creator_call_metadata' OR session_user<>'creator_runtime'
   OR current_setting('transaction_isolation')<>'read committed' OR call_id IS NULL
   OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
   OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
   OR EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND
     (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
 THEN RETURN; END IF;
 caller:=nullif(current_setting('app.account_id',true),'')::uuid;
 request_session:=nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF caller IS NULL OR request_session IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session s
   WHERE s.id=request_session AND s.account_id=caller AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())
 THEN RETURN; END IF;
 -- Exact primary-key lookup, not an account directory. Team/triage is excluded.
 -- The caller must not expose this tuple until genuine held request,
 -- restoration, participant negatives, Access and current W4 booking succeed.
 RETURN QUERY SELECT cs.id,cs.creator_id,cs.fan_id,cs.thread_id,cs.commitment_id,
   cp.account_id,fp.account_id,cs.version
 FROM creator.call_session cs
 JOIN creator.thread t ON t.id=cs.thread_id AND t.creator_id=cs.creator_id AND t.fan_id=cs.fan_id
 JOIN creator.creator_profile cp ON cp.id=cs.creator_id
 JOIN creator.fan_profile fp ON fp.id=cs.fan_id
 WHERE cs.id=call_id AND cs.revoked_at IS NULL AND cs.version>0
   AND cs.state IN('scheduled','waiting','connecting','connected','reconnecting')
   AND cs.hard_end_at>clock_timestamp() AND t.deleted_at IS NULL
   AND cp.verification='verified' AND NOT cp.recovery_required AND caller IN(cp.account_id,fp.account_id)
   AND EXISTS(SELECT FROM creator.identity_session s WHERE s.id=request_session AND s.account_id=caller
     AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp());
EXCEPTION WHEN invalid_text_representation THEN RETURN;
END $$;
RESET ROLE;
ALTER FUNCTION creator.account_call_metadata(uuid) OWNER TO creator_call_metadata;
REVOKE ALL ON FUNCTION creator.account_call_metadata(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.account_call_metadata(uuid) TO creator_runtime;
COMMIT;
