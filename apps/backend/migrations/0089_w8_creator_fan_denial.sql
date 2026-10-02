-- Reserved exact creator/fan negative projection. Requires0074/0082. No packet,
-- ThreadScope, paid tenure or Team permission is constructed or conferred.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.creator_fan_denial(c uuid,f uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; s uuid; owner_account uuid; fan_account uuid; tid uuid; answer text;
BEGIN
 IF c IS NULL OR f IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF caller IS NULL OR s IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 SELECT p.account_id,fp.account_id INTO owner_account,fan_account
   FROM creator.creator_profile p CROSS JOIN creator.fan_profile fp WHERE p.id=c AND fp.id=f;
 IF NOT FOUND OR owner_account IS NULL OR fan_account IS NULL OR caller NOT IN(owner_account,fan_account)
 THEN RETURN 'unavailable'; END IF;
 IF NOT creator_trust.try_interactive_denial_keys(c,fan_account,owner_account) THEN RETURN 'unavailable'; END IF;
 IF NOT EXISTS(SELECT FROM creator.creator_profile p CROSS JOIN creator.fan_profile fp
   WHERE p.id=c AND fp.id=f AND p.account_id=owner_account AND fp.account_id=fan_account)
 THEN RETURN 'unavailable'; END IF;
 -- An existing thread contributes its negatives. Absence supplies no positive
 -- relationship; the owner still leases exact content/tenure/currentness.
 SELECT id INTO tid FROM creator.thread WHERE creator_id=c AND fan_id=f;
 IF creator_trust.denial_projection(c,fan_account,owner_account,tid)
 THEN answer := 'denied'; ELSE answer := 'allowed'; END IF;
 IF NOT EXISTS(SELECT FROM creator.identity_session WHERE id=s AND account_id=caller
   AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.creator_fan_denial(uuid,uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.creator_fan_denial(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.creator_fan_denial(uuid,uuid) TO creator_runtime;
COMMIT;
