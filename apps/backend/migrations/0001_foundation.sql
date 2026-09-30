-- Apply using a migration administrator, never the interactive runtime role.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_owner') THEN CREATE ROLE creator_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_runtime') THEN CREATE ROLE creator_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS creator AUTHORIZATION creator_owner;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.schema_migration (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.creator_profile (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE, handle text NOT NULL UNIQUE, display_name text NOT NULL, verification text NOT NULL CHECK(verification IN ('pending','verified','revoked')), content_class text NOT NULL DEFAULT 'general' CHECK(content_class='general'));
CREATE TABLE creator.fan_profile (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE, handle text NOT NULL UNIQUE);
CREATE TABLE creator.team_membership (creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), account_id uuid NOT NULL, roles text[] NOT NULL, revoked_at timestamptz, PRIMARY KEY(creator_id,account_id), CHECK(roles <@ ARRAY['triage','drafter','publisher','scheduler']::text[]));
CREATE TABLE creator.thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
  control text NOT NULL DEFAULT 'ai_active' CHECK(control IN ('ai_active','human_active','ai_paused','closed','blocked')),
  control_epoch integer NOT NULL DEFAULT 0 CHECK(control_epoch>=0), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
  message_sequence integer NOT NULL DEFAULT 0, event_cursor integer NOT NULL DEFAULT 0,
  privacy_notice_at timestamptz NOT NULL, processor_consent_version text, deleted_at timestamptz,
  UNIQUE(creator_id,fan_id), UNIQUE(id,creator_id,fan_id)
);
CREATE TABLE creator.access_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), fan_id uuid NOT NULL REFERENCES creator.fan_profile(id),
  capabilities text[] NOT NULL, source text NOT NULL CHECK(source IN ('trial','membership','pass_slot','commitment','comp')),
  state text NOT NULL CHECK(state IN ('pending','active','expired','revoked')), valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL,
  allowance integer NOT NULL CHECK(allowance>=0), used integer NOT NULL DEFAULT 0 CHECK(used>=0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved>=0),
  CHECK(used+reserved<=allowance), CHECK(valid_until>valid_from), CHECK(source<>'pass_slot' OR capabilities <@ ARRAY['ai_message']::text[])
);
CREATE TABLE creator.passkey_credential (
  id text PRIMARY KEY, account_id uuid NOT NULL, public_key bytea NOT NULL, counter bigint NOT NULL DEFAULT 0, transports text[], revoked_at timestamptz
);
CREATE TABLE creator.signed_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
  act_type text NOT NULL CHECK(act_type IN ('reply','approved_draft','broadcast','reaction','accept','correction')), subject_id uuid NOT NULL,
  content_hash text NOT NULL, challenge text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE creator.signed_act (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, credential_id text NOT NULL REFERENCES creator.passkey_credential(id),
  creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), act_type text NOT NULL, subject_id uuid NOT NULL,
  content_hash text NOT NULL, challenge text NOT NULL UNIQUE, assertion jsonb NOT NULL, verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.signed_act_consumption (signed_act_id uuid PRIMARY KEY REFERENCES creator.signed_act(id), account_id uuid NOT NULL, consumed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
  author_kind text NOT NULL CHECK(author_kind IN ('fan','ai','approved_draft','human_creator','human_call','human_broadcast','human_reaction','team','system')),
  author_account_id uuid, text text NOT NULL, delivery_state text NOT NULL CHECK(delivery_state IN ('accepted','generating','delivered','failed','interrupted')),
  control_epoch integer NOT NULL, sequence integer NOT NULL, version integer NOT NULL DEFAULT 1, signed_act_id uuid REFERENCES creator.signed_act(id), signed_content_hash text,
  created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), UNIQUE(thread_id,sequence), UNIQUE(id,thread_id),
  CHECK(author_kind NOT IN ('human_creator','approved_draft','human_broadcast','human_reaction') OR signed_act_id IS NOT NULL), UNIQUE(signed_act_id)
);
CREATE TABLE creator.generation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
  fan_message_id uuid NOT NULL, ai_message_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES creator.access_grant(id),
  epoch integer NOT NULL, last_sequence integer NOT NULL DEFAULT 0, state text NOT NULL CHECK(state IN ('queued','generating','delivered','failed','interrupted')),
  FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), FOREIGN KEY(fan_message_id,thread_id) REFERENCES creator.message(id,thread_id), FOREIGN KEY(ai_message_id,thread_id) REFERENCES creator.message(id,thread_id)
);
CREATE TABLE creator.memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('fact','summary','open_loop')), text text NOT NULL, semantic_key text NOT NULL, provenance_message_id uuid NOT NULL,
  thread_revision_at_write integer NOT NULL, sensitive_category text, consent_id uuid,
  FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), FOREIGN KEY(provenance_message_id,thread_id) REFERENCES creator.message(id,thread_id),
  -- Sensitive extraction is disabled until scoped, per-item consent is implemented.
  CHECK(sensitive_category IS NULL AND consent_id IS NULL)
);
CREATE TABLE creator.memory_exclusion (
  thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL, semantic_key text NOT NULL,
  PRIMARY KEY(thread_id,semantic_key), FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.thread_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
  reader_account_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('creator','triage','ops')), read_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
  cursor integer NOT NULL, type text NOT NULL, payload jsonb NOT NULL, actor_account_id uuid NOT NULL, published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id), UNIQUE(thread_id,cursor)
);
CREATE INDEX event_unpublished ON creator.event(thread_id,cursor) WHERE published_at IS NULL;
CREATE TABLE creator.idempotency_key (
  actor_account_id uuid NOT NULL, operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_account_id,operation,key)
);
CREATE TABLE creator.webhook_inbox (
  provider text NOT NULL, event_id text NOT NULL, current_state_ref text NOT NULL, payload jsonb NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  PRIMARY KEY(provider,event_id)
);

-- Explicit, symmetric RLS: no scope yields no rows, for every operation.
DO $$ DECLARE relation text; predicate text; BEGIN
  FOREACH relation IN ARRAY ARRAY['thread','message','generation','memory','memory_exclusion','thread_audit','event','access_grant'] LOOP
    predicate := 'creator_id = nullif(current_setting(''app.creator_id'',true),'''')::uuid AND fan_id = nullif(current_setting(''app.fan_id'',true),'''')::uuid';
    EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY scope_read ON creator.%I FOR SELECT USING (%s)',relation,predicate);
    EXECUTE format('CREATE POLICY scope_insert ON creator.%I FOR INSERT WITH CHECK (%s)',relation,predicate);
    EXECUTE format('CREATE POLICY scope_update ON creator.%I FOR UPDATE USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
    EXECUTE format('CREATE POLICY scope_delete ON creator.%I FOR DELETE USING (%s)',relation,predicate);
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['passkey_credential','signed_challenge','signed_act','signed_act_consumption'] LOOP
    predicate := 'account_id = nullif(current_setting(''app.account_id'',true),'''')::uuid';
    EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY account_scope ON creator.%I USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
  END LOOP;
END $$;
ALTER TABLE creator.idempotency_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.idempotency_key FORCE ROW LEVEL SECURITY;
CREATE POLICY account_scope ON creator.idempotency_key USING(actor_account_id=nullif(current_setting('app.account_id',true),'')::uuid) WITH CHECK(actor_account_id=nullif(current_setting('app.account_id',true),'')::uuid);

CREATE FUNCTION creator.canonical_json(value jsonb) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE jsonb_typeof(value)
    WHEN 'object' THEN '{' || coalesce((SELECT string_agg(to_jsonb(key)::text || ':' || creator.canonical_json(val), ',' ORDER BY key COLLATE "C") FROM jsonb_each(value) AS pairs(key,val)), '') || '}'
    WHEN 'array' THEN '[' || coalesce((SELECT string_agg(creator.canonical_json(val), ',' ORDER BY ordinal) FROM jsonb_array_elements(value) WITH ORDINALITY AS items(val,ordinal)), '') || ']'
    ELSE value::text END;
$$;
CREATE FUNCTION creator.require_signed_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE signing creator.signed_act; owner_account uuid; BEGIN
  IF NEW.author_kind IN ('human_creator','approved_draft','human_broadcast','human_reaction') THEN
    SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id;
    SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
    IF signing.id IS NULL OR signing.account_id IS DISTINCT FROM owner_account OR NEW.author_account_id IS DISTINCT FROM owner_account
      OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR signing.subject_id IS DISTINCT FROM NEW.thread_id
      OR signing.content_hash IS DISTINCT FROM NEW.signed_content_hash
      OR signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(jsonb_build_object('actType',signing.act_type,'subjectId',NEW.thread_id::text,'content',jsonb_build_object('text',NEW.text))), 'sha256'), 'hex')
      OR signing.act_type IS DISTINCT FROM (CASE NEW.author_kind WHEN 'human_creator' THEN 'reply' WHEN 'human_broadcast' THEN 'broadcast' WHEN 'human_reaction' THEN 'reaction' ELSE 'approved_draft' END) THEN
      RAISE EXCEPTION 'A named act requires an exact creator-signed assertion' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_signed_message BEFORE INSERT OR UPDATE ON creator.message FOR EACH ROW EXECUTE FUNCTION creator.require_signed_message();
GRANT USAGE ON SCHEMA creator TO creator_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA creator TO creator_runtime;
GRANT INSERT, UPDATE, DELETE ON creator.thread,creator.message,creator.generation,creator.memory,creator.memory_exclusion,creator.access_grant TO creator_runtime;
GRANT INSERT ON creator.thread_audit,creator.signed_act,creator.signed_act_consumption,creator.idempotency_key TO creator_runtime;
GRANT INSERT, UPDATE ON creator.event,creator.webhook_inbox,creator.signed_challenge,creator.passkey_credential TO creator_runtime;
INSERT INTO creator.schema_migration(version) VALUES('0001_foundation');
COMMIT;
