-- Held0106 W4 original generation terminal settlement. W8 alone activates.
-- Exact0099/0100/0105 custody; no caller amount, output, actor or licence.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)') IS NULL
  OR to_regclass('creator.ai_generation_receipt') IS NULL THEN
  RAISE EXCEPTION 'Original terminal and all-attempt journal custody required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w4_generation_terminal') THEN
  CREATE ROLE creator_w4_generation_terminal NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w4_generation_terminal'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
  AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN RAISE EXCEPTION 'Unsafe original financial terminal role'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w4_generation_terminal;
GRANT EXECUTE ON FUNCTION creator.generation_terminal_matches(uuid,uuid,boolean) TO creator_w4_generation_terminal;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_allowance_reservation ADD COLUMN cost_rule jsonb;
CREATE FUNCTION creator.commerce_original_cost_rule() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Original cost custody is retained'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.cost_rule IS DISTINCT FROM OLD.cost_rule THEN RAISE EXCEPTION 'Original cost rule cannot be backfilled or reweighted'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.cost_policy_version IS NOT NULL AND (
  NEW.cost_rule IS NULL OR jsonb_typeof(NEW.cost_rule)<>'object'
  OR jsonb_typeof(NEW.cost_rule->'version') IS DISTINCT FROM 'string'
  OR jsonb_typeof(NEW.cost_rule->'microsPerUnit') IS DISTINCT FROM 'number'
  OR jsonb_typeof(NEW.cost_rule->'ceilingUnits') IS DISTINCT FROM 'number'
  OR jsonb_typeof(NEW.cost_rule->'rounding') IS DISTINCT FROM 'string'
  OR NEW.cost_rule - ARRAY['version','microsPerUnit','ceilingUnits','rounding'] <> '{}'::jsonb
  OR NEW.cost_rule->>'version' IS DISTINCT FROM NEW.cost_policy_version
  OR NEW.cost_rule->>'rounding' IS DISTINCT FROM 'ceil'
  OR coalesce(NEW.cost_rule->>'microsPerUnit','') !~ '^[1-9][0-9]*$'
  OR coalesce(NEW.cost_rule->>'ceilingUnits','') !~ '^[1-9][0-9]*$'
  OR (NEW.cost_rule->>'microsPerUnit')::numeric>9007199254740991
  OR (NEW.cost_rule->>'ceilingUnits')::numeric IS DISTINCT FROM NEW.units::numeric
 ) THEN RAISE EXCEPTION 'Weighted admission requires the exact original approved cost rule and ceiling'; END IF;
 IF NEW.cost_policy_version IS NULL AND NEW.cost_rule IS NOT NULL THEN
  RAISE EXCEPTION 'Historical fixed-unit admission has no invented cost rule';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.commerce_original_cost_rule() FROM PUBLIC;
CREATE TRIGGER commerce_original_cost_rule BEFORE INSERT OR UPDATE OR DELETE
 ON creator.commerce_allowance_reservation FOR EACH ROW EXECUTE FUNCTION creator.commerce_original_cost_rule();
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,custody_token,task,transitioned,finalized,created_at)
 ON creator.generation_terminal_scope TO creator_w4_generation_terminal;
CREATE POLICY w4_terminal_financial_nonce ON creator.generation_terminal_scope FOR SELECT TO creator_w4_generation_terminal USING(
 session_user='creator_generation_worker' AND login_name=session_user AND backend_pid=pg_backend_pid()
 AND transaction_id=pg_current_xact_id_if_assigned()
 AND id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
 AND transitioned AND finalized AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND nullif(current_setting('app.account_id',true),'') IS NULL AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle,cost_policy_version,settled_units,settlement_ref,output_delivered,cost_rule),
 UPDATE(state,settled_units,settlement_ref,output_delivered)
 ON creator.commerce_allowance_reservation TO creator_w4_generation_terminal;
GRANT SELECT(creator_id,generation_id,thread_id,fan_id,actor_account_id,state,retention_policy_version)
 ON creator.ai_generation_admission TO creator_w4_generation_terminal;
GRANT SELECT(creator_id,generation_id,thread_id,fan_id,state,cost_micros,usage_ids,attempt_ids,receipt_hash,revision)
 ON creator.ai_generation_receipt TO creator_w4_generation_terminal;
GRANT SELECT(id,creator_id,fan_id,used,reserved),UPDATE(used,reserved)
 ON creator.access_grant TO creator_w4_generation_terminal;
GRANT SELECT(id,cycle_start,used,reserved,version),UPDATE(used,reserved,version)
 ON creator.commerce_pass TO creator_w4_generation_terminal;
GRANT SELECT(id,creator_id,fan_id,grant_id,first_used_at),UPDATE(first_used_at)
 ON creator.commerce_membership TO creator_w4_generation_terminal;
GRANT INSERT(creator_id,fan_id,membership_id,evidence_id,kind),SELECT(creator_id,fan_id,membership_id,evidence_id,kind)
 ON creator.commerce_membership_usage TO creator_w4_generation_terminal;
CREATE POLICY w4_terminal_reservation_read ON creator.commerce_allowance_reservation FOR SELECT TO creator_w4_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE creator_id=(s.task->>'creatorId')::uuid
  AND fan_id=(s.task->>'fanId')::uuid AND grant_id=(s.task->>'grantId')::uuid
  AND commerce_allowance_reservation.id=(s.task->>'reservationId')::uuid AND key='generation:'||s.generation_id::text));
CREATE POLICY w4_terminal_reservation_write ON creator.commerce_allowance_reservation FOR UPDATE TO creator_w4_generation_terminal
 USING(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE commerce_allowance_reservation.id=(s.task->>'reservationId')::uuid AND grant_id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid AND key='generation:'||s.generation_id::text))
 WITH CHECK(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE commerce_allowance_reservation.id=(s.task->>'reservationId')::uuid AND grant_id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid AND key='generation:'||s.generation_id::text));
DO $$ DECLARE t text; predicate text; BEGIN
 predicate:='EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE creator_id=(s.task->>''creatorId'')::uuid
  AND fan_id=(s.task->>''fanId'')::uuid AND generation_id=s.generation_id AND thread_id=(s.task->>''threadId'')::uuid)';
 FOREACH t IN ARRAY ARRAY['ai_generation_admission','ai_generation_receipt'] LOOP
  EXECUTE format('CREATE POLICY w4_terminal_accounting_read ON creator.%I FOR SELECT TO creator_w4_generation_terminal USING(%s)',t,predicate);
 END LOOP;
END $$;
CREATE POLICY w4_terminal_grant_read ON creator.access_grant FOR SELECT TO creator_w4_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE access_grant.id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w4_terminal_grant_write ON creator.access_grant FOR UPDATE TO creator_w4_generation_terminal
 USING(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE access_grant.id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid))
 WITH CHECK(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE access_grant.id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w4_terminal_pass_read ON creator.commerce_pass FOR SELECT TO creator_w4_generation_terminal USING(
 EXISTS(SELECT FROM creator.commerce_allowance_reservation r WHERE r.pass_id=commerce_pass.id));
CREATE POLICY w4_terminal_pass_write ON creator.commerce_pass FOR UPDATE TO creator_w4_generation_terminal
 USING(EXISTS(SELECT FROM creator.commerce_allowance_reservation r WHERE r.pass_id=commerce_pass.id))
 WITH CHECK(EXISTS(SELECT FROM creator.commerce_allowance_reservation r WHERE r.pass_id=commerce_pass.id));
CREATE POLICY w4_terminal_membership_read ON creator.commerce_membership FOR SELECT TO creator_w4_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE grant_id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w4_terminal_membership_write ON creator.commerce_membership FOR UPDATE TO creator_w4_generation_terminal
 USING(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE grant_id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid))
 WITH CHECK(EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE grant_id=(s.task->>'grantId')::uuid
  AND creator_id=(s.task->>'creatorId')::uuid AND fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w4_terminal_membership_use_read ON creator.commerce_membership_usage FOR SELECT TO creator_w4_generation_terminal USING(
 EXISTS(SELECT FROM creator.commerce_membership m WHERE m.id=membership_id AND m.creator_id=commerce_membership_usage.creator_id AND m.fan_id=commerce_membership_usage.fan_id));
CREATE POLICY w4_terminal_membership_use_insert ON creator.commerce_membership_usage FOR INSERT TO creator_w4_generation_terminal WITH CHECK(
 kind='ai_message' AND EXISTS(SELECT FROM creator.commerce_membership m JOIN creator.commerce_allowance_reservation r ON r.grant_id=m.grant_id
  WHERE m.id=membership_id AND m.creator_id=commerce_membership_usage.creator_id AND m.fan_id=commerce_membership_usage.fan_id
   AND evidence_id='allowance:'||r.id::text AND r.output_delivered));

CREATE FUNCTION creator.generation_settle_original_allowance(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; f uuid; r record; receipt record; admission record; n integer; actual_output boolean; p record; target text;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR k IS NULL OR NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN
  RAISE EXCEPTION 'Actual finalized original terminal required' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 IF task IS NULL OR task->>'reservationId' IS NULL THEN RAISE EXCEPTION 'Actual original weighted reservation required' USING ERRCODE='55000'; END IF;
 c:=(task->>'creatorId')::uuid;f:=(task->>'fanId')::uuid;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('allowance:'||c::text||':'||f::text,0)) THEN
  RAISE EXCEPTION 'Original allowance family is updating' USING ERRCODE='55P03';
 END IF;
 SELECT * INTO r FROM creator.commerce_allowance_reservation WHERE id=(task->>'reservationId')::uuid
  AND creator_id=c AND fan_id=f AND grant_id=(task->>'grantId')::uuid AND key='generation:'||g::text FOR UPDATE NOWAIT;
 IF NOT FOUND OR r.cost_rule IS NULL OR r.cost_policy_version IS DISTINCT FROM r.cost_rule->>'version'
  OR r.units::numeric IS DISTINCT FROM (r.cost_rule->>'ceilingUnits')::numeric OR r.cost_rule->>'rounding' IS DISTINCT FROM 'ceil' THEN
  RAISE EXCEPTION 'Retain the original hold until its original approved rule is present' USING ERRCODE='55000';
 END IF;
 actual_output:=(task->>'lastSequence')::integer>0;
 IF r.output_delivered IS NOT NULL AND r.output_delivered IS DISTINCT FROM actual_output THEN
  RAISE EXCEPTION 'Original persisted output changed' USING ERRCODE='55000';
 END IF;
 PERFORM id FROM creator.commerce_membership WHERE grant_id=r.grant_id FOR UPDATE NOWAIT;
 SELECT generation_id,state,actor_account_id INTO admission FROM creator.ai_generation_admission WHERE creator_id=c AND generation_id=g;
 SELECT generation_id,state,cost_micros,receipt_hash,usage_ids INTO receipt FROM creator.ai_generation_receipt WHERE creator_id=c AND generation_id=g ORDER BY revision DESC LIMIT 1;
 IF admission.generation_id IS NULL OR admission.state<>'sealed' OR admission.actor_account_id IS DISTINCT FROM (task->>'initiatingAccountId')::uuid
  OR receipt.generation_id IS NULL OR receipt.state='unknown' OR receipt.cost_micros IS NULL THEN
  IF r.state<>'reserved' THEN RAISE EXCEPTION 'Terminal receipt cannot become unknown' USING ERRCODE='55000'; END IF;
  UPDATE creator.commerce_allowance_reservation SET output_delivered=actual_output WHERE id=r.id;
  IF actual_output THEN
   INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind)
    SELECT creator_id,fan_id,id,'allowance:'||r.id::text,'ai_message' FROM creator.commerce_membership WHERE grant_id=r.grant_id ON CONFLICT DO NOTHING;
   UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,clock_timestamp()) WHERE grant_id=r.grant_id;
  END IF;
  IF NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN RAISE EXCEPTION 'Original terminal changed' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('generationId',g,'reservationId',r.id,'grantId',r.grant_id,'state','held',
   'policyVersion',r.cost_policy_version,'ceilingUnits',r.units,'outputDelivered',actual_output,'units',NULL,'reference',NULL);
 END IF;
 IF receipt.cost_micros<0 OR receipt.cost_micros>9007199254740991 OR receipt.receipt_hash !~ '^[a-f0-9]{64}$'
  OR receipt.state NOT IN('known','no_request')
  OR (receipt.state='no_request' AND (receipt.cost_micros<>0 OR cardinality(receipt.usage_ids)<>0)) THEN
  RAISE EXCEPTION 'Actual original immutable journal receipt required' USING ERRCODE='55000';
 END IF;
 IF ceil(receipt.cost_micros::numeric/(r.cost_rule->>'microsPerUnit')::numeric)>r.units THEN
  RAISE EXCEPTION 'Original cost exceeded its held ceiling' USING ERRCODE='55000';
 END IF;
 n:=ceil(receipt.cost_micros::numeric/(r.cost_rule->>'microsPerUnit')::numeric)::integer;
 target:=CASE WHEN n>0 THEN 'consumed' ELSE 'released' END;
 IF r.state<>'reserved' THEN
  IF r.state IS DISTINCT FROM target OR r.settled_units IS DISTINCT FROM n OR r.settlement_ref IS DISTINCT FROM receipt.receipt_hash THEN
   RAISE EXCEPTION 'Original financial receipt is immutable' USING ERRCODE='55000';
  END IF;
 ELSE
  -- Keep canonical membership -> pass -> grant lock order; never wait below the
  -- terminal's existing domain/journal locks. Shared pass cycle is original.
  PERFORM id FROM creator.commerce_membership WHERE grant_id=r.grant_id FOR UPDATE NOWAIT;
  IF r.pass_id IS NOT NULL THEN
   SELECT id,cycle_start INTO p FROM creator.commerce_pass WHERE id=r.pass_id FOR UPDATE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'Original shared pass needs reconciliation' USING ERRCODE='55000'; END IF;
   IF p.cycle_start=r.pass_cycle THEN
    UPDATE creator.commerce_pass SET reserved=reserved-r.units,used=used+n,version=version+1 WHERE id=r.pass_id AND reserved>=r.units;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original shared pass hold is inconsistent' USING ERRCODE='55000'; END IF;
   END IF;
  END IF;
  PERFORM id FROM creator.access_grant WHERE id=r.grant_id FOR UPDATE NOWAIT;
  UPDATE creator.access_grant SET reserved=reserved-r.units,used=used+n WHERE id=r.grant_id AND creator_id=c AND fan_id=f AND reserved>=r.units;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original grant hold is inconsistent' USING ERRCODE='55000'; END IF;
  UPDATE creator.commerce_allowance_reservation SET state=target,settled_units=n,settlement_ref=receipt.receipt_hash,output_delivered=actual_output WHERE id=r.id;
 END IF;
 IF actual_output THEN
  INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind)
   SELECT creator_id,fan_id,id,'allowance:'||r.id::text,'ai_message' FROM creator.commerce_membership WHERE grant_id=r.grant_id ON CONFLICT DO NOTHING;
  UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,clock_timestamp()) WHERE grant_id=r.grant_id;
 END IF;
 IF NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN RAISE EXCEPTION 'Original terminal changed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('generationId',g,'reservationId',r.id,'grantId',r.grant_id,'state','settled',
  'policyVersion',r.cost_policy_version,'ceilingUnits',r.units,'outputDelivered',actual_output,'units',n,'reference',receipt.receipt_hash);
END $$;
CREATE FUNCTION creator.generation_original_allowance_receipt(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb;r record;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR k IS NULL OR NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN
  RAISE EXCEPTION 'Actual finalized original terminal required' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 SELECT * INTO r FROM creator.commerce_allowance_reservation WHERE id=(task->>'reservationId')::uuid
  AND creator_id=(task->>'creatorId')::uuid AND fan_id=(task->>'fanId')::uuid
  AND grant_id=(task->>'grantId')::uuid AND key='generation:'||g::text;
 IF NOT FOUND OR r.cost_rule IS NULL OR r.output_delivered IS DISTINCT FROM ((task->>'lastSequence')::integer>0) THEN
  RAISE EXCEPTION 'Original financial receipt is unavailable' USING ERRCODE='55000';
 END IF;
 RETURN jsonb_build_object('generationId',g,'reservationId',r.id,'grantId',r.grant_id,
  'state',CASE WHEN r.state='reserved' THEN 'held' ELSE 'settled' END,'policyVersion',r.cost_policy_version,
  'ceilingUnits',r.units,'outputDelivered',r.output_delivered,'units',r.settled_units,'reference',r.settlement_ref);
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_settle_original_allowance(uuid,uuid) OWNER TO creator_w4_generation_terminal;
ALTER FUNCTION creator.generation_original_allowance_receipt(uuid,uuid) OWNER TO creator_w4_generation_terminal;
REVOKE ALL ON FUNCTION creator.generation_settle_original_allowance(uuid,uuid),creator.generation_original_allowance_receipt(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_settle_original_allowance(uuid,uuid),creator.generation_original_allowance_receipt(uuid,uuid) TO creator_generation_worker;
COMMIT;
