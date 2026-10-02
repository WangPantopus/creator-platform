-- W8 reservation 0067_w2_usage_retention_expiry; W2-owned detached accounting.
-- No historical record receives an invented policy or deadline.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.ai_usage
  ADD COLUMN accounting_retained_until timestamptz,
  ADD COLUMN accounting_retention_version text CHECK (length(accounting_retention_version) BETWEEN 1 AND 200),
  ADD COLUMN accounting_retention_reason text CHECK (length(accounting_retention_reason) BETWEEN 12 AND 2000),
  ADD COLUMN accounting_disposition_reference text CHECK (length(accounting_disposition_reference) BETWEEN 8 AND 2048),
  ADD CONSTRAINT ai_usage_retention_binding CHECK (
    (accounting_retained_until IS NULL AND accounting_retention_version IS NULL
      AND accounting_retention_reason IS NULL AND accounting_disposition_reference IS NULL)
    OR (accounting_retained_until IS NOT NULL AND accounting_retention_version IS NOT NULL
      AND accounting_retention_reason IS NOT NULL AND accounting_disposition_reference IS NOT NULL
      AND accounting_retained_until>=created_at
      AND thread_id IS NULL AND fan_id IS NULL AND generation_id IS NULL
      AND attempt_id IS NULL AND call_ordinal IS NULL AND creator_hold_id IS NULL)
  );
CREATE INDEX ai_usage_retention_due ON creator.ai_usage(creator_id,accounting_retention_version,accounting_retained_until,id)
  WHERE accounting_retained_until IS NOT NULL AND cost_micros IS NOT NULL;
COMMIT;
