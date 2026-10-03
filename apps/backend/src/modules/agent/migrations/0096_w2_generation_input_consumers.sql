-- Held0096. W8 must review/register this exact source with0072/0093 and the
-- individually reviewed W1 executable consumer receipt before activation.
-- No runtime Actor/GUC, worker table grant, provider permission or licence
-- approval is supplied. Missing current positive authorities remain closed.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_input') THEN
  CREATE ROLE creator_w2_generation_input NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_input'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing W2 generation input custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'The genuine generation purpose is required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w2_generation_input;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid) TO creator_w2_generation_input;
SET LOCAL ROLE creator_owner;
-- Only the inaccessible function owner can see this current immutable tuple.
-- Original initiating session and current W8 negatives are rechecked by W1's
-- matches function before and after every protected reader operation.
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w2_generation_input;
CREATE POLICY w2_generation_input_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w2_generation_input USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
-- Project only current W2 input fields, never interview/raw source bodies,
-- signing data, W3 messages/memory or W4 grant/money tables.
GRANT SELECT(creator_id,live_version_id,paused,deleted_at,current_status),UPDATE(creator_id)
 ON creator.ai_workspace TO creator_w2_generation_input;
GRANT SELECT(creator_id) ON creator.ai_tombstone TO creator_w2_generation_input;
GRANT SELECT(creator_id,document),UPDATE(creator_id) ON creator.ai_license TO creator_w2_generation_input;
GRANT SELECT(id,creator_id,state,configuration,compiled_prefix,compiled_hash,source_set,pipeline_hash),UPDATE(id)
 ON creator.ai_version TO creator_w2_generation_input;
GRANT SELECT(id,creator_id,revision,content_hash,origin,origin_reference,audience,rights_evidence,reviewed_at,state,index_state,expires_at),UPDATE(id)
 ON creator.ai_source TO creator_w2_generation_input;
GRANT SELECT(id,creator_id,brand,aliases,expires_at,active),UPDATE(id)
 ON creator.ai_sponsor TO creator_w2_generation_input;
DO $$ DECLARE t text; predicate text; BEGIN
 predicate := 'creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_worker_scope s)';
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_tombstone','ai_license','ai_version','ai_source','ai_sponsor'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_input_read ON creator.%I FOR SELECT TO creator_w2_generation_input USING(%s)',t,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_license','ai_version','ai_source','ai_sponsor'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_input_lock ON creator.%I FOR UPDATE TO creator_w2_generation_input USING(%s) WITH CHECK(false)',t,predicate);
 END LOOP;
END $$;
CREATE FUNCTION creator.generation_agent_inputs(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; live uuid; version_data jsonb; license_data jsonb;
 sources jsonb; sponsors jsonb; status jsonb; result jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Current generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid;
 SELECT live_version_id,current_status INTO live,status FROM creator.ai_workspace
 WHERE creator_id=c AND NOT paused AND deleted_at IS NULL FOR SHARE NOWAIT;
 IF NOT FOUND OR live IS NULL OR EXISTS(SELECT FROM creator.ai_tombstone WHERE creator_id=c) THEN
  RAISE EXCEPTION 'Current Creator AI is paused or deleted' USING ERRCODE='55000';
 END IF;
 SELECT document INTO license_data FROM creator.ai_license WHERE creator_id=c FOR SHARE NOWAIT;
 IF license_data IS NULL OR license_data->>'state' IS DISTINCT FROM 'active'
  OR NOT coalesce(license_data->'permittedUses' ? 'text_ai',false)
  OR license_data->>'termEndsAt' IS NULL
  OR (license_data->>'termEndsAt')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'Current stored text licence is required' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('id',id,'compiledHash',compiled_hash,'pipelineHash',pipeline_hash,
  'configuration',configuration,'compiledPrefix',compiled_prefix,'sourceSet',source_set)
 INTO version_data FROM creator.ai_version WHERE creator_id=c AND id=live AND state='live' FOR SHARE NOWAIT;
 IF version_data IS NULL OR jsonb_typeof(version_data->'sourceSet') IS DISTINCT FROM 'array'
  OR jsonb_array_length(version_data->'sourceSet')>1000
  OR octet_length(version_data->>'compiledPrefix')>262144 THEN
  RAISE EXCEPTION 'Bounded current compiled version is required' USING ERRCODE='55000';
 END IF;
 -- Stable ordered locks and exact immutable revision/hash precede all source
 -- metadata. A candidate, unreviewed rights or a lost index is never approved.
 PERFORM s.id FROM creator.ai_source s WHERE s.creator_id=c AND s.id IN(
  SELECT (v->>'id')::uuid FROM jsonb_array_elements(version_data->'sourceSet') v
 ) ORDER BY s.id FOR SHARE NOWAIT;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(version_data->'sourceSet') v)
    <>jsonb_array_length(version_data->'sourceSet')
  OR EXISTS(SELECT FROM jsonb_array_elements(version_data->'sourceSet') v WHERE NOT EXISTS(
   SELECT FROM creator.ai_source s WHERE s.creator_id=c AND s.id=(v->>'id')::uuid
    AND s.revision=(v->>'revision')::integer AND s.content_hash=v->>'hash'
    AND s.state='approved' AND s.index_state='ready' AND s.reviewed_at IS NOT NULL
    AND length(s.rights_evidence)>=10 AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())
  )) THEN RAISE EXCEPTION 'A compiled source changed or is unavailable' USING ERRCODE='55000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'hash',s.content_hash,
  'origin',s.origin,'originReference',s.origin_reference,'audience',s.audience,'expiresAt',s.expires_at) ORDER BY s.id),'[]'::jsonb)
 INTO sources FROM creator.ai_source s WHERE s.creator_id=c AND s.id IN(
  SELECT (v->>'id')::uuid FROM jsonb_array_elements(version_data->'sourceSet') v);
 IF status IS NOT NULL AND (status->>'expiresAt')::timestamptz<=clock_timestamp() THEN status:=NULL; END IF;
 PERFORM id FROM creator.ai_sponsor WHERE creator_id=c AND active AND expires_at>clock_timestamp() ORDER BY id FOR SHARE NOWAIT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'brand',brand,'aliases',aliases,'expiresAt',expires_at) ORDER BY id),'[]'::jsonb)
 INTO sponsors FROM creator.ai_sponsor WHERE creator_id=c AND active AND expires_at>clock_timestamp();
 IF jsonb_array_length(sponsors)>64 THEN RAISE EXCEPTION 'Current sponsor set is too large' USING ERRCODE='55000'; END IF;
 result:=jsonb_build_object('creatorId',c,'creatorAccountId',(task->>'creatorAccountId')::uuid,
  'version',version_data,'license',license_data,'sources',sources,'status',status,'sponsors',sponsors);
 IF octet_length(result::text)>2097152 THEN RAISE EXCEPTION 'Current compiled inputs are too large' USING ERRCODE='55000'; END IF;
 IF NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Generation authority ended during the read' USING ERRCODE='42501';
 END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_agent_inputs(uuid,uuid) OWNER TO creator_w2_generation_input;
REVOKE ALL ON FUNCTION creator.generation_agent_inputs(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_agent_inputs(uuid,uuid) TO creator_generation_worker;
-- W8 owns ledger/checksum registration. No held migration is inserted here.
COMMIT;
