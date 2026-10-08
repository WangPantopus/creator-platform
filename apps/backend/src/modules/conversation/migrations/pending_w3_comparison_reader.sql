-- Additive, unregistered source proposal. The prepared original owner and
-- complete privacy/restore graph must qualify before any host consumes it.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_reader') THEN
  CREATE ROLE creator_comparison_reader NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_comparison_reader' AND NOT rolcanlogin
  AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
  AND NOT rolbypassrls AND rolconfig IS NULL)
 OR EXISTS(SELECT FROM pg_auth_members WHERE member=to_regrole('creator_comparison_reader') OR roleid=to_regrole('creator_comparison_reader'))
 OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole('creator_comparison_reader'))
 OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=to_regrole('creator_comparison_reader')
  AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
 THEN RAISE EXCEPTION 'New isolated comparison reader role required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_comparison_reader;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_comparison_reader;
GRANT SELECT(id,account_id,verification,recovery_required),UPDATE(id) ON creator.creator_profile TO creator_comparison_reader;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile TO creator_comparison_reader;
GRANT SELECT(id,account_id,revoked_at,expires_at),UPDATE(id) ON creator.identity_session TO creator_comparison_reader;
GRANT SELECT(creator_id,deleted_at),UPDATE(creator_id) ON creator.ai_workspace TO creator_comparison_reader;
GRANT SELECT(id,creator_id,fan_id,deleted_at,off_the_record,processor_consent_version),UPDATE(id) ON creator.thread TO creator_comparison_reader;
-- Deliberately no SELECT on message.text, conversation tail or memory text.
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,version,created_at,delivery_state,off_the_record)
 ON creator.message TO creator_comparison_reader;
GRANT SELECT(thread_id,creator_id,fan_id,account_id,version,withdrawn_at) ON creator.processor_consent TO creator_comparison_reader;
GRANT SELECT(thread_id,creator_id,fan_id) ON creator.memory_exclusion TO creator_comparison_reader;
GRANT SELECT ON creator.conversation_comparison_consent,creator.conversation_comparison_sample TO creator_comparison_reader;
GRANT UPDATE(thread_id) ON creator.conversation_comparison_consent TO creator_comparison_reader;
GRANT EXECUTE ON FUNCTION creator_trust.interactive_denial(text,uuid,uuid) TO creator_comparison_reader;
SET LOCAL ROLE creator_owner;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['creator_profile','fan_profile','identity_session','ai_workspace','thread','message',
  'processor_consent','memory_exclusion','conversation_comparison_consent','conversation_comparison_sample'] LOOP
  EXECUTE format('CREATE POLICY comparison_reader ON creator.%I FOR SELECT TO creator_comparison_reader USING(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['creator_profile','fan_profile','identity_session','ai_workspace','thread','conversation_comparison_consent'] LOOP
  EXECUTE format('CREATE POLICY comparison_reader_lock ON creator.%I FOR UPDATE TO creator_comparison_reader USING(true) WITH CHECK(false)',t);
 END LOOP;
END $$;

-- This private transient scope cannot commit. It holds only a cohort digest
-- and current policy/session bindings, not fan identifiers or derived text.
CREATE TABLE creator.comparison_read_scope(
 pid integer NOT NULL,xid xid8 NOT NULL,login name NOT NULL,
 account_id uuid NOT NULL,session_id uuid NOT NULL,creator_id uuid NOT NULL,
 policy_version text NOT NULL,processor_policy_version text NOT NULL,
 cohort_hash bytea NOT NULL CHECK(octet_length(cohort_hash)=32),
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)),
 PRIMARY KEY(pid,xid,creator_id)
);
ALTER TABLE creator.comparison_read_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.comparison_read_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY comparison_reader_scope ON creator.comparison_read_scope TO creator_comparison_reader
 USING(pid=pg_backend_pid() AND xid=pg_current_xact_id_if_assigned() AND login=session_user)
 WITH CHECK(pid=pg_backend_pid() AND xid=pg_current_xact_id_if_assigned() AND login=session_user);
RESET ROLE;
ALTER TABLE creator.comparison_read_scope OWNER TO creator_comparison_reader;
GRANT SELECT,INSERT,DELETE ON creator.comparison_read_scope TO creator_comparison_reader;

CREATE FUNCTION creator.comparison_cohort_now(c uuid,p text,processor text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid;s uuid;candidate record;answer text;cohort jsonb:='[]'::jsonb;
BEGIN
 a:=nullif(current_setting('app.account_id',true),'')::uuid;
 s:=nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF session_user<>'creator_runtime' OR current_user<>'creator_comparison_reader'
  OR current_setting('transaction_isolation')<>'read committed'
  OR c IS DISTINCT FROM nullif(current_setting('app.creator_id',true),'')::uuid
  OR a IS NULL OR s IS NULL OR p IS NULL OR processor IS NULL
  OR length(p) NOT BETWEEN 1 AND 120 OR length(processor) NOT BETWEEN 1 AND 120
  OR NOT EXISTS(SELECT FROM creator.schema_migration
   WHERE version='PENDING_W8_w3_comparison_reader' AND checksum ~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'Original registered creator comparison read required' USING ERRCODE='42501'; END IF;
 PERFORM id FROM creator.identity_session WHERE id=s AND account_id=a
  AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND OR creator_trust.interactive_denial('creator',c,NULL) IS DISTINCT FROM 'allowed'
 THEN RAISE EXCEPTION 'Original current creator session required' USING ERRCODE='42501'; END IF;
 PERFORM id FROM creator.creator_profile WHERE id=c AND account_id=a AND verification='verified'
  AND NOT recovery_required FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original verified creator required' USING ERRCODE='42501'; END IF;
 PERFORM creator_id FROM creator.ai_workspace WHERE creator_id=c AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original comparison workspace required' USING ERRCODE='42501'; END IF;
 -- The cohort is the newest200 eligible stored samples. A denied participant
 -- can only remove a candidate; unavailable denial authority fails the read.
 FOR candidate IN SELECT q.id,q.thread_id,q.fan_id FROM creator.conversation_comparison_sample q
  WHERE q.creator_id=c AND q.policy_version=p AND q.processor_policy_version=processor
   AND q.expires_at>clock_timestamp() AND q.occurred_at>=clock_timestamp()-interval '7 days'
   AND q.occurred_at<=clock_timestamp()
   AND q.sanitizer_reference ~ '^[a-f0-9]{64}:[a-f0-9-]{36}:[a-f0-9-]{36}$'
  ORDER BY q.occurred_at DESC,q.id LIMIT 200 LOOP
  answer:=creator_trust.interactive_denial('thread',c,candidate.thread_id);
  IF answer='denied' THEN CONTINUE; END IF;
  IF answer IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'Original participant denial unavailable' USING ERRCODE='42501'; END IF;
  PERFORM id FROM creator.thread WHERE id=candidate.thread_id AND creator_id=c AND fan_id=candidate.fan_id
   AND deleted_at IS NULL AND NOT off_the_record AND processor_consent_version=processor FOR SHARE NOWAIT;
  IF NOT FOUND THEN CONTINUE; END IF;
  PERFORM f.id FROM creator.fan_profile f JOIN creator.conversation_comparison_sample q
   ON q.fan_id=f.id AND q.account_id=f.account_id WHERE q.id=candidate.id AND q.creator_id=c
   AND q.thread_id=candidate.thread_id FOR SHARE OF f NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original comparison participant changed' USING ERRCODE='42501'; END IF;
  PERFORM thread_id FROM creator.conversation_comparison_consent WHERE thread_id=candidate.thread_id
   AND creator_id=c AND fan_id=candidate.fan_id AND policy_version=p AND processor_policy_version=processor
   AND consented_at<=clock_timestamp() AND expires_at>clock_timestamp() FOR SHARE NOWAIT;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT cohort||jsonb_build_array(jsonb_build_object('sampleId',q.id,'occurredAt',
    to_char(q.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'paraphrasedPrompt',q.paraphrased_prompt,'sanitizerReference',q.sanitizer_reference)) INTO cohort
  FROM creator.conversation_comparison_sample q JOIN creator.conversation_comparison_consent choice
   ON choice.thread_id=q.thread_id AND choice.creator_id=q.creator_id AND choice.fan_id=q.fan_id
    AND choice.account_id=q.account_id AND choice.policy_version=q.policy_version AND choice.processor_policy_version=q.processor_policy_version
  JOIN creator.message m ON m.id=q.message_id AND m.thread_id=q.thread_id AND m.creator_id=q.creator_id AND m.fan_id=q.fan_id
  WHERE q.id=candidate.id AND q.creator_id=c AND q.policy_version=p AND q.processor_policy_version=processor
   AND q.expires_at>clock_timestamp() AND q.expires_at<=choice.expires_at
   AND choice.consented_at<=clock_timestamp() AND choice.expires_at>clock_timestamp()
   AND q.occurred_at>=clock_timestamp()-interval '7 days' AND q.occurred_at<=clock_timestamp()
   AND q.occurred_at=date_trunc('milliseconds',m.created_at) AND q.message_version=m.version
   AND m.author_kind='fan' AND m.author_account_id=q.account_id AND NOT m.off_the_record
   AND m.delivery_state IN('accepted','delivered')
   AND EXISTS(SELECT FROM creator.processor_consent pc WHERE pc.thread_id=q.thread_id AND pc.creator_id=c
    AND pc.fan_id=q.fan_id AND pc.account_id=q.account_id AND pc.version=processor AND pc.withdrawn_at IS NULL)
   AND NOT EXISTS(SELECT FROM creator.memory_exclusion e WHERE e.thread_id=q.thread_id AND e.creator_id=c AND e.fan_id=q.fan_id);
  -- A concurrently changed source must not turn the accumulated array NULL.
  IF NOT FOUND THEN RAISE EXCEPTION 'Comparison candidate changed during read' USING ERRCODE='40001'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM creator.identity_session WHERE id=s AND account_id=a
  AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'Original creator session expired during read' USING ERRCODE='42501'; END IF;
 RETURN cohort;
END $$;

CREATE FUNCTION creator.read_comparison_cohort(c uuid,p text,processor text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cohort jsonb;original creator.comparison_read_scope;fingerprint bytea;opened_at timestamptz:=clock_timestamp();
BEGIN
 cohort:=creator.comparison_cohort_now(c,p,processor);
 IF clock_timestamp()>=opened_at+interval '5 seconds'
 THEN RAISE EXCEPTION 'Original comparison read exceeded its source budget' USING ERRCODE='42501'; END IF;
 fingerprint:=sha256(convert_to(cohort::text,'UTF8'));
 SELECT * INTO original FROM creator.comparison_read_scope WHERE pid=pg_backend_pid() AND xid=pg_current_xact_id() AND creator_id=c;
 IF FOUND THEN
  IF original.account_id IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
   OR original.session_id IS DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid
   OR original.policy_version IS DISTINCT FROM p OR original.processor_policy_version IS DISTINCT FROM processor
   OR original.cohort_hash IS DISTINCT FROM fingerprint OR original.expires_at<=clock_timestamp()
  THEN RAISE EXCEPTION 'Original comparison read ended or changed' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO creator.comparison_read_scope VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,
   nullif(current_setting('app.account_id',true),'')::uuid,nullif(current_setting('app.identity_session_id',true),'')::uuid,
   c,p,processor,fingerprint,opened_at+interval '5 seconds');
 END IF;
 RETURN cohort;
END $$;

CREATE FUNCTION creator.end_comparison_read()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_cohort jsonb;
BEGIN
 IF TG_OP<>'INSERT' OR TG_TABLE_SCHEMA<>'creator' OR TG_TABLE_NAME<>'comparison_read_scope'
  OR NEW.pid<>pg_backend_pid() OR NEW.xid<>pg_current_xact_id_if_assigned() OR NEW.login<>session_user
  OR NEW.account_id IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
  OR NEW.session_id IS DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid
  OR NEW.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Original comparison read expired before COMMIT' USING ERRCODE='42501'; END IF;
 current_cohort:=creator.comparison_cohort_now(NEW.creator_id,NEW.policy_version,NEW.processor_policy_version);
 IF NEW.cohort_hash IS DISTINCT FROM sha256(convert_to(current_cohort::text,'UTF8')) OR NEW.expires_at<=clock_timestamp()
 THEN RAISE EXCEPTION 'Original comparison cohort changed before COMMIT' USING ERRCODE='42501'; END IF;
 DELETE FROM creator.comparison_read_scope WHERE pid=NEW.pid AND xid=NEW.xid AND creator_id=NEW.creator_id;
 RETURN NULL;
END $$;
ALTER FUNCTION creator.comparison_cohort_now(uuid,text,text) OWNER TO creator_comparison_reader;
ALTER FUNCTION creator.read_comparison_cohort(uuid,text,text) OWNER TO creator_comparison_reader;
ALTER FUNCTION creator.end_comparison_read() OWNER TO creator_comparison_reader;
REVOKE ALL ON FUNCTION creator.comparison_cohort_now(uuid,text,text),creator.read_comparison_cohort(uuid,text,text),creator.end_comparison_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.read_comparison_cohort(uuid,text,text) TO creator_runtime;
CREATE CONSTRAINT TRIGGER comparison_read_commit AFTER INSERT ON creator.comparison_read_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.end_comparison_read();
COMMIT;
