-- Additive W5 reply review/read-state. Existing reply text is not presumed safe.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.content_reply ADD CONSTRAINT content_reply_scope UNIQUE(id,creator_id,fan_id);
CREATE TABLE creator.content_reply_review (
 reply_id uuid PRIMARY KEY, content_id uuid NOT NULL REFERENCES creator.content_index(id), creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 reply_version integer NOT NULL CHECK(reply_version>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','allowed','flagged')),
 review_ref text, text_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 FOREIGN KEY(reply_id,creator_id,fan_id) REFERENCES creator.content_reply(id,creator_id,fan_id) ON DELETE CASCADE,
 CHECK(state='pending' OR (review_ref IS NOT NULL AND length(review_ref) BETWEEN 1 AND 200))
);
-- Owner-only transactional backfill; FORCE RLS is restored before commit.
ALTER TABLE creator.content_reply NO FORCE ROW LEVEL SECURITY;
INSERT INTO creator.content_reply_review(reply_id,content_id,creator_id,fan_id,reply_version,text_hash,created_at,withdrawn_at)
 SELECT id,content_id,creator_id,fan_id,version,'legacy_pending',created_at,withdrawn_at FROM creator.content_reply;
ALTER TABLE creator.content_reply FORCE ROW LEVEL SECURITY;
CREATE INDEX content_reply_review_page ON creator.content_reply_review(creator_id,state,created_at DESC,reply_id DESC) WHERE withdrawn_at IS NULL;
ALTER TABLE creator.content_reply_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_reply_review FORCE ROW LEVEL SECURITY;
CREATE POLICY review_read ON creator.content_reply_review FOR SELECT USING(creator.commerce_scope(NULL,fan_id) OR creator.content_role(creator_id,ARRAY['triage']));
CREATE POLICY review_insert ON creator.content_reply_review FOR INSERT WITH CHECK(creator.commerce_scope(NULL,fan_id));
CREATE POLICY review_update ON creator.content_reply_review FOR UPDATE USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id));
DROP POLICY reply_read ON creator.content_reply;
CREATE POLICY reply_read ON creator.content_reply FOR SELECT USING(creator.commerce_scope(NULL,fan_id) OR (creator.content_role(creator_id,ARRAY['triage']) AND EXISTS(SELECT 1 FROM creator.content_reply_review r WHERE r.reply_id=content_reply.id AND r.state='allowed')));
CREATE TABLE creator.content_reply_read (
 reply_id uuid NOT NULL REFERENCES creator.content_reply_review(reply_id) ON DELETE CASCADE,
 creator_id uuid NOT NULL, account_id uuid NOT NULL, reply_version integer NOT NULL CHECK(reply_version>0), read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(reply_id,account_id)
);
ALTER TABLE creator.content_reply_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_reply_read FORCE ROW LEVEL SECURITY;
CREATE POLICY read_actor ON creator.content_reply_read USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid AND creator.content_role(creator_id,ARRAY['triage'])) WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid AND creator.content_role(creator_id,ARRAY['triage']) AND EXISTS(SELECT 1 FROM creator.content_reply_review r WHERE r.reply_id=content_reply_read.reply_id AND r.creator_id=content_reply_read.creator_id AND r.state<>'pending' AND r.withdrawn_at IS NULL));
GRANT SELECT,INSERT,UPDATE ON creator.content_reply_review,creator.content_reply_read TO creator_runtime;
COMMIT;
