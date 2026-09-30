-- Additive W4 lifecycle migration; W8 assigns shared registry order. Never rewrite 0004.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_pass ADD COLUMN used integer NOT NULL DEFAULT 0 CHECK(used>=0), ADD COLUMN reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0), ADD COLUMN provider_ref text UNIQUE, ADD COLUMN cancel_at_end boolean NOT NULL DEFAULT false;
ALTER TABLE creator.commerce_pass ADD CONSTRAINT commerce_pass_budget CHECK(used+reserved<=allowance);
ALTER TABLE creator.commerce_allowance_reservation ADD COLUMN pass_id uuid REFERENCES creator.commerce_pass(id), ADD COLUMN pass_cycle date;
CREATE TABLE creator.commerce_billing_account (
 fan_id uuid PRIMARY KEY REFERENCES creator.fan_profile(id),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 customer_ref text UNIQUE,subscription_ref text UNIQUE,version integer NOT NULL DEFAULT 1
);
CREATE TABLE creator.commerce_billing_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 operation text NOT NULL CHECK(operation IN('start','cancel','refund')),provider_key text NOT NULL UNIQUE,request jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','unknown','done','failed')),
 provider_ref text,lease_until timestamptz,next_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),error_code text
);
CREATE INDEX commerce_billing_ready ON creator.commerce_billing_effect(next_at) WHERE state IN('pending','processing','unknown');
CREATE TABLE creator.commerce_membership_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid NOT NULL,fan_id uuid NOT NULL,membership_id uuid NOT NULL REFERENCES creator.commerce_membership(id),
 invoice_ref text NOT NULL,line_ref text NOT NULL UNIQUE,payment_ref text NOT NULL,paid_minor bigint NOT NULL CHECK(paid_minor>=0 AND paid_minor<=9007199254740991),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(period_end>period_start)
);
CREATE TABLE creator.commerce_membership_usage (
 creator_id uuid NOT NULL,fan_id uuid NOT NULL,membership_id uuid NOT NULL REFERENCES creator.commerce_membership(id),evidence_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN('ai_message','note_open','request')),used_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(membership_id,evidence_id)
);
CREATE TABLE creator.commerce_credit_transfer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),creator_id uuid NOT NULL,
 amount bigint NOT NULL CHECK(amount>0 AND amount<=9007199254740991),currency text NOT NULL,checkout_ref text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN('reserved','consumed','restored')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.commerce_payout_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),commitment_id uuid NOT NULL UNIQUE REFERENCES creator.commerce_commitment(id),
 amount bigint NOT NULL CHECK(amount>0 AND amount<=9007199254740991),currency text NOT NULL,provider_key text NOT NULL UNIQUE,provider_ref text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','unknown','done','failed')),created_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,error_code text
);
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_billing_account','commerce_billing_effect','commerce_credit_transfer'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY fan_scope ON creator.%I USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id))',relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['commerce_membership_receipt','commerce_membership_usage'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY pair_scope ON creator.%I USING(creator.commerce_scope(creator_id,fan_id)) WITH CHECK(creator.commerce_scope(creator_id,fan_id))',relation);
 END LOOP;
END $$;
ALTER TABLE creator.commerce_payout_effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_payout_effect FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_owner ON creator.commerce_payout_effect USING(creator.commerce_scope(creator_id,NULL)) WITH CHECK(creator.commerce_scope(creator_id,NULL));
GRANT SELECT,INSERT,UPDATE ON creator.commerce_billing_account,creator.commerce_billing_effect,creator.commerce_credit_transfer,creator.commerce_payout_effect TO creator_runtime;
GRANT SELECT,INSERT ON creator.commerce_membership_receipt,creator.commerce_membership_usage TO creator_runtime;
CREATE TRIGGER commerce_receipt_immutable BEFORE UPDATE OR DELETE ON creator.commerce_membership_receipt FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
CREATE TRIGGER commerce_usage_immutable BEFORE UPDATE OR DELETE ON creator.commerce_membership_usage FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
COMMIT;
