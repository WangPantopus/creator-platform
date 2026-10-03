-- Held0105. Actual0099/0100 terminal custody only, after W3's captured final
-- writes. W8 owns activation;0077/0097 and their original files stay unchanged.
-- No message, input, provider admission, consent, grant or amount is supplied.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)') IS NULL
  OR to_regclass('creator.ai_generation_receipt') IS NULL
  OR to_regprocedure('creator.canonical_json(jsonb)') IS NULL THEN
  RAISE EXCEPTION 'Actual terminal and original journal custody required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_terminal_journal') THEN
  CREATE ROLE creator_w2_generation_terminal_journal NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_terminal_journal'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN RAISE EXCEPTION 'Unsafe terminal journal custody'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w2_generation_terminal_journal;
GRANT EXECUTE ON FUNCTION creator.generation_terminal_matches(uuid,uuid,boolean),creator.canonical_json(jsonb)
 TO creator_w2_generation_terminal_journal;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,custody_token,mode,task,transitioned,finalized,created_at)
 ON creator.generation_terminal_scope TO creator_w2_generation_terminal_journal;
CREATE POLICY w2_terminal_journal_nonce ON creator.generation_terminal_scope FOR SELECT TO creator_w2_generation_terminal_journal USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND task IS NOT NULL AND transitioned AND finalized AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(creator_id,revision),UPDATE(creator_id) ON creator.ai_workspace TO creator_w2_generation_terminal_journal;
GRANT SELECT ON creator.ai_generation_admission,creator.ai_generation_attempt,creator.ai_generation_receipt
 TO creator_w2_generation_terminal_journal;
GRANT UPDATE(state,sealed_at) ON creator.ai_generation_admission TO creator_w2_generation_terminal_journal;
GRANT UPDATE(state,closed_at) ON creator.ai_generation_attempt TO creator_w2_generation_terminal_journal;
GRANT INSERT ON creator.ai_generation_receipt TO creator_w2_generation_terminal_journal;
GRANT SELECT(id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,
 cached_input_tokens,cache_write_input_tokens,creator_hold_id,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,
 provider_state,completed_at),UPDATE(cost_micros,purpose) ON creator.ai_usage TO creator_w2_generation_terminal_journal;
GRANT SELECT(id,creator_id,state),UPDATE(state) ON creator.ai_cost_hold TO creator_w2_generation_terminal_journal;
GRANT INSERT(creator_id,type,revision,payload) ON creator.ai_event TO creator_w2_generation_terminal_journal;
DO $$ DECLARE t text; predicate text; BEGIN
 predicate:='creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_terminal_scope s)';
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_generation_admission','ai_generation_attempt','ai_generation_receipt','ai_usage','ai_cost_hold'] LOOP
  EXECUTE format('CREATE POLICY w2_terminal_journal_read ON creator.%I FOR SELECT TO creator_w2_generation_terminal_journal USING(%s)',t,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_generation_admission','ai_generation_attempt','ai_cost_hold'] LOOP
  EXECUTE format('CREATE POLICY w2_terminal_journal_write ON creator.%I FOR UPDATE TO creator_w2_generation_terminal_journal USING(%s) WITH CHECK(%s)',t,predicate,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_generation_receipt','ai_event'] LOOP
  EXECUTE format('CREATE POLICY w2_terminal_journal_insert ON creator.%I FOR INSERT TO creator_w2_generation_terminal_journal WITH CHECK(%s)',t,predicate);
 END LOOP;
 -- Only zero-token, non-provider uncertainty markers can be reconciled. Actual
 -- admitted/completed provider usage can only change through original0097 cap.
 EXECUTE format('CREATE POLICY w2_terminal_journal_marker ON creator.ai_usage FOR UPDATE TO creator_w2_generation_terminal_journal USING(%s AND category=''provider_unknown'' AND provider_state IS NULL AND input_tokens=0 AND output_tokens=0 AND cost_micros IS NULL AND creator_hold_id IS NOT NULL) WITH CHECK(%s AND category=''provider_unknown'' AND provider_state IS NULL AND input_tokens=0 AND output_tokens=0 AND cost_micros=0 AND purpose=''cost_hold_reconciled'')',predicate,predicate);
END $$;

-- Private invoker helper. Only the closed terminal-journal role can call it;
-- caller parameters never substitute for a genuine original terminal tuple.
CREATE FUNCTION creator.generation_append_agent_receipt(c uuid,g uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE admission record; attempts jsonb; calls jsonb; v_usage_ids uuid[]; v_attempt_ids uuid[]; v_holds uuid[];
 complete boolean; total numeric; receipt_state text; v_receipt_hash text; appended_id uuid; appended_revision integer;
BEGIN
 IF current_user<>'creator_w2_generation_terminal_journal' THEN RAISE EXCEPTION 'Private original journal helper only' USING ERRCODE='42501'; END IF;
 SELECT * INTO admission FROM creator.ai_generation_admission WHERE creator_id=c AND generation_id=g AND state='sealed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Original sealed admission required' USING ERRCODE='55000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id',attempt_id,'provider_admissions',provider_admissions,
  'state',state,'creator_hold_id',creator_hold_id) ORDER BY attempt_id),'[]'::jsonb),
  coalesce(array_agg(attempt_id ORDER BY attempt_id),'{}'::uuid[]),coalesce(array_agg(creator_hold_id ORDER BY attempt_id),'{}'::uuid[])
 INTO attempts,v_attempt_ids,v_holds FROM creator.ai_generation_attempt WHERE creator_id=c AND generation_id=g;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'attempt_id',attempt_id,'call_ordinal',call_ordinal,
  'provider_state',provider_state,'cost_micros',cost_micros::text,'input_tokens',input_tokens,'output_tokens',output_tokens,
  'cached_input_tokens',cached_input_tokens,'cache_write_input_tokens',cache_write_input_tokens,'purpose',purpose,
  'version_hash',version_hash,'provider',provider,'model',model) ORDER BY attempt_id,call_ordinal),'[]'::jsonb),
  coalesce(array_agg(id ORDER BY attempt_id,call_ordinal),'{}'::uuid[]),coalesce(sum(cost_micros),0)
 INTO calls,v_usage_ids,total FROM creator.ai_usage WHERE creator_id=c AND generation_id=g;
 IF octet_length(attempts::text)+octet_length(calls::text)>16777216 THEN
  RAISE EXCEPTION 'Complete original accounting exceeds processing bounds' USING ERRCODE='54000';
 END IF;
 SELECT NOT EXISTS(SELECT FROM creator.ai_generation_attempt a WHERE a.creator_id=c AND a.generation_id=g
  AND (a.state='open' OR a.provider_admissions<>(SELECT count(*) FROM creator.ai_usage u
   WHERE u.creator_id=c AND u.generation_id=g AND u.attempt_id=a.attempt_id)
   OR EXISTS(SELECT FROM (SELECT u.call_ordinal,u.provider_state,u.cost_micros,
      row_number() OVER(ORDER BY u.call_ordinal) ordinal FROM creator.ai_usage u
      WHERE u.creator_id=c AND u.generation_id=g AND u.attempt_id=a.attempt_id) x
    WHERE x.call_ordinal<>x.ordinal OR x.provider_state IS DISTINCT FROM 'completed' OR x.cost_micros IS NULL OR x.cost_micros<0)))
  AND NOT EXISTS(SELECT FROM creator.ai_usage u WHERE u.creator_id=c AND u.generation_id=g
   AND NOT EXISTS(SELECT FROM creator.ai_generation_attempt a WHERE a.creator_id=c AND a.generation_id=g AND a.attempt_id=u.attempt_id))
  AND total BETWEEN 0 AND 9007199254740991 INTO complete;
 receipt_state:=CASE WHEN NOT complete THEN 'unknown' WHEN cardinality(v_usage_ids)=0 THEN 'no_request' ELSE 'known' END;
 v_receipt_hash:=encode(sha256(convert_to(creator.canonical_json(jsonb_build_object('creatorId',c,'generationId',g,
  'threadId',admission.thread_id,'fanId',admission.fan_id,'retentionPolicyVersion',admission.retention_policy_version,
  'state',receipt_state,'costMicros',CASE WHEN complete THEN total ELSE NULL END,'attempts',attempts,'usage',calls)),'UTF8')),'hex');
 INSERT INTO creator.ai_generation_receipt(creator_id,generation_id,thread_id,fan_id,state,cost_micros,usage_ids,attempt_ids,receipt_hash,revision)
 SELECT c,g,admission.thread_id,admission.fan_id,receipt_state,CASE WHEN complete THEN total::bigint ELSE NULL END,
  v_usage_ids,v_attempt_ids,v_receipt_hash,coalesce(max(revision),0)+1 FROM creator.ai_generation_receipt WHERE creator_id=c AND generation_id=g
 ON CONFLICT(creator_id,generation_id,receipt_hash) DO NOTHING RETURNING id,revision INTO appended_id,appended_revision;
 IF appended_id IS NOT NULL THEN
  INSERT INTO creator.ai_event(creator_id,type,revision,payload) SELECT c,'ai.generation_receipt',revision,
   jsonb_build_object('schemaVersion',1,'generationId',g,'threadId',admission.thread_id,'fanId',admission.fan_id,
    'receiptId',appended_id,'receiptHash',v_receipt_hash,'receiptRevision',appended_revision,'state',receipt_state)
  FROM creator.ai_workspace WHERE creator_id=c;
 END IF;
 IF complete THEN
  UPDATE creator.ai_cost_hold SET state='settled' WHERE creator_id=c AND id=ANY(v_holds) AND state IN('held','released');
  UPDATE creator.ai_usage SET cost_micros=0,purpose='cost_hold_reconciled' WHERE creator_id=c AND creator_hold_id=ANY(v_holds)
   AND category='provider_unknown' AND provider_state IS NULL AND input_tokens=0 AND output_tokens=0 AND cost_micros IS NULL;
 END IF;
 RETURN jsonb_build_object('generationId',g,'custody','sealed','state',receipt_state,
  'costMicros',CASE WHEN complete THEN total ELSE NULL END,'usageIds',v_usage_ids,'attemptIds',v_attempt_ids,
  'reference',v_receipt_hash,'retentionPolicyVersion',admission.retention_policy_version);
END $$;
CREATE FUNCTION creator.generation_agent_journal_receipt(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; admission record; receipt record;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR k IS NULL OR NOT creator.generation_terminal_matches(g,k,true) THEN
  RAISE EXCEPTION 'Actual finalized original terminal purpose required' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 IF task IS NULL THEN RAISE EXCEPTION 'Private same-client terminal nonce required' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE NOWAIT;
 SELECT * INTO admission FROM creator.ai_generation_admission WHERE creator_id=c AND generation_id=g FOR UPDATE NOWAIT;
 IF NOT FOUND THEN
  IF NOT creator.generation_terminal_matches(g,k,true) THEN RAISE EXCEPTION 'Terminal authority ended' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('generationId',g,'custody','missing','state','unknown','costMicros',NULL,
   'usageIds','[]'::jsonb,'attemptIds','[]'::jsonb,'reference','','retentionPolicyVersion',NULL);
 END IF;
 IF admission.thread_id IS DISTINCT FROM (task->>'threadId')::uuid OR admission.fan_id IS DISTINCT FROM (task->>'fanId')::uuid
  OR admission.actor_account_id IS DISTINCT FROM (task->>'initiatingAccountId')::uuid THEN
  RAISE EXCEPTION 'Original accounting family changed' USING ERRCODE='42501';
 END IF;
 IF admission.state='sealed' THEN
  SELECT * INTO receipt FROM creator.ai_generation_receipt WHERE creator_id=c AND generation_id=g ORDER BY revision DESC LIMIT 1;
  IF FOUND THEN
   IF receipt.cost_micros>9007199254740991 THEN RAISE EXCEPTION 'Original cost is outside exact integer bounds' USING ERRCODE='22003'; END IF;
   IF NOT creator.generation_terminal_matches(g,k,true) THEN RAISE EXCEPTION 'Terminal authority ended' USING ERRCODE='42501'; END IF;
   RETURN jsonb_build_object('generationId',g,'custody','sealed','state',receipt.state,'costMicros',receipt.cost_micros,
    'usageIds',receipt.usage_ids,'attemptIds',receipt.attempt_ids,'reference',receipt.receipt_hash,
    'retentionPolicyVersion',admission.retention_policy_version);
  END IF;
 END IF;
 IF NOT creator.generation_terminal_matches(g,k,true) THEN RAISE EXCEPTION 'Terminal authority ended' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('generationId',g,'custody',admission.state,'state','unknown','costMicros',NULL,
  'usageIds','[]'::jsonb,'attemptIds','[]'::jsonb,'reference','','retentionPolicyVersion',admission.retention_policy_version);
END $$;
CREATE FUNCTION creator.generation_seal_agent_journal(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; result jsonb;
BEGIN
 -- This reader locks the original workspace→admission and checks actual final
 -- W3 writes, original family and current terminal purpose before any seal.
 result:=creator.generation_agent_journal_receipt(g,k);
 IF result->>'custody'='missing' THEN RETURN result; END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 c:=(task->>'creatorId')::uuid;
 UPDATE creator.ai_generation_attempt SET state='sealed',closed_at=clock_timestamp()
  WHERE creator_id=c AND generation_id=g AND state='open';
 UPDATE creator.ai_generation_admission SET state='sealed',sealed_at=coalesce(sealed_at,clock_timestamp())
  WHERE creator_id=c AND generation_id=g;
 result:=creator.generation_append_agent_receipt(c,g);
 IF NOT creator.generation_terminal_matches(g,k,true) THEN RAISE EXCEPTION 'Terminal authority ended during seal' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_append_agent_receipt(uuid,uuid) OWNER TO creator_w2_generation_terminal_journal;
ALTER FUNCTION creator.generation_agent_journal_receipt(uuid,uuid) OWNER TO creator_w2_generation_terminal_journal;
ALTER FUNCTION creator.generation_seal_agent_journal(uuid,uuid) OWNER TO creator_w2_generation_terminal_journal;
REVOKE ALL ON FUNCTION creator.generation_append_agent_receipt(uuid,uuid),creator.generation_agent_journal_receipt(uuid,uuid),
 creator.generation_seal_agent_journal(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_agent_journal_receipt(uuid,uuid),creator.generation_seal_agent_journal(uuid,uuid)
 TO creator_generation_worker;
COMMIT;
