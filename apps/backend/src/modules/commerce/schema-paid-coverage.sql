-- Reserved0068_w4_paid_coverage. W8 owns registration and exact-byte activation.
-- Access expiry, grace, original purchase age and spend never prove paid tenure.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.commerce_membership ADD CONSTRAINT commerce_membership_paid_pair UNIQUE(id,creator_id,fan_id,provider);
CREATE TABLE creator.commerce_paid_coverage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL,fan_id uuid NOT NULL,membership_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN('apple','google')),
 proof_reference text NOT NULL CHECK(length(proof_reference) BETWEEN 1 AND 200),
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL CHECK(period_end>period_start),
 qualification text NOT NULL CHECK(qualification IN('apple_signed_positive_price','google_processed_positive_total')),
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[a-f0-9]{64}$'),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 observed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(membership_id,creator_id,fan_id,provider) REFERENCES creator.commerce_membership(id,creator_id,fan_id,provider),
 UNIQUE(provider,proof_reference),
 CHECK((provider='apple' AND qualification='apple_signed_positive_price') OR
       (provider='google' AND qualification='google_processed_positive_total'))
);
CREATE INDEX commerce_paid_coverage_pair ON creator.commerce_paid_coverage(creator_id,fan_id,period_start,period_end);
CREATE TABLE creator.commerce_paid_coverage_denial (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creator_id uuid NOT NULL,fan_id uuid NOT NULL,membership_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN('apple','google')),
 proof_reference text NOT NULL CHECK(length(proof_reference) BETWEEN 1 AND 200),
 reason text NOT NULL CHECK(reason IN('refund','revoked','unpaid','unconfirmed')),
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[a-f0-9]{64}$'),
 retention_policy_version text NOT NULL CHECK(length(retention_policy_version) BETWEEN 1 AND 200),
 observed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(membership_id,creator_id,fan_id,provider) REFERENCES creator.commerce_membership(id,creator_id,fan_id,provider),
 UNIQUE(provider,proof_reference,reason,proof_hash)
);
CREATE INDEX commerce_paid_coverage_denied ON creator.commerce_paid_coverage_denial(provider,proof_reference);
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_paid_coverage','commerce_paid_coverage_denial'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY paid_coverage_read ON creator.%I FOR SELECT USING(creator.commerce_scope(creator_id,fan_id))',relation);
  -- Only the actual purchase-owning fan can append verified provider observations.
  EXECUTE format('CREATE POLICY paid_coverage_write ON creator.%I FOR INSERT WITH CHECK(creator.commerce_scope(NULL,fan_id))',relation);
  EXECUTE format('CREATE TRIGGER paid_coverage_immutable BEFORE UPDATE OR DELETE ON creator.%I FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable()',relation);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON creator.commerce_paid_coverage,creator.commerce_paid_coverage_denial TO creator_runtime;
-- Count-only advisory metadata; this role cannot log in or issue audience rights.
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_commerce_count') THEN
  CREATE ROLE creator_commerce_count NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_commerce_count' AND
   (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe commerce count metadata role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_commerce_count;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_commerce_count;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_commerce_count;
GRANT SELECT(id,creator_id,fan_id,provider,tier_id,state,period_start,period_end,grace_end,grant_id) ON creator.commerce_membership TO creator_commerce_count;
GRANT SELECT(id,creator_id) ON creator.commerce_tier TO creator_commerce_count;
GRANT SELECT(id,creator_id,fan_id,membership_id,invoice_ref,line_ref,paid_minor,currency,period_start) ON creator.commerce_membership_receipt TO creator_commerce_count;
GRANT SELECT(creator_id,fan_id,currency,kind,cause,amount,refs,provider_ref) ON creator.commerce_ledger TO creator_commerce_count;
GRANT SELECT(membership_id,creator_id,fan_id,provider,proof_reference,period_start) ON creator.commerce_paid_coverage TO creator_commerce_count;
GRANT SELECT(provider,proof_reference,reason) ON creator.commerce_paid_coverage_denial TO creator_commerce_count;
GRANT SELECT(id,creator_id,fan_id,source,state,valid_from,valid_until) ON creator.access_grant TO creator_commerce_count;
GRANT SELECT(account_id,creator_id,revoked_at) ON creator_trust.block,creator_trust.restriction TO creator_commerce_count;
GRANT SELECT(account_id,scope,creator_id,job_id) ON creator_trust.tombstone TO creator_commerce_count;
GRANT SELECT(id,owned_creator_ids) ON creator_trust.privacy_job TO creator_commerce_count;
SET LOCAL ROLE creator_owner;
CREATE INDEX commerce_membership_creator_audience ON creator.commerce_membership(creator_id,fan_id,tier_id)
 WHERE state IN('active','grace','cancelled') AND grant_id IS NOT NULL;
CREATE POLICY commerce_count_metadata ON creator.access_grant FOR SELECT TO creator_commerce_count
 USING(creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid
   AND creator.commerce_scope(creator_id,NULL));
RESET ROLE;
-- The migration administrator creates these cross-schema policies; their
-- tables remain owned by creator_trust_owner. No extra trust-owner grants.
CREATE POLICY commerce_count_metadata ON creator_trust.block FOR SELECT TO creator_commerce_count
 USING(creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid);
CREATE POLICY commerce_count_metadata ON creator_trust.restriction FOR SELECT TO creator_commerce_count
 USING(creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid
   OR account_id=nullif(current_setting('app.account_id',true),'')::uuid
   OR EXISTS(SELECT 1 FROM creator.commerce_membership m JOIN creator.fan_profile f ON f.id=m.fan_id
     WHERE m.creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid AND f.account_id=restriction.account_id));
CREATE POLICY commerce_count_metadata ON creator_trust.privacy_job FOR SELECT TO creator_commerce_count
 USING(nullif(current_setting('commerce.count_creator_id',true),'')::uuid=ANY(owned_creator_ids));
CREATE POLICY commerce_count_metadata ON creator_trust.tombstone FOR SELECT TO creator_commerce_count
 USING(creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid
   OR account_id=nullif(current_setting('app.account_id',true),'')::uuid
   OR EXISTS(SELECT 1 FROM creator.commerce_membership m JOIN creator.fan_profile f ON f.id=m.fan_id
     WHERE m.creator_id=nullif(current_setting('commerce.count_creator_id',true),'')::uuid AND f.account_id=tombstone.account_id)
   OR EXISTS(SELECT 1 FROM creator_trust.privacy_job j WHERE j.id=tombstone.job_id
     AND nullif(current_setting('commerce.count_creator_id',true),'')::uuid=ANY(j.owned_creator_ids)));
RESET ROLE;
SET LOCAL ROLE creator_owner;
CREATE FUNCTION creator.commerce_paid_audience_count(c uuid,tiers uuid[])
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_account uuid; prior text; result bigint;
BEGIN
 IF tiers IS NOT NULL AND (cardinality(tiers)<1 OR cardinality(tiers)>50 OR array_position(tiers,NULL) IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid tier count projection';
 END IF;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c
  AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
  AND verification='verified' AND NOT recovery_required;
 IF NOT FOUND THEN RETURN NULL; END IF;
 prior := current_setting('commerce.count_creator_id',true);
 PERFORM set_config('commerce.count_creator_id',c::text,true);
 -- One advisory snapshot. No fan locks are acquired after the held creator key,
 -- and this aggregate never authorizes a publication, read or recipient.
 WITH eligible AS (
 SELECT m.id,m.creator_id,m.fan_id,m.provider,m.period_start
 FROM creator.commerce_membership m JOIN creator.fan_profile f ON f.id=m.fan_id
 JOIN creator.commerce_tier tier ON tier.id=m.tier_id AND tier.creator_id=m.creator_id
 JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
 WHERE m.creator_id=c AND (tiers IS NULL OR m.tier_id=ANY(tiers))
  AND m.state IN('active','grace','cancelled') AND m.period_start<=now()
  AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>now()
  AND g.source='membership' AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now()
  AND NOT EXISTS(SELECT 1 FROM creator_trust.block b WHERE b.account_id=f.account_id AND b.creator_id=c AND b.revoked_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM creator_trust.restriction r WHERE r.revoked_at IS NULL
    AND (r.account_id IN(f.account_id,owner_account) OR r.creator_id=c))
  AND NOT EXISTS(SELECT 1 FROM creator_trust.tombstone t WHERE t.account_id IN(f.account_id,owner_account)
    AND (t.scope='account' OR (t.creator_id=c AND t.scope='creator')))
  AND NOT EXISTS(SELECT 1 FROM creator_trust.tombstone t JOIN creator_trust.privacy_job j ON j.id=t.job_id
    WHERE t.scope='account' AND c=ANY(j.owned_creator_ids))
 ), proved AS (
 SELECT e.fan_id,CASE WHEN e.provider='stripe' THEN EXISTS(
  SELECT 1 FROM creator.commerce_membership_receipt r WHERE r.membership_id=e.id
   AND r.creator_id=e.creator_id AND r.fan_id=e.fan_id AND r.period_start=e.period_start AND r.paid_minor>0
   AND EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.creator_id=r.creator_id AND l.fan_id=r.fan_id
     AND l.currency=r.currency AND l.kind='capture' AND l.cause='invoice_line:'||r.line_ref AND l.amount=r.paid_minor
     AND l.refs->>'membershipId'=r.membership_id::text AND l.refs->>'invoiceId'=r.invoice_ref)
   AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.creator_id=r.creator_id AND l.fan_id=r.fan_id
     AND l.currency=r.currency AND l.kind='refund' AND l.amount>0 AND l.refs->>'membershipId'=r.membership_id::text
     AND l.refs->>'invoiceId'=r.invoice_ref AND l.cause='credit_note:'||l.provider_ref||':'||r.line_ref)
   AND NOT creator.commerce_paid_receipt_refund_held(r.id)
 ) ELSE EXISTS(
  SELECT 1 FROM creator.commerce_paid_coverage p WHERE p.membership_id=e.id AND p.creator_id=e.creator_id
   AND p.fan_id=e.fan_id AND p.provider=e.provider AND p.period_start=e.period_start
   AND NOT EXISTS(SELECT 1 FROM creator.commerce_paid_coverage_denial d WHERE d.provider=p.provider AND d.proof_reference=p.proof_reference
     AND d.reason IN('refund','revoked','unpaid'))
 ) END AS paid FROM eligible e
 )
 SELECT CASE WHEN coalesce(bool_and(paid),true) THEN count(DISTINCT fan_id) ELSE NULL END INTO result FROM proved;
 PERFORM set_config('commerce.count_creator_id',coalesce(prior,''),true);
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_paid_audience_count(uuid,uuid[]) OWNER TO creator_commerce_count;
REVOKE ALL ON FUNCTION creator.commerce_paid_audience_count(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_paid_audience_count(uuid,uuid[]) TO creator_runtime;
-- Boolean-only pending-refund projection for this fan/current creator. It
-- closes the fan-only billing-effect RLS gap without impersonating the fan.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_commerce_tenure') THEN
  CREATE ROLE creator_commerce_tenure NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_commerce_tenure' AND
   (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe commerce tenure metadata role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_commerce_tenure;
GRANT SELECT(id,account_id,verification) ON creator.creator_profile TO creator_commerce_tenure;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_commerce_tenure;
GRANT SELECT(id,creator_id,fan_id,membership_id,invoice_ref,line_ref) ON creator.commerce_membership_receipt TO creator_commerce_tenure;
GRANT SELECT(fan_id,operation,state,request) ON creator.commerce_billing_effect TO creator_commerce_tenure;
SET LOCAL ROLE creator_owner;
CREATE POLICY tenure_refund_metadata ON creator.commerce_billing_effect FOR SELECT TO creator_commerce_tenure
 USING(EXISTS(SELECT 1 FROM creator.commerce_membership_receipt r
   WHERE r.fan_id=commerce_billing_effect.fan_id AND creator.commerce_scope(r.creator_id,r.fan_id)
     AND coalesce(commerce_billing_effect.request->>'membershipId',commerce_billing_effect.request->'receipt'->>'membership_id')=r.membership_id::text
     AND commerce_billing_effect.request->'receipt'->>'line_ref'=r.line_ref
     AND commerce_billing_effect.request->'receipt'->>'invoice_ref'=r.invoice_ref));
CREATE FUNCTION creator.commerce_paid_receipt_refund_held(receipt uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bound creator.commerce_membership_receipt;
BEGIN
 SELECT id,creator_id,fan_id,membership_id,invoice_ref,line_ref INTO
  bound.id,bound.creator_id,bound.fan_id,bound.membership_id,bound.invoice_ref,bound.line_ref
  FROM creator.commerce_membership_receipt WHERE id=receipt
   AND creator.commerce_scope(creator_id,fan_id);
 IF NOT FOUND THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM creator.commerce_billing_effect e
  WHERE e.fan_id=bound.fan_id AND e.state IN('pending','processing','unknown','done')
   AND (e.operation='refund' OR (e.operation='cancel' AND e.request->>'atEnd'='false'))
   AND coalesce(e.request->>'membershipId',e.request->'receipt'->>'membership_id')=bound.membership_id::text
   AND e.request->'receipt'->>'line_ref'=bound.line_ref
   AND e.request->'receipt'->>'invoice_ref'=bound.invoice_ref);
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_paid_receipt_refund_held(uuid) OWNER TO creator_commerce_tenure;
REVOKE ALL ON FUNCTION creator.commerce_paid_receipt_refund_held(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_paid_receipt_refund_held(uuid) TO creator_runtime,creator_commerce_count;
COMMIT;
