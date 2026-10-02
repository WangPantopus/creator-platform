-- Reserved 0071_w1_publication_worker_scope. PROPOSAL: W8 review/registration
-- and additive 0073 publication denial are required before canonical activation.
-- No passwords, impersonated account/session, signing write or private fan grant.
BEGIN;
CREATE ROLE creator_publication_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE creator_publication_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_publication_worker,creator_publication_authority;
SET LOCAL ROLE creator_owner;

CREATE TABLE creator.publication_worker_scope (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id xid8 NOT NULL,
 backend_pid integer NOT NULL, login_name name NOT NULL,
 creator_id uuid NOT NULL, content_id uuid NOT NULL, version integer NOT NULL CHECK(version>0),
 publisher_account_id uuid NOT NULL, signed_act_id uuid, command_hash text NOT NULL CHECK(command_hash~'^[a-f0-9]{64}$'),
 command jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX publication_scope_expiry ON creator.publication_worker_scope(created_at);
ALTER TABLE creator.publication_worker_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.publication_worker_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY authority_scope ON creator.publication_worker_scope TO creator_publication_authority USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON creator.publication_worker_scope TO creator_publication_authority;

-- Existing interactive policies were PUBLIC and accepted app.* settings.
-- Keep those policies for their actual existing role; a worker cannot forge
-- app.content_id/app.account_id to enter them. Immutable applied SQL is unchanged.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['content_index','content_revision','content_publication','content_effect'] LOOP
  FOR p IN SELECT polname FROM pg_policy WHERE polrelid=('creator.'||t)::regclass LOOP
   EXECUTE format('ALTER POLICY %I ON creator.%I TO creator_runtime',p.polname,t);
  END LOOP;
  EXECUTE format('CREATE POLICY publication_authority_read ON creator.%I FOR SELECT TO creator_publication_authority USING(true)',t);
 END LOOP;
END $$;
GRANT SELECT ON creator.content_index,creator.content_revision,creator.content_publication TO creator_publication_authority;
GRANT SELECT(id,account_id,verification,recovery_required),UPDATE(id) ON creator.creator_profile TO creator_publication_authority;
GRANT SELECT(creator_id,account_id,roles,revoked_at),UPDATE(creator_id) ON creator.team_membership TO creator_publication_authority;
GRANT SELECT(id,account_id,revoked_at),UPDATE(id) ON creator.passkey_credential TO creator_publication_authority;
GRANT SELECT(id,account_id,credential_id,creator_id,act_type,subject_id,content_hash) ON creator.signed_act TO creator_publication_authority;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_publication_authority;
GRANT SELECT(signed_act_id,account_id,command,withdrawn_at) ON creator.signed_publication TO creator_publication_authority;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn) ON creator.signed_verification TO creator_publication_authority;
GRANT SELECT(account_id) ON creator.content_tombstone TO creator_publication_authority;
CREATE POLICY publication_authority_metadata ON creator.creator_profile FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_lock ON creator.creator_profile FOR UPDATE TO creator_publication_authority USING(true) WITH CHECK(false);
CREATE POLICY publication_authority_metadata ON creator.team_membership FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_lock ON creator.team_membership FOR UPDATE TO creator_publication_authority USING(true) WITH CHECK(false);
CREATE POLICY publication_authority_metadata ON creator.passkey_credential FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_lock ON creator.passkey_credential FOR UPDATE TO creator_publication_authority USING(true) WITH CHECK(false);
CREATE POLICY publication_authority_metadata ON creator.signed_act FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_metadata ON creator.signed_act_consumption FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_metadata ON creator.signed_publication FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_metadata ON creator.signed_verification FOR SELECT TO creator_publication_authority USING(true);
CREATE POLICY publication_authority_metadata ON creator.content_tombstone FOR SELECT TO creator_publication_authority USING(true);

-- Internal bounded projection. Never grant directly to the login role. A live
-- host restoration check precedes entry; the DB negative projection is required
-- as well and holds sorted denial locks before positive identity/domain locks.
CREATE FUNCTION creator.publication_task_proof(c uuid,o uuid,v integer,p uuid,s uuid,operation text,h text,finished boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_account uuid; stored_hash text; denial text; proof jsonb; expected jsonb;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR
    c IS NULL OR o IS NULL OR p IS NULL OR v IS NULL OR v<1 OR operation NOT IN('discover','issue') THEN RETURN NULL; END IF;
 IF to_regprocedure('creator_trust.publication_worker_denial(uuid,uuid)') IS NULL THEN RETURN NULL; END IF;
 SELECT cp.account_id,sa.content_hash INTO owner_account,stored_hash
 FROM creator.creator_profile cp JOIN creator.content_index i ON i.creator_id=cp.id
 JOIN creator.content_publication pub ON pub.creator_id=i.creator_id AND pub.content_id=i.id AND pub.version=i.version
 LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id
 WHERE cp.id=c AND i.id=o AND i.version=v AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s
   AND cp.verification='verified' AND NOT cp.recovery_required
   AND (i.state IN('media_pending','scheduled') OR (finished AND i.state='published'));
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(p,owner_account)) THEN RETURN NULL; END IF;
 PERFORM set_config('publication.operation',operation,true),set_config('publication.creator_id',c::text,true),
   set_config('publication.content_id',o::text,true),set_config('publication.version',v::text,true),
   set_config('publication.publisher_account_id',p::text,true),set_config('publication.signed_act_id',coalesce(s::text,''),true),
   set_config('publication.command_hash',coalesce(h,stored_hash,''),true);
 -- Deferred exact lookup permits installation before 0073, with zero issuance.
 EXECUTE 'SELECT creator_trust.publication_worker_denial($1,$2)' INTO denial USING c,p;
 IF denial IS DISTINCT FROM 'allowed' THEN RETURN NULL; END IF;

 SELECT jsonb_build_object('creatorId',c,'contentId',o,'version',v,'publisherAccountId',p,'signedActId',s,
   'document',r.document,'mediaEvidence',pub.media_evidence,'command',sp.command,'commandHash',sa.content_hash)
 INTO proof FROM creator.content_index i
 JOIN creator.content_revision r ON r.content_id=i.id AND r.creator_id=i.creator_id AND r.version=i.version
 JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
 LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id AND sa.account_id=pub.author_account_id AND sa.creator_id=i.creator_id AND sa.subject_id=i.id
 LEFT JOIN creator.signed_act_consumption sac ON sac.signed_act_id=sa.id AND sac.account_id=sa.account_id
 LEFT JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id
 LEFT JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=sa.account_id
 LEFT JOIN creator.signed_verification sv ON sv.id=sa.id AND sv.account_id=sa.account_id AND sv.creator_id=sa.creator_id
 WHERE i.id=o AND i.creator_id=c AND i.version=v AND r.document->>'kind'=i.kind
   AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s
   AND (i.state IN('media_pending','scheduled') OR (finished AND i.state='published'))
   AND ((s IS NOT NULL AND p=owner_account AND pub.author_kind IN('human_broadcast','human_creator')
     AND sa.act_type=CASE WHEN i.kind='note' THEN 'broadcast' ELSE 'reply' END
     AND sac.signed_act_id IS NOT NULL AND sp.withdrawn_at IS NULL AND pc.id IS NOT NULL AND pc.revoked_at IS NULL
     AND sv.id IS NOT NULL AND sv.act_type=sa.act_type AND sv.content_hash=sa.content_hash
     AND NOT sv.key_revoked AND NOT sv.creator_revoked AND NOT sv.withdrawn)
   OR (s IS NULL AND pub.author_kind='team' AND p<>owner_account AND i.kind='post'
     AND r.document->'media'='[]'::jsonb AND pub.media_evidence='[]'::jsonb AND r.document->'quote'='null'::jsonb
     AND EXISTS(SELECT FROM creator.team_membership tm WHERE tm.creator_id=c AND tm.account_id=p AND tm.revoked_at IS NULL AND 'publisher'=ANY(tm.roles))));
 IF NOT FOUND THEN RETURN NULL; END IF;
 expected := jsonb_build_object('actType',CASE WHEN proof->'document'->>'kind'='note' THEN 'broadcast' ELSE 'reply' END,
   'subjectId',o,'content',jsonb_build_object('kind','content_publication','creatorId',c,'version',v,'document',proof->'document') ||
   CASE WHEN proof->'mediaEvidence'='[]'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('mediaEvidence',proof->'mediaEvidence') END);
 IF s IS NOT NULL AND proof->'command' IS DISTINCT FROM expected THEN RETURN NULL; END IF;
 RETURN proof;
END $$;

CREATE FUNCTION creator.read_publication_task(c uuid,o uuid,v integer,p uuid,s uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT creator.publication_task_proof(c,o,v,p,s,'discover',NULL,false)
$$;
CREATE FUNCTION creator.pending_publication_tasks(n integer) RETURNS TABLE(candidate jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_publication_worker' OR n IS NULL OR n<1 OR n>20 OR current_setting('transaction_isolation')<>'read committed' THEN RETURN; END IF;
 RETURN QUERY SELECT jsonb_build_object('creatorId',i.creator_id,'contentId',i.id,'version',i.version,
   'publisherAccountId',p.author_account_id,'signedActId',p.signed_act_id)
   FROM creator.content_index i JOIN creator.content_publication p ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
   WHERE i.state='media_pending' OR (i.state='scheduled' AND i.scheduled_at<=now())
   ORDER BY i.scheduled_at NULLS FIRST,i.id LIMIT n;
END $$;

CREATE FUNCTION creator.begin_publication_scope(c uuid,o uuid,v integer,p uuid,s uuid,h text,command_text text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb; expected jsonb; nonce uuid; owner_account uuid; credential text;
BEGIN
 IF session_user<>'creator_publication_worker' OR h IS NULL OR h!~'^[a-f0-9]{64}$' OR command_text IS NULL OR
   octet_length(command_text)>524288 OR encode(sha256(convert_to(command_text,'UTF8')),'hex')<>h THEN RETURN false; END IF;
 IF nullif(current_setting('publication.scope_id',true),'') IS NOT NULL THEN RETURN false; END IF;
 proof := creator.publication_task_proof(c,o,v,p,s,'issue',h,false);
 IF proof IS NULL THEN RETURN false; END IF;
 -- Identity locks precede W5 object locks. Domain withdrawal/edit paths hold
 -- their current index; W5 rechecks it under its lock before committing work.
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c AND verification='verified' AND NOT recovery_required FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF s IS NULL THEN
  PERFORM 1 FROM creator.team_membership WHERE creator_id=c AND account_id=p AND revoked_at IS NULL AND 'publisher'=ANY(roles) FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
 ELSE
  SELECT credential_id INTO credential FROM creator.signed_act WHERE id=s AND account_id=p AND p=owner_account;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM creator.passkey_credential WHERE id=credential AND account_id=p AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 proof := creator.publication_task_proof(c,o,v,p,s,'issue',h,false);
 IF proof IS NULL THEN RETURN false; END IF;
 expected := jsonb_build_object('actType',CASE WHEN proof->'document'->>'kind'='note' THEN 'broadcast' ELSE 'reply' END,
   'subjectId',o,'content',jsonb_build_object('kind','content_publication','creatorId',c,'version',v,'document',proof->'document') ||
   CASE WHEN proof->'mediaEvidence'='[]'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('mediaEvidence',proof->'mediaEvidence') END);
 IF command_text::jsonb IS DISTINCT FROM expected OR
   (s IS NOT NULL AND (proof->>'commandHash' IS DISTINCT FROM h OR proof->'command' IS DISTINCT FROM expected)) THEN RETURN false; END IF;
 DELETE FROM creator.publication_worker_scope WHERE created_at<now()-interval '1 day';
 INSERT INTO creator.publication_worker_scope(transaction_id,backend_pid,login_name,creator_id,content_id,version,publisher_account_id,signed_act_id,command_hash,command)
 VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,c,o,v,p,s,h,expected) RETURNING id INTO nonce;
 PERFORM set_config('publication.scope_id',nonce::text,true);
 RETURN true;
END $$;

CREATE FUNCTION creator.publication_scope_matches(c uuid,o uuid,v integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sealed creator.publication_worker_scope%ROWTYPE; proof jsonb; expected jsonb;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
 SELECT * INTO sealed FROM creator.publication_worker_scope
 WHERE id=nullif(current_setting('publication.scope_id',true),'')::uuid AND transaction_id=pg_current_xact_id()
   AND backend_pid=pg_backend_pid() AND login_name=session_user AND creator_id=c AND content_id=o AND version=v
   AND created_at>now()-interval '5 minutes';
 IF NOT FOUND THEN RETURN false; END IF;
 proof := creator.publication_task_proof(c,o,v,sealed.publisher_account_id,sealed.signed_act_id,'issue',sealed.command_hash,true);
 IF proof IS NULL THEN RETURN false; END IF;
 expected := jsonb_build_object('actType',CASE WHEN proof->'document'->>'kind'='note' THEN 'broadcast' ELSE 'reply' END,
   'subjectId',o,'content',jsonb_build_object('kind','content_publication','creatorId',c,'version',v,'document',proof->'document') ||
   CASE WHEN proof->'mediaEvidence'='[]'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('mediaEvidence',proof->'mediaEvidence') END);
 RETURN expected=sealed.command AND (sealed.signed_act_id IS NULL OR proof->>'commandHash'=sealed.command_hash);
END $$;
CREATE FUNCTION creator.end_publication_scope() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_publication_worker' THEN RETURN; END IF;
 DELETE FROM creator.publication_worker_scope WHERE id=nullif(current_setting('publication.scope_id',true),'')::uuid
   AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user;
 PERFORM set_config('publication.scope_id','',true);
END $$;

CREATE POLICY publication_worker_read ON creator.content_index FOR SELECT TO creator_publication_worker
 USING(creator.publication_scope_matches(creator_id,id,version));
CREATE POLICY publication_worker_update ON creator.content_index FOR UPDATE TO creator_publication_worker
 USING(creator.publication_scope_matches(creator_id,id,version))
 WITH CHECK(creator.publication_scope_matches(creator_id,id,version) AND
   ((state='published' AND published_at=now()) OR (state='scheduled' AND published_at IS NULL)));
CREATE POLICY publication_worker_read ON creator.content_revision FOR SELECT TO creator_publication_worker
 USING(creator.publication_scope_matches(creator_id,content_id,version));
CREATE POLICY publication_worker_read ON creator.content_publication FOR SELECT TO creator_publication_worker
 USING(creator.publication_scope_matches(creator_id,content_id,version));
CREATE POLICY publication_worker_update ON creator.content_publication FOR UPDATE TO creator_publication_worker
 USING(creator.publication_scope_matches(creator_id,content_id,version))
 WITH CHECK(creator.publication_scope_matches(creator_id,content_id,version) AND published_at=now());
CREATE POLICY publication_worker_effect ON creator.content_effect FOR INSERT TO creator_publication_worker
 WITH CHECK(creator.publication_scope_matches(creator_id,content_id,version) AND type IN('published','source_candidate'));
GRANT SELECT ON creator.content_index,creator.content_revision,creator.content_publication TO creator_publication_worker;
GRANT UPDATE(state,published_at) ON creator.content_index TO creator_publication_worker;
GRANT UPDATE(published_at) ON creator.content_publication TO creator_publication_worker;
GRANT INSERT(creator_id,content_id,version,type) ON creator.content_effect TO creator_publication_worker;
RESET ROLE;
ALTER FUNCTION creator.publication_task_proof(uuid,uuid,integer,uuid,uuid,text,text,boolean) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.read_publication_task(uuid,uuid,integer,uuid,uuid) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.pending_publication_tasks(integer) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.publication_scope_matches(uuid,uuid,integer) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.end_publication_scope() OWNER TO creator_publication_authority;
REVOKE ALL ON FUNCTION creator.publication_task_proof(uuid,uuid,integer,uuid,uuid,text,text,boolean),
 creator.read_publication_task(uuid,uuid,integer,uuid,uuid),creator.pending_publication_tasks(integer),
 creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text),creator.publication_scope_matches(uuid,uuid,integer),
 creator.end_publication_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.read_publication_task(uuid,uuid,integer,uuid,uuid),creator.pending_publication_tasks(integer),
 creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text),creator.publication_scope_matches(uuid,uuid,integer),
 creator.end_publication_scope() TO creator_publication_worker;
COMMIT;
