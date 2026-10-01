-- W6 append-only creator-object media. W8 must allocate/register before application.
-- Existing 0006 thread/fan assets and APIs remain unchanged.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.creator_media_asset (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 object_id uuid NOT NULL, owner_account_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN('source_audio','interview_audio','post_photo','human_note')),
 state text NOT NULL CHECK(state IN('uploading','quarantined','processing','ready','rejected','revoked','deleted')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), access_epoch integer NOT NULL DEFAULT 1 CHECK(access_epoch>0), mime_type text NOT NULL,
 bytes bigint NOT NULL CHECK(bytes>0 AND bytes<=268435456), uploaded_bytes bigint NOT NULL DEFAULT 0 CHECK(uploaded_bytes>=0 AND uploaded_bytes<=268435456),
 duration_ms integer, max_duration_ms integer NOT NULL CHECK(max_duration_ms>0 AND max_duration_ms<=3600000),
 max_bytes bigint NOT NULL CHECK(max_bytes>0 AND max_bytes<=268435456),
 input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),
 output_sha256 text CHECK(output_sha256~'^[a-f0-9]{64}$'),
 waveform jsonb NOT NULL DEFAULT'[]', signed_act_id uuid REFERENCES creator.signed_act(id), provenance jsonb,
 expires_at timestamptz NOT NULL, failure_code text, job_available_at timestamptz, job_lease_until timestamptz, job_token uuid,
 manifest_pending boolean NOT NULL DEFAULT false, delete_pending boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state<>'ready' OR output_sha256 IS NOT NULL),
 CHECK(purpose<>'human_note' OR max_duration_ms<=60000),
 UNIQUE(id,creator_id,object_id,owner_account_id)
);
CREATE INDEX creator_media_objects ON creator.creator_media_asset(creator_id,object_id,id);
CREATE INDEX creator_media_jobs ON creator.creator_media_asset(creator_id,job_available_at,id)
 WHERE state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending;
CREATE INDEX creator_media_retention ON creator.creator_media_asset(creator_id,expires_at,id) WHERE state NOT IN('revoked','deleted');
ALTER TABLE creator.creator_media_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.creator_media_asset FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_read ON creator.creator_media_asset FOR SELECT USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND (
  owner_account_id=nullif(current_setting('app.account_id',true),'')::uuid OR (
   purpose IN('human_note','post_photo') AND state='ready' AND signed_act_id IS NOT NULL AND provenance->>'c2paVerified'='true' AND
   EXISTS(SELECT 1 FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id
    WHERE t.creator_id=creator_media_asset.creator_id AND t.fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
     AND f.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND t.deleted_at IS NULL)
  )
 )
);
CREATE POLICY owner_insert ON creator.creator_media_asset FOR INSERT WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND owner_account_id=nullif(current_setting('app.account_id',true),'')::uuid AND
 EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=creator_media_asset.creator_id AND cp.account_id=creator_media_asset.owner_account_id)
);
CREATE POLICY owner_update ON creator.creator_media_asset FOR UPDATE USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND owner_account_id=nullif(current_setting('app.account_id',true),'')::uuid
) WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND owner_account_id=nullif(current_setting('app.account_id',true),'')::uuid
);
GRANT SELECT,INSERT,UPDATE ON creator.creator_media_asset TO creator_runtime;
CREATE TABLE creator.creator_media_publication (
 asset_id uuid NOT NULL, creator_id uuid NOT NULL, object_id uuid NOT NULL, account_id uuid NOT NULL,
 signed_act_id uuid NOT NULL REFERENCES creator.signed_act(id), evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(asset_id,signed_act_id),
 FOREIGN KEY(asset_id,creator_id,object_id,account_id) REFERENCES creator.creator_media_asset(id,creator_id,object_id,owner_account_id)
);
ALTER TABLE creator.creator_media_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.creator_media_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_read ON creator.creator_media_publication FOR SELECT USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
);
CREATE POLICY scope_insert ON creator.creator_media_publication FOR INSERT WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
);
GRANT SELECT,INSERT ON creator.creator_media_publication TO creator_runtime;
COMMIT;
