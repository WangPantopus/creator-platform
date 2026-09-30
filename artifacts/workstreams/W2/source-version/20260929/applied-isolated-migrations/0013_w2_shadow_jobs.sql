-- W2 append-only proposal. Apply after W2 base/extensions; W8 controls shared ordering.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.ai_shadow_evaluation DROP CONSTRAINT ai_shadow_evaluation_state_check;
ALTER TABLE creator.ai_shadow_evaluation ADD CONSTRAINT ai_shadow_evaluation_state_check CHECK(state IN ('running','passed','failed'));
ALTER TABLE creator.ai_shadow_evaluation ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE creator.ai_shadow_evaluation ADD COLUMN error text;
CREATE INDEX ai_shadow_latest ON creator.ai_shadow_evaluation(creator_id,created_at DESC);
INSERT INTO creator.schema_migration(version) VALUES('0013_w2_shadow_jobs');
COMMIT;
