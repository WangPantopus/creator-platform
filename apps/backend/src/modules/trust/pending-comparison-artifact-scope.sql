-- Pending source review only. Not an executable migration or runtime authority.
-- Scope the complete file inventory to the original held privacy task. A
-- different live export must not block deletion of unrelated mapped sources.
BEGIN;
RESET ROLE;
CREATE FUNCTION creator_trust.comparison_export_attempt_relevant(jid uuid,token uuid,attempt jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b jsonb; a creator_trust.comparison_export_artifact;
BEGIN
 b:=creator_trust.comparison_artifact_privacy_scope(jid,token);
 IF b->>'kind'<>'delete' OR jsonb_typeof(attempt) IS DISTINCT FROM 'object'
  OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(attempt) k) IS DISTINCT FROM
   ARRAY['accountId','contentType','createdAt','domain','format','jobId','leaseToken','reference','snapshotRef']::text[]
  OR EXISTS(SELECT FROM jsonb_each(attempt) v WHERE jsonb_typeof(v.value)<>'string')
  OR attempt->>'format' IS DISTINCT FROM 'privacy-attempt-v1'
  OR attempt->>'domain' NOT IN('agent','conversation')
  OR attempt->>'contentType' NOT IN('application/x-ndjson','application/zip','application/octet-stream')
  OR length(attempt->>'snapshotRef') NOT BETWEEN 8 AND 200
  OR NOT isfinite((attempt->>'createdAt')::timestamptz)
 THEN RAISE EXCEPTION 'Original deletion task and exact private attempt required' USING ERRCODE='42501'; END IF;
 PERFORM (attempt->>'reference')::uuid;
 SELECT * INTO a FROM creator_trust.comparison_export_artifact
  WHERE snapshot_ref=attempt->>'snapshotRef' AND job_id=(attempt->>'jobId')::uuid
   AND account_id=(attempt->>'accountId')::uuid AND domain=attempt->>'domain'
   AND lease_token=(attempt->>'leaseToken')::uuid
   AND (artifact IS NULL OR artifact->>'reference'=attempt->>'reference');
 -- Missing/uncommitted/legacy mapping is unknown, never irrelevant. The
 -- original recovery owner must still resolve that attempt before completion.
 IF NOT FOUND OR a.source_families IS NULL THEN RETURN true; END IF;
 -- Source families are the immutable original capture. This predicate grants
 -- neither removal nor completion; the caller still holds the original task,
 -- performs the complete inventory and rechecks real file recovery authority.
 RETURN creator_trust.comparison_artifact_matches_privacy(a,b);
END $$;
ALTER FUNCTION creator_trust.comparison_export_attempt_relevant(uuid,uuid,jsonb) OWNER TO creator_comparison_artifact;
REVOKE ALL ON FUNCTION creator_trust.comparison_export_attempt_relevant(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.comparison_export_attempt_relevant(uuid,uuid,jsonb) TO creator_trust_worker;
CREATE OR REPLACE FUNCTION creator_trust.fence_comparison_export_attempt(attempt jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job record; task record; saved record; ref uuid; jid uuid; aid uuid; token uuid; d text; snapshot text;
BEGIN
 IF session_user<>'creator_trust_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR jsonb_typeof(attempt) IS DISTINCT FROM 'object'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0242_comparison_export_attempts' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original comparison attempt worker required' USING ERRCODE='42501'; END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(attempt) k) IS DISTINCT FROM
  ARRAY['accountId','contentType','createdAt','domain','format','jobId','leaseToken','reference','snapshotRef']::text[]
  OR EXISTS(SELECT FROM jsonb_each(attempt) v WHERE jsonb_typeof(v.value)<>'string')
  OR attempt->>'format' IS DISTINCT FROM 'privacy-attempt-v1'
  OR attempt->>'domain' NOT IN('agent','conversation')
  OR length(attempt->>'snapshotRef') NOT BETWEEN 8 AND 200
  OR attempt->>'contentType' NOT IN('application/x-ndjson','application/zip','application/octet-stream')
  OR NOT isfinite((attempt->>'createdAt')::timestamptz) THEN
  RAISE EXCEPTION 'Exact original private attempt required' USING ERRCODE='42501'; END IF;
 ref:=(attempt->>'reference')::uuid;jid:=(attempt->>'jobId')::uuid;aid:=(attempt->>'accountId')::uuid;
 token:=(attempt->>'leaseToken')::uuid;d:=attempt->>'domain';snapshot:=attempt->>'snapshotRef';
 SELECT id,account_id,kind,state INTO job FROM creator_trust.privacy_job
  WHERE id=jid AND account_id=aid AND kind='export' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original export job required for recovery' USING ERRCODE='42501'; END IF;
 -- Original source scopes hold this same task FOR SHARE. A live source cannot
 -- be declared abandoned, even when its lease has just elapsed. New claims
 -- cannot replace this task while the caller performs and settles file I/O.
 SELECT job_id,domain,state,lease_token,lease_until,data INTO task FROM creator_trust.privacy_task
  WHERE job_id=jid AND domain=d FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original export task required for recovery' USING ERRCODE='42501'; END IF;
 IF task.state='running' AND task.lease_token=token AND task.lease_until>clock_timestamp() THEN
  RETURN jsonb_build_object('action','wait'); END IF;
 SELECT * INTO saved FROM creator_trust.comparison_export_artifact
  WHERE snapshot_ref=snapshot AND job_id=jid AND account_id=aid AND domain=d AND lease_token=token FOR UPDATE NOWAIT;
 IF task.state='complete' AND task.data->>'reference'=ref::text THEN
  IF NOT FOUND THEN
   -- Original sealed expiry is independent of comparison source provenance.
   -- Never infer expiry from file age, review time or a caller's source list.
   -- A still-live legacy artifact remains unknown and cannot be removed here.
   IF jsonb_typeof(task.data)='object'
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(task.data) k)=
     ARRAY['accountId','bytes','chunks','contentType','domain','expiresAt','format','jobId','reference','sha256','snapshotRef']::text[]
    AND NOT EXISTS(SELECT FROM jsonb_each(task.data) v WHERE v.key NOT IN('bytes','chunks') AND jsonb_typeof(v.value)<>'string')
    AND task.data->>'format'='privacy-stream-v1'
    AND task.data->>'jobId'=jid::text AND task.data->>'accountId'=aid::text
    AND task.data->>'domain'=d AND task.data->>'snapshotRef'=snapshot
    AND task.data->>'contentType'=attempt->>'contentType'
    AND task.data->>'sha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(task.data->'bytes')='number' AND task.data->>'bytes' ~ '^[0-9]+$'
    AND jsonb_typeof(task.data->'chunks')='number' AND task.data->>'chunks' ~ '^[0-9]+$'
    AND (task.data->>'bytes')::numeric<=9007199254740991
    AND (task.data->>'chunks')::numeric<=9007199254740991
    AND isfinite((task.data->>'expiresAt')::timestamptz)
    AND (task.data->>'expiresAt')::timestamptz<=clock_timestamp()
   THEN RETURN jsonb_build_object('action','remove'); END IF;
   RETURN jsonb_build_object('action','wait');
  END IF;
  IF task.data=saved.artifact AND saved.revoked_at IS NULL AND saved.removed_at IS NULL
   AND saved.source_until>clock_timestamp() AND (saved.artifact->>'expiresAt')::timestamptz>clock_timestamp()
   AND saved.artifact->>'contentType'=attempt->>'contentType' THEN
   RETURN jsonb_build_object('action','keep','artifact',saved.artifact);
  END IF;
 END IF;
 RETURN jsonb_build_object('action','remove');
END $$;

ALTER FUNCTION creator_trust.fence_comparison_export_attempt(jsonb) OWNER TO creator_comparison_artifact;
REVOKE ALL ON FUNCTION creator_trust.fence_comparison_export_attempt(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.fence_comparison_export_attempt(jsonb) TO creator_trust_worker;
COMMIT;
