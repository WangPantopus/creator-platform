-- Held0182_w4_generation_allowance_audience. Corrected assigned registration.
-- Original0098 source is preserved at schema-generation-audience.sql.
-- W8 alone owns canonical registration and exact-byte activation.
-- Requires genuine0072 and0049;0093/0096 and each executable consumer must be
-- reviewed/activated together. This proposal does not write the migration ledger.
-- No Actor/session/GUC permission, source body, provider admission or money write.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w4_generation_audience') THEN
  CREATE ROLE creator_w4_generation_audience NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w4_generation_audience'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing W4 generation audience custody';
 END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid=to_regclass('creator.commerce_allowance_reservation')
    AND attname='cost_policy_version' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Genuine generation scope and original weighted allowance are required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w4_generation_audience;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid) TO creator_w4_generation_audience;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_w4_generation_audience;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w4_generation_audience;
CREATE POLICY w4_generation_audience_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w4_generation_audience USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
-- Existing invoker commerce_scope policies also need these exact profile
-- public metadata columns to plan. The fixed reader never sets interactive
-- GUCs, reads private profile fields or projects profiles in its result.
GRANT SELECT(id,account_id,verification) ON creator.creator_profile TO creator_w4_generation_audience;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_w4_generation_audience;
GRANT SELECT(id,creator_id,fan_id,grant_id,key,units,state,cost_policy_version,pass_id,pass_cycle),UPDATE(id)
 ON creator.commerce_allowance_reservation TO creator_w4_generation_audience;
GRANT SELECT(id,creator_id,fan_id,tier_id,state,period_start,period_end,grace_end,grant_id,version),UPDATE(id)
 ON creator.commerce_membership TO creator_w4_generation_audience;
GRANT SELECT(id,creator_id,fan_id,source,state,capabilities,valid_from,valid_until,reserved),UPDATE(id)
 ON creator.access_grant TO creator_w4_generation_audience;
GRANT SELECT(id,fan_id,state,cycle_start,cycle_end,reserved,version),UPDATE(id)
 ON creator.commerce_pass TO creator_w4_generation_audience;
GRANT SELECT(id,pass_id,fan_id,creator_id,grant_id,state,starts_at,ends_at),UPDATE(id)
 ON creator.commerce_pass_slot TO creator_w4_generation_audience;
DO $$ DECLARE t text; predicate text; BEGIN
 predicate := 'creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_worker_scope s)
 AND fan_id=(SELECT (s.task->>''fanId'')::uuid FROM creator.generation_worker_scope s)';
 FOREACH t IN ARRAY ARRAY['commerce_allowance_reservation','commerce_membership','access_grant','commerce_pass_slot'] LOOP
  EXECUTE format('CREATE POLICY w4_generation_audience_read ON creator.%I FOR SELECT TO creator_w4_generation_audience USING(%s)',t,predicate);
  EXECUTE format('CREATE POLICY w4_generation_audience_lock ON creator.%I FOR UPDATE TO creator_w4_generation_audience USING(%s) WITH CHECK(false)',t,predicate);
 END LOOP;
 predicate := 'fan_id=(SELECT (s.task->>''fanId'')::uuid FROM creator.generation_worker_scope s)';
 EXECUTE format('CREATE POLICY w4_generation_audience_read ON creator.commerce_pass FOR SELECT TO creator_w4_generation_audience USING(%s)',predicate);
 EXECUTE format('CREATE POLICY w4_generation_audience_lock ON creator.commerce_pass FOR UPDATE TO creator_w4_generation_audience USING(%s) WITH CHECK(false)',predicate);
END $$;
CREATE FUNCTION creator.generation_allowance_audience(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; created timestamptz; c uuid; f uuid; v_reservation_id uuid; v_grant_id uuid;
 reservation jsonb; original_grant jsonb; memberships uuid[]; membership_facts jsonb;
 pass_data jsonb; slot_data jsonb; v_pass_id uuid; v_pass_cycle date;
 valid_until timestamptz; original_until timestamptz; member_until timestamptz;
 tiers jsonb; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0182_w4_generation_allowance_audience' AND checksum ~ '^[a-f0-9]{64}$')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0159_w1_generation_worker_scope'
   AND checksum='7de41bf10228219d69480e302bac7d69626d8d848d8276bb1fe54e49112a5627')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0049_w4_generation_cost_settlement'
   AND checksum='00f4c2cc2962a0e9f14b0ba0ad57f23823fcc811042e8d6b8b9c6dc5394daffc')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0177_w8_generation_worker_denial' AND checksum ~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'Reviewed generation audience wave is not activated' USING ERRCODE='55000';
 END IF;
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the actual current generation purpose' USING ERRCODE='42501';
 END IF;
 SELECT s.task,s.created_at INTO task,created FROM creator.generation_worker_scope s
 WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL OR task->>'reservationId' IS NULL THEN
  RAISE EXCEPTION 'The actual original weighted reservation is required' USING ERRCODE='55000';
 END IF;
 c:=(task->>'creatorId')::uuid; f:=(task->>'fanId')::uuid;
 v_reservation_id:=(task->>'reservationId')::uuid; v_grant_id:=(task->>'grantId')::uuid;
 -- No spent/released/legacy hold is adopted. The reservation lease precedes
 -- all positive financial leases, matching the actual terminal settlement.
 SELECT jsonb_build_object('id',r.id,'grantId',r.grant_id,'units',r.units,'policy',r.cost_policy_version,
  'passId',r.pass_id,'passCycle',r.pass_cycle),r.pass_id,r.pass_cycle
 INTO reservation,v_pass_id,v_pass_cycle FROM creator.commerce_allowance_reservation r
 WHERE r.id=v_reservation_id AND r.creator_id=c AND r.fan_id=f AND r.grant_id=v_grant_id
  AND r.key='generation:'||g::text AND r.state='reserved' AND r.units>0
  AND length(r.cost_policy_version) BETWEEN 1 AND 200 FOR SHARE NOWAIT;
 IF reservation IS NULL THEN
  RAISE EXCEPTION 'The original weighted allowance is unavailable' USING ERRCODE='55000';
 END IF;
 -- Memberships precede grants. A revoked grant never supplies tier access;
 -- the later projection re-reads truth while both row leases are held.
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO memberships FROM (
  SELECT m.id FROM creator.commerce_membership m WHERE m.creator_id=c AND m.fan_id=f
   AND m.state IN('active','grace','cancelled') AND m.period_start<=clock_timestamp()
   AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>clock_timestamp()
   ORDER BY m.id LIMIT 1001 FOR SHARE NOWAIT
 ) candidates;
 IF cardinality(memberships)>1000 THEN
  RAISE EXCEPTION 'Current membership audience requires reconciliation' USING ERRCODE='55000';
 END IF;
 IF v_pass_id IS NOT NULL THEN
  SELECT jsonb_build_object('id',p.id,'version',p.version,'cycleStart',p.cycle_start,'cycleEnd',p.cycle_end)
  INTO pass_data FROM creator.commerce_pass p WHERE p.id=v_pass_id AND p.fan_id=f
   AND p.state IN('active','cancelled') AND p.cycle_start=v_pass_cycle
   AND p.cycle_start<=(clock_timestamp() AT TIME ZONE 'UTC')::date
   AND p.cycle_end>(clock_timestamp() AT TIME ZONE 'UTC')::date
   AND p.reserved>=(reservation->>'units')::integer FOR SHARE NOWAIT;
  IF pass_data IS NULL THEN RAISE EXCEPTION 'Current original pass cycle is unavailable' USING ERRCODE='55000'; END IF;
  SELECT jsonb_build_object('id',s.id,'startsAt',s.starts_at,'endsAt',s.ends_at),s.ends_at
  INTO slot_data,original_until FROM creator.commerce_pass_slot s
  WHERE s.pass_id=v_pass_id AND s.fan_id=f AND s.creator_id=c AND s.grant_id=v_grant_id
   AND s.state='active' AND s.starts_at<=clock_timestamp() AND s.ends_at>clock_timestamp()
   FOR SHARE NOWAIT;
  IF slot_data IS NULL OR (SELECT count(*) FROM creator.commerce_pass_slot s WHERE s.pass_id=v_pass_id
    AND s.fan_id=f AND s.creator_id=c AND s.grant_id=v_grant_id AND s.state='active')<>1 THEN
   RAISE EXCEPTION 'The original current pass slot is unavailable' USING ERRCODE='55000';
  END IF;
 END IF;
 PERFORM a.id FROM creator.access_grant a WHERE a.creator_id=c AND a.fan_id=f
  AND (a.id=v_grant_id OR a.id IN(SELECT m.grant_id FROM creator.commerce_membership m WHERE m.id=ANY(memberships)))
  ORDER BY a.id FOR SHARE NOWAIT;
 SELECT jsonb_build_object('id',a.id,'source',a.source,'capabilities',a.capabilities,
  'validFrom',a.valid_from,'validUntil',a.valid_until),least(a.valid_until,original_until)
 INTO original_grant,original_until FROM creator.access_grant a
 WHERE a.id=v_grant_id AND a.creator_id=c AND a.fan_id=f AND a.state='active'
  AND a.valid_from<=clock_timestamp() AND a.valid_until>clock_timestamp()
  AND 'ai_message'=ANY(a.capabilities) AND a.reserved>=(reservation->>'units')::integer
  AND ((a.source='pass_slot')=(v_pass_id IS NOT NULL));
 IF original_grant IS NULL THEN RAISE EXCEPTION 'Current original AI grant is unavailable' USING ERRCODE='42501'; END IF;
 WITH current_memberships AS (
  SELECT m.id,m.tier_id,m.version,m.grant_id,m.period_start,m.period_end,m.state,
   least(CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END,a.valid_until) AS ends_at
  FROM creator.commerce_membership m JOIN creator.access_grant a ON a.id=m.grant_id
   AND a.creator_id=m.creator_id AND a.fan_id=m.fan_id
  WHERE m.id=ANY(memberships) AND m.creator_id=c AND m.fan_id=f
   AND m.state IN('active','grace','cancelled') AND m.period_start<=clock_timestamp()
   AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>clock_timestamp()
   AND a.source='membership' AND a.state='active' AND a.valid_from<=clock_timestamp()
   AND a.valid_until>clock_timestamp() AND 'ai_message'=ANY(a.capabilities)
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'tierId',tier_id,'version',version,'grantId',grant_id,
    'periodStart',period_start,'periodEnd',period_end,'state',state,'endsAt',ends_at) ORDER BY tier_id,id),'[]'::jsonb),
   coalesce((SELECT jsonb_agg(tier_id ORDER BY tier_id) FROM (SELECT DISTINCT tier_id FROM current_memberships) t),'[]'::jsonb),
   min(ends_at) INTO membership_facts,tiers,member_until FROM current_memberships;
 valid_until:=least(clock_timestamp()+interval '5 seconds',created+interval '5 seconds',
  (task->>'leaseUntil')::timestamptz,original_until,member_until,
  CASE WHEN pass_data IS NOT NULL THEN (pass_data->>'cycleEnd')::date::timestamp AT TIME ZONE 'UTC' ELSE NULL END);
 IF valid_until<=clock_timestamp() OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Generation audience authority ended during the read' USING ERRCODE='42501';
 END IF;
 result:=jsonb_build_object('revision',encode(sha256(convert_to(jsonb_build_object(
  'generationId',g,'reservation',reservation,'grant',original_grant,'memberships',membership_facts,
  'pass',pass_data,'slot',slot_data,'groups',NULL)::text,'UTF8')),'hex'),
  'tierIds',tiers,'groupIds','[]'::jsonb,'validUntil',valid_until);
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_allowance_audience(uuid,uuid) OWNER TO creator_w4_generation_audience;
REVOKE ALL ON FUNCTION creator.generation_allowance_audience(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_allowance_audience(uuid,uuid) TO creator_generation_worker;
-- Do not create peer roles or depend on a later allocation. Each real W2
-- producer migration grants this exact entrypoint after its own role review.
DO $$ DECLARE r oid; BEGIN
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_generation_input';
 IF r IS NOT NULL THEN
  IF EXISTS(SELECT FROM pg_roles WHERE oid=r AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole
    OR rolinherit OR rolbypassrls OR rolreplication OR rolconfig IS NOT NULL))
   OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
   OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r) THEN
   RAISE EXCEPTION 'Unsafe W2 generation input recipient';
  END IF;
  GRANT EXECUTE ON FUNCTION creator.generation_allowance_audience(uuid,uuid) TO creator_w2_generation_input;
 END IF;
END $$;
COMMIT;
