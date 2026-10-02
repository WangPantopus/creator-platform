-- Reserved0055 source proposal; W8 must review/register the exact final bytes.
-- Allocation custody is independent of personal-commitment payouts.
BEGIN;
SET LOCAL ROLE creator_owner;
-- Complete creator-only live slot counts without scanning every fan's history.
CREATE INDEX commerce_pass_creator_cycle ON creator.commerce_pass_slot(creator_id,cycle_start)
 WHERE state='active' AND grant_id IS NOT NULL;
CREATE TABLE creator.commerce_pool_cycle (
 cycle text PRIMARY KEY CHECK(cycle ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 pool_minor bigint NOT NULL CHECK(pool_minor BETWEEN 0 AND 9007199254740991),
 policy_version text NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 100),
 source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 200),
 snapshot_hash text NOT NULL CHECK(snapshot_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creator.commerce_pool_effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cycle text NOT NULL REFERENCES creator.commerce_pool_cycle(cycle),
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 allocation_cause text NOT NULL,
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 provider_key text NOT NULL UNIQUE CHECK(length(provider_key) BETWEEN 1 AND 200),
 source_transaction text NOT NULL CHECK(length(source_transaction) BETWEEN 1 AND 200),
 provider_ref text UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','processing','unknown','done','failed')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
 lease_until timestamptz,next_at timestamptz NOT NULL DEFAULT now(),
 error_code text,compensation_required boolean NOT NULL DEFAULT false,
 compensation_request jsonb CHECK(compensation_request IS NULL OR jsonb_typeof(compensation_request)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cycle,creator_id,source_transaction),
 CHECK(allocation_cause='pool:'||cycle||':'||creator_id::text),
 CHECK(provider_key=allocation_cause||':'||source_transaction),
 CHECK((request->>'cycle'=cycle AND request->>'creatorId'=creator_id::text
   AND request->>'snapshotHash' ~ '^[a-f0-9]{64}$'
   AND request->'transfer'->>'key'=provider_key
   AND request->'transfer'->>'sourceTransaction'=source_transaction
   AND source_transaction ~ '^ch_[A-Za-z0-9]+$'
   AND request->'transfer'->>'sourcePayment' ~ '^pi_[A-Za-z0-9]+$'
   AND request->'transfer'->>'destination' ~ '^acct_[A-Za-z0-9]+$'
   AND request->'transfer'->>'currency' ~ '^[A-Z]{3}$'
   AND (request->'transfer'->>'amount')::bigint BETWEEN 1 AND 9007199254740991) IS TRUE),
 CHECK(compensation_request IS NULL OR
   (compensation_required AND provider_ref IS NOT NULL
   AND compensation_request->>'reference'=provider_ref
   AND compensation_request->>'key'=provider_key||':reverse'
   AND compensation_request->>'createdAt' IS NOT NULL
   AND (compensation_request->>'amount')::bigint BETWEEN 1 AND (request->'transfer'->>'amount')::bigint) IS TRUE)
);
CREATE INDEX commerce_pool_ready ON creator.commerce_pool_effect(next_at,id)
 WHERE state IN('pending','processing','unknown');
ALTER TABLE creator.commerce_pool_cycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_pool_cycle FORCE ROW LEVEL SECURITY;
-- Only aggregate/hash metadata lives here. No fan identities, invoices or bodies.
CREATE POLICY pool_cycle_creator ON creator.commerce_pool_cycle
 USING(EXISTS(SELECT 1 FROM creator.creator_profile p WHERE p.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND p.verification='verified' AND NOT p.recovery_required))
 WITH CHECK(EXISTS(SELECT 1 FROM creator.creator_profile p WHERE p.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND p.verification='verified' AND NOT p.recovery_required));
ALTER TABLE creator.commerce_pool_effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_pool_effect FORCE ROW LEVEL SECURITY;
CREATE POLICY pool_effect_creator ON creator.commerce_pool_effect
 USING(creator.commerce_scope(creator_id,NULL)) WITH CHECK(creator.commerce_scope(creator_id,NULL)
   AND EXISTS(SELECT 1 FROM creator.commerce_pool_cycle c WHERE c.cycle=commerce_pool_effect.cycle
     AND c.snapshot_hash=commerce_pool_effect.request->>'snapshotHash'
     AND c.currency=commerce_pool_effect.request->'transfer'->>'currency'));
GRANT SELECT,INSERT ON creator.commerce_pool_cycle TO creator_runtime;
GRANT SELECT,INSERT,UPDATE ON creator.commerce_pool_effect TO creator_runtime;
CREATE TRIGGER commerce_pool_cycle_immutable BEFORE UPDATE OR DELETE ON creator.commerce_pool_cycle
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
CREATE FUNCTION creator.commerce_pool_effect_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Pool cash history is retained'; END IF;
 IF ROW(NEW.id,NEW.cycle,NEW.creator_id,NEW.allocation_cause,NEW.request,NEW.request_hash,NEW.provider_key,NEW.source_transaction,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.cycle,OLD.creator_id,OLD.allocation_cause,OLD.request,OLD.request_hash,OLD.provider_key,OLD.source_transaction,OLD.created_at)
   OR (OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref)
   OR (OLD.compensation_required AND NOT NEW.compensation_required)
   OR (OLD.compensation_request IS NOT NULL AND NEW.compensation_request IS DISTINCT FROM OLD.compensation_request)
   OR NEW.attempt<OLD.attempt THEN
   RAISE EXCEPTION 'Original pool request, provider cause and compensation are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_pool_effect_fence BEFORE UPDATE OR DELETE ON creator.commerce_pool_effect
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_pool_effect_fence();
COMMIT;
