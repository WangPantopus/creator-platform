-- Reserved additive proposal:0053 remains immutable. Requires0074 session
-- metadata. These are negative gates, never participant/content permission.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_trust_denial' AND
   NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND
   NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication)
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
     WHERE r.rolname='creator_trust_denial')
 THEN RAISE EXCEPTION 'Unsafe private denial metadata role'; END IF;
END $$;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.try_interactive_denial_keys(c uuid,caller uuid,owner_account uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;
BEGIN
 IF c IS NULL OR caller IS NULL OR owner_account IS NULL THEN RETURN false; END IF;
 -- A request/page can already hold an earlier family's keys. Never wait for
 -- another negative writer while retaining those keys or positive row locks.
 FOR k IN SELECT DISTINCT key FROM unnest(ARRAY[
   'w8-denial:account:'||caller::text,'w8-denial:account:'||owner_account::text,
   'w8-denial:creator:'||c::text]) key ORDER BY key LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;

CREATE FUNCTION creator_trust.interactive_denial(kind text,c uuid,subject uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; s uuid; fan_account uuid; owner_account uuid; answer text;
BEGIN
 IF kind IS NULL OR kind NOT IN('thread','audience','creator','content') OR c IS NULL OR
   current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF caller IS NULL OR s IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 IF kind='thread' THEN
  SELECT f.account_id,p.account_id INTO fan_account,owner_account
    FROM creator.thread r JOIN creator.fan_profile f ON f.id=r.fan_id
    JOIN creator.creator_profile p ON p.id=r.creator_id
    WHERE r.id=subject AND r.creator_id=c AND caller IN(f.account_id,p.account_id);
 ELSIF kind='audience' THEN
  SELECT f.account_id,p.account_id INTO fan_account,owner_account
    FROM creator.fan_profile f CROSS JOIN creator.creator_profile p
    WHERE f.id=subject AND p.id=c AND f.account_id=caller;
 ELSIF kind='creator' THEN
  SELECT p.account_id,p.account_id INTO fan_account,owner_account
    FROM creator.creator_profile p WHERE p.id=c AND p.account_id=caller;
 ELSE
  SELECT caller,p.account_id INTO fan_account,owner_account FROM creator.creator_profile p WHERE p.id=c AND (
    p.account_id=caller OR EXISTS(SELECT FROM creator.team_membership tm WHERE tm.creator_id=c AND tm.account_id=caller
      AND tm.revoked_at IS NULL AND cardinality(tm.roles)>0) OR
    EXISTS(SELECT FROM creator.fan_profile f WHERE f.account_id=caller));
 END IF;
 IF NOT FOUND OR fan_account IS NULL OR owner_account IS NULL THEN RETURN 'unavailable'; END IF;
 -- Thread creator callers also need the actual fan's key, not caller=owner.
 IF NOT creator_trust.try_interactive_denial_keys(c,fan_account,owner_account) THEN RETURN 'unavailable'; END IF;
 -- Re-read the exact family before entering0053. Otherwise a changed fan or
 -- owner could cause0053 to wait on an additional, unprepared negative key.
 IF kind='thread' AND NOT EXISTS(SELECT FROM creator.thread r JOIN creator.fan_profile f ON f.id=r.fan_id
   JOIN creator.creator_profile p ON p.id=r.creator_id WHERE r.id=subject AND r.creator_id=c
   AND f.account_id=fan_account AND p.account_id=owner_account AND caller IN(f.account_id,p.account_id))
 THEN RETURN 'unavailable'; END IF;
 IF kind='audience' AND NOT EXISTS(SELECT FROM creator.fan_profile f CROSS JOIN creator.creator_profile p
   WHERE f.id=subject AND p.id=c AND f.account_id=caller AND f.account_id=fan_account AND p.account_id=owner_account)
 THEN RETURN 'unavailable'; END IF;
 IF kind IN('creator','content') AND NOT EXISTS(SELECT FROM creator.creator_profile p
   WHERE p.id=c AND p.account_id=owner_account) THEN RETURN 'unavailable'; END IF;
 -- All exact0053 pair keys are already held. Use the pinned original negative
 -- predicates directly with that pair, so no later metadata lookup can choose
 -- a new key. Positive participant/Team/currentness checks remain the caller's.
 IF creator_trust.denial_projection(c,fan_account,owner_account,
   CASE WHEN kind='thread' THEN subject ELSE NULL END) THEN answer := 'denied'; ELSE answer := 'allowed'; END IF;
 IF NOT EXISTS(SELECT FROM creator.identity_session WHERE id=s AND account_id=caller
   AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.try_interactive_denial_keys(uuid,uuid,uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.interactive_denial(text,uuid,uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.try_interactive_denial_keys(uuid,uuid,uuid),
 creator_trust.interactive_denial(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.interactive_denial(text,uuid,uuid) TO creator_runtime;
COMMIT;
