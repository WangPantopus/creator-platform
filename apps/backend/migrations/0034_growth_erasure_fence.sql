-- Delayed producer events must not restore an erased account/creator after purge.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.erasure_fence(subject_key text PRIMARY KEY CHECK(subject_key ~ '^[0-9a-f]{64}$'));
ALTER TABLE growth.erasure_fence ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.erasure_fence FORCE ROW LEVEL SECURITY;
CREATE POLICY erasure_worker ON growth.erasure_fence TO growth_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT ON growth.erasure_fence TO growth_worker;
COMMIT;
