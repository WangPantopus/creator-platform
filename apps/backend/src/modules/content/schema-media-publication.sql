BEGIN;
SET LOCAL ROLE creator_owner;
-- Additive proposal: W8 must allocate/register before this path is activated.
-- Existing SQL, applied IDs and historical signatures remain unchanged.
ALTER TABLE creator.content_index DROP CONSTRAINT content_index_state_check;
ALTER TABLE creator.content_index ADD CONSTRAINT content_index_state_check
  CHECK(state IN('draft','media_pending','scheduled','published','unpublished','archived'));
ALTER TABLE creator.content_publication ADD COLUMN media_evidence jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK(jsonb_typeof(media_evidence)='array' AND jsonb_array_length(media_evidence)<=10);
CREATE INDEX content_media_pending ON creator.content_index(creator_id,scheduled_at,id)
  WHERE state='media_pending';
COMMIT;
