-- Lane 5 Q2 default. Pending: the integrator registers this after the earlier
-- migration PR. Apply only to the lane's disposable database until then.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.creator_profile_fields (
  creator_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  version integer NOT NULL CHECK(version > 0),
  biography text NOT NULL DEFAULT '' CHECK(char_length(biography) <= 600),
  category text NOT NULL DEFAULT '' CHECK(char_length(category) <= 60),
  photo_caption text NOT NULL DEFAULT '' CHECK(char_length(photo_caption) <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE growth.creator_profile_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.creator_profile_fields FORCE ROW LEVEL SECURITY;
-- These three fields are public words, not draft/private profile content.
CREATE POLICY public_words ON growth.creator_profile_fields FOR SELECT
  TO growth_runtime USING(true);
CREATE POLICY creator_insert ON growth.creator_profile_fields FOR INSERT
  TO growth_runtime WITH CHECK(
    account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY creator_update ON growth.creator_profile_fields FOR UPDATE
  TO growth_runtime USING(
    account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid)
  WITH CHECK(
    account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY erasure_worker ON growth.creator_profile_fields FOR ALL
  TO growth_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON growth.creator_profile_fields TO growth_runtime;
GRANT SELECT,DELETE ON growth.creator_profile_fields TO growth_worker;
COMMIT;
