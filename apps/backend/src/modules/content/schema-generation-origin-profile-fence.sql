-- Held W5 original-generation profile fence; separate W8 allocation required.
-- Original0102/0186 and0072/0093 SQL/functions stay unchanged. Unregistered.
-- Adds no role, membership, grants, task, Actor or positive publication authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w5_generation_origin'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR (SELECT count(*) FROM pg_proc WHERE proowner=r)<>1
  OR NOT EXISTS(SELECT FROM pg_proc WHERE
   oid=to_regprocedure('creator.generation_content_origins(uuid,uuid,jsonb)')
   AND proowner=r AND prosecdef AND provolatile='v'
   AND proconfig=ARRAY['search_path=pg_catalog'])
  OR to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Actual isolated W5 origin and original W1 scope required';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['creator_profile','generation_worker_scope'])
   AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
   AND pg_get_userbyid(c.relowner)='creator_owner')<>2 THEN
  RAISE EXCEPTION 'Original forced creator and private generation custody required';
 END IF;
 IF EXISTS(SELECT FROM pg_policy WHERE polrelid=to_regclass('creator.creator_profile')
  AND polname='w5_generation_origin_original_creator') THEN
  RAISE EXCEPTION 'Existing origin profile fence requires independent review';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;

-- PUBLIC profile visibility is permissive. Restrict this existing private
-- origin owner to the issuer's original stored creator/account pair. Caller
-- settings alone cannot create its nonce, private task, PID/fullXID or login.
-- The original origin function still bookends with generation_scope_matches;
-- this policy does not re-enter the issuer after the signature-family lease.
CREATE POLICY w5_generation_origin_original_creator ON creator.creator_profile
 AS RESTRICTIVE FOR SELECT TO creator_w5_generation_origin USING(
 session_user='creator_generation_worker'
 AND current_setting('transaction_isolation')='read committed'
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
 AND nullif(current_setting('app.content_id',true),'') IS NULL
 AND EXISTS(SELECT FROM creator.generation_worker_scope s
  WHERE s.id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND s.transaction_id=pg_current_xact_id_if_assigned()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user
   AND s.operation='read' AND s.task IS NOT NULL
   AND s.created_at<=clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '5 seconds'
   AND s.generation_id=(s.task->>'generationId')::uuid
   AND s.worker_token=(s.task->>'workerToken')::uuid
   AND creator_profile.id=(s.task->>'creatorId')::uuid
   AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid)
);
RESET ROLE;
COMMIT;
