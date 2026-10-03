-- Held0205. Negative authority only, before original204 body/signature gates.
-- Original0053/0178/0204 bytes stay unchanged. No request/Team/viewer authority,
-- arbitrary fan list, input document, financial receipt or publication licence.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_trust_fulfillment_publication_denial') THEN
  RAISE EXCEPTION 'A pre-existing fulfillment publication denial owner needs independent review';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_trust_denial'
  AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
  AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) THEN
  RAISE EXCEPTION 'The original isolated Trust denial owner is required';
 END IF;
 CREATE ROLE creator_trust_fulfillment_publication_denial NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(nonce,backend_pid,transaction_id,login_name,creator_id,creator_account_id,content_id,content_version,
 publisher_account_id,signed_act_id,plan_id,plan_revision,plan_hash,audience,recipient_count,expires_at)
 ON creator.commerce_fulfillment_publication_scope TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(id,revision,creator_id,content_id,content_version,audience,recipient_count,source_hash,created_by)
 ON creator.commerce_fulfillment_plan TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(id,creator_id,version,state,kind,packet_id,audience,withdrawn_at)
 ON creator.content_index TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(content_id,creator_id,version,author_account_id,signed_act_id)
 ON creator.content_publication TO creator_trust_fulfillment_publication_denial;
-- The original PUBLIC plan-read policy also resolves these identity/member
-- columns during PostgreSQL permission checking. They remain metadata only.
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(plan_id,plan_revision,creator_id,fan_id) ON creator.commerce_fulfillment_member TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(id,creator_id,fan_id) ON creator.thread TO creator_trust_fulfillment_publication_denial;
GRANT SELECT(account_id) ON creator.content_tombstone TO creator_trust_fulfillment_publication_denial;
GRANT EXECUTE ON FUNCTION creator_trust.denial_projection(uuid,uuid,uuid,uuid),
 creator.commerce_fulfillment_publication_negative_originals(uuid) TO creator_trust_fulfillment_publication_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY fulfillment_publication_denial_scope ON creator.commerce_fulfillment_publication_scope
 FOR SELECT TO creator_trust_fulfillment_publication_denial
 USING(session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed'
  AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND login_name=session_user AND expires_at>clock_timestamp());
CREATE POLICY fulfillment_publication_denial_member ON creator.commerce_fulfillment_member AS RESTRICTIVE
 FOR SELECT TO creator_trust_fulfillment_publication_denial
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope held
  WHERE held.plan_id=commerce_fulfillment_member.plan_id AND held.plan_revision=commerce_fulfillment_member.plan_revision
   AND held.creator_id=commerce_fulfillment_member.creator_id));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_fulfillment_plan','content_index','content_publication','creator_profile','fan_profile','thread','content_tombstone'] LOOP
  EXECUTE format('CREATE POLICY fulfillment_publication_denial_metadata ON creator.%I FOR SELECT TO creator_trust_fulfillment_publication_denial USING(session_user=''creator_publication_worker'' AND current_setting(''transaction_isolation'')=''read committed'')',t);
 END LOOP;
END $$;
RESET ROLE;

-- Inaccessible fixed metadata predicate. The caller cannot create/read a scope
-- row or substitute a setting, tuple, viewer nonce or positive grant for it.
CREATE FUNCTION creator_trust.fulfillment_publication_denial_current(n uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed'
  AND n IS NOT NULL
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0204_w4_fulfillment_publication_consumer')
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0205_w8_fulfillment_publication_denial')
  AND EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope held
   JOIN creator.commerce_fulfillment_plan plan ON plan.id=held.plan_id AND plan.revision=held.plan_revision
    AND plan.creator_id=held.creator_id AND plan.content_id=held.content_id AND plan.content_version=held.content_version
    AND plan.source_hash=held.plan_hash AND plan.audience=held.audience AND plan.recipient_count=held.recipient_count
    AND plan.created_by=held.creator_account_id
   JOIN creator.creator_profile owner ON owner.id=held.creator_id AND owner.account_id=held.creator_account_id
   JOIN creator.content_index content ON content.id=held.content_id AND content.creator_id=held.creator_id
    AND content.version=held.content_version AND content.kind='public_answer' AND content.packet_id IS NULL
    AND content.state IN('scheduled','media_pending') AND content.withdrawn_at IS NULL AND content.audience=held.audience
   JOIN creator.content_publication pub ON pub.content_id=held.content_id AND pub.creator_id=held.creator_id
    AND pub.version=held.content_version AND pub.author_account_id=held.publisher_account_id AND pub.signed_act_id=held.signed_act_id
   WHERE held.nonce=n AND held.backend_pid=pg_backend_pid() AND held.transaction_id=pg_current_xact_id()
    AND held.login_name=session_user AND held.expires_at>clock_timestamp()
    AND held.publisher_account_id=held.creator_account_id AND held.recipient_count BETWEEN 2 AND 100)
$$;

CREATE FUNCTION creator_trust.fulfillment_publication_denial(n uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE originals jsonb; current_originals jsonb; family record; held record; k text; answer text='allowed';
BEGIN
 IF NOT creator_trust.fulfillment_publication_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT creator_id,creator_account_id,publisher_account_id,recipient_count INTO held
  FROM creator.commerce_fulfillment_publication_scope WHERE nonce=n;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO originals
  FROM creator.commerce_fulfillment_publication_negative_originals(n) original;
 IF originals IS NULL OR jsonb_array_length(originals)<>held.recipient_count
  OR jsonb_array_length(originals) NOT BETWEEN 2 AND 100 THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM jsonb_to_recordset(originals) AS original(creator_id uuid,creator_account_id uuid,
  fan_id uuid,fan_account_id uuid,thread_id uuid) LEFT JOIN creator.thread thread
   ON thread.id=original.thread_id AND thread.creator_id=original.creator_id AND thread.fan_id=original.fan_id
  LEFT JOIN creator.fan_profile fan ON fan.id=original.fan_id AND fan.account_id=original.fan_account_id
  WHERE original.creator_id IS DISTINCT FROM held.creator_id OR original.creator_account_id IS DISTINCT FROM held.creator_account_id
   OR thread.id IS NULL OR fan.id IS NULL) THEN RETURN 'unavailable'; END IF;

 -- Complete sorted nonwaiting negatives precede any per-family projection.
 -- Never acquire a new lower key behind a writer while holding another family.
 FOR k IN SELECT DISTINCT key FROM (
  SELECT 'w8-denial:account:'||original.fan_account_id::text AS key
   FROM jsonb_to_recordset(originals) AS original(fan_account_id uuid)
  UNION ALL SELECT 'w8-denial:account:'||held.creator_account_id::text
  UNION ALL SELECT 'w8-denial:account:'||held.publisher_account_id::text
  UNION ALL SELECT 'w8-denial:creator:'||held.creator_id::text) keys ORDER BY key LOOP
  IF k IS NULL OR NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN RETURN 'unavailable'; END IF;
 END LOOP;
 -- READ COMMITTED re-read after locks. A changed source cannot choose new keys.
 IF NOT creator_trust.fulfillment_publication_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO current_originals
  FROM creator.commerce_fulfillment_publication_negative_originals(n) original;
 IF current_originals IS DISTINCT FROM originals THEN RETURN 'unavailable'; END IF;
 FOR family IN SELECT * FROM jsonb_to_recordset(originals) AS original(creator_id uuid,creator_account_id uuid,
  fan_id uuid,fan_account_id uuid,thread_id uuid) LOOP
  IF NOT EXISTS(SELECT FROM creator.thread thread JOIN creator.fan_profile fan ON fan.id=thread.fan_id
   WHERE thread.id=family.thread_id AND thread.creator_id=family.creator_id AND thread.fan_id=family.fan_id
    AND fan.account_id=family.fan_account_id) THEN RETURN 'unavailable'; END IF;
  IF creator_trust.denial_projection(family.creator_id,family.fan_account_id,family.creator_account_id,family.thread_id)
   OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(family.fan_account_id,family.creator_account_id))
  THEN answer='denied'; END IF;
 END LOOP;
 IF creator_trust.denial_projection(held.creator_id,held.publisher_account_id,held.creator_account_id,NULL)
  OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id=held.publisher_account_id) THEN answer='denied'; END IF;
 IF NOT creator_trust.fulfillment_publication_denial_current(n) THEN RETURN 'unavailable'; END IF;
 SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO current_originals
  FROM creator.commerce_fulfillment_publication_negative_originals(n) original;
 IF current_originals IS DISTINCT FROM originals THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM jsonb_to_recordset(originals) AS original(creator_id uuid,fan_id uuid,fan_account_id uuid,thread_id uuid)
  LEFT JOIN creator.thread thread ON thread.id=original.thread_id AND thread.creator_id=original.creator_id AND thread.fan_id=original.fan_id
  LEFT JOIN creator.fan_profile fan ON fan.id=original.fan_id AND fan.account_id=original.fan_account_id
  WHERE thread.id IS NULL OR fan.id IS NULL)
  OR NOT creator_trust.fulfillment_publication_denial_current(n) THEN RETURN 'unavailable'; END IF;
 RETURN answer;
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.fulfillment_publication_denial_current(uuid) OWNER TO creator_trust_fulfillment_publication_denial;
ALTER FUNCTION creator_trust.fulfillment_publication_denial(uuid) OWNER TO creator_trust_fulfillment_publication_denial;
REVOKE ALL ON FUNCTION creator_trust.fulfillment_publication_denial_current(uuid),creator_trust.fulfillment_publication_denial(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.fulfillment_publication_denial(uuid) TO creator_fulfillment_publication_metadata;
COMMIT;
