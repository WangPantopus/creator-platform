-- Additive W4 follow-up to applied 0004. Shared registry order is unassigned; W8 owns allocation.
BEGIN;
SET LOCAL ROLE creator_owner;
DROP POLICY commerce_scope ON creator.commerce_packet;
CREATE POLICY packet_read ON creator.commerce_packet FOR SELECT USING (
 creator.commerce_scope(NULL,fan_id) OR (submitted_at IS NOT NULL AND creator.commerce_scope(creator_id,NULL))
);
CREATE POLICY packet_insert ON creator.commerce_packet FOR INSERT WITH CHECK(creator.commerce_scope(NULL,fan_id));
CREATE POLICY packet_update ON creator.commerce_packet FOR UPDATE USING(creator.commerce_scope(creator_id,fan_id)) WITH CHECK(creator.commerce_scope(creator_id,fan_id));
COMMIT;
