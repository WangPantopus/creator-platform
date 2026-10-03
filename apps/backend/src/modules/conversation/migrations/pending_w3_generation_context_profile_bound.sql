-- Held additive source; W8 allocates and reviews activation separately.
-- Original0179/0095 SQL and its fixed context executable remain immutable.
-- No grants, worker membership, raw SELECT or replacement Actor are added.
BEGIN;
RESET ROLE;
DO $$ DECLARE owner_role oid; BEGIN
 SELECT oid INTO owner_role FROM pg_roles
  WHERE rolname='creator_generation_conversation_context'
   AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
   AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF owner_role IS NULL
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=owner_role OR roleid=owner_role)
  OR NOT EXISTS(SELECT FROM pg_proc
   WHERE oid=to_regprocedure('creator.generation_conversation_context(uuid,uuid)')
    AND proowner=owner_role AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
  OR to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='creator'
    AND c.relname=ANY(ARRAY['generation_worker_scope','thread','memory_exclusion','fan_profile'])
    AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND pg_get_userbyid(c.relowner)='creator_owner')<>4 THEN
  RAISE EXCEPTION 'Actual original W1/W3 context and forced family relations required';
 END IF;
 IF EXISTS(SELECT FROM pg_policy
  WHERE polrelid=to_regclass('creator.fan_profile')
   AND polname='w3_generation_context_profile_bound') THEN
  RAISE EXCEPTION 'Existing restrictive profile custody requires independent review';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
-- A permissive PUBLIC profile policy cannot OR around this role's genuine
-- original nonce/family. Only the actually shared, retained original intro is
-- readable; off-the-record and excluded retained context remain unavailable.
CREATE POLICY w3_generation_context_profile_bound ON creator.fan_profile
 AS RESTRICTIVE FOR SELECT TO creator_generation_conversation_context USING(
 session_user='creator_generation_worker'
 AND current_setting('transaction_isolation')='read committed'
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
 AND EXISTS(SELECT FROM creator.generation_worker_scope s
  JOIN creator.thread t ON t.id=(s.task->>'threadId')::uuid
   AND t.creator_id=(s.task->>'creatorId')::uuid
   AND t.fan_id=(s.task->>'fanId')::uuid
  WHERE s.id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
   AND s.transaction_id=pg_current_xact_id_if_assigned()
   AND s.backend_pid=pg_backend_pid() AND s.login_name=session_user
   AND s.operation='read' AND s.task IS NOT NULL
   AND s.created_at<=clock_timestamp()
   AND s.created_at>clock_timestamp()-interval '5 seconds'
   AND s.generation_id=(s.task->>'generationId')::uuid
   AND s.worker_token=(s.task->>'workerToken')::uuid
   AND coalesce(creator.generation_scope_matches(s.generation_id,s.worker_token),false)
   AND fan_profile.id=t.fan_id
   AND fan_profile.account_id=(s.task->>'initiatingAccountId')::uuid
   AND t.deleted_at IS NULL AND t.intro_shared AND NOT t.off_the_record
   AND t.control_epoch=(s.task->>'epoch')::integer
   AND t.revision=(s.task->>'contextRevision')::integer+(s.task->>'lastSequence')::integer
   AND NOT EXISTS(SELECT FROM creator.memory_exclusion e
    WHERE e.thread_id=t.id AND e.creator_id=t.creator_id AND e.fan_id=t.fan_id))
);
COMMIT;
