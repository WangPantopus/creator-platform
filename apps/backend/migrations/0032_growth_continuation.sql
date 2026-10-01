-- W7 continuation: additive delivery relay, voluntary entry and post-value choices.
-- Applied only to W7's fresh disposable environment; registry review precedes deployment.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.producer_relay (
  id uuid PRIMARY KEY,
  producer text NOT NULL CHECK(producer IN ('agent','conversation','commerce','content','calls','retention','trust')),
  creator_id uuid NOT NULL,
  envelope jsonb NOT NULL,
  envelope_hash text NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','consumed','blocked','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  error_code text,
  consumed_at timestamptz
);
CREATE INDEX producer_relay_due ON growth.producer_relay(available_at,id) WHERE state IN ('queued','leased');
CREATE TABLE growth.producer_cursor (producer text NOT NULL,scope_id uuid NOT NULL,creator_id uuid NOT NULL,cursor integer NOT NULL DEFAULT 0 CHECK(cursor>=0),PRIMARY KEY(producer,scope_id));
ALTER TABLE growth.producer_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.producer_cursor FORCE ROW LEVEL SECURITY;
CREATE POLICY cursor_worker ON growth.producer_cursor TO growth_worker USING(true) WITH CHECK(true);
CREATE TABLE growth.prompt_choice (
  account_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('install','return')),
  choice text NOT NULL DEFAULT 'eligible' CHECK(choice IN ('eligible','later','declined','accepted')),
  impressions integer NOT NULL DEFAULT 0 CHECK(impressions>=0),
  last_shown_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,kind)
);
CREATE TABLE growth.entry_attribution (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  source text NOT NULL CHECK(source IN ('creator_link','post','invite','share','search','direct')),
  object_id uuid,
  surface text NOT NULL CHECK(surface IN ('web','ios','android')),
  consented_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,id)
);
CREATE INDEX entry_attribution_creator ON growth.entry_attribution(creator_id,consented_at);
DROP POLICY creator_scope ON growth.invite;
CREATE POLICY creator_scope ON growth.invite TO growth_runtime
  USING(created_by=nullif(current_setting('app.account_id',true),'')::uuid)
  WITH CHECK(created_by=nullif(current_setting('app.account_id',true),'')::uuid AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
ALTER TABLE growth.experiment ADD COLUMN approved_document jsonb;
ALTER TABLE growth.experiment ADD COLUMN approval_reference text;
ALTER TABLE growth.experiment ADD COLUMN starts_at timestamptz;
ALTER TABLE growth.experiment ADD COLUMN ends_at timestamptz;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['prompt_choice','entry_attribution'] LOOP
    EXECUTE format('ALTER TABLE growth.%I ENABLE ROW LEVEL SECURITY',r);
    EXECUTE format('ALTER TABLE growth.%I FORCE ROW LEVEL SECURITY',r);
    EXECUTE format('CREATE POLICY actor_scope ON growth.%I TO growth_runtime USING (account_id=nullif(current_setting(''app.account_id'',true),'''')::uuid) WITH CHECK (account_id=nullif(current_setting(''app.account_id'',true),'''')::uuid)',r);
    EXECUTE format('CREATE POLICY worker_scope ON growth.%I TO growth_worker USING(true) WITH CHECK(true)',r);
  END LOOP;
END $$;
ALTER TABLE growth.producer_relay ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.producer_relay FORCE ROW LEVEL SECURITY;
CREATE POLICY relay_worker ON growth.producer_relay TO growth_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.prompt_choice,growth.entry_attribution TO growth_runtime,growth_worker;
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.producer_relay,growth.producer_cursor TO growth_worker;
COMMIT;
