-- Held W3 ordinary provenance purge, exact W8 allocation0217. No activation.
-- Only original Conversation DELETE custody and its immutable elapsed-day due
-- boundary may authorize a page. W8 owns the deferred task/lease COMMIT fence;
-- this function neither commits nor produces a domain acknowledgement.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration
  WHERE version='0212_w3_generation_worker_output'
   AND checksum='76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8')
 OR NOT EXISTS(SELECT FROM creator.schema_migration
  WHERE version='0214_w8_original_privacy_family'
   AND checksum='fcb8f6174d48ed89b9a06d8a51ac4f0c5dd4288950f2d18b351825d9d81dd793')
 OR to_regprocedure('creator_trust.privacy_task_delete_family_matches(uuid,uuid,uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'Actual reviewed output and original DELETE family sources required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_generation_privacy') THEN
  CREATE ROLE creator_w3_generation_privacy NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w3_generation_privacy'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
  AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated ordinary provenance purge owner required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_w3_generation_privacy;
GRANT EXECUTE ON FUNCTION creator_trust.privacy_task_delete_family_matches(uuid,uuid,uuid,uuid,uuid)
 TO creator_w3_generation_privacy;
SET LOCAL ROLE creator_owner;
-- DELETE necessarily removes the whole ordinary row. Read only the five page
-- keys; no approval JSON, body, token, scope or private capability is granted.
GRANT SELECT(generation_id,sequence,thread_id,creator_id,fan_id),DELETE
 ON creator.generation_sentence_provenance TO creator_w3_generation_privacy;
-- The owner cannot log in or be assumed. Its sole fixed function performs the
-- full original W8 DELETE/due/family checks before and after this bounded page.
CREATE POLICY w3_generation_privacy_page ON creator.generation_sentence_provenance
 FOR SELECT TO creator_w3_generation_privacy USING(true);
CREATE POLICY w3_generation_privacy_delete ON creator.generation_sentence_provenance
 FOR DELETE TO creator_w3_generation_privacy USING(true);
RESET ROLE;

CREATE FUNCTION creator.purge_generation_sentence_provenance(j uuid,k uuid,t uuid,c uuid,f uuid)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE removed integer; shape jsonb;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_w3_generation_privacy'
  OR j IS NULL OR k IS NULL OR t IS NULL OR c IS NULL OR f IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
 THEN RAISE EXCEPTION 'Original retained Conversation DELETE task required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM pg_class r WHERE r.oid=to_regclass('creator.generation_sentence_provenance')
  AND r.relkind='r' AND NOT r.relispartition AND r.relrowsecurity AND r.relforcerowsecurity
  AND pg_get_userbyid(r.relowner)='creator_owner')
 THEN RAISE EXCEPTION 'Original forced-RLS ordinary provenance relation required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_object_agg(a.attname,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull))
 INTO shape FROM pg_attribute a WHERE a.attrelid=to_regclass('creator.generation_sentence_provenance')
  AND a.attnum>0 AND NOT a.attisdropped AND a.attidentity='' AND a.attgenerated='' AND a.attinhcount=0;
 IF shape IS DISTINCT FROM '{"generation_id":["uuid",true],"sequence":["integer",true],"thread_id":["uuid",true],"creator_id":["uuid",true],"fan_id":["uuid",true],"message_id":["uuid",true],"event_id":["uuid",true],"content_hash":["text",true],"approval":["jsonb",true],"created_at":["timestamp with time zone",true],"transaction_id":["xid8",true]}'::jsonb
  OR EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=to_regclass('creator.generation_sentence_provenance')
   AND a.attnum>0 AND NOT a.attisdropped AND (a.attidentity<>'' OR a.attgenerated<>'' OR a.attinhcount<>0))
 THEN RAISE EXCEPTION 'Exact eleven ordinary provenance columns required' USING ERRCODE='42501'; END IF;
 IF NOT creator_trust.privacy_task_delete_family_matches(j,k,t,c,f)
 THEN RAISE EXCEPTION 'Original DELETE family is unavailable or not due' USING ERRCODE='42501'; END IF;
 WITH page AS (
  SELECT generation_id,sequence FROM creator.generation_sentence_provenance
   WHERE thread_id=t AND creator_id=c AND fan_id=f
   ORDER BY generation_id,sequence LIMIT 500
 ) DELETE FROM creator.generation_sentence_provenance provenance USING page
  WHERE provenance.generation_id=page.generation_id AND provenance.sequence=page.sequence
   AND provenance.thread_id=t AND provenance.creator_id=c AND provenance.fan_id=f;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<0 OR removed>500 OR NOT creator_trust.privacy_task_delete_family_matches(j,k,t,c,f)
 THEN RAISE EXCEPTION 'Original DELETE family changed during provenance purge' USING ERRCODE='42501'; END IF;
 RETURN removed;
END $$;
ALTER FUNCTION creator.purge_generation_sentence_provenance(uuid,uuid,uuid,uuid,uuid)
 OWNER TO creator_w3_generation_privacy;
REVOKE ALL ON FUNCTION creator.purge_generation_sentence_provenance(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.purge_generation_sentence_provenance(uuid,uuid,uuid,uuid,uuid) TO creator_runtime;
COMMIT;
