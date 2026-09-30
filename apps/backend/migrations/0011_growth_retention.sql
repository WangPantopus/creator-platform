-- W7 follow-on migration. Register after 0007_growth; no peer schema changes.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.impact (creator_id uuid NOT NULL, window_start date NOT NULL, unique_fans integer NOT NULL CHECK(unique_fans>=0), ai_conversations integer NOT NULL CHECK(ai_conversations>=0), personal_replies integer NOT NULL CHECK(personal_replies>=0), notes integer NOT NULL CHECK(notes>=0), thanks_count integer NOT NULL CHECK(thanks_count>=0), consented_thanks jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(creator_id,window_start));
ALTER TABLE growth.impact ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.impact FORCE ROW LEVEL SECURITY;
CREATE POLICY creator_scope ON growth.impact TO growth_runtime USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY etl_scope ON growth.impact TO growth_worker USING(true) WITH CHECK(true);
CREATE TABLE growth.activation_job (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, creator_account_id uuid NOT NULL, agent_version integer NOT NULL, due_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','sent','blocked')), lease_until timestamptz, UNIQUE(creator_id,agent_version));
CREATE TABLE growth.instagram_reply (creator_id uuid NOT NULL, comment_id text NOT NULL, context_id uuid NOT NULL, received_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','expired','unknown','blocked')), provider_ref text, PRIMARY KEY(creator_id,comment_id));
CREATE TABLE growth.experiment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, hypothesis text NOT NULL, success_criterion text NOT NULL, stop_criterion text NOT NULL, approved_at timestamptz, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','stopped','complete')));
GRANT SELECT ON growth.impact TO growth_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.impact,growth.activation_job,growth.instagram_reply,growth.experiment TO growth_worker;
COMMIT;
