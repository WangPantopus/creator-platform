-- Proposal (lane 3, B5). Source only: the integrator registers, reviews and
-- activates it. The generation worker writes memory PROPOSALS for the original
-- accepted turn after its answer: never remembered memory, consent, exclusions,
-- deletion, frames or the thread revision. A proposal becomes memory only when
-- the fan accepts it (and a sensitive one only with its own consent, INV-23).
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_generation_memory') THEN
  CREATE ROLE creator_w3_generation_memory NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w3_generation_memory'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing W3 generation memory custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.canonical_json(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'The genuine generation purpose is required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w3_generation_memory;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.canonical_json(jsonb)
 TO creator_w3_generation_memory;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w3_generation_memory;
CREATE POLICY w3_generation_memory_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w3_generation_memory USING(
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
GRANT SELECT(id,creator_id,fan_id,revision,off_the_record,deleted_at,memory_revision),UPDATE(memory_revision)
 ON creator.thread TO creator_w3_generation_memory;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,off_the_record) ON creator.message TO creator_w3_generation_memory;
GRANT SELECT(id,thread_id,creator_id,fan_id,semantic_key),
 INSERT(thread_id,creator_id,fan_id,kind,text,semantic_key,provenance_message_id,thread_revision_at_write,sensitive_category,state)
 ON creator.memory TO creator_w3_generation_memory;
GRANT SELECT(thread_id,creator_id,fan_id,semantic_key) ON creator.memory_exclusion TO creator_w3_generation_memory;
DO $$ DECLARE t text; family text; BEGIN
 FOREACH t IN ARRAY ARRAY['message','memory','memory_exclusion'] LOOP
  family:=format('EXISTS(SELECT FROM creator.generation_worker_scope s WHERE %I.thread_id=(s.task->>''threadId'')::uuid AND %I.creator_id=(s.task->>''creatorId'')::uuid AND %I.fan_id=(s.task->>''fanId'')::uuid)',t,t,t);
  EXECUTE format('CREATE POLICY w3_generation_memory_read ON creator.%I FOR SELECT TO creator_w3_generation_memory USING(%s)',t,family);
 END LOOP;
END $$;
CREATE POLICY w3_generation_memory_write ON creator.memory FOR INSERT TO creator_w3_generation_memory WITH CHECK(
 state='proposed' AND consent_id IS NULL AND NOT edited_by_fan
 AND EXISTS(SELECT FROM creator.generation_worker_scope s WHERE memory.thread_id=(s.task->>'threadId')::uuid
  AND memory.creator_id=(s.task->>'creatorId')::uuid AND memory.fan_id=(s.task->>'fanId')::uuid
  AND memory.provenance_message_id=(s.task->>'fanMessageId')::uuid));
CREATE POLICY w3_generation_memory_read ON creator.thread FOR SELECT TO creator_w3_generation_memory USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_generation_memory_revision ON creator.thread FOR UPDATE TO creator_w3_generation_memory USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE FUNCTION creator.generation_memory_proposals(g uuid,w uuid,batch jsonb) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; tid uuid; cid uuid; fid uuid; fan_message uuid; rev integer; otr boolean;
 item jsonb; item_key text; written integer:=0;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(batch) IS DISTINCT FROM 'array' OR jsonb_array_length(batch)>5 OR octet_length(batch::text)>8192 THEN
  RAISE EXCEPTION 'A bounded memory proposal batch is required' USING ERRCODE='22023';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Current generation tuple is unavailable' USING ERRCODE='42501'; END IF;
 tid:=(task->>'threadId')::uuid; cid:=(task->>'creatorId')::uuid; fid:=(task->>'fanId')::uuid;
 fan_message:=(task->>'fanMessageId')::uuid;
 SELECT t.revision,t.off_the_record INTO rev,otr FROM creator.thread t
 WHERE t.id=tid AND t.creator_id=cid AND t.fan_id=fid AND t.deleted_at IS NULL FOR UPDATE;
 -- Off the record (Q13) or a changed turn writes nothing.
 IF NOT FOUND OR otr OR rev<>(task->>'contextRevision')::integer+(task->>'lastSequence')::integer THEN RETURN 0; END IF;
 IF NOT EXISTS(SELECT FROM creator.message m WHERE m.id=fan_message AND m.thread_id=tid AND m.creator_id=cid
  AND m.fan_id=fid AND m.author_kind='fan' AND NOT m.off_the_record) THEN RETURN 0; END IF;
 IF (SELECT count(*) FROM (SELECT FROM creator.memory_exclusion e WHERE e.thread_id=tid AND e.creator_id=cid
  AND e.fan_id=fid LIMIT 1001) bounded)>1000 THEN RETURN 0; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(batch) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT FROM jsonb_object_keys(item) k WHERE k NOT IN('kind','text','semanticKey','sensitiveCategory'))
   OR item->>'kind' IS NULL OR item->>'kind' NOT IN('fact','open_loop')
   OR length(coalesce(item->>'text','')) NOT BETWEEN 1 AND 500
   OR length(coalesce(item->>'semanticKey','')) NOT BETWEEN 1 AND 120
   OR (jsonb_typeof(item->'sensitiveCategory')='string' AND item->>'sensitiveCategory' NOT IN('health','sexuality',
    'religion','politics','ethnicity','union','financial_hardship','sensitive_unspecified'))
   OR jsonb_typeof(item->'sensitiveCategory') NOT IN('string','null') THEN
   RAISE EXCEPTION 'An invalid memory proposal' USING ERRCODE='22023';
  END IF;
  item_key:=btrim(lower(normalize(item->>'semanticKey',NFKC)));
  -- An exclusion removes exactly the key it names (the key itself or its
  -- content hash, as the fan's "don't remember this" stores it).
  CONTINUE WHEN item_key=''
   OR EXISTS(SELECT FROM creator.memory_exclusion e WHERE e.thread_id=tid AND e.creator_id=cid AND e.fan_id=fid
    AND (e.semantic_key=item_key
     OR e.semantic_key=encode(sha256(convert_to(creator.canonical_json(to_jsonb(item_key)),'UTF8')),'hex')))
   OR EXISTS(SELECT FROM creator.memory m WHERE m.thread_id=tid AND m.creator_id=cid AND m.fan_id=fid
    AND m.semantic_key=item_key);
  INSERT INTO creator.memory(thread_id,creator_id,fan_id,kind,text,semantic_key,provenance_message_id,
   thread_revision_at_write,sensitive_category,state)
  VALUES(tid,cid,fid,item->>'kind',item->>'text',item_key,fan_message,rev,
   CASE WHEN jsonb_typeof(item->'sensitiveCategory')='string' THEN item->>'sensitiveCategory' END,'proposed');
  written:=written+1;
 END LOOP;
 IF written>0 THEN
  UPDATE creator.thread SET memory_revision=memory_revision+1 WHERE id=tid AND creator_id=cid AND fan_id=fid;
 END IF;
 IF NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Generation authority ended during the memory write' USING ERRCODE='42501';
 END IF;
 RETURN written;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_memory_proposals(uuid,uuid,jsonb) OWNER TO creator_w3_generation_memory;
REVOKE ALL ON FUNCTION creator.generation_memory_proposals(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_memory_proposals(uuid,uuid,jsonb) TO creator_generation_worker;
-- The integrator owns registration, review receipts and catalogue pins.
COMMIT;
