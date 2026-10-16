-- Pending (lane 3, A6): an interrupted reply's unknown provider cost no longer
-- locks the creator's AI. Founder decision 2026-10-15: count the interrupted
-- reply's whole cost hold as spent, record it as an estimate, and unlock.
-- Replaces only creator.generation_begin_agent_attempt from 0181 (file 0097);
-- every check except the budget section is byte-identical. The unknown usage
-- rows are not changed, so reconciliation, its escalation and the W4 terminal
-- settlement (0237, full fan ceiling for an unknown receipt) behave as before.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)')),'UTF8')),'hex') IS DISTINCT FROM 'f93fcc061f6d26ec81c3b981194b9913f25a3eb232c590b2ea19e35b8bb940c4' THEN
  RAISE EXCEPTION 'Original W2 attempt admission definition changed';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION creator.generation_begin_agent_attempt(g uuid,w uuid,v text,m text,ceiling bigint,retention text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE NOWAIT;
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
END $$;

-- CREATE OR REPLACE retains the original owner and exact ACL. No new grant.
COMMIT;
