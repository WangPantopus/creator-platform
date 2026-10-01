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
 duration_ms integer, max_duration_ms integer NOT NULL CHECK(max_duration_ms>=0 AND max_duration_ms<=3600000),
 max_bytes bigint NOT NULL CHECK(max_bytes>0 AND max_bytes<=268435456),
 input_sha256 text NOT NULL CHECK(input_sha256~'^[a-f0-9]{64}$'),
 output_sha256 text CHECK(output_sha256~'^[a-f0-9]{64}$'),
 waveform jsonb NOT NULL DEFAULT'[]', signed_act_id uuid REFERENCES creator.signed_act(id), provenance jsonb,
 expires_at timestamptz NOT NULL, failure_code text, job_available_at timestamptz, job_lease_until timestamptz, job_token uuid,
 manifest_pending boolean NOT NULL DEFAULT false, delete_pending boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state<>'ready' OR output_sha256 IS NOT NULL),
 CHECK(purpose='post_photo' OR max_duration_ms>0),
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
   purpose IN('human_note','post_photo') AND state='ready' AND signed_act_id IS NOT NULL AND provenance->'c2paVerified'='true'::jsonb AND
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
-- Processed evidence and original signing occurrence survive decoration/reuse.
CREATE FUNCTION creator.guard_creator_media_immutability() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.id,NEW.creator_id,NEW.object_id,NEW.owner_account_id,NEW.purpose,NEW.input_sha256,NEW.max_bytes,NEW.max_duration_ms,NEW.created_at)
    IS DISTINCT FROM (OLD.id,OLD.creator_id,OLD.object_id,OLD.owner_account_id,OLD.purpose,OLD.input_sha256,OLD.max_bytes,OLD.max_duration_ms,OLD.created_at) THEN
  RAISE EXCEPTION 'creator_media_identity_immutable';
 END IF;
 IF OLD.output_sha256 IS NOT NULL AND
    (NEW.output_sha256,NEW.mime_type,NEW.bytes,NEW.duration_ms) IS DISTINCT FROM
    (OLD.output_sha256,OLD.mime_type,OLD.bytes,OLD.duration_ms) THEN
  RAISE EXCEPTION 'creator_media_processed_evidence_immutable';
 END IF;
 IF OLD.signed_act_id IS NOT NULL AND NEW.signed_act_id IS DISTINCT FROM OLD.signed_act_id THEN
  RAISE EXCEPTION 'creator_media_recording_occurrence_immutable';
 END IF;
 IF NEW.version<OLD.version OR NEW.access_epoch<OLD.access_epoch OR
    (OLD.state='deleted' AND NEW.state<>'deleted') OR
    (OLD.state='revoked' AND NEW.state NOT IN('revoked','deleted')) THEN
  RAISE EXCEPTION 'creator_media_tombstone_immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER creator_media_immutability BEFORE UPDATE ON creator.creator_media_asset
 FOR EACH ROW EXECUTE FUNCTION creator.guard_creator_media_immutability();
CREATE TABLE creator.creator_media_publication (
 asset_id uuid NOT NULL, creator_id uuid NOT NULL, object_id uuid NOT NULL, account_id uuid NOT NULL,
 signed_act_id uuid NOT NULL REFERENCES creator.signed_act(id), evidence jsonb NOT NULL,
 command_hash text NOT NULL CHECK(command_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(asset_id,signed_act_id),
 FOREIGN KEY(asset_id,creator_id,object_id,account_id) REFERENCES creator.creator_media_asset(id,creator_id,object_id,owner_account_id)
);
ALTER TABLE creator.creator_media_publication ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.creator_media_publication FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_read ON creator.creator_media_publication FOR SELECT USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND (
  account_id=nullif(current_setting('app.account_id',true),'')::uuid OR
  EXISTS(SELECT 1 FROM creator.creator_media_asset a WHERE a.id=creator_media_publication.asset_id AND a.creator_id=creator_media_publication.creator_id AND a.object_id=creator_media_publication.object_id AND a.purpose IN('human_note','post_photo') AND a.state='ready' AND a.provenance->'c2paVerified'='true'::jsonb)
 )
);
CREATE POLICY scope_insert ON creator.creator_media_publication FOR INSERT WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
);
GRANT SELECT,INSERT ON creator.creator_media_publication TO creator_runtime;
CREATE FUNCTION creator.guard_creator_media_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM creator.signed_act sa
  JOIN creator.signed_act_consumption sac ON sac.signed_act_id=sa.id AND sac.account_id=sa.account_id
  JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id
  JOIN creator.creator_media_asset a ON a.id=NEW.asset_id AND a.creator_id=NEW.creator_id AND a.object_id=NEW.object_id AND a.owner_account_id=NEW.account_id
  WHERE sa.id=NEW.signed_act_id AND sa.account_id=NEW.account_id AND sa.creator_id=NEW.creator_id AND sa.subject_id=NEW.object_id
   AND sa.content_hash=NEW.command_hash AND sa.act_type IN('broadcast','reply') AND sp.withdrawn_at IS NULL
   AND sp.command->>'actType'=sa.act_type AND sp.command->>'subjectId'=NEW.object_id::text
   AND sp.command->'content'->>'kind'='content_publication' AND sp.command->'content'->>'creatorId'=NEW.creator_id::text
   AND jsonb_typeof(sp.command->'content'->'mediaEvidence')='array'
   AND sp.command->'content'->'mediaEvidence' @> jsonb_build_array(NEW.evidence)
   AND a.state='ready' AND a.purpose IN('human_note','post_photo') AND NEW.evidence=jsonb_build_object('assetId',a.id,'version',a.version,'sha256',a.output_sha256,'bytes',a.bytes,'mimeType',a.mime_type,'durationMs',a.duration_ms)
 ) THEN
  RAISE EXCEPTION 'creator_media_publication_evidence_invalid';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER creator_media_publication_guard BEFORE INSERT ON creator.creator_media_publication
 FOR EACH ROW EXECUTE FUNCTION creator.guard_creator_media_publication();
COMMIT;
