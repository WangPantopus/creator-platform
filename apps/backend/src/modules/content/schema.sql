-- W5 reserved producer 0005. Append after current history on upgrade; never insert before applied IDs.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE FUNCTION creator.content_role(c uuid, allowed text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=c AND cp.verification='verified' AND NOT cp.recovery_required AND
 (cp.account_id=nullif(current_setting('app.account_id',true),'')::uuid OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=c AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND tm.revoked_at IS NULL AND tm.roles && allowed)))
$$;
CREATE TABLE creator.content_index (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 state text NOT NULL CHECK(state IN('draft','scheduled','published','unpublished','archived')),
 version integer NOT NULL CHECK(version>0), audience jsonb NOT NULL, kind text NOT NULL,
 published_at timestamptz, scheduled_at timestamptz, withdrawn_at timestamptz,
 quote_reply_id uuid, quote_consent_version integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_creator_page ON creator.content_index(creator_id,id);
CREATE INDEX content_schedule_due ON creator.content_index(scheduled_at,id) WHERE state='scheduled';
CREATE TABLE creator.content_revision (
 content_id uuid NOT NULL REFERENCES creator.content_index(id), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), version integer NOT NULL,
 document jsonb NOT NULL, author_account_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(content_id,version)
);
CREATE TABLE creator.content_publication (
 content_id uuid NOT NULL, creator_id uuid NOT NULL, version integer NOT NULL, signed_act_id uuid UNIQUE REFERENCES creator.signed_act(id),
 author_kind text NOT NULL CHECK(author_kind IN('human_broadcast','human_creator','team')), author_account_id uuid NOT NULL,
 author_label text NOT NULL, quoted_text text, quoted_handle text, published_at timestamptz,
 PRIMARY KEY(content_id,version), FOREIGN KEY(content_id,version) REFERENCES creator.content_revision(content_id,version),
 CHECK(author_kind='team' OR signed_act_id IS NOT NULL)
);
CREATE TABLE creator.content_reply (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES creator.content_index(id), creator_id uuid NOT NULL,
 fan_id uuid NOT NULL REFERENCES creator.fan_profile(id), text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz
);
CREATE INDEX content_reply_page ON creator.content_reply(creator_id,created_at DESC,id DESC);
CREATE TABLE creator.content_quote_permission (
 reply_id uuid PRIMARY KEY REFERENCES creator.content_reply(id), share_text boolean NOT NULL DEFAULT false,
 show_handle boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CHECK(NOT show_handle OR share_text)
);
CREATE TABLE creator.content_reaction (
 reply_id uuid PRIMARY KEY REFERENCES creator.content_reply(id), creator_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('heart','thanks','helpful')), signed_act_id uuid NOT NULL UNIQUE REFERENCES creator.signed_act(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.content_preference (
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), account_id uuid NOT NULL, muted boolean NOT NULL,
 PRIMARY KEY(creator_id,account_id)
);
CREATE TABLE creator.content_thanks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
 target_kind text NOT NULL CHECK(target_kind IN('content','message')), target_id uuid NOT NULL,
 text text NOT NULL DEFAULT '' CHECK(length(text)<=2000), share_digest boolean NOT NULL DEFAULT false, show_identity boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, withdrawn_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(fan_id,target_kind,target_id),
 CHECK(NOT show_identity OR share_digest)
);
CREATE TABLE creator.content_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, content_id uuid NOT NULL, version integer NOT NULL,
 type text NOT NULL CHECK(type IN('published','withdrawn','source_candidate','source_revoke','reaction','thanks_changed','correction')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done','blocked')), attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(), result_ref text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(content_id,version,type)
);
CREATE TABLE creator.content_tombstone (account_id uuid PRIMARY KEY, job_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE creator.content_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_index FORCE ROW LEVEL SECURITY;
-- Index contains no title, text, identity, media URL or private fan disclosure.
CREATE POLICY index_read ON creator.content_index FOR SELECT USING(true);
CREATE POLICY index_insert ON creator.content_index FOR INSERT WITH CHECK(creator.content_role(creator_id,ARRAY['drafter','publisher']));
CREATE POLICY index_update ON creator.content_index FOR UPDATE USING(creator.content_role(creator_id,ARRAY['drafter','publisher'])) WITH CHECK(creator.content_role(creator_id,ARRAY['drafter','publisher']));
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['content_revision','content_publication'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',r);
  EXECUTE format('CREATE POLICY content_read ON creator.%I FOR SELECT USING(creator.content_role(creator_id,ARRAY[''triage'',''drafter'',''publisher'',''scheduler'']) OR content_id=nullif(current_setting(''app.content_id'',true),'''')::uuid)',r);
  EXECUTE format('CREATE POLICY content_insert ON creator.%I FOR INSERT WITH CHECK(creator.content_role(creator_id,ARRAY[''drafter'',''publisher'']))',r);
 END LOOP;
END $$;
ALTER TABLE creator.content_publication ENABLE ROW LEVEL SECURITY;
CREATE POLICY publication_update ON creator.content_publication FOR UPDATE USING(creator.content_role(creator_id,ARRAY['publisher'])) WITH CHECK(creator.content_role(creator_id,ARRAY['publisher']));
ALTER TABLE creator.content_reply ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_reply FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_read ON creator.content_reply FOR SELECT USING(creator.content_role(creator_id,ARRAY['triage']) OR creator.commerce_scope(NULL,fan_id));
CREATE POLICY reply_insert ON creator.content_reply FOR INSERT WITH CHECK(creator.commerce_scope(NULL,fan_id) AND content_id=nullif(current_setting('app.content_id',true),'')::uuid);
CREATE POLICY reply_update ON creator.content_reply FOR UPDATE USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id));
ALTER TABLE creator.content_quote_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_quote_permission FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_status ON creator.content_quote_permission FOR SELECT USING(true);
CREATE POLICY permission_insert ON creator.content_quote_permission FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM creator.content_reply r WHERE r.id=reply_id AND creator.commerce_scope(NULL,r.fan_id)));
CREATE POLICY permission_update ON creator.content_quote_permission FOR UPDATE USING(EXISTS(SELECT 1 FROM creator.content_reply r WHERE r.id=reply_id AND creator.commerce_scope(NULL,r.fan_id))) WITH CHECK(EXISTS(SELECT 1 FROM creator.content_reply r WHERE r.id=reply_id AND creator.commerce_scope(NULL,r.fan_id)));
ALTER TABLE creator.content_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_reaction FORCE ROW LEVEL SECURITY;
CREATE POLICY reaction_read ON creator.content_reaction FOR SELECT USING(EXISTS(SELECT 1 FROM creator.content_reply r WHERE r.id=reply_id));
CREATE POLICY reaction_insert ON creator.content_reaction FOR INSERT WITH CHECK(creator.content_role(creator_id,ARRAY[]::text[]));
ALTER TABLE creator.content_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_preference FORCE ROW LEVEL SECURITY;
CREATE POLICY preference_actor ON creator.content_preference USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid) WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
ALTER TABLE creator.content_thanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_thanks FORCE ROW LEVEL SECURITY;
CREATE POLICY thanks_read ON creator.content_thanks FOR SELECT USING(creator.commerce_scope(NULL,fan_id) OR (creator.content_role(creator_id,ARRAY[]::text[]) AND share_digest AND withdrawn_at IS NULL));
CREATE POLICY thanks_insert ON creator.content_thanks FOR INSERT WITH CHECK(creator.commerce_scope(NULL,fan_id));
CREATE POLICY thanks_update ON creator.content_thanks FOR UPDATE USING(creator.commerce_scope(NULL,fan_id)) WITH CHECK(creator.commerce_scope(NULL,fan_id));
ALTER TABLE creator.content_effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_effect FORCE ROW LEVEL SECURITY;
CREATE POLICY effect_scope ON creator.content_effect USING(creator.content_role(creator_id,ARRAY['publisher'])) WITH CHECK(creator.content_role(creator_id,ARRAY['publisher']));
ALTER TABLE creator.content_tombstone ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_tombstone FORCE ROW LEVEL SECURITY;
CREATE POLICY tombstone_actor ON creator.content_tombstone USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid) WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON creator.content_index,creator.content_publication,creator.content_reply,creator.content_quote_permission,creator.content_preference,creator.content_thanks,creator.content_effect TO creator_runtime;
GRANT SELECT,INSERT ON creator.content_revision,creator.content_reaction,creator.content_tombstone TO creator_runtime;
COMMIT;
