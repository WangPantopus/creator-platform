-- W8 reserved0085_w1_public_ai_metadata_scope. Unregistered/unapplied proposal.
-- 0086 actual negative/restoration authority and W2 current license/purpose
-- consumer are mandatory host dependencies. No owner impersonation or AI grant.
BEGIN;
RESET ROLE;
DO $$ DECLARE role_oid oid; relation text; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_public_ai_authority') THEN
  CREATE ROLE creator_public_ai_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO role_oid FROM pg_roles WHERE rolname='creator_public_ai_authority'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolinherit
  AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF role_oid IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_oid OR roleid=role_oid)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=role_oid)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=role_oid)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=role_oid AND NOT(oid=ANY(array_remove(ARRAY[
   to_regprocedure('creator.public_ai_metadata(uuid,boolean)'),to_regprocedure('creator.begin_public_ai_scope(uuid)'),
   to_regprocedure('creator.public_ai_scope_matches(uuid,uuid)'),to_regprocedure('creator.end_public_ai_scope()'),
   to_regprocedure('creator.require_public_ai_scope_cleanup()')]::oid[],NULL)))) THEN
  RAISE EXCEPTION 'Unsafe existing public AI metadata role';
 END IF;
 FOREACH relation IN ARRAY ARRAY['thread','message','generation','memory','fan_profile','access_grant','ai_chunk','ai_usage'] LOOP
  IF has_any_column_privilege(role_oid,to_regclass('creator.'||relation),'SELECT,INSERT,UPDATE,REFERENCES')
   OR has_table_privilege(role_oid,to_regclass('creator.'||relation),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'Public AI metadata role has private participant/provider privileges';
  END IF;
 END LOOP;
 IF has_column_privilege(role_oid,'creator.ai_version','configuration','SELECT')
  OR has_column_privilege(role_oid,'creator.ai_version','compiled_prefix','SELECT')
  OR has_column_privilege(role_oid,'creator.ai_workspace','configuration','SELECT')
  OR has_column_privilege(role_oid,'creator.ai_workspace','interview','SELECT')
  OR has_column_privilege(role_oid,'creator.ai_source','text_content','SELECT')
  OR has_column_privilege(role_oid,'creator.ai_source','rights_evidence','SELECT')
  OR has_column_privilege(role_oid,'creator.identity_session','token_hash','SELECT')
  OR has_column_privilege(role_oid,'creator.identity_session','upstream_cipher','SELECT') THEN
  RAISE EXCEPTION 'Public AI metadata role has private content/credential privileges';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
-- Canonical values stay derived from W2's real immutable version. The purpose
-- role cannot select the full configuration, compiled prefix or NeverReveal.
ALTER TABLE creator.ai_version
 ADD COLUMN public_mode text GENERATED ALWAYS AS (configuration->>'mode') STORED,
 ADD COLUMN public_daily_cost_cap_micros bigint GENERATED ALWAYS AS (
  CASE WHEN configuration->>'dailyCostCapMicros' ~ '^[0-9]{1,10}$'
   THEN (configuration->>'dailyCostCapMicros')::bigint ELSE NULL END) STORED;

CREATE TABLE creator.public_ai_read_scope (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id xid8 NOT NULL,
 backend_pid integer NOT NULL, login_name name NOT NULL,
 visitor_account_id uuid, visitor_session_id uuid,
 creator_id uuid NOT NULL, version_id uuid, facts_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE creator.public_ai_read_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.public_ai_read_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY metadata_scope ON creator.public_ai_read_scope TO creator_public_ai_authority USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA creator TO creator_public_ai_authority;
RESET ROLE;
GRANT USAGE ON SCHEMA creator_trust TO creator_public_ai_authority;
SET LOCAL ROLE creator_owner;
GRANT SELECT,INSERT,DELETE ON creator.public_ai_read_scope TO creator_public_ai_authority;
GRANT SELECT(id,account_id,verification,recovery_required),UPDATE(id) ON creator.creator_profile TO creator_public_ai_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_public_ai_authority;
GRANT SELECT(creator_id,live_version_id,paused,deleted_at),UPDATE(creator_id) ON creator.ai_workspace TO creator_public_ai_authority;
GRANT SELECT(creator_id) ON creator.ai_tombstone TO creator_public_ai_authority;
GRANT SELECT(creator_id,document),UPDATE(creator_id) ON creator.ai_license TO creator_public_ai_authority;
GRANT SELECT(id,creator_id,state,public_mode,public_daily_cost_cap_micros,compiled_hash,pipeline_hash,published_at,source_set),UPDATE(id)
 ON creator.ai_version TO creator_public_ai_authority;
GRANT SELECT(id,creator_id,revision,content_hash,title,audience,state,index_state,expires_at),UPDATE(id)
 ON creator.ai_source TO creator_public_ai_authority;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['creator_profile','identity_session','ai_workspace','ai_tombstone','ai_license','ai_version','ai_source'] LOOP
  EXECUTE format('CREATE POLICY public_ai_metadata_read ON creator.%I FOR SELECT TO creator_public_ai_authority USING(true)',relation);
 END LOOP;
 FOREACH relation IN ARRAY ARRAY['creator_profile','ai_workspace','ai_license','ai_version','ai_source'] LOOP
  EXECUTE format('CREATE POLICY public_ai_metadata_lease ON creator.%I FOR UPDATE TO creator_public_ai_authority USING(true) WITH CHECK(false)',relation);
 END LOOP;
END $$;

-- No participant data, source bodies, style/configuration, provider calls or
-- signing assertions. Metadata leases are NOWAIT; no late row-lock inversion.
CREATE FUNCTION creator.public_ai_metadata(c uuid, hold boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_account uuid; workspace jsonb; licensed jsonb; version jsonb; sources jsonb; live uuid; document jsonb; denial text; BEGIN
 IF c IS NULL OR session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR current_setting('app.creator_id',true) IS DISTINCT FROM c::text THEN RETURN NULL; END IF;
 IF nullif(current_setting('app.account_id',true),'') IS NOT NULL THEN
  IF NOT EXISTS(SELECT FROM creator.identity_session WHERE id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND account_id=nullif(current_setting('app.account_id',true),'')::uuid AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN NULL; END IF;
 ELSIF nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 -- The same exact early keys are reentrant/nonblocking below positive leases.
 -- This gate creates no public identity/license/processor permission.
 denial:=creator_trust.public_creator_denial(c);
 IF denial='denied' THEN RETURN NULL; END IF;
 IF denial IS DISTINCT FROM 'allowed' THEN
  RAISE EXCEPTION 'Current public creator denial unavailable' USING ERRCODE='55000';
 END IF;
 IF hold THEN
  PERFORM 1 FROM creator.creator_profile WHERE id=c AND verification='verified' AND NOT recovery_required FOR SHARE NOWAIT;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=c AND verification='verified' AND NOT recovery_required;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF hold THEN
  PERFORM 1 FROM creator.ai_workspace WHERE creator_id=c FOR SHARE NOWAIT;
  PERFORM 1 FROM creator.ai_license WHERE creator_id=c FOR SHARE NOWAIT;
 END IF;
 SELECT jsonb_build_object('liveVersionId',live_version_id,'paused',paused,'deleted',deleted_at IS NOT NULL),live_version_id
  INTO workspace,live FROM creator.ai_workspace WHERE creator_id=c;
 SELECT l.document INTO document FROM creator.ai_license l WHERE creator_id=c;
 IF document IS NOT NULL THEN
  licensed := jsonb_build_object('state',document->'state','permittedUses',document->'permittedUses',
   'termEndsAt',document->'termEndsAt','counselVersion',document->'counselVersion','proofReference',document->'proofReference')
   || CASE WHEN document ? 'voiceConsentReference' THEN jsonb_build_object('voiceConsentReference',document->'voiceConsentReference') ELSE '{}'::jsonb END
   || CASE WHEN document ? 'estateOptInReference' THEN jsonb_build_object('estateOptInReference',document->'estateOptInReference') ELSE '{}'::jsonb END;
 END IF;
 IF live IS NOT NULL THEN
  IF hold THEN PERFORM 1 FROM creator.ai_version WHERE creator_id=c AND id=live FOR SHARE NOWAIT; END IF;
  SELECT jsonb_build_object('id',id,'state',state,'mode',public_mode,'dailyCostCapMicros',public_daily_cost_cap_micros,
   'compiledHash',compiled_hash,'pipelineHash',pipeline_hash,'publishedAt',published_at,'sourceSet',source_set)
   INTO version FROM creator.ai_version WHERE creator_id=c AND id=live;
  IF version IS NOT NULL THEN
   IF jsonb_typeof(version->'sourceSet')<>'array' OR jsonb_array_length(version->'sourceSet')>1000 THEN
    RAISE EXCEPTION 'Public AI metadata exceeds the bounded read' USING ERRCODE='54000';
   END IF;
   IF hold THEN
    PERFORM 1 FROM creator.ai_source WHERE creator_id=c AND id IN(
     SELECT (value->>'id')::uuid FROM jsonb_array_elements(version->'sourceSet')) ORDER BY id FOR SHARE NOWAIT;
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'hash',content_hash,
    'title',CASE WHEN audience->>'kind'='public' THEN left(btrim(title),80) ELSE '' END,
    'public',audience->>'kind'='public','ready',state='approved' AND index_state='ready'
     AND (expires_at IS NULL OR expires_at>clock_timestamp())) ORDER BY id),'[]'::jsonb)
    INTO sources FROM creator.ai_source WHERE creator_id=c AND id IN(
     SELECT (value->>'id')::uuid FROM jsonb_array_elements(version->'sourceSet'));
  END IF;
 END IF;
 RETURN jsonb_build_object('creatorId',c,'creatorAccountId',owner_account,'workspace',workspace,
  'tombstoned',EXISTS(SELECT FROM creator.ai_tombstone WHERE creator_id=c),'license',licensed,
  'version',version,'sources',coalesce(sources,'[]'::jsonb));
END $$;

CREATE FUNCTION creator.begin_public_ai_scope(c uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE proof jsonb; nonce uuid; BEGIN
 IF nullif(current_setting('public_ai.scope_id',true),'') IS NOT NULL THEN RETURN NULL; END IF;
 proof:=creator.public_ai_metadata(c,true);
 IF proof IS NULL THEN RETURN NULL; END IF;
 INSERT INTO creator.public_ai_read_scope(transaction_id,backend_pid,login_name,visitor_account_id,visitor_session_id,creator_id,version_id,facts_hash)
  VALUES(pg_current_xact_id(),pg_backend_pid(),session_user,nullif(current_setting('app.account_id',true),'')::uuid,
   nullif(current_setting('app.identity_session_id',true),'')::uuid,c,(proof->'version'->>'id')::uuid,
   encode(sha256(convert_to(proof::text,'UTF8')),'hex')) RETURNING id INTO nonce;
 PERFORM set_config('public_ai.scope_id',nonce::text,true);
 RETURN proof;
END $$;
CREATE FUNCTION creator.public_ai_scope_matches(c uuid,v uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE sealed creator.public_ai_read_scope%ROWTYPE; proof jsonb; BEGIN
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN false; END IF;
 SELECT * INTO sealed FROM creator.public_ai_read_scope WHERE id=nullif(current_setting('public_ai.scope_id',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND creator_id=c AND version_id IS NOT DISTINCT FROM v
  AND visitor_account_id IS NOT DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
  AND visitor_session_id IS NOT DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid
  AND created_at>clock_timestamp()-interval '30 seconds';
 IF NOT FOUND THEN RETURN false; END IF;
 proof:=creator.public_ai_metadata(c,false);
 RETURN proof IS NOT NULL AND sealed.facts_hash=encode(sha256(convert_to(proof::text,'UTF8')),'hex');
END $$;
CREATE FUNCTION creator.end_public_ai_scope() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_runtime' THEN RETURN; END IF;
 DELETE FROM creator.public_ai_read_scope WHERE id=nullif(current_setting('public_ai.scope_id',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user;
 PERFORM set_config('public_ai.scope_id','',true);
END $$;
CREATE FUNCTION creator.require_public_ai_scope_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.public_ai_read_scope WHERE id=NEW.id) THEN
  RAISE EXCEPTION 'Public AI scope must end before commit' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_public_ai_scope_cleanup AFTER INSERT ON creator.public_ai_read_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_public_ai_scope_cleanup();
RESET ROLE;
ALTER FUNCTION creator.public_ai_metadata(uuid,boolean) OWNER TO creator_public_ai_authority;
ALTER FUNCTION creator.begin_public_ai_scope(uuid) OWNER TO creator_public_ai_authority;
ALTER FUNCTION creator.public_ai_scope_matches(uuid,uuid) OWNER TO creator_public_ai_authority;
ALTER FUNCTION creator.end_public_ai_scope() OWNER TO creator_public_ai_authority;
ALTER FUNCTION creator.require_public_ai_scope_cleanup() OWNER TO creator_public_ai_authority;
REVOKE ALL ON FUNCTION creator.public_ai_metadata(uuid,boolean),creator.begin_public_ai_scope(uuid),creator.public_ai_scope_matches(uuid,uuid),
 creator.end_public_ai_scope(),creator.require_public_ai_scope_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.begin_public_ai_scope(uuid),creator.public_ai_scope_matches(uuid,uuid),creator.end_public_ai_scope() TO creator_runtime;
COMMIT;
