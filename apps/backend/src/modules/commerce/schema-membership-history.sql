-- Additive W4 migration, registry order remains assigned by W8. Preserve original 0004.
BEGIN;
SET LOCAL ROLE creator_owner;
-- Provider references are immutable purchase identities. A new item after cancellation needs
-- a new historical row; same fan/tier/provider does not imply the same purchase.
ALTER TABLE creator.commerce_membership DROP CONSTRAINT commerce_membership_fan_id_tier_id_provider_key;
CREATE INDEX commerce_membership_current ON creator.commerce_membership(fan_id,tier_id,period_end) WHERE state IN('pending','active','grace','cancelled');
COMMIT;
