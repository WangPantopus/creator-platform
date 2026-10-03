-- Held0083: durable W3 translation metadata only. No registry activation,
-- ThreadScope, generation row, source body, provider call or financial amount.
-- W1 owns separate111 acceptance/worker custody; W8 owns112 current negatives.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.translation_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL DEFAULT 'translation' CHECK(kind='translation'),
 thread_id uuid NOT NULL,
 creator_id uuid NOT NULL,
 fan_id uuid NOT NULL,
 source_message_id uuid NOT NULL,
 source_message_version integer NOT NULL CHECK(source_message_version>0),
 source_message_sequence integer NOT NULL CHECK(source_message_sequence>0),
 source_message_epoch integer NOT NULL CHECK(source_message_epoch>=0),
 source_hash text NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'),
 source_provenance text NOT NULL CHECK(source_provenance IN('creator_signed','team_authenticated')),
 source_author_kind text NOT NULL CHECK(source_author_kind IN('human_creator','approved_draft','human_broadcast','team')),
 source_author_account_id uuid NOT NULL,
 source_signed_act_id uuid REFERENCES creator.signed_act(id),
 source_signed_content_hash text,
 source_signed_act_type text,
 source_signed_subject_id uuid,
 source_approval_id uuid,
 target_language text NOT NULL CHECK(length(target_language) BETWEEN 2 AND 35
  AND target_language ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'
  AND target_language NOT IN('und','mul','zxx')),
 initiating_account_id uuid NOT NULL,
 initiating_session_id uuid NOT NULL,
 initiating_adult_verified_at timestamptz NOT NULL CHECK(isfinite(initiating_adult_verified_at)),
 acceptance_transaction xid8 NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(accepted_at)),
 acceptance_confirmed_at timestamptz CHECK(isfinite(acceptance_confirmed_at)),
 epoch integer NOT NULL CHECK(epoch>=0),
 context_revision integer NOT NULL CHECK(context_revision>=0),
 processor_consent_id uuid NOT NULL,
 processor_consent_version text NOT NULL CHECK(length(processor_consent_version) BETWEEN 1 AND 2000),
 translation_policy_version text NOT NULL CHECK(length(translation_policy_version) BETWEEN 1 AND 200),
 provider_policy_version text NOT NULL CHECK(length(provider_policy_version) BETWEEN 1 AND 2000),
 cost_policy_version text NOT NULL CHECK(length(cost_policy_version) BETWEEN 1 AND 200),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 request_key_hash text NOT NULL CHECK(request_key_hash ~ '^[0-9a-f]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','translating','delivered','failed','interrupted')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
 worker_token uuid,
 lease_until timestamptz CHECK(isfinite(lease_until)),
 completed_at timestamptz CHECK(isfinite(completed_at)),
 UNIQUE(initiating_account_id,request_key_hash),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id) ON DELETE CASCADE,
 FOREIGN KEY(source_message_id,thread_id,creator_id,fan_id) REFERENCES creator.message(id,thread_id,creator_id,fan_id) ON DELETE CASCADE,
 CHECK(expires_at>accepted_at AND initiating_adult_verified_at<=accepted_at),
 CHECK(acceptance_confirmed_at IS NULL OR
  (acceptance_confirmed_at>=accepted_at AND acceptance_confirmed_at<expires_at)),
 CHECK(state='queued' OR acceptance_confirmed_at IS NOT NULL),
 CHECK((state IN('delivered','failed','interrupted'))=(completed_at IS NOT NULL)),
 CHECK(completed_at IS NULL OR completed_at>=accepted_at),
 CHECK((worker_token IS NULL)=(lease_until IS NULL)),
 CHECK((state='translating')=(worker_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK(lease_until IS NULL OR (lease_until>accepted_at AND lease_until<=expires_at)),
 CHECK(
  (source_provenance='creator_signed' AND source_author_kind IN('human_creator','approved_draft','human_broadcast')
   AND source_signed_act_id IS NOT NULL AND source_signed_content_hash IS NOT NULL
   AND source_signed_content_hash ~ '^[0-9a-f]{64}$' AND source_signed_subject_id IS NOT NULL
   AND source_signed_act_type IS NOT NULL
   AND ((source_author_kind='human_creator' AND source_signed_act_type IN('reply','correction') AND source_approval_id IS NULL)
    OR (source_author_kind='approved_draft' AND source_signed_act_type='approved_draft' AND source_approval_id IS NOT NULL)
    OR (source_author_kind='human_broadcast' AND source_signed_act_type='broadcast' AND source_approval_id IS NULL)))
  OR (source_provenance='team_authenticated' AND source_author_kind='team'
   AND source_signed_act_id IS NULL AND source_signed_content_hash IS NULL
   AND source_signed_act_type IS NULL AND source_signed_subject_id IS NULL AND source_approval_id IS NULL)
 )
);
CREATE INDEX translation_job_pending ON creator.translation_job(accepted_at,id)
 WHERE acceptance_confirmed_at IS NOT NULL AND state IN('queued','translating');
CREATE INDEX translation_job_family ON creator.translation_job(thread_id,creator_id,fan_id,accepted_at,id);
CREATE INDEX translation_job_retention ON creator.translation_job(expires_at,id);
ALTER TABLE creator.translation_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.translation_job FORCE ROW LEVEL SECURITY;

-- Clear any inherited creator_owner default table ACL. No LOGIN, PUBLIC or
-- nonowner role receives access. There is deliberately no permissive policy.
-- Exact metadata column grants and private nonce predicates belong to the
-- reviewed111/112 and later fixed W2/W3/W4 consumers, never caller GUCs alone.
DO $$ DECLARE recipient oid; BEGIN
 FOR recipient IN SELECT DISTINCT a.grantee FROM pg_class c,
  LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='creator.translation_job'::regclass AND a.grantee<>c.relowner LOOP
  IF recipient=0 THEN REVOKE ALL ON creator.translation_job FROM PUBLIC;
  ELSE EXECUTE format('REVOKE ALL ON creator.translation_job FROM %I',pg_get_userbyid(recipient)); END IF;
 END LOOP;
END $$;
COMMIT;
