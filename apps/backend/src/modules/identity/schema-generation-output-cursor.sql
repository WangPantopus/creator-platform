-- Held additive output-cursor purpose; original0159/0179 bytes are immutable.
-- This source requires the actual W3 writer's full-XID provenance column and
-- private call after its real sentence/event INSERT. No activation or fixture.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_generation_cursor_authority') THEN
  CREATE ROLE creator_generation_cursor_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_generation_cursor_authority'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Isolated generation cursor custody required'; END IF;
 IF to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL
  OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('creator.generation_worker_output(uuid,uuid,integer,text,jsonb)')
   AND pg_get_userbyid(proowner)='creator_w3_generation_output' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'])
  OR NOT EXISTS(SELECT FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE c.oid=to_regclass('creator.generation_sentence_provenance') AND c.relkind='r'
    AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner'
    AND a.attname='transaction_id' AND a.atttypid='xid8'::regtype AND a.attnotnull AND NOT a.attisdropped) THEN
  RAISE EXCEPTION 'Actual original scope and full-XID sentence provenance required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_generation_cursor_authority;
GRANT EXECUTE ON FUNCTION creator.generation_scope_matches(uuid,uuid) TO creator_generation_cursor_authority;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_generation_cursor_authority;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,worker_token,operation,task,created_at),UPDATE(task)
 ON creator.generation_worker_scope TO creator_generation_cursor_authority;
CREATE POLICY generation_cursor_original_scope ON creator.generation_worker_scope
 TO creator_generation_cursor_authority USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('generation.terminal_nonce',true),'') IS NULL
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL)
 WITH CHECK(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.scope_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND operation='read' AND task IS NOT NULL AND created_at>clock_timestamp()-interval '5 seconds'
 AND generation_id=(task->>'generationId')::uuid AND worker_token=(task->>'workerToken')::uuid
 AND nullif(current_setting('generation.terminal_nonce',true),'') IS NULL
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL);
GRANT SELECT(id,thread_id,creator_id,fan_id,ai_message_id,last_sequence,context_revision,epoch,state,worker_token,lease_until)
 ON creator.generation TO creator_generation_cursor_authority;
GRANT SELECT(id,creator_id,fan_id,control,control_epoch,revision,event_cursor,processor_consent_version,deleted_at)
 ON creator.thread TO creator_generation_cursor_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,delivery_state,control_epoch)
 ON creator.message TO creator_generation_cursor_authority;
GRANT SELECT(id,thread_id,creator_id,fan_id,cursor,type,actor_account_id)
 ON creator.event TO creator_generation_cursor_authority;
GRANT SELECT(generation_id,sequence,thread_id,creator_id,fan_id,message_id,event_id,transaction_id)
 ON creator.generation_sentence_provenance TO creator_generation_cursor_authority;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['generation','message','event','generation_sentence_provenance'] LOOP
  EXECUTE format('CREATE POLICY generation_cursor_original_family ON creator.%I FOR SELECT TO creator_generation_cursor_authority
   USING(EXISTS(SELECT FROM creator.generation_worker_scope s WHERE %I.thread_id=(s.task->>''threadId'')::uuid
    AND %I.creator_id=(s.task->>''creatorId'')::uuid AND %I.fan_id=(s.task->>''fanId'')::uuid))',t,t,t,t);
 END LOOP;
END $$;
CREATE POLICY generation_cursor_original_thread ON creator.thread FOR SELECT TO creator_generation_cursor_authority
 USING(EXISTS(SELECT FROM creator.generation_worker_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
RESET ROLE;

-- Only the actual isolated W3 writer may call this, immediately after its
-- original immutable provenance/event INSERT. The login cannot advance a task.
CREATE FUNCTION creator.refresh_generation_output_cursor(g uuid,w uuid,n integer,e uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.generation_worker_scope%ROWTYPE; changed integer;
BEGIN
 IF session_user<>'creator_generation_worker' OR current_user<>'creator_generation_cursor_authority'
  OR g IS NULL OR w IS NULL OR n IS NULL OR n<1 OR n>1024 OR e IS NULL
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version~'^[0-9]{4}_w1_generation_output_cursor$')
  OR NOT creator.generation_scope_matches(g,w) THEN RETURN false; END IF;
 SELECT * INTO held FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF held.id IS NULL OR n<>(held.task->>'lastSequence')::integer+1 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT FROM creator.generation_sentence_provenance p
  JOIN creator.event ev ON ev.id=p.event_id AND ev.thread_id=p.thread_id AND ev.creator_id=p.creator_id AND ev.fan_id=p.fan_id
  JOIN creator.generation job ON job.id=p.generation_id AND job.thread_id=p.thread_id AND job.creator_id=p.creator_id AND job.fan_id=p.fan_id
  JOIN creator.thread t ON t.id=p.thread_id AND t.creator_id=p.creator_id AND t.fan_id=p.fan_id
  JOIN creator.message m ON m.id=p.message_id AND m.thread_id=p.thread_id AND m.creator_id=p.creator_id AND m.fan_id=p.fan_id
  WHERE p.generation_id=g AND p.sequence=n AND p.event_id=e AND p.transaction_id=pg_current_xact_id()
   AND p.thread_id=(held.task->>'threadId')::uuid AND p.creator_id=(held.task->>'creatorId')::uuid
   AND p.fan_id=(held.task->>'fanId')::uuid AND p.message_id=(held.task->>'aiMessageId')::uuid
   AND ev.type='sentence' AND ev.actor_account_id=(held.task->>'initiatingAccountId')::uuid AND ev.cursor=t.event_cursor
   AND job.worker_token=w AND job.lease_until=(held.task->>'leaseUntil')::timestamptz AND job.lease_until>clock_timestamp()
   AND job.state='generating' AND job.last_sequence=n AND job.ai_message_id=p.message_id
   AND job.epoch=(held.task->>'epoch')::integer AND job.context_revision=(held.task->>'contextRevision')::integer
   AND t.control='ai_active' AND t.control_epoch=job.epoch AND t.revision=job.context_revision+n AND t.deleted_at IS NULL
   AND t.processor_consent_version=held.task->>'processorConsentVersion'
   AND m.author_kind='ai' AND m.author_account_id IS NULL AND m.delivery_state='generating' AND m.control_epoch=job.epoch)
 THEN RETURN false; END IF;
 UPDATE creator.generation_worker_scope SET task=jsonb_set(held.task,'{lastSequence}',to_jsonb(n),false)
 WHERE id=held.id AND transaction_id=held.transaction_id AND backend_pid=held.backend_pid AND login_name=held.login_name
  AND operation=held.operation AND task=held.task AND created_at=held.created_at;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 OR NOT creator.generation_scope_matches(g,w) THEN
  RAISE EXCEPTION 'Original generation cursor lost custody' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;

-- This getter cannot mutate a cursor or mint a lease. It proves the SQL writer
-- already advanced the original task in the same full transaction and returns
-- only original scope/task and bounded event metadata for W1's private issuer.
CREATE FUNCTION creator.generation_output_cursor_view(g uuid,w uuid,n integer,c integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.generation_worker_scope%ROWTYPE; view jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR current_user<>'creator_generation_cursor_authority'
  OR g IS NULL OR w IS NULL OR n IS NULL OR n<1 OR n>1024 OR c IS NULL OR c<1
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version~'^[0-9]{4}_w1_generation_output_cursor$')
  OR NOT creator.generation_scope_matches(g,w) THEN RETURN NULL; END IF;
 SELECT * INTO held FROM creator.generation_worker_scope s WHERE s.generation_id=g AND s.worker_token=w;
 IF held.id IS NULL OR (held.task->>'lastSequence')::integer<>n THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('nonce',held.id,'task',held.task,'generationId',p.generation_id,'messageId',p.message_id,
  'sequence',p.sequence,'cursor',ev.cursor) INTO view
 FROM creator.generation_sentence_provenance p
 JOIN creator.event ev ON ev.id=p.event_id AND ev.thread_id=p.thread_id AND ev.creator_id=p.creator_id AND ev.fan_id=p.fan_id
 JOIN creator.generation job ON job.id=p.generation_id AND job.thread_id=p.thread_id AND job.creator_id=p.creator_id AND job.fan_id=p.fan_id
 JOIN creator.thread t ON t.id=p.thread_id AND t.creator_id=p.creator_id AND t.fan_id=p.fan_id
 JOIN creator.message m ON m.id=p.message_id AND m.thread_id=p.thread_id AND m.creator_id=p.creator_id AND m.fan_id=p.fan_id
 WHERE p.generation_id=g AND p.sequence=n AND p.transaction_id=pg_current_xact_id()
  AND p.thread_id=(held.task->>'threadId')::uuid AND p.creator_id=(held.task->>'creatorId')::uuid
  AND p.fan_id=(held.task->>'fanId')::uuid AND p.message_id=(held.task->>'aiMessageId')::uuid
  AND ev.type='sentence' AND ev.actor_account_id=(held.task->>'initiatingAccountId')::uuid AND ev.cursor=c AND t.event_cursor=c
  AND job.worker_token=w AND job.lease_until=(held.task->>'leaseUntil')::timestamptz AND job.lease_until>clock_timestamp()
  AND job.state='generating' AND job.last_sequence=n AND job.ai_message_id=p.message_id
  AND job.epoch=(held.task->>'epoch')::integer AND job.context_revision=(held.task->>'contextRevision')::integer
  AND t.control='ai_active' AND t.control_epoch=job.epoch AND t.revision=job.context_revision+n AND t.deleted_at IS NULL
  AND t.processor_consent_version=held.task->>'processorConsentVersion'
  AND m.author_kind='ai' AND m.author_account_id IS NULL AND m.delivery_state='generating' AND m.control_epoch=job.epoch;
 IF view IS NULL OR NOT creator.generation_scope_matches(g,w) THEN RETURN NULL; END IF;
 RETURN view;
END $$;
ALTER FUNCTION creator.refresh_generation_output_cursor(uuid,uuid,integer,uuid) OWNER TO creator_generation_cursor_authority;
ALTER FUNCTION creator.generation_output_cursor_view(uuid,uuid,integer,integer) OWNER TO creator_generation_cursor_authority;
REVOKE ALL ON FUNCTION creator.refresh_generation_output_cursor(uuid,uuid,integer,uuid),
 creator.generation_output_cursor_view(uuid,uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.refresh_generation_output_cursor(uuid,uuid,integer,uuid) TO creator_w3_generation_output;
GRANT EXECUTE ON FUNCTION creator.generation_output_cursor_view(uuid,uuid,integer,integer) TO creator_generation_worker;
COMMIT;
