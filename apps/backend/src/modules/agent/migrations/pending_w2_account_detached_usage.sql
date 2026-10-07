-- Held additive accounting detachment. Original usage and privacy sources stay
-- immutable. Only the original actual account-delete transaction may transfer
-- already-disposed, still-retained known usage. No identity or private text is
-- copied. This source alone does not register its caller or privacy catalogue.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_usage_detachment') THEN
  CREATE ROLE creator_usage_detachment NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_usage_detachment'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members WHERE to_regrole('creator_usage_detachment') IN(member,roleid))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_usage_detachment'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=to_regrole('creator_usage_detachment')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated accounting detachment owner required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_usage_detachment;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_usage_detachment;
RESET ROLE;

CREATE FUNCTION creator_trust.account_detached_usage_registered(v text,h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user IN('creator_runtime','creator_trust_worker') AND current_user='creator_usage_detachment'
  AND v ~ '^[0-9]{4}_w2_account_detached_usage$' AND h ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=v AND checksum=h)
$$;
ALTER FUNCTION creator_trust.account_detached_usage_registered(text,text) OWNER TO creator_usage_detachment;
REVOKE ALL ON FUNCTION creator_trust.account_detached_usage_registered(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.account_detached_usage_registered(text,text) TO creator_runtime,creator_trust_worker;

-- A fixed boolean projection from the original locked scope. Neither the new
-- purpose nor the runtime receives SELECT on private task/scope metadata.
CREATE FUNCTION creator_trust.usage_account_delete_bound(c uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_runtime' AND current_user='creator_privacy_fence'
  AND current_setting('transaction_isolation')='read committed'
  AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
  AND EXISTS(SELECT FROM creator_trust.privacy_commit_scope s
   WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
    AND s.domain='agent' AND s.binding->>'kind'='delete' AND s.binding->>'scope'='account'
    AND s.binding->>'account_id'=nullif(current_setting('app.account_id',true),'')
    AND c=nullif(current_setting('app.creator_id',true),'')::uuid
    AND (s.binding->'owned_creator_ids') ? c::text
    AND (s.binding->>'lease_until')::timestamptz>clock_timestamp())
$$;
ALTER FUNCTION creator_trust.usage_account_delete_bound(uuid) OWNER TO creator_privacy_fence;
REVOKE ALL ON FUNCTION creator_trust.usage_account_delete_bound(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.usage_account_delete_bound(uuid) TO creator_usage_detachment;

SET LOCAL ROLE creator_trust_owner;
CREATE TABLE creator_trust.detached_usage (
 id uuid PRIMARY KEY,
 provider text NOT NULL,model text NOT NULL,input_tokens integer NOT NULL CHECK(input_tokens>=0),
 output_tokens integer NOT NULL CHECK(output_tokens>=0),cached_input_tokens integer CHECK(cached_input_tokens>=0),
 cache_write_input_tokens integer CHECK(cache_write_input_tokens>=0),cost_micros bigint NOT NULL CHECK(cost_micros>=0),
 category text NOT NULL,purpose text,duration_ms integer NOT NULL CHECK(duration_ms>=0),
 created_at timestamptz NOT NULL CHECK(isfinite(created_at)),completed_at timestamptz,provider_state text,
 accounting_retained_until timestamptz NOT NULL CHECK(isfinite(accounting_retained_until)),
 accounting_retention_version text NOT NULL CHECK(accounting_retention_version='w8-product-retention-20261007-v2'),
 accounting_disposition_reference text NOT NULL CHECK(accounting_disposition_reference ~ '^[a-f0-9]{64}$'),
 detached_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(accounting_retained_until>=created_at),
 CHECK(coalesce(cached_input_tokens,0)::bigint+coalesce(cache_write_input_tokens,0)::bigint<=input_tokens::bigint),
 CHECK((provider_state IS NULL AND completed_at IS NULL) OR (provider_state='completed' AND completed_at IS NOT NULL))
);
CREATE INDEX detached_usage_due ON creator_trust.detached_usage(accounting_retained_until,id);
CREATE TABLE creator_trust.detached_usage_expiry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),policy_version text NOT NULL,
 original_due_at timestamptz NOT NULL,expired_ids uuid[] NOT NULL,completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(policy_version='w8-product-retention-20261007-v2' AND isfinite(original_due_at)),
 CHECK(cardinality(expired_ids) BETWEEN 1 AND 2000 AND array_position(expired_ids,NULL) IS NULL)
);
-- Aggregate-only deletion receipt. It has no usage IDs or account/creator IDs
-- and stores no link to an individual retained cost. The digest lets the same
-- genuinely authorized deletion recover its counts after an uncertain COMMIT.
CREATE TABLE creator_trust.detached_usage_summary (
 creator_digest text PRIMARY KEY CHECK(creator_digest ~ '^[a-f0-9]{64}$'),
 records bigint NOT NULL CHECK(records>0),
 original_until timestamptz NOT NULL CHECK(isfinite(original_until))
);
CREATE INDEX detached_usage_summary_due ON creator_trust.detached_usage_summary(original_until,creator_digest);
ALTER TABLE creator_trust.detached_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.detached_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.detached_usage_expiry ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.detached_usage_expiry FORCE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.detached_usage_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.detached_usage_summary FORCE ROW LEVEL SECURITY;
CREATE POLICY detachment_private ON creator_trust.detached_usage TO creator_usage_detachment USING(true) WITH CHECK(true);
CREATE POLICY detachment_private ON creator_trust.detached_usage_expiry TO creator_usage_detachment USING(true) WITH CHECK(true);
CREATE POLICY detachment_private ON creator_trust.detached_usage_summary TO creator_usage_detachment USING(true) WITH CHECK(true);
RESET ROLE;
ALTER TABLE creator_trust.detached_usage OWNER TO creator_usage_detachment;
ALTER TABLE creator_trust.detached_usage_expiry OWNER TO creator_usage_detachment;
ALTER TABLE creator_trust.detached_usage_summary OWNER TO creator_usage_detachment;
REVOKE ALL ON creator_trust.detached_usage,creator_trust.detached_usage_expiry,creator_trust.detached_usage_summary FROM PUBLIC,creator_runtime,creator_trust_runtime,creator_trust_worker;

CREATE FUNCTION creator_trust.capture_account_detached_usage()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior creator_trust.detached_usage%ROWTYPE;
BEGIN
 IF TG_OP<>'DELETE' OR TG_TABLE_SCHEMA<>'creator' OR TG_TABLE_NAME<>'ai_usage'
  OR current_user<>'creator_usage_detachment'
 THEN RAISE EXCEPTION 'Original usage deletion required' USING ERRCODE='42501'; END IF;
 IF OLD.accounting_retained_until IS NULL THEN RETURN OLD; END IF;
 IF OLD.cost_micros IS NULL THEN
  RAISE EXCEPTION 'Unresolved retained accounting requires reconciliation' USING ERRCODE='23514';
 END IF;
 -- The original expiry purpose or family purge owns an already due erasure.
 IF OLD.accounting_retained_until<=clock_timestamp() THEN RETURN OLD; END IF;
 IF NOT creator_trust.usage_account_delete_bound(OLD.creator_id)
  OR OLD.accounting_retention_version IS DISTINCT FROM 'w8-product-retention-20261007-v2'
  OR OLD.thread_id IS NOT NULL OR OLD.fan_id IS NOT NULL OR OLD.generation_id IS NOT NULL
  OR OLD.attempt_id IS NOT NULL OR OLD.call_ordinal IS NOT NULL OR OLD.creator_hold_id IS NOT NULL
 THEN RAISE EXCEPTION 'Current account erasure and original disposition required' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM creator_trust.detached_usage WHERE id=OLD.id;
 IF FOUND THEN
  IF ROW(prior.provider,prior.model,prior.input_tokens,prior.output_tokens,prior.cached_input_tokens,
    prior.cache_write_input_tokens,prior.cost_micros,prior.category,prior.purpose,prior.duration_ms,
    prior.created_at,prior.completed_at,prior.provider_state,prior.accounting_retained_until,
    prior.accounting_retention_version,prior.accounting_disposition_reference)
   IS DISTINCT FROM ROW(OLD.provider,OLD.model,OLD.input_tokens,OLD.output_tokens,OLD.cached_input_tokens,
    OLD.cache_write_input_tokens,OLD.cost_micros,OLD.category,OLD.purpose,OLD.duration_ms,
    OLD.created_at,OLD.completed_at,OLD.provider_state,OLD.accounting_retained_until,
    OLD.accounting_retention_version,OLD.accounting_disposition_reference)
  THEN RAISE EXCEPTION 'Original detached accounting changed' USING ERRCODE='23514'; END IF;
 ELSE
  INSERT INTO creator_trust.detached_usage(id,provider,model,input_tokens,output_tokens,cached_input_tokens,
   cache_write_input_tokens,cost_micros,category,purpose,duration_ms,created_at,completed_at,provider_state,
   accounting_retained_until,accounting_retention_version,accounting_disposition_reference)
  VALUES(OLD.id,OLD.provider,OLD.model,OLD.input_tokens,OLD.output_tokens,OLD.cached_input_tokens,
   OLD.cache_write_input_tokens,OLD.cost_micros,OLD.category,OLD.purpose,OLD.duration_ms,OLD.created_at,
   OLD.completed_at,OLD.provider_state,OLD.accounting_retained_until,OLD.accounting_retention_version,OLD.accounting_disposition_reference);
  INSERT INTO creator_trust.detached_usage_summary(creator_digest,records,original_until)
  VALUES(encode(sha256(convert_to(OLD.creator_id::text,'UTF8')),'hex'),1,OLD.accounting_retained_until)
  ON CONFLICT(creator_digest) DO UPDATE SET records=creator_trust.detached_usage_summary.records+1,
   original_until=greatest(creator_trust.detached_usage_summary.original_until,EXCLUDED.original_until);
 END IF;
 RETURN OLD;
END $$;

CREATE FUNCTION creator_trust.account_detached_usage_summary(c uuid)
RETURNS TABLE(records text,original_until text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'creator_usage_detachment' OR NOT creator_trust.usage_account_delete_bound(c)
 THEN RAISE EXCEPTION 'Original account deletion scope required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.records::text,s.original_until::text FROM creator_trust.detached_usage_summary s
  WHERE s.creator_digest=encode(sha256(convert_to(c::text,'UTF8')),'hex') AND s.original_until>clock_timestamp();
END $$;

-- Fully database-local bounded expiry. The real DELETE and its ID receipt use
-- one transaction; no externally held lease or caller-selected IDs/dates.
CREATE FUNCTION creator_trust.expire_detached_usage(n integer)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE expired integer;
BEGIN
 IF session_user<>'creator_trust_worker' OR current_user<>'creator_usage_detachment'
  OR current_setting('transaction_isolation')<>'read committed' OR n IS NULL OR n<1 OR n>2000
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Original accounting expiry worker required' USING ERRCODE='42501'; END IF;
 WITH due AS (
  SELECT id FROM creator_trust.detached_usage WHERE accounting_retained_until<=clock_timestamp()
   ORDER BY accounting_retained_until,id LIMIT n FOR UPDATE SKIP LOCKED
 ), erased AS (
  DELETE FROM creator_trust.detached_usage u USING due WHERE u.id=due.id
   RETURNING u.id,u.accounting_retained_until
 ), receipt AS (
  INSERT INTO creator_trust.detached_usage_expiry(policy_version,original_due_at,expired_ids)
  SELECT 'w8-product-retention-20261007-v2',min(accounting_retained_until),array_agg(id ORDER BY id)
   FROM erased HAVING count(*)>0 RETURNING cardinality(expired_ids) AS n
 ) SELECT coalesce(sum(receipt.n),0)::integer INTO expired FROM receipt;
 WITH due AS (
  SELECT creator_digest FROM creator_trust.detached_usage_summary WHERE original_until<=clock_timestamp()
   ORDER BY original_until,creator_digest LIMIT n FOR UPDATE SKIP LOCKED
 ) DELETE FROM creator_trust.detached_usage_summary s USING due WHERE s.creator_digest=due.creator_digest;
 RETURN expired;
END $$;
CREATE TRIGGER account_detached_usage AFTER DELETE ON creator.ai_usage
 FOR EACH ROW EXECUTE FUNCTION creator_trust.capture_account_detached_usage();
ALTER FUNCTION creator_trust.capture_account_detached_usage() OWNER TO creator_usage_detachment;
ALTER FUNCTION creator_trust.expire_detached_usage(integer) OWNER TO creator_usage_detachment;
ALTER FUNCTION creator_trust.account_detached_usage_summary(uuid) OWNER TO creator_usage_detachment;
REVOKE ALL ON FUNCTION creator_trust.capture_account_detached_usage(),creator_trust.expire_detached_usage(integer),creator_trust.account_detached_usage_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.expire_detached_usage(integer) TO creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.account_detached_usage_summary(uuid) TO creator_runtime;
COMMIT;
