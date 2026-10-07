-- Held original Conversation deletion receipt and Agent accounting boundary.
-- The original 0087 lease/COMMIT fence remains the authority. No task, lease,
-- acknowledgement, privacy registration or historical receipt is synthesized.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_accounting_boundary') THEN
  CREATE ROLE creator_privacy_accounting_boundary NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_accounting_boundary'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members WHERE to_regrole('creator_privacy_accounting_boundary') IN(member,roleid))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_privacy_accounting_boundary'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=to_regrole('creator_privacy_accounting_boundary')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated accounting boundary owner required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator_trust TO creator_privacy_accounting_boundary;
SET LOCAL ROLE creator_trust_owner;
GRANT SELECT(job_id,domain,state,lease_token,lease_until,receipt,data,completed_at),UPDATE(receipt)
 ON creator_trust.privacy_task TO creator_privacy_accounting_boundary;
CREATE POLICY accounting_boundary_read ON creator_trust.privacy_task FOR SELECT TO creator_privacy_accounting_boundary USING(true);
CREATE POLICY accounting_boundary_receipt ON creator_trust.privacy_task FOR UPDATE TO creator_privacy_accounting_boundary USING(true) WITH CHECK(true);
RESET ROLE;

CREATE FUNCTION creator_trust.privacy_accounting_original_scope(j uuid,d text,k uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_privacy_fence'
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR j IS NULL OR k IS NULL OR d IS NULL OR d NOT IN('conversation','agent')
 THEN RAISE EXCEPTION 'Original held accounting privacy scope required' USING ERRCODE='42501'; END IF;
 SELECT s.binding INTO original FROM creator_trust.privacy_commit_scope s
 WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
  AND s.job_id=j AND s.domain=d AND s.lease_token=k
  AND (s.binding->>'lease_until')::timestamptz>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Current original accounting privacy lease required' USING ERRCODE='42501'; END IF;
 RETURN original;
END $$;
ALTER FUNCTION creator_trust.privacy_accounting_original_scope(uuid,text,uuid) OWNER TO creator_privacy_fence;
REVOKE ALL ON FUNCTION creator_trust.privacy_accounting_original_scope(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.privacy_accounting_original_scope(uuid,text,uuid) TO creator_privacy_accounting_boundary;

CREATE FUNCTION creator_trust.immutable_conversation_delete_receipt()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb;
BEGIN
 IF OLD.receipt->>'format'='conversation-delete-committed-v1' THEN
  IF NEW.receipt IS DISTINCT FROM OLD.receipt OR NEW.job_id IS DISTINCT FROM OLD.job_id
   OR NEW.domain IS DISTINCT FROM OLD.domain THEN
   RAISE EXCEPTION 'Original committed Conversation deletion receipt is immutable' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.receipt->>'format'='conversation-delete-committed-v1' THEN
  IF TG_OP<>'UPDATE' OR TG_TABLE_SCHEMA<>'creator_trust' OR TG_TABLE_NAME<>'privacy_task'
   OR OLD.domain<>'conversation' OR OLD.state<>'running' OR OLD.receipt IS NOT NULL
   OR NEW.job_id IS DISTINCT FROM OLD.job_id OR NEW.domain IS DISTINCT FROM OLD.domain
   OR NEW.state IS DISTINCT FROM OLD.state OR NEW.lease_token IS DISTINCT FROM OLD.lease_token
   OR NEW.lease_until IS DISTINCT FROM OLD.lease_until
  THEN RAISE EXCEPTION 'Original Conversation receipt transition required' USING ERRCODE='23514'; END IF;
  original:=creator_trust.privacy_accounting_original_scope(OLD.job_id,'conversation',OLD.lease_token);
  IF original->>'kind' IS DISTINCT FROM 'delete' THEN
   RAISE EXCEPTION 'Only original deletion may persist this receipt' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION creator_trust.save_conversation_delete_receipt(j uuid,k uuid,payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb; saved jsonb; n integer; accounting jsonb; financial jsonb;
BEGIN
 original:=creator_trust.privacy_accounting_original_scope(j,'conversation',k);
 IF original->>'kind' IS DISTINCT FROM 'delete' OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
  OR octet_length(payload::text)>4000000 OR payload->>'domain' IS DISTINCT FROM 'conversation'
  OR payload->>'jobId' IS DISTINCT FROM j::text OR payload->>'idempotencyKey' IS DISTINCT FROM j::text||':conversation'
  OR jsonb_typeof(payload->'retained') IS DISTINCT FROM 'array'
  OR coalesce(payload->>'processedThreads','') !~ '^(0|[1-9][0-9]{0,2})$'
  OR payload ? 'format' OR payload ? 'completedAt'
 THEN RAISE EXCEPTION 'Complete original Conversation deletion result required' USING ERRCODE='23514'; END IF;
 n:=(payload->>'processedThreads')::integer;
 accounting:=coalesce(payload->'accountingReceipts','[]'::jsonb);
 financial:=coalesce(payload->'financialDispositions','[]'::jsonb);
 IF n>100 OR jsonb_typeof(accounting) IS DISTINCT FROM 'array' OR jsonb_typeof(financial) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Bounded original accounting family receipts required' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(accounting)<>n OR jsonb_array_length(financial)<>n
  OR EXISTS(SELECT FROM jsonb_array_elements(accounting) a WHERE a->>'schemaVersion' IS DISTINCT FROM '3'
   OR a->>'domain' IS DISTINCT FROM 'agent' OR a->>'jobId' IS DISTINCT FROM j::text
   OR a->'threadAccountingPurged' IS DISTINCT FROM 'true'::jsonb
   OR a->>'retentionVersion' IS DISTINCT FROM 'w8-product-retention-20261007-v2'
   OR coalesce(a->>'financialDispositionReference','') !~ '^[a-f0-9]{64}$'
   OR NOT EXISTS(SELECT FROM jsonb_array_elements(financial) f
    WHERE f->>'threadId'=a->'family'->>'threadId'
     AND f->>'financialDispositionReference'=a->>'financialDispositionReference'))
  OR (SELECT count(DISTINCT a->'family'->>'threadId') FROM jsonb_array_elements(accounting) a)<>n
 THEN RAISE EXCEPTION 'Every original family requires matching accounting and financial disposition' USING ERRCODE='23514'; END IF;
 saved:=payload||jsonb_build_object('schemaVersion',3,'format','conversation-delete-committed-v1','completedAt',clock_timestamp());
 UPDATE creator_trust.privacy_task t SET receipt=saved WHERE t.job_id=j AND t.domain='conversation'
  AND t.state='running' AND t.lease_token=k AND t.lease_until>clock_timestamp() AND t.receipt IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original receipt already persisted or lease changed' USING ERRCODE='42501'; END IF;
 RETURN saved;
END $$;

CREATE FUNCTION creator_trust.recover_conversation_delete_receipt(j uuid,k uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb; saved jsonb;
BEGIN
 original:=creator_trust.privacy_accounting_original_scope(j,'conversation',k);
 IF original->>'kind' IS DISTINCT FROM 'delete' THEN
  RAISE EXCEPTION 'Original deletion recovery required' USING ERRCODE='42501'; END IF;
 SELECT t.receipt INTO saved FROM creator_trust.privacy_task t WHERE t.job_id=j AND t.domain='conversation'
  AND t.state='running' AND t.lease_token=k AND t.lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND OR (saved IS NOT NULL AND saved->>'format' IS DISTINCT FROM 'conversation-delete-committed-v1')
 THEN RAISE EXCEPTION 'Original durable deletion result unavailable' USING ERRCODE='42501'; END IF;
 RETURN saved;
END $$;

CREATE FUNCTION creator_trust.agent_conversation_accounting_boundary(j uuid,k uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original jsonb; saved jsonb; artifact jsonb; finished timestamptz;
BEGIN
 original:=creator_trust.privacy_accounting_original_scope(j,'agent',k);
 SELECT t.receipt,t.data,t.completed_at INTO saved,artifact,finished FROM creator_trust.privacy_task t
 WHERE t.job_id=j AND t.domain='conversation' AND t.state='complete' AND t.completed_at IS NOT NULL FOR SHARE NOWAIT;
 IF NOT FOUND OR saved->>'domain' IS DISTINCT FROM 'conversation' OR saved->>'jobId' IS DISTINCT FROM j::text
  OR saved->>'idempotencyKey' IS DISTINCT FROM j::text||':conversation'
 THEN RAISE EXCEPTION 'Actual completed Conversation boundary required' USING ERRCODE='42501'; END IF;
 IF original->>'kind'='delete' THEN
  IF saved->>'format' IS DISTINCT FROM 'conversation-delete-committed-v1' OR saved->>'schemaVersion' IS DISTINCT FROM '3'
  THEN RAISE EXCEPTION 'Actual atomic accounting deletion result required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('kind','delete','reference',encode(sha256(convert_to(jsonb_build_object('receipt',saved,'completedAt',finished)::text,'UTF8')),'hex'));
 ELSIF original->>'kind'='export' THEN
  IF saved->>'schemaVersion' IS DISTINCT FROM '2' OR artifact IS NULL OR saved->'artifact' IS DISTINCT FROM artifact
   OR artifact->>'format' IS DISTINCT FROM 'privacy-stream-v1' OR artifact->>'jobId' IS DISTINCT FROM j::text
   OR artifact->>'domain' IS DISTINCT FROM 'conversation' OR artifact->>'accountId' IS DISTINCT FROM original->>'account_id'
  THEN RAISE EXCEPTION 'Actual complete protected Conversation artifact required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('kind','export','reference',encode(sha256(convert_to(jsonb_build_object('receipt',saved,'completedAt',finished)::text,'UTF8')),'hex'),'artifact',artifact);
 END IF;
 RAISE EXCEPTION 'Original privacy kind required' USING ERRCODE='42501';
END $$;

CREATE TRIGGER conversation_delete_receipt_immutable BEFORE UPDATE ON creator_trust.privacy_task
 FOR EACH ROW EXECUTE FUNCTION creator_trust.immutable_conversation_delete_receipt();
ALTER FUNCTION creator_trust.immutable_conversation_delete_receipt() OWNER TO creator_privacy_accounting_boundary;
ALTER FUNCTION creator_trust.save_conversation_delete_receipt(uuid,uuid,jsonb) OWNER TO creator_privacy_accounting_boundary;
ALTER FUNCTION creator_trust.recover_conversation_delete_receipt(uuid,uuid) OWNER TO creator_privacy_accounting_boundary;
ALTER FUNCTION creator_trust.agent_conversation_accounting_boundary(uuid,uuid) OWNER TO creator_privacy_accounting_boundary;
REVOKE ALL ON FUNCTION creator_trust.immutable_conversation_delete_receipt(),creator_trust.save_conversation_delete_receipt(uuid,uuid,jsonb),creator_trust.recover_conversation_delete_receipt(uuid,uuid),creator_trust.agent_conversation_accounting_boundary(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.save_conversation_delete_receipt(uuid,uuid,jsonb),creator_trust.recover_conversation_delete_receipt(uuid,uuid),creator_trust.agent_conversation_accounting_boundary(uuid,uuid) TO creator_runtime;
COMMIT;
