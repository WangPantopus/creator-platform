-- Held development-only lifecycle; no historical consent or event is inferred.
-- Requires original0056/0057. This is not production/provider/legal approval.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0056_w3_correction_feedback_lineage'
   AND checksum='1044700d59b9dbb2d2b36d890496de0be6fb3d53c4409504f3c7693906866c35')
 OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0057_w3_feedback_consent'
   AND checksum='08cb6f37c12ca3131b2e307a237569aa4d104fc627566e619a39fa18a1814d11')
 THEN RAISE EXCEPTION 'Original feedback lineage and consent required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_development_feedback_lifecycle') THEN
  CREATE ROLE creator_development_feedback_lifecycle NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_development_feedback_lifecycle'
   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members m WHERE m.member=to_regrole('creator_development_feedback_lifecycle')
   OR m.roleid=to_regrole('creator_development_feedback_lifecycle'))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_development_feedback_lifecycle'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
   AND refobjid=to_regrole('creator_development_feedback_lifecycle')
   AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated feedback lifecycle role required'; END IF;
END $$;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.identity_event ADD COLUMN policy_version text,ADD COLUMN expires_at timestamptz;
ALTER TABLE creator.identity_event ADD CONSTRAINT development_intro_event_policy CHECK (
 kind NOT IN('fan_intro_offer','fan_intro_offer_suppressed','fan_intro_offer_acknowledged') OR
 (policy_version IS NOT NULL AND expires_at IS NOT NULL
  AND policy_version='w8-development-reply-feedback-20261002-v1'
  AND expires_at=timestamptz '2026-11-01 00:00:00+00'
  AND created_at>=timestamptz '2026-10-02 00:00:00+00'
  AND created_at<timestamptz '2026-11-01 00:00:00+00')
) NOT VALID;
ALTER TABLE creator.conversation_feedback ADD CONSTRAINT development_feedback_expiry CHECK (
 consent_policy_version IS DISTINCT FROM 'w8-development-reply-feedback-20261002-v1' OR
 (consented_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at>consented_at
  AND consented_at>=timestamptz '2026-10-02 00:00:00+00'
  AND consented_at<timestamptz '2026-11-01 00:00:00+00'
  AND expires_at<=consented_at+interval '7 days'
  AND expires_at<=timestamptz '2026-11-01 00:00:00+00')
) NOT VALID;
CREATE INDEX development_intro_event_expiry ON creator.identity_event(expires_at,id)
 WHERE policy_version='w8-development-reply-feedback-20261002-v1';
CREATE UNIQUE INDEX development_intro_once_per_account
 ON creator.identity_event(account_id,policy_version)
 WHERE policy_version='w8-development-reply-feedback-20261002-v1'
 AND kind IN('fan_intro_offer','fan_intro_offer_suppressed');
CREATE UNIQUE INDEX development_intro_one_acknowledgement
 ON creator.identity_event(account_id,aggregate_id,policy_version)
 WHERE policy_version='w8-development-reply-feedback-20261002-v1'
 AND kind='fan_intro_offer_acknowledged';
CREATE POLICY development_feedback_lifecycle_read ON creator.conversation_feedback FOR SELECT
 TO creator_development_feedback_lifecycle USING(consent_policy_version='w8-development-reply-feedback-20261002-v1');
CREATE POLICY development_feedback_lifecycle_delete ON creator.conversation_feedback FOR DELETE
 TO creator_development_feedback_lifecycle USING(consent_policy_version='w8-development-reply-feedback-20261002-v1');
CREATE POLICY development_intro_lifecycle_read ON creator.identity_event FOR SELECT
 TO creator_development_feedback_lifecycle USING(policy_version='w8-development-reply-feedback-20261002-v1'
 AND kind IN('fan_intro_offer','fan_intro_offer_suppressed','fan_intro_offer_acknowledged'));
CREATE POLICY development_intro_lifecycle_delete ON creator.identity_event FOR DELETE
 TO creator_development_feedback_lifecycle USING(policy_version='w8-development-reply-feedback-20261002-v1'
 AND kind IN('fan_intro_offer','fan_intro_offer_suppressed','fan_intro_offer_acknowledged'));
CREATE POLICY development_intro_lifecycle_update ON creator.identity_event FOR UPDATE
 TO creator_development_feedback_lifecycle USING(policy_version='w8-development-reply-feedback-20261002-v1'
 AND kind IN('fan_intro_offer','fan_intro_offer_suppressed'))
 WITH CHECK(policy_version='w8-development-reply-feedback-20261002-v1' AND kind='fan_intro_offer_suppressed'
 AND aggregate_id=account_id AND version=1 AND expires_at=timestamptz '2026-11-01 00:00:00+00');
RESET ROLE;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_development_feedback_lifecycle;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_development_feedback_lifecycle;
GRANT SELECT(message_id,message_version,account_id,consent_policy_version,consented_at,expires_at),DELETE
 ON creator.conversation_feedback TO creator_development_feedback_lifecycle;
GRANT SELECT(id,account_id,kind,aggregate_id,version,created_at,policy_version,expires_at),
 UPDATE(kind,aggregate_id,version),DELETE ON creator.identity_event TO creator_development_feedback_lifecycle;
CREATE FUNCTION creator_trust.development_feedback_registered(v text,h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user IN('creator_runtime','creator_trust_worker')
  AND v='0207_w8_development_feedback_lifecycle' AND h ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=v AND checksum=h)
$$;
CREATE FUNCTION creator_trust.withdraw_development_feedback()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE offers uuid[];
BEGIN
 IF TG_OP<>'DELETE' OR TG_TABLE_SCHEMA<>'creator' OR TG_TABLE_NAME<>'conversation_feedback'
  OR session_user NOT IN('creator_runtime','creator_trust_worker')
 THEN RAISE EXCEPTION 'Original feedback deletion required' USING ERRCODE='42501'; END IF;
 IF OLD.consent_policy_version IS DISTINCT FROM 'w8-development-reply-feedback-20261002-v1' THEN RETURN OLD; END IF;
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0207_w8_development_feedback_lifecycle'
  AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Registered feedback lifecycle required' USING ERRCODE='42501'; END IF;
 SELECT array_agg(e.id ORDER BY e.id) INTO offers FROM (
  SELECT id FROM creator.identity_event WHERE account_id=OLD.account_id
   AND policy_version='w8-development-reply-feedback-20261002-v1'
   AND kind IN('fan_intro_offer','fan_intro_offer_suppressed')
   AND aggregate_id=OLD.message_id AND version=OLD.message_version
  ORDER BY id FOR UPDATE NOWAIT
 ) e;
 DELETE FROM creator.identity_event WHERE account_id=OLD.account_id
  AND policy_version='w8-development-reply-feedback-20261002-v1'
  AND kind='fan_intro_offer_acknowledged' AND aggregate_id=ANY(offers);
 UPDATE creator.identity_event SET kind='fan_intro_offer_suppressed',aggregate_id=OLD.account_id,version=1
  WHERE account_id=OLD.account_id AND id=ANY(offers)
  AND policy_version='w8-development-reply-feedback-20261002-v1';
 RETURN OLD;
END $$;
CREATE FUNCTION creator_trust.purge_development_feedback(batch integer)
RETURNS TABLE(feedback_deleted integer,events_deleted integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_trust_worker' OR batch IS NULL OR batch<1 OR batch>100
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0207_w8_development_feedback_lifecycle'
   AND checksum ~ '^[a-f0-9]{64}$')
  OR NOT EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND datconnlimit<>0
   AND shobj_description(oid,'pg_database')='creator-platform:labelled-synthetic-development-20261002')
 THEN RAISE EXCEPTION 'Labelled development lifecycle required' USING ERRCODE='42501'; END IF;
 WITH picked AS MATERIALIZED(SELECT message_id,account_id FROM creator.conversation_feedback
  WHERE consent_policy_version='w8-development-reply-feedback-20261002-v1'
   AND expires_at<=clock_timestamp() ORDER BY expires_at,message_id,account_id LIMIT batch FOR UPDATE SKIP LOCKED),
 removed AS(DELETE FROM creator.conversation_feedback f USING picked p
  WHERE f.message_id=p.message_id AND f.account_id=p.account_id RETURNING 1)
 SELECT count(*)::integer INTO feedback_deleted FROM removed;
 WITH picked AS MATERIALIZED(SELECT id FROM creator.identity_event
  WHERE policy_version='w8-development-reply-feedback-20261002-v1'
   AND kind IN('fan_intro_offer','fan_intro_offer_suppressed','fan_intro_offer_acknowledged')
   AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch FOR UPDATE SKIP LOCKED),
 removed AS(DELETE FROM creator.identity_event e USING picked p WHERE e.id=p.id RETURNING 1)
 SELECT count(*)::integer INTO events_deleted FROM removed;
 RETURN NEXT;
END $$;
ALTER FUNCTION creator_trust.development_feedback_registered(text,text)
 OWNER TO creator_development_feedback_lifecycle;
ALTER FUNCTION creator_trust.withdraw_development_feedback()
 OWNER TO creator_development_feedback_lifecycle;
ALTER FUNCTION creator_trust.purge_development_feedback(integer)
 OWNER TO creator_development_feedback_lifecycle;
REVOKE ALL ON FUNCTION creator_trust.development_feedback_registered(text,text),
 creator_trust.withdraw_development_feedback(),creator_trust.purge_development_feedback(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.development_feedback_registered(text,text) TO creator_runtime,creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.purge_development_feedback(integer) TO creator_trust_worker;
CREATE TRIGGER development_feedback_withdrawal AFTER DELETE ON creator.conversation_feedback
 FOR EACH ROW EXECUTE FUNCTION creator_trust.withdraw_development_feedback();
RESET ROLE;
COMMIT;
