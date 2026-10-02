-- Reserved, unapplied. Exact0099 terminal scope plus0074/0082 metadata custody.
-- A negative answer never supplies source, provider, money or retention rights.
BEGIN;
DO $$ DECLARE role_name text; expected_login boolean; BEGIN
 FOR role_name,expected_login IN VALUES
  ('creator_generation_worker',true),('creator_generation_terminal_authority',false),('creator_trust_denial',false) LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND rolcanlogin=expected_login
   AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
   AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0))
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid) WHERE r.rolname=role_name)
  THEN RAISE EXCEPTION 'Unsafe terminal denial purpose role'; END IF;
 END LOOP;
 IF to_regprocedure('creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean)') IS NULL
  OR to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)') IS NULL
  OR to_regprocedure('creator_trust.try_interactive_denial_keys(uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'Exact terminal purpose dependencies are unavailable'; END IF;
END $$;
SET LOCAL ROLE creator_owner;
-- Transient original-custody metadata is readable only by the negative definer.
-- No LOGIN receives task JSON, message text or accounting data.
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,custody_token,mode,
 task,transitioned,finalized,created_at) ON creator.generation_terminal_scope TO creator_trust_denial;
CREATE POLICY terminal_denial_scope ON creator.generation_terminal_scope
 FOR SELECT TO creator_trust_denial USING(true);
GRANT SELECT(id,thread_id,creator_id,fan_id,fan_message_id,ai_message_id,grant_id,reservation_id,
 epoch,last_sequence,state,context_revision,worker_token,lease_until,completed_at,
 initiating_account_id,initiating_session_id,initiating_adult_verified_at,acceptance_transaction)
 ON creator.generation TO creator_trust_denial;
--0093 already grants the same fixed-role generation metadata policy.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='creator.generation'::regclass
  AND polname='generation_denial_metadata') THEN
  CREATE POLICY generation_denial_metadata ON creator.generation
   FOR SELECT TO creator_trust_denial USING(true);
 END IF;
END $$;
GRANT SELECT(control,control_epoch,revision,processor_consent_version,deleted_at)
 ON creator.thread TO creator_trust_denial;
GRANT SELECT(verification,recovery_required) ON creator.creator_profile TO creator_trust_denial;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,delivery_state)
 ON creator.message TO creator_trust_denial;
CREATE POLICY terminal_denial_message ON creator.message FOR SELECT TO creator_trust_denial USING(true);
GRANT SELECT(id,thread_id,creator_id,fan_id,account_id,version,withdrawn_at)
 ON creator.processor_consent TO creator_trust_denial;
CREATE POLICY terminal_denial_consent ON creator.processor_consent FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.generation_terminal_denial(g uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE nonce uuid; scope record;
 snapshot jsonb; c uuid; fan_account uuid; owner_account uuid; t uuid;
 negative boolean; session_live boolean; positive_live boolean; answer text;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL
  OR current_user<>'creator_trust_denial'
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
 THEN RETURN 'unavailable'; END IF;
 IF (SELECT count(*) FROM pg_roles r WHERE r.rolname IN('creator_generation_worker',
   'creator_generation_terminal_authority','creator_trust_denial')
  AND r.rolcanlogin=(r.rolname='creator_generation_worker') AND NOT r.rolsuper
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
  AND NOT r.rolbypassrls AND NOT r.rolreplication
  AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid))<>3
  OR EXISTS(SELECT FROM pg_proc p,
   LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='creator_trust.generation_terminal_denial(uuid)'::regprocedure
    AND (a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='creator_generation_terminal_authority'))
     OR (a.grantee<>p.proowner AND a.is_grantable)))
 THEN RETURN 'unavailable'; END IF;
 nonce:=nullif(current_setting('generation.terminal_nonce',true),'')::uuid;
 IF nonce IS NULL OR EXISTS(SELECT FROM pg_database WHERE datname=current_database()
  AND (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
 THEN RETURN 'unavailable'; END IF;
 SELECT * INTO scope FROM creator.generation_terminal_scope
 WHERE id=nonce AND generation_id=g AND transaction_id=pg_current_xact_id()
  AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND created_at<=clock_timestamp() AND created_at>clock_timestamp()-interval '5 seconds';
 IF NOT FOUND OR scope.custody_token IS NULL OR jsonb_typeof(scope.task) IS DISTINCT FROM 'object'
  OR scope.mode NOT IN('completion','reconciliation')
  OR scope.task->>'sourceState' NOT IN('queued','generating')
  OR scope.task->>'targetState' NOT IN('delivered','interrupted','failed')
  OR scope.task->>'originalMessageState' NOT IN('accepted','generating')
  OR (scope.mode='reconciliation' AND scope.task->>'targetState'='delivered')
  OR (scope.task->>'targetState'='failed' AND (scope.task->>'lastSequence')::integer<>0)
  OR (scope.task->>'targetState' IN('delivered','interrupted') AND (scope.task->>'lastSequence')::integer<=0)
  OR (scope.finalized AND NOT scope.transitioned)
 THEN RETURN 'unavailable'; END IF;
 c:=(scope.task->>'creatorId')::uuid;
 t:=(scope.task->>'threadId')::uuid;
 fan_account:=(scope.task->>'initiatingAccountId')::uuid;
 owner_account:=(scope.task->>'creatorAccountId')::uuid;
 IF c IS NULL OR t IS NULL OR fan_account IS NULL OR owner_account IS NULL
  OR (scope.task->>'initiatingSessionId') IS NULL OR (scope.task->>'adultVerifiedAt') IS NULL
  OR (scope.task->>'acceptanceTransaction') IS NULL THEN RETURN 'unavailable'; END IF;
 -- No family/financial lock precedes these sorted nonblocking negative keys.
 IF NOT creator_trust.try_interactive_denial_keys(c,fan_account,owner_account)
 THEN RETURN 'unavailable'; END IF;
 -- Exact original snapshot, including genuine participant/session/XID/cursor,
 -- is re-read before0053 can acquire its now-reentrant negative locks.
 SELECT jsonb_build_object('generationId',x.id,'threadId',x.thread_id,'creatorId',x.creator_id,'fanId',x.fan_id,
  'initiatingAccountId',x.initiating_account_id,'initiatingSessionId',x.initiating_session_id,
  'acceptanceTransaction',x.acceptance_transaction::text,'adultVerifiedAt',x.initiating_adult_verified_at,
  'creatorAccountId',cp.account_id,'fanMessageId',x.fan_message_id,'aiMessageId',x.ai_message_id,
  'grantId',x.grant_id,'reservationId',x.reservation_id,'epoch',x.epoch,'contextRevision',x.context_revision,
  'lastSequence',x.last_sequence,
  'originalWorkerToken',CASE WHEN scope.finalized THEN scope.task->'originalWorkerToken' ELSE to_jsonb(x.worker_token) END,
  'originalLeaseUntil',CASE WHEN scope.finalized THEN scope.task->'originalLeaseUntil' ELSE to_jsonb(x.lease_until) END,
  'sourceState',scope.task->>'sourceState','targetState',scope.task->>'targetState',
  'threadRevision',r.revision,'processorConsentVersion',r.processor_consent_version,
  'originalMessageState',CASE WHEN scope.finalized THEN scope.task->>'originalMessageState' ELSE ai.delivery_state END)
 INTO snapshot FROM creator.generation x JOIN creator.thread r ON r.id=x.thread_id
 JOIN creator.creator_profile cp ON cp.id=x.creator_id JOIN creator.fan_profile f ON f.id=x.fan_id
 JOIN creator.message fm ON fm.id=x.fan_message_id AND fm.thread_id=x.thread_id
 JOIN creator.message ai ON ai.id=x.ai_message_id AND ai.thread_id=x.thread_id
 WHERE x.id=g AND x.creator_id=c AND x.thread_id=t
  AND cp.account_id=owner_account AND f.account_id=fan_account
  AND x.initiating_account_id=fan_account AND x.initiating_session_id IS NOT NULL
  AND x.initiating_adult_verified_at IS NOT NULL AND x.acceptance_transaction IS NOT NULL
  AND r.creator_id=x.creator_id AND r.fan_id=x.fan_id
  AND fm.creator_id=x.creator_id AND fm.fan_id=x.fan_id AND fm.author_kind='fan'
  AND fm.author_account_id=fan_account AND fm.delivery_state='accepted'
  AND ai.creator_id=x.creator_id AND ai.fan_id=x.fan_id AND ai.author_kind='ai'
  AND x.state=CASE WHEN scope.transitioned THEN scope.task->>'targetState' ELSE scope.task->>'sourceState' END
  AND (CASE WHEN scope.finalized THEN x.completed_at IS NOT NULL AND x.worker_token IS NULL
    AND x.lease_until IS NULL AND ai.delivery_state=scope.task->>'targetState'
   ELSE x.completed_at IS NULL AND ai.delivery_state=scope.task->>'originalMessageState' END);
 IF snapshot IS NULL OR snapshot IS DISTINCT FROM scope.task THEN RETURN 'unavailable'; END IF;
 negative:=creator_trust.denial_projection(c,fan_account,owner_account,t);
 SELECT EXISTS(SELECT FROM creator.identity_session WHERE id=(scope.task->>'initiatingSessionId')::uuid
  AND account_id=fan_account AND revoked_at IS NULL AND expires_at>clock_timestamp()) INTO session_live;
 SELECT EXISTS(SELECT FROM creator.thread r JOIN creator.creator_profile cp ON cp.id=r.creator_id
  WHERE r.id=t AND r.creator_id=c AND r.fan_id=(scope.task->>'fanId')::uuid
  AND r.control='ai_active' AND r.control_epoch=(scope.task->>'epoch')::integer
  AND r.deleted_at IS NULL AND r.revision=(scope.task->>'contextRevision')::integer+(scope.task->>'lastSequence')::integer
  AND cp.account_id=owner_account AND cp.verification='verified' AND NOT cp.recovery_required
  AND EXISTS(SELECT FROM creator.processor_consent pc WHERE pc.thread_id=t AND pc.creator_id=c
   AND pc.fan_id=r.fan_id AND pc.account_id=fan_account AND pc.version=scope.task->>'processorConsentVersion'
   AND pc.withdrawn_at IS NULL)) INTO positive_live;
 positive_live:=positive_live AND session_live AND NOT negative
  AND (scope.task->>'originalWorkerToken') IS NOT NULL
  AND coalesce((scope.task->>'originalLeaseUntil')::timestamptz>clock_timestamp(),false);
 IF positive_live THEN answer:='allowed';
 ELSIF scope.mode='reconciliation' THEN
  -- Only the original failed/interrupted cursor may be cleaned up. All W2/W4
  -- journal/cost/retention/settlement and W1 restoration gates remain required.
  answer:='reconciliation_allowed';
 ELSE answer:='denied'; END IF;
 IF scope.created_at<=clock_timestamp()-interval '5 seconds'
  OR NOT EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE s.id=nonce
   AND s.generation_id=g AND s.custody_token=scope.custody_token AND s.task=scope.task
   AND s.mode=scope.mode AND s.transitioned=scope.transitioned AND s.finalized=scope.finalized
   AND s.transaction_id=pg_current_xact_id() AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user)
  OR EXISTS(SELECT FROM pg_database WHERE datname=current_database()
   AND (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
 THEN RETURN 'unavailable'; END IF;
 IF answer='allowed' AND (NOT EXISTS(SELECT FROM creator.identity_session
  WHERE id=(scope.task->>'initiatingSessionId')::uuid AND account_id=fan_account
   AND revoked_at IS NULL AND expires_at>clock_timestamp())
  OR (scope.task->>'originalLeaseUntil')::timestamptz<=clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow
 THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.generation_terminal_denial(uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.generation_terminal_denial(uuid) FROM PUBLIC,creator_generation_worker;
GRANT EXECUTE ON FUNCTION creator_trust.generation_terminal_denial(uuid)
 TO creator_generation_terminal_authority;
COMMIT;
