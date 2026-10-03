-- Held additive ownership metadata continuation. Original0027/0087 stay frozen.
-- No old NULL snapshot is inferred, backfilled or converted into ownership.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='0027_w8_privacy_ownership'
   AND checksum='de8587672985d79c480bafb41961041be9390f565b3612ca14285d87d2319028')
 OR NOT EXISTS(SELECT FROM pg_constraint
   WHERE conrelid='creator_trust.privacy_job'::regclass AND conname='privacy_ownership_snapshot'
   AND contype='c' AND convalidated
   AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')=
    '218713cba313b4630e93af075fc5ce76a3000363ea68b6cc0161c73c17d93a8a')
 THEN RAISE EXCEPTION 'Original ownership constraint custody required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_ownership_metadata') THEN
  CREATE ROLE creator_privacy_ownership_metadata NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_privacy_ownership_metadata'
   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
   WHERE r.rolname='creator_privacy_ownership_metadata')
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_privacy_ownership_metadata'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass
   AND refobjid=to_regrole('creator_privacy_ownership_metadata')
   AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated ownership metadata role required'; END IF;
END $$;
SET LOCAL ROLE creator_trust_owner;
ALTER TABLE creator_trust.privacy_job DROP CONSTRAINT privacy_ownership_snapshot;
ALTER TABLE creator_trust.privacy_job ADD CONSTRAINT privacy_ownership_snapshot CHECK (
 (owned_creator_ids IS NULL AND ownership_ref IS NULL) OR
 (owned_creator_ids IS NOT NULL AND ownership_ref IS NOT NULL
  AND cardinality(owned_creator_ids)<=100 AND array_position(owned_creator_ids,NULL) IS NULL
  AND char_length(ownership_ref) BETWEEN 8 AND 200)
);
RESET ROLE;
CREATE FUNCTION creator_trust.all_scope_ownership_registered(v text,h text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_trust_runtime'
  AND v='0209_w8_all_scope_privacy_ownership' AND h ~ '^[a-f0-9]{64}$'
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=v AND checksum=h)
$$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_privacy_ownership_metadata;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_privacy_ownership_metadata;
ALTER FUNCTION creator_trust.all_scope_ownership_registered(text,text) OWNER TO creator_privacy_ownership_metadata;
REVOKE ALL ON FUNCTION creator_trust.all_scope_ownership_registered(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.all_scope_ownership_registered(text,text) TO creator_trust_runtime;
COMMIT;
