-- Additive pending source: Trust's original 0103 task owns provenance export
-- and deletion. No source authority, registration or legacy backfill is minted.
BEGIN;
RESET ROLE;
ALTER TABLE creator_trust.comparison_export_artifact ADD COLUMN source_families jsonb;
ALTER TABLE creator_trust.comparison_export_artifact ADD CONSTRAINT comparison_export_source_families
 CHECK(source_families IS NULL OR (jsonb_typeof(source_families)='array' AND jsonb_array_length(source_families)<=10000));
CREATE INDEX comparison_export_artifact_families ON creator_trust.comparison_export_artifact USING gin(source_families);
-- NULL is an unreviewed legacy capture, never an invented empty source set.
GRANT DELETE ON creator_trust.comparison_export_artifact TO creator_comparison_artifact;
GRANT SELECT(account_id) ON creator.conversation_comparison_consent,creator.conversation_comparison_sample TO creator_comparison_artifact;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_fan_binding ON creator.fan_profile FOR SELECT TO creator_comparison_artifact USING(true);
GRANT SELECT ON creator_trust.domain_privacy_commit_scope TO creator_comparison_artifact;
CREATE POLICY comparison_artifact_held_privacy ON creator_trust.domain_privacy_commit_scope
 FOR SELECT TO creator_comparison_artifact
 USING(pid=pg_backend_pid() AND xid=pg_current_xact_id_if_assigned() AND caller=session_user AND domain='trust');

CREATE FUNCTION creator_trust.comparison_artifact_privacy_registered(v text,h text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user IN('creator_trust_worker','growth_worker')
  AND v ~ '^[0-9]{4}_comparison_export_privacy$' AND h ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=v AND checksum=h)
$$;

CREATE FUNCTION creator_trust.capture_comparison_export_families()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE threads uuid[]; source jsonb;
BEGIN
 IF TG_OP<>'INSERT' OR TG_TABLE_SCHEMA<>'creator_trust' OR TG_TABLE_NAME<>'comparison_export_artifact'
  OR session_user<>'creator_runtime' OR NEW.source_families IS NOT NULL THEN
  RAISE EXCEPTION 'Original source capture required' USING ERRCODE='42501'; END IF;
 -- The enclosing original capture already holds its source task and workspace.
 -- The metadata is private; no fan/account list crosses into Agent or a creator export.
 IF NEW.domain='conversation' THEN
  SELECT s.families INTO source FROM creator.conversation_privacy_export_scope s
   WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
    AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original Conversation source required' USING ERRCODE='42501'; END IF;
  threads:=ARRAY(SELECT (f->>'threadId')::uuid FROM jsonb_array_elements(source) f);
 ELSE
  IF NOT EXISTS(SELECT FROM creator.agent_privacy_export_scope s
   WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.login=session_user
    AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token AND NOT s.exhausted
    AND s.nonce=nullif(current_setting('agent.privacy_export_nonce',true),'')::uuid) THEN
   RAISE EXCEPTION 'Original Agent source required' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'creator_id',creator_id,'thread_id',thread_id)
   ORDER BY account_id,creator_id,thread_id),'[]'::jsonb) INTO NEW.source_families FROM (
  SELECT account_id,creator_id,thread_id FROM creator.conversation_comparison_consent
   WHERE creator_id=ANY(NEW.creator_ids) AND (NEW.domain='agent' OR thread_id=ANY(threads))
  UNION SELECT account_id,creator_id,thread_id FROM creator.conversation_comparison_sample
   WHERE creator_id=ANY(NEW.creator_ids) AND (NEW.domain='agent' OR thread_id=ANY(threads))
  UNION SELECT p.account_id,(f->>'creatorId')::uuid,(f->>'threadId')::uuid
   FROM jsonb_array_elements(source) f JOIN creator.fan_profile p ON p.id=(f->>'fanId')::uuid
 ) families;
 RETURN NEW;
END $$;
CREATE TRIGGER comparison_export_capture_families BEFORE INSERT ON creator_trust.comparison_export_artifact
 FOR EACH ROW EXECUTE FUNCTION creator_trust.capture_comparison_export_families();

-- Read only the original owner's private current-pid/xid scope. UUIDs or GUCs
-- cannot manufacture this proof. 0103 still rechecks its immutable job/task
-- binding and real lease at the actual separate COMMIT, then erases the scope.
CREATE FUNCTION creator_trust.comparison_artifact_privacy_scope(jid uuid,token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record;
BEGIN
 IF session_user<>'creator_trust_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR jid IS NULL OR token IS NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='PENDING_W8_comparison_export_privacy' AND checksum ~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'Original Trust privacy task required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator_trust.domain_privacy_commit_scope s
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user
   AND s.domain='trust' AND s.job_id=jid AND s.lease_token=token;
 IF NOT FOUND OR (held.binding->>'lease_until')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'Original held Trust privacy scope required' USING ERRCODE='42501'; END IF;
 RETURN held.binding;
END $$;

CREATE FUNCTION creator_trust.comparison_artifact_matches_privacy(a creator_trust.comparison_export_artifact,b jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (a.account_id=(b->>'account_id')::uuid AND
   (b->>'scope'='account' OR a.creator_ids @> ARRAY[(b->>'creator_id')::uuid]))
  OR (b->>'scope'='account' AND EXISTS(SELECT FROM jsonb_array_elements_text(
   CASE WHEN jsonb_typeof(b->'owned_creator_ids')='array' THEN b->'owned_creator_ids' ELSE '[]' END) c
   WHERE a.creator_ids @> ARRAY[c::uuid]))
  OR EXISTS(SELECT FROM jsonb_array_elements(a.source_families) f
   WHERE f->>'account_id'=b->>'account_id'
    AND (b->>'scope'='account' OR f->>'creator_id'=b->>'creator_id')
    AND (b->>'scope'<>'thread' OR f->>'thread_id'=b->>'thread_id'))
$$;

CREATE FUNCTION creator_trust.export_comparison_artifact_privacy(jid uuid,token uuid)
RETURNS SETOF jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;
BEGIN
 b:=creator_trust.comparison_artifact_privacy_scope(jid,token);
 IF b->>'kind'<>'export' THEN RAISE EXCEPTION 'Original export purpose required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM creator_trust.comparison_export_artifact WHERE source_families IS NULL) THEN
  RAISE EXCEPTION 'Legacy comparison provenance requires review' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('domain',a.domain,'createdAt',a.created_at,'sourceUntil',a.source_until,
   'revokedAt',a.revoked_at,'removedAt',a.removed_at,
   'ownExport',a.account_id=(b->>'account_id')::uuid,
   'jobId',CASE WHEN a.account_id=(b->>'account_id')::uuid THEN a.job_id ELSE NULL END,
   'yourSourceFamilies',(SELECT coalesce(jsonb_agg(jsonb_build_object('creatorId',f->>'creator_id','threadId',f->>'thread_id')
    ORDER BY f->>'creator_id',f->>'thread_id'),'[]') FROM jsonb_array_elements(a.source_families) f
    WHERE f->>'account_id'=b->>'account_id'
     AND (b->>'scope'='account' OR f->>'creator_id'=b->>'creator_id')
     AND (b->>'scope'<>'thread' OR f->>'thread_id'=b->>'thread_id')))
  FROM creator_trust.comparison_export_artifact a WHERE creator_trust.comparison_artifact_matches_privacy(a,b)
  ORDER BY a.created_at,a.snapshot_ref LIMIT 2001;
END $$;

CREATE FUNCTION creator_trust.begin_comparison_artifact_privacy_delete(jid uuid,token uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;
BEGIN
 b:=creator_trust.comparison_artifact_privacy_scope(jid,token);
 IF b->>'kind'<>'delete' THEN RAISE EXCEPTION 'Original deletion purpose required' USING ERRCODE='42501'; END IF;
 -- Source owners finish first. Their original locks/EOF/COMMIT and exclusion
 -- checks prevent another relevant source read from racing this file inventory.
 PERFORM job_id FROM creator_trust.privacy_task WHERE job_id=jid AND domain IN('agent','conversation')
  AND state='complete' ORDER BY domain FOR SHARE NOWAIT;
 IF (SELECT count(*) FROM creator_trust.privacy_task WHERE job_id=jid AND domain IN('agent','conversation') AND state='complete')<>2 THEN
  RETURN false; END IF;
 IF EXISTS(SELECT FROM creator_trust.comparison_export_artifact WHERE source_families IS NULL) THEN
  RAISE EXCEPTION 'Legacy comparison provenance requires review' USING ERRCODE='42501'; END IF;
 UPDATE creator_trust.comparison_export_artifact a SET revoked_at=coalesce(a.revoked_at,clock_timestamp())
  WHERE creator_trust.comparison_artifact_matches_privacy(a,b);
 RETURN true;
END $$;

CREATE FUNCTION creator_trust.comparison_artifact_privacy_delete_rows(jid uuid,token uuid)
RETURNS TABLE(snapshot_ref text,manifest jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;
BEGIN
 b:=creator_trust.comparison_artifact_privacy_scope(jid,token);
 IF NOT creator_trust.begin_comparison_artifact_privacy_delete(jid,token) THEN
  RAISE EXCEPTION 'Original source deletion is still pending' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT a.snapshot_ref,a.artifact FROM creator_trust.comparison_export_artifact a
  WHERE creator_trust.comparison_artifact_matches_privacy(a,b) ORDER BY a.created_at,a.snapshot_ref LIMIT 20 FOR UPDATE NOWAIT;
END $$;

CREATE FUNCTION creator_trust.finish_comparison_artifact_privacy_delete(jid uuid,token uuid,ref text,manifest jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb;
BEGIN
 b:=creator_trust.comparison_artifact_privacy_scope(jid,token);
 IF NOT creator_trust.begin_comparison_artifact_privacy_delete(jid,token) THEN
  RAISE EXCEPTION 'Original source deletion is still pending' USING ERRCODE='42501'; END IF;
 -- The prepared store owner calls only after physical removal and complete
 -- attempt inventory. Remove private fan mapping as well as artifact metadata.
 DELETE FROM creator_trust.comparison_export_artifact a WHERE a.snapshot_ref=ref AND a.artifact IS NOT DISTINCT FROM manifest
  AND a.revoked_at IS NOT NULL AND creator_trust.comparison_artifact_matches_privacy(a,b);
 RETURN FOUND;
END $$;

-- Validate clearing immediately while 0103's private scope is present. Its
-- deferred COMMIT trigger may run before the artifact trigger and erase it.
CREATE FUNCTION creator_trust.guard_comparison_export_task_clear()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; b jsonb; aid uuid;
BEGIN
 SELECT account_id INTO aid FROM creator_trust.privacy_job WHERE id=NEW.job_id AND kind='export';
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF OLD.state<>'complete' OR (to_jsonb(NEW)-'data')<>(to_jsonb(OLD)-'data') THEN
  RAISE EXCEPTION 'Only authorized completed export clearing is allowed' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator_trust.domain_privacy_commit_scope s
  WHERE s.pid=pg_backend_pid() AND s.xid=pg_current_xact_id_if_assigned() AND s.caller=session_user AND s.domain='trust';
 IF NOT FOUND THEN RAISE EXCEPTION 'Original held deletion required for clearing' USING ERRCODE='42501'; END IF;
 b:=creator_trust.comparison_artifact_privacy_scope(held.job_id,held.lease_token);
 IF b->>'kind'<>'delete' OR b->>'scope'<>'account' OR b->>'account_id'<>aid::text
  OR NOT creator_trust.begin_comparison_artifact_privacy_delete(held.job_id,held.lease_token)
  OR EXISTS(SELECT FROM creator_trust.comparison_export_artifact a WHERE creator_trust.comparison_artifact_matches_privacy(a,b)) THEN
  RAISE EXCEPTION 'Original artifact physical deletion must finish before clearing' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comparison_export_task_clear BEFORE UPDATE ON creator_trust.privacy_task
 FOR EACH ROW WHEN(NEW.domain IN('agent','conversation') AND NEW.state='complete' AND NEW.data IS NULL)
 EXECUTE FUNCTION creator_trust.guard_comparison_export_task_clear();
DROP TRIGGER comparison_export_task_current ON creator_trust.privacy_task;
CREATE CONSTRAINT TRIGGER comparison_export_task_current AFTER UPDATE ON creator_trust.privacy_task
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN(NEW.domain IN('agent','conversation') AND NEW.state='complete' AND NEW.data IS NOT NULL)
 EXECUTE FUNCTION creator_trust.finish_comparison_export_task();

ALTER FUNCTION creator_trust.capture_comparison_export_families() OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.comparison_artifact_privacy_registered(text,text) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.comparison_artifact_privacy_scope(uuid,uuid) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.comparison_artifact_matches_privacy(creator_trust.comparison_export_artifact,jsonb) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.export_comparison_artifact_privacy(uuid,uuid) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.begin_comparison_artifact_privacy_delete(uuid,uuid) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.comparison_artifact_privacy_delete_rows(uuid,uuid) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.finish_comparison_artifact_privacy_delete(uuid,uuid,text,jsonb) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.guard_comparison_export_task_clear() OWNER TO creator_comparison_artifact;
REVOKE ALL ON FUNCTION creator_trust.comparison_artifact_privacy_registered(text,text),creator_trust.capture_comparison_export_families(),creator_trust.comparison_artifact_privacy_scope(uuid,uuid),
 creator_trust.comparison_artifact_matches_privacy(creator_trust.comparison_export_artifact,jsonb),
 creator_trust.export_comparison_artifact_privacy(uuid,uuid),creator_trust.begin_comparison_artifact_privacy_delete(uuid,uuid),
 creator_trust.comparison_artifact_privacy_delete_rows(uuid,uuid),creator_trust.finish_comparison_artifact_privacy_delete(uuid,uuid,text,jsonb),
 creator_trust.guard_comparison_export_task_clear() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.export_comparison_artifact_privacy(uuid,uuid),creator_trust.begin_comparison_artifact_privacy_delete(uuid,uuid),
 creator_trust.comparison_artifact_privacy_delete_rows(uuid,uuid),creator_trust.finish_comparison_artifact_privacy_delete(uuid,uuid,text,jsonb)
 TO creator_trust_worker;
GRANT EXECUTE ON FUNCTION creator_trust.comparison_artifact_privacy_registered(text,text) TO creator_trust_worker,growth_worker;
COMMIT;
