-- W3 append-only producer proposal. W8 allocates the canonical version.
-- Apply only through an administrator to a leased database; runtime stays NOBYPASSRLS.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.thread ADD COLUMN off_the_record boolean NOT NULL DEFAULT false,
 ADD COLUMN intro_shared boolean NOT NULL DEFAULT false,
 ADD COLUMN memory_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN human_active_until timestamptz,
 ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN session_started_at timestamptz,
 ADD COLUMN last_reminder_at timestamptz;
ALTER TABLE creator.message ADD COLUMN citations uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN off_the_record boolean NOT NULL DEFAULT false,
 ADD COLUMN team_member text;
ALTER TABLE creator.generation ADD COLUMN reservation_id uuid,
 ADD COLUMN context_revision integer,
 ADD COLUMN accepted_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN first_visible_at timestamptz,
 ADD COLUMN completed_at timestamptz,
 ADD COLUMN lease_until timestamptz,
 ADD COLUMN worker_token uuid,
 ADD COLUMN failure_code text;
CREATE INDEX generation_pending ON creator.generation(creator_id,fan_id,accepted_at) WHERE state IN ('queued','generating');
CREATE INDEX memory_pair_kind ON creator.memory(creator_id,fan_id,kind,id);
CREATE TABLE creator.processor_consent (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 account_id uuid NOT NULL, version text NOT NULL, providers jsonb NOT NULL, consented_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.memory_consent (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 account_id uuid NOT NULL, item_id uuid NOT NULL, item_hash text NOT NULL, category text NOT NULL, consented_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
ALTER TABLE creator.memory DROP CONSTRAINT memory_check;
ALTER TABLE creator.memory ADD COLUMN state text NOT NULL DEFAULT 'remembered' CHECK(state IN ('proposed','remembered','resolved')),
 ADD COLUMN edited_by_fan boolean NOT NULL DEFAULT false,
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT memory_sensitive_consent CHECK(sensitive_category IS NULL OR state='proposed' OR consent_id IS NOT NULL),
 ADD CONSTRAINT memory_consent_ref FOREIGN KEY(consent_id) REFERENCES creator.memory_consent(id);
CREATE INDEX memory_semantic_item ON creator.memory(thread_id,semantic_key);
ALTER TABLE creator.memory_exclusion ADD COLUMN normalized_text text;
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['processor_consent','memory_consent'] LOOP
 predicate := 'creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid AND fan_id=nullif(current_setting(''app.fan_id'',true),'''')::uuid';
 EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY scope_read ON creator.%I FOR SELECT USING (%s)',relation,predicate);
 EXECUTE format('CREATE POLICY scope_write ON creator.%I FOR ALL USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',relation);
 END LOOP;
END $$;
CREATE TABLE creator.conversation_relationship (
 account_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,thread_id uuid PRIMARY KEY,
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
ALTER TABLE creator.conversation_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_relationship FORCE ROW LEVEL SECURITY;
CREATE POLICY account_scope ON creator.conversation_relationship USING(account_id=nullif(current_setting('app.account_id',true),'')::uuid) WITH CHECK(account_id=nullif(current_setting('app.account_id',true),'')::uuid);
GRANT SELECT,INSERT,DELETE ON creator.conversation_relationship TO creator_runtime;
COMMIT;
