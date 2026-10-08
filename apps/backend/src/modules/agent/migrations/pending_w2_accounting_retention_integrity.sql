-- Held additive retention integrity. Original0163/0165 bytes stay immutable.
-- No historical date, amount, policy or disposition is created or rewritten.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.ai_usage ADD CONSTRAINT ai_usage_retention_finite
 CHECK (accounting_retained_until IS NULL OR isfinite(accounting_retained_until));

CREATE FUNCTION creator.ai_usage_retention_integrity() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Original usage time cannot be reset' USING ERRCODE='23514';
 END IF;
 IF OLD.accounting_retained_until IS NOT NULL THEN
  IF ROW(NEW.accounting_retained_until,NEW.accounting_retention_version,
    NEW.accounting_retention_reason,NEW.accounting_disposition_reference)
   IS DISTINCT FROM ROW(OLD.accounting_retained_until,OLD.accounting_retention_version,
    OLD.accounting_retention_reason,OLD.accounting_disposition_reference) THEN
   RAISE EXCEPTION 'Original retained accounting disposition cannot change' USING ERRCODE='23514';
  END IF;
  IF OLD.cost_micros IS NOT NULL AND
   ROW(NEW.cost_micros,NEW.provider,NEW.model,NEW.input_tokens,NEW.output_tokens,
    NEW.cached_input_tokens,NEW.cache_write_input_tokens,NEW.version_hash,
    NEW.category,NEW.purpose,NEW.duration_ms,NEW.completed_at,NEW.provider_state)
   IS DISTINCT FROM
   ROW(OLD.cost_micros,OLD.provider,OLD.model,OLD.input_tokens,OLD.output_tokens,
    OLD.cached_input_tokens,OLD.cache_write_input_tokens,OLD.version_hash,
    OLD.category,OLD.purpose,OLD.duration_ms,OLD.completed_at,OLD.provider_state) THEN
   RAISE EXCEPTION 'Original retained known accounting cannot change' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.ai_usage_retention_integrity() FROM PUBLIC;
CREATE TRIGGER ai_usage_retention_integrity BEFORE UPDATE ON creator.ai_usage
 FOR EACH ROW EXECUTE FUNCTION creator.ai_usage_retention_integrity();

CREATE FUNCTION creator.ai_cost_hold_original_clock() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Original cost hold time cannot be reset' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.ai_cost_hold_original_clock() FROM PUBLIC;
CREATE TRIGGER ai_cost_hold_original_clock BEFORE UPDATE ON creator.ai_cost_hold
 FOR EACH ROW EXECUTE FUNCTION creator.ai_cost_hold_original_clock();
-- The original owner still authorizes the first disposition, reconciliation,
-- erasure and sole COMMIT. No new role, membership, grant or expiry task.
COMMIT;
