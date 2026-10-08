-- Additive allocated copy; original pending source remains preserved.
-- New comparison-purpose storage. Unregistered/unapplied until the complete
-- original consent, sanitizer, current-read, expiry and privacy owners qualify.
-- No existing feedback or processor-consent row is converted into this consent.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_lifecycle') THEN
  CREATE ROLE creator_comparison_lifecycle NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_lifecycle'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=to_regrole('creator_comparison_lifecycle')
  OR roleid=to_regrole('creator_comparison_lifecycle'))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_comparison_lifecycle'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
  AND refobjid=to_regrole('creator_comparison_lifecycle')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated comparison lifecycle role required'; END IF;
END $$;
SET LOCAL ROLE creator_owner;

CREATE TABLE creator.conversation_comparison_consent (
 thread_id uuid PRIMARY KEY,
 creator_id uuid NOT NULL,
 fan_id uuid NOT NULL,
 account_id uuid NOT NULL,
 policy_version text NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 120),
 processor_policy_version text NOT NULL CHECK(length(processor_policy_version) BETWEEN 1 AND 120),
 consented_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(isfinite(consented_at) AND isfinite(expires_at) AND expires_at>consented_at),
 UNIQUE(thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id) ON DELETE CASCADE
);
CREATE INDEX conversation_comparison_consent_expiry
 ON creator.conversation_comparison_consent(expires_at,thread_id);

-- Raw messages remain in message. This mapping and the source fingerprint stay
-- with Conversation; only sample_id, bounded paraphrase and sanitizer revision
-- cross to Agent. A source ID or a hash is never consent/read authority.
CREATE TABLE creator.conversation_comparison_sample (
 id uuid PRIMARY KEY,
 thread_id uuid NOT NULL,
 creator_id uuid NOT NULL,
 fan_id uuid NOT NULL,
 account_id uuid NOT NULL,
 policy_version text NOT NULL,
 processor_policy_version text NOT NULL,
 message_id uuid NOT NULL,
 message_version integer NOT NULL CHECK(message_version>0),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 paraphrased_prompt text NOT NULL CHECK(length(paraphrased_prompt) BETWEEN 5 AND 1000),
 sanitizer_reference text NOT NULL CHECK(length(sanitizer_reference) BETWEEN 1 AND 512),
 occurred_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 CHECK(isfinite(occurred_at) AND isfinite(created_at) AND isfinite(expires_at)
  AND occurred_at<=created_at AND expires_at>created_at
  AND expires_at<=occurred_at+interval '30 days'),
 UNIQUE(message_id,policy_version,processor_policy_version,sanitizer_reference),
 FOREIGN KEY(thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version)
  REFERENCES creator.conversation_comparison_consent
   (thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version) ON DELETE CASCADE,
 FOREIGN KEY(message_id,thread_id,creator_id,fan_id)
  REFERENCES creator.message(id,thread_id,creator_id,fan_id) ON DELETE CASCADE
);
CREATE INDEX conversation_comparison_sample_cohort
 ON creator.conversation_comparison_sample(creator_id,occurred_at DESC,id);
CREATE INDEX conversation_comparison_sample_expiry
 ON creator.conversation_comparison_sample(expires_at,id);

ALTER TABLE creator.conversation_comparison_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_comparison_consent FORCE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_comparison_sample ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_comparison_sample FORCE ROW LEVEL SECURITY;

-- Ordinary fan choices use the genuine held Conversation transaction. There
-- is deliberately no creator-wide fan-text read or ordinary sample write here.
CREATE POLICY comparison_consent_fan_read ON creator.conversation_comparison_consent
 FOR SELECT TO creator_runtime USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
 AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
 AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND EXISTS(SELECT FROM creator.fan_profile f
  WHERE f.id=conversation_comparison_consent.fan_id AND f.account_id=conversation_comparison_consent.account_id)
);
CREATE POLICY comparison_consent_fan_insert ON creator.conversation_comparison_consent
 FOR INSERT TO creator_runtime WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
 AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
 AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND EXISTS(SELECT FROM creator.fan_profile f
  WHERE f.id=conversation_comparison_consent.fan_id AND f.account_id=conversation_comparison_consent.account_id)
);
CREATE POLICY comparison_consent_fan_delete ON creator.conversation_comparison_consent
 FOR DELETE TO creator_runtime USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
 AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
 AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND EXISTS(SELECT FROM creator.fan_profile f
  WHERE f.id=conversation_comparison_consent.fan_id AND f.account_id=conversation_comparison_consent.account_id)
);
GRANT SELECT,INSERT,DELETE ON creator.conversation_comparison_consent TO creator_runtime;
-- The canonical fan writer already holds the original thread FOR UPDATE.
-- No UPDATE grant/policy can turn repeated consent into a clock extension.

-- No runtime grant on comparison samples. The distinct prepared original
-- comparison owner must supply source/current-consent checks and sample writes.
-- Activation also requires original-sample deletion to atomically invalidate
-- Agent's cached cohort/results, and owned physical expiry/export/deletion.
-- These tables alone are intentionally not a ready comparison producer.

-- A separate non-login owner can invalidate derived text, never generate a
-- sample, issue consent, change a publication or alter a financial receipt.
CREATE POLICY comparison_lifecycle_consent_read ON creator.conversation_comparison_consent
 FOR SELECT TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_consent_delete ON creator.conversation_comparison_consent
 FOR DELETE TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_consent_lock ON creator.conversation_comparison_consent
 FOR UPDATE TO creator_comparison_lifecycle USING(true) WITH CHECK(false);
CREATE POLICY comparison_lifecycle_sample_read ON creator.conversation_comparison_sample
 FOR SELECT TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_sample_delete ON creator.conversation_comparison_sample
 FOR DELETE TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_sample_lock ON creator.conversation_comparison_sample
 FOR UPDATE TO creator_comparison_lifecycle USING(true) WITH CHECK(false);
CREATE POLICY comparison_lifecycle_cache_read ON creator.ai_shadow_sample
 FOR SELECT TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_cache_delete ON creator.ai_shadow_sample
 FOR DELETE TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_cache_lock ON creator.ai_shadow_sample
 FOR UPDATE TO creator_comparison_lifecycle USING(true) WITH CHECK(false);
CREATE POLICY comparison_lifecycle_results_read ON creator.ai_shadow_evaluation
 FOR SELECT TO creator_comparison_lifecycle USING(true);
CREATE POLICY comparison_lifecycle_results_update ON creator.ai_shadow_evaluation
 FOR UPDATE TO creator_comparison_lifecycle USING(true)
 WITH CHECK(state='failed' AND results='[]'::jsonb AND error='Comparison source withdrawn or expired. Run it again.');
CREATE POLICY comparison_lifecycle_workspace_read ON creator.ai_workspace
 FOR SELECT TO creator_comparison_lifecycle USING(true);
-- PostgreSQL needs UPDATE privilege/policy for the serialization row lock;
-- this owner has no executable function that updates workspace data.
CREATE POLICY comparison_lifecycle_workspace_lock ON creator.ai_workspace
 FOR UPDATE TO creator_comparison_lifecycle USING(true) WITH CHECK(false);
RESET ROLE;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_comparison_lifecycle;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_comparison_lifecycle;
GRANT SELECT(thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version,expires_at),UPDATE(thread_id),DELETE
 ON creator.conversation_comparison_consent TO creator_comparison_lifecycle;
GRANT SELECT(id,thread_id,creator_id,fan_id,account_id,message_id,expires_at),UPDATE(id),DELETE
 ON creator.conversation_comparison_sample TO creator_comparison_lifecycle;
GRANT SELECT(id,creator_id,expires_at),UPDATE(id),DELETE ON creator.ai_shadow_sample TO creator_comparison_lifecycle;
GRANT SELECT(id,creator_id,state,results,error,created_at),UPDATE(results,state,error,updated_at)
 ON creator.ai_shadow_evaluation TO creator_comparison_lifecycle;
GRANT SELECT(creator_id),UPDATE(creator_id) ON creator.ai_workspace TO creator_comparison_lifecycle;

CREATE FUNCTION creator_trust.invalidate_comparison_source()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid;
BEGIN
 IF TG_OP<>'DELETE' OR TG_TABLE_SCHEMA<>'creator'
  OR TG_TABLE_NAME NOT IN('conversation_comparison_consent','conversation_comparison_sample')
  OR session_user NOT IN('creator_runtime','creator_trust_worker')
  OR NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='0239_w3_comparison_samples' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original registered comparison deletion required' USING ERRCODE='42501'; END IF;
 owner_id:=OLD.creator_id;
 -- Ordinary Conversation writers hold their original thread first. Replay
 -- takes the Agent workspace before checking sources. Refuse contention here
 -- instead of waiting in the opposite lock order or claiming withdrawal while
 -- a cached write can still commit. The entire original action then rolls back.
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=owner_id FOR UPDATE NOWAIT;
 DELETE FROM creator.ai_shadow_sample WHERE creator_id=owner_id;
 UPDATE creator.ai_shadow_evaluation SET results='[]',state='failed',
  error='Comparison source withdrawn or expired. Run it again.',updated_at=clock_timestamp()
  WHERE creator_id=owner_id AND (results<>'[]'::jsonb OR state<>'failed'
   OR error IS DISTINCT FROM 'Comparison source withdrawn or expired. Run it again.');
 RETURN OLD;
END $$;

CREATE FUNCTION creator_trust.withdraw_comparison_source()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_SCHEMA='creator' AND TG_TABLE_NAME='message' AND TG_OP='UPDATE' THEN
  IF OLD.author_kind<>'fan' AND NEW.author_kind<>'fan' THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_SCHEMA<>'creator' OR session_user NOT IN('creator_runtime','creator_trust_worker')
  OR NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='0239_w3_comparison_samples' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original registered comparison source change required' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='processor_consent' AND TG_OP='UPDATE' THEN
  IF NEW.withdrawn_at IS NOT NULL THEN
   DELETE FROM creator.conversation_comparison_consent
    WHERE thread_id=OLD.thread_id AND creator_id=OLD.creator_id AND fan_id=OLD.fan_id;
  END IF;
 ELSIF TG_TABLE_NAME='processor_consent' AND TG_OP='DELETE' THEN
  DELETE FROM creator.conversation_comparison_consent
   WHERE thread_id=OLD.thread_id AND creator_id=OLD.creator_id AND fan_id=OLD.fan_id;
 ELSIF TG_TABLE_NAME='thread' AND TG_OP='UPDATE' THEN
  IF NEW.deleted_at IS NOT NULL OR NEW.off_the_record
   OR NEW.processor_consent_version IS DISTINCT FROM OLD.processor_consent_version THEN
   DELETE FROM creator.conversation_comparison_consent
    WHERE thread_id=OLD.id AND creator_id=OLD.creator_id AND fan_id=OLD.fan_id;
  END IF;
 ELSIF TG_TABLE_NAME='message' AND TG_OP='UPDATE' THEN
  IF NEW.version IS DISTINCT FROM OLD.version OR NEW.text IS DISTINCT FROM OLD.text
   OR NEW.author_kind IS DISTINCT FROM OLD.author_kind OR NEW.author_account_id IS DISTINCT FROM OLD.author_account_id
   OR NEW.off_the_record OR NEW.delivery_state NOT IN('accepted','delivered') THEN
   DELETE FROM creator.conversation_comparison_sample
    WHERE message_id=OLD.id AND thread_id=OLD.thread_id AND creator_id=OLD.creator_id AND fan_id=OLD.fan_id;
  END IF;
 ELSIF TG_TABLE_NAME='memory_exclusion' AND TG_OP IN('INSERT','UPDATE') THEN
  -- The prepared semantic exclusion owner is not yet available. Exclude every
  -- sample from this family instead of assuming that a message-ID match covers
  -- an excluded fact's paraphrases elsewhere in the same conversation.
  DELETE FROM creator.conversation_comparison_sample
   WHERE thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id;
 ELSE
  RAISE EXCEPTION 'Original comparison source event required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION creator_trust.purge_expired_comparison_sources(batch integer)
RETURNS TABLE(consents_deleted integer,samples_deleted integer,cache_deleted integer,results_cleared integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_ids uuid[]; owners uuid[];
BEGIN
 IF session_user<>'creator_trust_worker' OR batch IS NULL OR batch<1 OR batch>100
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='0239_w3_comparison_samples' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original comparison expiry worker required' USING ERRCODE='42501'; END IF;
 -- Wall time only; no caller-selected cutoff or changed historical clock.
 WITH picked AS MATERIALIZED(SELECT thread_id FROM creator.conversation_comparison_consent
  WHERE expires_at<=clock_timestamp() ORDER BY expires_at,thread_id LIMIT batch FOR UPDATE SKIP LOCKED),
 removed AS(DELETE FROM creator.conversation_comparison_consent c USING picked p
  WHERE c.thread_id=p.thread_id RETURNING 1)
 SELECT count(*)::integer INTO consents_deleted FROM removed;
 WITH picked AS MATERIALIZED(SELECT id FROM creator.conversation_comparison_sample
  WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch FOR UPDATE SKIP LOCKED),
 removed AS(DELETE FROM creator.conversation_comparison_sample s USING picked p WHERE s.id=p.id RETURNING 1)
 SELECT count(*)::integer INTO samples_deleted FROM removed;
 -- Also physically remove expired older cached cohorts with no new mapping.
 SELECT array_agg(p.id),array_agg(DISTINCT p.creator_id) INTO old_ids,owners FROM (
  SELECT id,creator_id FROM creator.ai_shadow_sample
   WHERE expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch FOR UPDATE SKIP LOCKED
 ) p;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=ANY(owners)
  ORDER BY creator_id FOR UPDATE NOWAIT;
 WITH removed AS(DELETE FROM creator.ai_shadow_sample
  WHERE id=ANY(old_ids) AND expires_at<=clock_timestamp() RETURNING 1)
 SELECT count(*)::integer INTO cache_deleted FROM removed;
 UPDATE creator.ai_shadow_evaluation SET results='[]',state='failed',
  error='Comparison source withdrawn or expired. Run it again.',updated_at=clock_timestamp()
  WHERE creator_id=ANY(owners) AND (results<>'[]'::jsonb OR state<>'failed'
   OR error IS DISTINCT FROM 'Comparison source withdrawn or expired. Run it again.');
 -- Legacy orphaned results have no source mapping. They never become current
 -- replay authority, and their original creation clock still bounds retention.
 -- New mapped results are normally invalidated earlier by source expiry.
 SELECT array_agg(p.id),array_agg(DISTINCT p.creator_id) INTO old_ids,owners FROM (
  SELECT id,creator_id FROM creator.ai_shadow_evaluation
   WHERE created_at<=clock_timestamp()-interval '30 days' AND results<>'[]'::jsonb
   ORDER BY created_at,id LIMIT batch FOR UPDATE SKIP LOCKED
 ) p;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=ANY(owners)
  ORDER BY creator_id FOR UPDATE NOWAIT;
 UPDATE creator.ai_shadow_evaluation SET results='[]',state='failed',
  error='Comparison source withdrawn or expired. Run it again.',updated_at=clock_timestamp()
  WHERE id=ANY(old_ids) AND created_at<=clock_timestamp()-interval '30 days';
 GET DIAGNOSTICS results_cleared=ROW_COUNT;
 RETURN NEXT;
END $$;
ALTER FUNCTION creator_trust.invalidate_comparison_source() OWNER TO creator_comparison_lifecycle;
ALTER FUNCTION creator_trust.withdraw_comparison_source() OWNER TO creator_comparison_lifecycle;
ALTER FUNCTION creator_trust.purge_expired_comparison_sources(integer) OWNER TO creator_comparison_lifecycle;
REVOKE ALL ON FUNCTION creator_trust.invalidate_comparison_source(),
 creator_trust.withdraw_comparison_source(),creator_trust.purge_expired_comparison_sources(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.purge_expired_comparison_sources(integer) TO creator_trust_worker;
CREATE TRIGGER comparison_consent_withdrawal AFTER DELETE ON creator.conversation_comparison_consent
 FOR EACH ROW EXECUTE FUNCTION creator_trust.invalidate_comparison_source();
CREATE TRIGGER comparison_sample_withdrawal AFTER DELETE ON creator.conversation_comparison_sample
 FOR EACH ROW EXECUTE FUNCTION creator_trust.invalidate_comparison_source();
CREATE TRIGGER comparison_processor_withdrawal AFTER UPDATE OF withdrawn_at OR DELETE ON creator.processor_consent
 FOR EACH ROW EXECUTE FUNCTION creator_trust.withdraw_comparison_source();
CREATE TRIGGER comparison_thread_change AFTER UPDATE OF deleted_at,off_the_record,processor_consent_version ON creator.thread
 FOR EACH ROW EXECUTE FUNCTION creator_trust.withdraw_comparison_source();
CREATE TRIGGER comparison_message_change AFTER UPDATE OF version,text,off_the_record,delivery_state,author_kind,author_account_id ON creator.message
 FOR EACH ROW EXECUTE FUNCTION creator_trust.withdraw_comparison_source();
CREATE TRIGGER comparison_memory_exclusion AFTER INSERT OR UPDATE ON creator.memory_exclusion
 FOR EACH ROW EXECUTE FUNCTION creator_trust.withdraw_comparison_source();
COMMIT;
