-- W8 reservation 0048_w2_usage_lineage; W2-owned accounting only.
-- Existing usage/cache evidence is deliberately not backfilled.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.ai_generation_admission (
  creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
  generation_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  fan_id uuid NOT NULL,
  actor_account_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','sealed')),
  retention_policy_version text NOT NULL CHECK (length(retention_policy_version) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  sealed_at timestamptz,
  PRIMARY KEY (creator_id,generation_id),
  UNIQUE (creator_id,generation_id,thread_id,fan_id),
  CHECK ((state='open' AND sealed_at IS NULL) OR (state='sealed' AND sealed_at IS NOT NULL))
);

CREATE TABLE creator.ai_generation_attempt (
  creator_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  fan_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','sealed','abandoned')),
  provider_admissions integer NOT NULL DEFAULT 0 CHECK (provider_admissions>=0),
  creator_hold_id uuid NOT NULL REFERENCES creator.ai_cost_hold(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  PRIMARY KEY (creator_id,generation_id,attempt_id),
  UNIQUE (creator_id,generation_id,attempt_id,thread_id,fan_id),
  FOREIGN KEY (creator_id,generation_id,thread_id,fan_id)
    REFERENCES creator.ai_generation_admission(creator_id,generation_id,thread_id,fan_id),
  CHECK ((state='open' AND closed_at IS NULL) OR (state<>'open' AND closed_at IS NOT NULL))
);

ALTER TABLE creator.ai_usage
  ADD COLUMN cached_input_tokens integer CHECK (cached_input_tokens>=0),
  ADD COLUMN cache_write_input_tokens integer CHECK (cache_write_input_tokens>=0),
  ADD COLUMN creator_hold_id uuid REFERENCES creator.ai_cost_hold(id),
  ADD COLUMN thread_id uuid,
  ADD COLUMN fan_id uuid,
  ADD COLUMN generation_id uuid,
  ADD COLUMN attempt_id uuid,
  ADD COLUMN call_ordinal integer CHECK (call_ordinal>0),
  ADD COLUMN purpose text CHECK (length(purpose) BETWEEN 1 AND 80),
  ADD COLUMN provider_state text CHECK (provider_state IN ('admitted','completed')),
  ADD COLUMN completed_at timestamptz,
  ADD CONSTRAINT ai_usage_cache_subset CHECK (
    coalesce(cached_input_tokens,0)::bigint+coalesce(cache_write_input_tokens,0)::bigint<=input_tokens::bigint
  ),
  ADD CONSTRAINT ai_usage_attempt_binding CHECK (
    (thread_id IS NULL AND fan_id IS NULL AND generation_id IS NULL AND attempt_id IS NULL AND call_ordinal IS NULL)
    OR (thread_id IS NOT NULL AND fan_id IS NOT NULL AND generation_id IS NOT NULL AND attempt_id IS NOT NULL AND call_ordinal IS NOT NULL AND purpose IS NOT NULL AND provider_state IS NOT NULL)
  ),
  ADD CONSTRAINT ai_usage_completion CHECK (
    (provider_state IS NULL AND completed_at IS NULL)
    OR (provider_state='admitted' AND completed_at IS NULL AND cost_micros IS NULL)
    OR (provider_state='completed' AND completed_at IS NOT NULL)
  ),
  ADD CONSTRAINT ai_usage_attempt_fk FOREIGN KEY (creator_id,generation_id,attempt_id,thread_id,fan_id)
    REFERENCES creator.ai_generation_attempt(creator_id,generation_id,attempt_id,thread_id,fan_id);
CREATE UNIQUE INDEX ai_usage_attempt_ordinal ON creator.ai_usage(creator_id,generation_id,attempt_id,call_ordinal)
  WHERE generation_id IS NOT NULL;

CREATE TABLE creator.ai_generation_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  generation_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  fan_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('known','unknown','no_request')),
  cost_micros bigint,
  usage_ids uuid[] NOT NULL,
  attempt_ids uuid[] NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  receipt_hash text NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (creator_id,generation_id,thread_id,fan_id)
    REFERENCES creator.ai_generation_admission(creator_id,generation_id,thread_id,fan_id),
  UNIQUE (creator_id,generation_id,receipt_hash),
  UNIQUE (creator_id,generation_id,revision),
  CHECK ((state='unknown' AND cost_micros IS NULL)
    OR (state='known' AND cost_micros>=0 AND cardinality(usage_ids)>0)
    OR (state='no_request' AND cost_micros=0 AND cardinality(usage_ids)=0))
);
CREATE INDEX ai_generation_receipt_current ON creator.ai_generation_receipt(creator_id,generation_id,revision DESC);

CREATE FUNCTION creator.ai_generation_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Generation receipts are immutable; append a reconciled receipt instead';
END $$;
CREATE TRIGGER ai_generation_receipt_immutable BEFORE UPDATE ON creator.ai_generation_receipt
  FOR EACH ROW EXECUTE FUNCTION creator.ai_generation_receipt_immutable();

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['ai_generation_admission','ai_generation_attempt','ai_generation_receipt'] LOOP
    EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY creator_scope ON creator.%I USING (creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid) WITH CHECK (creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid)',relation);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='creator_runtime') THEN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON creator.%I TO creator_runtime',relation);
    END IF;
  END LOOP;
END $$;

-- UUID lineage is not permission to retain thread-linked accounting forever.
-- Prepared activation and C10 hooks require the host's reviewed retention policy.
COMMIT;
