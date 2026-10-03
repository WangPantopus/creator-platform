-- Held0204_w4_fulfillment_publication_consumer. W8 owns activation.
-- Early metadata only, before any publication document or identity positive.
-- Actual0205 supplies all original-family negatives; actual0208 supplies the
-- separate W1 lifecycle. No Actor, interactive viewer or Team grant is reused.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_publication_metadata') THEN
  RAISE EXCEPTION 'A pre-existing publication metadata owner needs independent review';
 END IF;
 CREATE ROLE creator_fulfillment_publication_metadata NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_publication_worker' AND r.rolcanlogin
  AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
  AND r.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) THEN
  RAISE EXCEPTION 'The original separate publication worker is required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_fulfillment_publication_metadata;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_fulfillment_publication_scope (
 nonce uuid PRIMARY KEY,backend_pid integer NOT NULL,transaction_id xid8 NOT NULL,login_name name NOT NULL,
 creator_id uuid NOT NULL,creator_account_id uuid NOT NULL,content_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version>0),
 publisher_account_id uuid NOT NULL,signed_act_id uuid NOT NULL,
 plan_id uuid NOT NULL,plan_revision integer NOT NULL CHECK(plan_revision>0),plan_hash text NOT NULL CHECK(plan_hash~'^[a-f0-9]{64}$'),
 audience jsonb NOT NULL,recipient_count integer NOT NULL CHECK(recipient_count BETWEEN 2 AND 100),
 negatives_ready boolean NOT NULL DEFAULT false,publication_nonce uuid,command_hash text,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 UNIQUE(backend_pid,transaction_id,login_name),
 FOREIGN KEY(plan_id,plan_revision) REFERENCES creator.commerce_fulfillment_plan(id,revision),
 CHECK(command_hash IS NULL OR command_hash~'^[a-f0-9]{64}$'),
 CHECK((publication_nonce IS NULL)=(command_hash IS NULL)),
 CHECK(audience=jsonb_build_object('kind','public') OR audience=jsonb_build_object('kind','groups','ids',jsonb_build_array(plan_id)))
);
ALTER TABLE creator.commerce_fulfillment_publication_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_fulfillment_publication_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY fulfillment_publication_scope_owner ON creator.commerce_fulfillment_publication_scope
 TO creator_fulfillment_publication_metadata
 USING(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND login_name=session_user)
 WITH CHECK(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND login_name=session_user
  AND session_user='creator_publication_worker');
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.commerce_fulfillment_publication_scope TO creator_fulfillment_publication_metadata;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_fulfillment_publication_metadata;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_fulfillment_publication_metadata;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_fulfillment_publication_metadata;
GRANT SELECT(id,creator_id,version,state,kind,packet_id,audience,withdrawn_at) ON creator.content_index TO creator_fulfillment_publication_metadata;
GRANT SELECT(content_id,creator_id,version,author_account_id,signed_act_id) ON creator.content_publication TO creator_fulfillment_publication_metadata;
GRANT SELECT(id,revision,creator_id,content_id,content_version,audience,minimum_recipients,recipient_count,source_hash,created_by)
 ON creator.commerce_fulfillment_plan TO creator_fulfillment_publication_metadata;
GRANT SELECT(plan_id,plan_revision,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,mode_id,mode_version,
 acceptance_id,acceptance_hash,request_hash,consent_hash,capture_id,capture_hash)
 ON creator.commerce_fulfillment_member TO creator_fulfillment_publication_metadata;
GRANT SELECT(id,transaction_id,backend_pid,login_name,creator_id,content_id,version,publisher_account_id,signed_act_id,command_hash,created_at)
 ON creator.publication_worker_scope TO creator_fulfillment_publication_metadata;
-- This isolated NOLOGIN owner exposes fixed bounded metadata functions only.
-- It has no answer document, original question, signing assertion or write grant
-- on an original service, financial record, message, frame or publication.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['creator_profile','fan_profile','content_index','content_publication','commerce_fulfillment_plan','commerce_fulfillment_member','publication_worker_scope'] LOOP
  EXECUTE format('CREATE POLICY fulfillment_publication_metadata ON creator.%I FOR SELECT TO creator_fulfillment_publication_metadata USING(session_user=''creator_publication_worker'' AND current_setting(''transaction_isolation'')=''read committed'')',t);
 END LOOP;
END $$;

-- A fixed header lookup is also the guard for the original0071 body reader.
-- Ordinary tasks retain their existing policies; every packetless public answer
-- needs a real early plan scope, even if a malformed document omits planRef.
CREATE FUNCTION creator.commerce_fulfillment_publication_document_ready(c uuid,i uuid,v integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT FROM creator.content_index x WHERE x.creator_id=c AND x.id=i AND x.version=v
   AND x.kind='public_answer' AND x.packet_id IS NULL) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope held
  JOIN creator.commerce_fulfillment_plan plan ON plan.id=held.plan_id AND plan.revision=held.plan_revision
  WHERE held.creator_id=c AND held.content_id=i AND held.content_version=v AND held.negatives_ready
   AND held.backend_pid=pg_backend_pid() AND held.transaction_id=pg_current_xact_id() AND held.login_name=session_user
   AND held.expires_at>clock_timestamp() AND plan.creator_id=c AND plan.content_id=i AND plan.content_version=v
   AND plan.source_hash=held.plan_hash AND plan.audience=held.audience AND plan.recipient_count=held.recipient_count);
END $$;
CREATE POLICY fulfillment_publication_before_body ON creator.content_revision AS RESTRICTIVE
 FOR SELECT TO creator_publication_authority,creator_publication_worker
 USING(creator.commerce_fulfillment_publication_document_ready(creator_id,content_id,version));

CREATE FUNCTION creator.prepare_commerce_fulfillment_publication(c uuid,i uuid,v integer,p uuid,s uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE header record; owner_account uuid; n uuid; denial text; count_members integer;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0204_w4_fulfillment_publication_consumer') THEN
  RAISE EXCEPTION 'The original publication consumer is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR c IS NULL OR i IS NULL OR v IS NULL OR v<1 OR p IS NULL THEN
  RAISE EXCEPTION 'The actual publication task is required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope) THEN
  RAISE EXCEPTION 'Finish the original publication task first' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM creator.content_index x WHERE x.creator_id=c AND x.id=i AND x.version=v
  AND x.kind='public_answer' AND x.packet_id IS NULL) THEN RETURN NULL; END IF;
 -- No document, source body or creator/key lock is acquired here.
 SELECT plan.* INTO header FROM creator.commerce_fulfillment_plan plan
 JOIN creator.content_index x ON x.id=plan.content_id AND x.creator_id=plan.creator_id AND x.version=plan.content_version
 JOIN creator.content_publication pub ON pub.content_id=x.id AND pub.creator_id=x.creator_id AND pub.version=x.version
 WHERE plan.creator_id=c AND plan.content_id=i AND plan.content_version=v
  AND x.kind='public_answer' AND x.packet_id IS NULL AND x.state IN('scheduled','media_pending') AND x.withdrawn_at IS NULL
  AND x.audience=plan.audience AND pub.author_account_id=p AND pub.signed_act_id=s AND s IS NOT NULL;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c;
 IF header.id IS NULL OR owner_account IS NULL OR header.created_by<>owner_account OR p<>owner_account
  OR header.recipient_count NOT BETWEEN header.minimum_recipients AND 100 OR header.minimum_recipients NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'The actual creator-signed original plan is required' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO count_members FROM creator.commerce_fulfillment_member m JOIN creator.fan_profile f ON f.id=m.fan_id
 WHERE m.plan_id=header.id AND m.plan_revision=header.revision AND m.creator_id=c;
 IF count_members<>header.recipient_count THEN RAISE EXCEPTION 'The original plan members changed' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0205_w8_fulfillment_publication_denial')
  OR to_regprocedure('creator_trust.fulfillment_publication_denial(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Original publication-family denial is not activated' USING ERRCODE='55000'; END IF;
 n=gen_random_uuid();
 INSERT INTO creator.commerce_fulfillment_publication_scope(nonce,backend_pid,transaction_id,login_name,creator_id,creator_account_id,
  content_id,content_version,publisher_account_id,signed_act_id,plan_id,plan_revision,plan_hash,audience,recipient_count)
 VALUES(n,pg_backend_pid(),pg_current_xact_id(),session_user,c,owner_account,i,v,p,s,header.id,header.revision,header.source_hash,header.audience,header.recipient_count);
 -- Actual205 receives only this original private nonce, never a caller fan list.
 -- It holds the complete original family negatives on this exact transaction.
 EXECUTE 'SELECT creator_trust.fulfillment_publication_denial($1)' INTO denial USING n;
 IF denial IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'Original publication-family denial refused' USING ERRCODE='42501'; END IF;
 UPDATE creator.commerce_fulfillment_publication_scope SET negatives_ready=true WHERE nonce=n;
 IF NOT creator.commerce_fulfillment_publication_document_ready(c,i,v) THEN
  RAISE EXCEPTION 'The original prepared plan changed' USING ERRCODE='42501'; END IF;
 RETURN n;
END $$;

-- Only actual205's reviewed NOLOGIN producer may be granted this entry in205.
-- PUBLIC, the worker login, Team and interactive runtime receive no execution.
CREATE FUNCTION creator.commerce_fulfillment_publication_negative_originals(n uuid)
RETURNS TABLE(packet_id uuid,commitment_id uuid,thread_id uuid,fan_id uuid,fan_account_id uuid,creator_id uuid,creator_account_id uuid,
 packet_version integer,commitment_version integer,mode_id uuid,mode_version integer,acceptance_id uuid,acceptance_hash text,
 request_hash text,consent_hash text,capture_id uuid,capture_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.commerce_fulfillment_publication_scope%ROWTYPE;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR n IS NULL THEN
  RAISE EXCEPTION 'The original publication preparation is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.commerce_fulfillment_publication_scope x WHERE x.nonce=n AND x.backend_pid=pg_backend_pid()
  AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user AND x.expires_at>clock_timestamp();
 IF held.nonce IS NULL THEN RAISE EXCEPTION 'The original publication preparation ended' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT m.packet_id,m.commitment_id,m.thread_id,m.fan_id,f.account_id,m.creator_id,held.creator_account_id,
  m.packet_version,m.commitment_version,m.mode_id,m.mode_version,m.acceptance_id,m.acceptance_hash,m.request_hash,m.consent_hash,m.capture_id,m.capture_hash
  FROM creator.commerce_fulfillment_member m JOIN creator.fan_profile f ON f.id=m.fan_id
  WHERE m.plan_id=held.plan_id AND m.plan_revision=held.plan_revision AND m.creator_id=held.creator_id ORDER BY m.thread_id,m.packet_id;
 IF (SELECT count(*) FROM creator.commerce_fulfillment_member m JOIN creator.fan_profile f ON f.id=m.fan_id
  WHERE m.plan_id=held.plan_id AND m.plan_revision=held.plan_revision AND m.creator_id=held.creator_id)<>held.recipient_count THEN
  RAISE EXCEPTION 'The complete original publication families are required' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION creator.bind_commerce_fulfillment_publication(n uuid,w uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.commerce_fulfillment_publication_scope%ROWTYPE; issued record;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR n IS NULL OR w IS NULL THEN RETURN false; END IF;
 SELECT * INTO held FROM creator.commerce_fulfillment_publication_scope x WHERE x.nonce=n AND x.negatives_ready
  AND x.backend_pid=pg_backend_pid() AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user AND x.expires_at>clock_timestamp();
 SELECT id,command_hash INTO issued FROM creator.publication_worker_scope x WHERE x.id=w
  AND x.id=nullif(current_setting('publication.scope_id',true),'')::uuid AND x.backend_pid=pg_backend_pid()
  AND x.transaction_id=pg_current_xact_id() AND x.login_name=session_user AND x.creator_id=held.creator_id
  AND x.content_id=held.content_id AND x.version=held.content_version AND x.publisher_account_id=held.publisher_account_id
  AND x.signed_act_id=held.signed_act_id AND x.created_at>clock_timestamp()-interval '5 minutes';
 IF held.nonce IS NULL OR issued.id IS NULL OR held.publication_nonce IS NOT NULL
  OR NOT creator.commerce_fulfillment_publication_document_ready(held.creator_id,held.content_id,held.content_version) THEN RETURN false; END IF;
 UPDATE creator.commerce_fulfillment_publication_scope SET publication_nonce=issued.id,command_hash=issued.command_hash WHERE nonce=n;
 RETURN true;
END $$;
CREATE FUNCTION creator.commerce_fulfillment_publication_matches(n uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed'
  AND EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope held JOIN creator.publication_worker_scope issued ON issued.id=held.publication_nonce
   WHERE held.nonce=n AND held.negatives_ready AND held.backend_pid=pg_backend_pid() AND held.transaction_id=pg_current_xact_id()
    AND held.login_name=session_user AND held.expires_at>clock_timestamp()
    AND issued.id=nullif(current_setting('publication.scope_id',true),'')::uuid AND issued.backend_pid=held.backend_pid
    AND issued.transaction_id=held.transaction_id AND issued.login_name=held.login_name AND issued.creator_id=held.creator_id
    AND issued.content_id=held.content_id AND issued.version=held.content_version AND issued.publisher_account_id=held.publisher_account_id
    AND issued.signed_act_id=held.signed_act_id AND issued.command_hash=held.command_hash
    AND issued.created_at>clock_timestamp()-interval '5 minutes'
    AND creator.commerce_fulfillment_publication_document_ready(held.creator_id,held.content_id,held.content_version))
$$;
CREATE FUNCTION creator.commerce_fulfillment_publication_originals(n uuid)
RETURNS TABLE(packet_id uuid,commitment_id uuid,thread_id uuid,fan_id uuid,fan_account_id uuid,creator_id uuid,creator_account_id uuid,
 packet_version integer,commitment_version integer,mode_id uuid,mode_version integer,acceptance_id uuid,acceptance_hash text,
 request_hash text,consent_hash text,capture_id uuid,capture_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT creator.commerce_fulfillment_publication_matches(n) THEN
  RAISE EXCEPTION 'The genuine bound publication scope is required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM creator.commerce_fulfillment_publication_negative_originals(n);
END $$;
-- Cleanup belongs inside actual208's joint final SQL operation, before its last
-- domain/current-signature read. This function is no signature or delivery gate.
CREATE FUNCTION creator.end_commerce_fulfillment_publication(n uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT creator.commerce_fulfillment_publication_matches(n) THEN
  RAISE EXCEPTION 'The genuine bound publication scope is required' USING ERRCODE='42501'; END IF;
 DELETE FROM creator.commerce_fulfillment_publication_scope held WHERE held.nonce=n;
 IF NOT FOUND THEN RAISE EXCEPTION 'The original publication preparation changed' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION creator.require_fulfillment_publication_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.commerce_fulfillment_publication_scope held WHERE held.nonce=NEW.nonce) THEN
  RAISE EXCEPTION 'End the original fulfillment publication before COMMIT' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_fulfillment_publication_cleanup AFTER INSERT ON creator.commerce_fulfillment_publication_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_fulfillment_publication_cleanup();
RESET ROLE;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT unnest(ARRAY[
  'creator.commerce_fulfillment_publication_document_ready(uuid,uuid,integer)'::regprocedure,
  'creator.prepare_commerce_fulfillment_publication(uuid,uuid,integer,uuid,uuid)'::regprocedure,
  'creator.commerce_fulfillment_publication_negative_originals(uuid)'::regprocedure,
  'creator.bind_commerce_fulfillment_publication(uuid,uuid)'::regprocedure,
  'creator.commerce_fulfillment_publication_matches(uuid)'::regprocedure,
  'creator.commerce_fulfillment_publication_originals(uuid)'::regprocedure,
  'creator.end_commerce_fulfillment_publication(uuid)'::regprocedure,
  'creator.require_fulfillment_publication_cleanup()'::regprocedure]) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO creator_fulfillment_publication_metadata',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_publication_document_ready(uuid,uuid,integer)
 TO creator_publication_authority,creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.prepare_commerce_fulfillment_publication(uuid,uuid,integer,uuid,uuid),
 creator.bind_commerce_fulfillment_publication(uuid,uuid),creator.end_commerce_fulfillment_publication(uuid)
 TO creator_publication_authority;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_publication_matches(uuid),creator.commerce_fulfillment_publication_originals(uuid)
 TO creator_publication_worker;
COMMIT;
