-- Reserved 0081_w1_signature_read_fence. Additive PROPOSAL, not activation.
-- Requires canonical 0070 W4 bounded public-request evidence. W8 reviews and
-- registers exact bytes. No original migration, positive permission or key grant.
BEGIN;
RESET ROLE;
DO $$ DECLARE role_oid oid; relation text; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_signature_read_authority') THEN
  CREATE ROLE creator_signature_read_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 SELECT oid INTO role_oid FROM pg_roles WHERE rolname='creator_signature_read_authority'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
  AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF role_oid IS NULL OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=role_oid OR roleid=role_oid)
  OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=role_oid)
  OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=role_oid)
  OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=role_oid
   AND oid IS DISTINCT FROM to_regprocedure('creator.hold_public_packet_signature_read(uuid,uuid,uuid,integer,jsonb,uuid[])')) THEN
  RAISE EXCEPTION 'Unsafe existing signature metadata role';
 END IF;
 FOREACH relation IN ARRAY ARRAY['thread','message','generation','memory','fan_profile','access_grant'] LOOP
  IF to_regclass('creator.'||relation) IS NOT NULL AND (
   has_any_column_privilege(role_oid,to_regclass('creator.'||relation),'SELECT,INSERT,UPDATE,REFERENCES')
   OR has_table_privilege(role_oid,to_regclass('creator.'||relation),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN
   RAISE EXCEPTION 'Signature metadata role has private participant privileges';
  END IF;
 END LOOP;
 IF has_column_privilege(role_oid,'creator.identity_session','token_hash','SELECT')
  OR has_column_privilege(role_oid,'creator.identity_session','upstream_cipher','SELECT')
  OR has_column_privilege(role_oid,'creator.passkey_credential','public_key','SELECT')
  OR has_column_privilege(role_oid,'creator.signed_act','assertion','SELECT')
  OR has_column_privilege(role_oid,'creator.signed_act','challenge','SELECT') THEN
  RAISE EXCEPTION 'Signature metadata role has signing secret privileges';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_signature_read_authority;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_signature_read_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_signature_read_authority;
GRANT SELECT(id,account_id,revoked_at) ON creator.passkey_credential TO creator_signature_read_authority;
GRANT SELECT(id,account_id,credential_id,creator_id,content_hash) ON creator.signed_act TO creator_signature_read_authority;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_signature_read_authority;
GRANT SELECT(signed_act_id,account_id,withdrawn_at) ON creator.signed_publication TO creator_signature_read_authority;
GRANT SELECT(id,account_id,creator_id,content_hash,key_revoked,creator_revoked,withdrawn) ON creator.signed_verification TO creator_signature_read_authority;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['creator_profile','identity_session','passkey_credential','signed_act','signed_act_consumption','signed_publication','signed_verification'] LOOP
  EXECUTE format('CREATE POLICY signature_read_metadata ON creator.%I FOR SELECT TO creator_signature_read_authority USING(true)',relation);
 END LOOP;
END $$;

-- Every mutation of current proof metadata shares one account family key. AFTER
-- runs after the statement's row writes, so late readers must never lock rows
-- below the shared key. No trigger query reads private data or another table.
CREATE FUNCTION creator.fence_signature_metadata_write() RETURNS trigger
LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog AS $$
DECLARE account uuid; accounts uuid[]; BEGIN
 accounts=ARRAY[(to_jsonb(OLD)->>'account_id')::uuid];
 IF TG_OP='UPDATE' THEN accounts=array_append(accounts,(to_jsonb(NEW)->>'account_id')::uuid); END IF;
 FOR account IN SELECT DISTINCT value FROM unnest(accounts) value WHERE value IS NOT NULL ORDER BY value LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('identity.signature-account:'||account::text,0));
 END LOOP;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION creator.fence_signature_metadata_write() FROM PUBLIC;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['creator_profile','passkey_credential','signed_act','signed_act_consumption','signed_publication','signed_verification'] LOOP
  EXECUTE format('CREATE TRIGGER fence_signature_metadata_write AFTER UPDATE OR DELETE ON creator.%I FOR EACH ROW EXECUTE FUNCTION creator.fence_signature_metadata_write()',relation);
 END LOOP;
END $$;

-- VOLATILE + READ COMMITTED is intentional: each plain metadata query after a
-- successful try lease takes a fresh snapshot. Contention is retryable; this
-- late gate must never wait below already held business/domain locks.
-- The W4 evidence function remains the sole bounded source/packet projection.
CREATE FUNCTION creator.hold_public_packet_signature_read(c uuid,p uuid,i uuid,v integer,a jsonb,ids uuid[]) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE signer uuid; actual_ids uuid[]; BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR ids IS NULL OR v IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 3 OR v<1
  OR c IS NULL OR p IS NULL OR i IS NULL OR a IS NULL
  OR array_position(ids,NULL) IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM creator.identity_session s
   WHERE s.id=nullif(current_setting('app.identity_session_id',true),'')::uuid
    AND s.account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN false; END IF;
 SELECT cp.account_id INTO signer FROM creator.creator_profile cp WHERE cp.id=c;
 IF signer IS NULL THEN RETURN false; END IF;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||signer::text,0)) THEN
  RAISE EXCEPTION 'Signature metadata is updating' USING ERRCODE='55P03';
 END IF;
 -- The held session cannot be revoked while its earlier row lease is held,
 -- but wall-clock expiry can advance during the preceding business work.
 IF NOT EXISTS(SELECT 1 FROM creator.identity_session s
  WHERE s.id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND s.account_id=nullif(current_setting('app.account_id',true),'')::uuid
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=c AND cp.account_id=signer
  AND cp.verification='verified' AND NOT cp.recovery_required) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) wanted(id) WHERE NOT EXISTS(
  SELECT 1 FROM creator.signed_act sa
  JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id AND key.revoked_at IS NULL
  JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
  JOIN creator.signed_publication pub ON pub.signed_act_id=sa.id AND pub.account_id=sa.account_id AND pub.withdrawn_at IS NULL
  JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.account_id=sa.account_id
   AND proof.creator_id=sa.creator_id AND proof.content_hash=sa.content_hash
   AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
  WHERE sa.id=wanted.id AND sa.creator_id=c AND sa.account_id=signer)) THEN RETURN false; END IF;
 SELECT ARRAY(SELECT DISTINCT value FROM unnest(e.signed_act_ids) value ORDER BY value) INTO actual_ids
  FROM creator.commerce_public_packet_evidence(c,p,i,v,a) e WHERE e.eligible;
 RETURN actual_ids IS NOT NULL AND actual_ids=ARRAY(SELECT DISTINCT value FROM unnest(ids) value ORDER BY value);
END $$;
RESET ROLE;
ALTER FUNCTION creator.hold_public_packet_signature_read(uuid,uuid,uuid,integer,jsonb,uuid[]) OWNER TO creator_signature_read_authority;
REVOKE ALL ON FUNCTION creator.hold_public_packet_signature_read(uuid,uuid,uuid,integer,jsonb,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_public_packet_evidence(uuid,uuid,uuid,integer,jsonb) TO creator_signature_read_authority;
GRANT EXECUTE ON FUNCTION creator.hold_public_packet_signature_read(uuid,uuid,uuid,integer,jsonb,uuid[]) TO creator_runtime;
COMMIT;
