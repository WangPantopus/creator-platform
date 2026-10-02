-- W8 reservation0206_w3_privacy_cursor_export; held/unapplied source.
-- One original verified conversation export task; isolated metadata purpose.
-- No interactive pair/RLS or0087 private ACL change, deletion or provider call.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_privacy_export') THEN
  CREATE ROLE creator_w3_privacy_export NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w3_privacy_export'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
 THEN RAISE EXCEPTION 'Isolated original W3 export custody required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_w3_privacy_export;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_w3_privacy_export;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile TO creator_w3_privacy_export;
GRANT SELECT(id,account_id,display_name),UPDATE(id) ON creator.creator_profile TO creator_w3_privacy_export;
GRANT SELECT(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,owned_creator_ids,ownership_ref),UPDATE(id)
 ON creator_trust.privacy_job TO creator_w3_privacy_export;
GRANT SELECT(job_id,domain,state,lease_token,lease_until),UPDATE(job_id)
 ON creator_trust.privacy_task TO creator_w3_privacy_export;
SET LOCAL ROLE creator_trust_owner;
CREATE POLICY w3_cursor_export_metadata ON creator_trust.privacy_job FOR SELECT TO creator_w3_privacy_export USING(true);
CREATE POLICY w3_cursor_export_lock ON creator_trust.privacy_job FOR UPDATE TO creator_w3_privacy_export USING(true) WITH CHECK(false);
CREATE POLICY w3_cursor_export_metadata ON creator_trust.privacy_task FOR SELECT TO creator_w3_privacy_export USING(true);
CREATE POLICY w3_cursor_export_lock ON creator_trust.privacy_task FOR UPDATE TO creator_w3_privacy_export USING(true) WITH CHECK(false);
RESET ROLE;
SET LOCAL ROLE creator_owner;
CREATE POLICY w3_cursor_export_metadata ON creator.fan_profile FOR SELECT TO creator_w3_privacy_export USING(true);
CREATE POLICY w3_cursor_export_lock ON creator.fan_profile FOR UPDATE TO creator_w3_privacy_export USING(true) WITH CHECK(false);
CREATE POLICY w3_cursor_export_metadata ON creator.creator_profile FOR SELECT TO creator_w3_privacy_export USING(true);
CREATE POLICY w3_cursor_export_lock ON creator.creator_profile FOR UPDATE TO creator_w3_privacy_export USING(true) WITH CHECK(false);
GRANT SELECT(actor_account_id,created_at,creator_id,fan_id,generation_id,retention_policy_version,sealed_at,state,thread_id) ON creator.ai_generation_admission TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.ai_generation_admission FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(attempt_id,closed_at,created_at,creator_hold_id,creator_id,fan_id,generation_id,provider_admissions,state,thread_id) ON creator.ai_generation_attempt TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.ai_generation_attempt FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(attempt_ids,cost_micros,creator_id,fan_id,generation_id,id,receipt_hash,recorded_at,revision,state,thread_id,usage_ids) ON creator.ai_generation_receipt TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.ai_generation_receipt FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(accounting_disposition_reference,accounting_retained_until,accounting_retention_reason,accounting_retention_version,attempt_id,cache_write_input_tokens,cached_input_tokens,call_ordinal,category,completed_at,cost_micros,created_at,creator_hold_id,creator_id,duration_ms,fan_id,generation_id,id,input_tokens,model,output_tokens,provider,provider_state,purpose,thread_id,version_hash) ON creator.ai_usage TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.ai_usage FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(created_at,creator_id,id,payload,published_at,revision,type) ON creator.ai_event TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.ai_event FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(control,control_epoch,creator_id,deleted_at,fan_id,human_active_until,id,intro_shared,last_activity_at,last_reminder_at,memory_revision,off_the_record,revision,session_started_at) ON creator.thread TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.thread FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(agent_version_hash,agent_version_id,author_account_id,author_kind,citations,control_epoch,corrects_message_id,corrects_message_version,created_at,creator_id,delivery_state,fan_id,id,off_the_record,recording_asset_id,recording_evidence,sequence,signed_act_id,signed_command,signed_content_hash,team_member,text,thread_id,version) ON creator.message TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.message FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(account_id,agent_version_hash,agent_version_id,consent_policy_version,consented_at,created_at,creator_id,expires_at,fan_id,message_id,message_version,rating,thread_id,updated_at) ON creator.conversation_feedback TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.conversation_feedback FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(created_at,creator_id,edited_by_fan,fan_id,id,kind,provenance_message_id,semantic_key,sensitive_category,state,text,thread_id) ON creator.memory TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.memory FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(creator_id,fan_id,id,read_at,reader_account_id,role,thread_id) ON creator.thread_audit TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.thread_audit FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(consented_at,creator_id,fan_id,id,providers,thread_id,version,withdrawn_at) ON creator.processor_consent TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.processor_consent FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(category,consented_at,creator_id,fan_id,id,item_hash,item_id,thread_id,withdrawn_at) ON creator.memory_consent TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.memory_consent FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(companion_seconds,creator_id,day,fan_id,seconds,thread_id) ON creator.conversation_usage_day TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.conversation_usage_day FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(actor_account_id,created_at,creator_id,cursor,fan_id,id,payload,published_at,thread_id,type) ON creator.event TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.event FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(creator_id,fan_id,normalized_text,semantic_key,thread_id) ON creator.memory_exclusion TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.memory_exclusion FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT SELECT(accepted_at,ai_message_id,completed_at,context_revision,creator_id,epoch,failure_code,fan_id,fan_message_id,first_visible_at,grant_id,id,last_sequence,reservation_id,state,thread_id) ON creator.generation TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_metadata ON creator.generation FOR SELECT TO creator_w3_privacy_export USING(true);
GRANT UPDATE(id) ON creator.thread TO creator_w3_privacy_export;
CREATE POLICY w3_cursor_export_lock ON creator.thread FOR UPDATE TO creator_w3_privacy_export USING(true) WITH CHECK(false);
CREATE TABLE creator.conversation_privacy_export_scope (
 pid integer NOT NULL,xid xid8 NOT NULL,caller name NOT NULL,
 job_id uuid NOT NULL,lease_token uuid NOT NULL,binding jsonb NOT NULL,
 families jsonb NOT NULL CHECK(jsonb_typeof(families)='array'),
 PRIMARY KEY(pid,xid)
);
ALTER TABLE creator.conversation_privacy_export_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_privacy_export_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY w3_cursor_export_private ON creator.conversation_privacy_export_scope
 TO creator_w3_privacy_export USING(true) WITH CHECK(true);
CREATE FUNCTION creator.fence_conversation_privacy_export(jid uuid,aid uuid,sc text,c uuid,t uuid,token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j record;task record;owned uuid[];fan uuid;families jsonb;binding jsonb;held record;r oid;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_w3_privacy_export'
  OR jid IS NULL OR aid IS NULL OR token IS NULL OR sc IS NULL OR sc NOT IN('account','creator','thread')
  OR (sc='account' AND (c IS NOT NULL OR t IS NOT NULL))
  OR (sc='creator' AND (c IS NULL OR t IS NOT NULL)) OR (sc='thread' AND (c IS NULL OR t IS NULL))
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
  OR nullif(current_setting('generation.terminal_nonce',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolinherit AND NOT rolsuper
   AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
 THEN RAISE EXCEPTION 'Actual noninteractive RC conversation export required' USING ERRCODE='42501'; END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname=current_user AND NOT rolcanlogin AND NOT rolinherit
  AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
 THEN RAISE EXCEPTION 'Original isolated export role changed' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND
   (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0206_w3_privacy_cursor_export')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0087_w8_privacy_task_commit_fence' AND checksum='33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0163_w2_usage_lineage' AND checksum='16dddc80bebe32979f822104d8f411e0f545b4e212da6dc147c72f959e660f17')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0079_w2_usage_retention_expiry' AND checksum='1c118f5ec90a5a3f3578e056af14d5e56b1379464977c4a79bd6c2b62be7f17e')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0056_w3_correction_feedback_lineage' AND checksum='1044700d59b9dbb2d2b36d890496de0be6fb3d53c4409504f3c7693906866c35')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0057_w3_feedback_consent' AND checksum='08cb6f37c12ca3131b2e307a237569aa4d104fc627566e619a39fa18a1814d11')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0059_w3_recording_association' AND checksum='b61d50d7f85c0ef468e00a8d2d6b737b4d405a9349810c552f7d9df7f527c42e')
 THEN RAISE EXCEPTION 'Registered original export prerequisites unavailable' USING ERRCODE='42501'; END IF;
 -- Every complete W2 column is fixed and granted. Future columns refuse the
 -- export until the original owner reviews a new complete projection.
 IF EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['ai_generation_admission','ai_generation_attempt','ai_generation_receipt','ai_usage','ai_event'])
  AND a.attnum>0 AND NOT a.attisdropped AND NOT has_column_privilege(current_user,c.oid,a.attnum,'SELECT'))
 THEN RAISE EXCEPTION 'Complete reviewed accounting projection required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE ((n.nspname='creator' AND c.relname=ANY(ARRAY['thread','message','memory','memory_exclusion','thread_audit','event',
   'generation','processor_consent','memory_consent','conversation_usage_day','conversation_feedback',
   'fan_profile','creator_profile','ai_generation_admission','ai_generation_attempt','ai_generation_receipt','ai_usage','ai_event']))
   OR (n.nspname='creator_trust' AND c.relname=ANY(ARRAY['privacy_job','privacy_task'])))
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR c.relowner=r
   OR NOT EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='w3_cursor_export_metadata'
    AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[r] AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
   OR EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive AND (0=ANY(p.polroles) OR r=ANY(p.polroles)))))
 THEN RAISE EXCEPTION 'Current reviewed isolated export visibility required' USING ERRCODE='42501'; END IF;
 SELECT id,account_id,kind,scope,creator_id,thread_id,verified_at,verification_ref,owned_creator_ids,ownership_ref
 INTO j FROM creator_trust.privacy_job WHERE id=jid AND account_id=aid AND kind='export' AND scope=sc
  AND creator_id IS NOT DISTINCT FROM c AND thread_id IS NOT DISTINCT FROM t
  AND verified_at IS NOT NULL AND verification_ref<>'' AND state NOT IN('complete','dead_letter') FOR SHARE NOWAIT;
 IF NOT FOUND OR (sc='account' AND (j.ownership_ref IS NULL OR j.owned_creator_ids IS NULL
  OR cardinality(j.owned_creator_ids)>100 OR cardinality(j.owned_creator_ids)<>(SELECT count(DISTINCT x) FROM unnest(j.owned_creator_ids) x)))
 THEN RAISE EXCEPTION 'Original verified export unavailable' USING ERRCODE='42501'; END IF;
 SELECT job_id,domain,lease_token,lease_until INTO task FROM creator_trust.privacy_task
  WHERE job_id=jid AND domain='conversation' AND state='running' AND lease_token=token AND lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current original conversation export lease unavailable' USING ERRCODE='42501'; END IF;
 owned:=CASE WHEN sc='account' THEN j.owned_creator_ids ELSE ARRAY[]::uuid[] END;
 PERFORM id FROM creator.creator_profile WHERE id=ANY(owned) AND account_id=aid ORDER BY id FOR SHARE NOWAIT;
 IF (SELECT count(*) FROM creator.creator_profile WHERE id=ANY(owned) AND account_id=aid)<>cardinality(owned)
 THEN RAISE EXCEPTION 'Original creator ownership changed' USING ERRCODE='42501'; END IF;
 SELECT id INTO fan FROM creator.fan_profile WHERE account_id=aid FOR SHARE NOWAIT;
 -- All source families are independently selected from the actual immutable
 -- original ownership and fan identity, never a caller-provided family list.
 PERFORM id FROM creator.thread WHERE (fan_id=fan OR creator_id=ANY(owned))
  AND (c IS NULL OR creator_id=c) AND (t IS NULL OR id=t) ORDER BY id FOR SHARE NOWAIT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('threadId',id,'creatorId',creator_id,'fanId',fan_id) ORDER BY id),'[]'::jsonb)
 INTO families FROM creator.thread WHERE (fan_id=fan OR creator_id=ANY(owned))
  AND (c IS NULL OR creator_id=c) AND (t IS NULL OR id=t);
 IF jsonb_array_length(families)>100 OR (sc='thread' AND jsonb_array_length(families)<>1)
 THEN RAISE EXCEPTION 'Complete original bounded family set required' USING ERRCODE='54000'; END IF;
 binding:=to_jsonb(j)||jsonb_build_object('lease_until',task.lease_until,'fan_id',fan);
 SELECT * INTO held FROM creator.conversation_privacy_export_scope WHERE pid=pg_backend_pid() AND xid=pg_current_xact_id();
 IF FOUND THEN
  IF held.caller<>session_user OR held.job_id<>jid OR held.lease_token<>token OR held.binding<>binding OR held.families<>families THEN
   RAISE EXCEPTION 'Original conversation export transaction changed' USING ERRCODE='42501';
  END IF;
 ELSE
  INSERT INTO creator.conversation_privacy_export_scope VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,jid,token,binding,families);
 END IF;
 IF task.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Conversation export lease expired' USING ERRCODE='42501'; END IF;
 RETURN families;
END $$;
-- STABLE and SECURITY DEFINER preserve the DECLARE statement's source
-- snapshot and prevent inlining into caller pair-RLS. No per-row set_config.
CREATE FUNCTION creator.conversation_privacy_export_rows(jid uuid,token uuid)
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
  (SELECT to_jsonb(projected) FROM (SELECT creator_id,generation_id,attempt_id,thread_id,fan_id,state,provider_admissions,creator_hold_id,created_at,closed_at) projected)
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
 FROM families f JOIN creator.ai_event t ON t.creator_id=f."creatorId" AND t.type='ai.generation_receipt' AND t.payload->>'threadId'=f."threadId"::text AND t.payload->>'fanId'=f."fanId"::text
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
$$;
CREATE FUNCTION creator.finish_conversation_privacy_export_scope()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE families jsonb;
BEGIN
 IF current_query() !~* '^\s*COMMIT\s*;?\s*$' OR NEW.pid<>pg_backend_pid() OR NEW.xid<>pg_current_xact_id()
  OR NEW.caller<>session_user OR session_user<>'creator_runtime'
  OR NOT EXISTS(SELECT FROM creator.conversation_privacy_export_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid
   AND s.caller=NEW.caller AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token AND s.binding=NEW.binding AND s.families=NEW.families)
 THEN RAISE EXCEPTION 'Original conversation export commit mismatch' USING ERRCODE='23514'; END IF;
 families:=creator.fence_conversation_privacy_export(NEW.job_id,(NEW.binding->>'account_id')::uuid,NEW.binding->>'scope',
  (NEW.binding->>'creator_id')::uuid,(NEW.binding->>'thread_id')::uuid,NEW.lease_token);
 IF families<>NEW.families THEN RAISE EXCEPTION 'Export family set changed before commit' USING ERRCODE='23514'; END IF;
 DELETE FROM creator.conversation_privacy_export_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid AND s.caller=NEW.caller
  AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token AND s.binding=NEW.binding AND s.families=NEW.families;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original export commit scope missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER conversation_privacy_export_commit_current AFTER INSERT ON creator.conversation_privacy_export_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.finish_conversation_privacy_export_scope();
RESET ROLE;
ALTER TABLE creator.conversation_privacy_export_scope OWNER TO creator_w3_privacy_export;
ALTER FUNCTION creator.fence_conversation_privacy_export(uuid,uuid,text,uuid,uuid,uuid) OWNER TO creator_w3_privacy_export;
ALTER FUNCTION creator.conversation_privacy_export_rows(uuid,uuid) OWNER TO creator_w3_privacy_export;
ALTER FUNCTION creator.finish_conversation_privacy_export_scope() OWNER TO creator_w3_privacy_export;
REVOKE ALL ON TABLE creator.conversation_privacy_export_scope FROM PUBLIC,creator_runtime,creator_trust_runtime,creator_trust_worker;
REVOKE ALL ON FUNCTION creator.fence_conversation_privacy_export(uuid,uuid,text,uuid,uuid,uuid),
 creator.conversation_privacy_export_rows(uuid,uuid),creator.finish_conversation_privacy_export_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.fence_conversation_privacy_export(uuid,uuid,text,uuid,uuid,uuid),
 creator.conversation_privacy_export_rows(uuid,uuid) TO creator_runtime;
COMMIT;
