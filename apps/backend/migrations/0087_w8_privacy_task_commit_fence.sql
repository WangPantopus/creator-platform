-- Reserved additive lifecycle authority. Requires0027; no interactive identity
-- or private domain capability is issued. Call before every domain lock.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_fence') THEN
  CREATE ROLE creator_privacy_fence NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_fence' AND
   NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND
   NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
     WHERE r.rolname='creator_privacy_fence')
 THEN RAISE EXCEPTION 'Privacy fence role must be isolated'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator_trust TO creator_privacy_fence;
GRANT SELECT(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,owned_creator_ids,ownership_ref),UPDATE(id)
 ON creator_trust.privacy_job TO creator_privacy_fence;
GRANT SELECT(job_id,domain,state,lease_token,lease_until),UPDATE(job_id)
 ON creator_trust.privacy_task TO creator_privacy_fence;
SET LOCAL ROLE creator_trust_owner;
CREATE POLICY privacy_fence_metadata ON creator_trust.privacy_job FOR SELECT TO creator_privacy_fence USING(true);
CREATE POLICY privacy_fence_lock ON creator_trust.privacy_job FOR UPDATE TO creator_privacy_fence USING(true) WITH CHECK(false);
CREATE POLICY privacy_fence_metadata ON creator_trust.privacy_task FOR SELECT TO creator_privacy_fence USING(true);
CREATE POLICY privacy_fence_lock ON creator_trust.privacy_task FOR UPDATE TO creator_privacy_fence USING(true) WITH CHECK(false);
CREATE TABLE creator_trust.privacy_commit_scope (
 pid integer NOT NULL, xid xid8 NOT NULL, caller name NOT NULL,
 job_id uuid NOT NULL, domain text NOT NULL, lease_token uuid NOT NULL,
 binding jsonb NOT NULL, PRIMARY KEY(pid,xid)
);
ALTER TABLE creator_trust.privacy_commit_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.privacy_commit_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY fence_private ON creator_trust.privacy_commit_scope TO creator_privacy_fence USING(true) WITH CHECK(true);
CREATE FUNCTION creator_trust.fence_privacy_task(jid uuid,aid uuid,k text,sc text,c uuid,t uuid,d text,token uuid)
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j record; leased record; binding jsonb; held record;
BEGIN
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation') NOT IN('read committed','repeatable read')
   OR jid IS NULL OR aid IS NULL OR token IS NULL OR k NOT IN('export','delete')
   OR sc NOT IN('account','creator','thread')
   OR d NOT IN('identity','conversation','agent','commerce','content','media','growth','trust')
   OR (nullif(current_setting('app.account_id',true),'') IS NOT NULL
     AND nullif(current_setting('app.account_id',true),'')::uuid<>aid)
   OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Actual lifecycle task required' USING ERRCODE='42501'; END IF;
 -- Retry takes the job first. Claim/ACK may hold the task; NOWAIT avoids any
 -- reversed-order wait while keeping both rows locked through domain COMMIT.
 SELECT id,account_id,kind,scope,creator_id,thread_id,verified_at,verification_ref,owned_creator_ids,ownership_ref
 INTO j FROM creator_trust.privacy_job WHERE id=jid AND account_id=aid AND kind=k AND scope=sc
   AND creator_id IS NOT DISTINCT FROM c AND thread_id IS NOT DISTINCT FROM t
   AND verified_at IS NOT NULL AND verification_ref<>'' AND state NOT IN('complete','dead_letter') FOR SHARE NOWAIT;
 IF NOT FOUND OR (sc='account' AND (j.ownership_ref IS NULL OR j.owned_creator_ids IS NULL
   OR cardinality(j.owned_creator_ids)>100))
 THEN RAISE EXCEPTION 'Lifecycle job unavailable' USING ERRCODE='42501'; END IF;
 SELECT job_id,domain,lease_token,lease_until INTO leased FROM creator_trust.privacy_task
   WHERE job_id=jid AND domain=d AND state='running' AND lease_token=token AND lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lifecycle lease unavailable' USING ERRCODE='42501'; END IF;
 binding := to_jsonb(j)||jsonb_build_object('lease_until',leased.lease_until);
 SELECT * INTO held FROM creator_trust.privacy_commit_scope WHERE pid=pg_backend_pid() AND xid=pg_current_xact_id();
 IF FOUND THEN
  IF held.caller<>session_user OR held.job_id<>jid OR held.domain<>d OR held.lease_token<>token OR held.binding<>binding
  THEN RAISE EXCEPTION 'Lifecycle transaction scope changed' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO creator_trust.privacy_commit_scope VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,jid,d,token,binding);
 END IF;
 RETURN CASE WHEN sc='account' THEN j.owned_creator_ids ELSE ARRAY[]::uuid[] END;
END $$;
CREATE FUNCTION creator_trust.finish_privacy_task_scope()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb;
BEGIN
 -- SET CONSTRAINTS must not turn a wall-clock commit check into an early check.
 -- Canonical domain operators issue a separate COMMIT statement on this client.
 IF current_query() !~* '^\s*COMMIT\s*;?\s*$'
   OR NEW.pid<>pg_backend_pid() OR NEW.xid<>pg_current_xact_id() OR NEW.caller<>session_user
 THEN RAISE EXCEPTION 'Lifecycle transaction mismatch' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('id',j.id,'account_id',j.account_id,'kind',j.kind,'scope',j.scope,
   'creator_id',j.creator_id,'thread_id',j.thread_id,'verified_at',j.verified_at,'verification_ref',j.verification_ref,
   'owned_creator_ids',j.owned_creator_ids,'ownership_ref',j.ownership_ref,'lease_until',t.lease_until)
 INTO binding FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
 WHERE j.id=NEW.job_id AND j.state NOT IN('complete','dead_letter') AND j.verified_at IS NOT NULL AND j.verification_ref<>''
   AND t.domain=NEW.domain AND t.state='running' AND t.lease_token=NEW.lease_token AND t.lease_until>clock_timestamp();
 IF NOT FOUND OR binding<>NEW.binding THEN
  RAISE EXCEPTION 'Lifecycle lease expired before domain commit' USING ERRCODE='23514';
 END IF;
 DELETE FROM creator_trust.privacy_commit_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid AND s.caller=NEW.caller
   AND s.job_id=NEW.job_id AND s.domain=NEW.domain AND s.lease_token=NEW.lease_token AND s.binding=NEW.binding;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lifecycle commit fence missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER privacy_task_commit_current AFTER INSERT ON creator_trust.privacy_commit_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator_trust.finish_privacy_task_scope();
RESET ROLE;
ALTER TABLE creator_trust.privacy_commit_scope OWNER TO creator_privacy_fence;
ALTER FUNCTION creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid) OWNER TO creator_privacy_fence;
ALTER FUNCTION creator_trust.finish_privacy_task_scope() OWNER TO creator_privacy_fence;
REVOKE ALL ON TABLE creator_trust.privacy_commit_scope FROM PUBLIC,creator_runtime,creator_trust_runtime,creator_trust_worker;
REVOKE ALL ON FUNCTION creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid),creator_trust.finish_privacy_task_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid) TO creator_runtime;
COMMIT;
