-- Append-only: enforce the same non-owner boundary for deduplicated referral IDs.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
ALTER TABLE creator_trust.crisis_referral_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.crisis_referral_event FORCE ROW LEVEL SECURITY;
CREATE POLICY referral_worker ON creator_trust.crisis_referral_event TO creator_trust_worker USING(true) WITH CHECK(true);
RESET ROLE;
INSERT INTO creator.schema_migration(version) VALUES('0012_w8_crisis_event_rls');
COMMIT;
