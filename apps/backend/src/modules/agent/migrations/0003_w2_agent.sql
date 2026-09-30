-- W2 proposed domain migration. W8 must allocate shared registry order before integration.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.ai_workspace (
 creator_id uuid PRIMARY KEY REFERENCES creator.creator_profile(id), revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 configuration jsonb NOT NULL, interview jsonb NOT NULL DEFAULT '{"story":"","boundaries":"","audioConsent":false}',
 current_status jsonb, live_version_id uuid, paused boolean NOT NULL DEFAULT true, deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.ai_source (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), revision integer NOT NULL DEFAULT 1,
 title text NOT NULL, origin text NOT NULL, origin_reference text, audience jsonb NOT NULL, rights_evidence text NOT NULL,
 expires_at timestamptz, state text NOT NULL CHECK(state IN ('candidate','processing','failed','approved','revoked')),
 index_state text NOT NULL DEFAULT 'pending' CHECK(index_state IN ('pending','ready','failed')), progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 error text, content_hash text NOT NULL, text_content text NOT NULL, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,creator_id), UNIQUE(creator_id,content_hash)
);
CREATE TABLE creator.ai_chunk (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL, source_id uuid NOT NULL, source_revision integer NOT NULL,
 ordinal integer NOT NULL, passage text NOT NULL, start_offset integer NOT NULL, end_offset integer NOT NULL, embedding vector,
 embedding_model text, FOREIGN KEY(source_id,creator_id) REFERENCES creator.ai_source(id,creator_id) ON DELETE CASCADE,
 UNIQUE(source_id,source_revision,ordinal), CHECK(end_offset>start_offset)
);
CREATE INDEX ai_chunk_scoped ON creator.ai_chunk(creator_id,source_id,source_revision);
CREATE TABLE creator.ai_ingestion (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL, source_id uuid NOT NULL, source_revision integer NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','completed','failed','cancelled')), attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(source_id,creator_id) REFERENCES creator.ai_source(id,creator_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ai_ingestion_active ON creator.ai_ingestion(source_id,source_revision) WHERE state IN ('queued','running');
CREATE TABLE creator.ai_evaluation (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), revision integer NOT NULL,
 fingerprint text NOT NULL, state text NOT NULL CHECK(state IN ('running','passed','failed')), cases jsonb NOT NULL DEFAULT '[]',
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(id,creator_id)
);
CREATE TABLE creator.ai_version (
 id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), number integer NOT NULL,
 state text NOT NULL CHECK(state IN ('live','paused','retired')), configuration jsonb NOT NULL, compiled_prefix text NOT NULL,
 compiled_hash text NOT NULL, source_set jsonb NOT NULL, pipeline_hash text NOT NULL, evaluation_id uuid NOT NULL,
 changes text NOT NULL, published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(creator_id,number), UNIQUE(id,creator_id),
 FOREIGN KEY(evaluation_id,creator_id) REFERENCES creator.ai_evaluation(id,creator_id)
);
CREATE UNIQUE INDEX ai_one_live ON creator.ai_version(creator_id) WHERE state='live';
ALTER TABLE creator.ai_workspace ADD FOREIGN KEY(live_version_id,creator_id) REFERENCES creator.ai_version(id,creator_id);
CREATE TABLE creator.ai_license (creator_id uuid PRIMARY KEY REFERENCES creator.creator_profile(id), document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.ai_sponsor (id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), brand text NOT NULL, aliases text[] NOT NULL, expires_at timestamptz NOT NULL, active boolean NOT NULL, UNIQUE(creator_id,brand));
CREATE TABLE creator.ai_regression (id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), paraphrased_prompt text NOT NULL, rule text NOT NULL, unacceptable_answer text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE creator.ai_event (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), type text NOT NULL, revision integer NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz);
CREATE INDEX ai_event_pending ON creator.ai_event(creator_id,created_at) WHERE published_at IS NULL;
CREATE TABLE creator.ai_usage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), version_hash text NOT NULL, provider text NOT NULL, model text NOT NULL, input_tokens integer NOT NULL, output_tokens integer NOT NULL, cost_micros bigint, category text NOT NULL, duration_ms integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_usage_day ON creator.ai_usage(creator_id,created_at);
CREATE TABLE creator.ai_command (creator_id uuid NOT NULL REFERENCES creator.creator_profile(id), account_id uuid NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(creator_id,account_id,key));
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['ai_workspace','ai_source','ai_chunk','ai_ingestion','ai_evaluation','ai_version','ai_license','ai_sponsor','ai_regression','ai_event','ai_usage','ai_command'] LOOP
  predicate := 'creator_id = nullif(current_setting(''app.creator_id'',true),'''')::uuid';
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY creator_scope ON creator.%I USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',relation);
 END LOOP;
END $$;
INSERT INTO creator.schema_migration(version) VALUES('0003_w2_agent');
COMMIT;
