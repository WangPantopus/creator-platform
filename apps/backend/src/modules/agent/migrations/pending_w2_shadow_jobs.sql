-- W2 append-only proposal. W8 must allocate an ID and replace the pending ledger
-- value before shared application. The isolated run applied these bytes as 0013;
-- see artifacts/workstreams/W2/source-version/20260929/applied-isolated-migrations/.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.ai_shadow_evaluation DROP CONSTRAINT ai_shadow_evaluation_state_check;
ALTER TABLE creator.ai_shadow_evaluation ADD CONSTRAINT ai_shadow_evaluation_state_check CHECK(state IN ('running','passed','failed'));
ALTER TABLE creator.ai_shadow_evaluation ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE creator.ai_shadow_evaluation ADD COLUMN error text;
CREATE INDEX ai_shadow_latest ON creator.ai_shadow_evaluation(creator_id,created_at DESC);
INSERT INTO creator.schema_migration(version) VALUES('PENDING_W8_w2_shadow_jobs');
COMMIT;
