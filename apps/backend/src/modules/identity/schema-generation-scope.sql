-- Reserved0072_w1_generation_worker_scope. Unactivated proposal; W8 must review
-- and register this plus0093 negative authority and W3/W2 purpose consumers.
-- No Actor, request session, source body, signing or provider permission is minted.
BEGIN;
RESET ROLE;
DO $$ DECLARE role_name text; login boolean; role_oid oid; BEGIN
 FOR role_name,login IN VALUES ('creator_generation_worker',true),('creator_generation_authority',false) LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('CREATE ROLE %I %s NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION',role_name,CASE WHEN login THEN 'LOGIN' ELSE 'NOLOGIN' END);
  END IF;
  SELECT oid INTO role_oid FROM pg_roles WHERE rolname=role_name AND rolcanlogin=login
   AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolinherit AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
  IF role_oid IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE roleid=role_oid OR member=role_oid)
   OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=role_oid)
   OR EXISTS(SELECT FROM pg_class WHERE relowner=role_oid)
   OR EXISTS(SELECT FROM pg_proc WHERE proowner=role_oid) THEN
   RAISE EXCEPTION 'Unsafe existing generation purpose role';
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_generation_worker,creator_generation_authority;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_generation_worker;
ALTER TABLE creator.generation
 ADD COLUMN initiating_account_id uuid,
 ADD COLUMN initiating_session_id uuid,
 ADD COLUMN initiating_adult_verified_at timestamptz,
 ADD COLUMN acceptance_transaction xid8;
-- Nullable legacy rows are deliberately not backfilled or silently adopted.
CREATE TABLE creator.generation_worker_scope (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id xid8 NOT NULL,
 backend_pid integer NOT NULL, login_name name NOT NULL,
 generation_id uuid NOT NULL, worker_token uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('claim','read')), task jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE creator.generation_worker_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.generation_worker_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY generation_authority_scope ON creator.generation_worker_scope TO creator_generation_authority USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE,UPDATE(task) ON creator.generation_worker_scope TO creator_generation_authority;

-- Column-only metadata and exact claim updates. Neither purpose role can read
-- fan text, memory, upstream credentials, full AI configuration or signing data.
GRANT SELECT(id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,grant_id,reservation_id,
 epoch,last_sequence,state,context_revision,accepted_at,worker_token,lease_until,
 initiating_account_id,initiating_session_id,initiating_adult_verified_at,acceptance_transaction),
 UPDATE(id,state,worker_token,lease_until,context_revision,initiating_adult_verified_at) ON creator.generation TO creator_generation_authority;
GRANT SELECT(id,creator_id,fan_id,control,control_epoch,revision,processor_consent_version,deleted_at),UPDATE(id)
 ON creator.thread TO creator_generation_authority;
GRANT SELECT(id,account_id,verification,recovery_required),UPDATE(id) ON creator.creator_profile TO creator_generation_authority;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile TO creator_generation_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at),UPDATE(id) ON creator.identity_session TO creator_generation_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,delivery_state) ON creator.message TO creator_generation_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,account_id,version,withdrawn_at),UPDATE(id)
 ON creator.processor_consent TO creator_generation_authority;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['generation','thread','creator_profile','fan_profile','identity_session','message','processor_consent'] LOOP
  EXECUTE format('CREATE POLICY generation_authority_metadata ON creator.%I FOR SELECT TO creator_generation_authority USING(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['thread','creator_profile','fan_profile','identity_session','processor_consent'] LOOP
  EXECUTE format('CREATE POLICY generation_authority_lock ON creator.%I FOR UPDATE TO creator_generation_authority USING(true) WITH CHECK(false)',t);
 END LOOP;
END $$;
CREATE POLICY generation_authority_claim ON creator.generation FOR UPDATE TO creator_generation_authority USING(true) WITH CHECK(true);

-- Capture the real session already held by the canonical fan acceptance. The
-- adult marker is confirmed separately by W1's genuinely issued fan scope.
CREATE FUNCTION creator.capture_generation_initiator() RETURNS trigger
-- Invoker identity is deliberate: only confirm_generation_initiator executes
-- its UPDATE as the inaccessible NOLOGIN authority. A core runtime UPDATE may
-- not set the confirmation marker even in the original acceptance transaction.
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE a uuid; s uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.initiating_account_id IS DISTINCT FROM OLD.initiating_account_id
   OR NEW.initiating_session_id IS DISTINCT FROM OLD.initiating_session_id
   OR NEW.acceptance_transaction IS DISTINCT FROM OLD.acceptance_transaction
   OR (NEW.initiating_adult_verified_at IS DISTINCT FROM OLD.initiating_adult_verified_at AND
    (OLD.initiating_adult_verified_at IS NOT NULL OR current_user<>'creator_generation_authority'
     OR OLD.acceptance_transaction IS DISTINCT FROM pg_current_xact_id()
     OR OLD.initiating_account_id IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
     OR OLD.initiating_session_id IS DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid)) THEN
   RAISE EXCEPTION 'Generation initiating provenance is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 a := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF session_user<>'creator_runtime' OR current_user<>session_user OR a IS NULL OR s IS NULL OR NEW.state<>'queued'
  OR NEW.worker_token IS NOT NULL OR NOT EXISTS(SELECT FROM creator.identity_session
    WHERE id=s AND account_id=a AND revoked_at IS NULL AND expires_at>clock_timestamp())
  OR NOT EXISTS(SELECT FROM creator.fan_profile f JOIN creator.message m ON m.fan_id=f.id
    WHERE f.id=NEW.fan_id AND f.account_id=a AND m.id=NEW.fan_message_id
     AND m.thread_id=NEW.thread_id AND m.creator_id=NEW.creator_id AND m.author_kind='fan'
     AND m.author_account_id=a AND m.delivery_state='accepted') THEN
  RAISE EXCEPTION 'A genuine accepted fan session is required' USING ERRCODE='42501';
 END IF;
 NEW.initiating_account_id:=a; NEW.initiating_session_id:=s;
 NEW.initiating_adult_verified_at:=NULL; NEW.acceptance_transaction:=pg_current_xact_id();
 RETURN NEW;
END $$;
CREATE TRIGGER generation_initiator BEFORE INSERT OR UPDATE ON creator.generation
 FOR EACH ROW EXECUTE FUNCTION creator.capture_generation_initiator();
CREATE FUNCTION creator.confirm_generation_initiator(g uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE changed integer;
BEGIN
 IF session_user<>'creator_runtime' OR g IS NULL THEN RETURN false; END IF;
 UPDATE creator.generation SET initiating_adult_verified_at=clock_timestamp()
 WHERE id=g AND state='queued' AND worker_token IS NULL AND initiating_adult_verified_at IS NULL
  AND acceptance_transaction=pg_current_xact_id()
  AND initiating_account_id=nullif(current_setting('app.account_id',true),'')::uuid
  AND initiating_session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid;
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE FUNCTION creator.pending_generation_tasks(n integer) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR n IS NULL OR n<1 OR n>64
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded generation worker discovery' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT id FROM creator.generation WHERE state IN('queued','generating')
  AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY accepted_at,id LIMIT n;
END $$;

-- Internal metadata proof. Negatives precede all positive family leases.
-- Known IDs and copied initiating provenance do not create this permission.
CREATE FUNCTION creator.generation_task_proof(g uuid,w uuid,claim boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE row creator.generation%ROWTYPE; denial text; proof jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT FROM creator.generation_worker_scope
  WHERE id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
   AND generation_id=g AND worker_token=w AND operation=CASE WHEN claim THEN 'claim' ELSE 'read' END
   AND created_at>clock_timestamp()-interval '5 seconds') THEN RETURN NULL; END IF;
 -- %ROWTYPE is only a record declaration; query projects metadata, never body.
 SELECT id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,grant_id,reservation_id,
  epoch,last_sequence,state,context_revision,accepted_at,worker_token,lease_until,
  initiating_account_id,initiating_session_id,initiating_adult_verified_at,acceptance_transaction
 INTO row.id,row.thread_id,row.creator_id,row.fan_id,row.fan_message_id,row.ai_message_id,row.grant_id,row.reservation_id,
  row.epoch,row.last_sequence,row.state,row.context_revision,row.accepted_at,row.worker_token,row.lease_until,
  row.initiating_account_id,row.initiating_session_id,row.initiating_adult_verified_at,row.acceptance_transaction
 FROM creator.generation WHERE id=g;
 IF NOT FOUND OR row.initiating_account_id IS NULL OR row.initiating_session_id IS NULL
  OR row.initiating_adult_verified_at IS NULL THEN RETURN NULL; END IF;
 IF claim THEN
  IF row.state NOT IN('queued','generating') OR row.last_sequence<>0
   OR row.lease_until>clock_timestamp() THEN RETURN NULL; END IF;
 ELSE
  IF row.state<>'generating' OR row.worker_token IS DISTINCT FROM w
   OR row.lease_until IS NULL OR row.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
 END IF;
 PERFORM id FROM creator.identity_session WHERE id=row.initiating_session_id
  AND account_id=row.initiating_account_id AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF to_regprocedure('creator_trust.generation_worker_denial(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Current generation denial authority is not installed' USING ERRCODE='55000';
 END IF;
 EXECUTE 'SELECT creator_trust.generation_worker_denial($1)' INTO denial USING g;
 IF denial='denied' THEN
  RAISE EXCEPTION 'Generation authority is currently denied' USING ERRCODE='42501';
 ELSIF denial IS DISTINCT FROM 'allowed' THEN
  RAISE EXCEPTION 'Current generation denial authority is unavailable' USING ERRCODE='55000';
 END IF;
 PERFORM id FROM creator.thread WHERE id=row.thread_id AND creator_id=row.creator_id AND fan_id=row.fan_id
  AND control='ai_active' AND control_epoch=row.epoch AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM id FROM creator.creator_profile WHERE id=row.creator_id AND verification='verified' AND NOT recovery_required FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM id FROM creator.fan_profile WHERE id=row.fan_id AND account_id=row.initiating_account_id FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM pc.id FROM creator.processor_consent pc JOIN creator.thread t ON t.id=pc.thread_id
  WHERE pc.thread_id=row.thread_id AND pc.creator_id=row.creator_id AND pc.fan_id=row.fan_id
   AND pc.account_id=row.initiating_account_id AND pc.version=t.processor_consent_version AND pc.withdrawn_at IS NULL FOR SHARE OF pc NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- The family lock precedes the job lock everywhere. NOWAIT also prevents a
 -- malformed concurrent writer from making this scope wait behind its locks.
 PERFORM x.id FROM creator.generation x
  JOIN creator.thread t ON t.id=x.thread_id AND t.creator_id=x.creator_id AND t.fan_id=x.fan_id
  JOIN creator.message m ON m.id=x.fan_message_id AND m.thread_id=x.thread_id
  JOIN creator.message ai ON ai.id=x.ai_message_id AND ai.thread_id=x.thread_id
  WHERE x.id=g AND x.initiating_account_id=row.initiating_account_id
   AND x.initiating_session_id=row.initiating_session_id AND x.initiating_adult_verified_at IS NOT NULL
   AND m.creator_id=x.creator_id AND m.fan_id=x.fan_id AND m.author_kind='fan'
   AND m.author_account_id=x.initiating_account_id AND m.delivery_state='accepted'
   AND ai.creator_id=x.creator_id AND ai.fan_id=x.fan_id AND ai.author_kind='ai'
   AND ((claim AND x.state IN('queued','generating') AND x.last_sequence=0
    AND (x.lease_until IS NULL OR x.lease_until<=clock_timestamp())) OR
    (NOT claim AND x.state='generating' AND x.worker_token=w AND x.lease_until>clock_timestamp()
     AND t.revision=x.context_revision+x.last_sequence)) FOR UPDATE OF x NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF claim THEN
  UPDATE creator.generation SET worker_token=w,lease_until=clock_timestamp()+interval '60 seconds',state='generating',
   context_revision=(SELECT revision FROM creator.thread WHERE id=row.thread_id)
  WHERE id=g AND state IN('queued','generating') AND last_sequence=0
   AND (lease_until IS NULL OR lease_until<=clock_timestamp());
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 SELECT jsonb_build_object('generationId',x.id,'threadId',x.thread_id,'creatorId',x.creator_id,'fanId',x.fan_id,
  'initiatingAccountId',x.initiating_account_id,'initiatingSessionId',x.initiating_session_id,
  'creatorAccountId',cp.account_id,'fanMessageId',x.fan_message_id,'aiMessageId',x.ai_message_id,
  'grantId',x.grant_id,'reservationId',x.reservation_id,'epoch',x.epoch,'contextRevision',x.context_revision,
  'lastSequence',x.last_sequence,'workerToken',x.worker_token,'leaseUntil',x.lease_until,
  'processorConsentVersion',t.processor_consent_version)
 INTO proof FROM creator.generation x JOIN creator.thread t ON t.id=x.thread_id
 JOIN creator.identity_session s ON s.id=x.initiating_session_id AND s.account_id=x.initiating_account_id
 JOIN creator.creator_profile cp ON cp.id=x.creator_id JOIN creator.fan_profile f ON f.id=x.fan_id
 JOIN creator.message m ON m.id=x.fan_message_id AND m.thread_id=x.thread_id
 JOIN creator.message ai ON ai.id=x.ai_message_id AND ai.thread_id=x.thread_id
 WHERE x.id=g AND x.worker_token=w AND x.state='generating' AND x.lease_until>clock_timestamp()
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND x.initiating_account_id=row.initiating_account_id AND x.initiating_session_id=row.initiating_session_id
  AND x.initiating_adult_verified_at IS NOT NULL AND f.account_id=x.initiating_account_id
  AND t.creator_id=x.creator_id AND t.fan_id=x.fan_id AND t.deleted_at IS NULL
  AND t.control='ai_active' AND t.control_epoch=x.epoch AND t.revision=x.context_revision+x.last_sequence
  AND cp.verification='verified' AND NOT cp.recovery_required
  AND m.creator_id=x.creator_id AND m.fan_id=x.fan_id AND m.author_kind='fan' AND m.author_account_id=x.initiating_account_id
  AND ai.creator_id=x.creator_id AND ai.fan_id=x.fan_id AND ai.author_kind='ai';
 IF claim AND proof IS NULL THEN
  RAISE EXCEPTION 'Claimed generation binding changed' USING ERRCODE='23514';
 END IF;
 RETURN proof;
END $$;

CREATE FUNCTION creator.claim_generation_task(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE nonce uuid; proof jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 INSERT INTO creator.generation_worker_scope(transaction_id,backend_pid,login_name,generation_id,worker_token,operation)
  VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,g,w,'claim') RETURNING id INTO nonce;
 PERFORM set_config('generation.scope_nonce',nonce::text,true);
 proof:=creator.generation_task_proof(g,w,true);
 PERFORM creator.end_generation_scope();
 RETURN proof;
END $$;
CREATE FUNCTION creator.begin_generation_scope(g uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb; nonce uuid;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 INSERT INTO creator.generation_worker_scope(transaction_id,backend_pid,login_name,generation_id,worker_token,operation)
  VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,g,w,'read') RETURNING id INTO nonce;
 PERFORM set_config('generation.scope_nonce',nonce::text,true);
 proof:=creator.generation_task_proof(g,w,false);
 IF proof IS NULL THEN PERFORM creator.end_generation_scope(); RETURN NULL; END IF;
 UPDATE creator.generation_worker_scope SET task=proof WHERE id=nonce;
 RETURN jsonb_build_object('nonce',nonce,'task',proof);
END $$;
CREATE FUNCTION creator.generation_scope_matches(g uuid,w uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE stored jsonb; current_task jsonb;
BEGIN
 SELECT task INTO stored FROM creator.generation_worker_scope
 WHERE id=nullif(current_setting('generation.scope_nonce',true),'')::uuid AND generation_id=g AND worker_token=w
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND operation='read' AND task IS NOT NULL
  AND created_at>clock_timestamp()-interval '5 seconds';
 IF NOT FOUND THEN RETURN false; END IF;
 current_task:=creator.generation_task_proof(g,w,false);
 -- W3 separately fences every exact admission/output cursor. Its own accepted
 -- sentence may advance that cursor inside this transaction, never the intent.
 RETURN current_task IS NOT NULL AND (current_task-'lastSequence')=(stored-'lastSequence')
  AND (current_task->>'lastSequence')::integer >= (stored->>'lastSequence')::integer;
END $$;
CREATE FUNCTION creator.end_generation_scope() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' THEN RETURN; END IF;
 DELETE FROM creator.generation_worker_scope WHERE id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user;
 PERFORM set_config('generation.scope_nonce','',true);
END $$;
CREATE FUNCTION creator.require_generation_scope_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.generation_worker_scope WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'Generation scope must end before commit' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_generation_scope_cleanup AFTER INSERT ON creator.generation_worker_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_generation_scope_cleanup();
RESET ROLE;
DO $$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY[
  'creator.capture_generation_initiator()'::regprocedure,'creator.confirm_generation_initiator(uuid)'::regprocedure,
  'creator.pending_generation_tasks(integer)'::regprocedure,'creator.generation_task_proof(uuid,uuid,boolean)'::regprocedure,
  'creator.claim_generation_task(uuid,uuid)'::regprocedure,'creator.begin_generation_scope(uuid,uuid)'::regprocedure,
  'creator.generation_scope_matches(uuid,uuid)'::regprocedure,'creator.end_generation_scope()'::regprocedure,
  'creator.require_generation_scope_cleanup()'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO creator_generation_authority',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION creator.confirm_generation_initiator(uuid) TO creator_runtime;
GRANT EXECUTE ON FUNCTION creator.pending_generation_tasks(integer),creator.claim_generation_task(uuid,uuid),
 creator.begin_generation_scope(uuid,uuid),creator.generation_scope_matches(uuid,uuid),creator.end_generation_scope() TO creator_generation_worker;
COMMIT;
