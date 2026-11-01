-- Pending (lane 3, finding 15): two answers for one creator no longer fail
-- each other on the creator's AI workspace row. The answer path locked that row
-- with NOWAIT in four W2 functions, so any second holder at that moment (another
-- worker's answer for the same creator, a Studio save or read, a comparison read)
-- made the answer fail before any sentence. Each lock now waits, bounded by the
-- generation transaction's own lock_timeout (1 s, set by the W1 and terminal
-- authorities) and statement_timeout (5 s). Lock order is unchanged: workspace
-- before journal, as each function already did. Every other line of the four
-- definitions is byte-identical to the installed one (each is checked first);
-- every other NOWAIT stays.
--   generation_agent_inputs          (0096)  FOR SHARE NOWAIT  -> FOR SHARE
--   generation_begin_agent_attempt   (0251)  FOR UPDATE NOWAIT -> FOR UPDATE
--   generation_open_provider_usage   (0097)  FOR UPDATE NOWAIT -> FOR UPDATE
--   generation_agent_journal_receipt (0105)  FOR UPDATE NOWAIT -> FOR UPDATE
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_agent_inputs(uuid,uuid)')),'UTF8')),'hex') IS DISTINCT FROM '5647fdd64b324793650535e1deee429d5002d5425be2af685328c6bfc56bdd93' THEN
  RAISE EXCEPTION 'Installed creator.generation_agent_inputs definition changed';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)')),'UTF8')),'hex') IS DISTINCT FROM '47688d2db58015ecd04143339539e0d565cf9e14aeb612ec0fe9e2555d1e4012' THEN
  RAISE EXCEPTION 'Installed creator.generation_begin_agent_attempt definition changed';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_open_provider_usage(uuid,uuid,text,text,text,text)')),'UTF8')),'hex') IS DISTINCT FROM 'd4ed58442dd4fa1c9f6bd0594e347c1e394a2870356efa88b542bdee34e6ea37' THEN
  RAISE EXCEPTION 'Installed creator.generation_open_provider_usage definition changed';
 END IF;
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_agent_journal_receipt(uuid,uuid)')),'UTF8')),'hex') IS DISTINCT FROM '557c1558773e36ced55aca522e16e15d975665afb3873a95cbab9661e0d76f4b' THEN
  RAISE EXCEPTION 'Installed creator.generation_agent_journal_receipt definition changed';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION creator.generation_agent_inputs(g uuid, w uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
 WHERE creator_id=c AND NOT paused AND deleted_at IS NULL FOR SHARE;
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
END $function$;
CREATE OR REPLACE FUNCTION creator.generation_begin_agent_attempt(g uuid, w uuid, v text, m text, ceiling bigint, retention text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE task jsonb; facts jsonb; c uuid; cap bigint; spent bigint; uncertain bigint; held bigint; hold_id uuid;
BEGIN
 IF session_user<>'creator_generation_worker' OR NOT creator.generation_scope_matches(g,w)
  OR v IS NULL OR v !~ '^[a-f0-9]{64}$' OR m IS NULL OR m !~ '^[a-f0-9]{64}$'
  OR ceiling IS NULL OR ceiling<=0 OR ceiling>1000000000 OR retention IS NULL OR length(retention) NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Use current genuine attempt admission' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 c:=(task->>'creatorId')::uuid;
 -- Preserve global W2 workspace→journal lock order, on this held client only.
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Deleted workspace cannot be recreated' USING ERRCODE='55000'; END IF;
 facts:=creator.generation_agent_inputs(g,w);
 IF facts->'version'->>'compiledHash' IS DISTINCT FROM v THEN RAISE EXCEPTION 'Compiled version changed' USING ERRCODE='55000'; END IF;
 PERFORM creator_id FROM creator.ai_generation_admission WHERE creator_id=c AND generation_id=g AND state='open'
  AND thread_id=(task->>'threadId')::uuid AND fan_id=(task->>'fanId')::uuid
  AND actor_account_id=(task->>'initiatingAccountId')::uuid AND retention_policy_version=retention FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Actual acceptance-initialized journal is required' USING ERRCODE='55000'; END IF;
 SELECT a.creator_hold_id INTO hold_id FROM creator.ai_generation_attempt a JOIN creator.ai_cost_hold h ON h.id=a.creator_hold_id
 WHERE a.creator_id=c AND a.generation_id=g AND a.attempt_id=w AND a.state='open'
  AND a.admission_version_hash=v AND a.admission_model_fingerprint=m
  AND h.creator_id=c AND h.state='held' AND h.expires_at>clock_timestamp() FOR UPDATE OF a NOWAIT;
 IF FOUND THEN
  IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Attempt authority ended' USING ERRCODE='42501'; END IF;
  RETURN hold_id;
 END IF;
 IF EXISTS(SELECT FROM creator.ai_generation_attempt WHERE creator_id=c AND generation_id=g AND attempt_id=w) THEN
  RAISE EXCEPTION 'A previous or unqualified attempt cannot be adopted' USING ERRCODE='55000';
 END IF;
 -- Expired remote reservations remain uncertain rather than restoring budget.
 WITH expired AS (UPDATE creator.ai_cost_hold SET state='settled' WHERE creator_id=c AND state='held'
   AND expires_at<=clock_timestamp() RETURNING id)
 INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,creator_hold_id)
 SELECT c,id::text,'unreconciled','expired-cost-hold',0,0,NULL,'provider_unknown',0,id FROM expired;
 -- An interrupted reply's unknown provider cost counts as its whole cost hold
 -- (founder decision 2026-10-15). Record that estimate once per hold that is no
 -- longer live, dated when the hold was taken; the unknown rows stay unknown for
 -- reconciliation and its escalation. An unknown row on a live hold is a call
 -- still in flight, which the held amount already covers.
 INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,created_at,creator_hold_id,purpose)
 SELECT c,h.id::text,'estimate','interrupted-cost-hold',0,0,
  greatest(h.amount_micros-coalesce((SELECT sum(k.cost_micros) FROM creator.ai_usage k
   WHERE k.creator_id=c AND k.creator_hold_id=h.id AND k.cost_micros IS NOT NULL),0),0),
  'provider_unknown',0,h.created_at,h.id,'interrupted_hold_estimate'
 FROM creator.ai_cost_hold h
 WHERE h.creator_id=c AND NOT(h.state='held' AND h.expires_at>clock_timestamp())
  AND EXISTS(SELECT FROM creator.ai_usage u WHERE u.creator_id=c AND u.creator_hold_id=h.id AND u.cost_micros IS NULL
   AND u.category IN('reply','guardrail','memory','provider_unknown'))
  AND NOT EXISTS(SELECT FROM creator.ai_usage e WHERE e.creator_id=c AND e.creator_hold_id=h.id
   AND e.purpose='interrupted_hold_estimate');
 SELECT coalesce(sum(u.cost_micros) FILTER(WHERE u.created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0),
  count(*) FILTER(WHERE u.cost_micros IS NULL AND (u.creator_hold_id IS NULL OR NOT EXISTS(SELECT FROM creator.ai_cost_hold h
   WHERE h.id=u.creator_hold_id AND h.state='held' AND h.expires_at>clock_timestamp())) AND NOT EXISTS(SELECT FROM creator.ai_usage e
   WHERE e.creator_id=c AND e.creator_hold_id=u.creator_hold_id AND e.purpose='interrupted_hold_estimate'))
  INTO spent,uncertain FROM creator.ai_usage u
  WHERE u.creator_id=c AND u.category IN('reply','guardrail','memory','provider_unknown');
 SELECT coalesce(sum(amount_micros),0) INTO held FROM creator.ai_cost_hold WHERE creator_id=c AND state='held' AND expires_at>clock_timestamp();
 cap:=(facts->'version'->'configuration'->>'dailyCostCapMicros')::bigint;
 IF uncertain<>0 OR cap IS NULL OR cap<=0 OR spent+held+ceiling>cap THEN
  RAISE EXCEPTION 'Current creator budget or uncertain provider cost prevents admission' USING ERRCODE='55000';
 END IF;
 hold_id:=gen_random_uuid();
 INSERT INTO creator.ai_cost_hold(id,creator_id,amount_micros,state,expires_at) VALUES(hold_id,c,ceiling,'held',clock_timestamp()+interval '5 minutes');
 UPDATE creator.ai_generation_attempt SET state='abandoned',closed_at=clock_timestamp() WHERE creator_id=c AND generation_id=g AND state='open';
 INSERT INTO creator.ai_generation_attempt(creator_id,generation_id,attempt_id,thread_id,fan_id,creator_hold_id,admission_version_hash,admission_model_fingerprint)
 VALUES(c,g,w,(task->>'threadId')::uuid,(task->>'fanId')::uuid,hold_id,v,m);
 IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Attempt authority ended' USING ERRCODE='42501'; END IF;
 RETURN hold_id;
END $function$;
CREATE OR REPLACE FUNCTION creator.generation_open_provider_usage(g uuid, w uuid, v text, m text, category_name text, capability text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE task jsonb; facts jsonb; c uuid; hold_id uuid; ordinal integer; usage_id uuid;
BEGIN
 IF session_user<>'creator_generation_worker' OR NOT creator.generation_scope_matches(g,w)
  OR category_name IS NULL OR category_name NOT IN('reply','guardrail','memory')
  OR capability IS NULL OR capability !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Use current genuine provider admission' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 c:=(task->>'creatorId')::uuid;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current workspace is required' USING ERRCODE='55000'; END IF;
 facts:=creator.generation_agent_inputs(g,w);
 IF facts->'version'->>'compiledHash' IS DISTINCT FROM v THEN RAISE EXCEPTION 'Current compiled version is required' USING ERRCODE='55000'; END IF;
 PERFORM creator_id FROM creator.ai_generation_admission WHERE creator_id=c AND generation_id=g AND state='open' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Actual open accepted journal is required' USING ERRCODE='55000'; END IF;
 SELECT a.creator_hold_id INTO hold_id FROM creator.ai_generation_attempt a JOIN creator.ai_cost_hold h ON h.id=a.creator_hold_id
 WHERE a.creator_id=c AND a.generation_id=g AND a.attempt_id=w AND a.state='open'
  AND a.thread_id=(task->>'threadId')::uuid AND a.fan_id=(task->>'fanId')::uuid
  AND a.admission_version_hash=v AND a.admission_model_fingerprint=m
  AND h.creator_id=c AND h.state='held' AND h.expires_at>clock_timestamp() FOR UPDATE OF a NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current matching cost attempt is required' USING ERRCODE='55000'; END IF;
 UPDATE creator.ai_generation_attempt SET provider_admissions=provider_admissions+1
 WHERE creator_id=c AND generation_id=g AND attempt_id=w AND state='open' AND provider_admissions<22
 RETURNING provider_admissions INTO ordinal;
 IF NOT FOUND THEN RAISE EXCEPTION 'The bounded provider attempt is exhausted' USING ERRCODE='55000'; END IF;
 usage_id:=gen_random_uuid();
 INSERT INTO creator.ai_usage(id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,
  thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,provider_state,creator_hold_id,completion_capability_hash)
 VALUES(usage_id,c,v,'configured',m,0,0,NULL,category_name,0,(task->>'threadId')::uuid,(task->>'fanId')::uuid,g,w,ordinal,
  category_name,'admitted',hold_id,sha256(convert_to(usage_id::text||':'||g::text||':'||w::text||':'||capability,'UTF8')));
 IF NOT creator.generation_scope_matches(g,w) THEN RAISE EXCEPTION 'Provider admission authority ended' USING ERRCODE='42501'; END IF;
 RETURN usage_id;
END $function$;
CREATE OR REPLACE FUNCTION creator.generation_agent_journal_receipt(g uuid, k uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE task jsonb; c uuid; admission record; receipt record;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR k IS NULL OR NOT creator.generation_terminal_matches(g,k,true) THEN
  RAISE EXCEPTION 'Actual finalized original terminal purpose required' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 IF task IS NULL THEN RAISE EXCEPTION 'Private same-client terminal nonce required' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE;
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
END $function$;

-- CREATE OR REPLACE keeps each function's owner, ACL and configuration. No new grant.
COMMIT;
