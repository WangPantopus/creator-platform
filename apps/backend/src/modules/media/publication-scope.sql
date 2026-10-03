-- 0075_w6_publication_media_scope. W8 owns review and registry activation.
-- Depends on actual 0071 sealed scope, 0073 held negative authority and 0062.
-- No signing grant, interactive app.* entry, login membership or asset mutation.
BEGIN;
SET LOCAL ROLE creator_owner;
-- Preserve named 0062 ingestion/discovery policies. Narrow only permissive
-- PUBLIC policies on these two tables to their original interactive role.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['creator_media_asset','creator_media_publication'] LOOP
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid=('creator.'||t)::regclass AND 0=ANY(polroles) LOOP
   EXECUTE format('ALTER POLICY %I ON creator.%I TO creator_runtime',p.polname,t);
  END LOOP;
 END LOOP;
END $$;
CREATE POLICY publication_media_projection ON creator.creator_media_asset FOR SELECT TO creator_publication_authority
 USING(creator.publication_scope_matches(creator_id,object_id,nullif(current_setting('publication.version',true),'')::integer));
-- PostgreSQL requires an UPDATE column privilege to take FOR SHARE. The
-- non-login authority can lock id, but WITH CHECK(false) denies every write.
CREATE POLICY publication_media_lock ON creator.creator_media_asset FOR UPDATE TO creator_publication_authority
 USING(creator.publication_scope_matches(creator_id,object_id,nullif(current_setting('publication.version',true),'')::integer)) WITH CHECK(false);
CREATE POLICY publication_media_projection ON creator.creator_media_publication FOR SELECT TO creator_publication_authority
 USING(creator.publication_scope_matches(creator_id,object_id,nullif(current_setting('publication.version',true),'')::integer));
GRANT SELECT(id,creator_id,object_id,owner_account_id,purpose,state,version,mime_type,bytes,duration_ms,output_sha256,signed_act_id,provenance,expires_at,max_bytes,manifest_pending,delete_pending),UPDATE(id)
 ON creator.creator_media_asset TO creator_publication_authority;
GRANT SELECT(asset_id,creator_id,object_id,account_id,signed_act_id,evidence,command_hash)
 ON creator.creator_media_publication TO creator_publication_authority;

CREATE FUNCTION creator.publication_media_snapshot(c uuid,o uuid,v integer,a uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE sealed creator.publication_worker_scope%ROWTYPE; row_record record; proof jsonb; original_ok boolean; current_ok boolean;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR
   c IS NULL OR o IS NULL OR v IS NULL OR v<1 OR a IS NULL OR NOT creator.publication_scope_matches(c,o,v) THEN RETURN NULL; END IF;
 SELECT * INTO sealed FROM creator.publication_worker_scope
 WHERE id=nullif(current_setting('publication.scope_id',true),'')::uuid
   AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
   AND creator_id=c AND content_id=o AND version=v AND signed_act_id IS NOT NULL
   AND created_at>clock_timestamp()-interval '5 minutes';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT id,creator_id,object_id,owner_account_id,purpose,state,version,mime_type,bytes,duration_ms,output_sha256,
   signed_act_id,provenance,expires_at,max_bytes,manifest_pending,delete_pending INTO row_record
 FROM creator.creator_media_asset WHERE id=a AND creator_id=c AND object_id=o AND owner_account_id=sealed.publisher_account_id
   AND purpose IN('human_note','post_photo','post_audio') AND state='ready' AND expires_at>clock_timestamp() AND NOT delete_pending
 FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 proof := jsonb_build_object('assetId',a,'version',row_record.version,'sha256',row_record.output_sha256,
   'bytes',row_record.bytes,'mimeType',row_record.mime_type,'durationMs',row_record.duration_ms);
 SELECT EXISTS(SELECT FROM creator.creator_media_publication p JOIN creator.signed_verification sv
   ON sv.id=p.signed_act_id AND sv.account_id=p.account_id AND sv.creator_id=p.creator_id AND sv.content_hash=p.command_hash
   WHERE p.asset_id=a AND p.creator_id=c AND p.object_id=o AND p.account_id=row_record.owner_account_id
     AND p.signed_act_id=row_record.signed_act_id AND p.evidence=proof
     AND NOT sv.withdrawn AND NOT sv.creator_revoked AND sv.act_type IN('broadcast','reply')) INTO original_ok;
 SELECT EXISTS(SELECT FROM creator.creator_media_publication p
   WHERE p.asset_id=a AND p.creator_id=c AND p.object_id=o AND p.account_id=sealed.publisher_account_id
     AND p.signed_act_id=sealed.signed_act_id AND p.evidence=proof AND p.command_hash=sealed.command_hash) INTO current_ok;
 RETURN jsonb_build_object('id',a,'creatorId',c,'objectId',o,'ownerAccountId',row_record.owner_account_id,
   'purpose',row_record.purpose,'state',row_record.state,'version',row_record.version,'mimeType',row_record.mime_type,
   'bytes',row_record.bytes,'durationMs',row_record.duration_ms,'sha256',row_record.output_sha256,
   'signedActId',row_record.signed_act_id,'expiresAt',row_record.expires_at,'maxBytes',row_record.max_bytes,
   'provenance',row_record.provenance,'manifestPending',row_record.manifest_pending,'deletePending',row_record.delete_pending,
   'originalAssociation',original_ok,'currentAssociation',current_ok);
END $$;
REVOKE ALL ON FUNCTION creator.publication_media_snapshot(uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.publication_media_snapshot(uuid,uuid,integer,uuid) TO creator_publication_worker;
RESET ROLE;
GRANT CREATE ON SCHEMA creator TO creator_publication_authority;
ALTER FUNCTION creator.publication_media_snapshot(uuid,uuid,integer,uuid) OWNER TO creator_publication_authority;
REVOKE CREATE ON SCHEMA creator FROM creator_publication_authority;
COMMIT;
