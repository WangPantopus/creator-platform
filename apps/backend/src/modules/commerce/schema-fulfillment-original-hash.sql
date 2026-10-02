-- Held0202_w4_fulfillment_original_hash. W8 owns registration and activation.
-- Fixed current-original comparison under a genuine0199 interactive scope.
-- No arbitrary packet selector, private input return or new viewer licence.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_original_hash') THEN
  RAISE EXCEPTION 'A pre-existing original-input hash owner needs independent review';
 END IF;
 CREATE ROLE creator_fulfillment_original_hash NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_fulfillment_original_hash;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_fulfillment_original_hash;
-- Existing PUBLIC Commerce policies call commerce_scope as the querying role.
-- Give only its required identity metadata, bounded to the genuine originals.
GRANT SELECT(id,account_id,verification) ON creator.creator_profile TO creator_fulfillment_original_hash;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_fulfillment_original_hash;
GRANT SELECT(nonce,backend_pid,transaction_id,account_id,session_id,expires_at,creator_id,plan_id,plan_revision,recipient_count)
 ON creator.commerce_fulfillment_view_scope TO creator_fulfillment_original_hash;
GRANT SELECT(plan_id,plan_revision,packet_id,creator_id,fan_id,thread_id,request_hash)
 ON creator.commerce_fulfillment_member TO creator_fulfillment_original_hash;
-- Raw inputs are confined to this distinct fixed comparison owner. Neither the
-- interactive runtime nor the original viewer metadata owner gains a column.
GRANT SELECT(id,creator_id,fan_id,thread_id,snapshot,disclosure,question,fan_answer,created_at,submitted_at,
 authorization_attempt,visibility,accepted_act_id,accepted_at)
 ON creator.commerce_packet TO creator_fulfillment_original_hash;

CREATE POLICY fulfillment_original_scope ON creator.commerce_fulfillment_view_scope
 FOR SELECT TO creator_fulfillment_original_hash
 USING(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()
  AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
  AND session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid
  AND expires_at>clock_timestamp() AND creator.commerce_fulfillment_view_matches(nonce));
CREATE POLICY fulfillment_original_creator_bound ON creator.creator_profile AS RESTRICTIVE
 FOR SELECT TO creator_fulfillment_original_hash
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id=creator_profile.id));
CREATE POLICY fulfillment_original_fan_bound ON creator.fan_profile AS RESTRICTIVE
 FOR SELECT TO creator_fulfillment_original_hash
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.fan_id=fan_profile.id));
CREATE POLICY fulfillment_original_member ON creator.commerce_fulfillment_member
 FOR SELECT TO creator_fulfillment_original_hash
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held
  WHERE held.creator_id=commerce_fulfillment_member.creator_id
   AND held.plan_id=commerce_fulfillment_member.plan_id AND held.plan_revision=commerce_fulfillment_member.plan_revision));
-- Restrictive custody also applies when an existing PUBLIC family policy would
-- otherwise allow this role to see an unrelated member or packet.
CREATE POLICY fulfillment_original_member_bound ON creator.commerce_fulfillment_member AS RESTRICTIVE
 FOR SELECT TO creator_fulfillment_original_hash
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held
  WHERE held.creator_id=commerce_fulfillment_member.creator_id
   AND held.plan_id=commerce_fulfillment_member.plan_id AND held.plan_revision=commerce_fulfillment_member.plan_revision));
CREATE FUNCTION creator.commerce_fulfillment_original_hash_bound(c uuid,p uuid,f uuid,t uuid) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT session_user='creator_runtime' AND EXISTS(SELECT FROM creator.commerce_fulfillment_member m
  WHERE m.creator_id=c AND m.packet_id=p AND m.fan_id=f AND m.thread_id=t)
$$;
REVOKE ALL ON FUNCTION creator.commerce_fulfillment_original_hash_bound(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_original_hash_bound(uuid,uuid,uuid,uuid) TO creator_fulfillment_original_hash;
CREATE POLICY fulfillment_original_packet ON creator.commerce_packet
 FOR SELECT TO creator_fulfillment_original_hash
 USING(creator.commerce_fulfillment_original_hash_bound(creator_id,id,fan_id,thread_id));
CREATE POLICY fulfillment_original_packet_bound ON creator.commerce_packet AS RESTRICTIVE
 FOR SELECT TO creator_fulfillment_original_hash
 USING(creator.commerce_fulfillment_original_hash_bound(creator_id,id,fan_id,thread_id));

CREATE FUNCTION creator.commerce_fulfillment_originals_match(n uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.commerce_fulfillment_view_scope%ROWTYPE; member record; actual_hash text; count_members integer=0;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0202_w4_fulfillment_original_hash') THEN
  RAISE EXCEPTION 'Original-input comparison is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR n IS NULL OR NOT creator.commerce_fulfillment_view_matches(n) THEN RETURN false; END IF;
 -- No setting, identity switch, row lock or original-body projection occurs.
 SELECT s.nonce,s.creator_id,s.plan_id,s.plan_revision,s.recipient_count INTO held.nonce,held.creator_id,held.plan_id,held.plan_revision,held.recipient_count
  FROM creator.commerce_fulfillment_view_scope s WHERE s.nonce=n;
 IF held.nonce IS NULL OR held.recipient_count NOT BETWEEN 2 AND 100 THEN RETURN false; END IF;
 FOR member IN SELECT m.packet_id,m.creator_id,m.fan_id,m.thread_id,m.request_hash
  FROM creator.commerce_fulfillment_member m
  WHERE m.creator_id=held.creator_id AND m.plan_id=held.plan_id AND m.plan_revision=held.plan_revision ORDER BY m.thread_id,m.packet_id LOOP
  count_members=count_members+1;
  IF count_members>100 THEN RETURN false; END IF;
  -- Byte-equivalent descriptor expression to ORIGINAL_SERVICE_QUERY. Packet
  -- versions alone do not prove that the original private inputs are unchanged.
  SELECT encode(sha256(convert_to(jsonb_build_object('snapshot',p.snapshot,'disclosure',p.disclosure,'question',p.question,'fanAnswer',p.fan_answer,'createdAt',p.created_at,'submittedAt',p.submitted_at,
   'authorizationAttempt',p.authorization_attempt,'visibility',p.visibility,'threadId',p.thread_id,
   'acceptedAct',p.accepted_act_id,'acceptedAt',p.accepted_at)::text,'UTF8')),'hex') INTO actual_hash
   FROM creator.commerce_packet p WHERE p.id=member.packet_id AND p.creator_id=member.creator_id
    AND p.fan_id=member.fan_id AND p.thread_id=member.thread_id;
  IF actual_hash IS NULL OR actual_hash IS DISTINCT FROM member.request_hash THEN RETURN false; END IF;
 END LOOP;
 RETURN count_members=held.recipient_count AND creator.commerce_fulfillment_view_matches(n);
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_fulfillment_originals_match(uuid) OWNER TO creator_fulfillment_original_hash;
REVOKE ALL ON FUNCTION creator.commerce_fulfillment_originals_match(uuid) FROM PUBLIC;
-- The actual0199 matcher is the only pre-existing executable this purpose gets.
-- Its extra ACL is pinned by the reviewed joint0199/0202 catalogue.
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_view_matches(uuid) TO creator_fulfillment_original_hash;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_originals_match(uuid) TO creator_runtime;
COMMIT;
