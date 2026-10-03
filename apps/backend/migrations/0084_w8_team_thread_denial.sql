-- Reserved additive negative projection. Requires0074/0082; no Team issuer.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.team_thread_denial(c uuid,t uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; s uuid; fan_account uuid; owner_account uuid; k text;
BEGIN
 IF c IS NULL OR t IS NULL OR current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF caller IS NULL OR s IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN 'unavailable'; END IF;
 SELECT f.account_id,p.account_id INTO fan_account,owner_account FROM creator.thread r
   JOIN creator.fan_profile f ON f.id=r.fan_id JOIN creator.creator_profile p ON p.id=r.creator_id
   WHERE r.id=t AND r.creator_id=c AND EXISTS(SELECT FROM creator.team_membership tm
     WHERE tm.creator_id=c AND tm.account_id=caller AND tm.revoked_at IS NULL AND 'triage'=ANY(tm.roles));
 IF NOT FOUND OR fan_account IS NULL OR owner_account IS NULL THEN RETURN 'unavailable'; END IF;
 -- All three actual accounts participate in negative authority. Team remains
 -- the caller throughout: no owner GUC, Actor or participant ThreadScope.
 FOR k IN SELECT DISTINCT key FROM unnest(ARRAY[
   'w8-denial:account:'||caller::text,'w8-denial:account:'||fan_account::text,
   'w8-denial:account:'||owner_account::text,'w8-denial:creator:'||c::text]) key ORDER BY key LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN RETURN 'unavailable'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM creator.thread r JOIN creator.fan_profile f ON f.id=r.fan_id
   JOIN creator.creator_profile p ON p.id=r.creator_id WHERE r.id=t AND r.creator_id=c
     AND f.account_id=fan_account AND p.account_id=owner_account)
   OR NOT EXISTS(SELECT FROM creator.team_membership tm WHERE tm.creator_id=c AND tm.account_id=caller
     AND tm.revoked_at IS NULL AND 'triage'=ANY(tm.roles))
   OR NOT EXISTS(SELECT FROM creator.identity_session WHERE id=s AND account_id=caller
     AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 IF creator_trust.denial_projection(c,fan_account,owner_account,t)
   OR creator_trust.denial_projection(c,caller,owner_account,NULL) THEN RETURN 'denied'; END IF;
 -- W1/W4 must subsequently lease and revalidate the actual Team/participant
 -- rows and exact Approval. This is a negative check only, not that permission.
 RETURN 'allowed';
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.team_thread_denial(uuid,uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.team_thread_denial(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.team_thread_denial(uuid,uuid) TO creator_runtime;
COMMIT;
