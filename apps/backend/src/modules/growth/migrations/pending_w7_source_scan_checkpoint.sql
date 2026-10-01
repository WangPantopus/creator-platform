-- Additive W7 proposal. W8 must allocate/register the exact source before use.
-- Cursor custody does not issue Actors or private thread/producer scopes.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.source_scan_checkpoint (
  namespace text PRIMARY KEY CHECK(namespace ~ '^[a-z0-9_-]{1,80}$'),
  encrypted_cursor text NOT NULL CHECK(length(encrypted_cursor) BETWEEN 1 AND 16384),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE growth.source_scan_checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.source_scan_checkpoint FORCE ROW LEVEL SECURITY;
CREATE POLICY source_scan_worker ON growth.source_scan_checkpoint
  TO growth_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON growth.source_scan_checkpoint TO growth_worker;
COMMIT;
