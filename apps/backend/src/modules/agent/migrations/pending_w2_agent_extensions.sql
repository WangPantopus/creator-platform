-- Additive W2 extension after 0003_w2_agent. W8 must allocate an ID and replace
-- the pending ledger value before shared application. Exact isolated bytes are
-- archived as 0003_w2_agent_extensions; do not reapply them to the isolated DB.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.ai_style_embedding(creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),example_id uuid NOT NULL,text_hash text NOT NULL,embedding vector NOT NULL,model text NOT NULL,PRIMARY KEY(creator_id,example_id,text_hash,model));
CREATE TABLE creator.ai_cost_hold(id uuid PRIMARY KEY,creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),amount_micros bigint NOT NULL CHECK(amount_micros>=0),state text NOT NULL CHECK(state IN ('held','settled','released')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_cost_active ON creator.ai_cost_hold(creator_id,expires_at) WHERE state='held';
CREATE TABLE creator.ai_shadow_sample(id uuid PRIMARY KEY,creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),paraphrased_prompt text NOT NULL,sanitizer_reference text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
CREATE TABLE creator.ai_shadow_evaluation(id uuid PRIMARY KEY,creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),fingerprint text NOT NULL,live_version_id uuid NOT NULL,results jsonb NOT NULL,state text NOT NULL CHECK(state IN ('passed','failed')),created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['ai_style_embedding','ai_cost_hold','ai_shadow_sample','ai_shadow_evaluation'] LOOP
  predicate := 'creator_id = nullif(current_setting(''app.creator_id'',true),'''')::uuid';
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY creator_scope ON creator.%I USING (%s) WITH CHECK (%s)',relation,predicate,predicate);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',relation);
 END LOOP;
END $$;
INSERT INTO creator.schema_migration(version) VALUES('PENDING_W8_w2_agent_extensions');
COMMIT;
