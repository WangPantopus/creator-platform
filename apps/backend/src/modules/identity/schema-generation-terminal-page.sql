-- Held successor for bounded recovery traversal. Original0183/0218 stay intact.
-- UUID keyset metadata cannot claim work, read text, change a lease, supply an
-- acceptance/financial receipt or relax the original terminal matcher.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.pending_generation_terminals(integer)')
   AND pg_get_userbyid(proowner)='creator_generation_terminal_authority' AND prosecdef
   AND proconfig=ARRAY['search_path=pg_catalog'])
  OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.pending_generation_terminal_cursors(integer)')
   AND pg_get_userbyid(proowner)='creator_generation_terminal_discovery' AND prosecdef
   AND proconfig=ARRAY['search_path=pg_catalog']) THEN
  RAISE EXCEPTION 'Original terminal discovery and cursor custody are required'; END IF;
END $$;

SET LOCAL ROLE creator_owner;
CREATE INDEX generation_terminal_pending_page ON creator.generation(id)
 WHERE state IN('queued','generating');
RESET ROLE;

CREATE FUNCTION creator.pending_generation_terminal_page(n integer,after_id uuid) RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR current_user<>'creator_generation_terminal_authority'
  OR n IS NULL OR n<1 OR n>64 OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
  OR nullif(current_setting('generation.terminal_nonce',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded original terminal discovery pages' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT g.id FROM creator.generation g
  WHERE g.state IN('queued','generating')
   AND g.initiating_account_id IS NOT NULL AND g.initiating_session_id IS NOT NULL
   AND g.initiating_adult_verified_at IS NOT NULL AND g.acceptance_transaction IS NOT NULL
   AND (g.state='generating' OR g.worker_token IS NOT NULL OR g.lease_until IS NOT NULL OR g.last_sequence<>0)
   AND (g.lease_until IS NULL OR g.lease_until<=clock_timestamp())
   AND (after_id IS NULL OR g.id>after_id)
  ORDER BY g.id LIMIT n;
END $$;
ALTER FUNCTION creator.pending_generation_terminal_page(integer,uuid) OWNER TO creator_generation_terminal_authority;
REVOKE ALL ON FUNCTION creator.pending_generation_terminal_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.pending_generation_terminal_page(integer,uuid) TO creator_generation_terminal_discovery;

CREATE FUNCTION creator.pending_generation_terminal_cursor_page(n integer,after_id uuid)
RETURNS TABLE(generation_id uuid,last_sequence integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker' OR current_user<>'creator_generation_terminal_discovery'
  OR n IS NULL OR n<1 OR n>64 OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
  OR nullif(current_setting('generation.terminal_nonce',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded original terminal cursor pages' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT g.id,g.last_sequence
  FROM creator.pending_generation_terminal_page(n,after_id) WITH ORDINALITY AS candidate(id,position)
  JOIN creator.generation g ON g.id=candidate.id
  ORDER BY candidate.position LIMIT n;
END $$;
ALTER FUNCTION creator.pending_generation_terminal_cursor_page(integer,uuid) OWNER TO creator_generation_terminal_discovery;
REVOKE ALL ON FUNCTION creator.pending_generation_terminal_cursor_page(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.pending_generation_terminal_cursor_page(integer,uuid) TO creator_generation_worker;
COMMIT;
