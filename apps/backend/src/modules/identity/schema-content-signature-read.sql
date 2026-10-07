-- Unallocated held W1 proposal. Registration, complete closed-source catalogue
-- qualification and actual owner composition are required before activation.
-- Requires unchanged0167 signature-account mutation fences. Do not alter its
-- packet purpose or substitute a packet/ThreadScope for ordinary Content.
BEGIN;
RESET ROLE;
DO $$ DECLARE purpose oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_content_signature_read_authority') THEN
  CREATE ROLE creator_content_signature_read_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 SELECT oid INTO purpose FROM pg_roles WHERE rolname='creator_content_signature_read_authority'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF purpose IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=purpose OR roleid=purpose)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=purpose)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=purpose)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=purpose)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=purpose
   AND oid IS DISTINCT FROM to_regprocedure('creator.hold_content_signature_read(uuid,uuid,uuid,text,boolean)')) THEN
  RAISE EXCEPTION 'Original isolated Content signature metadata purpose required';
 END IF;
 IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
   AND t.tgname='fence_signature_metadata_write'
   AND p.oid=to_regprocedure('creator.fence_signature_metadata_write()')
   AND pg_get_userbyid(p.proowner)='creator_owner'
   AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
    'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
    'creator.signed_publication'::regclass,'creator.signed_verification'::regclass]))<>6 THEN
  RAISE EXCEPTION 'All six original signature metadata mutation fences required';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_content_signature_read_authority;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_content_signature_read_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_content_signature_read_authority;
GRANT SELECT(id,account_id,revoked_at) ON creator.passkey_credential TO creator_content_signature_read_authority;
GRANT SELECT(id,account_id,credential_id,creator_id,act_type,subject_id,content_hash) ON creator.signed_act TO creator_content_signature_read_authority;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_content_signature_read_authority;
GRANT SELECT(signed_act_id,account_id,public_content,withdrawn_at) ON creator.signed_publication TO creator_content_signature_read_authority;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn) ON creator.signed_verification TO creator_content_signature_read_authority;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['creator_profile','identity_session','passkey_credential',
  'signed_act','signed_act_consumption','signed_publication','signed_verification'] LOOP
  EXECUTE format('CREATE POLICY content_signature_read_metadata ON creator.%I FOR SELECT TO creator_content_signature_read_authority USING(true)',relation);
 END LOOP;
END $$;

-- W5 has already held the actual Content version/audience/withdrawal and all
-- original restoration/recipient/audience negatives on this same client.
-- h is the hash of its actual stored canonical publication command, including
-- the actual publication media evidence. No command/body is granted here.
-- requires_public comes only from that original exact audience. This function
-- returns current signature metadata eligibility, never Content permission.
-- LAST family lease: no row locks, GUC writes, packet or domain helper calls.
CREATE FUNCTION creator.hold_content_signature_read(c uuid,i uuid,act uuid,h text,requires_public boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE signer uuid; BEGIN
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR c IS NULL OR i IS NULL OR act IS NULL OR requires_public IS NULL
  OR h IS NULL OR h !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 SELECT cp.account_id INTO signer FROM creator.creator_profile cp WHERE cp.id=c;
 IF signer IS NULL THEN RETURN false; END IF;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||signer::text,0)) THEN
  RAISE EXCEPTION 'Signature metadata is updating' USING ERRCODE='55P03';
 END IF;
 -- Fresh READ COMMITTED snapshots after the actual shared family lease.
 IF NOT EXISTS(SELECT FROM creator.identity_session s
  WHERE s.id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND s.account_id=nullif(current_setting('app.account_id',true),'')::uuid
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN false; END IF;
 RETURN EXISTS(SELECT FROM creator.creator_profile cp
  JOIN creator.signed_act sa ON sa.creator_id=cp.id AND sa.account_id=cp.account_id
  JOIN creator.passkey_credential credential ON credential.id=sa.credential_id
   AND credential.account_id=sa.account_id AND credential.revoked_at IS NULL
  JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
  JOIN creator.signed_publication publication ON publication.signed_act_id=sa.id AND publication.account_id=sa.account_id
   AND publication.withdrawn_at IS NULL AND (NOT requires_public OR publication.public_content)
  JOIN creator.signed_verification verification ON verification.id=sa.id AND verification.account_id=sa.account_id
   AND verification.creator_id=sa.creator_id AND verification.act_type=sa.act_type AND verification.content_hash=sa.content_hash
   AND NOT verification.key_revoked AND NOT verification.creator_revoked AND NOT verification.withdrawn
  WHERE cp.id=c AND cp.account_id=signer AND cp.verification='verified' AND NOT cp.recovery_required
   AND sa.id=act AND sa.subject_id=i AND sa.content_hash=h AND sa.act_type IN('broadcast','reply'));
END $$;
RESET ROLE;
ALTER FUNCTION creator.hold_content_signature_read(uuid,uuid,uuid,text,boolean) OWNER TO creator_content_signature_read_authority;
REVOKE ALL ON FUNCTION creator.hold_content_signature_read(uuid,uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.hold_content_signature_read(uuid,uuid,uuid,text,boolean) TO creator_runtime;
COMMIT;
