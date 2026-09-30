-- W3 additive proposal; W8 assigns canonical ordering after the conversation proposal.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.conversation_presence (
 thread_id uuid PRIMARY KEY, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 last_at timestamptz NOT NULL, until_at timestamptz NOT NULL,
 continuous_seconds double precision NOT NULL DEFAULT 0 CHECK(continuous_seconds>=0),
 reminder_seconds double precision NOT NULL DEFAULT 0 CHECK(reminder_seconds>=0),
 last_companion boolean NOT NULL DEFAULT false,
 daily_signal_day date,
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.conversation_usage_day (
 thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL, day date NOT NULL,
 seconds double precision NOT NULL DEFAULT 0 CHECK(seconds BETWEEN 0 AND 86400),
 companion_seconds double precision NOT NULL DEFAULT 0 CHECK(companion_seconds BETWEEN 0 AND seconds),
 PRIMARY KEY(thread_id,day),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.conversation_presence_client (
 thread_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL, client_id uuid NOT NULL, until_at timestamptz NOT NULL,
 PRIMARY KEY(thread_id,client_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['conversation_presence','conversation_usage_day','conversation_presence_client'] LOOP
 predicate := 'creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid AND fan_id=nullif(current_setting(''app.fan_id'',true),'''')::uuid';
 EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
 EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
 EXECUTE format('CREATE POLICY scope_read ON creator.%I FOR SELECT USING (%s)',relation,predicate);
 EXECUTE format('CREATE POLICY scope_write ON creator.%I FOR ALL USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',relation);
 END LOOP;
END $$;
COMMIT;
