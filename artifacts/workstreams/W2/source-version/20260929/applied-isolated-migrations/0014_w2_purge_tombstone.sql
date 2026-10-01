-- Append-only W2 proposal; W8 owns shared registration and identifier-retention policy.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.ai_tombstone(creator_id uuid PRIMARY KEY,deleted_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE creator.ai_tombstone ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.ai_tombstone FORCE ROW LEVEL SECURITY;
CREATE POLICY creator_scope ON creator.ai_tombstone USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid) WITH CHECK(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
GRANT SELECT,INSERT ON creator.ai_tombstone TO creator_runtime;
-- These contain only tombstone/idempotency/outbox metadata after W2 content purge.
-- Identity's later physical purge must not be blocked by retained metadata.
ALTER TABLE creator.ai_workspace DROP CONSTRAINT ai_workspace_creator_id_fkey;
ALTER TABLE creator.ai_workspace ADD FOREIGN KEY(creator_id) REFERENCES creator.creator_profile(id) ON DELETE CASCADE;
ALTER TABLE creator.ai_command DROP CONSTRAINT ai_command_creator_id_fkey;
ALTER TABLE creator.ai_command ADD FOREIGN KEY(creator_id) REFERENCES creator.creator_profile(id) ON DELETE CASCADE;
ALTER TABLE creator.ai_event DROP CONSTRAINT ai_event_creator_id_fkey;
ALTER TABLE creator.ai_event ADD FOREIGN KEY(creator_id) REFERENCES creator.creator_profile(id) ON DELETE CASCADE;
INSERT INTO creator.schema_migration(version) VALUES('0014_w2_purge_tombstone');
COMMIT;
