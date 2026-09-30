BEGIN;
SET LOCAL ROLE creator_owner;
-- Minimal ownership pointers for verified thread-scoped privacy jobs.
ALTER TABLE creator.content_thanks ADD COLUMN thread_id uuid;
UPDATE creator.content_thanks t SET thread_id=m.thread_id FROM creator.message m WHERE t.target_kind='message' AND t.target_id=m.id AND t.creator_id=m.creator_id AND t.fan_id=m.fan_id;
CREATE INDEX content_thanks_thread ON creator.content_thanks(thread_id,fan_id) WHERE thread_id IS NOT NULL;
ALTER TABLE creator.studio_reply_draft ADD COLUMN thread_id uuid;
UPDATE creator.studio_reply_draft d SET thread_id=t.id FROM creator.thread t WHERE t.creator_id=d.creator_id AND t.fan_id=d.fan_id;
CREATE INDEX studio_draft_thread ON creator.studio_reply_draft(thread_id,account_id);
COMMIT;
