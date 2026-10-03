-- Proposed W4 original-generation profile fence. Held, unregistered source.
-- Original0182 bytes and its fixed function remain unchanged. W8 owns the
-- allocation, exact source registration and activation. No role is created.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w4_generation_audience'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR NOT EXISTS(SELECT FROM pg_proc WHERE
   oid=to_regprocedure('creator.generation_allowance_audience(uuid,uuid)')
   AND proowner=r AND prosecdef AND provolatile='v'
   AND proconfig=ARRAY['search_path=pg_catalog'])
  OR to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Actual isolated W4 audience and original W1 scope required';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;

-- Existing PUBLIC profile policies are permissive. AND the actual original
-- family for this one private purpose, even when public metadata is visible.
-- The forced scope-table policy retains original nonce/PID/fullXID/login,
-- operation/task and five-second custody; no caller settings issue a scope.
CREATE POLICY w4_generation_audience_original_creator
 ON creator.creator_profile AS RESTRICTIVE FOR SELECT
 TO creator_w4_generation_audience USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s
  WHERE creator_profile.id=(s.task->>'creatorId')::uuid
   AND creator_profile.account_id=(s.task->>'creatorAccountId')::uuid)
);
CREATE POLICY w4_generation_audience_original_fan
 ON creator.fan_profile AS RESTRICTIVE FOR SELECT
 TO creator_w4_generation_audience USING(
 EXISTS(SELECT FROM creator.generation_worker_scope s
  WHERE fan_profile.id=(s.task->>'fanId')::uuid
   AND fan_profile.account_id=(s.task->>'initiatingAccountId')::uuid)
);
RESET ROLE;
COMMIT;
