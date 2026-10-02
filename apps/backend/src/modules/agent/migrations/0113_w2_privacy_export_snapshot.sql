-- W8 reserved0113. Held source only; no registry or live activation.
-- Own W2 export scope; actual0087 scope/role/function ACLs stay immutable.
-- Complete snapshot source and actual EOF, never caller creator arrays/flags.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF to_regprocedure('creator_trust.fence_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)') IS NULL
  OR to_regclass('creator.ai_generation_receipt') IS NULL THEN
  RAISE EXCEPTION 'Actual lifecycle and complete accounting dependencies required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_privacy_export') THEN
  CREATE ROLE creator_w2_privacy_export NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w2_privacy_export' AND NOT rolcanlogin AND NOT rolsuper
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r) OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r) THEN
  RAISE EXCEPTION 'Unsafe fixed export purpose role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_w2_privacy_export;
SET LOCAL ROLE creator_trust_owner;
GRANT SELECT(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,owned_creator_ids,ownership_ref),UPDATE(id)
 ON creator_trust.privacy_job TO creator_w2_privacy_export;
GRANT SELECT(job_id,domain,state,lease_token,lease_until),UPDATE(job_id)
 ON creator_trust.privacy_task TO creator_w2_privacy_export;
CREATE POLICY w2_export_job_metadata ON creator_trust.privacy_job FOR SELECT TO creator_w2_privacy_export USING(true);
CREATE POLICY w2_export_job_lock ON creator_trust.privacy_job FOR UPDATE TO creator_w2_privacy_export USING(true) WITH CHECK(false);
CREATE POLICY w2_export_task_metadata ON creator_trust.privacy_task FOR SELECT TO creator_w2_privacy_export USING(true);
CREATE POLICY w2_export_task_lock ON creator_trust.privacy_task FOR UPDATE TO creator_w2_privacy_export USING(true) WITH CHECK(false);
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.agent_privacy_export_scope (
 pid integer NOT NULL,xid xid8 NOT NULL,login name NOT NULL,nonce uuid NOT NULL UNIQUE,
 job_id uuid NOT NULL,lease_token uuid NOT NULL,binding jsonb NOT NULL,
 exhausted boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(pid,xid)
);
ALTER TABLE creator.agent_privacy_export_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.agent_privacy_export_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY w2_export_private ON creator.agent_privacy_export_scope TO creator_w2_privacy_export USING(true) WITH CHECK(true);
RESET ROLE;
REVOKE ALL ON creator.agent_privacy_export_scope FROM PUBLIC,creator_runtime;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.creator_profile TO creator_w2_privacy_export;
CREATE POLICY w2_export_owned_profile ON creator.creator_profile FOR SELECT TO creator_w2_privacy_export USING(
 EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned()
  AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid
  AND (s.binding->'owned_creator_ids') ? id::text AND account_id=(s.binding->>'account_id')::uuid));

CREATE FUNCTION creator.begin_agent_privacy_export(jid uuid,aid uuid,c uuid,t uuid,token uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j record; leased record; n uuid; captured jsonb;
BEGIN
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR jid IS NULL OR aid IS NULL OR token IS NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR nullif(current_setting('agent.privacy_export_nonce',true),'') IS NOT NULL
  OR EXISTS(SELECT FROM pg_database WHERE datname=current_database()
   AND (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed')) THEN
  RAISE EXCEPTION 'Actual current held export task required' USING ERRCODE='42501';
 END IF;
 SELECT id,account_id,kind,scope,creator_id,thread_id,verified_at,verification_ref,owned_creator_ids,ownership_ref INTO j
  FROM creator_trust.privacy_job WHERE id=jid AND account_id=aid AND kind='export' AND scope='account'
  AND creator_id IS NOT DISTINCT FROM c AND thread_id IS NOT DISTINCT FROM t
  AND verified_at IS NOT NULL AND verification_ref<>'' AND ownership_ref<>'' AND owned_creator_ids IS NOT NULL
  AND cardinality(owned_creator_ids)<=100 AND state NOT IN('complete','dead_letter') FOR SHARE NOWAIT;
 IF NOT FOUND OR EXISTS(SELECT FROM unnest(j.owned_creator_ids) AS owned(id) WHERE owned.id IS NULL)
  OR cardinality(j.owned_creator_ids)<>(SELECT count(DISTINCT owned.id) FROM unnest(j.owned_creator_ids) AS owned(id)) THEN
  RAISE EXCEPTION 'Actual immutable export ownership required' USING ERRCODE='42501';
 END IF;
 SELECT job_id,domain,lease_token,lease_until INTO leased FROM creator_trust.privacy_task
  WHERE job_id=jid AND domain='agent' AND state='running' AND lease_token=token AND lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Actual Agent export lease required' USING ERRCODE='42501'; END IF;
 n:=gen_random_uuid();captured:=to_jsonb(j)||jsonb_build_object('lease_until',leased.lease_until);
 INSERT INTO creator.agent_privacy_export_scope(pid,xid,login,nonce,job_id,lease_token,binding)
 VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,n,jid,token,captured);
 PERFORM set_config('agent.privacy_export_nonce',n::text,true);
 IF EXISTS(SELECT FROM unnest(j.owned_creator_ids) AS owned(id) WHERE NOT EXISTS(SELECT FROM creator.creator_profile cp
  WHERE cp.id=owned.id AND cp.account_id=aid)) THEN RAISE EXCEPTION 'Current export owner missing' USING ERRCODE='42501'; END IF;
 PERFORM cp.id FROM creator.creator_profile cp WHERE cp.id=ANY(j.owned_creator_ids) AND cp.account_id=aid ORDER BY cp.id FOR SHARE NOWAIT;
 RETURN jsonb_build_object('nonce',n,'accountId',aid,'creatorIds',j.owned_creator_ids);
END $$;

CREATE FUNCTION creator.agent_privacy_export_matches(n uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s record; current_binding jsonb;
BEGIN
 IF session_user<>'creator_runtime' OR n IS NULL OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR EXISTS(SELECT FROM pg_database WHERE datname=current_database()
   AND (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed')) THEN RETURN false; END IF;
 SELECT * INTO s FROM creator.agent_privacy_export_scope WHERE nonce=n AND pid=pg_backend_pid()
  AND xid=pg_current_xact_id_if_assigned() AND login=session_user
  AND nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid
  AND created_at>clock_timestamp()-interval '45 seconds';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT jsonb_build_object('id',j.id,'account_id',j.account_id,'kind',j.kind,'scope',j.scope,'creator_id',j.creator_id,
  'thread_id',j.thread_id,'verified_at',j.verified_at,'verification_ref',j.verification_ref,
  'owned_creator_ids',j.owned_creator_ids,'ownership_ref',j.ownership_ref,'lease_until',t.lease_until) INTO current_binding
 FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
 WHERE j.id=s.job_id AND j.kind='export' AND j.scope='account' AND j.state NOT IN('complete','dead_letter')
  AND j.verified_at IS NOT NULL AND j.verification_ref<>'' AND j.ownership_ref<>''
  AND t.domain='agent' AND t.state='running' AND t.lease_token=s.lease_token AND t.lease_until>clock_timestamp();
 RETURN FOUND AND current_binding=s.binding;
END $$;

-- Every source read remains within the privately derived current owned set.
CREATE POLICY w2_export_profile_lock ON creator.creator_profile FOR UPDATE TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? id::text AND creator.agent_privacy_export_matches(s.nonce))) WITH CHECK(false);
GRANT SELECT ON creator.ai_workspace TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_workspace FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_source TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_source FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_version TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_version FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_sponsor TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_sponsor FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_regression TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_regression FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_evaluation TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_evaluation FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_shadow_sample TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_shadow_sample FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_shadow_evaluation TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_shadow_evaluation FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_ingestion TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_ingestion FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_event TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_event FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_cost_hold TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_cost_hold FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_chunk TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_chunk FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_command TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_command FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_style_embedding TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_style_embedding FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_license TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_license FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_tombstone TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_tombstone FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_generation_receipt TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_generation_receipt FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_generation_admission TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_generation_admission FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT ON creator.ai_generation_attempt TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_generation_attempt FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));
GRANT SELECT(id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,created_at,cached_input_tokens,cache_write_input_tokens,creator_hold_id,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,provider_state,completed_at,accounting_retained_until,accounting_retention_version,accounting_retention_reason,accounting_disposition_reference) ON creator.ai_usage TO creator_w2_privacy_export;
CREATE POLICY w2_export_snapshot ON creator.ai_usage FOR SELECT TO creator_w2_privacy_export USING(EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid AND (s.binding->'owned_creator_ids') ? creator_id::text AND creator.agent_privacy_export_matches(s.nonce)));

-- This wall-clock guarded function is VOLATILE. Its ONE fixed RETURN QUERY
-- acquires ONE all-source MVCC snapshot when the portal first executes/FETCHes;
-- it does not claim the outer DECLARE snapshot or run per-creator queries.
CREATE FUNCTION creator.agent_privacy_export_rows(n uuid) RETURNS TABLE(document jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT creator.agent_privacy_export_matches(n) THEN RAISE EXCEPTION 'Actual current export snapshot purpose required' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH owned AS MATERIALIZED(
 SELECT value::uuid AS id FROM creator.agent_privacy_export_scope s,
 LATERAL jsonb_array_elements_text(s.binding->'owned_creator_ids')
 WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user AND s.nonce=n
 ), packets AS (
SELECT cp.id AS creator_id,0 AS section,0 AS boundary,0::bigint AS sort_number,''::text AS sort_key,jsonb_build_object('creatorId',cp.id,'kind','header','document',jsonb_build_object('schemaVersion',2,'state',CASE WHEN w.deleted_at IS NOT NULL THEN 'deleted' WHEN w.creator_id IS NOT NULL THEN 'configured' ELSE 'not_configured' END,'workspace',to_jsonb(w),'exportedAt',statement_timestamp(),'configuration',w.configuration,'interview',w.interview,'status',w.current_status,'license',l.document)) AS packet FROM owned o JOIN creator.creator_profile cp ON cp.id=o.id LEFT JOIN creator.ai_workspace w ON w.creator_id=cp.id LEFT JOIN creator.ai_license l ON l.creator_id=cp.id
 UNION ALL
SELECT o.id,1,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','sources') FROM owned o
 UNION ALL
SELECT t.creator_id,1,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','sources','document',to_jsonb(t)) FROM creator.ai_source t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,1,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','sources') FROM owned o
 UNION ALL
SELECT o.id,2,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','versions') FROM owned o
 UNION ALL
SELECT t.creator_id,2,1,-t.number::bigint,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','versions','document',to_jsonb(t)) FROM creator.ai_version t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,2,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','versions') FROM owned o
 UNION ALL
SELECT o.id,3,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','sponsors') FROM owned o
 UNION ALL
SELECT t.creator_id,3,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','sponsors','document',to_jsonb(t)) FROM creator.ai_sponsor t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,3,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','sponsors') FROM owned o
 UNION ALL
SELECT o.id,4,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','regressions') FROM owned o
 UNION ALL
SELECT t.creator_id,4,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','regressions','document',to_jsonb(t)) FROM creator.ai_regression t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,4,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','regressions') FROM owned o
 UNION ALL
SELECT o.id,5,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','usage') FROM owned o
 UNION ALL
SELECT t.creator_id,5,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','usage','document',to_jsonb(t)) FROM (SELECT id,creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,created_at,cached_input_tokens,cache_write_input_tokens,creator_hold_id,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,provider_state,completed_at,accounting_retained_until,accounting_retention_version,accounting_retention_reason,accounting_disposition_reference FROM creator.ai_usage) t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,5,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','usage') FROM owned o
 UNION ALL
SELECT o.id,6,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_evaluation') FROM owned o
 UNION ALL
SELECT t.creator_id,6,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_evaluation','document',to_jsonb(t)) FROM creator.ai_evaluation t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,6,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_evaluation') FROM owned o
 UNION ALL
SELECT o.id,7,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_shadow_sample') FROM owned o
 UNION ALL
SELECT t.creator_id,7,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_shadow_sample','document',to_jsonb(t)) FROM creator.ai_shadow_sample t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,7,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_shadow_sample') FROM owned o
 UNION ALL
SELECT o.id,8,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_shadow_evaluation') FROM owned o
 UNION ALL
SELECT t.creator_id,8,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_shadow_evaluation','document',to_jsonb(t)) FROM creator.ai_shadow_evaluation t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,8,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_shadow_evaluation') FROM owned o
 UNION ALL
SELECT o.id,9,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_ingestion') FROM owned o
 UNION ALL
SELECT t.creator_id,9,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_ingestion','document',to_jsonb(t)) FROM creator.ai_ingestion t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,9,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_ingestion') FROM owned o
 UNION ALL
SELECT o.id,10,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_event') FROM owned o
 UNION ALL
SELECT t.creator_id,10,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_event','document',to_jsonb(t)) FROM creator.ai_event t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,10,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_event') FROM owned o
 UNION ALL
SELECT o.id,11,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_cost_hold') FROM owned o
 UNION ALL
SELECT t.creator_id,11,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_cost_hold','document',to_jsonb(t)) FROM creator.ai_cost_hold t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,11,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_cost_hold') FROM owned o
 UNION ALL
SELECT o.id,12,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_chunk') FROM owned o
 UNION ALL
SELECT t.creator_id,12,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_chunk','document',to_jsonb(t)) FROM creator.ai_chunk t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,12,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_chunk') FROM owned o
 UNION ALL
SELECT o.id,13,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_command') FROM owned o
 UNION ALL
SELECT t.creator_id,13,1,0,t.account_id::text||':'||t.key,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_command','document',to_jsonb(t)) FROM creator.ai_command t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,13,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_command') FROM owned o
 UNION ALL
SELECT o.id,14,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_style_embedding') FROM owned o
 UNION ALL
SELECT t.creator_id,14,1,0,t.example_id::text||':'||t.text_hash||':'||t.model,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_style_embedding','document',to_jsonb(t)) FROM creator.ai_style_embedding t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,14,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_style_embedding') FROM owned o
 UNION ALL
SELECT o.id,15,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','generationReceipts') FROM owned o
 UNION ALL
SELECT t.creator_id,15,1,0,t.id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','generationReceipts','document',to_jsonb(t)) FROM creator.ai_generation_receipt t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,15,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','generationReceipts') FROM owned o
 UNION ALL
SELECT o.id,16,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_generation_admission') FROM owned o
 UNION ALL
SELECT t.creator_id,16,1,0,t.generation_id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_generation_admission','document',to_jsonb(t)) FROM creator.ai_generation_admission t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,16,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_generation_admission') FROM owned o
 UNION ALL
SELECT o.id,17,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_start','name','ai_generation_attempt') FROM owned o
 UNION ALL
SELECT t.creator_id,17,1,0,t.generation_id::text||':'||t.attempt_id::text,jsonb_build_object('creatorId',t.creator_id,'kind','array_item','name','ai_generation_attempt','document',to_jsonb(t)) FROM creator.ai_generation_attempt t JOIN owned o ON o.id=t.creator_id
 UNION ALL
SELECT o.id,17,2,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','array_end','name','ai_generation_attempt') FROM owned o
 UNION ALL
SELECT o.id,18,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','scalar','document',jsonb_build_object('licenseRecord',to_jsonb(l),'tombstone',to_jsonb(t))) FROM owned o LEFT JOIN creator.ai_license l ON l.creator_id=o.id LEFT JOIN creator.ai_tombstone t ON t.creator_id=o.id
 UNION ALL
SELECT o.id,19,0,0::bigint,''::text,jsonb_build_object('creatorId',o.id,'kind','creator_end') FROM owned o
 ) SELECT p.packet FROM packets p ORDER BY p.creator_id,p.section,p.boundary,p.sort_number,p.sort_key;
END $$;

CREATE FUNCTION creator.current_agent_privacy_export(n uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT creator.agent_privacy_export_matches(n) THEN RAISE EXCEPTION 'Actual current export source required' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;

CREATE FUNCTION creator.end_agent_privacy_export(n uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE portal text; expected text; extra jsonb; rows_read bigint;
BEGIN
 IF NOT creator.agent_privacy_export_matches(n) THEN RAISE EXCEPTION 'Export purpose ended before source exhaustion' USING ERRCODE='42501'; END IF;
 portal:='w2_agent_export_'||replace(n::text,'-','');
 expected:=format('DECLARE %I NO SCROLL CURSOR FOR SELECT document FROM creator.agent_privacy_export_rows(%L::uuid)',portal,n::text);
 IF NOT EXISTS(SELECT FROM pg_cursors WHERE name=portal AND statement=expected AND NOT is_holdable AND NOT is_scrollable)
 THEN RAISE EXCEPTION 'Actual fixed source portal required' USING ERRCODE='42501'; END IF;
 -- The database probes this exact fixed portal itself; caller EOF/flags are not
 -- accepted. An unread row refuses and canonical owner rolls back the source.
 EXECUTE format('FETCH FORWARD 1 FROM %I',portal) INTO extra;
 GET DIAGNOSTICS rows_read=ROW_COUNT;
 IF rows_read<>0 OR extra IS NOT NULL THEN RAISE EXCEPTION 'Complete source exhaustion required' USING ERRCODE='55000'; END IF;
 IF NOT creator.agent_privacy_export_matches(n) THEN RAISE EXCEPTION 'Export task ended at EOF' USING ERRCODE='42501'; END IF;
 UPDATE creator.agent_privacy_export_scope SET exhausted=true WHERE nonce=n AND pid=pg_backend_pid()
  AND xid=pg_current_xact_id_if_assigned() AND login=session_user AND NOT exhausted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Single original source exhaustion required' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION creator.finish_agent_privacy_export_scope() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_query() !~* '^\s*COMMIT\s*;?\s*$' OR NEW.pid<>pg_backend_pid() OR NEW.xid<>pg_current_xact_id()
  OR NEW.login<>session_user OR NOT creator.agent_privacy_export_matches(NEW.nonce)
  OR NOT EXISTS(SELECT FROM creator.agent_privacy_export_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid
   AND s.login=NEW.login AND s.nonce=NEW.nonce AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token
   AND s.binding=NEW.binding AND s.exhausted) THEN
  RAISE EXCEPTION 'Actual current complete export COMMIT required' USING ERRCODE='23514';
 END IF;
 DELETE FROM creator.agent_privacy_export_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid
  AND s.login=NEW.login AND s.nonce=NEW.nonce AND s.binding=NEW.binding AND s.exhausted;
 IF NOT FOUND THEN RAISE EXCEPTION 'Export COMMIT custody missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER w2_privacy_export_commit AFTER INSERT ON creator.agent_privacy_export_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.finish_agent_privacy_export_scope();
RESET ROLE;
ALTER TABLE creator.agent_privacy_export_scope OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.begin_agent_privacy_export(uuid,uuid,uuid,uuid,uuid) OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.agent_privacy_export_matches(uuid) OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.agent_privacy_export_rows(uuid) OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.current_agent_privacy_export(uuid) OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.end_agent_privacy_export(uuid) OWNER TO creator_w2_privacy_export;
ALTER FUNCTION creator.finish_agent_privacy_export_scope() OWNER TO creator_w2_privacy_export;
REVOKE ALL ON FUNCTION creator.begin_agent_privacy_export(uuid,uuid,uuid,uuid,uuid),creator.agent_privacy_export_matches(uuid),
 creator.agent_privacy_export_rows(uuid),creator.current_agent_privacy_export(uuid),creator.end_agent_privacy_export(uuid),creator.finish_agent_privacy_export_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.begin_agent_privacy_export(uuid,uuid,uuid,uuid,uuid),creator.agent_privacy_export_rows(uuid),
 creator.current_agent_privacy_export(uuid),creator.end_agent_privacy_export(uuid) TO creator_runtime;
COMMIT;
