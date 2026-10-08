-- Additive0238. Preserve applied0237 bytes, permissions and original clocks.
-- Approved ordinary output references the reply call, whose final cost can stay
-- unknown after cancellation. Retain its full hold; never infer a crisis waiver.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_settle_typed_original_allowance(uuid,uuid)')),'UTF8')),'hex') IS DISTINCT FROM '7bcfd13179ef20d667c3b464f92beb3d5a3d3f12eb1354f07d11121f2fa0a55f' THEN RAISE EXCEPTION 'Original typed settlement definition changed'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.generation_typed_original_allowance_receipt(uuid,uuid)')),'UTF8')),'hex') IS DISTINCT FROM 'a161b56ad23ac9a892055a49c91975d7cd589ff4ca28f8984d9a20f4c9a7fa74' THEN RAISE EXCEPTION 'Original typed settlement definition changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION creator.generation_typed_original_allowance_receipt(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; r record; admission record; receipt record; message record;
 attempts jsonb; calls jsonb; usage_ids uuid[]; attempt_ids uuid[]; total numeric; known boolean; journal_hash text;
 output_count integer; crisis_count integer; output_text text; actual_output boolean; safety_exempt boolean; expected_units integer; weighted numeric;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0238_w4_generation_partial_unknown_terminal') THEN
  RAISE EXCEPTION 'Actual typed original financial purpose is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_generation_worker' OR g IS NULL OR k IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN
  RAISE EXCEPTION 'Actual finalized original terminal required' USING ERRCODE='42501'; END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s WHERE s.generation_id=g AND s.custody_token=k;
 IF task IS NULL OR task->>'reservationId' IS NULL OR task->>'grantId' IS NULL
  OR (task->>'lastSequence')::integer NOT BETWEEN 0 AND 1024 THEN
  RAISE EXCEPTION 'Actual original weighted reservation and cursor required' USING ERRCODE='55000'; END IF;
 SELECT id,creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle,cost_policy_version,settled_units,settlement_ref,output_delivered,cost_rule INTO r FROM creator.commerce_allowance_reservation WHERE id=(task->>'reservationId')::uuid
  AND creator_id=(task->>'creatorId')::uuid AND fan_id=(task->>'fanId')::uuid
  AND grant_id=(task->>'grantId')::uuid AND key='generation:'||g::text;
 IF NOT FOUND OR r.cost_rule IS NULL OR r.cost_policy_version IS DISTINCT FROM r.cost_rule->>'version'
  OR r.units::numeric IS DISTINCT FROM (r.cost_rule->>'ceilingUnits')::numeric
  OR r.cost_rule->>'rounding' IS DISTINCT FROM 'ceil'
  OR coalesce(r.cost_rule->>'microsPerUnit','') !~ '^[1-9][0-9]*$' THEN
  RAISE EXCEPTION 'Original approved cost rule and held ceiling required' USING ERRCODE='55000'; END IF;
 -- W2's actual journal writers hold this workspace before admission/attempt
 -- changes. TRY/NOWAIT never waits below W1's terminal domain leases.
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=r.creator_id FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original accounting workspace missing' USING ERRCODE='55000'; END IF;
 SELECT generation_id,thread_id,fan_id,actor_account_id,state,retention_policy_version INTO admission
 FROM creator.ai_generation_admission WHERE creator_id=r.creator_id AND generation_id=g;
 SELECT jr.generation_id,jr.thread_id,jr.fan_id,jr.state,jr.cost_micros,jr.receipt_hash,jr.usage_ids,jr.attempt_ids INTO receipt
 FROM creator.ai_generation_receipt jr WHERE jr.creator_id=r.creator_id AND jr.generation_id=g ORDER BY jr.revision DESC LIMIT 1;
 IF admission.generation_id IS NULL OR admission.state IS DISTINCT FROM 'sealed'
  OR admission.thread_id IS DISTINCT FROM (task->>'threadId')::uuid OR admission.fan_id IS DISTINCT FROM r.fan_id
  OR admission.actor_account_id IS DISTINCT FROM (task->>'initiatingAccountId')::uuid
  OR receipt.generation_id IS NULL OR receipt.thread_id IS DISTINCT FROM admission.thread_id OR receipt.fan_id IS DISTINCT FROM admission.fan_id
  OR receipt.state NOT IN('known','no_request','unknown') THEN
  RAISE EXCEPTION 'Original sealed all-attempt accounting is unavailable' USING ERRCODE='55000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id',attempt_id,'provider_admissions',provider_admissions,
  'state',state,'creator_hold_id',creator_hold_id) ORDER BY attempt_id),'[]'::jsonb),
  coalesce(array_agg(attempt_id ORDER BY attempt_id),'{}'::uuid[])
 INTO attempts,attempt_ids FROM creator.ai_generation_attempt WHERE creator_id=r.creator_id AND generation_id=g;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'attempt_id',attempt_id,'call_ordinal',call_ordinal,
  'provider_state',provider_state,'cost_micros',cost_micros::text,'input_tokens',input_tokens,'output_tokens',output_tokens,
  'cached_input_tokens',cached_input_tokens,'cache_write_input_tokens',cache_write_input_tokens,'purpose',purpose,
  'version_hash',version_hash,'provider',provider,'model',model) ORDER BY attempt_id,call_ordinal),'[]'::jsonb),
  coalesce(array_agg(id ORDER BY attempt_id,call_ordinal),'{}'::uuid[]),coalesce(sum(cost_micros),0)
 INTO calls,usage_ids,total FROM creator.ai_usage WHERE creator_id=r.creator_id AND generation_id=g;
 IF octet_length(attempts::text)+octet_length(calls::text)>16777216 THEN
  RAISE EXCEPTION 'Complete original accounting exceeds its bounded processing size' USING ERRCODE='54000'; END IF;
 SELECT NOT EXISTS(SELECT FROM creator.ai_generation_attempt a WHERE a.creator_id=r.creator_id AND a.generation_id=g
  AND (a.state='open' OR a.thread_id IS DISTINCT FROM admission.thread_id OR a.fan_id IS DISTINCT FROM admission.fan_id
   OR a.provider_admissions<>(SELECT count(*) FROM creator.ai_usage u WHERE u.creator_id=r.creator_id AND u.generation_id=g AND u.attempt_id=a.attempt_id)
   OR EXISTS(SELECT FROM (SELECT u.call_ordinal,u.provider_state,u.cost_micros,
     row_number() OVER(ORDER BY u.call_ordinal) ordinal FROM creator.ai_usage u
     WHERE u.creator_id=r.creator_id AND u.generation_id=g AND u.attempt_id=a.attempt_id) x
    WHERE x.call_ordinal<>x.ordinal OR x.provider_state IS DISTINCT FROM 'completed' OR x.cost_micros IS NULL OR x.cost_micros<0)))
  AND NOT EXISTS(SELECT FROM creator.ai_usage u WHERE u.creator_id=r.creator_id AND u.generation_id=g
   AND (u.thread_id IS DISTINCT FROM admission.thread_id OR u.fan_id IS DISTINCT FROM admission.fan_id
    OR NOT EXISTS(SELECT FROM creator.ai_generation_attempt a WHERE a.creator_id=r.creator_id AND a.generation_id=g AND a.attempt_id=u.attempt_id)))
  AND total BETWEEN 0 AND 9007199254740991 INTO known;
 -- Unknown cost is an accounting outcome, never permission to accept a
 -- changed family. Match the original journal's complete attempt/call arrays.
 IF EXISTS(SELECT FROM creator.ai_generation_attempt a WHERE a.creator_id=r.creator_id AND a.generation_id=g
  AND (a.state='open' OR a.thread_id IS DISTINCT FROM admission.thread_id OR a.fan_id IS DISTINCT FROM admission.fan_id))
  OR EXISTS(SELECT FROM creator.ai_usage u WHERE u.creator_id=r.creator_id AND u.generation_id=g
   AND (u.thread_id IS DISTINCT FROM admission.thread_id OR u.fan_id IS DISTINCT FROM admission.fan_id)) THEN
  RAISE EXCEPTION 'Original sealed accounting family changed' USING ERRCODE='55000'; END IF;
 journal_hash:=encode(sha256(convert_to(creator.canonical_json(jsonb_build_object('creatorId',r.creator_id,'generationId',g,
  'threadId',admission.thread_id,'fanId',admission.fan_id,'retentionPolicyVersion',admission.retention_policy_version,
  'state',CASE WHEN NOT known THEN 'unknown' WHEN cardinality(usage_ids)=0 THEN 'no_request' ELSE 'known' END,
  'costMicros',CASE WHEN known THEN total ELSE NULL END,'attempts',attempts,'usage',calls)),'UTF8')),'hex');
 IF (CASE WHEN known THEN total ELSE NULL END) IS DISTINCT FROM receipt.cost_micros::numeric
  OR usage_ids IS DISTINCT FROM receipt.usage_ids OR attempt_ids IS DISTINCT FROM receipt.attempt_ids
  OR journal_hash IS DISTINCT FROM receipt.receipt_hash
  OR receipt.state IS DISTINCT FROM (CASE WHEN NOT known THEN 'unknown' WHEN cardinality(usage_ids)=0 THEN 'no_request' ELSE 'known' END) THEN
  RAISE EXCEPTION 'Actual original all-attempt journal changed' USING ERRCODE='55000'; END IF;

 actual_output:=(task->>'lastSequence')::integer>0;
 SELECT id,text,citations,agent_version_id,agent_version_hash INTO message FROM creator.message m
 WHERE m.id=(task->>'aiMessageId')::uuid AND m.thread_id=admission.thread_id AND m.creator_id=r.creator_id AND m.fan_id=r.fan_id
  AND m.author_kind='ai' AND m.author_account_id IS NULL AND m.control_epoch=(task->>'epoch')::integer
  AND m.delivery_state=task->>'targetState';
 IF message.id IS NULL THEN RAISE EXCEPTION 'Actual original terminal message missing' USING ERRCODE='55000'; END IF;
 SELECT count(*),count(*) FILTER(WHERE p.approval->>'kind'='crisis'),string_agg(e.payload->>'text','' ORDER BY p.sequence)
 INTO output_count,crisis_count,output_text FROM creator.generation_sentence_provenance p
 JOIN creator.event e ON e.id=p.event_id AND e.thread_id=p.thread_id AND e.creator_id=p.creator_id AND e.fan_id=p.fan_id
 WHERE p.generation_id=g AND p.thread_id=admission.thread_id AND p.creator_id=r.creator_id AND p.fan_id=r.fan_id;
 IF output_count<>(task->>'lastSequence')::integer OR coalesce(output_text,'') IS DISTINCT FROM message.text
  OR EXISTS(SELECT FROM (SELECT p.sequence,row_number() OVER(ORDER BY p.sequence) ordinal
    FROM creator.generation_sentence_provenance p WHERE p.generation_id=g) x WHERE x.sequence<>x.ordinal)
  OR EXISTS(SELECT FROM creator.generation_sentence_provenance p LEFT JOIN creator.event e ON e.id=p.event_id
    LEFT JOIN creator.ai_usage u ON u.id=(p.approval->>'providerUsageId')::uuid AND u.creator_id=p.creator_id
     AND u.generation_id=p.generation_id AND u.thread_id=p.thread_id AND u.fan_id=p.fan_id
   WHERE p.generation_id=g AND (
    p.thread_id IS DISTINCT FROM admission.thread_id OR p.creator_id IS DISTINCT FROM r.creator_id OR p.fan_id IS DISTINCT FROM r.fan_id
    OR p.message_id IS DISTINCT FROM message.id OR p.transaction_id IS NULL OR p.transaction_id::text='0'
    OR p.created_at>clock_timestamp() OR e.id IS NULL OR e.thread_id IS DISTINCT FROM p.thread_id
    OR e.creator_id IS DISTINCT FROM p.creator_id OR e.fan_id IS DISTINCT FROM p.fan_id
    OR e.actor_account_id IS DISTINCT FROM (task->>'initiatingAccountId')::uuid OR e.type IS DISTINCT FROM 'sentence'
    OR e.payload->>'kind' IS DISTINCT FROM 'sentence' OR e.payload->>'authorKind' IS DISTINCT FROM 'ai'
    OR e.payload->>'threadId' IS DISTINCT FROM p.thread_id::text OR e.payload->>'generationId' IS DISTINCT FROM g::text
    OR e.payload->>'messageId' IS DISTINCT FROM message.id::text OR e.payload->>'sequence' IS DISTINCT FROM p.sequence::text
    OR e.payload->>'epoch' IS DISTINCT FROM task->>'epoch' OR jsonb_typeof(e.payload->'text') IS DISTINCT FROM 'string'
    OR p.content_hash IS DISTINCT FROM encode(sha256(convert_to(e.payload->>'text','UTF8')),'hex')
    OR (SELECT count(*) FROM jsonb_object_keys(p.approval))<>11
    OR NOT p.approval ?& ARRAY['kind','versionId','versionHash','pipelineHash','contextHash','fanMessageId','epoch','contextRevision','providerUsageId','citations','passages']
    OR p.approval->>'kind' NOT IN('sentence','fallback','crisis')
    OR p.approval->>'fanMessageId' IS DISTINCT FROM task->>'fanMessageId'
    OR p.approval->'epoch' IS DISTINCT FROM task->'epoch' OR p.approval->'contextRevision' IS DISTINCT FROM task->'contextRevision'
    OR p.approval->>'versionId' IS DISTINCT FROM message.agent_version_id::text
    OR p.approval->>'versionHash' IS DISTINCT FROM message.agent_version_hash
    OR (p.approval->>'pipelineHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE OR (p.approval->>'contextHash' ~ '^[a-f0-9]{64}$') IS NOT TRUE
    OR jsonb_typeof(p.approval->'citations') IS DISTINCT FROM 'array' OR jsonb_typeof(p.approval->'passages') IS DISTINCT FROM 'array'
    OR u.id IS NULL OR NOT u.id=ANY(receipt.usage_ids) OR u.provider_state IS DISTINCT FROM 'completed'
    -- Ordinary provenance points to the completed reply, not its classifier.
    -- Only the exact sealed unknown journal permits its unresolved cost; the
    -- full reservation remains held below. Crisis evidence still needs cost.
    OR (u.cost_micros IS NULL AND (receipt.state IS DISTINCT FROM 'unknown' OR p.approval->>'kind'='crisis'))
    OR u.version_hash IS DISTINCT FROM p.approval->>'versionHash'
    OR (p.approval->>'kind'='crisis' AND (u.category IS DISTINCT FROM 'guardrail' OR u.purpose IS DISTINCT FROM 'guardrail'
     OR u.call_ordinal<>1 OR p.sequence<>1 OR jsonb_array_length(p.approval->'citations')<>0
     OR jsonb_array_length(p.approval->'passages')<>0)))) THEN
  RAISE EXCEPTION 'Complete actual typed output/classifier provenance is unavailable' USING ERRCODE='55000'; END IF;
 IF message.citations IS DISTINCT FROM ARRAY(SELECT DISTINCT id FROM creator.generation_sentence_provenance p
  CROSS JOIN LATERAL jsonb_array_elements_text(p.approval->'citations') AS citation(value)
  CROSS JOIN LATERAL (SELECT citation.value::uuid AS id) ids WHERE p.generation_id=g ORDER BY id) THEN
  RAISE EXCEPTION 'Original delivered citation provenance changed' USING ERRCODE='55000'; END IF;
 IF crisis_count>0 AND (crisis_count<>1 OR output_count<>1) THEN
  RAISE EXCEPTION 'Mixed ordinary/crisis settlement has no approved allocation rule' USING ERRCODE='55000'; END IF;
 safety_exempt:=crisis_count=1;
 -- Only the durable real classifier outcome supplies safety exemption. Text
 -- equality above verifies content integrity; it never classifies a response.
 -- The original workflow releases fan usage for an empty failed generation.
 -- Unknown cost retains the whole original ceiling, including zero output.
 weighted:=CASE WHEN NOT known THEN NULL WHEN safety_exempt OR NOT actual_output THEN 0 ELSE ceil(total/(r.cost_rule->>'microsPerUnit')::numeric) END;
 IF weighted>r.units THEN RAISE EXCEPTION 'Original cost exceeds its held fan ceiling' USING ERRCODE='55000'; END IF;
 expected_units:=weighted::integer;
 IF (NOT known AND (r.state<>'reserved' OR r.settled_units IS NOT NULL OR r.settlement_ref IS NOT NULL))
  OR expected_units>r.units OR (r.output_delivered IS NOT NULL AND r.output_delivered IS DISTINCT FROM actual_output)
  OR (r.state<>'reserved' AND (r.settled_units IS DISTINCT FROM expected_units OR r.settlement_ref IS DISTINCT FROM journal_hash
    OR r.state IS DISTINCT FROM CASE WHEN expected_units>0 THEN 'consumed' ELSE 'released' END)) THEN
  RAISE EXCEPTION 'Original typed financial disposition changed or exceeded its hold' USING ERRCODE='55000'; END IF;
 IF NOT coalesce(creator.generation_terminal_matches(g,k,true),false) THEN
  RAISE EXCEPTION 'Original terminal changed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('generationId',g,'reservationId',r.id,'grantId',r.grant_id,
  'state',CASE WHEN r.state='reserved' THEN 'held' ELSE 'settled' END,'policyVersion',r.cost_policy_version,
  'ceilingUnits',r.units,'outputDelivered',actual_output,'safetyExempt',safety_exempt,
  'units',r.settled_units,'reference',r.settlement_ref,'expectedUnits',expected_units,
  'providerCostMicros',CASE WHEN known THEN total ELSE NULL END,'providerCostReference',journal_hash);
END $$;

CREATE OR REPLACE FUNCTION creator.generation_settle_typed_original_allowance(g uuid,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE facts jsonb; current_facts jsonb; r record; pass record; n integer; target text;
BEGIN
 facts:=creator.generation_typed_original_allowance_receipt(g,k);
 SELECT id,creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle,cost_policy_version,settled_units,settlement_ref,output_delivered,cost_rule INTO r FROM creator.commerce_allowance_reservation WHERE id=(facts->>'reservationId')::uuid
  AND grant_id=(facts->>'grantId')::uuid AND key='generation:'||g::text;
 IF NOT FOUND THEN RAISE EXCEPTION 'Actual original allowance reservation missing' USING ERRCODE='55000'; END IF;
 -- Use the established pair-wide allowance lease used by every normal writer.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('allowance:'||r.creator_id::text||':'||r.fan_id::text,0)) THEN
  RAISE EXCEPTION 'Original allowance family is updating' USING ERRCODE='55P03'; END IF;
 SELECT id,creator_id,fan_id,grant_id,key,units,state,pass_id,pass_cycle,cost_policy_version,settled_units,settlement_ref,output_delivered,cost_rule INTO r FROM creator.commerce_allowance_reservation WHERE id=r.id AND grant_id=r.grant_id
  AND creator_id=r.creator_id AND fan_id=r.fan_id AND key='generation:'||g::text FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original held allowance changed' USING ERRCODE='55000'; END IF;
 n:=(facts->>'expectedUnits')::integer;target:=CASE WHEN n>0 THEN 'consumed' ELSE 'released' END;
 IF r.state='reserved' AND n IS NOT NULL THEN
  PERFORM id FROM creator.commerce_membership WHERE grant_id=r.grant_id FOR UPDATE NOWAIT;
  IF r.pass_id IS NOT NULL THEN
   SELECT id,cycle_start INTO pass FROM creator.commerce_pass WHERE id=r.pass_id FOR UPDATE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'Original shared pass needs reconciliation' USING ERRCODE='55000'; END IF;
   IF pass.cycle_start=r.pass_cycle THEN
    UPDATE creator.commerce_pass SET reserved=reserved-r.units,used=used+n,version=version+1 WHERE id=r.pass_id AND reserved>=r.units;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original shared pass hold is inconsistent' USING ERRCODE='55000'; END IF;
   END IF;
  END IF;
  PERFORM id FROM creator.access_grant WHERE id=r.grant_id FOR UPDATE NOWAIT;
  UPDATE creator.access_grant SET reserved=reserved-r.units,used=used+n WHERE id=r.grant_id
   AND creator_id=r.creator_id AND fan_id=r.fan_id AND reserved>=r.units;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original grant hold is inconsistent' USING ERRCODE='55000'; END IF;
  UPDATE creator.commerce_allowance_reservation SET state=target,settled_units=n,
   settlement_ref=facts->>'providerCostReference',output_delivered=(facts->>'outputDelivered')::boolean WHERE id=r.id;
 END IF;
 IF n IS NULL THEN
  -- Retain reservation/grant/pass amounts and the original provider obligation.
  -- Durable output still records first use; this is not financial settlement.
  IF r.state<>'reserved' OR r.settled_units IS NOT NULL OR r.settlement_ref IS NOT NULL
   OR facts->>'state' IS DISTINCT FROM 'held' OR facts->>'providerCostMicros' IS NOT NULL THEN
   RAISE EXCEPTION 'Unknown original cost requires its complete held ceiling' USING ERRCODE='55000'; END IF;
  PERFORM id FROM creator.commerce_membership WHERE grant_id=r.grant_id FOR UPDATE NOWAIT;
  IF r.pass_id IS NOT NULL THEN
   SELECT id,cycle_start,reserved INTO pass FROM creator.commerce_pass WHERE id=r.pass_id FOR SHARE NOWAIT;
   IF NOT FOUND OR (pass.cycle_start=r.pass_cycle AND pass.reserved<r.units) THEN
    RAISE EXCEPTION 'Original unresolved shared pass hold is inconsistent' USING ERRCODE='55000'; END IF;
  END IF;
  PERFORM id FROM creator.access_grant WHERE id=r.grant_id AND creator_id=r.creator_id AND fan_id=r.fan_id AND reserved>=r.units FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original unresolved grant hold is inconsistent' USING ERRCODE='55000'; END IF;
  UPDATE creator.commerce_allowance_reservation SET output_delivered=(facts->>'outputDelivered')::boolean WHERE id=r.id;
 END IF;
 IF (facts->>'outputDelivered')::boolean AND NOT (facts->>'safetyExempt')::boolean THEN
  INSERT INTO creator.commerce_membership_usage(creator_id,fan_id,membership_id,evidence_id,kind)
   SELECT creator_id,fan_id,id,'allowance:'||r.id::text,'ai_message' FROM creator.commerce_membership WHERE grant_id=r.grant_id ON CONFLICT DO NOTHING;
  UPDATE creator.commerce_membership SET first_used_at=coalesce(first_used_at,clock_timestamp()) WHERE grant_id=r.grant_id;
 END IF;
 current_facts:=creator.generation_typed_original_allowance_receipt(g,k);
 IF (current_facts-ARRAY['state','units','reference']) IS DISTINCT FROM (facts-ARRAY['state','units','reference'])
  OR current_facts->>'state' IS DISTINCT FROM (CASE WHEN n IS NULL THEN 'held' ELSE 'settled' END)
  OR (current_facts->>'units')::integer IS DISTINCT FROM n
  OR current_facts->>'reference' IS DISTINCT FROM (CASE WHEN n IS NULL THEN NULL ELSE facts->>'providerCostReference' END) THEN
  RAISE EXCEPTION 'Original typed settlement changed before its bookend' USING ERRCODE='55000'; END IF;
 -- W1 owns all remaining restoration/currentness/cleanup and sole COMMIT.
 RETURN current_facts;
END $$;
-- CREATE OR REPLACE retains the original owner and exact ACL. No new grant.
COMMIT;
