-- Held additive original settlement time. Existing terminal rows stay undated;
-- neither migration time nor a later privacy retry supplies their history.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_allowance_reservation
 ADD COLUMN original_settled_at timestamptz,
 ADD CONSTRAINT commerce_allowance_settlement_clock CHECK (
  original_settled_at IS NULL OR (
   isfinite(original_settled_at) AND cost_policy_version IS NOT NULL
   AND state IN ('consumed','released') AND settlement_ref IS NOT NULL
   AND settled_units IS NOT NULL AND output_delivered IS NOT NULL
  )
 );

CREATE FUNCTION creator.commerce_allowance_settlement_clock() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.original_settled_at IS NOT NULL THEN
   RAISE EXCEPTION 'Original settlement time cannot be supplied by a caller';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.original_settled_at IS DISTINCT FROM OLD.original_settled_at THEN
  RAISE EXCEPTION 'Original settlement time cannot be replaced or backfilled';
 END IF;
 IF OLD.state='reserved' AND NEW.state IN ('consumed','released')
  AND OLD.cost_policy_version IS NOT NULL AND NEW.settlement_ref IS NOT NULL
  AND OLD.original_settled_at IS NULL THEN
  NEW.original_settled_at:=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.commerce_allowance_settlement_clock() FROM PUBLIC;
CREATE TRIGGER commerce_allowance_settlement_clock BEFORE INSERT OR UPDATE
 ON creator.commerce_allowance_reservation FOR EACH ROW
 EXECUTE FUNCTION creator.commerce_allowance_settlement_clock();
-- Existing original financial checks and the transaction owner's sole COMMIT
-- remain authoritative. No owner, membership or table/column grant is added.
COMMIT;
