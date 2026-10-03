-- Reserved proposal. Requires exact0072/0074/0082; no active runner entry.
-- W1 creates the private nonce BEFORE invoking this negative on claim/read.
-- No request Actor, ThreadScope, positive grant or initiating provenance is made.
BEGIN;
DO $$ DECLARE role_name text; expected_login boolean; BEGIN
 FOR role_name,expected_login IN VALUES
  ('creator_generation_worker',true),('creator_generation_authority',false),('creator_trust_denial',false) LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND rolcanlogin=expected_login
   AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
   AND NOT rolbypassrls AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0))
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid) WHERE r.rolname=role_name)
  THEN RAISE EXCEPTION 'Unsafe generation denial purpose role'; END IF;
 END LOOP;
 IF to_regprocedure('creator.claim_generation_task(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.begin_generation_scope(uuid,uuid)') IS NULL
  OR to_regprocedure('creator_trust.try_interactive_denial_keys(uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'Exact generation purpose dependencies are unavailable'; END IF;
END $$;
SET LOCAL ROLE creator_owner;
-- Private metadata only. Neither raw scope.task nor message/context text is read.
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,created_at)
 ON creator.generation_worker_scope TO creator_trust_denial;
CREATE POLICY generation_denial_scope ON creator.generation_worker_scope FOR SELECT TO creator_trust_denial USING(true);
GRANT SELECT(id,thread_id,creator_id,fan_id,state,last_sequence,worker_token,lease_until,
 initiating_account_id,initiating_session_id,initiating_adult_verified_at,acceptance_transaction)
 ON creator.generation TO creator_trust_denial;
CREATE POLICY generation_denial_metadata ON creator.generation FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.generation_worker_denial(g uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE nonce uuid; token uuid; phase text; issued timestamptz;
 c uuid; f uuid; t uuid; fan_account uuid; owner_account uuid; initiating_account uuid;
 initiating_session uuid; adult_at timestamptz; accepted_xid xid8; answer text;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
 THEN RETURN 'unavailable'; END IF;
 nonce:=nullif(current_setting('generation.scope_nonce',true),'')::uuid;
 IF nonce IS NULL THEN RETURN 'unavailable'; END IF;
 SELECT s.worker_token,s.operation,s.created_at INTO token,phase,issued
 FROM creator.generation_worker_scope s WHERE s.id=nonce AND s.generation_id=g
  AND s.transaction_id=pg_current_xact_id() AND s.backend_pid=pg_backend_pid()
  AND s.login_name=session_user AND s.created_at<=clock_timestamp()
  AND s.created_at>clock_timestamp()-interval '5 seconds';
 IF NOT FOUND OR token IS NULL OR phase NOT IN('claim','read') THEN RETURN 'unavailable'; END IF;
 SELECT x.creator_id,x.fan_id,x.thread_id,p.account_id,fp.account_id,
  x.initiating_account_id,x.initiating_session_id,x.initiating_adult_verified_at,x.acceptance_transaction
 INTO c,f,t,owner_account,fan_account,initiating_account,initiating_session,adult_at,accepted_xid
 FROM creator.generation x JOIN creator.thread r ON r.id=x.thread_id AND r.creator_id=x.creator_id AND r.fan_id=x.fan_id
  JOIN creator.creator_profile p ON p.id=x.creator_id JOIN creator.fan_profile fp ON fp.id=x.fan_id
 WHERE x.id=g AND ((phase='claim' AND x.state IN('queued','generating') AND x.last_sequence=0
   AND (x.lease_until IS NULL OR x.lease_until<=clock_timestamp())) OR
  (phase='read' AND x.state='generating' AND x.worker_token=token AND x.lease_until>clock_timestamp()));
 IF NOT FOUND OR owner_account IS NULL OR fan_account IS NULL
  OR initiating_account IS DISTINCT FROM fan_account OR initiating_session IS NULL
  OR adult_at IS NULL OR accepted_xid IS NULL
  OR NOT EXISTS(SELECT FROM creator.identity_session WHERE id=initiating_session
   AND account_id=initiating_account AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 -- Try every exact negative key before entering immutable0053. Its blocking
 -- acquisition is then reentrant; a contended denial writer never waits here.
 IF NOT creator_trust.try_interactive_denial_keys(c,fan_account,owner_account) THEN RETURN 'unavailable'; END IF;
 IF NOT EXISTS(SELECT FROM creator.generation x
  JOIN creator.thread r ON r.id=x.thread_id AND r.creator_id=x.creator_id AND r.fan_id=x.fan_id
  JOIN creator.creator_profile p ON p.id=x.creator_id JOIN creator.fan_profile fp ON fp.id=x.fan_id
  WHERE x.id=g AND x.creator_id=c AND x.fan_id=f AND x.thread_id=t
   AND p.account_id=owner_account AND fp.account_id=fan_account
   AND x.initiating_account_id=initiating_account AND x.initiating_session_id=initiating_session
   AND x.initiating_adult_verified_at=adult_at AND x.acceptance_transaction=accepted_xid
   AND ((phase='claim' AND x.state IN('queued','generating') AND x.last_sequence=0
    AND (x.lease_until IS NULL OR x.lease_until<=clock_timestamp())) OR
    (phase='read' AND x.state='generating' AND x.worker_token=token AND x.lease_until>clock_timestamp())))
 THEN RETURN 'unavailable'; END IF;
 IF creator_trust.denial_projection(c,fan_account,owner_account,t)
 THEN answer:='denied'; ELSE answer:='allowed'; END IF;
 -- Negative freshness remains mandatory after the last read. Positive job,
 -- session/family/consent/currentness and consumer authority stay with W1.
 IF issued<=clock_timestamp()-interval '5 seconds'
  OR NOT EXISTS(SELECT FROM creator.generation_worker_scope s WHERE s.id=nonce AND s.generation_id=g
   AND s.worker_token=token AND s.operation=phase AND s.transaction_id=pg_current_xact_id()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user)
  OR NOT EXISTS(SELECT FROM creator.identity_session WHERE id=initiating_session
   AND account_id=initiating_account AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.generation_worker_denial(uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.generation_worker_denial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.generation_worker_denial(uuid)
 TO creator_generation_authority;
COMMIT;
