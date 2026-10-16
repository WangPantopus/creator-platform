-- Lane 1, WP 1.6, O2 (founder, 2026-10-16): the founder adds, changes and
-- removes ops reviewers with a runbook command (modules/trust/ops-members.ts)
-- run with the migration login, as creator_trust_owner. Pending source: the
-- integrator allocates the number, registers it and regenerates the pinned
-- catalogues.
-- ops_member and case_access force row security and so far only had policies
-- for creator_trust_runtime: the schema owner itself could not change a
-- reviewer. Every change is logged, append-only, with who made it and why.
-- No runtime, worker or projection role gains anything.
BEGIN;
SET LOCAL ROLE creator_trust_owner;
CREATE POLICY owner_admin ON creator_trust.ops_member TO creator_trust_owner
 USING(true) WITH CHECK(true);
-- A change ends the reviewer's open case leases; it can only shorten them.
CREATE POLICY owner_read_lease ON creator_trust.case_access FOR SELECT TO creator_trust_owner
 USING(true);
CREATE POLICY owner_end_lease ON creator_trust.case_access FOR UPDATE TO creator_trust_owner
 USING(expires_at>now()) WITH CHECK(expires_at<=now());
CREATE TABLE creator_trust.ops_member_change (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL,
 change text NOT NULL CHECK(change IN('added','updated','removed')),
 queues text[] CHECK(queues <@ ARRAY['safety','disputes','verification','pauses','support']::text[]),
 supervisor boolean,
 expires_at timestamptz,
 operator text NOT NULL CHECK(length(operator) BETWEEN 1 AND 80),
 reason text NOT NULL CHECK(length(reason) BETWEEN 4 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((change='removed')=(queues IS NULL AND supervisor IS NULL AND expires_at IS NULL))
);
CREATE INDEX ops_member_change_account ON creator_trust.ops_member_change(account_id,created_at DESC);
ALTER TABLE creator_trust.ops_member_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.ops_member_change FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_append ON creator_trust.ops_member_change FOR INSERT TO creator_trust_owner
 WITH CHECK(true);
CREATE POLICY owner_read ON creator_trust.ops_member_change FOR SELECT TO creator_trust_owner
 USING(true);
COMMIT;
