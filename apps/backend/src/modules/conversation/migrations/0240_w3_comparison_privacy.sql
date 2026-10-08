-- Additive allocated copy; original pending source remains preserved.
-- Additive source under review. No registry allocation or host activation.
-- The immutable0233 migration stays unchanged. Keep its entire0..18 projection
-- and original task/family/EOF/COMMIT owner; append only two explicit collections.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0233_w3_privacy_cursor_export'
  AND checksum='99ad0ce10da98954d08b3fe31dedce0ef93be4c3be7e1aeecf3995059e41eb08')
 OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0214_w8_original_privacy_family'
  AND checksum='fcb8f6174d48ed89b9a06d8a51ac4f0c5dd4288950f2d18b351825d9d81dd793')
 OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0239_w3_comparison_samples'
  AND checksum='39199c153fb758c5bb7e9ceef24b1b38dd23740732153f75aa85ff1e8c32973d')
 OR to_regclass('creator.conversation_comparison_consent') IS NULL
 OR to_regclass('creator.conversation_comparison_sample') IS NULL
 OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('creator.conversation_privacy_export_rows(uuid,uuid)')),'UTF8')),'hex')
  IS DISTINCT FROM '237b41fc48c17c3859ac3be87bd667f34f4132ecd59f301e0ae723d0d0a556e0'
 THEN RAISE EXCEPTION 'Original reviewed Conversation privacy sources required'; END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT SELECT(thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version,consented_at,expires_at)
 ON creator.conversation_comparison_consent TO creator_w3_privacy_export;
GRANT SELECT(id,thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version,message_id,message_version,
 source_hash,paraphrased_prompt,sanitizer_reference,occurred_at,created_at,expires_at)
 ON creator.conversation_comparison_sample TO creator_w3_privacy_export;
CREATE POLICY comparison_privacy_export ON creator.conversation_comparison_consent
 FOR SELECT TO creator_w3_privacy_export USING(EXISTS(
  SELECT FROM creator.conversation_privacy_export_scope s
  CROSS JOIN LATERAL jsonb_to_recordset(s.families) AS f("threadId" uuid,"creatorId" uuid,"fanId" uuid)
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
   AND session_user='creator_runtime' AND f."threadId"=conversation_comparison_consent.thread_id
   AND f."creatorId"=conversation_comparison_consent.creator_id AND f."fanId"=conversation_comparison_consent.fan_id));
CREATE POLICY comparison_privacy_export ON creator.conversation_comparison_sample
 FOR SELECT TO creator_w3_privacy_export USING(EXISTS(
  SELECT FROM creator.conversation_privacy_export_scope s
  CROSS JOIN LATERAL jsonb_to_recordset(s.families) AS f("threadId" uuid,"creatorId" uuid,"fanId" uuid)
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
   AND session_user='creator_runtime' AND f."threadId"=conversation_comparison_sample.thread_id
   AND f."creatorId"=conversation_comparison_sample.creator_id AND f."fanId"=conversation_comparison_sample.fan_id));
RESET ROLE;
CREATE OR REPLACE FUNCTION creator.conversation_privacy_export_rows(jid uuid,token uuid)
RETURNS TABLE(thread_id uuid,creator_id uuid,fan_id uuid,collection integer,row_key text,document jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH families AS MATERIALIZED (
  SELECT f.* FROM creator.conversation_privacy_export_scope s
  CROSS JOIN LATERAL jsonb_to_recordset(s.families) AS f("threadId" uuid,"creatorId" uuid,"fanId" uuid)
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
   AND s.job_id=jid AND s.lease_token=token AND session_user='creator_runtime' AND current_user='creator_w3_privacy_export'
 )
 SELECT f."threadId",f."creatorId",f."fanId",0,''::text,
  (SELECT to_jsonb(projected) FROM (SELECT t.id,t.creator_id,t.fan_id,t.control,t.control_epoch,t.revision,t.deleted_at,t.off_the_record,t.intro_shared,t.memory_revision,t.human_active_until,t.last_activity_at,t.session_started_at,t.last_reminder_at,cp.display_name) projected)
 FROM families f JOIN creator.thread t ON t.id=f."threadId" AND t.creator_id=f."creatorId" AND t.fan_id=f."fanId"
 JOIN creator.creator_profile cp ON cp.id=t.creator_id
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",1,(generation_id::text),
  (SELECT to_jsonb(projected) FROM (SELECT creator_id,generation_id,thread_id,fan_id,actor_account_id,state,retention_policy_version,created_at,sealed_at) projected)
 FROM families f JOIN creator.ai_generation_admission t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",2,(generation_id::text||':'||attempt_id::text),
  (SELECT to_jsonb(projected) FROM (SELECT creator_id,generation_id,attempt_id,thread_id,fan_id,state,provider_admissions,creator_hold_id,created_at,closed_at,admission_version_hash,admission_model_fingerprint) projected)
 FROM families f JOIN creator.ai_generation_attempt t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",3,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,creator_id,generation_id,thread_id,fan_id,state,cost_micros,usage_ids,attempt_ids,revision,receipt_hash,recorded_at) projected)
 FROM families f JOIN creator.ai_generation_receipt t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",4,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,created_at,cached_input_tokens,cache_write_input_tokens,creator_hold_id,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,provider_state,completed_at,accounting_retained_until,accounting_retention_version,accounting_retention_reason,accounting_disposition_reference) projected)
 FROM families f JOIN creator.ai_usage t ON t.creator_id=f."creatorId" AND ((t.thread_id=f."threadId" AND t.fan_id=f."fanId") OR t.creator_hold_id IN (SELECT a.creator_hold_id FROM creator.ai_generation_attempt a WHERE a.creator_id=f."creatorId" AND a.thread_id=f."threadId" AND a.fan_id=f."fanId"))
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",5,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,creator_id,type,revision,payload,created_at,published_at) projected)
 FROM families f JOIN creator.ai_event t ON t.creator_id=f."creatorId"
  AND (t.type='ai.generation_receipt' OR (t.type='ai.guardrail' AND t.payload->>'purpose'='generation_guardrail'))
  AND t.payload->>'threadId'=f."threadId"::text AND t.payload->>'fanId'=f."fanId"::text
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",6,(lpad(sequence::text,10,'0')||':'||id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,agent_version_id,agent_version_hash,corrects_message_id,corrects_message_version,signed_command) projected)
 FROM families f JOIN creator.message t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",7,(message_id::text||':'||account_id::text),
  (SELECT to_jsonb(projected) FROM (SELECT message_id,message_version,account_id,rating,agent_version_id,agent_version_hash,created_at,updated_at,consent_policy_version,consented_at,expires_at) projected)
 FROM families f JOIN creator.conversation_feedback t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",8,(lpad(sequence::text,10,'0')||':'||id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,recording_asset_id,recording_evidence,signed_act_id) projected)
 FROM families f JOIN creator.message t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId" AND t.recording_asset_id IS NOT NULL
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",9,(lpad(sequence::text,10,'0')||':'||id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,version,signed_act_id AS "signedActId",signed_content_hash AS "signedContentHash",author_account_id AS "authorAccountId",citations,team_member AS member,off_the_record AS "offTheRecord",created_at AS "createdAt") projected)
 FROM families f JOIN creator.message t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",10,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,kind,text,state,semantic_key,provenance_message_id,sensitive_category,edited_by_fan,created_at) projected)
 FROM families f JOIN creator.memory t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",11,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,reader_account_id,role,read_at) projected)
 FROM families f JOIN creator.thread_audit t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",12,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,version,providers,consented_at,withdrawn_at) projected)
 FROM families f JOIN creator.processor_consent t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",13,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,item_id,item_hash,category,consented_at,withdrawn_at) projected)
 FROM families f JOIN creator.memory_consent t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",14,(day::text),
  (SELECT to_jsonb(projected) FROM (SELECT day,seconds,companion_seconds) projected)
 FROM families f JOIN creator.conversation_usage_day t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",15,(lpad(cursor::text,10,'0')||':'||id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,cursor,type,payload,actor_account_id,created_at,published_at) projected)
 FROM families f JOIN creator.event t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",16,(semantic_key),
  (SELECT to_jsonb(projected) FROM (SELECT semantic_key,normalized_text) projected)
 FROM families f JOIN creator.memory_exclusion t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",17,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,fan_message_id,ai_message_id,grant_id,reservation_id,epoch,last_sequence,state,context_revision,accepted_at,first_visible_at,completed_at,failure_code) projected)
 FROM families f JOIN creator.generation t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",18,(generation_id::text||':'||lpad(sequence::text,10,'0')),
  (SELECT to_jsonb(projected) FROM (SELECT generation_id,sequence,thread_id,creator_id,fan_id,message_id,event_id,content_hash,approval,created_at,transaction_id) projected)
 FROM families f JOIN creator.generation_sentence_provenance t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",19,(thread_id::text),
  (SELECT to_jsonb(projected) FROM (SELECT account_id,policy_version,processor_policy_version,consented_at,expires_at) projected)
 FROM families f JOIN creator.conversation_comparison_consent t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
 UNION ALL
 SELECT f."threadId",f."creatorId",f."fanId",20,(id::text),
  (SELECT to_jsonb(projected) FROM (SELECT id,account_id,policy_version,processor_policy_version,message_id,message_version,source_hash,paraphrased_prompt,sanitizer_reference,occurred_at,created_at,expires_at) projected)
 FROM families f JOIN creator.conversation_comparison_sample t ON t.creator_id=f."creatorId" AND t.thread_id=f."threadId" AND t.fan_id=f."fanId"
$$;

ALTER FUNCTION creator.conversation_privacy_export_rows(uuid,uuid) OWNER TO creator_w3_privacy_export;
REVOKE ALL ON FUNCTION creator.conversation_privacy_export_rows(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.conversation_privacy_export_rows(uuid,uuid) TO creator_runtime;

-- Use the existing narrow comparison DELETE owner with W8's original due
-- family matcher. A lifecycle family never becomes an interactive fan scope.
GRANT EXECUTE ON FUNCTION creator_trust.privacy_task_delete_family_matches(uuid,uuid,uuid,uuid,uuid)
 TO creator_comparison_lifecycle;
CREATE FUNCTION creator.purge_conversation_comparisons(j uuid,k uuid,t uuid,c uuid,f uuid)
RETURNS TABLE(samples_deleted integer,consents_deleted integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_comparison_lifecycle'
  OR j IS NULL OR k IS NULL OR t IS NULL OR c IS NULL OR f IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT creator_trust.privacy_task_delete_family_matches(j,k,t,c,f)
 THEN RAISE EXCEPTION 'Original due Conversation DELETE family required' USING ERRCODE='42501'; END IF;
 WITH page AS MATERIALIZED(SELECT id FROM creator.conversation_comparison_sample
  WHERE thread_id=t AND creator_id=c AND fan_id=f ORDER BY id LIMIT 500)
 DELETE FROM creator.conversation_comparison_sample s USING page p
  WHERE s.id=p.id AND s.thread_id=t AND s.creator_id=c AND s.fan_id=f;
 GET DIAGNOSTICS samples_deleted=ROW_COUNT;
 consents_deleted:=0;
 -- Only an actual empty sample page permits removing its parent consent.
 -- Its source trigger invalidates cached cohorts and persisted result text.
 IF samples_deleted=0 THEN
  DELETE FROM creator.conversation_comparison_consent
   WHERE thread_id=t AND creator_id=c AND fan_id=f;
  GET DIAGNOSTICS consents_deleted=ROW_COUNT;
 END IF;
 IF samples_deleted<0 OR samples_deleted>500 OR consents_deleted<0 OR consents_deleted>1
  OR NOT creator_trust.privacy_task_delete_family_matches(j,k,t,c,f)
 THEN RAISE EXCEPTION 'Original DELETE family changed during comparison purge' USING ERRCODE='42501'; END IF;
 RETURN NEXT;
END $$;
ALTER FUNCTION creator.purge_conversation_comparisons(uuid,uuid,uuid,uuid,uuid) OWNER TO creator_comparison_lifecycle;
REVOKE ALL ON FUNCTION creator.purge_conversation_comparisons(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.purge_conversation_comparisons(uuid,uuid,uuid,uuid,uuid) TO creator_runtime;
COMMIT;
