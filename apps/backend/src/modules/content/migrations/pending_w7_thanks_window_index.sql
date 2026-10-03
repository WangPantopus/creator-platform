-- Canonical W5 metadata index proposal for W7's closed Impact collector.
-- UNALLOCATED / UNREGISTERED / UNAPPLIED. W8 owns registry and rollout review.
-- Existing SQL, role grants, consent and RLS policies remain unchanged.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE INDEX content_thanks_window_page
 ON creator.content_thanks(creator_id,created_at,id)
 WHERE withdrawn_at IS NULL;
COMMIT;
