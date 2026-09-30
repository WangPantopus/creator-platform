-- Capture verified ownership before identity removal. Never infer empty ownership from old jobs.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
ALTER TABLE creator_trust.privacy_job
  ADD COLUMN owned_creator_ids uuid[],
  ADD COLUMN ownership_ref text,
  ADD CONSTRAINT privacy_ownership_snapshot CHECK (
    (owned_creator_ids IS NULL AND ownership_ref IS NULL) OR
    (scope='account' AND owned_creator_ids IS NOT NULL AND ownership_ref IS NOT NULL
     AND cardinality(owned_creator_ids)<=100 AND array_position(owned_creator_ids,NULL) IS NULL
     AND char_length(ownership_ref) BETWEEN 8 AND 200)
  );
-- Identity/scope/verification/ownership are immutable; workers only advance job progress.
REVOKE UPDATE ON creator_trust.privacy_job FROM creator_trust_runtime,creator_trust_worker;
GRANT UPDATE(state,updated_at,completed_at) ON creator_trust.privacy_job TO creator_trust_runtime,creator_trust_worker;
COMMIT;
