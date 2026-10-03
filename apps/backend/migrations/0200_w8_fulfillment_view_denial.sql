-- Held0200. All-original negatives under the actual0199 interactive issuer.
-- No caller fan list, publication worker, private body or positive permission.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_trust_fulfillment_view_denial') THEN
  RAISE EXCEPTION 'A pre-existing fulfillment view denial owner needs independent review';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_trust_denial'
  AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
  AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) THEN
  RAISE EXCEPTION 'The original isolated Trust denial owner is required';
 END IF;
 CREATE ROLE creator_trust_fulfillment_view_denial NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_trust_fulfillment_view_denial;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_trust_fulfillment_view_denial;
GRANT SELECT(nonce,backend_pid,transaction_id,account_id,session_id,expires_at,creator_id,creator_account_id,
 content_id,content_version,plan_id,plan_revision,plan_hash,audience,recipient_count)
 ON creator.commerce_fulfillment_view_scope TO creator_trust_fulfillment_view_denial;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_trust_fulfillment_view_denial;
GRANT SELECT(id,creator_id,fan_id) ON creator.thread TO creator_trust_fulfillment_view_denial;
GRANT SELECT(account_id) ON creator.content_tombstone TO creator_trust_fulfillment_view_denial;
GRANT EXECUTE ON FUNCTION creator_trust.denial_projection(uuid,uuid,uuid,uuid),
 creator.commerce_fulfillment_view_matches(uuid),creator.commerce_fulfillment_view_originals(uuid)
 TO creator_trust_fulfillment_view_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY fulfillment_view_denial_scope ON creator.commerce_fulfillment_view_scope
 FOR SELECT TO creator_trust_fulfillment_view_denial
 USING(session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()
  AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
  AND session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid
  AND expires_at>clock_timestamp() AND creator.commerce_fulfillment_view_matches(nonce));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['fan_profile','thread','content_tombstone'] LOOP
  EXECUTE format('CREATE POLICY fulfillment_view_denial_metadata ON creator.%I FOR SELECT TO creator_trust_fulfillment_view_denial USING(session_user=''creator_runtime'' AND current_setting(''transaction_isolation'')=''read committed'' AND EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope))',t);
 END LOOP;
END $$;
RESET ROLE;
CREATE FUNCTION creator_trust.fulfillment_view_denial_current(n uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
  AND n IS NOT NULL
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0199_w4_fulfillment_plan_read')
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0200_w8_fulfillment_view_denial')
  AND creator.commerce_fulfillment_view_matches(n)
  AND EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.nonce=n
   AND held.backend_pid=pg_backend_pid() AND held.transaction_id=pg_current_xact_id()
   AND held.account_id=nullif(current_setting('app.account_id',true),'')::uuid
   AND held.session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND held.expires_at>clock_timestamp() AND held.recipient_count BETWEEN 2 AND 100)
$$;
CREATE FUNCTION creator_trust.fulfillment_view_denial(n uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE originals jsonb; current_originals jsonb; family record; held record; current_held record;
 k text; answer text='allowed';
BEGIN
 IF NOT creator_trust.fulfillment_view_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT nonce,backend_pid,transaction_id,account_id,session_id,expires_at,creator_id,creator_account_id,
  content_id,content_version,plan_id,plan_revision,plan_hash,audience,recipient_count INTO held
  FROM creator.commerce_fulfillment_view_scope WHERE nonce=n;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO originals
  FROM creator.commerce_fulfillment_view_originals(n) original;
 IF originals IS NULL OR jsonb_array_length(originals)<>held.recipient_count
  OR jsonb_array_length(originals) NOT BETWEEN 2 AND 100 THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM jsonb_to_recordset(originals) AS original(creator_id uuid,creator_account_id uuid,
  fan_id uuid,fan_account_id uuid,thread_id uuid) LEFT JOIN creator.thread thread
   ON thread.id=original.thread_id AND thread.creator_id=original.creator_id AND thread.fan_id=original.fan_id
  LEFT JOIN creator.fan_profile fan ON fan.id=original.fan_id AND fan.account_id=original.fan_account_id
  WHERE original.creator_id IS DISTINCT FROM held.creator_id OR original.creator_account_id IS DISTINCT FROM held.creator_account_id
   OR thread.id IS NULL OR fan.id IS NULL) THEN RETURN 'unavailable'; END IF;
 FOR k IN SELECT DISTINCT key FROM (
  SELECT 'w8-denial:account:'||original.fan_account_id::text AS key
   FROM jsonb_to_recordset(originals) AS original(fan_account_id uuid)
  UNION ALL SELECT 'w8-denial:account:'||held.creator_account_id::text
  UNION ALL SELECT 'w8-denial:account:'||held.account_id::text
  UNION ALL SELECT 'w8-denial:creator:'||held.creator_id::text) keys ORDER BY key LOOP
  IF k IS NULL OR NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN RETURN 'unavailable'; END IF;
 END LOOP;
 -- A changed original cannot choose a new lower key behind these locks.
 IF NOT creator_trust.fulfillment_view_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT nonce,backend_pid,transaction_id,account_id,session_id,expires_at,creator_id,creator_account_id,
  content_id,content_version,plan_id,plan_revision,plan_hash,audience,recipient_count INTO current_held
  FROM creator.commerce_fulfillment_view_scope WHERE nonce=n;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO current_originals
  FROM creator.commerce_fulfillment_view_originals(n) original;
 IF to_jsonb(current_held) IS DISTINCT FROM to_jsonb(held) OR current_originals IS DISTINCT FROM originals THEN RETURN 'unavailable'; END IF;
 FOR family IN SELECT * FROM jsonb_to_recordset(originals) AS original(creator_id uuid,creator_account_id uuid,
  fan_id uuid,fan_account_id uuid,thread_id uuid) LOOP
  IF NOT EXISTS(SELECT FROM creator.thread thread JOIN creator.fan_profile fan ON fan.id=thread.fan_id
   WHERE thread.id=family.thread_id AND thread.creator_id=family.creator_id AND thread.fan_id=family.fan_id
    AND fan.account_id=family.fan_account_id) THEN RETURN 'unavailable'; END IF;
  IF creator_trust.denial_projection(family.creator_id,family.fan_account_id,family.creator_account_id,family.thread_id)
   OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(family.fan_account_id,family.creator_account_id))
  THEN answer='denied'; END IF;
 END LOOP;
 IF creator_trust.denial_projection(held.creator_id,held.account_id,held.creator_account_id,NULL)
  OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id=held.account_id) THEN answer='denied'; END IF;
 IF NOT creator_trust.fulfillment_view_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT nonce,backend_pid,transaction_id,account_id,session_id,expires_at,creator_id,creator_account_id,
  content_id,content_version,plan_id,plan_revision,plan_hash,audience,recipient_count INTO current_held
  FROM creator.commerce_fulfillment_view_scope WHERE nonce=n;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO current_originals
  FROM creator.commerce_fulfillment_view_originals(n) original;
 IF to_jsonb(current_held) IS DISTINCT FROM to_jsonb(held) OR current_originals IS DISTINCT FROM originals THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM jsonb_to_recordset(originals) AS original(creator_id uuid,fan_id uuid,fan_account_id uuid,thread_id uuid)
  LEFT JOIN creator.thread thread ON thread.id=original.thread_id AND thread.creator_id=original.creator_id AND thread.fan_id=original.fan_id
  LEFT JOIN creator.fan_profile fan ON fan.id=original.fan_id AND fan.account_id=original.fan_account_id
  WHERE thread.id IS NULL OR fan.id IS NULL)
  OR NOT creator_trust.fulfillment_view_denial_current(n) THEN RETURN 'unavailable'; END IF;
 RETURN answer;
END $$;
ALTER FUNCTION creator_trust.fulfillment_view_denial_current(uuid) OWNER TO creator_trust_fulfillment_view_denial;
ALTER FUNCTION creator_trust.fulfillment_view_denial(uuid) OWNER TO creator_trust_fulfillment_view_denial;
REVOKE ALL ON FUNCTION creator_trust.fulfillment_view_denial_current(uuid),creator_trust.fulfillment_view_denial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.fulfillment_view_denial(uuid) TO creator_runtime;
COMMIT;
