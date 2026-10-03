-- Held0208_w1_publication_preparation. W8 alone reviews and activates.
-- Original0071 task/nonce and original0204 early metadata remain authoritative.
-- Ordinary publications only: actual W4/W3 worker delivery/final is not supplied.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF to_regprocedure('creator.prepare_commerce_fulfillment_publication(uuid,uuid,integer,uuid,uuid)') IS NULL
  OR to_regprocedure('creator.bind_commerce_fulfillment_publication(uuid,uuid)') IS NULL
  OR to_regprocedure('creator.end_commerce_fulfillment_publication(uuid)') IS NULL
  OR to_regprocedure('creator.fence_signature_metadata_write()') IS NULL THEN
  RAISE EXCEPTION 'Original publication metadata and signature-write fences are required';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_publication_authority'
  AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) THEN
  RAISE EXCEPTION 'The original isolated publication authority is required';
 END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
  AND t.tgname='fence_signature_metadata_write' AND pg_get_userbyid(p.proowner)='creator_owner'
  AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
   'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
   'creator.signed_publication'::regclass,'creator.signed_verification'::regclass]))<>6 THEN
  RAISE EXCEPTION 'All original signature metadata writes must share their account fence';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.publication_preparation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), backend_pid integer NOT NULL, transaction_id xid8 NOT NULL, login_name name NOT NULL,
 creator_id uuid NOT NULL,content_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),publisher_account_id uuid NOT NULL,
 signed_act_id uuid,fulfillment_nonce uuid,publication_nonce uuid,command_hash text,
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
 UNIQUE(backend_pid,transaction_id,login_name),
 CHECK(command_hash IS NULL OR command_hash~'^[a-f0-9]{64}$'),
 CHECK((publication_nonce IS NULL)=(command_hash IS NULL))
);
ALTER TABLE creator.publication_preparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.publication_preparation FORCE ROW LEVEL SECURITY;
CREATE POLICY publication_preparation_authority ON creator.publication_preparation TO creator_publication_authority
 USING(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND login_name=session_user)
 WITH CHECK(session_user='creator_publication_worker' AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user);
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.publication_preparation TO creator_publication_authority;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_publication_authority;
CREATE FUNCTION creator.require_publication_preparation_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.publication_preparation WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'Publication preparation must end before commit' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_publication_preparation_cleanup AFTER INSERT ON creator.publication_preparation
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_publication_preparation_cleanup();

-- Fixed metadata only. The original204 operation finishes every original205
-- family negative BEFORE the original0071 proof/body/creator/key positives.
CREATE FUNCTION creator.prepare_publication_task(c uuid,o uuid,v integer,p uuid,s uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE n uuid; original uuid;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0208_w1_publication_preparation')
  OR c IS NULL OR o IS NULL OR v IS NULL OR v<1 OR p IS NULL THEN
  RAISE EXCEPTION 'The activated original publication preparation is required' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT FROM creator.publication_preparation) OR nullif(current_setting('publication.scope_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Finish the actual original publication task first' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT FROM creator.content_index i JOIN creator.content_publication pub
  ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
  WHERE i.creator_id=c AND i.id=o AND i.version=v AND i.state IN('media_pending','scheduled') AND i.withdrawn_at IS NULL
   AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s) THEN
  RAISE EXCEPTION 'The original publication task changed' USING ERRCODE='42501'; END IF;
 original=creator.prepare_commerce_fulfillment_publication(c,o,v,p,s);
 INSERT INTO creator.publication_preparation(backend_pid,transaction_id,login_name,creator_id,content_id,version,publisher_account_id,
  signed_act_id,fulfillment_nonce) VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,c,o,v,p,s,original) RETURNING id INTO n;
 RETURN n;
END $$;

CREATE FUNCTION creator.read_prepared_publication_task(n uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE early creator.publication_preparation%ROWTYPE;
BEGIN
 SELECT * INTO early FROM creator.publication_preparation WHERE id=n AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user AND expires_at>clock_timestamp() AND publication_nonce IS NULL;
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR early.id IS NULL THEN
  RAISE EXCEPTION 'The original early preparation is required' USING ERRCODE='42501'; END IF;
 IF early.fulfillment_nonce IS NOT NULL THEN
  RAISE EXCEPTION 'Original W4/W3 worker body and final authority is unavailable' USING ERRCODE='55000'; END IF;
 RETURN creator.read_publication_task(early.creator_id,early.content_id,early.version,early.publisher_account_id,early.signed_act_id);
END $$;

CREATE FUNCTION creator.begin_prepared_publication_scope(n uuid,h text,command_text text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE early creator.publication_preparation%ROWTYPE; issued uuid;
BEGIN
 SELECT * INTO early FROM creator.publication_preparation WHERE id=n AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user AND expires_at>clock_timestamp() AND publication_nonce IS NULL;
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR early.id IS NULL THEN RETURN false; END IF;
 IF early.fulfillment_nonce IS NOT NULL THEN
  RAISE EXCEPTION 'Original W4/W3 worker body and final authority is unavailable' USING ERRCODE='55000'; END IF;
 IF NOT creator.begin_publication_scope(early.creator_id,early.content_id,early.version,early.publisher_account_id,early.signed_act_id,h,command_text) THEN RETURN false; END IF;
 issued=nullif(current_setting('publication.scope_id',true),'')::uuid;
 IF early.fulfillment_nonce IS NOT NULL AND NOT creator.bind_commerce_fulfillment_publication(early.fulfillment_nonce,issued) THEN
  RAISE EXCEPTION 'Bind the original204 preparation to the exact original0071 nonce' USING ERRCODE='42501'; END IF;
 UPDATE creator.publication_preparation SET publication_nonce=issued,command_hash=h WHERE id=early.id;
 RETURN true;
END $$;

-- All W5 effects, W6 final media/file checks and host restoration occur first.
-- This function captures the original sealed task, performs ALL cleanup and
-- constraint work, then takes a nonwaiting signer fence and LAST plain fresh
-- domain/command/signature reads. The next caller SQL operation is only COMMIT.
CREATE FUNCTION creator.finalize_prepared_publication_scope(n uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE early creator.publication_preparation%ROWTYPE; sealed creator.publication_worker_scope%ROWTYPE;
 proof jsonb; expected jsonb; owner_account uuid;
BEGIN
 SELECT * INTO early FROM creator.publication_preparation WHERE id=n AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user AND expires_at>clock_timestamp() AND publication_nonce IS NOT NULL;
 SELECT * INTO sealed FROM creator.publication_worker_scope WHERE id=early.publication_nonce
  AND id=nullif(current_setting('publication.scope_id',true),'')::uuid AND backend_pid=pg_backend_pid()
  AND transaction_id=pg_current_xact_id() AND login_name=session_user AND created_at>clock_timestamp()-interval '5 minutes'
  AND creator_id=early.creator_id AND content_id=early.content_id AND version=early.version
  AND publisher_account_id=early.publisher_account_id AND signed_act_id IS NOT DISTINCT FROM early.signed_act_id AND command_hash=early.command_hash;
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' OR early.id IS NULL
  OR sealed.id IS NULL OR NOT creator.publication_scope_matches(sealed.creator_id,sealed.content_id,sealed.version) THEN
  RAISE EXCEPTION 'The original bound publication task is required' USING ERRCODE='42501'; END IF;
 -- No real original W4/W3 worker delivery/final producer is present. These
 -- commands cannot use ordinary publication as a substitute for that authority.
 IF early.fulfillment_nonce IS NOT NULL OR sealed.command->'content'->'document'->>'kind' NOT IN('note','post')
  OR coalesce(sealed.command->'content'->'document'->'planRef','null'::jsonb)<>'null'::jsonb
  OR sealed.command->'content'->'document'->'packetId'<>'null'::jsonb
  OR sealed.command->'content'->'document'->'quote'<>'null'::jsonb
  OR coalesce(sealed.command->'content'->'document'->'live','null'::jsonb)<>'null'::jsonb
  OR sealed.command->'content'->'document'->>'showAudienceCount'<>'false' THEN
  RAISE EXCEPTION 'Original publication-domain final authority is unavailable' USING ERRCODE='55000'; END IF;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=sealed.creator_id;
 IF owner_account IS NULL THEN RAISE EXCEPTION 'The original creator changed' USING ERRCODE='42501'; END IF;
 -- Actual204 owns its private cleanup; ordinary tasks have no204 row. Group
 -- closure will require the genuine W4/W3 final producer before this boundary.
 IF early.fulfillment_nonce IS NOT NULL THEN PERFORM creator.end_commerce_fulfillment_publication(early.fulfillment_nonce); END IF;
 PERFORM creator.end_publication_scope();
 DELETE FROM creator.publication_preparation WHERE id=early.id;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||owner_account::text,0)) THEN
  RAISE EXCEPTION 'Signature metadata is updating' USING ERRCODE='55P03'; END IF;
 -- No scope matcher, settings, cleanup, deferred check or lock below here.
 SELECT jsonb_build_object('document',r.document,'mediaEvidence',pub.media_evidence,'command',sp.command,
  'commandHash',sa.content_hash) INTO proof
 FROM creator.content_index i
 JOIN creator.content_revision r ON r.content_id=i.id AND r.creator_id=i.creator_id AND r.version=i.version
 JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
 JOIN creator.creator_profile cp ON cp.id=i.creator_id AND cp.account_id=owner_account
 LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id AND sa.account_id=pub.author_account_id
  AND sa.creator_id=i.creator_id AND sa.subject_id=i.id
 LEFT JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
 LEFT JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id
 LEFT JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id
 LEFT JOIN creator.signed_verification verification ON verification.id=sa.id AND verification.account_id=sa.account_id
  AND verification.creator_id=sa.creator_id AND verification.content_hash=sa.content_hash
 WHERE i.id=sealed.content_id AND i.creator_id=sealed.creator_id AND i.version=sealed.version
  AND i.state IN('media_pending','scheduled','published') AND i.withdrawn_at IS NULL AND r.document->>'kind'=i.kind
  AND i.audience=r.document->'audience'
  AND i.packet_id IS NOT DISTINCT FROM nullif(r.document->>'packetId','')::uuid
  AND i.scheduled_at IS NOT DISTINCT FROM nullif(r.document->>'scheduledAt','')::timestamptz
  AND (i.state<>'published' OR (i.published_at IS NOT NULL AND pub.published_at=i.published_at))
  AND pub.author_account_id=sealed.publisher_account_id AND pub.signed_act_id IS NOT DISTINCT FROM sealed.signed_act_id
  AND cp.verification='verified' AND NOT cp.recovery_required
  AND sealed.created_at>clock_timestamp()-interval '5 minutes'
  AND early.expires_at>clock_timestamp()
  AND NOT EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(owner_account,sealed.publisher_account_id))
  AND ((sealed.signed_act_id IS NOT NULL AND sealed.publisher_account_id=owner_account
   AND pub.author_kind IN('human_broadcast','human_creator') AND consumed.signed_act_id IS NOT NULL
   AND sa.act_type=CASE WHEN i.kind='note' THEN 'broadcast' ELSE 'reply' END
   AND key.id IS NOT NULL AND key.revoked_at IS NULL AND sp.signed_act_id IS NOT NULL AND sp.withdrawn_at IS NULL
   AND verification.id IS NOT NULL AND verification.act_type=sa.act_type AND NOT verification.key_revoked AND NOT verification.creator_revoked AND NOT verification.withdrawn)
  OR (sealed.signed_act_id IS NULL AND pub.author_kind='team' AND sealed.publisher_account_id<>owner_account AND i.kind='post'
   AND r.document->'media'='[]'::jsonb AND pub.media_evidence='[]'::jsonb AND r.document->'quote'='null'::jsonb
   AND EXISTS(SELECT FROM creator.team_membership tm WHERE tm.creator_id=i.creator_id
    AND tm.account_id=sealed.publisher_account_id AND tm.revoked_at IS NULL AND 'publisher'=ANY(tm.roles))));
 IF proof IS NULL THEN RAISE EXCEPTION 'The current publication signature or original changed' USING ERRCODE='42501'; END IF;
 expected=jsonb_build_object('actType',CASE WHEN proof->'document'->>'kind'='note' THEN 'broadcast' ELSE 'reply' END,
  'subjectId',sealed.content_id,'content',jsonb_build_object('kind','content_publication','creatorId',sealed.creator_id,
   'version',sealed.version,'document',proof->'document') ||
   CASE WHEN proof->'mediaEvidence'='[]'::jsonb THEN '{}'::jsonb ELSE jsonb_build_object('mediaEvidence',proof->'mediaEvidence') END);
 IF expected IS DISTINCT FROM sealed.command OR (sealed.signed_act_id IS NOT NULL
  AND (proof->>'commandHash' IS DISTINCT FROM sealed.command_hash OR proof->'command' IS DISTINCT FROM sealed.command)) THEN
  RAISE EXCEPTION 'The exact current original publication command is required' USING ERRCODE='42501';
 END IF;
 RETURN true;
END $$;
RESET ROLE;
GRANT CREATE ON SCHEMA creator TO creator_publication_authority;
ALTER FUNCTION creator.require_publication_preparation_cleanup() OWNER TO creator_publication_authority;
ALTER FUNCTION creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.read_prepared_publication_task(uuid) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.begin_prepared_publication_scope(uuid,text,text) OWNER TO creator_publication_authority;
ALTER FUNCTION creator.finalize_prepared_publication_scope(uuid) OWNER TO creator_publication_authority;
REVOKE CREATE ON SCHEMA creator FROM creator_publication_authority;
REVOKE ALL ON FUNCTION creator.require_publication_preparation_cleanup(),creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid),
 creator.read_prepared_publication_task(uuid),creator.begin_prepared_publication_scope(uuid,text,text),creator.finalize_prepared_publication_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.prepare_publication_task(uuid,uuid,integer,uuid,uuid),creator.read_prepared_publication_task(uuid),
 creator.begin_prepared_publication_scope(uuid,text,text),creator.finalize_prepared_publication_scope(uuid) TO creator_publication_worker;
-- The original body/issue/cleanup entries cannot bypass early preparation or
-- clear a scope and COMMIT without the final fresh gate. Original bytes frozen.
REVOKE EXECUTE ON FUNCTION creator.read_publication_task(uuid,uuid,integer,uuid,uuid),
 creator.begin_publication_scope(uuid,uuid,integer,uuid,uuid,text,text),creator.end_publication_scope() FROM creator_publication_worker;
COMMIT;
