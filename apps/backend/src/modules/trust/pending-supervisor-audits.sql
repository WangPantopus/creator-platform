-- Lane 1, WP 1.6, O1 (founder, 2026-10-16): a supervisor sees every
-- reviewer's case access records in the queues they supervise, with who made
-- each one. Pending source: the integrator allocates the number, registers it
-- and regenerates the pinned catalogues.
-- Until now a reviewer read only their own records (and the records of cases
-- about themselves). This adds a second read policy; nothing else changes.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.may_supervise(q text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM creator_trust.ops_member WHERE account_id=creator_trust.current_account()
  AND supervisor AND q=ANY(queues) AND revoked_at IS NULL AND expires_at>now())
$$;
CREATE POLICY audit_supervisor_read ON creator_trust.access_audit FOR SELECT TO creator_trust_runtime
 USING(EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND creator_trust.may_supervise(c.queue)));
COMMIT;
