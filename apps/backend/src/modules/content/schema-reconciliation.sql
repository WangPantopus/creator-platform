-- Additive W5 reconciliation and chronological reads; schema.sql remains immutable.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE INDEX content_chronological_page ON creator.content_index(creator_id,created_at DESC,id DESC);
ALTER TABLE creator.content_effect ADD COLUMN lease_id uuid, ADD COLUMN lease_until timestamptz, ADD COLUMN last_error text;
ALTER TABLE creator.content_index ADD COLUMN packet_id uuid;
UPDATE creator.content_index i SET packet_id=(r.document->>'packetId')::uuid FROM creator.content_revision r WHERE r.content_id=i.id AND r.version=i.version;
CREATE TABLE creator.content_privacy_receipt(job_id uuid NOT NULL, idempotency_key text NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(job_id,idempotency_key));
ALTER TABLE creator.content_privacy_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_privacy_receipt FORCE ROW LEVEL SECURITY;
-- No web/runtime grants. W8 supplies an explicitly authorized privacy worker connection.
COMMIT;
