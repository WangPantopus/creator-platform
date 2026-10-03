-- Reserved0211. Classification precedes embedding. This isolated reader is
-- held until exact W1/W4/W8 executable, catalogue and C10 review; it grants no
-- Actor, provider, message, memory, signing or financial authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_metadata') THEN
  CREATE ROLE creator_w2_generation_metadata NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_metadata'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing generation metadata custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_agent_inputs(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_allowance_audience(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Original current generation, input and audience consumers are required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w2_generation_metadata;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.generation_agent_inputs(uuid,uuid),creator.generation_allowance_audience(uuid,uuid)
 TO creator_w2_generation_metadata;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w2_generation_metadata;
CREATE POLICY w2_generation_metadata_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w2_generation_metadata USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,display_name) ON creator.creator_profile TO creator_w2_generation_metadata;
CREATE POLICY w2_generation_metadata_creator ON creator.creator_profile FOR SELECT TO creator_w2_generation_metadata USING(
 id=(SELECT (s.task->>'creatorId')::uuid FROM creator.generation_worker_scope s)
);
CREATE FUNCTION creator.generation_agent_metadata(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; facts jsonb; audience jsonb; creator_name text; c uuid; result jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the original current generation purpose' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Original generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid;
 facts:=creator.generation_agent_inputs(g,w);
 audience:=creator.generation_allowance_audience(g,w);
 SELECT p.display_name INTO creator_name FROM creator.creator_profile p WHERE p.id=c;
 IF creator_name IS NULL OR length(creator_name)<1 OR length(creator_name)>200
  OR facts->>'creatorId' IS DISTINCT FROM c::text
  OR facts->'version'->>'compiledHash' IS NULL OR facts->'version'->>'pipelineHash' IS NULL
  OR audience->>'validUntil' IS NULL OR (audience->>'validUntil')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'Current bounded creator, compiled input and audience are required' USING ERRCODE='55000';
 END IF;
 result:=jsonb_build_object('creatorId',c,'creatorName',creator_name,
  'compiledHash',facts->'version'->>'compiledHash','pipelineHash',facts->'version'->>'pipelineHash','audience',audience);
 IF octet_length(result::text)>262144 OR NOT creator.generation_scope_matches(g,w)
  OR creator.generation_agent_inputs(g,w) IS DISTINCT FROM facts
  OR creator.generation_allowance_audience(g,w) IS DISTINCT FROM audience
  OR (SELECT p.display_name FROM creator.creator_profile p WHERE p.id=c) IS DISTINCT FROM creator_name THEN
  RAISE EXCEPTION 'Original generation metadata changed during the read' USING ERRCODE='42501';
 END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_agent_metadata(uuid,uuid) OWNER TO creator_w2_generation_metadata;
REVOKE ALL ON FUNCTION creator.generation_agent_metadata(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_agent_metadata(uuid,uuid) TO creator_generation_worker;
-- W8 owns original source/checksum registration. No ledger or activation here.
COMMIT;
