-- Held additive original-family authority. Original0087 source, functions,
-- private scope ACL and role attributes are immutable. No old NULL backfill.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration
  WHERE version='0087_w8_privacy_task_commit_fence'
   AND checksum='33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef')
 OR NOT EXISTS(SELECT FROM creator.schema_migration
  WHERE version='0209_w8_all_scope_privacy_ownership'
   AND checksum='6fa4006cb8c2f6901c7006595d08196573daef33f06aa6cec866a546ffcd2f01')
 THEN RAISE EXCEPTION 'Original task and all-scope ownership sources required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_family') THEN
  CREATE ROLE creator_privacy_family NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_family'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
  WHERE r.rolname='creator_privacy_family')
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_privacy_family'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
  AND refobjid=to_regrole('creator_privacy_family')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated original-family purpose required'; END IF;
END $$;

-- Original request time is immutable to both Trust application roles. This
-- single metadata grant supplies the approved elapsed-day deletion boundary;
-- it grants neither scope access nor a caller-controlled deadline.
SET LOCAL ROLE creator_trust_owner;
GRANT SELECT(created_at) ON creator_trust.privacy_job TO creator_privacy_fence;
RESET ROLE;

-- The existing private owner reads its existing metadata only. The new purpose
-- receives no table/scope access and cannot mint, replace or erase a binding.
CREATE FUNCTION creator_trust.privacy_task_original_binding(jid uuid,d text,token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator_trust.privacy_commit_scope%ROWTYPE; original jsonb; requested_at timestamptz;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_privacy_fence'
  OR jid IS NULL OR token IS NULL OR d<>'conversation' OR d IS NULL
  OR current_setting('transaction_isolation') NOT IN('read committed','repeatable read')
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Actual original Conversation task required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator_trust.privacy_commit_scope s
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned()
   AND s.caller=session_user AND s.job_id=jid AND s.domain=d AND s.lease_token=token;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original held task binding required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',j.id,'account_id',j.account_id,'kind',j.kind,'scope',j.scope,
  'creator_id',j.creator_id,'thread_id',j.thread_id,'verified_at',j.verified_at,'verification_ref',j.verification_ref,
  'owned_creator_ids',j.owned_creator_ids,'ownership_ref',j.ownership_ref,'lease_until',t.lease_until),j.created_at
 INTO original,requested_at FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
 WHERE j.id=held.job_id AND j.state NOT IN('complete','dead_letter')
  AND j.kind IN('export','delete') AND j.scope IN('account','creator','thread')
  AND j.verified_at IS NOT NULL AND j.verification_ref<>''
  AND j.owned_creator_ids IS NOT NULL AND j.ownership_ref IS NOT NULL
  AND cardinality(j.owned_creator_ids)<=100 AND array_position(j.owned_creator_ids,NULL) IS NULL
  AND char_length(j.ownership_ref) BETWEEN 8 AND 200
  AND t.domain=held.domain AND t.state='running' AND t.lease_token=held.lease_token
  AND t.lease_until>clock_timestamp();
 IF original IS NULL OR original<>held.binding
  OR (nullif(current_setting('app.account_id',true),'') IS NOT NULL
   AND nullif(current_setting('app.account_id',true),'')::uuid<>(original->>'account_id')::uuid)
 THEN RAISE EXCEPTION 'Original task binding changed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('accountId',original->'account_id','kind',original->'kind','scope',original->'scope',
  'creatorId',original->'creator_id','threadId',original->'thread_id',
  'ownedCreatorIds',original->'owned_creator_ids','ownershipRef',original->'ownership_ref',
  'deleteDue',original->>'kind'='delete' AND requested_at+interval '720 hours'<=clock_timestamp());
END $$;
ALTER FUNCTION creator_trust.privacy_task_original_binding(uuid,text,uuid) OWNER TO creator_privacy_fence;
REVOKE ALL ON FUNCTION creator_trust.privacy_task_original_binding(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.privacy_task_original_binding(uuid,text,uuid) TO creator_privacy_family;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_privacy_family;

SET LOCAL ROLE creator_owner;
GRANT SELECT(id,creator_id,fan_id),UPDATE(id) ON creator.thread TO creator_privacy_family;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile TO creator_privacy_family;
-- Isolated fixed-function metadata only; these policies issue no body access.
CREATE POLICY privacy_family_metadata ON creator.thread FOR SELECT TO creator_privacy_family USING(true);
CREATE POLICY privacy_family_lock ON creator.thread FOR UPDATE TO creator_privacy_family USING(true) WITH CHECK(false);
CREATE POLICY privacy_family_metadata ON creator.fan_profile FOR SELECT TO creator_privacy_family USING(true);
CREATE POLICY privacy_family_lock ON creator.fan_profile FOR UPDATE TO creator_privacy_family USING(true) WITH CHECK(false);
RESET ROLE;

CREATE FUNCTION creator_trust.privacy_task_owned_creators(jid uuid,token uuid)
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb; owned uuid[];
BEGIN
 IF current_user<>'creator_privacy_family' THEN
  RAISE EXCEPTION 'Isolated original-family purpose required' USING ERRCODE='42501'; END IF;
 binding:=creator_trust.privacy_task_original_binding(jid,'conversation',token);
 SELECT coalesce(array_agg(value::uuid ORDER BY ordinal),ARRAY[]::uuid[]) INTO owned
  FROM jsonb_array_elements_text(binding->'ownedCreatorIds') WITH ORDINALITY AS ids(value,ordinal);
 RETURN owned;
END $$;

CREATE FUNCTION creator_trust.privacy_task_family_matches(jid uuid,token uuid,t uuid,c uuid,f uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb; fan_account uuid; owned uuid[];
BEGIN
 IF current_user<>'creator_privacy_family' OR t IS NULL OR c IS NULL OR f IS NULL THEN
  RAISE EXCEPTION 'Complete original family required' USING ERRCODE='42501'; END IF;
 binding:=creator_trust.privacy_task_original_binding(jid,'conversation',token);
 IF (binding->>'creatorId' IS NOT NULL AND (binding->>'creatorId')::uuid<>c)
  OR (binding->>'threadId' IS NOT NULL AND (binding->>'threadId')::uuid<>t)
 THEN RETURN false; END IF;
 SELECT fp.account_id INTO fan_account FROM creator.thread th JOIN creator.fan_profile fp ON fp.id=th.fan_id
  WHERE th.id=t AND th.creator_id=c AND th.fan_id=f FOR SHARE OF th,fp NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO owned
  FROM jsonb_array_elements_text(binding->'ownedCreatorIds') AS ids(value);
 IF fan_account IS DISTINCT FROM (binding->>'accountId')::uuid AND NOT c=ANY(owned) THEN RETURN false; END IF;
 -- The original fence already owns job/task locks; recheck its current full
 -- binding after the actual pair locks and retain deferred original COMMIT.
 IF binding<>creator_trust.privacy_task_original_binding(jid,'conversation',token) THEN
  RAISE EXCEPTION 'Original family binding changed' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;
-- Separate DELETE-only boundary for a later independently reviewed isolated
-- provenance purger. The public/core caller receives no executable grant.
CREATE FUNCTION creator_trust.privacy_task_delete_family_matches(jid uuid,token uuid,t uuid,c uuid,f uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb;
BEGIN
 IF current_user<>'creator_privacy_family' THEN
  RAISE EXCEPTION 'Isolated original-family purpose required' USING ERRCODE='42501'; END IF;
 binding:=creator_trust.privacy_task_original_binding(jid,'conversation',token);
 IF binding->>'kind' IS DISTINCT FROM 'delete' OR binding->'deleteDue' IS DISTINCT FROM 'true'::jsonb
 THEN RETURN false; END IF;
 IF NOT creator_trust.privacy_task_family_matches(jid,token,t,c,f) THEN RETURN false; END IF;
 IF binding<>creator_trust.privacy_task_original_binding(jid,'conversation',token) THEN
  RAISE EXCEPTION 'Original delete family binding changed' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;
ALTER FUNCTION creator_trust.privacy_task_owned_creators(uuid,uuid) OWNER TO creator_privacy_family;
ALTER FUNCTION creator_trust.privacy_task_family_matches(uuid,uuid,uuid,uuid,uuid) OWNER TO creator_privacy_family;
ALTER FUNCTION creator_trust.privacy_task_delete_family_matches(uuid,uuid,uuid,uuid,uuid) OWNER TO creator_privacy_family;
REVOKE ALL ON FUNCTION creator_trust.privacy_task_owned_creators(uuid,uuid),
 creator_trust.privacy_task_family_matches(uuid,uuid,uuid,uuid,uuid),
 creator_trust.privacy_task_delete_family_matches(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.privacy_task_owned_creators(uuid,uuid),
 creator_trust.privacy_task_family_matches(uuid,uuid,uuid,uuid,uuid) TO creator_runtime;
COMMIT;
