-- Additive proposal. Unallocated/unregistered: W8 must assign canonical custody
-- before installation. Never backfill an original request from current settings.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_payout_custody (
 effect_id uuid PRIMARY KEY REFERENCES creator.commerce_payout_effect(id),
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 commitment_id uuid NOT NULL UNIQUE REFERENCES creator.commerce_commitment(id),
 destination text NOT NULL CHECK(length(destination) BETWEEN 1 AND 200),
 source_payment text NOT NULL CHECK(length(source_payment) BETWEEN 1 AND 200),
 source_transaction text NOT NULL CHECK(length(source_transaction) BETWEEN 1 AND 200),
 amount bigint NOT NULL CHECK(amount>0 AND amount<=9007199254740991),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 provider_key text NOT NULL UNIQUE CHECK(length(provider_key) BETWEEN 1 AND 200),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creator.commerce_payout_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_payout_custody FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_custody_owner ON creator.commerce_payout_custody
 USING(creator.commerce_scope(creator_id,NULL))
 WITH CHECK(creator.commerce_scope(creator_id,NULL));
GRANT SELECT,INSERT ON creator.commerce_payout_custody TO creator_runtime;
CREATE TRIGGER payout_custody_immutable BEFORE UPDATE OR DELETE ON creator.commerce_payout_custody
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
CREATE FUNCTION creator.commerce_payout_custody_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM creator.commerce_payout_effect e
   WHERE e.id=NEW.effect_id AND e.creator_id=NEW.creator_id
   AND e.commitment_id=NEW.commitment_id AND e.amount=NEW.amount
   AND e.currency=NEW.currency AND e.provider_key=NEW.provider_key
   AND e.state='pending' AND e.attempt=0 AND e.provider_ref IS NULL) THEN
   RAISE EXCEPTION 'Original payout custody requires an unattempted matching effect';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payout_custody_matches BEFORE INSERT ON creator.commerce_payout_custody
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_payout_custody_matches();
CREATE FUNCTION creator.commerce_payout_identity_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Original payout history is retained'; END IF;
 IF ROW(NEW.id,NEW.creator_id,NEW.commitment_id,NEW.amount,NEW.currency,NEW.provider_key,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.creator_id,OLD.commitment_id,OLD.amount,OLD.currency,OLD.provider_key,OLD.created_at)
   OR (OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref)
   OR NEW.attempt<OLD.attempt THEN
   RAISE EXCEPTION 'Original payout identity and provider cause are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payout_identity_fence BEFORE UPDATE OR DELETE ON creator.commerce_payout_effect
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_payout_identity_fence();
CREATE TABLE creator.commerce_payout_reversal_custody (
 effect_id uuid PRIMARY KEY REFERENCES creator.commerce_payout_custody(effect_id),
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 commitment_id uuid NOT NULL UNIQUE REFERENCES creator.commerce_commitment(id),
 provider_ref text NOT NULL UNIQUE CHECK(length(provider_ref) BETWEEN 1 AND 200),
 amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),
 provider_key text NOT NULL UNIQUE CHECK(length(provider_key) BETWEEN 1 AND 200),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE creator.commerce_payout_reversal_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_payout_reversal_custody FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_reversal_custody_owner ON creator.commerce_payout_reversal_custody
 USING(creator.commerce_scope(creator_id,NULL)) WITH CHECK(creator.commerce_scope(creator_id,NULL));
GRANT SELECT,INSERT ON creator.commerce_payout_reversal_custody TO creator_runtime;
CREATE TRIGGER payout_reversal_custody_immutable BEFORE UPDATE OR DELETE ON creator.commerce_payout_reversal_custody
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
CREATE FUNCTION creator.commerce_payout_reversal_matches() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM creator.commerce_payout_effect e
   WHERE e.id=NEW.effect_id AND e.creator_id=NEW.creator_id
   AND e.commitment_id=NEW.commitment_id AND e.provider_ref=NEW.provider_ref
   AND e.amount>=NEW.amount AND NEW.provider_key=e.provider_key||':compensate'
   AND e.state IN('processing','unknown') AND e.lease_until>clock_timestamp()) THEN
   RAISE EXCEPTION 'Original payout reversal requires its current bound transfer claim';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payout_reversal_custody_matches BEFORE INSERT ON creator.commerce_payout_reversal_custody
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_payout_reversal_matches();
COMMIT;
