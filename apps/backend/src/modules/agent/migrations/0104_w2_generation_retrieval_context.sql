-- Held0104. Source only; W8 owns review/registration/activation with the actual
-- W1 purpose, unchanged0096, W4's0098 and W5's0102. No worker raw grants.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_retrieval') THEN
  CREATE ROLE creator_w2_generation_retrieval NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_retrieval'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN RAISE EXCEPTION 'Unsafe W2 retrieval custody'; END IF;
 IF to_regprocedure('creator.generation_agent_inputs(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_allowance_audience(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_content_origins(uuid,uuid,jsonb)') IS NULL
  OR to_regprocedure('creator.canonical_json(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Actual current inputs, allowance and origin producers are required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,public TO creator_w2_generation_retrieval;
-- Exact later recipient grant after the closed role exists. No caller JSON,
-- generic recipient registration, money/grant/body SELECT or extra worker entry.
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),
 creator.generation_agent_inputs(uuid,uuid),creator.generation_allowance_audience(uuid,uuid),
 creator.generation_content_origins(uuid,uuid,jsonb),creator.canonical_json(jsonb)
 TO creator_w2_generation_retrieval;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w2_generation_retrieval;
CREATE POLICY w2_generation_retrieval_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w2_generation_retrieval USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,account_id,display_name,verification,recovery_required),UPDATE(id)
 ON creator.creator_profile TO creator_w2_generation_retrieval;
CREATE POLICY w2_generation_retrieval_read ON creator.creator_profile FOR SELECT TO creator_w2_generation_retrieval USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE creator_profile.id=(s.task->>'creatorId')::uuid
  AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid));
CREATE POLICY w2_generation_retrieval_lock ON creator.creator_profile FOR UPDATE TO creator_w2_generation_retrieval USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE creator_profile.id=(s.task->>'creatorId')::uuid
  AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid)) WITH CHECK(false);
GRANT SELECT(id,creator_id,revision,content_hash,title,audience,expires_at)
 ON creator.ai_source TO creator_w2_generation_retrieval;
GRANT SELECT(id,creator_id,source_id,source_revision,passage,start_offset,end_offset,embedding,embedding_model)
 ON creator.ai_chunk TO creator_w2_generation_retrieval;
GRANT SELECT(creator_id,example_id,text_hash,embedding,model) ON creator.ai_style_embedding TO creator_w2_generation_retrieval;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_source','ai_chunk','ai_style_embedding'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_retrieval_read ON creator.%I FOR SELECT TO creator_w2_generation_retrieval USING(creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_worker_scope s))',t);
 END LOOP;
END $$;
CREATE FUNCTION creator.generation_agent_runtime_context(g uuid,w uuid,query_vector text,embedding_model_name text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; creator_name text; facts jsonb; audience_data jsonb; origins jsonb; current_origins jsonb;
 passages jsonb; styles jsonb; result jsonb; vector_query public.vector;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 IF query_vector IS NULL OR octet_length(query_vector)>262144 OR embedding_model_name IS NULL
  OR length(embedding_model_name) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Use the bounded configured query embedding' USING ERRCODE='22023';
 END IF;
 vector_query:=query_vector::public.vector;
 IF public.vector_dims(vector_query) NOT BETWEEN 1 AND 4096 THEN
  RAISE EXCEPTION 'The actual query vector dimension is unsupported' USING ERRCODE='22023';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Actual private nonce required' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid;
 SELECT display_name INTO creator_name FROM creator.creator_profile WHERE id=c AND account_id=(task->>'creatorAccountId')::uuid
  AND verification='verified' AND NOT recovery_required FOR SHARE NOWAIT;
 IF creator_name IS NULL OR length(creator_name) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Current creator identity is unavailable' USING ERRCODE='55000';
 END IF;
 facts:=creator.generation_agent_inputs(g,w);
 audience_data:=creator.generation_allowance_audience(g,w);
 IF jsonb_typeof(audience_data) IS DISTINCT FROM 'object' OR jsonb_typeof(audience_data->'tierIds') IS DISTINCT FROM 'array'
  OR jsonb_typeof(audience_data->'groupIds') IS DISTINCT FROM 'array' OR audience_data->>'revision' IS NULL
  OR audience_data->>'validUntil' IS NULL OR (audience_data->>'validUntil')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'Actual current allowance audience is required' USING ERRCODE='55000';
 END IF;
 -- Derive the exact origin batch from stored approved compiled source proofs.
 -- No new document positive lock may follow W5's final signature-account TRY.
 IF EXISTS(SELECT FROM jsonb_array_elements(facts->'sources') s WHERE s->>'originReference' LIKE 'content:%'
  AND (s->>'origin'<>'manual_text' OR s->'audience'<>'{"kind":"public"}'::jsonb
   OR s->>'originReference'!~'^content:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[1-9][0-9]{0,9}$')) THEN
  RAISE EXCEPTION 'Unsupported compiled content origin' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('contentId',id,'version',version) ORDER BY id,version),'[]'::jsonb) INTO origins
 FROM(SELECT DISTINCT split_part(s->>'originReference',':',2)::uuid id,
  split_part(s->>'originReference',':',3)::integer version FROM jsonb_array_elements(facts->'sources') s
  WHERE s->>'originReference' LIKE 'content:%') selected;
 IF jsonb_array_length(origins)>0 THEN
  current_origins:=creator.generation_content_origins(g,w,origins);
  IF jsonb_typeof(current_origins) IS DISTINCT FROM 'array' OR jsonb_array_length(current_origins)<>jsonb_array_length(origins)
   OR EXISTS(SELECT FROM jsonb_array_elements(facts->'sources') s WHERE s->>'originReference' LIKE 'content:%' AND NOT EXISTS(
    SELECT FROM jsonb_array_elements(current_origins) o WHERE o->>'creatorId'=c::text
     AND o->>'contentId'=split_part(s->>'originReference',':',2) AND o->>'version'=split_part(s->>'originReference',':',3)
     AND o->>'sourceHash'=s->>'hash' AND o->'audience'='{"kind":"public"}'::jsonb
   )) THEN RAISE EXCEPTION 'A current content origin changed' USING ERRCODE='55000'; END IF;
 END IF;
 -- Membership/source/expiry/version filtering precedes the distance LIMIT.
 WITH permitted AS MATERIALIZED (
  SELECT ch.id,ch.source_id,ch.source_revision,s.title,ch.passage,ch.start_offset,ch.end_offset,s.audience,ch.embedding
  FROM creator.ai_chunk ch JOIN creator.ai_source s ON s.id=ch.source_id AND s.creator_id=ch.creator_id
  JOIN jsonb_to_recordset(facts->'version'->'sourceSet') v(id uuid,revision integer,hash text)
   ON v.id=s.id AND v.revision=s.revision AND v.hash=s.content_hash
  WHERE ch.creator_id=c AND s.creator_id=c AND ch.source_revision=s.revision
   AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())
   AND ch.embedding IS NOT NULL AND ch.embedding_model=embedding_model_name
   AND public.vector_dims(ch.embedding)=public.vector_dims(vector_query)
   AND (s.audience->>'kind'='public'
    OR (s.audience->>'kind'='tier' AND EXISTS(SELECT FROM jsonb_array_elements_text(s.audience->'ids') AS allowed(id)
      WHERE audience_data->'tierIds' ? allowed.id))
    OR (s.audience->>'kind'='group' AND EXISTS(SELECT FROM jsonb_array_elements_text(s.audience->'ids') AS allowed(id)
      WHERE audience_data->'groupIds' ? allowed.id)))
 ), nearest AS(SELECT * FROM permitted ORDER BY embedding OPERATOR(public.<=>) vector_query,id LIMIT 4)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceId',source_id,'sourceRevision',source_revision,
  'title',title,'text',passage,'start',start_offset,'end',end_offset,'audience',audience)
  ORDER BY embedding OPERATOR(public.<=>) vector_query,id),'[]'::jsonb) INTO passages FROM nearest;
 WITH approved AS MATERIALIZED (
  SELECT (ex->>'id')::uuid id,ex->>'text' text,
   encode(sha256(convert_to(creator.canonical_json(jsonb_build_object('text',ex->>'text')),'UTF8')),'hex') hash
  FROM jsonb_array_elements(facts->'version'->'configuration'->'examples') ex
  WHERE ex->>'approved'='true' AND ex->>'fixed'='false'
 ), nearest AS(
  SELECT a.id,a.text,s.embedding FROM approved a JOIN creator.ai_style_embedding s ON s.creator_id=c
   AND s.example_id=a.id AND s.text_hash=a.hash AND s.model=embedding_model_name
   AND public.vector_dims(s.embedding)=public.vector_dims(vector_query)
  ORDER BY s.embedding OPERATOR(public.<=>) vector_query,a.id LIMIT 5
 ) SELECT coalesce(jsonb_agg(text ORDER BY embedding OPERATOR(public.<=>) vector_query,id),'[]'::jsonb) INTO styles FROM nearest;
 result:=jsonb_build_object('creatorId',c,'creatorName',creator_name,'compiledHash',facts->'version'->>'compiledHash',
  'pipelineHash',facts->'version'->>'pipelineHash','audience',audience_data,'passages',passages,'styleExamples',styles);
 IF octet_length(result::text)>2097152 OR (audience_data->>'validUntil')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'The current retrieval result exceeds its bounds or expired' USING ERRCODE='55000';
 END IF;
 -- Recheck wall-clock source/licence and original session/denial authority.
 PERFORM creator.generation_agent_inputs(g,w);
 IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Generation authority ended during retrieval' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_agent_runtime_context(uuid,uuid,text,text) OWNER TO creator_w2_generation_retrieval;
REVOKE ALL ON FUNCTION creator.generation_agent_runtime_context(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_agent_runtime_context(uuid,uuid,text,text) TO creator_generation_worker;
COMMIT;
