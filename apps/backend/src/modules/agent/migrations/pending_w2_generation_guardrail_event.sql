-- Reserved0210. This fixed audit writer is held until W8 reviews the exact
-- executable, original W1 consumer registration, catalogue and C10 custody.
-- It supplies no Actor, provider, message, memory or financial authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_guardrail') THEN
  CREATE ROLE creator_w2_generation_guardrail NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_guardrail'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing generation guardrail custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_agent_inputs(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Original current generation and compiled input consumers are required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w2_generation_guardrail;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.generation_agent_inputs(uuid,uuid)
 TO creator_w2_generation_guardrail;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w2_generation_guardrail;
CREATE POLICY w2_generation_guardrail_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w2_generation_guardrail USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(creator_id,revision) ON creator.ai_workspace TO creator_w2_generation_guardrail;
CREATE POLICY w2_generation_guardrail_workspace ON creator.ai_workspace FOR SELECT TO creator_w2_generation_guardrail USING(
 creator_id=(SELECT (s.task->>'creatorId')::uuid FROM creator.generation_worker_scope s)
);
GRANT INSERT(id,creator_id,type,revision,payload),SELECT(id,creator_id,type,payload)
 ON creator.ai_event TO creator_w2_generation_guardrail;
CREATE POLICY w2_generation_guardrail_read ON creator.ai_event FOR SELECT TO creator_w2_generation_guardrail USING(
 creator_id=(SELECT (s.task->>'creatorId')::uuid FROM creator.generation_worker_scope s)
 AND id=(SELECT (s.task->>'generationId')::uuid FROM creator.generation_worker_scope s)
 AND type='ai.guardrail' AND payload->>'purpose'='generation_guardrail'
);
CREATE POLICY w2_generation_guardrail_write ON creator.ai_event FOR INSERT TO creator_w2_generation_guardrail WITH CHECK(
 creator_id=(SELECT (s.task->>'creatorId')::uuid FROM creator.generation_worker_scope s)
 AND id=(SELECT (s.task->>'generationId')::uuid FROM creator.generation_worker_scope s)
 AND type='ai.guardrail' AND payload->>'purpose'='generation_guardrail'
 AND payload->>'generationId'=id::text
 AND payload->>'threadId'=(SELECT s.task->>'threadId' FROM creator.generation_worker_scope s)
 AND payload->>'fanId'=(SELECT s.task->>'fanId' FROM creator.generation_worker_scope s)
);
CREATE FUNCTION creator.generation_record_agent_guardrail(g uuid,w uuid,category text,context_hash text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; facts jsonb; c uuid; revision integer; payload jsonb; stored jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the original current generation purpose' USING ERRCODE='42501';
 END IF;
 IF category IS NULL OR category NOT IN('never_reveal','impersonation','promise_or_sales','dependency','citation_invalid','output_policy')
  OR context_hash IS NULL OR context_hash!~'^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Use bounded guardrail metadata only' USING ERRCODE='22023';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Original generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 facts:=creator.generation_agent_inputs(g,w);
 c:=(task->>'creatorId')::uuid;
 IF facts->>'creatorId' IS DISTINCT FROM c::text OR facts->'version'->>'compiledHash' IS NULL
  OR facts->'version'->>'pipelineHash' IS NULL THEN
  RAISE EXCEPTION 'Current compiled input custody is required' USING ERRCODE='42501';
 END IF;
 SELECT a.revision INTO revision FROM creator.ai_workspace a WHERE a.creator_id=c;
 IF revision IS NULL THEN RAISE EXCEPTION 'Current workspace is unavailable' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_object('schemaVersion',1,'purpose','generation_guardrail','generationId',g,
  'threadId',task->>'threadId','fanId',task->>'fanId','category',category,
  'versionHash',facts->'version'->>'compiledHash','pipelineHash',facts->'version'->>'pipelineHash','contextHash',context_hash);
 -- The original generation id is the immutable one-event key. A retry may
 -- confirm this exact outcome, never overwrite an earlier category/provenance.
 INSERT INTO creator.ai_event(id,creator_id,type,revision,payload)
  VALUES(g,c,'ai.guardrail',revision,payload) ON CONFLICT(id) DO NOTHING;
 SELECT e.payload INTO stored FROM creator.ai_event e WHERE e.id=g AND e.creator_id=c AND e.type='ai.guardrail';
 IF stored IS DISTINCT FROM payload THEN
  RAISE EXCEPTION 'The original guardrail outcome changed' USING ERRCODE='55000';
 END IF;
 IF NOT creator.generation_scope_matches(g,w) OR creator.generation_agent_inputs(g,w) IS DISTINCT FROM facts THEN
  RAISE EXCEPTION 'Generation authority or compiled inputs ended during the audit' USING ERRCODE='42501';
 END IF;
 RETURN true;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_record_agent_guardrail(uuid,uuid,text,text) OWNER TO creator_w2_generation_guardrail;
REVOKE ALL ON FUNCTION creator.generation_record_agent_guardrail(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_record_agent_guardrail(uuid,uuid,text,text) TO creator_generation_worker;
-- No ledger insertion, worker table grant or activation occurs here.
COMMIT;
