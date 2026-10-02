-- 0062_w6_creator_media_worker. W8 owns registry activation.
-- Ingestion authority is independent of human request/session authority.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_media_worker') THEN
  CREATE ROLE creator_media_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_media_discovery') THEN
  CREATE ROLE creator_media_discovery NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_media_worker,creator_media_discovery;
GRANT USAGE ON SCHEMA creator_trust TO creator_media_worker;
GRANT EXECUTE ON FUNCTION creator_trust.media_worker_denial(text,uuid,uuid,uuid) TO creator_media_worker;
SET LOCAL ROLE creator_owner;
-- Earlier policies were PUBLIC. Keep interactive access on its existing role;
-- a permissive PUBLIC policy must never bypass the worker family fence.
ALTER POLICY scope_read ON creator.media_asset TO creator_runtime;
ALTER POLICY scope_insert ON creator.media_asset TO creator_runtime;
ALTER POLICY scope_update ON creator.media_asset TO creator_runtime;
ALTER POLICY scope_delete ON creator.media_asset TO creator_runtime;
ALTER POLICY scope_read ON creator.creator_media_asset TO creator_runtime;
ALTER POLICY owner_insert ON creator.creator_media_asset TO creator_runtime;
ALTER POLICY owner_update ON creator.creator_media_asset TO creator_runtime;
CREATE POLICY media_worker_read ON creator.media_asset FOR SELECT TO creator_media_worker USING (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('media.fan_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
);
CREATE POLICY media_worker_update ON creator.media_asset FOR UPDATE TO creator_media_worker USING (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('media.fan_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
) WITH CHECK (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('media.fan_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
);
CREATE POLICY creator_media_worker_read ON creator.creator_media_asset FOR SELECT TO creator_media_worker USING (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
);
CREATE POLICY creator_media_worker_update ON creator.creator_media_asset FOR UPDATE TO creator_media_worker USING (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
) WITH CHECK (
 creator_id=nullif(current_setting('media.creator_id',true),'')::uuid AND
 owner_account_id=nullif(current_setting('media.owner_account_id',true),'')::uuid
);
GRANT SELECT ON creator.media_asset,creator.creator_media_asset TO creator_media_worker;
GRANT UPDATE(state,version,bytes,mime_type,duration_ms,output_sha256,waveform,provenance,failure_code,job_available_at,job_lease_until,manifest_pending,delete_pending)
 ON creator.media_asset TO creator_media_worker;
GRANT UPDATE(state,version,bytes,mime_type,duration_ms,output_sha256,waveform,provenance,failure_code,job_available_at,job_lease_until,job_token,manifest_pending,delete_pending)
 ON creator.creator_media_asset TO creator_media_worker;
-- Discovery cannot read payloads, hashes, signed acts, provenance or objects.
CREATE POLICY media_discovery ON creator.media_asset FOR SELECT TO creator_media_discovery USING(true);
CREATE POLICY creator_media_discovery ON creator.creator_media_asset FOR SELECT TO creator_media_discovery USING(true);
GRANT SELECT(id,creator_id,fan_id,owner_account_id,state,expires_at,job_available_at,job_lease_until,manifest_pending,delete_pending)
 ON creator.media_asset TO creator_media_discovery;
GRANT SELECT(id,creator_id,owner_account_id,state,expires_at,job_available_at,job_lease_until,manifest_pending,delete_pending)
 ON creator.creator_media_asset TO creator_media_discovery;
CREATE FUNCTION creator.discover_media_jobs(after_key text,batch_size integer)
 RETURNS TABLE(cursor_key text,kind text,creator_id uuid,fan_id uuid,owner_account_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
  SELECT * FROM (
   SELECT 't:'||id::text AS cursor_key,'thread'::text AS kind,creator_id,fan_id,owner_account_id
   FROM creator.media_asset WHERE
    ((expires_at<=now() AND state NOT IN('revoked','deleted')) OR
     (job_available_at<=now() AND (job_lease_until IS NULL OR job_lease_until<=now()) AND
      (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending)))
   UNION ALL
   SELECT 'c:'||id::text,'creator'::text,creator_id,NULL::uuid,owner_account_id
   FROM creator.creator_media_asset WHERE
    ((expires_at<=now() AND state NOT IN('revoked','deleted')) OR
     (job_available_at<=now() AND (job_lease_until IS NULL OR job_lease_until<=now()) AND
      (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending)))
  ) jobs WHERE cursor_key>coalesce(after_key,'') ORDER BY cursor_key
  LIMIT greatest(1,least(coalesce(batch_size,128),256))
$$;
REVOKE ALL ON FUNCTION creator.discover_media_jobs(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.discover_media_jobs(text,integer) TO creator_media_worker;
RESET ROLE;
-- No membership is granted in discovery, runtime, owner or trust roles. Only
-- this bounded read function executes as the column-limited discovery role.
GRANT CREATE ON SCHEMA creator TO creator_media_discovery;
ALTER FUNCTION creator.discover_media_jobs(text,integer) OWNER TO creator_media_discovery;
REVOKE CREATE ON SCHEMA creator FROM creator_media_discovery;
COMMIT;
