-- Held0208: original actorless publication lifecycle. Never activate alone.
-- Original0071/0158 and original0204/0205 bytes remain unchanged. The actual
-- owner213 comparator and independently reviewed combined catalogue are
-- required for fulfillment; absence refuses without a substitute.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_publication_authority'
  AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb
  AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid))
 OR NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_publication_worker'
  AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb
  AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid))
 THEN RAISE EXCEPTION 'Original isolated publication purposes required'; END IF;
 IF to_regprocedure('creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text)') IS NULL
  OR to_regprocedure('creator.prepare_commerce_fulfillment_publication(uuid,uuid,integer,uuid,uuid)') IS NULL
  OR to_regprocedure('creator_trust.fulfillment_publication_denial(uuid)') IS NULL
  OR to_regprocedure('creator.fence_signature_metadata_write()') IS NULL
 THEN RAISE EXCEPTION 'Original0158/0204/0205 source required'; END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
   AND t.tgname='fence_signature_metadata_write' AND pg_get_userbyid(p.proowner)='creator_owner'
   AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
    'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
    'creator.signed_publication'::regclass,'creator.signed_verification'::regclass]))<>6 THEN
  RAISE EXCEPTION 'All original signature metadata write fences required'; END IF;
END $$;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.publication_preparation (
 nonce uuid PRIMARY KEY,token uuid NOT NULL UNIQUE,backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,login_name name NOT NULL,
 creator_id uuid NOT NULL,content_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 publisher_account_id uuid NOT NULL,signed_act_id uuid,kind text NOT NULL,packet_id uuid,
 fulfillment_nonce uuid,publication_nonce uuid,command_hash text,command jsonb,
 phase text NOT NULL CHECK(phase IN('prepared','bound','finalizing')),
 original_plan jsonb,original_families jsonb,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 UNIQUE(backend_pid,transaction_id,login_name),
 CHECK((publication_nonce IS NULL)=(command_hash IS NULL)),
 CHECK((command_hash IS NULL)=(command IS NULL)),
 CHECK(command_hash IS NULL OR command_hash~'^[a-f0-9]{64}$'),
 CHECK((fulfillment_nonce IS NULL)=(kind<>'public_answer' OR packet_id IS NOT NULL)),
 CHECK(original_families IS NULL OR (jsonb_typeof(original_families)='array'
  AND jsonb_array_length(original_families) BETWEEN 2 AND 100))
);
ALTER TABLE creator.publication_preparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.publication_preparation FORCE ROW LEVEL SECURITY;
CREATE POLICY publication_preparation_owner ON creator.publication_preparation
 TO creator_publication_authority
 USING(session_user='creator_publication_worker' AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user)
 WITH CHECK(session_user='creator_publication_worker' AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user);
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.publication_preparation TO creator_publication_authority;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_publication_authority;
-- PostgreSQL requires an UPDATE privilege/policy for a row-locking read.
-- WITH CHECK false forbids an actual revision edit under this purpose.
GRANT UPDATE(content_id) ON creator.content_revision TO creator_publication_authority;
CREATE POLICY publication_immutable_revision_lock ON creator.content_revision
 FOR UPDATE TO creator_publication_authority
 USING(EXISTS(SELECT FROM creator.publication_preparation x WHERE x.creator_id=content_revision.creator_id
  AND x.content_id=content_revision.content_id AND x.version=content_revision.version AND x.phase='bound'
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
  AND x.expires_at>clock_timestamp())) WITH CHECK(false);
GRANT SELECT(nonce,backend_pid,transaction_id,login_name,creator_id,creator_account_id,content_id,content_version,
 publisher_account_id,signed_act_id,plan_id,plan_revision,plan_hash,audience,recipient_count,negatives_ready,
 publication_nonce,command_hash,expires_at)
 ON creator.commerce_fulfillment_publication_scope TO creator_publication_authority;
CREATE POLICY publication_original_header ON creator.commerce_fulfillment_publication_scope
 FOR SELECT TO creator_publication_authority
 USING(session_user='creator_publication_worker' AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user);
RESET ROLE;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_publication_originals(uuid),
 creator.commerce_fulfillment_publication_matches(uuid) TO creator_publication_authority;

CREATE FUNCTION creator.require_publication_preparation_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.publication_preparation WHERE nonce=NEW.nonce) THEN
  RAISE EXCEPTION 'End the original publication preparation before COMMIT' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
SET LOCAL ROLE creator_owner;
CREATE CONSTRAINT TRIGGER require_publication_preparation_cleanup AFTER INSERT ON creator.publication_preparation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_publication_preparation_cleanup();
RESET ROLE;

CREATE FUNCTION creator.prepare_publication_task(c uuid,o uuid,v integer,p uuid,s uuid)
RETURNS TABLE(nonce uuid,token uuid,fulfillment_nonce uuid,proof jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE header record; owner_account uuid; stored_hash text; n uuid; t uuid; f uuid; body jsonb;
 original_expiry timestamptz=clock_timestamp()+interval '5 minutes'; family_expiry timestamptz;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR c IS NULL OR o IS NULL OR v IS NULL OR v<1 OR p IS NULL
  OR nullif(current_setting('publication.scope_id',true),'') IS NOT NULL
  OR EXISTS(SELECT FROM creator.publication_preparation)
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0208_w1_publication_preparation' AND checksum~'^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original registered publication task required' USING ERRCODE='42501'; END IF;
 -- Metadata only: no verification positive, key, document or recipient body.
 SELECT i.kind,i.packet_id INTO header FROM creator.content_index i
 JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
 WHERE i.creator_id=c AND i.id=o AND i.version=v AND i.state IN('media_pending','scheduled')
  AND i.withdrawn_at IS NULL AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original publication task changed' USING ERRCODE='42501'; END IF;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c;
 IF owner_account IS NULL THEN RAISE EXCEPTION 'Original publication owner missing' USING ERRCODE='42501'; END IF;
 SELECT content_hash INTO stored_hash FROM creator.signed_act WHERE id=s;
 -- Actual204 calls actual205 over every original family before body/positives.
 f=creator.prepare_commerce_fulfillment_publication(c,o,v,p,s);
 IF header.kind='public_answer' AND header.packet_id IS NULL AND f IS NULL THEN
  RAISE EXCEPTION 'Original fulfillment preparation missing' USING ERRCODE='42501'; END IF;
 IF f IS NOT NULL THEN
  SELECT x.expires_at INTO family_expiry FROM creator.commerce_fulfillment_publication_scope x WHERE x.nonce=f;
  IF family_expiry IS NULL THEN RAISE EXCEPTION 'Original fulfillment deadline missing' USING ERRCODE='42501'; END IF;
  original_expiry=LEAST(original_expiry,family_expiry);
 END IF;
 PERFORM set_config('publication.operation','discover',true),set_config('publication.creator_id',c::text,true),
  set_config('publication.content_id',o::text,true),set_config('publication.version',v::text,true),
  set_config('publication.publisher_account_id',p::text,true),set_config('publication.signed_act_id',coalesce(s::text,''),true),
  set_config('publication.command_hash',coalesce(stored_hash,''),true);
 IF creator_trust.publication_worker_denial(c,p) IS DISTINCT FROM 'allowed' THEN
  RAISE EXCEPTION 'Original publication negatives refused' USING ERRCODE='42501'; END IF;
 n=gen_random_uuid();t=gen_random_uuid();
 INSERT INTO creator.publication_preparation(nonce,token,backend_pid,transaction_id,login_name,creator_id,content_id,version,
  publisher_account_id,signed_act_id,kind,packet_id,fulfillment_nonce,phase,expires_at)
 VALUES(n,t,pg_backend_pid(),pg_current_xact_id(),session_user,c,o,v,p,s,header.kind,header.packet_id,f,'prepared',original_expiry);
 -- Old exact proof now follows actual early negatives. Neither this body nor
 -- the private tokens are exported as an interactive Actor or task DTO.
 body=creator.read_publication_task(c,o,v,p,s);
 IF body IS NULL THEN RAISE EXCEPTION 'Original exact publication proof unavailable' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT n,t,f,body;
END $$;

CREATE FUNCTION creator.bind_prepared_publication(n uuid,t uuid,h text,command_text text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.publication_preparation%ROWTYPE; issued creator.publication_worker_scope%ROWTYPE;
 plan jsonb; families jsonb;
BEGIN
 SELECT * INTO held FROM creator.publication_preparation x WHERE x.nonce=n AND x.token=t AND x.phase='prepared'
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
  AND x.expires_at>clock_timestamp();
 IF held.nonce IS NULL OR session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR NOT creator.begin_publication_scope(held.creator_id,held.content_id,held.version,held.publisher_account_id,
   held.signed_act_id,h,command_text) THEN RETURN false; END IF;
 SELECT * INTO issued FROM creator.publication_worker_scope x WHERE x.id=nullif(current_setting('publication.scope_id',true),'')::uuid
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
  AND x.creator_id=held.creator_id AND x.content_id=held.content_id AND x.version=held.version
  AND x.publisher_account_id=held.publisher_account_id AND x.signed_act_id IS NOT DISTINCT FROM held.signed_act_id AND x.command_hash=h;
 IF issued.id IS NULL THEN RETURN false; END IF;
 IF held.fulfillment_nonce IS NOT NULL THEN
  IF NOT creator.bind_commerce_fulfillment_publication(held.fulfillment_nonce,issued.id) THEN RETURN false; END IF;
  SELECT jsonb_build_object('planId',x.plan_id,'revision',x.plan_revision,'hash',x.plan_hash,'audience',x.audience,
   'recipientCount',x.recipient_count,'creatorAccountId',x.creator_account_id) INTO plan
  FROM creator.commerce_fulfillment_publication_scope x WHERE x.nonce=held.fulfillment_nonce AND x.publication_nonce=issued.id
   AND x.negatives_ready AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id()
   AND x.login_name=session_user AND x.expires_at>clock_timestamp();
  SELECT jsonb_agg(to_jsonb(original) ORDER BY original.thread_id,original.packet_id) INTO families
   FROM creator.commerce_fulfillment_publication_originals(held.fulfillment_nonce) original;
  IF plan IS NULL OR jsonb_array_length(families) IS DISTINCT FROM (plan->>'recipientCount')::integer THEN RETURN false; END IF;
 END IF;
 UPDATE creator.publication_preparation SET publication_nonce=issued.id,command_hash=issued.command_hash,command=issued.command,
  original_plan=plan,original_families=families,phase='bound',
  expires_at=LEAST(expires_at,issued.created_at+interval '5 minutes') WHERE nonce=n AND token=t;
 RETURN FOUND;
END $$;

-- Private owner213 input. W4 grants only its new reviewed NOLOGIN comparator
-- access to this fixed bounded original projection, never the login/PUBLIC.
CREATE FUNCTION creator.publication_preparation_originals(n uuid,t uuid)
RETURNS TABLE(creator_id uuid,content_id uuid,version integer,publisher_account_id uuid,signed_act_id uuid,
 publication_nonce uuid,fulfillment_nonce uuid,command_hash text,original_plan jsonb,original_families jsonb,finalizing boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'Original actorless preparation required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT x.creator_id,x.content_id,x.version,x.publisher_account_id,x.signed_act_id,x.publication_nonce,
  x.fulfillment_nonce,x.command_hash,x.original_plan,x.original_families,x.phase='finalizing'
 FROM creator.publication_preparation x JOIN creator.publication_worker_scope issued ON issued.id=x.publication_nonce
 WHERE x.nonce=n AND x.token=t AND x.phase IN('bound','finalizing') AND x.fulfillment_nonce IS NOT NULL
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
  AND x.expires_at>clock_timestamp() AND issued.id=nullif(current_setting('publication.scope_id',true),'')::uuid
  AND issued.backend_pid=x.backend_pid AND issued.transaction_id=x.transaction_id AND issued.login_name=x.login_name
  AND issued.creator_id=x.creator_id AND issued.content_id=x.content_id AND issued.version=x.version
  AND issued.publisher_account_id=x.publisher_account_id AND issued.signed_act_id=x.signed_act_id
  AND issued.command_hash=x.command_hash AND issued.command=x.command;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original bound preparation ended' USING ERRCODE='42501'; END IF;
END $$;

-- Private213 RLS predicate. Derive the one original held tuple internally;
-- never accept or export a private nonce/token, GUC alias or original body.
CREATE FUNCTION creator.publication_preparation_original_family_bound(c uuid,p uuid,f uuid,t uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed'
  AND c IS NOT NULL AND p IS NOT NULL AND f IS NOT NULL AND t IS NOT NULL
  AND EXISTS(SELECT FROM creator.publication_preparation x
   JOIN creator.publication_worker_scope issued ON issued.id=x.publication_nonce
   CROSS JOIN LATERAL jsonb_array_elements(x.original_families) family
   WHERE x.creator_id=c AND x.phase IN('bound','finalizing') AND x.fulfillment_nonce IS NOT NULL
    AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
    AND x.expires_at>clock_timestamp() AND issued.id=nullif(current_setting('publication.scope_id',true),'')::uuid
    AND issued.backend_pid=x.backend_pid AND issued.transaction_id=x.transaction_id AND issued.login_name=x.login_name
    AND issued.creator_id=x.creator_id AND issued.content_id=x.content_id AND issued.version=x.version
    AND issued.publisher_account_id=x.publisher_account_id AND issued.signed_act_id=x.signed_act_id
    AND issued.command_hash=x.command_hash AND issued.command=x.command
    AND family->>'creator_id'=c::text AND family->>'packet_id'=p::text
    AND family->>'fan_id'=f::text AND family->>'thread_id'=t::text)
$$;

CREATE FUNCTION creator.prepared_publication_matches(n uuid,t uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.publication_preparation%ROWTYPE;
BEGIN
 SELECT * INTO held FROM creator.publication_preparation x WHERE x.nonce=n AND x.token=t AND x.phase='bound'
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user
  AND x.expires_at>clock_timestamp() AND x.publication_nonce=nullif(current_setting('publication.scope_id',true),'')::uuid;
 RETURN session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed'
  AND held.nonce IS NOT NULL AND creator.publication_scope_matches(held.creator_id,held.content_id,held.version)
  AND (held.fulfillment_nonce IS NULL OR creator.commerce_fulfillment_publication_matches(held.fulfillment_nonce));
END $$;

CREATE FUNCTION creator.finish_prepared_publication(n uuid,t uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.publication_preparation%ROWTYPE; allowed boolean; owner_account uuid; signer uuid;
BEGIN
 IF NOT creator.prepared_publication_matches(n,t) THEN
  RAISE EXCEPTION 'Original bound publication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.publication_preparation x WHERE x.nonce=n AND x.token=t;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=held.creator_id;
 IF owner_account IS NULL THEN RAISE EXCEPTION 'Original publication creator missing' USING ERRCODE='42501'; END IF;
 -- The exact immutable revision has already been checked against the original
 -- signed command while204 is present. Hold its row before ending body access.
 PERFORM 1 FROM creator.content_revision r WHERE r.creator_id=held.creator_id AND r.content_id=held.content_id
  AND r.version=held.version FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original immutable publication revision missing' USING ERRCODE='42501'; END IF;
 UPDATE creator.publication_preparation SET phase='finalizing' WHERE nonce=n AND token=t;
 IF held.fulfillment_nonce IS NOT NULL THEN
  IF to_regprocedure('creator.fulfillment_publication_original_hash_matches(uuid,uuid)') IS NULL THEN
   RAISE EXCEPTION 'Actual original213 owner comparator unavailable' USING ERRCODE='55000'; END IF;
  PERFORM creator.end_commerce_fulfillment_publication(held.fulfillment_nonce);
  -- Actual owner213 must compare the retained bounded original tuple against
  -- current originals and hold its positive/financial/consent locks to COMMIT.
  -- It cannot reopen ended204 or read an interactive/viewer scope.
  EXECUTE 'SELECT creator.fulfillment_publication_original_hash_matches($1,$2)' INTO allowed USING n,t;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Current original fulfillment refused' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM creator.end_publication_scope();
 DELETE FROM creator.publication_preparation WHERE nonce=n AND token=t;
 IF NOT FOUND OR held.expires_at<=clock_timestamp()
  OR creator_trust.publication_worker_denial(held.creator_id,held.publisher_account_id) IS DISTINCT FROM 'allowed' THEN
  RAISE EXCEPTION 'Original publication currentness ended' USING ERRCODE='42501'; END IF;
 -- Execute original deferred cleanup before the last current read, and retain
 -- the actual0167 write/read account fence without waiting below domain locks.
 SET CONSTRAINTS ALL IMMEDIATE;
 FOR signer IN SELECT DISTINCT account FROM unnest(ARRAY[owner_account,held.publisher_account_id]) account ORDER BY account LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||signer::text,0)) THEN
   RAISE EXCEPTION 'Signature metadata is updating' USING ERRCODE='55P03'; END IF;
 END LOOP;
 -- LAST current domain/signature read: immutable revision stays locked; the
 -- current version, publisher, creator/key and exact consumed signed command
 -- cannot be replaced by a cached body proof after cleanup. Only RETURN/COMMIT.
 SELECT EXISTS(SELECT FROM creator.content_index i
  JOIN creator.creator_profile cp ON cp.id=i.creator_id
  JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
  LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id AND sa.account_id=pub.author_account_id AND sa.creator_id=i.creator_id AND sa.subject_id=i.id
  LEFT JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
  LEFT JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id
  LEFT JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id
  LEFT JOIN creator.signed_verification verification ON verification.id=sa.id AND verification.account_id=sa.account_id AND verification.creator_id=sa.creator_id
  WHERE i.id=held.content_id AND i.creator_id=held.creator_id AND i.version=held.version AND i.kind=held.kind
   AND i.packet_id IS NOT DISTINCT FROM held.packet_id AND i.state IN('scheduled','media_pending','published') AND i.withdrawn_at IS NULL
   AND i.audience=held.command->'content'->'document'->'audience'
   AND pub.media_evidence=coalesce(held.command->'content'->'mediaEvidence','[]'::jsonb)
   AND i.scheduled_at IS NOT DISTINCT FROM nullif(held.command->'content'->'document'->>'scheduledAt','')::timestamptz
   AND (i.state<>'published' OR (i.published_at IS NOT NULL AND pub.published_at=i.published_at))
   AND held.expires_at>clock_timestamp()
   AND NOT EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(owner_account,held.publisher_account_id))
   AND cp.account_id=owner_account AND cp.verification='verified' AND NOT cp.recovery_required AND pub.author_account_id=held.publisher_account_id
   AND pub.signed_act_id IS NOT DISTINCT FROM held.signed_act_id
   AND EXISTS(SELECT FROM pg_database db WHERE db.datname=current_database() AND db.datconnlimit<>0
    AND shobj_description(db.oid,'pg_database') IS DISTINCT FROM 'creator-platform:restored-traffic-closed')
   AND ((held.signed_act_id IS NOT NULL AND cp.account_id=held.publisher_account_id AND pub.author_kind IN('human_broadcast','human_creator')
    AND sa.act_type=CASE WHEN i.kind='note' THEN 'broadcast' ELSE 'reply' END AND sa.content_hash=held.command_hash
    AND consumed.signed_act_id IS NOT NULL AND sp.command=held.command AND sp.withdrawn_at IS NULL
    AND key.id IS NOT NULL AND key.revoked_at IS NULL AND verification.id IS NOT NULL
    AND verification.act_type=sa.act_type AND verification.content_hash=sa.content_hash
    AND NOT verification.key_revoked AND NOT verification.creator_revoked AND NOT verification.withdrawn)
   OR (held.signed_act_id IS NULL AND cp.account_id<>held.publisher_account_id AND pub.author_kind='team' AND i.kind='post'
    AND EXISTS(SELECT FROM creator.team_membership team WHERE team.creator_id=i.creator_id AND team.account_id=held.publisher_account_id
     AND team.revoked_at IS NULL AND 'publisher'=ANY(team.roles))))) INTO allowed;
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Current exact publication signature/domain refused' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;

DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT unnest(ARRAY[
  'creator.require_publication_preparation_cleanup()'::regprocedure,
  'creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid)'::regprocedure,
  'creator.bind_prepared_publication(uuid,uuid,text,text)'::regprocedure,
  'creator.publication_preparation_originals(uuid,uuid)'::regprocedure,
  'creator.publication_preparation_original_family_bound(uuid,uuid,uuid,uuid)'::regprocedure,
  'creator.prepared_publication_matches(uuid,uuid)'::regprocedure,
  'creator.finish_prepared_publication(uuid,uuid)'::regprocedure]) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO creator_publication_authority',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 END LOOP;
END $$;
-- A login cannot bypass the new early preparation using old raw issuers.
REVOKE EXECUTE ON FUNCTION creator.read_publication_task(uuid,uuid,integer,uuid,uuid),
 creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text),creator.end_publication_scope()
 FROM creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid),
 creator.bind_prepared_publication(uuid,uuid,text,text),creator.prepared_publication_matches(uuid,uuid),
 creator.finish_prepared_publication(uuid,uuid) TO creator_publication_worker;
COMMIT;
