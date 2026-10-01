-- W8 custody: 0054_w4_pass_purchase_effects, reserved_unapplied at3240da0.
-- Original quote/effect/cash journals; no synthetic packet or second ledger.
BEGIN;
CREATE TABLE creator.commerce_pass_billing_account (
 fan_id uuid PRIMARY KEY REFERENCES creator.fan_profile(id),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 desired_renewal boolean NOT NULL DEFAULT false,
 subscription_ref text UNIQUE,customer_ref text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE creator.commerce_pass_quote (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 account_version integer NOT NULL CHECK(account_version>0),
 configuration_hash text NOT NULL CHECK(configuration_hash ~ '^[a-f0-9]{64}$'),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 amount bigint NOT NULL CHECK(amount>0 AND amount<=9007199254740991),
 monthly_amount bigint NOT NULL CHECK(monthly_amount>0 AND monthly_amount<=9007199254740991),
 quoted_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,period_end timestamptz NOT NULL,
 provider_preview_ref text NOT NULL,body jsonb NOT NULL,body_hash text NOT NULL CHECK(body_hash ~ '^[a-f0-9]{64}$'),
 CHECK(expires_at>quoted_at AND period_end>expires_at),UNIQUE(id,fan_id)
);
CREATE TABLE creator.commerce_pass_billing_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 operation text NOT NULL CHECK(operation IN('start','activate_renewal','cancel','compensate_cancel')),
 provider_key text NOT NULL UNIQUE,request jsonb NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 intent_version integer NOT NULL CHECK(intent_version>0),
 quote_id uuid,FOREIGN KEY(quote_id,fan_id) REFERENCES creator.commerce_pass_quote(id,fan_id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','unknown','done','failed')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),lease_until timestamptz,
 next_at timestamptz NOT NULL DEFAULT now(),provider_ref text,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((operation='start')=(quote_id IS NOT NULL)),UNIQUE(id,fan_id)
);
CREATE INDEX commerce_pass_billing_ready ON creator.commerce_pass_billing_effect(next_at,created_at,id)
 WHERE state IN('pending','processing','unknown');
CREATE TABLE creator.commerce_pass_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 subscription_ref text NOT NULL,invoice_ref text NOT NULL,line_ref text NOT NULL UNIQUE,payment_ref text NOT NULL,
 paid_minor bigint NOT NULL CHECK(paid_minor>0 AND paid_minor<=9007199254740991),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,paid_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(period_end>period_start)
);

CREATE FUNCTION creator.commerce_pass_effect_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Pass effect history is retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'pending' OR NEW.attempt<>0 OR NEW.provider_ref IS NOT NULL OR NEW.lease_until IS NOT NULL THEN
   RAISE EXCEPTION 'Pass effects begin with the original pending request';
  END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.fan_id,NEW.retention_policy_version,NEW.operation,NEW.provider_key,NEW.request,NEW.request_hash,
        NEW.intent_version,NEW.quote_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.fan_id,OLD.retention_policy_version,OLD.operation,OLD.provider_key,OLD.request,OLD.request_hash,
        OLD.intent_version,OLD.quote_id,OLD.created_at) THEN
  RAISE EXCEPTION 'Original pass effect authority and request are immutable';
 END IF;
 IF OLD.state IN('done','failed') AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Terminal pass effects are immutable';
 END IF;
 IF NEW.attempt<OLD.attempt OR NEW.attempt>OLD.attempt+1
    OR (NEW.attempt>OLD.attempt AND NEW.state<>'processing') THEN
  RAISE EXCEPTION 'Pass effect attempts must retain their claim fence';
 END IF;
 IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
  RAISE EXCEPTION 'The original pass provider reference is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_pass_effect_fence BEFORE INSERT OR UPDATE OR DELETE ON creator.commerce_pass_billing_effect
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_pass_effect_fence();
CREATE TRIGGER commerce_pass_quote_immutable BEFORE UPDATE OR DELETE ON creator.commerce_pass_quote
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
CREATE TRIGGER commerce_pass_receipt_immutable BEFORE UPDATE OR DELETE ON creator.commerce_pass_receipt
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_pass_billing_account','commerce_pass_quote','commerce_pass_billing_effect','commerce_pass_receipt'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY pass_fan_owner ON creator.%I USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id))',relation);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON creator.commerce_pass_billing_account,creator.commerce_pass_billing_effect TO creator_runtime;
GRANT SELECT,INSERT ON creator.commerce_pass_quote,creator.commerce_pass_receipt TO creator_runtime;
COMMIT;
