-- Lane 1, WP 1.6, P2 (founder, 2026-10-16): a supervisor lifts a pause from
-- its case, with a reason sent to both parties. The restriction ends at once;
-- the AI returns through an agent.resume action that lane 3 builds (until
-- then it waits, blocked, and the case stays action_pending). Pending source:
-- the integrator allocates the number, registers it and regenerates the
-- pinned catalogues.
-- A pause action that has not finished is cancelled, never left to fire after
-- the lift. Only a supervisor holding the case's lease can cancel it or end
-- the restriction, and only for a pause.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
ALTER TABLE creator_trust.effect DROP CONSTRAINT effect_state_check;
ALTER TABLE creator_trust.effect ADD CONSTRAINT effect_state_check
 CHECK(state IN ('pending','running','blocked','retry','complete','dead_letter','cancelled'));
CREATE POLICY effect_cancel_pause ON creator_trust.effect FOR UPDATE TO creator_trust_runtime
 USING(type='agent.pause' AND state IN ('pending','blocked','retry','dead_letter') AND creator_trust.has_case_access(case_id)
  AND EXISTS(SELECT 1 FROM creator_trust.ops_member m WHERE m.account_id=creator_trust.current_account()
   AND m.supervisor AND m.revoked_at IS NULL AND m.expires_at>now()))
 WITH CHECK(type='agent.pause' AND state='cancelled' AND lease_until IS NULL AND lease_token IS NULL);
GRANT UPDATE(revoked_at) ON creator_trust.restriction TO creator_trust_runtime;
CREATE POLICY restriction_lift ON creator_trust.restriction FOR UPDATE TO creator_trust_runtime
 USING(reason_code='pause_creator' AND revoked_at IS NULL AND creator_trust.has_case_access(case_id)
  AND EXISTS(SELECT 1 FROM creator_trust.ops_member m WHERE m.account_id=creator_trust.current_account()
   AND m.supervisor AND m.revoked_at IS NULL AND m.expires_at>now()))
 WITH CHECK(reason_code='pause_creator' AND revoked_at IS NOT NULL);
COMMIT;
