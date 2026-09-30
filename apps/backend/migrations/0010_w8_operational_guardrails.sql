-- Append-only W8 follow-up. 0009 reserved for W3 registration; never rewrite applied 0008.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
CREATE TABLE creator_trust.restriction (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 creator_id uuid,account_id uuid,reason_code text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 CHECK(creator_id IS NOT NULL OR account_id IS NOT NULL),UNIQUE(case_id,reason_code)
);
CREATE INDEX restriction_creator ON creator_trust.restriction(creator_id) WHERE revoked_at IS NULL;
CREATE INDEX restriction_account ON creator_trust.restriction(account_id) WHERE revoked_at IS NULL;
ALTER TABLE creator_trust.restriction ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.restriction FORCE ROW LEVEL SECURITY;
-- Minimal negative-authority signals carry no private case reason/content.
CREATE POLICY restriction_read ON creator_trust.restriction FOR SELECT TO creator_trust_runtime USING(true);
CREATE POLICY restriction_insert ON creator_trust.restriction FOR INSERT TO creator_trust_runtime WITH CHECK(creator_trust.has_case_access(case_id));
CREATE POLICY restriction_worker ON creator_trust.restriction TO creator_trust_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON creator_trust.restriction TO creator_trust_runtime;
GRANT SELECT ON creator_trust.restriction TO creator_trust_worker;
CREATE TABLE creator_trust.crisis_referral_event(event_id uuid PRIMARY KEY,day date NOT NULL,region text NOT NULL,protocol_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON creator_trust.crisis_referral_event TO creator_trust_worker;
ALTER TABLE creator_trust.effect ADD COLUMN decision_version integer NOT NULL DEFAULT 1;
ALTER TABLE creator_trust.effect DROP CONSTRAINT effect_case_id_type_key;
ALTER TABLE creator_trust.effect ADD CONSTRAINT effect_decision_unique UNIQUE(case_id,type,decision_version);
RESET ROLE;
INSERT INTO creator.schema_migration(version) VALUES('0010_w8_operational_guardrails');
COMMIT;
