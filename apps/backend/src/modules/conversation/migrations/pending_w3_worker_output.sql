-- Reserved0212_w3_generation_worker_output. Held source only. W8 owns exact
-- source/definition/catalogue/C10 activation. W1 owns the original transaction
-- and sole COMMIT. The actual W2 privately issued approved sentence must be
-- checked on this same client before this writer and after genuine W1 cursor
-- refresh. This function supplies neither that issuance nor provider authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_generation_output') THEN
  CREATE ROLE creator_w3_generation_output NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w3_generation_output'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Isolated original generation output custody required';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.generation_agent_inputs(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Genuine original generation and current compiled input consumers required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w3_generation_output;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.generation_agent_inputs(uuid,uuid)
 TO creator_w3_generation_output;
SET LOCAL ROLE creator_owner;
-- A durable equality record for the actual delivered sentence, never a money
-- or provider receipt. No worker token, private capability or input body is
-- persisted here. Ordinary original-family export/deletion/finite expiry must
-- include this table before activation; retained financial rows stay separate.
CREATE TABLE creator.generation_sentence_provenance (
 generation_id uuid NOT NULL REFERENCES creator.generation(id),
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 1024),
 thread_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,
 message_id uuid NOT NULL,event_id uuid NOT NULL REFERENCES creator.event(id),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 approval jsonb NOT NULL CHECK(jsonb_typeof(approval)='object' AND octet_length(approval::text)<=32768),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(generation_id,sequence),UNIQUE(event_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id),
 FOREIGN KEY(message_id,thread_id) REFERENCES creator.message(id,thread_id)
);
ALTER TABLE creator.generation_sentence_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.generation_sentence_provenance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE creator.generation_sentence_provenance FROM PUBLIC,creator_runtime,creator_generation_worker;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w3_generation_output;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_w3_generation_output;
CREATE POLICY w3_generation_output_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w3_generation_output USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('generation.terminal_nonce',true),'') IS NULL
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,epoch,context_revision,
 last_sequence,state,worker_token,lease_until),UPDATE(last_sequence,first_visible_at)
 ON creator.generation TO creator_w3_generation_output;
GRANT SELECT(id,creator_id,fan_id,control,control_epoch,revision,event_cursor,processor_consent_version,deleted_at),
 UPDATE(revision,event_cursor) ON creator.thread TO creator_w3_generation_output;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,citations,delivery_state,
 control_epoch,agent_version_id,agent_version_hash),UPDATE(text,citations,agent_version_id,agent_version_hash)
 ON creator.message TO creator_w3_generation_output;
GRANT SELECT(id,thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id),
 INSERT(thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id)
 ON creator.event TO creator_w3_generation_output;
GRANT SELECT(generation_id,sequence,thread_id,creator_id,fan_id,message_id,event_id,content_hash,approval,created_at),
 INSERT(generation_id,sequence,thread_id,creator_id,fan_id,message_id,event_id,content_hash,approval)
 ON creator.generation_sentence_provenance TO creator_w3_generation_output;
DO $$ DECLARE t text; family text; BEGIN
 FOREACH t IN ARRAY ARRAY['generation','message','event','generation_sentence_provenance'] LOOP
  family:=format('EXISTS(SELECT FROM creator.generation_worker_scope s WHERE %I.thread_id=(s.task->>''threadId'')::uuid AND %I.creator_id=(s.task->>''creatorId'')::uuid AND %I.fan_id=(s.task->>''fanId'')::uuid)',t,t,t);
  EXECUTE format('CREATE POLICY w3_generation_output_read ON creator.%I FOR SELECT TO creator_w3_generation_output USING(%s)',t,family);
 END LOOP;
END $$;
CREATE POLICY w3_generation_output_thread_read ON creator.thread FOR SELECT TO creator_w3_generation_output USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_generation_output_thread_write ON creator.thread FOR UPDATE TO creator_w3_generation_output USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid)) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid
  AND thread.control='ai_active' AND thread.control_epoch=(s.task->>'epoch')::integer AND thread.deleted_at IS NULL));
CREATE POLICY w3_generation_output_job_write ON creator.generation FOR UPDATE TO creator_w3_generation_output USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE generation.id=s.generation_id
  AND generation.worker_token=s.worker_token AND generation.thread_id=(s.task->>'threadId')::uuid
  AND generation.creator_id=(s.task->>'creatorId')::uuid AND generation.fan_id=(s.task->>'fanId')::uuid)) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE generation.id=s.generation_id
  AND generation.worker_token=s.worker_token AND generation.thread_id=(s.task->>'threadId')::uuid
  AND generation.creator_id=(s.task->>'creatorId')::uuid AND generation.fan_id=(s.task->>'fanId')::uuid
  AND generation.state='generating' AND generation.epoch=(s.task->>'epoch')::integer));
CREATE POLICY w3_generation_output_message_write ON creator.message FOR UPDATE TO creator_w3_generation_output USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE message.id=(s.task->>'aiMessageId')::uuid
  AND message.thread_id=(s.task->>'threadId')::uuid AND message.creator_id=(s.task->>'creatorId')::uuid
  AND message.fan_id=(s.task->>'fanId')::uuid AND message.author_kind='ai')) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE message.id=(s.task->>'aiMessageId')::uuid
  AND message.thread_id=(s.task->>'threadId')::uuid AND message.creator_id=(s.task->>'creatorId')::uuid
  AND message.fan_id=(s.task->>'fanId')::uuid AND message.author_kind='ai'
  AND message.delivery_state='generating' AND message.control_epoch=(s.task->>'epoch')::integer));
CREATE POLICY w3_generation_output_frame ON creator.event FOR INSERT TO creator_w3_generation_output WITH CHECK(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE event.thread_id=(s.task->>'threadId')::uuid
  AND event.creator_id=(s.task->>'creatorId')::uuid AND event.fan_id=(s.task->>'fanId')::uuid
  AND event.actor_account_id=(s.task->>'initiatingAccountId')::uuid AND event.type='sentence'
  AND event.payload->>'generationId'=s.generation_id::text AND event.payload->>'messageId'=s.task->>'aiMessageId'));
CREATE POLICY w3_generation_output_provenance ON creator.generation_sentence_provenance FOR INSERT TO creator_w3_generation_output WITH CHECK(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE generation_sentence_provenance.generation_id=s.generation_id
  AND generation_sentence_provenance.thread_id=(s.task->>'threadId')::uuid
  AND generation_sentence_provenance.creator_id=(s.task->>'creatorId')::uuid
  AND generation_sentence_provenance.fan_id=(s.task->>'fanId')::uuid
  AND generation_sentence_provenance.message_id=(s.task->>'aiMessageId')::uuid
  AND generation_sentence_provenance.sequence=(s.task->>'lastSequence')::integer+1));

CREATE FUNCTION creator.generation_worker_output(g uuid,w uuid,n integer,sentence text,approved jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; facts jsonb; tid uuid; cid uuid; fid uuid; mid uuid; version_id uuid;
 thread record; job record; message record; prior record; frame jsonb; event_id uuid;
 approved_citations uuid[]; content_hash text; changed integer; cursor integer;
BEGIN
 IF session_user<>'creator_generation_worker' OR current_user<>'creator_w3_generation_output'
  OR g IS NULL OR w IS NULL OR NOT creator.generation_scope_matches(g,w)
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0212_w3_generation_worker_output') THEN
  RAISE EXCEPTION 'Use genuine original-generation output custody' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Original worker tuple is unavailable' USING ERRCODE='42501'; END IF;
 tid:=(task->>'threadId')::uuid;cid:=(task->>'creatorId')::uuid;fid:=(task->>'fanId')::uuid;mid:=(task->>'aiMessageId')::uuid;
 IF n IS NULL OR n<1 OR n>1024 OR sentence IS NULL OR length(sentence)<1 OR length(sentence)>10000
  OR approved IS NULL OR jsonb_typeof(approved)<>'object' OR octet_length(approved::text)>32768
  OR (SELECT count(*) FROM jsonb_object_keys(approved))<>10
  OR NOT approved ?& ARRAY['versionId','versionHash','pipelineHash','contextHash','fanMessageId','epoch','contextRevision','providerUsageId','citations','passages']
  OR EXISTS(SELECT FROM unnest(ARRAY['versionId','versionHash','pipelineHash','contextHash','fanMessageId','providerUsageId']) k
   WHERE jsonb_typeof(approved->k) IS DISTINCT FROM 'string')
  OR (approved->>'versionHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE
  OR (approved->>'pipelineHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE
  OR (approved->>'contextHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE
  OR approved->>'fanMessageId' IS DISTINCT FROM task->>'fanMessageId'
  OR approved->'epoch' IS DISTINCT FROM task->'epoch'
  OR approved->'contextRevision' IS DISTINCT FROM task->'contextRevision'
  OR jsonb_typeof(approved->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(approved->'citations')>20
  OR jsonb_typeof(approved->'passages') IS DISTINCT FROM 'array' OR jsonb_array_length(approved->'passages')>20 THEN
  RAISE EXCEPTION 'Use bounded exact approved sentence provenance' USING ERRCODE='22023';
 END IF;
 PERFORM (approved->>'providerUsageId')::uuid;
 version_id:=(approved->>'versionId')::uuid;
 facts:=creator.generation_agent_inputs(g,w);
 IF facts->>'creatorId' IS DISTINCT FROM cid::text OR facts->'version'->>'id' IS DISTINCT FROM version_id::text
  OR facts->'version'->>'compiledHash' IS DISTINCT FROM approved->>'versionHash'
  OR facts->'version'->>'pipelineHash' IS DISTINCT FROM approved->>'pipelineHash' THEN
  RAISE EXCEPTION 'Current original compiled version changed' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(array_agg(value::uuid ORDER BY ordinality),'{}'::uuid[]) INTO approved_citations
 FROM jsonb_array_elements_text(approved->'citations') WITH ORDINALITY;
 IF cardinality(approved_citations)<>(SELECT count(DISTINCT id) FROM unnest(approved_citations) id)
  OR cardinality(approved_citations)<>jsonb_array_length(approved->'passages')
  OR EXISTS(SELECT FROM jsonb_array_elements(approved->'passages') p WHERE jsonb_typeof(p)<>'object'
   OR (SELECT count(*) FROM jsonb_object_keys(p))<>4 OR NOT p ?& ARRAY['id','sourceId','sourceRevision','sourceHash']
   OR EXISTS(SELECT FROM unnest(ARRAY['id','sourceId','sourceHash']) k WHERE jsonb_typeof(p->k) IS DISTINCT FROM 'string')
   OR jsonb_typeof(p->'sourceRevision') IS DISTINCT FROM 'number'
   OR NOT (p->>'id')::uuid=ANY(approved_citations)
   OR NOT EXISTS(SELECT FROM jsonb_array_elements(facts->'version'->'sourceSet') source
    WHERE source->>'id'=p->>'sourceId' AND source->>'revision'=p->>'sourceRevision' AND source->>'hash'=p->>'sourceHash'))
  OR (SELECT count(DISTINCT p->>'id') FROM jsonb_array_elements(approved->'passages') p)<>cardinality(approved_citations) THEN
  RAISE EXCEPTION 'Exact original permitted citation provenance required' USING ERRCODE='42501';
 END IF;
 -- Preserve W1's actual family-before-job, nonwaiting lock order.
 SELECT t.control,t.control_epoch,t.revision,t.event_cursor,t.processor_consent_version INTO thread
 FROM creator.thread t WHERE t.id=tid AND t.creator_id=cid AND t.fan_id=fid AND t.deleted_at IS NULL FOR UPDATE NOWAIT;
 SELECT x.last_sequence,x.context_revision,x.epoch,x.state,x.ai_message_id INTO job
 FROM creator.generation x WHERE x.id=g AND x.thread_id=tid AND x.creator_id=cid AND x.fan_id=fid
  AND x.worker_token=w AND x.lease_until>clock_timestamp() FOR UPDATE NOWAIT;
 IF thread IS NULL OR job IS NULL OR thread.control<>'ai_active' OR job.state<>'generating'
  OR job.ai_message_id<>mid OR job.epoch<>(task->>'epoch')::integer OR thread.control_epoch<>job.epoch
  OR job.context_revision<>(task->>'contextRevision')::integer OR thread.revision<>job.context_revision+job.last_sequence
  OR thread.processor_consent_version IS DISTINCT FROM task->>'processorConsentVersion' THEN
  RAISE EXCEPTION 'Original conversation or worker cursor changed' USING ERRCODE='42501';
 END IF;
 content_hash:=encode(sha256(convert_to(sentence,'UTF8')),'hex');
 SELECT p.content_hash,p.approval,p.message_id,e.payload INTO prior FROM creator.generation_sentence_provenance p
 JOIN creator.event e ON e.id=p.event_id AND e.thread_id=p.thread_id AND e.creator_id=p.creator_id AND e.fan_id=p.fan_id
 WHERE p.generation_id=g AND p.sequence=n AND p.thread_id=tid AND p.creator_id=cid AND p.fan_id=fid AND e.type='sentence';
 IF n<=job.last_sequence THEN
  IF prior IS NULL OR prior.content_hash IS DISTINCT FROM content_hash OR prior.approval IS DISTINCT FROM approved
   OR prior.message_id IS DISTINCT FROM mid OR prior.payload->>'text' IS DISTINCT FROM sentence
   OR prior.payload->>'generationId' IS DISTINCT FROM g::text OR prior.payload->>'sequence' IS DISTINCT FROM n::text
   OR NOT creator.generation_scope_matches(g,w) OR creator.generation_agent_inputs(g,w) IS DISTINCT FROM facts THEN
   RAISE EXCEPTION 'Original sentence retry differs or lost custody' USING ERRCODE='23514';
  END IF;
  RETURN prior.payload;
 END IF;
 IF prior IS NOT NULL OR n<>job.last_sequence+1 OR job.last_sequence<>(task->>'lastSequence')::integer THEN
  RAISE EXCEPTION 'Use the exact next original sentence cursor' USING ERRCODE='23514';
 END IF;
 SELECT m.text,m.citations,m.agent_version_id,m.agent_version_hash INTO message FROM creator.message m
 WHERE m.id=mid AND m.thread_id=tid AND m.creator_id=cid AND m.fan_id=fid AND m.author_kind='ai'
  AND m.author_account_id IS NULL AND m.delivery_state='generating' AND m.control_epoch=job.epoch FOR UPDATE NOWAIT;
 IF message IS NULL OR octet_length(message.text||sentence)>262144
  OR ((job.last_sequence=0 AND message.text='' AND message.agent_version_id IS NULL AND message.agent_version_hash IS NULL)
   OR (job.last_sequence>0 AND message.agent_version_id=version_id AND message.agent_version_hash=approved->>'versionHash')) IS NOT TRUE THEN
  RAISE EXCEPTION 'Original AI message/version changed or exceeded its bound' USING ERRCODE='23514';
 END IF;
 UPDATE creator.message m SET text=m.text||sentence,
  citations=ARRAY(SELECT DISTINCT id FROM unnest(m.citations||approved_citations) id ORDER BY id),
  agent_version_id=version_id,agent_version_hash=approved->>'versionHash'
 WHERE id=mid AND thread_id=tid AND creator_id=cid AND fan_id=fid AND delivery_state='generating';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Original AI message append failed' USING ERRCODE='23514'; END IF;
 UPDATE creator.generation SET last_sequence=n,first_visible_at=coalesce(first_visible_at,clock_timestamp())
 WHERE id=g AND thread_id=tid AND creator_id=cid AND fan_id=fid AND worker_token=w
  AND state='generating' AND last_sequence=n-1;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Original sentence cursor append failed' USING ERRCODE='23514'; END IF;
 UPDATE creator.thread SET revision=revision+1,event_cursor=event_cursor+1
 WHERE id=tid AND creator_id=cid AND fan_id=fid AND revision=job.context_revision+n-1 RETURNING event_cursor INTO cursor;
 IF cursor IS NULL THEN RAISE EXCEPTION 'Original thread cursor append failed' USING ERRCODE='23514'; END IF;
 frame:=jsonb_build_object('threadId',tid,'cursor',cursor,'epoch',job.epoch,'kind','sentence',
  'messageId',mid,'authorKind','ai','text',sentence,'generationId',g,'sequence',n);
 INSERT INTO creator.event(thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id)
 VALUES(tid,cid,fid,cursor,'sentence',frame,(task->>'initiatingAccountId')::uuid) RETURNING id INTO event_id;
 INSERT INTO creator.generation_sentence_provenance(generation_id,sequence,thread_id,creator_id,fan_id,message_id,event_id,content_hash,approval)
 VALUES(g,n,tid,cid,fid,mid,event_id,content_hash,approved);
 IF NOT creator.generation_scope_matches(g,w) OR creator.generation_agent_inputs(g,w) IS DISTINCT FROM facts THEN
  RAISE EXCEPTION 'Original generation or compiled input ended before output' USING ERRCODE='42501';
 END IF;
 PERFORM pg_notify('creator_thread_frames',tid::text);
 RETURN frame;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_worker_output(uuid,uuid,integer,text,jsonb) OWNER TO creator_w3_generation_output;
REVOKE ALL ON FUNCTION creator.generation_worker_output(uuid,uuid,integer,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_worker_output(uuid,uuid,integer,text,jsonb) TO creator_generation_worker;
-- No application adapter, W2 approval producer, W1 cursor refresh, privacy
-- composition, registration or ledger activation is supplied by this source.
COMMIT;
