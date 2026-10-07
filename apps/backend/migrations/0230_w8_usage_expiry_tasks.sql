-- Held W8 expiry purpose. Jobs derive only from genuinely due known W2 usage.
-- This source does not detach creator accounts or activate itself.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_usage_expiry') THEN
  CREATE ROLE creator_usage_expiry NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_usage_expiry'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid) WHERE r.rolname='creator_usage_expiry')
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_usage_expiry'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=to_regrole('creator_usage_expiry')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated usage expiry purpose required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_usage_expiry;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,creator_id,created_at,cost_micros,accounting_retained_until,accounting_retention_version)
 ON creator.ai_usage TO creator_usage_expiry;
GRANT SELECT(id,account_id) ON creator.creator_profile TO creator_usage_expiry;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_usage_expiry;
CREATE POLICY usage_expiry_metadata ON creator.ai_usage FOR SELECT TO creator_usage_expiry USING(true);
CREATE POLICY usage_expiry_owner_metadata ON creator.creator_profile FOR SELECT TO creator_usage_expiry USING(true);
RESET ROLE;

SET LOCAL ROLE creator_trust_owner;
CREATE TABLE creator_trust.usage_expiry_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid,account_id uuid,
 policy_version text NOT NULL CHECK(policy_version='w8-product-retention-20261007-v2'),
 original_due_at timestamptz NOT NULL CHECK(isfinite(original_due_at)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','running','complete')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,lease_until timestamptz,completed_at timestamptz,error_code text,
 expired_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
 CHECK(cardinality(expired_ids)<=2000 AND array_position(expired_ids,NULL) IS NULL),
 CHECK(error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,80}$'),
 CONSTRAINT usage_expiry_job_state CHECK (
  (state='complete' AND creator_id IS NULL AND account_id IS NULL AND completed_at IS NOT NULL
   AND lease_token IS NULL AND lease_until IS NULL AND error_code IS NULL)
  OR (state<>'complete' AND creator_id IS NOT NULL AND account_id IS NOT NULL AND completed_at IS NULL
   AND ((state='pending' AND lease_token IS NULL AND lease_until IS NULL AND cardinality(expired_ids)=0)
    OR (state='running' AND lease_token IS NOT NULL AND lease_until IS NOT NULL))))
);
CREATE UNIQUE INDEX usage_expiry_one_active ON creator_trust.usage_expiry_job(creator_id,policy_version) WHERE state<>'complete';
CREATE INDEX usage_expiry_ready ON creator_trust.usage_expiry_job(available_at,id) WHERE state<>'complete';
CREATE TABLE creator_trust.usage_expiry_scope (
 pid integer NOT NULL,xid xid8 NOT NULL,caller name NOT NULL,job_id uuid NOT NULL,lease_token uuid NOT NULL,
 creator_id uuid NOT NULL,account_id uuid NOT NULL,policy_version text NOT NULL,original_due_at timestamptz NOT NULL,
 PRIMARY KEY(pid,xid)
);
ALTER TABLE creator_trust.usage_expiry_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.usage_expiry_job FORCE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.usage_expiry_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.usage_expiry_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY expiry_private ON creator_trust.usage_expiry_job TO creator_usage_expiry USING(true) WITH CHECK(true);
CREATE POLICY expiry_private ON creator_trust.usage_expiry_scope TO creator_usage_expiry USING(true) WITH CHECK(true);
RESET ROLE;
ALTER TABLE creator_trust.usage_expiry_job OWNER TO creator_usage_expiry;
ALTER TABLE creator_trust.usage_expiry_scope OWNER TO creator_usage_expiry;
REVOKE ALL ON creator_trust.usage_expiry_job,creator_trust.usage_expiry_scope FROM PUBLIC,creator_runtime,creator_trust_runtime,creator_trust_worker;

CREATE FUNCTION creator_trust.usage_expiry_registered(version text,checksum text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user IN('creator_runtime','creator_trust_worker') AND current_user='creator_usage_expiry'
  AND version ~ '^[0-9]{4}_w8_usage_expiry_tasks$' AND checksum ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM creator.schema_migration m WHERE m.version=$1 AND m.checksum=$2)
$$;

CREATE FUNCTION creator_trust.claim_usage_expiry_tasks(n integer)
RETURNS TABLE(job_id uuid,creator_id uuid,account_id uuid,policy_version text,lease_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_worker' OR current_user<>'creator_usage_expiry'
  OR n IS NULL OR n<1 OR n>64 OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Original expiry worker required' USING ERRCODE='42501'; END IF;
 INSERT INTO creator_trust.usage_expiry_job(creator_id,account_id,policy_version,original_due_at)
 SELECT u.creator_id,p.account_id,u.accounting_retention_version,min(u.accounting_retained_until)
 FROM creator.ai_usage u JOIN creator.creator_profile p ON p.id=u.creator_id
 WHERE u.accounting_retention_version='w8-product-retention-20261007-v2'
  AND u.accounting_retained_until<=clock_timestamp() AND isfinite(u.accounting_retained_until)
  AND u.cost_micros IS NOT NULL AND u.created_at<date_trunc('day',clock_timestamp())
  AND NOT EXISTS(SELECT FROM creator_trust.usage_expiry_job j WHERE j.creator_id=u.creator_id
   AND j.policy_version=u.accounting_retention_version AND j.state<>'complete')
 GROUP BY u.creator_id,p.account_id,u.accounting_retention_version
 ORDER BY min(u.accounting_retained_until),u.creator_id LIMIT n
 ON CONFLICT DO NOTHING;
 RETURN QUERY WITH picked AS (
  SELECT j.id FROM creator_trust.usage_expiry_job j
  WHERE (j.state='pending' AND j.available_at<=clock_timestamp())
   OR (j.state='running' AND j.lease_until<=clock_timestamp())
  ORDER BY j.available_at,j.id LIMIT n FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE creator_trust.usage_expiry_job j SET state='running',attempts=j.attempts+1,
   lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',error_code=NULL
  FROM picked WHERE j.id=picked.id RETURNING j.*
 ) SELECT j.id,j.creator_id,j.account_id,j.policy_version,j.lease_token FROM claimed j;
END $$;

CREATE FUNCTION creator_trust.fence_usage_expiry(jid uuid,token uuid,c uuid,a uuid,policy text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j creator_trust.usage_expiry_job%ROWTYPE; held creator_trust.usage_expiry_scope%ROWTYPE;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_usage_expiry'
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'')::uuid IS DISTINCT FROM c
  OR nullif(current_setting('app.account_id',true),'')::uuid IS DISTINCT FROM a
  OR policy IS DISTINCT FROM 'w8-product-retention-20261007-v2'
 THEN RAISE EXCEPTION 'Original held expiry client required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM creator_trust.usage_expiry_job q WHERE q.id=jid AND q.lease_token=token
  AND q.creator_id=c AND q.account_id=a AND q.policy_version=policy
  AND q.state='running' AND q.lease_until>clock_timestamp() AND q.original_due_at<=clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current persisted expiry lease required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator_trust.usage_expiry_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id();
 IF FOUND THEN
  IF ROW(held.caller,held.job_id,held.lease_token,held.creator_id,held.account_id,held.policy_version,held.original_due_at)
   IS DISTINCT FROM ROW(session_user,j.id,j.lease_token,j.creator_id,j.account_id,j.policy_version,j.original_due_at)
  THEN RAISE EXCEPTION 'Original expiry binding changed' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO creator_trust.usage_expiry_scope VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,j.id,j.lease_token,j.creator_id,j.account_id,j.policy_version,j.original_due_at);
 END IF;
END $$;

CREATE FUNCTION creator_trust.record_usage_expiry_delete()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator_trust.usage_expiry_scope%ROWTYPE;
BEGIN
 SELECT * INTO held FROM creator_trust.usage_expiry_scope s WHERE s.pid=pg_backend_pid()
  AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user;
 IF NOT FOUND THEN RETURN OLD; END IF;
 IF TG_OP<>'DELETE' OR TG_TABLE_SCHEMA<>'creator' OR TG_TABLE_NAME<>'ai_usage'
  OR OLD.creator_id IS DISTINCT FROM held.creator_id OR OLD.cost_micros IS NULL
  OR OLD.accounting_retention_version IS DISTINCT FROM held.policy_version
  OR OLD.accounting_retained_until IS NULL OR NOT isfinite(OLD.accounting_retained_until)
  OR OLD.accounting_retained_until>clock_timestamp() OR OLD.created_at>=date_trunc('day',clock_timestamp())
 THEN RAISE EXCEPTION 'Only original due known usage may expire' USING ERRCODE='23514'; END IF;
 UPDATE creator_trust.usage_expiry_job j SET expired_ids=array_append(j.expired_ids,OLD.id)
 WHERE j.id=held.job_id AND j.lease_token=held.lease_token AND j.state='running'
  AND j.lease_until>clock_timestamp() AND j.creator_id=held.creator_id AND j.account_id=held.account_id
  AND j.policy_version=held.policy_version AND j.original_due_at=held.original_due_at
  AND NOT OLD.id=ANY(j.expired_ids) AND cardinality(j.expired_ids)<2000;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original expiry receipt binding changed' USING ERRCODE='23514'; END IF;
 RETURN OLD;
END $$;

CREATE FUNCTION creator_trust.finish_usage_expiry_scope()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_query() !~* '^\s*COMMIT\s*;?\s*$' OR NEW.pid<>pg_backend_pid()
  OR NEW.xid<>pg_current_xact_id() OR NEW.caller<>session_user
 THEN RAISE EXCEPTION 'Separate original expiry COMMIT required' USING ERRCODE='23514'; END IF;
 UPDATE creator_trust.usage_expiry_job j SET state='complete',creator_id=NULL,account_id=NULL,
  lease_token=NULL,lease_until=NULL,completed_at=clock_timestamp(),error_code=NULL
 WHERE j.id=NEW.job_id AND j.lease_token=NEW.lease_token AND j.state='running'
  AND j.lease_until>clock_timestamp() AND j.creator_id=NEW.creator_id AND j.account_id=NEW.account_id
  AND j.policy_version=NEW.policy_version AND j.original_due_at=NEW.original_due_at;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original expiry lease ended before COMMIT' USING ERRCODE='23514'; END IF;
 DELETE FROM creator_trust.usage_expiry_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid
  AND s.caller=NEW.caller AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original expiry scope missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION creator_trust.retry_usage_expiry_task(jid uuid,token uuid,code text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_worker' OR current_user<>'creator_usage_expiry'
  OR code IS NULL OR code !~ '^[a-z0-9_]{1,80}$'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Original expiry worker required' USING ERRCODE='42501'; END IF;
 UPDATE creator_trust.usage_expiry_job j SET state='pending',lease_token=NULL,lease_until=NULL,
  error_code=code,available_at=clock_timestamp()+interval '1 minute'
 WHERE j.id=jid AND j.lease_token=token AND j.state='running' AND cardinality(j.expired_ids)=0;
 RETURN FOUND;
END $$;

CREATE TRIGGER usage_expiry_actual_delete AFTER DELETE ON creator.ai_usage
 FOR EACH ROW EXECUTE FUNCTION creator_trust.record_usage_expiry_delete();
CREATE CONSTRAINT TRIGGER usage_expiry_commit_current AFTER INSERT ON creator_trust.usage_expiry_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator_trust.finish_usage_expiry_scope();
ALTER FUNCTION creator_trust.claim_usage_expiry_tasks(integer) OWNER TO creator_usage_expiry;
ALTER FUNCTION creator_trust.usage_expiry_registered(text,text) OWNER TO creator_usage_expiry;
ALTER FUNCTION creator_trust.fence_usage_expiry(uuid,uuid,uuid,uuid,text) OWNER TO creator_usage_expiry;
ALTER FUNCTION creator_trust.record_usage_expiry_delete() OWNER TO creator_usage_expiry;
ALTER FUNCTION creator_trust.finish_usage_expiry_scope() OWNER TO creator_usage_expiry;
ALTER FUNCTION creator_trust.retry_usage_expiry_task(uuid,uuid,text) OWNER TO creator_usage_expiry;
REVOKE ALL ON FUNCTION creator_trust.usage_expiry_registered(text,text),creator_trust.claim_usage_expiry_tasks(integer),creator_trust.fence_usage_expiry(uuid,uuid,uuid,uuid,text),creator_trust.record_usage_expiry_delete(),creator_trust.finish_usage_expiry_scope(),creator_trust.retry_usage_expiry_task(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.usage_expiry_registered(text,text) TO creator_runtime,creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.claim_usage_expiry_tasks(integer),creator_trust.retry_usage_expiry_task(uuid,uuid,text) TO creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.fence_usage_expiry(uuid,uuid,uuid,uuid,text) TO creator_runtime;
COMMIT;
