-- Additive W4 migration; W8 assigns shared registry order after lifecycle.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_billing_effect ADD COLUMN attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0);
ALTER TABLE creator.commerce_payout_effect ADD COLUMN attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0);
COMMIT;
