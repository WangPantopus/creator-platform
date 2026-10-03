-- Reserved W8 proposal. Additive to 0053; no object access or worker issuer.
BEGIN;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_trust_denial;
GRANT SELECT(creator_id,account_id,roles,revoked_at) ON creator.team_membership TO creator_trust_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY content_denial_metadata ON creator.identity_session FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY content_denial_metadata ON creator.team_membership FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.runtime_content_denial(c uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; session_id uuid; owner_account uuid;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 session_id := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF c IS NULL OR caller IS NULL OR session_id IS NULL OR NOT EXISTS(
   SELECT FROM creator.identity_session WHERE id=session_id AND account_id=caller
     AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 SELECT cp.account_id INTO owner_account FROM creator.creator_profile cp WHERE cp.id=c AND (
   cp.account_id=caller OR EXISTS(SELECT FROM creator.team_membership tm WHERE tm.creator_id=c AND tm.account_id=caller
     AND tm.revoked_at IS NULL AND cardinality(tm.roles)>0) OR EXISTS(SELECT FROM creator.fan_profile f WHERE f.account_id=caller));
 IF NOT FOUND THEN RETURN 'unavailable'; END IF;
 -- A real fan account does not confer audience eligibility or a Follow. Those
 -- remain W1/W5/W7 checks. This answers only current account/creator negatives.
 IF creator_trust.denial_projection(c,caller,owner_account,NULL) THEN RETURN 'denied'; END IF;
 IF NOT EXISTS(SELECT FROM creator.identity_session WHERE id=session_id AND account_id=caller
   AND revoked_at IS NULL AND expires_at>clock_timestamp()) OR
   NOT EXISTS(SELECT FROM creator.creator_profile WHERE id=c AND account_id=owner_account) THEN RETURN 'unavailable'; END IF;
 RETURN 'allowed';
EXCEPTION WHEN invalid_text_representation THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.runtime_content_denial(uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.runtime_content_denial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.runtime_content_denial(uuid) TO creator_runtime;
COMMIT;
