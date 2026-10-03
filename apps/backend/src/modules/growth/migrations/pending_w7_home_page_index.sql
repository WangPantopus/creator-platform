-- Additive W7 proposal. W8 must allocate and register this unchanged source
-- before it is applied. Existing canonical/applied SQL remains immutable.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE INDEX growth_content_public_home_page
  ON growth.content_public(published_at DESC,id DESC)
  INCLUDE(creator_id)
  WHERE state='published';
COMMIT;
