-- Additive W4 migration. Shared registry order is unassigned; W8 owns allocation.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_billing_account ADD COLUMN subscription_terminal boolean NOT NULL DEFAULT false;
CREATE TABLE creator.commerce_subscription_history (
 subscription_ref text PRIMARY KEY,fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 customer_ref text NOT NULL,currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 terminal boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.commerce_pass_purchase_history (
 reference text PRIMARY KEY,fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 pass_id uuid NOT NULL REFERENCES creator.commerce_pass(id),created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_subscription_history','commerce_pass_purchase_history'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY fan_scope ON creator.%I USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id))',relation);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON creator.commerce_subscription_history TO creator_runtime;
GRANT SELECT,INSERT ON creator.commerce_pass_purchase_history TO creator_runtime;
CREATE TRIGGER commerce_pass_purchase_immutable BEFORE UPDATE OR DELETE ON creator.commerce_pass_purchase_history FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
COMMIT;
