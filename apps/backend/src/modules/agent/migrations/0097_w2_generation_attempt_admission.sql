-- Held0097; requires actual reviewed0072/0077/0093/0096, W3 accepted
-- initialization and C10 hook/retention qualification. Never register itself.
-- This supplies admission and already-admitted usage completion only. Final
-- job transition/receipt sealing/settlement uses the distinct0099/0100 purpose.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_journal') THEN
  CREATE ROLE creator_w2_generation_journal NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_journal'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN RAISE EXCEPTION 'Unsafe W2 admission custody'; END IF;
 IF to_regprocedure('creator.generation_agent_inputs(uuid,uuid)') IS NULL
  OR to_regclass('creator.ai_generation_attempt') IS NULL THEN RAISE EXCEPTION 'Current input and accepted accounting custody required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w2_generation_journal;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.generation_agent_inputs(uuid,uuid)
 TO creator_w2_generation_journal;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.ai_generation_attempt ADD COLUMN admission_version_hash text CHECK(admission_version_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN admission_model_fingerprint text CHECK(admission_model_fingerprint ~ '^[a-f0-9]{64}$');
-- Opaque capability is generated privately before admission, stored only as a
-- digest, and permits completion of one already committed call after revocation.
-- It is not input/provider/session/consent authority and is never exported.
ALTER TABLE creator.ai_usage ADD COLUMN completion_capability_hash bytea CHECK(octet_length(completion_capability_hash)=32);
CREATE FUNCTION creator.ai_usage_completion_custody_immutable() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.completion_capability_hash IS NOT NULL AND current_user<>'creator_w2_generation_journal' THEN
  RAISE EXCEPTION 'Completion custody requires actual private admission' USING ERRCODE='42501';
 ELSIF TG_OP='UPDATE' AND NEW.completion_capability_hash IS DISTINCT FROM OLD.completion_capability_hash THEN
  RAISE EXCEPTION 'Admitted completion custody is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND OLD.completion_capability_hash IS NOT NULL THEN
  IF ROW(NEW.id,NEW.creator_id,NEW.version_hash,NEW.category,NEW.purpose)
   IS DISTINCT FROM ROW(OLD.id,OLD.creator_id,OLD.version_hash,OLD.category,OLD.purpose) THEN
   RAISE EXCEPTION 'Original admitted usage binding is immutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.thread_id,NEW.fan_id,NEW.generation_id,NEW.attempt_id,NEW.call_ordinal,NEW.creator_hold_id)
   IS DISTINCT FROM ROW(OLD.thread_id,OLD.fan_id,OLD.generation_id,OLD.attempt_id,OLD.call_ordinal,OLD.creator_hold_id)
   AND NOT(NEW.thread_id IS NULL AND NEW.fan_id IS NULL AND NEW.generation_id IS NULL
    AND NEW.attempt_id IS NULL AND NEW.call_ordinal IS NULL AND NEW.creator_hold_id IS NULL) THEN
   RAISE EXCEPTION 'Original family may only be detached, never rebound' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW.provider,NEW.model,NEW.input_tokens,NEW.output_tokens,NEW.cost_micros,NEW.duration_ms,
    NEW.cached_input_tokens,NEW.cache_write_input_tokens,NEW.provider_state,NEW.completed_at)
   IS DISTINCT FROM ROW(OLD.provider,OLD.model,OLD.input_tokens,OLD.output_tokens,OLD.cost_micros,OLD.duration_ms,
    OLD.cached_input_tokens,OLD.cache_write_input_tokens,OLD.provider_state,OLD.completed_at)
   AND current_user<>'creator_w2_generation_journal' THEN
   RAISE EXCEPTION 'Completion requires original private capability custody' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.ai_usage_completion_custody_immutable() FROM PUBLIC;
CREATE TRIGGER ai_usage_completion_custody_immutable BEFORE INSERT OR UPDATE ON creator.ai_usage
 FOR EACH ROW EXECUTE FUNCTION creator.ai_usage_completion_custody_immutable();
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w2_generation_journal;
CREATE POLICY w2_generation_journal_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w2_generation_journal USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(creator_id),UPDATE(creator_id) ON creator.ai_workspace TO creator_w2_generation_journal;
GRANT SELECT,INSERT,UPDATE ON creator.ai_cost_hold,creator.ai_generation_attempt TO creator_w2_generation_journal;
GRANT SELECT ON creator.ai_generation_admission TO creator_w2_generation_journal;
GRANT UPDATE(creator_id) ON creator.ai_generation_admission TO creator_w2_generation_journal;
GRANT SELECT(id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,created_at,
 cached_input_tokens,cache_write_input_tokens,creator_hold_id,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,
 provider_state,completed_at,completion_capability_hash),INSERT,
 UPDATE(provider,model,input_tokens,output_tokens,cost_micros,duration_ms,cached_input_tokens,cache_write_input_tokens,provider_state,completed_at)
 ON creator.ai_usage TO creator_w2_generation_journal;
DO $$ DECLARE t text; predicate text; BEGIN
 predicate:='creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_worker_scope s)';
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_cost_hold','ai_generation_attempt','ai_generation_admission'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_journal_read ON creator.%I FOR SELECT TO creator_w2_generation_journal USING(%s)',t,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_cost_hold','ai_generation_attempt'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_journal_write ON creator.%I FOR ALL TO creator_w2_generation_journal USING(%s) WITH CHECK(%s)',t,predicate,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['ai_workspace','ai_generation_admission'] LOOP
  EXECUTE format('CREATE POLICY w2_generation_journal_lock ON creator.%I FOR UPDATE TO creator_w2_generation_journal USING(%s) WITH CHECK(false)',t,predicate);
 END LOOP;
 EXECUTE format('CREATE POLICY w2_generation_usage_insert ON creator.ai_usage FOR INSERT TO creator_w2_generation_journal WITH CHECK(%s)',predicate);
END $$;
-- The inaccessible fixed completion function can project only accounting
-- metadata. Its exact usage ID plus256-bit capability must match before update;
-- the worker has no raw table/column access or membership in this owner role.
CREATE POLICY w2_generation_usage_completion_read ON creator.ai_usage FOR SELECT TO creator_w2_generation_journal USING(true);
CREATE POLICY w2_generation_usage_completion_write ON creator.ai_usage FOR UPDATE TO creator_w2_generation_journal USING(true) WITH CHECK(true);

CREATE FUNCTION creator.generation_begin_agent_attempt(g uuid,w uuid,v text,m text,ceiling bigint,retention text) RETURNS uuid
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
 SELECT coalesce(sum(cost_micros) FILTER(WHERE created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0),
  count(*) FILTER(WHERE cost_micros IS NULL) INTO spent,uncertain FROM creator.ai_usage
  WHERE creator_id=c AND category IN('reply','guardrail','memory','provider_unknown');
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

CREATE FUNCTION creator.generation_open_provider_usage(g uuid,w uuid,v text,m text,category_name text,capability text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; facts jsonb; c uuid; hold_id uuid; ordinal integer; usage_id uuid;
BEGIN
 IF session_user<>'creator_generation_worker' OR NOT creator.generation_scope_matches(g,w)
  OR category_name IS NULL OR category_name NOT IN('reply','guardrail','memory')
  OR capability IS NULL OR capability !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Use current genuine provider admission' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 c:=(task->>'creatorId')::uuid;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c FOR UPDATE NOWAIT;
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
END $$;

CREATE FUNCTION creator.generation_finish_provider_usage(usage_id uuid,g uuid,w uuid,capability text,usage_data jsonb,duration integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row_id uuid; cached integer; written integer; input_count integer; output_count integer; cost bigint;
BEGIN
 -- Deliberately no current generation scope: this is one original admitted
 -- charge, never permission to start another call or resurrect private inputs.
 IF session_user<>'creator_generation_worker' OR usage_id IS NULL OR g IS NULL OR w IS NULL OR capability IS NULL
  OR capability !~ '^[a-f0-9]{64}$' OR duration IS NULL OR duration<0 OR jsonb_typeof(usage_data) IS DISTINCT FROM 'object'
  OR usage_data->>'provider' IS NULL OR length(usage_data->>'provider') NOT BETWEEN 1 AND 160
  OR usage_data->>'model' IS NULL OR length(usage_data->>'model') NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Original admitted completion custody required' USING ERRCODE='42501';
 END IF;
 input_count:=(usage_data->>'inputTokens')::integer; output_count:=(usage_data->>'outputTokens')::integer;
 cached:=(usage_data->>'cachedInputTokens')::integer; written:=(usage_data->>'cacheWriteInputTokens')::integer;
 cost:=(usage_data->>'costMicros')::bigint;
 IF input_count IS NULL OR output_count IS NULL OR input_count<0 OR output_count<0
  OR cached<0 OR written<0 OR coalesce(cached,0)::bigint+coalesce(written,0)::bigint>input_count
  OR cost<0 OR cost>9007199254740991 THEN RAISE EXCEPTION 'Reported usage is invalid' USING ERRCODE='22023'; END IF;
 SELECT id INTO row_id FROM creator.ai_usage WHERE id=usage_id AND provider_state='admitted'
  AND completion_capability_hash=sha256(convert_to(usage_id::text||':'||g::text||':'||w::text||':'||capability,'UTF8')) FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Admitted usage is missing, completed or belongs to another capability' USING ERRCODE='42501'; END IF;
 UPDATE creator.ai_usage SET provider=usage_data->>'provider',model=usage_data->>'model',input_tokens=input_count,output_tokens=output_count,
  cached_input_tokens=cached,cache_write_input_tokens=written,cost_micros=cost,duration_ms=duration,
  provider_state='completed',completed_at=clock_timestamp() WHERE id=row_id AND provider_state='admitted';
 RETURN FOUND;
END $$;
RESET ROLE;
DO $$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY['creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)'::regprocedure,
  'creator.generation_open_provider_usage(uuid,uuid,text,text,text,text)'::regprocedure,
  'creator.generation_finish_provider_usage(uuid,uuid,uuid,text,jsonb,integer)'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO creator_w2_generation_journal',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO creator_generation_worker',f);
 END LOOP;
END $$;
COMMIT;
