-- Reserved0095. Source only: W8 reviews/activates with genuine0072/0093.
-- Read purpose only. No raw worker grants, Actor/GUC substitution, source
-- licence, provider admission, output, memory mutation or terminal permission.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_generation_conversation_context') THEN
  CREATE ROLE creator_generation_conversation_context NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_generation_conversation_context'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing W3 generation context custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'The genuine generation purpose is required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_generation_conversation_context;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid) TO creator_generation_conversation_context;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_generation_conversation_context;
CREATE POLICY w3_generation_context_nonce ON creator.generation_worker_scope FOR SELECT TO creator_generation_conversation_context USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,creator_id,fan_id,revision,control_epoch,off_the_record,intro_shared,deleted_at)
 ON creator.thread TO creator_generation_conversation_context;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,text,sequence,off_the_record,delivery_state)
 ON creator.message TO creator_generation_conversation_context;
GRANT SELECT(id,thread_id,creator_id,fan_id,text,semantic_key,state,sensitive_category,consent_id,created_at)
 ON creator.memory TO creator_generation_conversation_context;
GRANT SELECT(id,thread_id,creator_id,fan_id,withdrawn_at) ON creator.memory_consent TO creator_generation_conversation_context;
GRANT SELECT(thread_id,creator_id,fan_id,semantic_key) ON creator.memory_exclusion TO creator_generation_conversation_context;
GRANT SELECT(id,account_id,intro) ON creator.fan_profile TO creator_generation_conversation_context;
DO $$ DECLARE t text; family text; BEGIN
 FOREACH t IN ARRAY ARRAY['message','memory','memory_consent','memory_exclusion'] LOOP
  family:=format('EXISTS(SELECT FROM creator.generation_worker_scope s WHERE %I.thread_id=(s.task->>''threadId'')::uuid AND %I.creator_id=(s.task->>''creatorId'')::uuid AND %I.fan_id=(s.task->>''fanId'')::uuid)',t,t,t);
  EXECUTE format('CREATE POLICY w3_generation_context_read ON creator.%I FOR SELECT TO creator_generation_conversation_context USING(%s)',t,family);
 END LOOP;
END $$;
CREATE POLICY w3_generation_context_read ON creator.thread FOR SELECT TO creator_generation_conversation_context USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_generation_context_read ON creator.fan_profile FOR SELECT TO creator_generation_conversation_context USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE fan_profile.id=(s.task->>'fanId')::uuid AND fan_profile.account_id=(s.task->>'initiatingAccountId')::uuid));
CREATE FUNCTION creator.generation_conversation_context(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; tid uuid; cid uuid; fid uuid; fan_message uuid; revision integer; epoch integer;
 otr boolean; intro_shared boolean; accepted_text text; exclusions jsonb; messages jsonb; memories jsonb; intro text; result jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Current generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 tid:=(task->>'threadId')::uuid; cid:=(task->>'creatorId')::uuid; fid:=(task->>'fanId')::uuid;
 fan_message:=(task->>'fanMessageId')::uuid;
 SELECT t.revision,t.control_epoch,t.off_the_record,t.intro_shared INTO revision,epoch,otr,intro_shared
 FROM creator.thread t WHERE t.id=tid AND t.creator_id=cid AND t.fan_id=fid AND t.deleted_at IS NULL;
 IF NOT FOUND OR epoch<>(task->>'epoch')::integer
  OR revision<>(task->>'contextRevision')::integer+(task->>'lastSequence')::integer THEN
  RAISE EXCEPTION 'Accepted conversation changed' USING ERRCODE='42501';
 END IF;
 SELECT m.text INTO accepted_text FROM creator.message m WHERE m.id=fan_message AND m.thread_id=tid
  AND m.creator_id=cid AND m.fan_id=fid AND m.author_kind='fan' AND m.delivery_state='accepted';
 IF accepted_text IS NULL OR length(accepted_text)<1 OR length(accepted_text)>10000 THEN
  RAISE EXCEPTION 'Bounded accepted fan input is required' USING ERRCODE='55000';
 END IF;
 SELECT coalesce(jsonb_agg(e.semantic_key ORDER BY e.semantic_key),'[]'::jsonb) INTO exclusions
 FROM (SELECT semantic_key FROM creator.memory_exclusion WHERE thread_id=tid AND creator_id=cid AND fan_id=fid
  ORDER BY semantic_key LIMIT 1001) e;
 IF jsonb_array_length(exclusions)>1000 THEN RAISE EXCEPTION 'Memory exclusions require bounded processing' USING ERRCODE='55000'; END IF;
 messages:='[]'::jsonb; memories:='[]'::jsonb; intro:=NULL;
 -- Existing exclusions require an actual semantic classifier purpose. Until
 -- supplied, omit retained history/memory/intro rather than re-extract a paraphrase.
 IF NOT otr AND jsonb_array_length(exclusions)=0 THEN
  SELECT coalesce(jsonb_agg(m.author_kind||': '||m.text ORDER BY m.sequence),'[]'::jsonb) INTO messages
  FROM (SELECT author_kind,text,sequence FROM creator.message WHERE thread_id=tid AND creator_id=cid AND fan_id=fid
   AND NOT off_the_record AND delivery_state IN('accepted','delivered','interrupted') ORDER BY sequence DESC LIMIT 30) m;
  SELECT coalesce(jsonb_agg(m.text ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO memories
  FROM (SELECT mem.id,mem.text,mem.created_at FROM creator.memory mem
   LEFT JOIN creator.memory_consent consent ON consent.id=mem.consent_id AND consent.thread_id=mem.thread_id
    AND consent.creator_id=mem.creator_id AND consent.fan_id=mem.fan_id AND consent.withdrawn_at IS NULL
   WHERE mem.thread_id=tid AND mem.creator_id=cid AND mem.fan_id=fid AND mem.state='remembered'
    AND (mem.sensitive_category IS NULL OR consent.id IS NOT NULL)
    AND NOT EXISTS(SELECT FROM creator.memory_exclusion e WHERE e.thread_id=tid AND e.creator_id=cid AND e.fan_id=fid AND e.semantic_key=mem.semantic_key)
   ORDER BY mem.created_at DESC,mem.id LIMIT 100) m;
  IF intro_shared THEN SELECT f.intro INTO intro FROM creator.fan_profile f WHERE f.id=fid AND f.account_id=(task->>'initiatingAccountId')::uuid; END IF;
 END IF;
 result:=jsonb_build_object('generationId',g,'threadId',tid,'creatorId',cid,'fanId',fid,'acceptedText',accepted_text,
  'snapshot',jsonb_build_object('revision',revision,'epoch',epoch,'offTheRecord',otr,'intro',intro,
   'messages',messages,'memory',memories,'excludedKeys',exclusions,'provenanceMessageId',fan_message));
 IF octet_length(result::text)>2097152 THEN RAISE EXCEPTION 'Conversation context exceeds its bound' USING ERRCODE='55000'; END IF;
 IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Generation authority ended during the read' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_conversation_context(uuid,uuid) OWNER TO creator_generation_conversation_context;
REVOKE ALL ON FUNCTION creator.generation_conversation_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_conversation_context(uuid,uuid) TO creator_generation_worker;
-- W8 owns actual ledger/checksum and source/executable review. No registration.
COMMIT;
