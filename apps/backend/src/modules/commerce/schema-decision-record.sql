-- Lane 4, the founder's decision 5 (taken as the proposed default on
-- 2026-10-16). Additive, unregistered proposal: please allocate and register it.
-- "{name} usually decides in {range}" from the creator's decision record, read
-- as one aggregate. Each outcome is timed from when the hold landed: an accept
-- or a decline at the moment the creator made it (the capture or release the
-- decision queued), an expiry at its deadline. Withdrawals are the fan's, and a
-- release before the deadline (an ops pause, a lapsed hold) is not a decision.
-- Only the middle half of the last 90 days' outcomes is returned, and only when
-- there are at least five: no request, fan, count, price or text.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_decision_read') THEN
  CREATE ROLE creator_commerce_decision_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_decision_read' AND
  (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe decision record role';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_commerce_decision_read;
GRANT SELECT(id,creator_id,state,submitted_at,decision_at,authorization_attempt) ON creator.commerce_packet TO creator_commerce_decision_read;
GRANT SELECT(creator_id,packet_id,provider_key,created_at) ON creator.commerce_effect TO creator_commerce_decision_read;
-- The existing invoker policies (commerce_scope) evaluate these columns.
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_commerce_decision_read;
GRANT SELECT(id,account_id,verification) ON creator.creator_profile TO creator_commerce_decision_read;
-- Bound to the one creator the function is asked about. Only the function sets
-- the setting, and it restores it before returning; a setting alone grants
-- nothing to any other role.
CREATE POLICY decision_record ON creator.commerce_packet FOR SELECT TO creator_commerce_decision_read
 USING(creator_id=nullif(current_setting('app.w4_decision_creator',true),'')::uuid AND submitted_at IS NOT NULL);
CREATE POLICY decision_record ON creator.commerce_effect FOR SELECT TO creator_commerce_decision_read
 USING(creator_id=nullif(current_setting('app.w4_decision_creator',true),'')::uuid AND provider_key ~ ':(capture|release):[0-9]+$');

CREATE FUNCTION creator.commerce_decision_range(c uuid)
RETURNS TABLE(low_seconds double precision, high_seconds double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_context text=current_setting('app.w4_decision_creator',true);
BEGIN
 PERFORM set_config('app.w4_decision_creator',coalesce(c::text,''),true);
 RETURN QUERY
 WITH outcome AS (
  SELECT extract(epoch FROM decided.at-packet.submitted_at)::double precision AS waited
  FROM creator.commerce_packet packet
  CROSS JOIN LATERAL (SELECT CASE
    WHEN packet.state='accepted' THEN (SELECT e.created_at FROM creator.commerce_effect e
     WHERE e.creator_id=c AND e.packet_id=packet.id AND e.provider_key=packet.id::text||':capture:'||packet.authorization_attempt)
    WHEN packet.state='declined' THEN (SELECT e.created_at FROM creator.commerce_effect e
     WHERE e.creator_id=c AND e.packet_id=packet.id AND e.provider_key=packet.id::text||':release:'||packet.authorization_attempt)
    WHEN packet.state='expired' AND EXISTS(SELECT 1 FROM creator.commerce_effect e
     WHERE e.creator_id=c AND e.packet_id=packet.id AND e.provider_key=packet.id::text||':release:'||packet.authorization_attempt
      AND e.created_at>=packet.decision_at) THEN packet.decision_at
   END AS at) decided
  WHERE packet.creator_id=c AND packet.submitted_at IS NOT NULL AND decided.at IS NOT NULL
   AND decided.at>=packet.submitted_at AND decided.at>now()-interval '90 days'
 )
 SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY waited),
        percentile_cont(0.75) WITHIN GROUP (ORDER BY waited)
 FROM outcome HAVING count(*)>=5;
 PERFORM set_config('app.w4_decision_creator',coalesce(old_context,''),true);
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_decision_range(uuid) OWNER TO creator_commerce_decision_read;
REVOKE ALL ON FUNCTION creator.commerce_decision_range(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_decision_range(uuid) TO creator_runtime;
COMMIT;
