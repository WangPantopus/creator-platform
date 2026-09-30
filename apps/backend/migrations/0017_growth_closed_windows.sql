-- W7 only; requested W8 ordering after 0016. Preserve applied migrations.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.insight_window (
  creator_id uuid NOT NULL,
  window_start date NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(creator_id,window_start)
);
INSERT INTO growth.insight_window(creator_id,window_start) SELECT DISTINCT creator_id,window_start FROM growth.insight_snapshot;
ALTER TABLE growth.insight_window ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.insight_window FORCE ROW LEVEL SECURITY;
CREATE POLICY creator_scope ON growth.insight_window TO growth_runtime USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY etl_scope ON growth.insight_window TO growth_worker USING(true) WITH CHECK(true);
REVOKE ALL ON growth.insight_window FROM PUBLIC;
GRANT SELECT ON growth.insight_window TO growth_runtime;
GRANT SELECT,INSERT,DELETE ON growth.insight_window TO growth_worker;
COMMIT;
