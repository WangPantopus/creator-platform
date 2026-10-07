-- Held lifecycle successor; original0159/0183 source bytes stay immutable.
-- Fresh acceptance and expired execution must never share a dispatch queue.
-- No new role, grant, business row, purpose, provider or settlement authority.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.pending_generation_tasks(integer)')
   AND pg_get_userbyid(proowner)='creator_generation_authority' AND prosecdef
   AND proconfig=ARRAY['search_path=pg_catalog'])
  OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.pending_generation_terminals(integer)')
   AND pg_get_userbyid(proowner)='creator_generation_terminal_authority' AND prosecdef
   AND proconfig=ARRAY['search_path=pg_catalog']) THEN
  RAISE EXCEPTION 'Original generation and terminal discovery are required'; END IF;
END $$;

CREATE OR REPLACE FUNCTION creator.pending_generation_tasks(n integer) RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR n IS NULL OR n<1 OR n>64
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded generation worker discovery' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT id FROM creator.generation
  WHERE state='queued' AND worker_token IS NULL AND lease_until IS NULL AND last_sequence=0
   AND initiating_account_id IS NOT NULL AND initiating_session_id IS NOT NULL
   AND initiating_adult_verified_at IS NOT NULL AND acceptance_transaction IS NOT NULL
  ORDER BY accepted_at,id LIMIT n;
END $$;

CREATE OR REPLACE FUNCTION creator.pending_generation_terminals(n integer) RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR n IS NULL OR n<1 OR n>64
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded terminal discovery' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT id FROM creator.generation WHERE state IN('queued','generating')
  AND initiating_account_id IS NOT NULL AND initiating_session_id IS NOT NULL
  AND initiating_adult_verified_at IS NOT NULL AND acceptance_transaction IS NOT NULL
  AND (state='generating' OR worker_token IS NOT NULL OR lease_until IS NOT NULL OR last_sequence<>0)
  AND (lease_until IS NULL OR lease_until<=clock_timestamp())
  ORDER BY accepted_at,id LIMIT n;
END $$;

-- Original claim and terminal custody both require this complete provenance.
-- Legacy/unconfirmed rows stay untouched; they cannot occupy every bounded
-- discovery slot ahead of genuine accepted work or be silently adopted.

-- Discovery is only an observation. A candidate may have been claimed by a
-- different process before this process reaches it. Fence the actual UPDATE,
-- after original W1 family/job locking, including an expired zero-output run.
SET LOCAL ROLE creator_owner;
CREATE FUNCTION creator.fence_generation_first_claim() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='creator_generation_authority'
  AND (NEW.worker_token IS DISTINCT FROM OLD.worker_token OR NEW.lease_until IS DISTINCT FROM OLD.lease_until)
  AND (OLD.state<>'queued' OR OLD.worker_token IS NOT NULL OR OLD.lease_until IS NOT NULL
   OR OLD.last_sequence<>0 OR NEW.state<>'generating' OR NEW.worker_token IS NULL OR NEW.lease_until IS NULL) THEN
  RAISE EXCEPTION 'Previously claimed generation requires original terminal recovery' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.fence_generation_first_claim() FROM PUBLIC;
CREATE TRIGGER generation_first_claim BEFORE UPDATE ON creator.generation
 FOR EACH ROW EXECUTE FUNCTION creator.fence_generation_first_claim();
RESET ROLE;
COMMIT;
