BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.content_consent_history (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, creator_id uuid NOT NULL, subject_id uuid NOT NULL,
 version integer NOT NULL, text_hash text NOT NULL, envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_consent_actor ON creator.content_consent_history(account_id,creator_id,created_at,id);
ALTER TABLE creator.content_consent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_consent_history FORCE ROW LEVEL SECURITY;
CREATE POLICY content_consent_actor ON creator.content_consent_history FOR SELECT USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
CREATE POLICY content_consent_insert ON creator.content_consent_history FOR INSERT WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
GRANT SELECT,INSERT ON creator.content_consent_history TO creator_runtime;
COMMIT;
