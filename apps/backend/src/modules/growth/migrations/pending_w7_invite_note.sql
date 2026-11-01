-- Lane 5 WP 5.7. Integrator registers after the current migration PR.
-- Apply only to the lane's disposable database while this branch is held.
BEGIN;
SET LOCAL ROLE growth_owner;
ALTER TABLE growth.invite ADD COLUMN note text NOT NULL DEFAULT ''
  CHECK(char_length(note)<=600);
COMMIT;
