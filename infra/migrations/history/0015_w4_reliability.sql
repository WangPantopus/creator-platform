-- Additive follow-up to applied 0004_commerce. Proposed registry ID: 0009_w4_reliability.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_effect ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
DROP POLICY commerce_read ON creator.commerce_payout_account;
CREATE POLICY payout_account_owner ON creator.commerce_payout_account FOR SELECT USING(creator.commerce_scope(creator_id,NULL));
CREATE TABLE creator.commerce_provider_inbox (
 provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL, object_ref text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','blocked')),
 lease_until timestamptz, attempt integer NOT NULL DEFAULT 0, error_code text, PRIMARY KEY(provider,event_id)
);
CREATE INDEX commerce_provider_inbox_ready ON creator.commerce_provider_inbox(received_at) WHERE state IN ('pending','processing');
-- Notifications contain minimal verified provider references; no client read/update permission.
GRANT INSERT ON creator.commerce_provider_inbox TO creator_runtime;
COMMIT;
