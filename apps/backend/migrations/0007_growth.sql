-- W7-owned additive namespace. W8 registry reservation: 0007_growth.
-- Apply with migration administrator; runtime/ETL/delivery roles remain non-owner.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='growth_owner') THEN CREATE ROLE growth_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='growth_runtime') THEN CREATE ROLE growth_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='growth_worker') THEN CREATE ROLE growth_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA growth AUTHORIZATION growth_owner;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.creator_public (id uuid PRIMARY KEY, version integer NOT NULL CHECK(version>0), handle text UNIQUE NOT NULL, state text NOT NULL CHECK(state IN ('published','paused','unpublished','revoked')), document jsonb NOT NULL, updated_at timestamptz NOT NULL);
CREATE INDEX creator_public_state ON growth.creator_public(state,handle);
CREATE TABLE growth.content_public (id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES growth.creator_public(id), version integer NOT NULL, state text NOT NULL CHECK(state IN ('published','withdrawn')), document jsonb NOT NULL, published_at timestamptz NOT NULL);
CREATE INDEX content_public_creator ON growth.content_public(creator_id,published_at DESC);
CREATE TABLE growth.follow (account_id uuid NOT NULL, creator_id uuid NOT NULL REFERENCES growth.creator_public(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,creator_id));
CREATE TABLE growth.preference (account_id uuid PRIMARY KEY, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE growth.event_inbox (id uuid PRIMARY KEY, envelope jsonb NOT NULL, envelope_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE growth.notification (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES growth.event_inbox(id), account_id uuid NOT NULL, creator_id uuid NOT NULL, role text NOT NULL, type text NOT NULL, sender text NOT NULL, preview text NOT NULL, destination text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id,account_id));
CREATE INDEX notification_account ON growth.notification(account_id,created_at DESC,id);
CREATE TABLE growth.delivery (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES growth.notification(id), account_id uuid NOT NULL, channel text NOT NULL CHECK(channel IN ('push','email')), state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','sent','suppressed','dead')), attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_id uuid, provider_ref text, last_error text, UNIQUE(notification_id,channel));
CREATE INDEX delivery_due ON growth.delivery(available_at) WHERE state IN ('queued','leased');
CREATE TABLE growth.device (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, installation_id uuid NOT NULL, platform text NOT NULL CHECK(platform IN ('ios','android')), token_hash text UNIQUE NOT NULL, encrypted_token text NOT NULL, permission text NOT NULL CHECK(permission IN ('granted','denied')), revoked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,installation_id));
CREATE TABLE growth.email (account_id uuid PRIMARY KEY, encrypted_address text NOT NULL, verified_at timestamptz NOT NULL, bounced_at timestamptz, unsubscribed_at timestamptz, unsubscribe_hash text UNIQUE NOT NULL);
CREATE TABLE growth.share (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, grant_id uuid NOT NULL, source_version integer NOT NULL, source jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(grant_id,source_version));
CREATE TABLE growth.invite (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES growth.creator_public(id), created_by uuid NOT NULL, context_id uuid REFERENCES growth.content_public(id), expires_at timestamptz NOT NULL, revoked_at timestamptz, campaign text NOT NULL CHECK(campaign IN ('creator_launch','voluntary_invite')));
CREATE TABLE growth.metric (id uuid PRIMARY KEY, account_id uuid NOT NULL, actor_key text NOT NULL, creator_id uuid NOT NULL, type text NOT NULL, document jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX metric_creator ON growth.metric(creator_id,occurred_at,type);
CREATE TABLE growth.insight_signal (id uuid PRIMARY KEY, creator_id uuid NOT NULL, fan_key text NOT NULL, subject_key text NOT NULL, topic_key text NOT NULL, window_start date NOT NULL, unresolved boolean NOT NULL, UNIQUE(creator_id,fan_key,topic_key,window_start));
CREATE TABLE growth.insight_snapshot (creator_id uuid NOT NULL, window_start date NOT NULL, topic_key text NOT NULL, fan_count integer NOT NULL CHECK(fan_count>=5), question_count integer NOT NULL CHECK(question_count>=5), PRIMARY KEY(creator_id,window_start,topic_key));
CREATE TABLE growth.recommendation (creator_id uuid NOT NULL, window_start date NOT NULL, topic_key text NOT NULL, decision text NOT NULL CHECK(decision IN ('accept','edit','defer','dismiss')), outline text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(creator_id,window_start,topic_key));
CREATE TABLE growth.feedback (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, category text NOT NULL CHECK(category IN ('discovery_fit','usefulness','notification','departure')), score integer CHECK(score BETWEEN 1 AND 5), created_at timestamptz NOT NULL DEFAULT now());
-- Actor-scoped rows. Worker can read dispatch data but cannot turn off FORCE RLS.
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['follow','preference','notification','device','email','share','metric','feedback'] LOOP
  EXECUTE format('ALTER TABLE growth.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('ALTER TABLE growth.%I FORCE ROW LEVEL SECURITY',r);
  EXECUTE format('CREATE POLICY actor_scope ON growth.%I TO growth_runtime USING (account_id=nullif(current_setting(''app.account_id'',true),'''')::uuid) WITH CHECK (account_id=nullif(current_setting(''app.account_id'',true),'''')::uuid)',r);
  EXECUTE format('CREATE POLICY delivery_scope ON growth.%I TO growth_worker USING (true) WITH CHECK (true)',r);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['insight_snapshot','recommendation'] LOOP
  EXECUTE format('ALTER TABLE growth.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('ALTER TABLE growth.%I FORCE ROW LEVEL SECURITY',r);
  EXECUTE format('CREATE POLICY creator_scope ON growth.%I TO growth_runtime USING (creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid) WITH CHECK (creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid)',r);
  EXECUTE format('CREATE POLICY etl_scope ON growth.%I TO growth_worker USING (true) WITH CHECK (true)',r);
 END LOOP;
END $$;
ALTER TABLE growth.invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.invite FORCE ROW LEVEL SECURITY;
CREATE POLICY creator_scope ON growth.invite TO growth_runtime USING(created_by=nullif(current_setting('app.account_id',true),'')::uuid AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid) WITH CHECK(created_by=nullif(current_setting('app.account_id',true),'')::uuid AND creator_id=nullif(current_setting('app.creator_id',true),'')::uuid);
CREATE POLICY dispatch_scope ON growth.invite TO growth_worker USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA growth TO growth_runtime,growth_worker;
GRANT SELECT ON growth.creator_public,growth.content_public TO growth_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.follow,growth.preference,growth.device TO growth_runtime;
GRANT SELECT,UPDATE ON growth.notification TO growth_runtime;
GRANT SELECT,INSERT ON growth.share,growth.metric,growth.feedback TO growth_runtime;
GRANT SELECT ON growth.insight_snapshot TO growth_runtime;
GRANT SELECT,INSERT,UPDATE ON growth.recommendation TO growth_runtime;
GRANT SELECT,INSERT,UPDATE ON growth.invite TO growth_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA growth TO growth_worker;
-- Immutable exported source. Corrections/revocations are fetched from canonical owner.
CREATE FUNCTION growth.immutable_share() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Share artifacts are immutable'; END $$;
CREATE TRIGGER immutable_share BEFORE UPDATE ON growth.share FOR EACH ROW EXECUTE FUNCTION growth.immutable_share();
COMMIT;
