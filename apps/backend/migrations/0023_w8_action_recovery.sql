-- Append-only W8 recovery authority; never permit a runtime actor to rewrite an external intent.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
GRANT UPDATE(state,available_at,lease_until,lease_token,error_code) ON creator_trust.effect TO creator_trust_runtime;
CREATE POLICY effect_recovery ON creator_trust.effect FOR UPDATE TO creator_trust_runtime
USING (
 state IN ('blocked','retry','dead_letter') AND creator_trust.has_case_access(case_id)
 AND EXISTS(SELECT 1 FROM creator_trust.ops_member m WHERE m.account_id=creator_trust.current_account() AND m.supervisor AND m.revoked_at IS NULL AND m.expires_at>now())
 AND EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND c.state='action_pending' AND c.version=decision_version)
)
WITH CHECK (
 state='pending' AND lease_until IS NULL AND lease_token IS NULL AND error_code IS NULL
 AND creator_trust.has_case_access(case_id)
 AND EXISTS(SELECT 1 FROM creator_trust.ops_member m WHERE m.account_id=creator_trust.current_account() AND m.supervisor AND m.revoked_at IS NULL AND m.expires_at>now())
 AND EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND c.state='action_pending' AND c.version=decision_version)
);
COMMIT;
