-- Reserved0099_w1_generation_terminal_scope. Held/unactivated; requires W8's
-- separate0100 negatives and reviewed W2/W3/W4 terminal consumers.0072 is unchanged.
-- This purpose can settle the original cursor; it cannot read or append text,
-- extract memory, acquire a generation lease, or admit another provider request.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_generation_terminal_authority') THEN
  CREATE ROLE creator_generation_terminal_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_generation_terminal_authority'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing generation terminal role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_generation_terminal_authority;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.generation_terminal_scope (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id xid8 NOT NULL,
 backend_pid integer NOT NULL, login_name name NOT NULL,
 generation_id uuid NOT NULL, custody_token uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN('completion','reconciliation')),
 task jsonb, transitioned boolean NOT NULL DEFAULT false,
 finalized boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE creator.generation_terminal_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.generation_terminal_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY generation_terminal_private ON creator.generation_terminal_scope
 TO creator_generation_terminal_authority USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE,UPDATE(task,transitioned,finalized)
 ON creator.generation_terminal_scope TO creator_generation_terminal_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,grant_id,reservation_id,
 epoch,last_sequence,state,context_revision,accepted_at,worker_token,lease_until,completed_at,
 initiating_account_id,initiating_session_id,initiating_adult_verified_at,acceptance_transaction),UPDATE(id)
 ON creator.generation TO creator_generation_terminal_authority;
GRANT SELECT(id,creator_id,fan_id,control,control_epoch,revision,processor_consent_version,deleted_at),UPDATE(id)
 ON creator.thread TO creator_generation_terminal_authority;
GRANT SELECT(id,account_id,verification,recovery_required),UPDATE(id)
 ON creator.creator_profile TO creator_generation_terminal_authority;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile TO creator_generation_terminal_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at),UPDATE(id)
 ON creator.identity_session TO creator_generation_terminal_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,delivery_state)
 ON creator.message TO creator_generation_terminal_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,account_id,version,withdrawn_at),UPDATE(id)
 ON creator.processor_consent TO creator_generation_terminal_authority;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['generation','thread','creator_profile','fan_profile','message','processor_consent'] LOOP
  EXECUTE format('CREATE POLICY generation_terminal_metadata ON creator.%I FOR SELECT TO creator_generation_terminal_authority USING(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['generation','thread','creator_profile','fan_profile','processor_consent'] LOOP
  EXECUTE format('CREATE POLICY generation_terminal_lock ON creator.%I FOR UPDATE TO creator_generation_terminal_authority USING(true) WITH CHECK(false)',t);
 END LOOP;
END $$;

CREATE FUNCTION creator.pending_generation_terminals(n integer) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR n IS NULL OR n<1 OR n>64
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded terminal discovery' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT id FROM creator.generation WHERE state IN('queued','generating')
  AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY accepted_at,id LIMIT n;
END $$;

-- Initial metadata is captured before W8's negative leases or positive family
-- locks. No caller-supplied family/hold/session can substitute for this tuple.
CREATE FUNCTION creator.begin_generation_terminal(g uuid,c uuid,m text,w uuid,s integer,failed boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE nonce uuid; snapshot jsonb; allowed boolean;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR c IS NULL OR s IS NULL OR s<0
  OR failed IS NULL OR m NOT IN('completion','reconciliation') OR m IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
  OR nullif(current_setting('generation.terminal_nonce',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 IF m='reconciliation' AND NOT failed THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('generationId',x.id,'threadId',x.thread_id,'creatorId',x.creator_id,'fanId',x.fan_id,
  'initiatingAccountId',x.initiating_account_id,'initiatingSessionId',x.initiating_session_id,
  'acceptanceTransaction',x.acceptance_transaction::text,'adultVerifiedAt',x.initiating_adult_verified_at,
  'creatorAccountId',cp.account_id,'fanMessageId',x.fan_message_id,'aiMessageId',x.ai_message_id,
  'grantId',x.grant_id,'reservationId',x.reservation_id,'epoch',x.epoch,'contextRevision',x.context_revision,
  'lastSequence',x.last_sequence,'originalWorkerToken',x.worker_token,'originalLeaseUntil',x.lease_until,
  'sourceState',x.state,'targetState',CASE WHEN failed THEN CASE WHEN s>0 THEN 'interrupted' ELSE 'failed' END ELSE 'delivered' END,
  'threadRevision',t.revision,'processorConsentVersion',t.processor_consent_version,
  'originalMessageState',ai.delivery_state)
 INTO snapshot FROM creator.generation x JOIN creator.thread t ON t.id=x.thread_id
 JOIN creator.creator_profile cp ON cp.id=x.creator_id JOIN creator.fan_profile f ON f.id=x.fan_id
 JOIN creator.message fm ON fm.id=x.fan_message_id AND fm.thread_id=x.thread_id
 JOIN creator.message ai ON ai.id=x.ai_message_id AND ai.thread_id=x.thread_id
 WHERE x.id=g AND x.state IN('queued','generating') AND x.completed_at IS NULL AND x.last_sequence=s
  AND x.initiating_account_id IS NOT NULL AND x.initiating_session_id IS NOT NULL
  AND x.initiating_adult_verified_at IS NOT NULL AND x.acceptance_transaction IS NOT NULL
  AND f.account_id=x.initiating_account_id AND t.creator_id=x.creator_id AND t.fan_id=x.fan_id
  AND fm.creator_id=x.creator_id AND fm.fan_id=x.fan_id AND fm.author_kind='fan'
  AND fm.author_account_id=x.initiating_account_id AND fm.delivery_state='accepted'
  AND ai.creator_id=x.creator_id AND ai.fan_id=x.fan_id AND ai.author_kind='ai'
  AND ai.delivery_state IN('accepted','generating')
  AND (m='reconciliation' OR (x.state='generating' AND w IS NOT NULL AND x.worker_token=w
   AND x.lease_until>clock_timestamp() AND (failed OR s>0)));
 IF snapshot IS NULL THEN RETURN NULL; END IF;
 INSERT INTO creator.generation_terminal_scope(transaction_id,backend_pid,login_name,generation_id,custody_token,mode,task)
 VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,g,c,m,snapshot) RETURNING id INTO nonce;
 PERFORM set_config('generation.terminal_nonce',nonce::text,true);
 allowed:=creator.generation_terminal_matches(g,c,false);
 IF NOT allowed THEN PERFORM creator.end_generation_terminal(); RETURN NULL; END IF;
 RETURN jsonb_build_object('nonce',nonce,'mode',m,'custodyToken',c,'task',snapshot);
END $$;

CREATE FUNCTION creator.generation_terminal_matches(g uuid,c uuid,final_check boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope creator.generation_terminal_scope%ROWTYPE; denial text; original_live boolean; family_ok boolean;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR c IS NULL OR final_check IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL THEN RETURN false; END IF;
 SELECT * INTO scope FROM creator.generation_terminal_scope
 WHERE id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND generation_id=g AND custody_token=c AND task IS NOT NULL
  AND created_at>clock_timestamp()-interval '5 seconds';
 IF NOT FOUND THEN RETURN false; END IF;
 IF to_regprocedure('creator_trust.generation_terminal_denial(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Terminal negative authority is not installed' USING ERRCODE='55000';
 END IF;
 EXECUTE 'SELECT creator_trust.generation_terminal_denial($1)' INTO denial USING g;
 -- W8 separately distinguishes a genuinely denied positive family whose
 -- original custody may be reconciled. It supplies no positive source right.
 IF denial='denied' THEN
  RAISE EXCEPTION 'Terminal custody is denied' USING ERRCODE='42501';
 ELSIF denial NOT IN('allowed','reconciliation_allowed') OR denial IS NULL THEN
  RAISE EXCEPTION 'Terminal negative authority is unavailable or denied' USING ERRCODE='55000';
 END IF;
 IF scope.mode='completion' AND denial<>'allowed' THEN RETURN false; END IF;
 SELECT EXISTS(SELECT FROM creator.identity_session WHERE id=(scope.task->>'initiatingSessionId')::uuid
  AND account_id=(scope.task->>'initiatingAccountId')::uuid AND revoked_at IS NULL AND expires_at>clock_timestamp())
 INTO original_live;
 IF scope.mode='completion' THEN
  IF NOT original_live OR (scope.task->>'originalLeaseUntil')::timestamptz<=clock_timestamp()
   OR (scope.task->>'originalLeaseUntil') IS NULL OR (scope.task->>'originalWorkerToken') IS NULL THEN RETURN false; END IF;
  PERFORM id FROM creator.identity_session WHERE id=(scope.task->>'initiatingSessionId')::uuid
   AND account_id=(scope.task->>'initiatingAccountId')::uuid AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 -- Negative leases precede family/job locks. No later phase can acquire a
 -- new job token or change the captured cursor/context/family revision.
 PERFORM id FROM creator.thread WHERE id=(scope.task->>'threadId')::uuid
  AND creator_id=(scope.task->>'creatorId')::uuid AND fan_id=(scope.task->>'fanId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 IF scope.mode='completion' THEN
  PERFORM id FROM creator.creator_profile WHERE id=(scope.task->>'creatorId')::uuid
   AND verification='verified' AND NOT recovery_required FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM creator.fan_profile WHERE id=(scope.task->>'fanId')::uuid
   AND account_id=(scope.task->>'initiatingAccountId')::uuid FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM id FROM creator.processor_consent WHERE thread_id=(scope.task->>'threadId')::uuid
   AND creator_id=(scope.task->>'creatorId')::uuid AND fan_id=(scope.task->>'fanId')::uuid
   AND account_id=(scope.task->>'initiatingAccountId')::uuid
   AND version=scope.task->>'processorConsentVersion' AND withdrawn_at IS NULL FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 PERFORM id FROM creator.generation WHERE id=g FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT EXISTS(SELECT FROM creator.generation x JOIN creator.thread t ON t.id=x.thread_id
  JOIN creator.creator_profile cp ON cp.id=x.creator_id JOIN creator.fan_profile f ON f.id=x.fan_id
  JOIN creator.message fm ON fm.id=x.fan_message_id AND fm.thread_id=x.thread_id
  JOIN creator.message ai ON ai.id=x.ai_message_id AND ai.thread_id=x.thread_id
  WHERE x.id=g AND x.thread_id=(scope.task->>'threadId')::uuid
   AND x.creator_id=(scope.task->>'creatorId')::uuid AND x.fan_id=(scope.task->>'fanId')::uuid
   AND x.fan_message_id=(scope.task->>'fanMessageId')::uuid AND x.ai_message_id=(scope.task->>'aiMessageId')::uuid
   AND x.grant_id=(scope.task->>'grantId')::uuid AND x.reservation_id IS NOT DISTINCT FROM (scope.task->>'reservationId')::uuid
   AND x.initiating_account_id=(scope.task->>'initiatingAccountId')::uuid
   AND x.initiating_session_id=(scope.task->>'initiatingSessionId')::uuid
   AND x.acceptance_transaction::text=scope.task->>'acceptanceTransaction'
   AND x.initiating_adult_verified_at=(scope.task->>'adultVerifiedAt')::timestamptz
   AND x.epoch=(scope.task->>'epoch')::integer AND x.context_revision IS NOT DISTINCT FROM (scope.task->>'contextRevision')::integer
   AND x.last_sequence=(scope.task->>'lastSequence')::integer AND cp.account_id=(scope.task->>'creatorAccountId')::uuid
   AND f.account_id=x.initiating_account_id AND t.creator_id=x.creator_id AND t.fan_id=x.fan_id
   AND t.revision=(scope.task->>'threadRevision')::integer
   AND t.processor_consent_version IS NOT DISTINCT FROM scope.task->>'processorConsentVersion'
   AND fm.creator_id=x.creator_id AND fm.fan_id=x.fan_id AND fm.author_kind='fan'
   AND fm.author_account_id=x.initiating_account_id AND fm.delivery_state='accepted'
   AND ai.creator_id=x.creator_id AND ai.fan_id=x.fan_id AND ai.author_kind='ai'
   AND (scope.mode<>'completion' OR (t.control='ai_active' AND t.control_epoch=x.epoch AND t.deleted_at IS NULL
    AND t.revision=x.context_revision+x.last_sequence AND cp.verification='verified' AND NOT cp.recovery_required))
   AND (scope.mode<>'reconciliation' OR denial='reconciliation_allowed' OR NOT original_live
    OR (scope.task->>'originalLeaseUntil') IS NULL OR (scope.task->>'originalLeaseUntil')::timestamptz<=clock_timestamp()
    OR t.control<>'ai_active' OR t.control_epoch<>x.epoch)
   AND (CASE WHEN NOT scope.transitioned THEN
    NOT final_check AND x.state=scope.task->>'sourceState' AND x.completed_at IS NULL
     AND x.worker_token IS NOT DISTINCT FROM (scope.task->>'originalWorkerToken')::uuid
     AND x.lease_until IS NOT DISTINCT FROM (scope.task->>'originalLeaseUntil')::timestamptz
     AND ai.delivery_state=scope.task->>'originalMessageState'
    ELSE x.state=scope.task->>'targetState'
     AND (NOT final_check OR (scope.finalized AND x.completed_at IS NOT NULL
      AND x.worker_token IS NULL AND x.lease_until IS NULL AND ai.delivery_state=scope.task->>'targetState')) END))
 INTO family_ok;
 RETURN family_ok AND (scope.mode<>'completion' OR original_live);
END $$;

-- Capture the real same-transaction transition, including staged W3 writes.
-- Trigger records cannot be supplied as a worker JSON assertion.
CREATE FUNCTION creator.capture_generation_terminal() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scope creator.generation_terminal_scope%ROWTYPE;
BEGIN
 IF nullif(current_setting('generation.terminal_nonce',true),'') IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO scope FROM creator.generation_terminal_scope
 WHERE id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND generation_id=OLD.id AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds';
 IF NOT FOUND OR session_user<>'creator_generation_worker'
  OR (to_jsonb(NEW)-ARRAY['state','completed_at','worker_token','lease_until'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','completed_at','worker_token','lease_until'])
  OR NEW.state IS DISTINCT FROM scope.task->>'targetState'
  OR OLD.thread_id IS DISTINCT FROM (scope.task->>'threadId')::uuid
  OR OLD.creator_id IS DISTINCT FROM (scope.task->>'creatorId')::uuid
  OR OLD.fan_id IS DISTINCT FROM (scope.task->>'fanId')::uuid
  OR OLD.initiating_account_id IS DISTINCT FROM (scope.task->>'initiatingAccountId')::uuid
  OR OLD.initiating_session_id IS DISTINCT FROM (scope.task->>'initiatingSessionId')::uuid
  OR OLD.initiating_adult_verified_at IS DISTINCT FROM (scope.task->>'adultVerifiedAt')::timestamptz
  OR OLD.acceptance_transaction::text IS DISTINCT FROM scope.task->>'acceptanceTransaction'
  OR OLD.fan_message_id IS DISTINCT FROM (scope.task->>'fanMessageId')::uuid
  OR OLD.ai_message_id IS DISTINCT FROM (scope.task->>'aiMessageId')::uuid
  OR OLD.grant_id IS DISTINCT FROM (scope.task->>'grantId')::uuid
  OR OLD.reservation_id IS DISTINCT FROM (scope.task->>'reservationId')::uuid
  OR OLD.epoch IS DISTINCT FROM (scope.task->>'epoch')::integer
  OR OLD.context_revision IS DISTINCT FROM (scope.task->>'contextRevision')::integer
  OR OLD.last_sequence<>(scope.task->>'lastSequence')::integer
  OR (NOT scope.transitioned AND (OLD.state IS DISTINCT FROM scope.task->>'sourceState'
   OR OLD.worker_token IS DISTINCT FROM (scope.task->>'originalWorkerToken')::uuid
   OR OLD.lease_until IS DISTINCT FROM (scope.task->>'originalLeaseUntil')::timestamptz))
  OR (scope.transitioned AND OLD.state IS DISTINCT FROM scope.task->>'targetState')
  OR (NEW.completed_at IS NULL AND (NEW.worker_token IS DISTINCT FROM OLD.worker_token OR NEW.lease_until IS DISTINCT FROM OLD.lease_until))
  OR (NEW.completed_at IS NOT NULL AND (NEW.worker_token IS NOT NULL OR NEW.lease_until IS NOT NULL
   OR NEW.completed_at<transaction_timestamp() OR NEW.completed_at>clock_timestamp()))
  OR scope.finalized THEN
  RAISE EXCEPTION 'Terminal transition differs from its original custody' USING ERRCODE='23514';
 END IF;
 UPDATE creator.generation_terminal_scope SET transitioned=true,finalized=NEW.completed_at IS NOT NULL WHERE id=scope.id;
 RETURN NEW;
END $$;
CREATE TRIGGER generation_terminal_transition BEFORE UPDATE ON creator.generation
 FOR EACH ROW EXECUTE FUNCTION creator.capture_generation_terminal();
CREATE FUNCTION creator.end_generation_terminal() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' THEN RETURN; END IF;
 DELETE FROM creator.generation_terminal_scope WHERE id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user;
 PERFORM set_config('generation.terminal_nonce','',true);
END $$;
CREATE FUNCTION creator.require_generation_terminal_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.generation_terminal_scope WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'Terminal scope must end before commit' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_generation_terminal_cleanup AFTER INSERT ON creator.generation_terminal_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_generation_terminal_cleanup();
RESET ROLE;
DO $$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY[
  'creator.pending_generation_terminals(integer)'::regprocedure,
  'creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean)'::regprocedure,
  'creator.generation_terminal_matches(uuid,uuid,boolean)'::regprocedure,
  'creator.capture_generation_terminal()'::regprocedure,
  'creator.end_generation_terminal()'::regprocedure,
  'creator.require_generation_terminal_cleanup()'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO creator_generation_terminal_authority',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION creator.pending_generation_terminals(integer),
 creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean),
 creator.generation_terminal_matches(uuid,uuid,boolean),creator.end_generation_terminal()
 TO creator_generation_worker;
-- Registry compatibility only: without the distinct0072 read nonce this returns
-- false. Terminal functions never invoke it or gain positive input permission.
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid) TO creator_generation_terminal_authority;
COMMIT;
