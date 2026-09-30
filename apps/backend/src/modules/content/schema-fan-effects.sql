BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.content_fan_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL,creator_id uuid NOT NULL,subject_id uuid NOT NULL,
 subject_kind text NOT NULL CHECK(subject_kind IN('reply','thanks')),version integer NOT NULL CHECK(version>0),
 type text NOT NULL CHECK(type IN('quote_changed','reply_withdrawn','thanks_changed')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done','blocked')),attempts integer NOT NULL DEFAULT 0,
 next_at timestamptz NOT NULL DEFAULT now(),lease_id uuid,lease_until timestamptz,last_error text,result_ref text,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subject_id,version,type)
);
CREATE INDEX content_fan_effect_pending ON creator.content_fan_effect(creator_id,next_at,id) WHERE state<>'done';
ALTER TABLE creator.content_fan_effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_fan_effect FORCE ROW LEVEL SECURITY;
CREATE POLICY fan_effect_read ON creator.content_fan_effect FOR SELECT USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid OR creator.content_role(creator_id,ARRAY['publisher']));
CREATE POLICY fan_effect_insert ON creator.content_fan_effect FOR INSERT WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid AND
 ((subject_kind='thanks' AND EXISTS(SELECT 1 FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.id=subject_id AND t.creator_id=content_fan_effect.creator_id AND f.account_id=content_fan_effect.account_id)) OR
 (subject_kind='reply' AND EXISTS(SELECT 1 FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=subject_id AND r.creator_id=content_fan_effect.creator_id AND f.account_id=content_fan_effect.account_id))));
CREATE POLICY fan_effect_update ON creator.content_fan_effect FOR UPDATE USING(creator.content_role(creator_id,ARRAY['publisher'])) WITH CHECK(creator.content_role(creator_id,ARRAY['publisher']));
GRANT SELECT,INSERT,UPDATE ON creator.content_fan_effect TO creator_runtime;
COMMIT;
