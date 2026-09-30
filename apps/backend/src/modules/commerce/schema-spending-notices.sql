-- Additive W4 migration; W8 assigns shared registry order. Fan-private notice outbox.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_spending_notice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),period date NOT NULL,threshold integer NOT NULL CHECK(threshold IN(50,100)),
 limit_version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,
 UNIQUE(fan_id,currency,period,threshold)
);
ALTER TABLE creator.commerce_spending_notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_spending_notice FORCE ROW LEVEL SECURITY;
CREATE POLICY fan_scope ON creator.commerce_spending_notice USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id));
GRANT SELECT,INSERT ON creator.commerce_spending_notice TO creator_runtime;
CREATE INDEX commerce_spending_notice_outbox ON creator.commerce_spending_notice(created_at,id) WHERE published_at IS NULL;
COMMIT;
