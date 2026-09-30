-- W7 only. Coordinate integrated ordering with W8; never rewrite applied 0007.
BEGIN;
SET LOCAL ROLE growth_owner;
ALTER TABLE growth.insight_signal ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version > 0);
COMMIT;
