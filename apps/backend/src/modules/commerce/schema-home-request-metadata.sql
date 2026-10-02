-- Reserved0080_w4_fan_request_page_index; W8 owns canonical registration.
-- No retained state or new private projection is introduced.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE INDEX commerce_packet_home_activity ON creator.commerce_packet(fan_id,updated_at DESC,id DESC);
COMMIT;
