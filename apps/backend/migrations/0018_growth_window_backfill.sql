-- W7 repair after 0017. FORCE RLS hides snapshot rows from its owner role.
BEGIN;
SET LOCAL ROLE growth_worker;
INSERT INTO growth.insight_window(creator_id,window_start)
SELECT DISTINCT creator_id,window_start FROM growth.insight_snapshot
ON CONFLICT DO NOTHING;
COMMIT;
