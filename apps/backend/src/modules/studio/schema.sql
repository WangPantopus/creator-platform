BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.studio_reply_draft (
 creator_id uuid NOT NULL, fan_id uuid NOT NULL, account_id uuid NOT NULL,
 text text NOT NULL CHECK(length(text)<=20000), version integer NOT NULL CHECK(version>0),
 sent_message_id uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(creator_id,fan_id,account_id)
);
ALTER TABLE creator.studio_reply_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.studio_reply_draft FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_draft_actor ON creator.studio_reply_draft USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid AND creator.content_role(creator_id,ARRAY['triage'])) WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid AND creator.content_role(creator_id,ARRAY['triage']));
GRANT SELECT,INSERT,UPDATE ON creator.studio_reply_draft TO creator_runtime;
COMMIT;
