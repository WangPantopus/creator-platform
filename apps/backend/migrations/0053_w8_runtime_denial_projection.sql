-- W8 negative-authority projection. No private content or positive access grant.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_trust_denial') THEN
    CREATE ROLE creator_trust_denial NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_trust_denial;
GRANT SELECT(id,creator_id,fan_id) ON creator.thread TO creator_trust_denial;
GRANT SELECT(id,account_id) ON creator.fan_profile,creator.creator_profile TO creator_trust_denial;
GRANT SELECT(account_id,creator_id,revoked_at) ON creator_trust.block,creator_trust.restriction TO creator_trust_denial;
GRANT SELECT(account_id,scope,creator_id,thread_id,job_id) ON creator_trust.tombstone TO creator_trust_denial;
GRANT SELECT(id,owned_creator_ids) ON creator_trust.privacy_job TO creator_trust_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY trust_denial_metadata ON creator.thread FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE POLICY denial_metadata ON creator_trust.block FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY denial_metadata ON creator_trust.restriction FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY denial_metadata ON creator_trust.tombstone FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY denial_metadata ON creator_trust.privacy_job FOR SELECT TO creator_trust_denial USING(true);

-- Serialize committed negative authority with the caller-held domain write.
-- Keys are sorted everywhere; generation must never hold a DB transaction over
-- a provider call. The function exposes only the denial, not its private reason.
CREATE FUNCTION creator_trust.denial_projection(c uuid, f uuid, owner_account uuid, t uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;
BEGIN
  FOR k IN SELECT DISTINCT v FROM unnest(ARRAY[
    'w8-denial:account:'||f::text, 'w8-denial:account:'||owner_account::text,
    'w8-denial:creator:'||c::text]) v ORDER BY v LOOP
    PERFORM pg_advisory_xact_lock_shared(hashtextextended(k,0));
  END LOOP;
  RETURN
    EXISTS(SELECT FROM creator_trust.block WHERE account_id=f AND creator_id=c AND revoked_at IS NULL) OR
    EXISTS(SELECT FROM creator_trust.restriction WHERE revoked_at IS NULL AND (account_id IN(f,owner_account) OR creator_id=c)) OR
    EXISTS(SELECT FROM creator_trust.tombstone WHERE account_id IN(f,owner_account) AND
      (scope='account' OR (creator_id=c AND (scope='creator' OR (t IS NOT NULL AND thread_id=t))))) OR
    EXISTS(SELECT FROM creator_trust.tombstone s JOIN creator_trust.privacy_job j ON j.id=s.job_id
      WHERE s.scope='account' AND c=ANY(j.owned_creator_ids));
END $$;
CREATE FUNCTION creator_trust.runtime_thread_denial(c uuid, t uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fan_account uuid; owner_account uuid; caller uuid;
BEGIN
  caller := nullif(current_setting('app.account_id',true),'')::uuid;
  SELECT f.account_id,p.account_id INTO fan_account,owner_account
    FROM creator.thread r JOIN creator.fan_profile f ON f.id=r.fan_id
    JOIN creator.creator_profile p ON p.id=r.creator_id
    WHERE r.id=t AND r.creator_id=c AND caller IN(f.account_id,p.account_id);
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF creator_trust.denial_projection(c,fan_account,owner_account,t) THEN RETURN 'denied'; END IF;
  RETURN 'allowed';
END $$;
-- Audience reads require a real fan/creator pair, not an invented thread.
CREATE FUNCTION creator_trust.runtime_audience_denial(c uuid, fan uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fan_account uuid; owner_account uuid; caller uuid;
BEGIN
  caller := nullif(current_setting('app.account_id',true),'')::uuid;
  SELECT f.account_id,p.account_id INTO fan_account,owner_account
    FROM creator.fan_profile f CROSS JOIN creator.creator_profile p
    WHERE f.id=fan AND p.id=c AND f.account_id=caller;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF creator_trust.denial_projection(c,fan_account,owner_account,NULL) THEN RETURN 'denied'; END IF;
  RETURN 'allowed';
END $$;
CREATE FUNCTION creator_trust.runtime_creator_denial(c uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_account uuid; caller uuid;
BEGIN
  caller := nullif(current_setting('app.account_id',true),'')::uuid;
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c AND account_id=caller;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF creator_trust.denial_projection(c,owner_account,owner_account,NULL) THEN RETURN 'denied'; END IF;
  RETURN 'allowed';
END $$;
-- Binary ingestion has its own purpose and family fence. 0062 grants this
-- function only to creator_media_worker, never an interactive request role.
CREATE FUNCTION creator_trust.media_worker_denial(kind text,c uuid,fan uuid,asset_owner uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE fan_account uuid; creator_account uuid; t uuid;
BEGIN
  IF kind NOT IN('creator','thread') OR
    c IS DISTINCT FROM nullif(current_setting('media.creator_id',true),'')::uuid OR
    asset_owner IS DISTINCT FROM nullif(current_setting('media.owner_account_id',true),'')::uuid OR
    fan IS DISTINCT FROM nullif(current_setting('media.fan_id',true),'')::uuid THEN
    RETURN 'unavailable';
  END IF;
  SELECT account_id INTO creator_account FROM creator.creator_profile WHERE id=c;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF kind='creator' THEN
    IF fan IS NOT NULL OR asset_owner<>creator_account THEN RETURN 'unavailable'; END IF;
    fan_account := creator_account;
  ELSE
    SELECT f.account_id,r.id INTO fan_account,t FROM creator.fan_profile f
      JOIN creator.thread r ON r.fan_id=f.id WHERE f.id=fan AND r.creator_id=c;
    IF NOT FOUND OR asset_owner NOT IN(fan_account,creator_account) THEN RETURN 'unavailable'; END IF;
  END IF;
  IF creator_trust.denial_projection(c,fan_account,creator_account,t) THEN RETURN 'denied'; END IF;
  RETURN 'allowed';
END $$;
CREATE FUNCTION creator_trust.lock_denial_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE keys text[] := ARRAY[]::text[]; k text; owned uuid[];
BEGIN
  IF TG_OP<>'DELETE' THEN
    keys := keys || ARRAY['w8-denial:account:'||NEW.account_id::text,'w8-denial:creator:'||NEW.creator_id::text];
    IF TG_TABLE_NAME='tombstone' THEN
      SELECT owned_creator_ids INTO owned FROM creator_trust.privacy_job WHERE id=NEW.job_id;
      keys := keys || ARRAY(SELECT 'w8-denial:creator:'||id::text FROM unnest(owned) id);
    END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN
    keys := keys || ARRAY['w8-denial:account:'||OLD.account_id::text,'w8-denial:creator:'||OLD.creator_id::text];
    IF TG_TABLE_NAME='tombstone' THEN
      SELECT owned_creator_ids INTO owned FROM creator_trust.privacy_job WHERE id=OLD.job_id;
      keys := keys || ARRAY(SELECT 'w8-denial:creator:'||id::text FROM unnest(owned) id);
    END IF;
  END IF;
  FOR k IN SELECT DISTINCT v FROM unnest(keys) v WHERE v IS NOT NULL ORDER BY v LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(k,0));
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER denial_change BEFORE INSERT OR UPDATE OR DELETE ON creator_trust.block FOR EACH ROW EXECUTE FUNCTION creator_trust.lock_denial_change();
CREATE TRIGGER denial_change BEFORE INSERT OR UPDATE OR DELETE ON creator_trust.restriction FOR EACH ROW EXECUTE FUNCTION creator_trust.lock_denial_change();
CREATE TRIGGER denial_change BEFORE INSERT OR UPDATE OR DELETE ON creator_trust.tombstone FOR EACH ROW EXECUTE FUNCTION creator_trust.lock_denial_change();
RESET ROLE;
ALTER FUNCTION creator_trust.denial_projection(uuid,uuid,uuid,uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.runtime_thread_denial(uuid,uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.runtime_audience_denial(uuid,uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.runtime_creator_denial(uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.media_worker_denial(text,uuid,uuid,uuid) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.lock_denial_change() OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.denial_projection(uuid,uuid,uuid,uuid),creator_trust.runtime_thread_denial(uuid,uuid),creator_trust.runtime_audience_denial(uuid,uuid),creator_trust.runtime_creator_denial(uuid),creator_trust.media_worker_denial(text,uuid,uuid,uuid),creator_trust.lock_denial_change() FROM PUBLIC;
GRANT USAGE ON SCHEMA creator_trust TO creator_runtime;
GRANT EXECUTE ON FUNCTION creator_trust.runtime_thread_denial(uuid,uuid),creator_trust.runtime_audience_denial(uuid,uuid),creator_trust.runtime_creator_denial(uuid) TO creator_runtime;
COMMIT;
