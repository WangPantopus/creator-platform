-- Held, unallocated terminal discovery successor. Original0183 is immutable.
-- Returns only an original candidate ID and its observed sentence cursor.
-- A stale observation must fail the original terminal matcher; no cursor,
-- custody token, worker lease, input, body or provider permission is issued.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_generation_terminal_discovery') THEN
  RAISE EXCEPTION 'Pre-existing discovery owner requires independent review'; END IF;
 IF NOT EXISTS(SELECT FROM pg_proc
  WHERE oid=to_regprocedure('creator.pending_generation_terminals(integer)')
   AND pg_get_userbyid(proowner)='creator_generation_terminal_authority'
   AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
  OR NOT EXISTS(SELECT FROM pg_class
   WHERE oid=to_regclass('creator.generation') AND relkind='r'
    AND relrowsecurity AND relforcerowsecurity
    AND pg_get_userbyid(relowner)='creator_owner') THEN
  RAISE EXCEPTION 'Actual original terminal discovery custody required'; END IF;
 CREATE ROLE creator_generation_terminal_discovery NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_generation_terminal_discovery;
GRANT EXECUTE ON FUNCTION creator.pending_generation_terminals(integer)
 TO creator_generation_terminal_discovery;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,last_sequence) ON creator.generation
 TO creator_generation_terminal_discovery;
CREATE POLICY generation_terminal_discovery_metadata ON creator.generation
 FOR SELECT TO creator_generation_terminal_discovery USING(
  session_user='creator_generation_worker'
  AND current_setting('transaction_isolation')='read committed'
  AND nullif(current_setting('app.account_id',true),'') IS NULL
  AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
  AND nullif(current_setting('app.creator_id',true),'') IS NULL
  AND nullif(current_setting('app.fan_id',true),'') IS NULL
  AND nullif(current_setting('generation.scope_nonce',true),'') IS NULL
  AND nullif(current_setting('generation.terminal_nonce',true),'') IS NULL);
RESET ROLE;
CREATE FUNCTION creator.pending_generation_terminal_cursors(n integer)
 RETURNS TABLE(generation_id uuid,last_sequence integer)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_generation_worker'
  OR current_user<>'creator_generation_terminal_discovery'
  OR n IS NULL OR n<1 OR n>64
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR nullif(current_setting('generation.scope_nonce',true),'') IS NOT NULL
  OR nullif(current_setting('generation.terminal_nonce',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Use bounded original terminal metadata discovery'
   USING ERRCODE='42501'; END IF;
 -- One statement observes the original bounded candidate list and cursor.
 -- Original0183 remains the sole selector of expired/unclaimed jobs.
 RETURN QUERY SELECT g.id,g.last_sequence
  FROM creator.pending_generation_terminals(n) WITH ORDINALITY AS candidate(id,position)
  JOIN creator.generation g ON g.id=candidate.id
  ORDER BY candidate.position LIMIT n;
END $$;
ALTER FUNCTION creator.pending_generation_terminal_cursors(integer)
 OWNER TO creator_generation_terminal_discovery;
REVOKE ALL ON FUNCTION creator.pending_generation_terminal_cursors(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.pending_generation_terminal_cursors(integer)
 TO creator_generation_worker;
COMMIT;
