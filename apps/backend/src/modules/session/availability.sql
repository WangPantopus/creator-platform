-- W6 additive migration proposal. W8 allocation/registry required before applying.
-- Do not modify the already-applied 0006 media/session schema.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.call_availability (
 creator_id uuid PRIMARY KEY REFERENCES creator.creator_profile(id),
 creator_account_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 time_zone text NOT NULL, windows jsonb NOT NULL CHECK(jsonb_typeof(windows)='array' AND jsonb_array_length(windows)<=64),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creator.call_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.call_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_read ON creator.call_availability FOR SELECT USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY owner_insert ON creator.call_availability FOR INSERT WITH CHECK(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND creator_account_id=nullif(current_setting('app.account_id',true),'')::uuid);
CREATE POLICY owner_update ON creator.call_availability FOR UPDATE USING(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND creator_account_id=nullif(current_setting('app.account_id',true),'')::uuid) WITH CHECK(creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND creator_account_id=nullif(current_setting('app.account_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON creator.call_availability TO creator_runtime;
COMMIT;
