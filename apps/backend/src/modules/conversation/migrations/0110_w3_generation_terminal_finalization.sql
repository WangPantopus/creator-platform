-- W8 reserved0110. Held source only; no registry/ledger activation here.
-- Fixed original-cursor finalization, not output text, memory, provider or
-- financial authority. W1/W8 and actual W2/W4 settlement bookends are required.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_generation_terminal') THEN
  CREATE ROLE creator_w3_generation_terminal NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_w3_generation_terminal'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
  AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r)
  OR EXISTS(SELECT FROM pg_class WHERE relowner=r)
  OR EXISTS(SELECT FROM pg_proc WHERE proowner=r) THEN
  RAISE EXCEPTION 'Unsafe existing W3 terminal consumer custody';
 END IF;
 IF to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)') IS NULL
  OR to_regprocedure('creator.generation_scope_matches(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'Genuine generation terminal and registry custody are required';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w3_generation_terminal;
GRANT EXECUTE ON FUNCTION creator.generation_terminal_matches(uuid,uuid,boolean),
 creator.generation_scope_matches(uuid,uuid) TO creator_w3_generation_terminal;
SET LOCAL ROLE creator_owner;
GRANT SELECT(id,transaction_id,backend_pid,login_name,generation_id,custody_token,mode,task,transitioned,finalized,created_at)
 ON creator.generation_terminal_scope TO creator_w3_generation_terminal;
CREATE POLICY w3_terminal_nonce ON creator.generation_terminal_scope FOR SELECT TO creator_w3_generation_terminal USING(
 session_user='creator_generation_worker' AND id=nullif(current_setting('generation.terminal_nonce',true),'')::uuid
 AND transaction_id=pg_current_xact_id_if_assigned() AND backend_pid=pg_backend_pid() AND login_name=session_user
 AND task IS NOT NULL AND generation_id=(task->>'generationId')::uuid
 AND created_at>clock_timestamp()-interval '5 seconds'
 AND nullif(current_setting('generation.scope_nonce',true),'') IS NULL
 AND nullif(current_setting('app.account_id',true),'') IS NULL
 AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
 AND nullif(current_setting('app.creator_id',true),'') IS NULL
 AND nullif(current_setting('app.fan_id',true),'') IS NULL
);
GRANT SELECT(id,thread_id,creator_id,fan_id,state,last_sequence,ai_message_id),
 UPDATE(state,completed_at,worker_token,lease_until) ON creator.generation TO creator_w3_generation_terminal;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,delivery_state),UPDATE(delivery_state)
 ON creator.message TO creator_w3_generation_terminal;
GRANT SELECT(id,creator_id,fan_id,event_cursor),UPDATE(event_cursor)
 ON creator.thread TO creator_w3_generation_terminal;
GRANT INSERT(thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id)
 ON creator.event TO creator_w3_generation_terminal;
CREATE POLICY w3_terminal_read ON creator.generation FOR SELECT TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE generation.id=s.generation_id
  AND generation.thread_id=(s.task->>'threadId')::uuid AND generation.creator_id=(s.task->>'creatorId')::uuid
  AND generation.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_terminal_write ON creator.generation FOR UPDATE TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE generation.id=s.generation_id
  AND generation.thread_id=(s.task->>'threadId')::uuid AND generation.creator_id=(s.task->>'creatorId')::uuid
  AND generation.fan_id=(s.task->>'fanId')::uuid)) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE generation.id=s.generation_id
  AND generation.thread_id=(s.task->>'threadId')::uuid AND generation.creator_id=(s.task->>'creatorId')::uuid
  AND generation.fan_id=(s.task->>'fanId')::uuid AND generation.state=s.task->>'targetState'));
CREATE POLICY w3_terminal_read ON creator.message FOR SELECT TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE message.id=(s.task->>'aiMessageId')::uuid
  AND message.thread_id=(s.task->>'threadId')::uuid AND message.creator_id=(s.task->>'creatorId')::uuid
  AND message.fan_id=(s.task->>'fanId')::uuid AND message.author_kind='ai'));
CREATE POLICY w3_terminal_write ON creator.message FOR UPDATE TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE message.id=(s.task->>'aiMessageId')::uuid
  AND message.thread_id=(s.task->>'threadId')::uuid AND message.creator_id=(s.task->>'creatorId')::uuid
  AND message.fan_id=(s.task->>'fanId')::uuid AND message.author_kind='ai')) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE message.id=(s.task->>'aiMessageId')::uuid
  AND message.thread_id=(s.task->>'threadId')::uuid AND message.creator_id=(s.task->>'creatorId')::uuid
  AND message.fan_id=(s.task->>'fanId')::uuid AND message.author_kind='ai' AND message.delivery_state=s.task->>'targetState'));
CREATE POLICY w3_terminal_read ON creator.thread FOR SELECT TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_terminal_write ON creator.thread FOR UPDATE TO creator_w3_generation_terminal USING(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid)) WITH CHECK(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE thread.id=(s.task->>'threadId')::uuid
  AND thread.creator_id=(s.task->>'creatorId')::uuid AND thread.fan_id=(s.task->>'fanId')::uuid));
CREATE POLICY w3_terminal_event ON creator.event FOR INSERT TO creator_w3_generation_terminal WITH CHECK(
 EXISTS(SELECT FROM creator.generation_terminal_scope s WHERE event.thread_id=(s.task->>'threadId')::uuid
  AND event.creator_id=(s.task->>'creatorId')::uuid AND event.fan_id=(s.task->>'fanId')::uuid
  AND event.actor_account_id=(s.task->>'initiatingAccountId')::uuid));

CREATE FUNCTION creator.generation_conversation_terminal(g uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE task jsonb; tid uuid; cid uuid; fid uuid; mid uuid; target text; original text; cursor integer; changed integer; frame jsonb;
BEGIN
 IF session_user<>'creator_generation_worker' OR g IS NULL OR c IS NULL
  OR NOT creator.generation_terminal_matches(g,c,false) THEN
  RAISE EXCEPTION 'Use genuine original-generation terminal custody' USING ERRCODE='42501';
 END IF;
 SELECT s.task INTO task FROM creator.generation_terminal_scope s
 WHERE s.generation_id=g AND s.custody_token=c AND NOT s.transitioned AND NOT s.finalized;
 IF task IS NULL THEN RAISE EXCEPTION 'Original terminal transition is unavailable' USING ERRCODE='55000'; END IF;
 tid:=(task->>'threadId')::uuid; cid:=(task->>'creatorId')::uuid; fid:=(task->>'fanId')::uuid;
 mid:=(task->>'aiMessageId')::uuid; target:=task->>'targetState'; original:=task->>'sourceState';
 IF target NOT IN('delivered','interrupted','failed') OR target IS NULL
  OR (target='delivered' AND (task->>'lastSequence')::integer=0) THEN
  RAISE EXCEPTION 'Use the captured observed output outcome' USING ERRCODE='23514';
 END IF;
 UPDATE creator.generation SET state=target
 WHERE id=g AND thread_id=tid AND creator_id=cid AND fan_id=fid AND state=original
  AND ai_message_id=mid AND last_sequence=(task->>'lastSequence')::integer;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Original generation changed' USING ERRCODE='23514'; END IF;
 UPDATE creator.message SET delivery_state=target
 WHERE id=mid AND thread_id=tid AND creator_id=cid AND fan_id=fid AND author_kind='ai'
  AND delivery_state=task->>'originalMessageState';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Original AI message changed' USING ERRCODE='23514'; END IF;
 UPDATE creator.generation SET completed_at=clock_timestamp(),worker_token=NULL,lease_until=NULL
 WHERE id=g AND thread_id=tid AND creator_id=cid AND fan_id=fid AND state=target;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 OR NOT creator.generation_terminal_matches(g,c,true) THEN
  RAISE EXCEPTION 'Original finalization is incomplete' USING ERRCODE='23514';
 END IF;
 UPDATE creator.thread SET event_cursor=event_cursor+1 WHERE id=tid AND creator_id=cid AND fan_id=fid
 RETURNING event_cursor INTO cursor;
 IF cursor IS NULL THEN RAISE EXCEPTION 'Original thread is unavailable' USING ERRCODE='23514'; END IF;
 frame:=jsonb_build_object('threadId',tid,'cursor',cursor,'epoch',(task->>'epoch')::integer,
  'kind',CASE WHEN target='delivered' THEN 'delivered' ELSE 'interrupted' END,
  'messageId',mid,'authorKind','ai','text','','generationId',g,'sequence',(task->>'lastSequence')::integer);
 -- Historical initiating account is attribution on the original AI event,
 -- never a reconstructed Actor or interactive authority. No body is read.
 INSERT INTO creator.event(thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id)
 VALUES(tid,cid,fid,cursor,frame->>'kind',frame,(task->>'initiatingAccountId')::uuid);
 IF NOT creator.generation_terminal_matches(g,c,true) THEN
  RAISE EXCEPTION 'Terminal custody ended before frame commit' USING ERRCODE='42501';
 END IF;
 PERFORM pg_notify('creator_thread_frames',tid::text);
 RETURN frame;
END $$;
RESET ROLE;
ALTER FUNCTION creator.generation_conversation_terminal(uuid,uuid) OWNER TO creator_w3_generation_terminal;
REVOKE ALL ON FUNCTION creator.generation_conversation_terminal(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.generation_conversation_terminal(uuid,uuid) TO creator_generation_worker;
-- No raw worker grants, registration, ledger, retention or settlement approval.
COMMIT;
