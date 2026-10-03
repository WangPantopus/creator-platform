-- Held0223. Additive only: original0211/0187 source and executables stay immutable.
-- W8 separately reviews registration and the complete current owner catalogue.
-- No role, membership, grant, worker table access or substitute Actor is added.
BEGIN;
RESET ROLE;
DO $$ DECLARE role_name text; signature text; owner_role oid; BEGIN
 FOR role_name,signature IN SELECT * FROM (VALUES
  ('creator_w2_generation_metadata','creator.generation_agent_metadata(uuid,uuid)'),
  ('creator_w2_generation_retrieval','creator.generation_agent_runtime_context(uuid,uuid,text,text)')
 ) original(role_name,signature) LOOP
  SELECT oid INTO owner_role FROM pg_roles WHERE rolname=role_name
   AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
   AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
  IF owner_role IS NULL
   OR EXISTS(SELECT FROM pg_auth_members WHERE member=owner_role OR roleid=owner_role)
   OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=owner_role)
   OR EXISTS(SELECT FROM pg_class WHERE relowner=owner_role)
   OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure(signature)
    AND proowner=owner_role AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
   OR (SELECT count(*) FROM pg_proc WHERE proowner=owner_role)<>1 THEN
   RAISE EXCEPTION 'Actual isolated original metadata and retrieval owners required';
  END IF;
 END LOOP;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['generation_worker_scope','creator_profile'])
    AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND pg_get_userbyid(c.relowner)='creator_owner')<>2 THEN
  RAISE EXCEPTION 'Original current scope and forced creator custody required';
 END IF;
 IF EXISTS(SELECT FROM pg_policy WHERE polrelid=to_regclass('creator.creator_profile')
  AND polname=ANY(ARRAY['w2_generation_metadata_profile_bound','w2_generation_retrieval_profile_bound'])) THEN
  RAISE EXCEPTION 'Existing restrictive profile custody requires independent review';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
-- Existing permissive PUBLIC visibility is ANDed with each original role's
-- exact nonce/XID/PID/login/task/profile predicate, never used as worker authority.
CREATE POLICY w2_generation_metadata_profile_bound ON creator.creator_profile
 AS RESTRICTIVE FOR SELECT TO creator_w2_generation_metadata USING(
 session_user='creator_generation_worker'
 AND current_setting('transaction_isolation')='read committed'
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
 AND EXISTS(SELECT FROM creator.generation_worker_scope s
  WHERE s.id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND s.transaction_id=pg_current_xact_id_if_assigned()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user
   AND s.operation='read' AND s.task IS NOT NULL
   AND s.created_at<=clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '5 seconds'
   AND s.generation_id=(s.task->>'generationId')::uuid
   AND s.worker_token=(s.task->>'workerToken')::uuid
   AND coalesce(creator.generation_scope_matches(s.generation_id,s.worker_token),false)
   AND creator_profile.id=(s.task->>'creatorId')::uuid
   AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid)
);
CREATE POLICY w2_generation_retrieval_profile_bound ON creator.creator_profile
 AS RESTRICTIVE FOR SELECT TO creator_w2_generation_retrieval USING(
 session_user='creator_generation_worker'
 AND current_setting('transaction_isolation')='read committed'
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
 AND EXISTS(SELECT FROM creator.generation_worker_scope s
  WHERE s.id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND s.transaction_id=pg_current_xact_id_if_assigned()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user
   AND s.operation='read' AND s.task IS NOT NULL
   AND s.created_at<=clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '5 seconds'
   AND s.generation_id=(s.task->>'generationId')::uuid
   AND s.worker_token=(s.task->>'workerToken')::uuid
   AND coalesce(creator.generation_scope_matches(s.generation_id,s.worker_token),false)
   AND creator_profile.id=(s.task->>'creatorId')::uuid
   AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid)
);
RESET ROLE;
COMMIT;
