-- Additive allocated copy; original pending source remains preserved.
-- Additive pending source. Actual task locks, not filesystem age/IDs, decide
-- whether a discovered comparison export attempt may be physically removed.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF to_regprocedure('creator_trust.capture_comparison_export(text,uuid,uuid,text,uuid)') IS NULL
  OR to_regclass('creator_trust.comparison_export_artifact') IS NULL THEN
  RAISE EXCEPTION 'Original comparison artifact lifecycle required'; END IF;
END $$;

CREATE FUNCTION creator_trust.fence_comparison_export_attempt(attempt jsonb)
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
  -- Pre-activation exports without source provenance remain for explicit
  -- legacy review; recovery must not guess their comparison contents.
  IF NOT FOUND THEN RETURN jsonb_build_object('action','wait'); END IF;
  IF task.data=saved.artifact AND saved.revoked_at IS NULL AND saved.removed_at IS NULL
   AND saved.source_until>clock_timestamp() AND (saved.artifact->>'expiresAt')::timestamptz>clock_timestamp()
   AND saved.artifact->>'contentType'=attempt->>'contentType' THEN
   RETURN jsonb_build_object('action','keep','artifact',saved.artifact);
  END IF;
 END IF;
 RETURN jsonb_build_object('action','remove');
END $$;

CREATE FUNCTION creator_trust.finish_comparison_export_attempt(attempt jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE decision jsonb;
BEGIN
 -- Recheck on this same held worker client after physical I/O settles. The
 -- durable filesystem removal marker also fences a suspended old writer.
 decision:=creator_trust.fence_comparison_export_attempt(attempt);
 IF decision->>'action'<>'remove' THEN RETURN false; END IF;
 UPDATE creator_trust.comparison_export_artifact SET revoked_at=coalesce(revoked_at,clock_timestamp()),
  removed_at=CASE WHEN artifact IS NOT NULL AND artifact->>'reference'=attempt->>'reference'
   THEN coalesce(removed_at,clock_timestamp()) ELSE removed_at END,
  purge_token=NULL,purge_until=NULL
  WHERE snapshot_ref=attempt->>'snapshotRef' AND job_id=(attempt->>'jobId')::uuid
   AND account_id=(attempt->>'accountId')::uuid AND domain=attempt->>'domain'
   AND lease_token=(attempt->>'leaseToken')::uuid;
 RETURN true;
END $$;

ALTER FUNCTION creator_trust.fence_comparison_export_attempt(jsonb) OWNER TO creator_comparison_artifact;
ALTER FUNCTION creator_trust.finish_comparison_export_attempt(jsonb) OWNER TO creator_comparison_artifact;
REVOKE ALL ON FUNCTION creator_trust.fence_comparison_export_attempt(jsonb),creator_trust.finish_comparison_export_attempt(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.fence_comparison_export_attempt(jsonb),creator_trust.finish_comparison_export_attempt(jsonb) TO creator_trust_worker;
COMMIT;
