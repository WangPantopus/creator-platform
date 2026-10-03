-- Future0092 proposal. W8 owns review/registry activation. NOT registered.
-- No actor synthesis, call completion, settlement, signing, raw callbacks,
-- transcripts, recorded bytes, provider-history completeness or retention default.
BEGIN;
RESET ROLE;
DO $$ DECLARE n text; can_login boolean; role_oid oid; BEGIN
 FOR n,can_login IN VALUES ('creator_call_callback_worker',true),('creator_call_callback_authority',false) LOOP
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=n) THEN
   EXECUTE format('CREATE ROLE %I %s NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',n,CASE WHEN can_login THEN 'LOGIN' ELSE 'NOLOGIN' END);
  END IF;
  SELECT oid INTO role_oid FROM pg_roles WHERE rolname=n AND rolcanlogin=can_login
   AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolbypassrls
   AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
  IF role_oid IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_oid OR roleid=role_oid)
   OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=role_oid)
   OR EXISTS(SELECT FROM pg_class WHERE relowner=role_oid)
   OR EXISTS(SELECT FROM pg_proc WHERE proowner=role_oid) THEN
   RAISE EXCEPTION 'Unsafe existing call callback purpose role';
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_call_callback_worker,creator_call_callback_authority;
SET LOCAL ROLE creator_owner;

CREATE TABLE creator.call_provider_room (
 session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN('livekit-cloud','livekit-self-hosted-development')),
 project_key_sha256 text NOT NULL CHECK(project_key_sha256~'^[a-f0-9]{64}$'),
 room_name text NOT NULL CHECK(length(room_name) BETWEEN 1 AND 128),
 provider_room_sid text NOT NULL CHECK(provider_room_sid~'^RM_[a-zA-Z0-9]{1,64}$'),
 privacy_policy_reference text NOT NULL CHECK(length(privacy_policy_reference) BETWEEN 1 AND 256),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(session_id,provider), UNIQUE(session_id,provider,project_key_sha256), UNIQUE(provider,project_key_sha256,provider_room_sid),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id), CHECK(expires_at>created_at)
);
CREATE TABLE creator.call_provider_identity (
 identity uuid PRIMARY KEY, session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 provider text NOT NULL, project_key_sha256 text NOT NULL CHECK(project_key_sha256~'^[a-f0-9]{64}$'), admission_id uuid NOT NULL UNIQUE REFERENCES creator.call_admission(id),
 account_id uuid NOT NULL, admission_expires_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(session_id,provider,project_key_sha256) REFERENCES creator.call_provider_room(session_id,provider,project_key_sha256),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id)
);
CREATE TABLE creator.call_provider_callback (
 provider text NOT NULL, project_key_sha256 text NOT NULL CHECK(project_key_sha256~'^[a-f0-9]{64}$'), event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 128),
 session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 provider_room_sid text NOT NULL, identity uuid REFERENCES creator.call_provider_identity(identity),
 admission_id uuid REFERENCES creator.call_admission(id), body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),
 event_type text NOT NULL CHECK(event_type IN('room_started','room_finished','participant_joined','participant_left','participant_connection_aborted','track_published','track_unpublished')),
 provider_created_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, history_complete boolean NOT NULL DEFAULT false CHECK(NOT history_complete),
 PRIMARY KEY(provider,project_key_sha256,event_id), FOREIGN KEY(session_id,provider,project_key_sha256) REFERENCES creator.call_provider_room(session_id,provider,project_key_sha256),
 FOREIGN KEY(session_id,creator_id,fan_id) REFERENCES creator.call_session(id,creator_id,fan_id),
 CHECK((event_type IN('room_started','room_finished') AND identity IS NULL AND admission_id IS NULL) OR
       (event_type NOT IN('room_started','room_finished') AND identity IS NOT NULL AND admission_id IS NOT NULL))
);
CREATE INDEX call_provider_callback_family ON creator.call_provider_callback(creator_id,fan_id,session_id,received_at,event_id);
CREATE INDEX call_provider_callback_expiry ON creator.call_provider_callback(expires_at);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['call_provider_room','call_provider_identity','call_provider_callback'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY participant_read ON creator.%I FOR SELECT TO creator_runtime USING(creator_id=nullif(current_setting(''app.creator_id'',true),'''')::uuid AND fan_id=nullif(current_setting(''app.fan_id'',true),'''')::uuid)',t);
  EXECUTE format('CREATE POLICY callback_metadata_read ON creator.%I FOR SELECT TO creator_call_callback_authority USING(true)',t);
 END LOOP;
END $$;
-- Read-only minimum projections stay behind the non-login definer. Worker has
-- no direct table access. Participant APIs must redact provider IDs/history.
GRANT SELECT ON creator.call_provider_room,creator.call_provider_identity TO creator_call_callback_authority;
-- SHARE locks fence actual C10 deletion against callback commit. UPDATE is
-- column-limited and its check is always false, so it permits locks, not edits.
GRANT UPDATE(session_id) ON creator.call_provider_room TO creator_call_callback_authority;
GRANT UPDATE(identity) ON creator.call_provider_identity TO creator_call_callback_authority;
CREATE POLICY callback_room_lock ON creator.call_provider_room FOR UPDATE TO creator_call_callback_authority USING(true) WITH CHECK(false);
CREATE POLICY callback_identity_lock ON creator.call_provider_identity FOR UPDATE TO creator_call_callback_authority USING(true) WITH CHECK(false);
GRANT SELECT,INSERT ON creator.call_provider_callback TO creator_call_callback_authority;
CREATE POLICY callback_metadata_insert ON creator.call_provider_callback FOR INSERT TO creator_call_callback_authority WITH CHECK(true);
CREATE POLICY participant_insert ON creator.call_provider_room FOR INSERT TO creator_runtime WITH CHECK(
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid);
CREATE POLICY participant_insert ON creator.call_provider_identity FOR INSERT TO creator_runtime WITH CHECK(
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid AND
 account_id=nullif(current_setting('app.account_id',true),'')::uuid);
GRANT SELECT,INSERT ON creator.call_provider_room,creator.call_provider_identity TO creator_runtime;
GRANT SELECT ON creator.call_provider_callback TO creator_runtime;

-- Actual owner service writes these only within its genuine held family/ALS
-- transaction after obtaining the real SDK room SID / before token delivery.
CREATE FUNCTION creator.guard_call_provider_binding() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s creator.call_session%ROWTYPE; a creator.call_admission%ROWTYPE; provider_room creator.call_provider_room%ROWTYPE; caller uuid;
BEGIN
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 SELECT * INTO s FROM creator.call_session WHERE id=NEW.session_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id FOR SHARE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.state IN('ending','ended','cancelled') OR s.hard_end_at<=clock_timestamp()
   OR caller IS NULL OR caller::text NOT IN(s.document->>'creatorAccountId',s.document->>'fanAccountId') THEN
  RAISE EXCEPTION 'Current call provider binding unavailable';
 END IF;
 IF TG_TABLE_NAME='call_provider_room' THEN
  IF NEW.room_name IS DISTINCT FROM s.room_id THEN RAISE EXCEPTION 'Actual call room name required'; END IF;
 ELSE
  SELECT * INTO a FROM creator.call_admission WHERE id=NEW.admission_id AND session_id=s.id AND creator_id=s.creator_id AND fan_id=s.fan_id AND account_id=caller FOR SHARE;
  SELECT * INTO provider_room FROM creator.call_provider_room WHERE session_id=s.id AND provider=NEW.provider;
  IF a.id IS NULL OR provider_room.session_id IS NULL OR a.used_at IS NOT NULL OR a.expires_at<=clock_timestamp()
    OR NEW.account_id IS DISTINCT FROM caller OR NEW.admission_expires_at>a.expires_at
    OR NEW.admission_expires_at<=clock_timestamp() OR NEW.expires_at IS DISTINCT FROM provider_room.expires_at THEN
   RAISE EXCEPTION 'Actual call admission binding required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Admission expiry is separate from reviewed mapping retention: callbacks for
-- an actual issued identity may arrive after its initial 30-second join token.
CREATE TRIGGER actual_call_provider_room BEFORE INSERT ON creator.call_provider_room FOR EACH ROW EXECUTE FUNCTION creator.guard_call_provider_binding();
CREATE TRIGGER actual_call_provider_identity BEFORE INSERT ON creator.call_provider_identity FOR EACH ROW EXECUTE FUNCTION creator.guard_call_provider_binding();
-- No runtime/purpose UPDATE or DELETE grants: mapping never changes on cached
-- token room recreation. C10 erasure/expiry require the genuine W8 privacy-job
-- adapter/fence and approved archive/retention contract before activation.

CREATE TABLE creator.call_callback_scope (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), claim_token uuid NOT NULL UNIQUE,
 transaction_id xid8 NOT NULL, backend_pid integer NOT NULL, login_name name NOT NULL,
 provider text NOT NULL, project_key_sha256 text NOT NULL, session_id uuid NOT NULL, creator_id uuid NOT NULL, fan_id uuid NOT NULL,
 provider_room_sid text NOT NULL, event_id text NOT NULL, body_sha256 text NOT NULL,
 event_type text NOT NULL, provider_created_at timestamptz NOT NULL, identity uuid, admission_id uuid,
 expires_at timestamptz NOT NULL, lease_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE creator.call_callback_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.call_callback_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY callback_scope ON creator.call_callback_scope TO creator_call_callback_authority USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,DELETE ON creator.call_callback_scope TO creator_call_callback_authority;

CREATE FUNCTION creator.begin_call_callback(p text,project_hash text,sid text,e text,h text,kind text,provider_time timestamptz,identity_id uuid,admission uuid,claim uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE r creator.call_provider_room%ROWTYPE; n uuid;
BEGIN
 IF session_user<>'creator_call_callback_worker' OR current_setting('transaction_isolation')<>'read committed'
   OR nullif(current_setting('call_callback.scope_id',true),'') IS NOT NULL OR claim IS NULL OR p IS NULL OR project_hash IS NULL OR project_hash!~'^[a-f0-9]{64}$'
   OR sid IS NULL OR sid!~'^RM_[a-zA-Z0-9]{1,64}$' OR e IS NULL OR length(e) NOT BETWEEN 1 AND 128
   OR h IS NULL OR h!~'^[a-f0-9]{64}$' OR provider_time IS NULL OR provider_time<=to_timestamp(0) OR provider_time>clock_timestamp()+interval '2 minutes'
   OR kind IS NULL OR kind NOT IN('room_started','room_finished','participant_joined','participant_left','participant_connection_aborted','track_published','track_unpublished') THEN RETURN NULL; END IF;
 SELECT * INTO r FROM creator.call_provider_room WHERE provider=p AND project_key_sha256=project_hash AND provider_room_sid=sid AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF kind IN('room_started','room_finished') THEN
  IF identity_id IS NOT NULL OR admission IS NOT NULL THEN RETURN NULL; END IF;
 ELSE
  IF identity_id IS NULL OR admission IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM creator.call_provider_identity
   WHERE identity=identity_id AND admission_id=admission AND session_id=r.session_id AND provider=p AND project_key_sha256=project_hash
     AND creator_id=r.creator_id AND fan_id=r.fan_id FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 INSERT INTO creator.call_callback_scope(claim_token,transaction_id,backend_pid,login_name,provider,project_key_sha256,session_id,creator_id,fan_id,
  provider_room_sid,event_id,body_sha256,event_type,provider_created_at,identity,admission_id,expires_at,lease_until)
 VALUES(claim,pg_current_xact_id(),pg_backend_pid(),session_user,p,project_hash,r.session_id,r.creator_id,r.fan_id,
  sid,e,h,kind,provider_time,identity_id,admission,r.expires_at,clock_timestamp()+interval '30 seconds') RETURNING id INTO n;
 PERFORM set_config('call_callback.scope_id',n::text,true);
 RETURN n;
END $$;
CREATE FUNCTION creator.append_call_callback(n uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE s creator.call_callback_scope%ROWTYPE; previous text;
BEGIN
 IF session_user<>'creator_call_callback_worker' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN NULL; END IF;
 SELECT * INTO s FROM creator.call_callback_scope WHERE id=n AND n=nullif(current_setting('call_callback.scope_id',true),'')::uuid
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user AND lease_until>clock_timestamp();
 IF NOT FOUND OR NOT pg_try_advisory_xact_lock(hashtextextended('w6-callback:'||s.provider||':'||s.project_key_sha256||':'||s.event_id,0)) THEN RETURN NULL; END IF;
 SELECT body_sha256 INTO previous FROM creator.call_provider_callback WHERE provider=s.provider AND project_key_sha256=s.project_key_sha256 AND event_id=s.event_id;
 IF FOUND THEN
  IF previous IS DISTINCT FROM s.body_sha256 THEN RAISE EXCEPTION 'Provider callback body conflict' USING ERRCODE='23514'; END IF;
  RETURN 'duplicate';
 END IF;
 INSERT INTO creator.call_provider_callback(provider,project_key_sha256,event_id,session_id,creator_id,fan_id,provider_room_sid,identity,admission_id,body_sha256,event_type,provider_created_at,expires_at)
 VALUES(s.provider,s.project_key_sha256,s.event_id,s.session_id,s.creator_id,s.fan_id,s.provider_room_sid,s.identity,s.admission_id,s.body_sha256,s.event_type,s.provider_created_at,s.expires_at);
 RETURN 'stored';
END $$;
CREATE FUNCTION creator.fence_call_callback_commit() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s creator.call_callback_scope%ROWTYPE;
BEGIN
 -- This narrow protocol commits with the exact pg command COMMIT. Direct
 -- SET CONSTRAINTS cannot discharge the fence early and then wait past expiry.
 IF upper(btrim(current_query())) NOT IN('COMMIT','COMMIT;') OR session_user<>'creator_call_callback_worker' THEN
  RAISE EXCEPTION 'Provider callback requires actual commit fence' USING ERRCODE='23514';
 END IF;
 SELECT * INTO s FROM creator.call_callback_scope WHERE id=NEW.id AND claim_token=NEW.claim_token
  AND transaction_id=pg_current_xact_id() AND backend_pid=pg_backend_pid() AND login_name=session_user
  AND lease_until>clock_timestamp() AND expires_at>clock_timestamp();
 IF NOT FOUND OR NOT EXISTS(SELECT FROM creator.call_provider_room WHERE provider=s.provider AND project_key_sha256=s.project_key_sha256 AND provider_room_sid=s.provider_room_sid
   AND session_id=s.session_id AND creator_id=s.creator_id AND fan_id=s.fan_id AND expires_at=s.expires_at) OR
  NOT EXISTS(SELECT FROM creator.call_provider_callback WHERE provider=s.provider AND project_key_sha256=s.project_key_sha256 AND event_id=s.event_id AND body_sha256=s.body_sha256
   AND session_id=s.session_id AND provider_room_sid=s.provider_room_sid) THEN
  RAISE EXCEPTION 'Provider callback current binding or lease unavailable' USING ERRCODE='23514';
 END IF;
 DELETE FROM creator.call_callback_scope WHERE id=s.id;
 PERFORM set_config('call_callback.scope_id','',true);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER call_callback_commit AFTER INSERT ON creator.call_callback_scope DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION creator.fence_call_callback_commit();
RESET ROLE;
GRANT CREATE ON SCHEMA creator TO creator_call_callback_authority;
ALTER FUNCTION creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid) OWNER TO creator_call_callback_authority;
ALTER FUNCTION creator.append_call_callback(uuid) OWNER TO creator_call_callback_authority;
ALTER FUNCTION creator.fence_call_callback_commit() OWNER TO creator_call_callback_authority;
REVOKE CREATE ON SCHEMA creator FROM creator_call_callback_authority;
REVOKE ALL ON FUNCTION creator.guard_call_provider_binding(),creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid),
 creator.append_call_callback(uuid),creator.fence_call_callback_commit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.begin_call_callback(text,text,text,text,text,text,timestamptz,uuid,uuid,uuid),creator.append_call_callback(uuid) TO creator_call_callback_worker;
COMMIT;
