-- W8 custody: 0049_w4_generation_cost_settlement, reserved_unapplied at3240da0.
-- Additive proposal; canonical registration/checksum and installation are separate.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_allowance_reservation
 ADD COLUMN cost_policy_version text,
 ADD COLUMN settled_units integer,
 ADD COLUMN settlement_ref text,
 ADD COLUMN output_delivered boolean;

-- Historical fixed-unit reservations retain four NULL fields. Unknown usage
-- has no final receipt or amount and keeps its original reserved ceiling.
ALTER TABLE creator.commerce_allowance_reservation
 ADD CONSTRAINT commerce_allowance_cost_receipt CHECK (
  (cost_policy_version IS NULL AND settled_units IS NULL
   AND settlement_ref IS NULL AND output_delivered IS NULL)
  OR
  (cost_policy_version IS NOT NULL AND length(cost_policy_version) BETWEEN 1 AND 200
   AND ((pass_id IS NULL AND pass_cycle IS NULL)
        OR (pass_id IS NOT NULL AND pass_cycle IS NOT NULL))
   AND (
    (state='reserved' AND settled_units IS NULL AND settlement_ref IS NULL)
    OR
    (state IN ('consumed','released') AND settled_units IS NOT NULL
     AND settled_units BETWEEN 0 AND units
     AND settlement_ref IS NOT NULL AND length(settlement_ref) BETWEEN 1 AND 200
     AND output_delivered IS NOT NULL
     AND ((state='consumed' AND settled_units>0)
          OR (state='released' AND settled_units=0)))
   ))
 );
CREATE UNIQUE INDEX commerce_allowance_final_receipt
 ON creator.commerce_allowance_reservation(creator_id,fan_id,settlement_ref)
 WHERE settlement_ref IS NOT NULL;

CREATE FUNCTION creator.commerce_allowance_cost_fence() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Allowance reservation history is retained';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.cost_policy_version IS NOT NULL
     AND (NEW.state<>'reserved' OR NEW.settled_units IS NOT NULL
          OR NEW.settlement_ref IS NOT NULL OR NEW.output_delivered IS NOT NULL) THEN
   RAISE EXCEPTION 'Weighted allowance begins with an original reserved ceiling';
  END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.creator_id,NEW.fan_id,NEW.grant_id,NEW.key,NEW.units,
        NEW.pass_id,NEW.pass_cycle,NEW.cost_policy_version)
    IS DISTINCT FROM
    ROW(OLD.id,OLD.creator_id,OLD.fan_id,OLD.grant_id,OLD.key,OLD.units,
        OLD.pass_id,OLD.pass_cycle,OLD.cost_policy_version) THEN
  RAISE EXCEPTION 'Original allowance identity and policy are immutable';
 END IF;
 IF OLD.state<>'reserved' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Terminal allowance receipt is immutable';
 END IF;
 IF OLD.output_delivered IS NOT NULL
    AND NEW.output_delivered IS DISTINCT FROM OLD.output_delivered THEN
  RAISE EXCEPTION 'Observed allowance output cannot be rewritten';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_allowance_cost_fence
 BEFORE INSERT OR UPDATE OR DELETE ON creator.commerce_allowance_reservation
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_allowance_cost_fence();
COMMIT;
