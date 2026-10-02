-- Held0102_w5_generation_content_origin. W8 allocation only; unregistered.
-- Requires actual0072/0093 nonce/negative custody,0081 signature writers and
-- W2's reviewed0096 caller. No Actor, body grant, approval or paid authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.fence_signature_metadata_write()') IS NULL
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w2_generation_input') THEN
  RAISE EXCEPTION 'Reviewed generation, signature and W2 input custody required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w5_generation_origin') THEN
  CREATE ROLE creator_w5_generation_origin NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w5_generation_origin'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r)
  OR EXISTS(SELECT FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    AND ((t.relkind IN('r','p','v','m','f') AND
      (has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege(r,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
     OR (t.relkind='S' AND has_sequence_privilege(r,t.oid,'USAGE,SELECT,UPDATE')))) THEN
  RAISE EXCEPTION 'Unsafe generation content origin custody';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w5_generation_origin;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid),creator.canonical_json(jsonb)
 TO creator_w5_generation_origin;
SET LOCAL ROLE creator_owner;

-- Facts derived from the inserted document, never a caller's claimed hash or
-- permission. Legacy rows remain NULL: no historical reuse/signature is adopted.
ALTER TABLE creator.content_revision
 ADD COLUMN ai_reuse_public_text boolean,
 ADD COLUMN ai_reuse_source_hash text CHECK(ai_reuse_source_hash IS NULL OR ai_reuse_source_hash~'^[a-f0-9]{64}$'),
 ADD COLUMN ai_reuse_command_hash text CHECK(ai_reuse_command_hash IS NULL OR ai_reuse_command_hash~'^[a-f0-9]{64}$');
CREATE FUNCTION creator.derive_content_origin_metadata() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.content_id IS DISTINCT FROM OLD.content_id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
   OR NEW.version IS DISTINCT FROM OLD.version OR NEW.document IS DISTINCT FROM OLD.document
   OR NEW.author_account_id IS DISTINCT FROM OLD.author_account_id
   OR NEW.ai_reuse_public_text IS DISTINCT FROM OLD.ai_reuse_public_text
   OR NEW.ai_reuse_source_hash IS DISTINCT FROM OLD.ai_reuse_source_hash
   OR NEW.ai_reuse_command_hash IS DISTINCT FROM OLD.ai_reuse_command_hash THEN
   RAISE EXCEPTION 'Immutable content origin metadata' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 NEW.ai_reuse_public_text:=coalesce(
  jsonb_typeof(NEW.document)='object' AND NEW.document->>'kind'='post'
  AND NEW.document->'audience'='{"kind":"public"}'::jsonb
  AND NEW.document->'aiUseIntent'='true'::jsonb
  AND NEW.document->'media'='[]'::jsonb
  AND NEW.document->'quote'='null'::jsonb AND NEW.document->'packetId'='null'::jsonb
  AND (NEW.document->'live' IS NULL OR NEW.document->'live'='null'::jsonb)
  AND NEW.document->'nameToken'='false'::jsonb
  AND jsonb_typeof(NEW.document->'text')='string'
  AND length(NEW.document->>'text') BETWEEN 1 AND 20000,false);
 NEW.ai_reuse_source_hash:=NULL; NEW.ai_reuse_command_hash:=NULL;
 IF NEW.ai_reuse_public_text THEN
  NEW.ai_reuse_source_hash:=encode(public.digest(creator.canonical_json(
   jsonb_build_object('text',NEW.document->>'text')),'sha256'),'hex');
  NEW.ai_reuse_command_hash:=encode(public.digest(creator.canonical_json(
   jsonb_build_object('actType','reply','subjectId',NEW.content_id::text,'content',
    jsonb_build_object('kind','content_publication','creatorId',NEW.creator_id,
     'version',NEW.version,'document',NEW.document))),'sha256'),'hex');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION creator.derive_content_origin_metadata() FROM PUBLIC;
CREATE TRIGGER derive_content_origin_metadata BEFORE INSERT OR UPDATE ON creator.content_revision
 FOR EACH ROW EXECUTE FUNCTION creator.derive_content_origin_metadata();

GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at)
 ON creator.generation_worker_scope TO creator_w5_generation_origin;
CREATE POLICY w5_generation_origin_nonce ON creator.generation_worker_scope FOR SELECT TO creator_w5_generation_origin USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,creator_id,state,version,audience,kind,published_at,withdrawn_at,packet_id,quote_reply_id,quote_consent_version),UPDATE(id)
 ON creator.content_index TO creator_w5_generation_origin;
GRANT SELECT(content_id,creator_id,version,author_account_id,ai_reuse_public_text,ai_reuse_source_hash,ai_reuse_command_hash),UPDATE(content_id)
 ON creator.content_revision TO creator_w5_generation_origin;
GRANT SELECT(content_id,creator_id,version,signed_act_id,author_kind,author_account_id,published_at),UPDATE(content_id)
 ON creator.content_publication TO creator_w5_generation_origin;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_w5_generation_origin;
GRANT SELECT(account_id) ON creator.content_tombstone TO creator_w5_generation_origin;
GRANT SELECT(id,account_id,credential_id,creator_id,act_type,subject_id,content_hash)
 ON creator.signed_act TO creator_w5_generation_origin;
GRANT SELECT(id,account_id,revoked_at) ON creator.passkey_credential TO creator_w5_generation_origin;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_w5_generation_origin;
GRANT SELECT(signed_act_id,account_id,public_content,withdrawn_at) ON creator.signed_publication TO creator_w5_generation_origin;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn)
 ON creator.signed_verification TO creator_w5_generation_origin;
DO $$ DECLARE t text; predicate text; BEGIN
 predicate:='creator_id=(SELECT (s.task->>''creatorId'')::uuid FROM creator.generation_worker_scope s)';
 FOREACH t IN ARRAY ARRAY['content_index','content_revision','content_publication','signed_act','signed_verification'] LOOP
  EXECUTE format('CREATE POLICY w5_generation_origin_read ON creator.%I FOR SELECT TO creator_w5_generation_origin USING(%s)',t,predicate);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['content_index','content_revision','content_publication'] LOOP
  EXECUTE format('CREATE POLICY w5_generation_origin_lock ON creator.%I FOR UPDATE TO creator_w5_generation_origin USING(%s) WITH CHECK(false)',t,predicate);
 END LOOP;
 predicate:='account_id=(SELECT (s.task->>''creatorAccountId'')::uuid FROM creator.generation_worker_scope s)';
 FOREACH t IN ARRAY ARRAY['content_tombstone','passkey_credential','signed_act_consumption','signed_publication'] LOOP
  EXECUTE format('CREATE POLICY w5_generation_origin_read ON creator.%I FOR SELECT TO creator_w5_generation_origin USING(%s)',t,predicate);
 END LOOP;
END $$;

CREATE FUNCTION creator.generation_content_origins(g uuid,w uuid,origins jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; c uuid; signer uuid; expected_count integer; result jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR w IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.content_id',true),'') IS NOT NULL
  OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Use the current genuine generation purpose' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(origins) IS DISTINCT FROM 'array' OR jsonb_array_length(origins) NOT BETWEEN 1 AND 1000
  OR EXISTS(SELECT FROM jsonb_array_elements(origins) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'object'
   OR NOT(v ? 'contentId' AND v ? 'version') OR v-'contentId'-'version'<>'{}'::jsonb
   OR jsonb_typeof(v->'contentId') IS DISTINCT FROM 'string'
   OR jsonb_typeof(v->'version') IS DISTINCT FROM 'number'
   OR v->>'contentId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR v->>'version'!~'^[1-9][0-9]{0,9}$') THEN
  RAISE EXCEPTION 'Use bounded exact public content versions' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(origins) v WHERE (v->>'version')::numeric>2147483647) THEN
  RAISE EXCEPTION 'Content version is outside the exact integer range' USING ERRCODE='22023';
 END IF;
 SELECT s.task INTO task FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF task IS NULL THEN RAISE EXCEPTION 'Current private generation nonce required' USING ERRCODE='42501'; END IF;
 c:=(task->>'creatorId')::uuid; signer:=(task->>'creatorAccountId')::uuid;
 SELECT count(*) INTO expected_count FROM(SELECT DISTINCT (v->>'contentId')::uuid id,(v->>'version')::integer version
  FROM jsonb_array_elements(origins) v) selected;
 -- All candidate domain positives precede the final signature family. No
 -- new negative or identity row lease is acquired below these content locks.
 PERFORM i.id FROM creator.content_index i WHERE i.creator_id=c AND i.id IN(
  SELECT (v->>'contentId')::uuid FROM jsonb_array_elements(origins) v) ORDER BY i.id FOR SHARE NOWAIT;
 PERFORM r.content_id FROM creator.content_revision r WHERE r.creator_id=c AND EXISTS(
  SELECT FROM jsonb_array_elements(origins) v WHERE (v->>'contentId')::uuid=r.content_id AND (v->>'version')::integer=r.version)
  ORDER BY r.content_id,r.version FOR SHARE NOWAIT;
 PERFORM p.content_id FROM creator.content_publication p WHERE p.creator_id=c AND EXISTS(
  SELECT FROM jsonb_array_elements(origins) v WHERE (v->>'contentId')::uuid=p.content_id AND (v->>'version')::integer=p.version)
  ORDER BY p.content_id,p.version FOR SHARE NOWAIT;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||signer::text,0)) THEN
  RAISE EXCEPTION 'Current signature metadata is changing' USING ERRCODE='55P03';
 END IF;
 -- Fresh plain metadata only after the TRY lease. No full source body or
 -- command, assertion, fan identity or paid data is granted to this owner.
 IF NOT EXISTS(SELECT FROM creator.creator_profile WHERE id=c AND account_id=signer
  AND verification='verified' AND NOT recovery_required)
  OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id=signer) THEN
  RAISE EXCEPTION 'Current creator publication is unavailable' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('creatorId',c,'contentId',i.id,'version',i.version,
  'audience',jsonb_build_object('kind','public'),'sourceHash',r.ai_reuse_source_hash,
  'commandHash',r.ai_reuse_command_hash,'signedActId',a.id) ORDER BY i.id),'[]'::jsonb)
 INTO result FROM creator.content_index i
 JOIN creator.content_revision r ON r.content_id=i.id AND r.creator_id=i.creator_id AND r.version=i.version
 JOIN creator.content_publication p ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
 JOIN creator.signed_act a ON a.id=p.signed_act_id AND a.creator_id=c AND a.account_id=signer
  AND a.subject_id=i.id AND a.act_type='reply' AND a.content_hash=r.ai_reuse_command_hash
 JOIN creator.passkey_credential k ON k.id=a.credential_id AND k.account_id=signer AND k.revoked_at IS NULL
 JOIN creator.signed_act_consumption used ON used.signed_act_id=a.id AND used.account_id=signer
 JOIN creator.signed_publication sp ON sp.signed_act_id=a.id AND sp.account_id=signer AND sp.public_content AND sp.withdrawn_at IS NULL
 JOIN creator.signed_verification proof ON proof.id=a.id AND proof.account_id=signer AND proof.creator_id=c
  AND proof.act_type=a.act_type AND proof.content_hash=a.content_hash
  AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
 WHERE i.creator_id=c AND i.state='published' AND i.published_at IS NOT NULL AND i.withdrawn_at IS NULL
  AND i.kind='post' AND i.audience='{"kind":"public"}'::jsonb AND i.packet_id IS NULL
  AND i.quote_reply_id IS NULL AND i.quote_consent_version IS NULL
  AND r.author_account_id=signer AND r.ai_reuse_public_text IS TRUE
  AND r.ai_reuse_source_hash IS NOT NULL AND r.ai_reuse_command_hash IS NOT NULL
  AND p.author_kind='human_creator' AND p.author_account_id=signer AND p.published_at=i.published_at
  AND EXISTS(SELECT FROM jsonb_array_elements(origins) v WHERE (v->>'contentId')::uuid=i.id AND (v->>'version')::integer=i.version);
 IF jsonb_array_length(result)<>expected_count OR octet_length(result::text)>524288 THEN
  RAISE EXCEPTION 'A current public content origin changed or is unavailable' USING ERRCODE='55000';
 END IF;
 IF NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Generation purpose ended during the origin read' USING ERRCODE='42501';
 END IF;
 RETURN result;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_content_origins(uuid,uuid,jsonb) OWNER TO creator_w5_generation_origin;
REVOKE ALL ON FUNCTION creator.generation_content_origins(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_content_origins(uuid,uuid,jsonb)
 TO creator_generation_worker,creator_w2_generation_input;
-- W2's later reviewed retrieval migration may grant this same exact entrypoint
-- to its dedicated creator_w2_generation_retrieval NOLOGIN owner after creating
-- that role. There is no generic recipient registry or runtime grant operation.
-- W8 owns reviewed source/function receipts and activation. No ledger write.
COMMIT;
