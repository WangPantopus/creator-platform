-- Reserved bounded public negative authority. Requires0074/0082/0085. W1/W2 still
-- supply all public-profile, current License/version and worker permissions.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_public_ai_authority' AND
   NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND
   NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL)
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
     WHERE r.rolname='creator_public_ai_authority')
 THEN RAISE EXCEPTION 'Public AI metadata authority must be installed safely by0085'; END IF;
END $$;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.public_creator_denial(c uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; s uuid; owner_account uuid; answer text;
BEGIN
 IF c IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 -- Anonymous means both genuinely absent, not an owner or unbound visitor.
 IF (caller IS NULL)<>(s IS NULL) THEN RETURN 'unavailable'; END IF;
 IF caller IS NOT NULL AND NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c;
 IF NOT FOUND OR owner_account IS NULL THEN RETURN 'unavailable'; END IF;
 IF NOT creator_trust.try_interactive_denial_keys(c,coalesce(caller,owner_account),owner_account)
 THEN RETURN 'unavailable'; END IF;
 IF NOT EXISTS(SELECT FROM creator.creator_profile WHERE id=c AND account_id=owner_account)
 THEN RETURN 'unavailable'; END IF;
 IF creator_trust.denial_projection(c,coalesce(caller,owner_account),owner_account,NULL)
 THEN answer := 'denied'; ELSE answer := 'allowed'; END IF;
 IF caller IS NOT NULL AND NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.public_creator_denial(uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.public_creator_denial(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA creator_trust TO creator_public_ai_authority;
GRANT EXECUTE ON FUNCTION creator_trust.public_creator_denial(uuid) TO creator_runtime,creator_public_ai_authority;
COMMIT;
