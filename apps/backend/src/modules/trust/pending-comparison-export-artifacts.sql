-- Pending source review only. No executable registry allocation or host wiring.
-- Retained exports derive their creator set from an original held W2/W3 export
-- scope, never from an interactive actor or a caller's list of creators.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF to_regclass('creator.conversation_comparison_sample') IS NULL
  OR to_regclass('creator.agent_privacy_export_scope') IS NULL
  OR to_regclass('creator.conversation_privacy_export_scope') IS NULL THEN
  RAISE EXCEPTION 'Original comparison and held export owners required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_artifact') THEN
  CREATE ROLE creator_comparison_artifact NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_artifact'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=to_regrole('creator_comparison_artifact')
  OR roleid=to_regrole('creator_comparison_artifact'))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_comparison_artifact'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
  AND refobjid=to_regrole('creator_comparison_artifact')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated comparison artifact role required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_comparison_artifact;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_comparison_artifact;
-- Prepared Trust consumers must verify the original executable ledger on
-- their own actual clients. These are metadata-only capabilities, not access
-- to Conversation/Agent contents or another role's held scope.
GRANT USAGE ON SCHEMA creator TO creator_trust_runtime,creator_trust_worker;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_trust_runtime,creator_trust_worker;

SET LOCAL ROLE creator_trust_owner;
CREATE TABLE creator_trust.comparison_export_artifact (
 snapshot_ref text PRIMARY KEY CHECK(length(snapshot_ref) BETWEEN 8 AND 200),
 job_id uuid NOT NULL,account_id uuid NOT NULL,
 domain text NOT NULL CHECK(domain IN('agent','conversation')),
 lease_token uuid NOT NULL,creator_ids uuid[] NOT NULL CHECK(cardinality(creator_ids)<=100),
 source_until timestamptz NOT NULL CHECK(isfinite(source_until)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,artifact jsonb,
 purge_token uuid,purge_until timestamptz,removed_at timestamptz,
 CHECK(isfinite(created_at) AND source_until>created_at),
 CHECK(artifact IS NULL OR jsonb_typeof(artifact)='object'),
 CHECK((purge_token IS NULL)=(purge_until IS NULL)),
 CHECK(removed_at IS NULL OR (artifact IS NOT NULL AND revoked_at IS NOT NULL)),
 UNIQUE(job_id,domain,snapshot_ref)
);
CREATE UNIQUE INDEX comparison_export_artifact_reference
 ON creator_trust.comparison_export_artifact((artifact->>'reference')) WHERE artifact IS NOT NULL;
CREATE INDEX comparison_export_artifact_creators ON creator_trust.comparison_export_artifact USING gin(creator_ids);
CREATE INDEX comparison_export_artifact_expiry ON creator_trust.comparison_export_artifact(source_until)
 WHERE removed_at IS NULL;
ALTER TABLE creator_trust.comparison_export_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.comparison_export_artifact FORCE ROW LEVEL SECURITY;
CREATE POLICY comparison_artifact_private ON creator_trust.comparison_export_artifact
 TO creator_comparison_artifact USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON creator_trust.comparison_export_artifact TO creator_comparison_artifact;
GRANT SELECT(id,account_id,kind,state,completed_at),UPDATE(id)
 ON creator_trust.privacy_job TO creator_comparison_artifact;
GRANT SELECT(job_id,domain,state,lease_token,lease_until,data),UPDATE(job_id)
 ON creator_trust.privacy_task TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_metadata ON creator_trust.privacy_job FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_lock ON creator_trust.privacy_job FOR UPDATE TO creator_comparison_artifact USING(true) WITH CHECK(false);
CREATE POLICY comparison_artifact_metadata ON creator_trust.privacy_task FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_lock ON creator_trust.privacy_task FOR UPDATE TO creator_comparison_artifact USING(true) WITH CHECK(false);

RESET ROLE;
GRANT SELECT ON creator.agent_privacy_export_scope,creator.conversation_privacy_export_scope TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_held_source ON creator.agent_privacy_export_scope
 FOR SELECT TO creator_comparison_artifact USING(pid=pg_backend_pid() AND xid=pg_current_xact_id_if_assigned() AND login=session_user);
CREATE POLICY comparison_artifact_held_source ON creator.conversation_privacy_export_scope
 FOR SELECT TO creator_comparison_artifact USING(pid=pg_backend_pid() AND xid=pg_current_xact_id_if_assigned() AND caller=session_user);
SET LOCAL ROLE creator_owner;
GRANT SELECT(creator_id),UPDATE(creator_id) ON creator.ai_workspace TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_workspace ON creator.ai_workspace FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_workspace_lock ON creator.ai_workspace FOR UPDATE TO creator_comparison_artifact USING(true) WITH CHECK(false);
-- No raw message, paraphrase, provider usage or publication grants. Results
-- are inspected only for emptiness when deriving their original 30-day bound;
-- no function exposes their contents.
GRANT SELECT(creator_id,thread_id,expires_at) ON creator.conversation_comparison_consent,creator.conversation_comparison_sample TO creator_comparison_artifact;
GRANT SELECT(creator_id,expires_at) ON creator.ai_shadow_sample TO creator_comparison_artifact;
GRANT SELECT(creator_id,created_at,results) ON creator.ai_shadow_evaluation TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_expiry ON creator.conversation_comparison_consent FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_expiry ON creator.conversation_comparison_sample FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_expiry ON creator.ai_shadow_sample FOR SELECT TO creator_comparison_artifact USING(true);
CREATE POLICY comparison_artifact_expiry ON creator.ai_shadow_evaluation FOR SELECT TO creator_comparison_artifact USING(true);
RESET ROLE;

CREATE FUNCTION creator_trust.capture_comparison_export(ref text,jid uuid,aid uuid,d text,token uuid)
RETURNS timestamptz LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source record; creators uuid[]; threads uuid[]; expiry timestamptz; previous record;
BEGIN
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR ref IS NULL OR length(ref) NOT BETWEEN 8 AND 200 OR jid IS NULL OR aid IS NULL OR token IS NULL
  OR d IS NULL OR d NOT IN('agent','conversation')
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='PENDING_W8_comparison_export_artifacts' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original held comparison export required' USING ERRCODE='42501'; END IF;
 IF d='agent' THEN
  SELECT * INTO source FROM creator.agent_privacy_export_scope WHERE pid=pg_backend_pid()
   AND xid=pg_current_xact_id_if_assigned() AND login=session_user AND job_id=jid AND lease_token=token
   AND nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid
   AND created_at>clock_timestamp()-interval '45 seconds' AND NOT exhausted;
  IF NOT FOUND OR source.binding->>'account_id' IS DISTINCT FROM aid::text THEN
   RAISE EXCEPTION 'Original held Agent source required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(v::uuid ORDER BY v),'{}') INTO creators FROM jsonb_array_elements_text(source.binding->'owned_creator_ids') v;
 ELSE
  SELECT * INTO source FROM creator.conversation_privacy_export_scope WHERE pid=pg_backend_pid()
   AND xid=pg_current_xact_id_if_assigned() AND caller=session_user AND job_id=jid AND lease_token=token;
  IF NOT FOUND OR source.binding->>'account_id' IS DISTINCT FROM aid::text THEN
   RAISE EXCEPTION 'Original held Conversation source required' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(DISTINCT (f->>'creatorId')::uuid ORDER BY (f->>'creatorId')::uuid),'{}'),
   coalesce(array_agg((f->>'threadId')::uuid),'{}') INTO creators,threads FROM jsonb_array_elements(source.families) f;
 END IF;
 PERFORM id FROM creator_trust.privacy_job WHERE id=jid AND account_id=aid AND kind='export'
  AND state NOT IN('complete','dead_letter') FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current original export job required' USING ERRCODE='42501'; END IF;
 PERFORM job_id FROM creator_trust.privacy_task WHERE job_id=jid AND domain=d AND state='running'
  AND lease_token=token AND lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current original export lease required' USING ERRCODE='42501'; END IF;
 -- Matches source invalidation's workspace lock. It cannot acknowledge a
 -- withdrawal concurrently with capture, or let a stale export seal afterward.
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=ANY(creators) ORDER BY creator_id FOR SHARE NOWAIT;
 IF (SELECT count(*) FROM creator.ai_workspace WHERE creator_id=ANY(creators))<>cardinality(creators) THEN
  RAISE EXCEPTION 'Original comparison serialization owner required' USING ERRCODE='42501'; END IF;
 SELECT least(clock_timestamp()+interval '7 days',min(until_at)) INTO expiry FROM (
  SELECT expires_at AS until_at FROM creator.conversation_comparison_consent
   WHERE creator_id=ANY(creators) AND (d='agent' OR thread_id=ANY(threads))
  UNION ALL SELECT expires_at FROM creator.conversation_comparison_sample
   WHERE creator_id=ANY(creators) AND (d='agent' OR thread_id=ANY(threads))
  UNION ALL SELECT expires_at FROM creator.ai_shadow_sample WHERE d='agent' AND creator_id=ANY(creators)
  UNION ALL SELECT created_at+interval '30 days' FROM creator.ai_shadow_evaluation
   WHERE d='agent' AND creator_id=ANY(creators) AND results<>'[]'::jsonb
 ) lifetimes;
 IF expiry<=clock_timestamp() THEN RAISE EXCEPTION 'Expired comparison data needs its physical purge' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM creator_trust.comparison_export_artifact WHERE snapshot_ref=ref FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF previous.job_id<>jid OR previous.account_id<>aid OR previous.domain<>d OR previous.lease_token<>token
   OR previous.creator_ids<>creators OR previous.revoked_at IS NOT NULL OR previous.source_until<=clock_timestamp()
   OR previous.artifact IS NOT NULL THEN
   RAISE EXCEPTION 'Original comparison export capture changed' USING ERRCODE='42501'; END IF;
  RETURN previous.source_until;
 END IF;
 INSERT INTO creator_trust.comparison_export_artifact(snapshot_ref,job_id,account_id,domain,lease_token,creator_ids,source_until)
 VALUES(ref,jid,aid,d,token,creators,expiry);
 RETURN expiry;
END $$;

CREATE FUNCTION creator_trust.invalidate_comparison_exports()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP<>'DELETE' OR TG_TABLE_SCHEMA<>'creator'
  OR TG_TABLE_NAME NOT IN('conversation_comparison_consent','conversation_comparison_sample')
  OR session_user NOT IN('creator_runtime','creator_trust_worker')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='PENDING_W8_comparison_export_artifacts' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original comparison withdrawal required' USING ERRCODE='42501'; END IF;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=OLD.creator_id FOR UPDATE NOWAIT;
 UPDATE creator_trust.comparison_export_artifact SET revoked_at=clock_timestamp()
  WHERE creator_ids @> ARRAY[OLD.creator_id] AND revoked_at IS NULL;
 RETURN OLD;
END $$;

-- After source COMMIT, record the exact sealed manifest even if a withdrawal
-- won that gap. False means purge, never task ACK or download. Late workers can
-- only attach to their own original capture; they cannot replace its manifest.
CREATE FUNCTION creator_trust.seal_comparison_export(ref text,token uuid,manifest jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved record; current_lease boolean;
BEGIN
 IF session_user<>'creator_trust_worker' OR token IS NULL OR jsonb_typeof(manifest) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Original comparison artifact worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO saved FROM creator_trust.comparison_export_artifact WHERE snapshot_ref=ref AND lease_token=token FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original comparison capture required' USING ERRCODE='42501'; END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(manifest) k) IS DISTINCT FROM
   ARRAY['accountId','bytes','chunks','contentType','domain','expiresAt','format','jobId','reference','sha256','snapshotRef']::text[]
  OR EXISTS(SELECT FROM jsonb_each(manifest) v WHERE v.key NOT IN('bytes','chunks') AND jsonb_typeof(v.value)<>'string')
  OR manifest->>'format' IS DISTINCT FROM 'privacy-stream-v1'
  OR manifest->>'jobId' IS DISTINCT FROM saved.job_id::text OR manifest->>'accountId' IS DISTINCT FROM saved.account_id::text
  OR manifest->>'domain' IS DISTINCT FROM saved.domain OR manifest->>'snapshotRef' IS DISTINCT FROM ref
  OR (manifest->>'reference')::uuid IS NULL OR manifest->>'sha256' !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(manifest->'bytes') IS DISTINCT FROM 'number' OR manifest->>'bytes' !~ '^[0-9]+$'
  OR (manifest->>'bytes')::numeric>1073741824
  OR jsonb_typeof(manifest->'chunks') IS DISTINCT FROM 'number' OR manifest->>'chunks' !~ '^[0-9]+$'
  OR (manifest->>'chunks')::numeric>1073741824
  OR manifest->>'contentType' NOT IN('application/x-ndjson','application/zip','application/octet-stream')
  OR NOT isfinite((manifest->>'expiresAt')::timestamptz)
  OR (manifest->>'expiresAt')::timestamptz>clock_timestamp()+interval '7 days'
  OR (saved.artifact IS NOT NULL AND saved.artifact<>manifest)
 THEN RAISE EXCEPTION 'Exact original sealed manifest required' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
  WHERE j.id=saved.job_id AND j.account_id=saved.account_id AND j.kind='export' AND j.state<>'dead_letter'
   AND t.domain=saved.domain AND t.lease_token=token
   AND ((t.state='running' AND t.lease_until>clock_timestamp()) OR (t.state='complete' AND t.data=manifest))) INTO current_lease;
 UPDATE creator_trust.comparison_export_artifact SET artifact=manifest,
  revoked_at=CASE WHEN NOT current_lease OR source_until<=clock_timestamp() OR (manifest->>'expiresAt')::timestamptz<=clock_timestamp()
   THEN coalesce(revoked_at,clock_timestamp()) ELSE revoked_at END WHERE snapshot_ref=ref RETURNING * INTO saved;
 RETURN saved.revoked_at IS NULL;
END $$;

CREATE FUNCTION creator_trust.current_comparison_export(jid uuid,aid uuid,d text,ref text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_runtime' OR aid IS NULL
  OR nullif(current_setting('app.account_id',true),'')::uuid IS DISTINCT FROM aid THEN RETURN false; END IF;
 RETURN EXISTS(SELECT FROM creator_trust.comparison_export_artifact a
  JOIN creator_trust.privacy_job j ON j.id=a.job_id JOIN creator_trust.privacy_task t ON t.job_id=j.id AND t.domain=a.domain
  WHERE a.snapshot_ref=ref AND a.job_id=jid AND a.account_id=aid AND a.domain=d
   AND a.revoked_at IS NULL AND a.removed_at IS NULL AND a.source_until>clock_timestamp()
   AND a.artifact IS NOT NULL AND (a.artifact->>'expiresAt')::timestamptz>clock_timestamp()
   AND j.account_id=aid AND j.kind='export' AND j.state='complete' AND j.completed_at>clock_timestamp()-interval '7 days'
   AND t.state='complete' AND t.data=a.artifact);
END $$;

-- The original worker's actual task acknowledgment also owns this boundary.
-- A seal result from before withdrawal/expiry cannot authorize a later COMMIT.
CREATE FUNCTION creator_trust.finish_comparison_export_task()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; saved record;
BEGIN
 IF TG_TABLE_SCHEMA<>'creator_trust' OR TG_TABLE_NAME<>'privacy_task' OR TG_OP<>'UPDATE' THEN
  RAISE EXCEPTION 'Original privacy acknowledgment required' USING ERRCODE='42501'; END IF;
 IF NEW.domain NOT IN('agent','conversation') OR NEW.state<>'complete' THEN RETURN NULL; END IF;
 SELECT account_id INTO account FROM creator_trust.privacy_job WHERE id=NEW.job_id AND kind='export';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF session_user<>'creator_trust_worker' OR current_query() !~* '^\s*COMMIT\s*;?\s*$' THEN
  RAISE EXCEPTION 'Actual original export acknowledgment COMMIT required' USING ERRCODE='42501'; END IF;
 SELECT * INTO saved FROM creator_trust.comparison_export_artifact
  WHERE snapshot_ref=NEW.data->>'snapshotRef' AND job_id=NEW.job_id AND account_id=account
   AND domain=NEW.domain AND lease_token=NEW.lease_token AND artifact=NEW.data
   AND revoked_at IS NULL AND removed_at IS NULL AND source_until>clock_timestamp()
   AND (artifact->>'expiresAt')::timestamptz>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current original comparison artifact required at COMMIT' USING ERRCODE='42501'; END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION creator_trust.claim_comparison_export_purge(batch integer)
RETURNS TABLE(snapshot_ref text,token uuid,manifest jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_worker' OR batch IS NULL OR batch NOT BETWEEN 1 AND 20 THEN
  RAISE EXCEPTION 'Bounded comparison artifact purge worker required' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH picked AS MATERIALIZED(
  SELECT a.snapshot_ref FROM creator_trust.comparison_export_artifact a WHERE a.removed_at IS NULL AND a.artifact IS NOT NULL
   AND (a.revoked_at IS NOT NULL OR a.source_until<=clock_timestamp() OR (a.artifact->>'expiresAt')::timestamptz<=clock_timestamp())
   AND (a.purge_until IS NULL OR a.purge_until<=clock_timestamp()) ORDER BY a.created_at,a.snapshot_ref LIMIT batch FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE creator_trust.comparison_export_artifact a SET revoked_at=coalesce(a.revoked_at,clock_timestamp()),
   purge_token=gen_random_uuid(),purge_until=clock_timestamp()+interval '30 seconds'
  FROM picked p WHERE a.snapshot_ref=p.snapshot_ref RETURNING a.snapshot_ref,a.purge_token,a.artifact
 ) SELECT * FROM claimed;
END $$;

CREATE FUNCTION creator_trust.finish_comparison_export_purge(ref text,token uuid,manifest jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_worker' OR token IS NULL THEN
  RAISE EXCEPTION 'Original comparison artifact purge worker required' USING ERRCODE='42501'; END IF;
 UPDATE creator_trust.comparison_export_artifact SET removed_at=clock_timestamp(),purge_token=NULL,purge_until=NULL
  WHERE snapshot_ref=ref AND purge_token=token AND purge_until>clock_timestamp()
   AND artifact=manifest AND revoked_at IS NOT NULL AND removed_at IS NULL;
 RETURN FOUND;
END $$;

ALTER FUNCTION creator_trust.capture_comparison_export(text,uuid,uuid,text,uuid) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.invalidate_comparison_exports() OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.seal_comparison_export(text,uuid,jsonb) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.current_comparison_export(uuid,uuid,text,text) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.finish_comparison_export_task() OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.claim_comparison_export_purge(integer) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.finish_comparison_export_purge(text,uuid,jsonb) OWNER TO creator_comparison_artifact;
REVOKE ALL ON FUNCTION creator_trust.capture_comparison_export(text,uuid,uuid,text,uuid),
 creator_trust.invalidate_comparison_exports(),creator_trust.seal_comparison_export(text,uuid,jsonb),
 creator_trust.current_comparison_export(uuid,uuid,text,text),creator_trust.finish_comparison_export_task(),creator_trust.claim_comparison_export_purge(integer),
 creator_trust.finish_comparison_export_purge(text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.capture_comparison_export(text,uuid,uuid,text,uuid) TO creator_runtime;
GRANT EXECUTE ON FUNCTION creator_trust.seal_comparison_export(text,uuid,jsonb),creator_trust.claim_comparison_export_purge(integer),
 creator_trust.finish_comparison_export_purge(text,uuid,jsonb) TO creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.current_comparison_export(uuid,uuid,text,text) TO creator_trust_runtime;
CREATE TRIGGER comparison_export_consent_withdrawal AFTER DELETE ON creator.conversation_comparison_consent
 FOR EACH ROW EXECUTE FUNCTION creator_trust.invalidate_comparison_exports();
CREATE TRIGGER comparison_export_sample_withdrawal AFTER DELETE ON creator.conversation_comparison_sample
 FOR EACH ROW EXECUTE FUNCTION creator_trust.invalidate_comparison_exports();
CREATE CONSTRAINT TRIGGER comparison_export_task_current AFTER UPDATE ON creator_trust.privacy_task
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (NEW.domain IN('agent','conversation') AND NEW.state='complete')
 EXECUTE FUNCTION creator_trust.finish_comparison_export_task();
COMMIT;
