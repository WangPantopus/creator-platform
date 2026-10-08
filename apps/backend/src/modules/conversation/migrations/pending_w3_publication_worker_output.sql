-- Held0220 W3 publication output. W8 owns activation and complete review.
-- Genuine original W1 preparation and W4 recipient ports only. No Actor,
-- ThreadScope, caller body, signature, money or private W1 scope-table grant.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w3_publication_output')
  OR to_regprocedure('creator.fulfillment_publication_worker_family_matches(uuid,uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('creator.fulfillment_publication_worker_recipient(uuid,uuid,uuid,uuid)') IS NULL
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_publication_worker'
   AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls)
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['thread','message','event'])
    AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND pg_get_userbyid(c.relowner)='creator_owner')<>3 THEN
  RAISE EXCEPTION 'Actual original W4 recipient and forced W3 relations required';
 END IF;
 CREATE ROLE creator_w3_publication_output NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_w3_publication_output;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_family_matches(uuid,uuid,uuid,uuid),
 creator.fulfillment_publication_worker_recipient(uuid,uuid,uuid,uuid) TO creator_w3_publication_output;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.publication_worker_system_binding (
 preparation_nonce uuid NOT NULL,custody_token uuid NOT NULL,content_id uuid NOT NULL,
 packet_id uuid NOT NULL,thread_id uuid NOT NULL,backend_pid integer NOT NULL,
 transaction_id xid8 NOT NULL,login_name name NOT NULL,
 message_id uuid NOT NULL,event_id uuid NOT NULL,epoch integer NOT NULL CHECK(epoch>=0),
 cursor integer CHECK(cursor>0),recipient jsonb NOT NULL,frame jsonb,
 written boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(preparation_nonce,content_id,packet_id,thread_id),
 UNIQUE(backend_pid,transaction_id,preparation_nonce,thread_id),
 UNIQUE(message_id),UNIQUE(event_id),
 CHECK((written AND cursor IS NOT NULL AND frame IS NOT NULL)
  OR (NOT written AND cursor IS NULL AND frame IS NULL))
);
ALTER TABLE creator.publication_worker_system_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.publication_worker_system_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE creator.publication_worker_system_binding FROM PUBLIC,creator_runtime,creator_publication_worker;
GRANT SELECT(preparation_nonce,custody_token,content_id,packet_id,thread_id,backend_pid,
 transaction_id,login_name,message_id,event_id,epoch,cursor,recipient,frame,written,created_at),
 INSERT(preparation_nonce,custody_token,content_id,packet_id,thread_id,backend_pid,
 transaction_id,login_name,message_id,event_id,epoch,recipient),
 UPDATE(cursor,frame,written),DELETE
 ON creator.publication_worker_system_binding TO creator_w3_publication_output;
CREATE POLICY w3_publication_system_private ON creator.publication_worker_system_binding
 FOR ALL TO creator_w3_publication_output USING(
 session_user='creator_publication_worker' AND login_name=session_user
 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned())
 WITH CHECK(session_user='creator_publication_worker' AND login_name=session_user
 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned());
CREATE POLICY w3_publication_system_private_bound ON creator.publication_worker_system_binding
 AS RESTRICTIVE FOR ALL TO creator_w3_publication_output USING(
 session_user='creator_publication_worker' AND login_name=session_user
 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned())
 WITH CHECK(session_user='creator_publication_worker' AND login_name=session_user
 AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id_if_assigned());
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_w3_publication_output;
GRANT SELECT(id,creator_id,fan_id,control_epoch,revision,message_sequence,event_cursor,deleted_at),
 UPDATE(revision,message_sequence,event_cursor,last_activity_at)
 ON creator.thread TO creator_w3_publication_output;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,
 control_epoch,sequence,version,signed_act_id,signed_content_hash,citations,off_the_record,created_at),
 INSERT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,
 control_epoch,sequence,version,signed_act_id,signed_content_hash,citations,off_the_record,created_at)
 ON creator.message TO creator_w3_publication_output;
GRANT SELECT(id,thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id,created_at),
 INSERT(id,thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id,created_at)
 ON creator.event TO creator_w3_publication_output;
DO $$ DECLARE relation text; predicate text; BEGIN
 FOREACH relation IN ARRAY ARRAY['thread','message','event'] LOOP
  predicate:=format('EXISTS(SELECT FROM creator.publication_worker_system_binding b
   WHERE %I.%I=b.thread_id AND %I.creator_id=(b.recipient->>''creatorId'')::uuid
    AND %I.fan_id=(b.recipient->>''fanId'')::uuid
    AND creator.fulfillment_publication_worker_family_matches(b.preparation_nonce,b.custody_token,b.packet_id,b.thread_id))',
   relation,CASE WHEN relation='thread' THEN 'id' ELSE 'thread_id' END,relation,relation);
  IF relation='message' THEN
   predicate:=predicate||' AND EXISTS(SELECT FROM creator.publication_worker_system_binding b
     JOIN creator.thread t ON t.id=b.thread_id
     WHERE message.id=b.message_id AND message.control_epoch=b.epoch AND message.sequence=t.message_sequence)
    AND author_kind=''system'' AND author_account_id IS NULL AND signed_act_id IS NULL
    AND signed_content_hash IS NULL AND text=''Answered publicly.'' AND delivery_state=''delivered''
    AND version=1 AND NOT off_the_record AND citations=''{}''::uuid[]';
  ELSIF relation='event' THEN
   predicate:=predicate||' AND EXISTS(SELECT FROM creator.publication_worker_system_binding b
     JOIN creator.thread t ON t.id=b.thread_id
     WHERE event.id=b.event_id AND event.cursor=t.event_cursor
      AND event.actor_account_id=(b.recipient->>''publisherAccountId'')::uuid
      AND event.payload=jsonb_build_object(''threadId'',b.thread_id,''cursor'',event.cursor,''epoch'',b.epoch,
       ''kind'',''delivered'',''messageId'',b.message_id,''authorKind'',''system'',''text'',''Answered publicly.'',
       ''generationId'',NULL,''sequence'',0,''systemLink'',jsonb_build_object(''kind'',''published_answer'',
        ''creatorId'',(b.recipient->>''creatorId'')::uuid,''contentId'',b.content_id,
        ''contentVersion'',(b.recipient->>''contentVersion'')::integer,''label'',''Answered publicly.'')))
    AND type=''delivered''';
  END IF;
  EXECUTE format('CREATE POLICY w3_publication_system_family ON creator.%I FOR ALL TO creator_w3_publication_output USING(%s) WITH CHECK(%s)',relation,predicate,predicate);
  EXECUTE format('CREATE POLICY w3_publication_system_family_bound ON creator.%I AS RESTRICTIVE FOR ALL TO creator_w3_publication_output USING(%s) WITH CHECK(%s)',relation,predicate,predicate);
 END LOOP;
END $$;
RESET ROLE;

CREATE FUNCTION creator.publication_worker_system_link_matches(n uuid,t uuid,p uuid,th uuid,m uuid,e uuid)
 RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding record; recipient jsonb; current_thread record;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_user<>'creator_w3_publication_output'
  OR current_setting('transaction_isolation')<>'read committed'
  OR n IS NULL OR t IS NULL OR p IS NULL OR th IS NULL OR m IS NULL OR e IS NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR creator.fulfillment_publication_worker_family_matches(n,t,p,th) IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT b.preparation_nonce,b.custody_token,b.content_id,b.packet_id,b.thread_id,b.backend_pid,
  b.transaction_id,b.login_name,b.message_id,b.event_id,b.epoch,b.cursor,b.recipient,b.frame,b.written,b.created_at INTO binding FROM creator.publication_worker_system_binding b
  WHERE b.preparation_nonce=n AND b.custody_token=t AND b.content_id IS NOT NULL
   AND b.packet_id=p AND b.thread_id=th AND b.message_id=m AND b.event_id=e AND b.written;
 IF binding IS NULL THEN RETURN false; END IF;
 recipient:=creator.fulfillment_publication_worker_recipient(n,t,p,th);
 SELECT id,creator_id,fan_id,control_epoch,event_cursor,message_sequence INTO current_thread FROM creator.thread
  WHERE id=th AND creator_id=(recipient->>'creatorId')::uuid AND fan_id=(recipient->>'fanId')::uuid AND deleted_at IS NULL;
 RETURN coalesce(recipient=binding.recipient AND current_thread IS NOT NULL
  AND current_thread.control_epoch=binding.epoch AND current_thread.event_cursor=binding.cursor
  AND EXISTS(SELECT FROM creator.message message WHERE message.id=m AND message.thread_id=th
   AND message.creator_id=current_thread.creator_id AND message.fan_id=current_thread.fan_id
   AND message.control_epoch=binding.epoch AND message.sequence=current_thread.message_sequence
   AND message.created_at>=binding.created_at AND message.created_at<=clock_timestamp())
  AND EXISTS(SELECT FROM creator.event event WHERE event.id=e AND event.thread_id=th
   AND event.creator_id=current_thread.creator_id AND event.fan_id=current_thread.fan_id
   AND event.cursor=binding.cursor AND event.payload=binding.frame
   AND event.actor_account_id=(recipient->>'publisherAccountId')::uuid
   AND event.created_at>=binding.created_at AND event.created_at<=clock_timestamp()),false);
END $$;

CREATE FUNCTION creator.publication_worker_system_link(n uuid,t uuid,p uuid,th uuid)
 RETURNS TABLE(message_id uuid,event_id uuid,cursor integer,epoch integer)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE recipient jsonb; original_thread record; existing record; mid uuid; eid uuid;
 current_cursor integer; current_epoch integer; message_sequence integer; out_frame jsonb; changed integer;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0220_w3_publication_worker_output') THEN
  RAISE EXCEPTION 'Actual reviewed W3 publication output is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_publication_worker' OR current_user<>'creator_w3_publication_output'
  OR current_setting('transaction_isolation')<>'read committed'
  OR n IS NULL OR t IS NULL OR p IS NULL OR th IS NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL
  OR creator.fulfillment_publication_worker_family_matches(n,t,p,th) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The genuine bound original recipient is required' USING ERRCODE='42501'; END IF;
 recipient:=creator.fulfillment_publication_worker_recipient(n,t,p,th);
 IF jsonb_typeof(recipient) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(recipient))<>13
  OR NOT recipient ?& ARRAY['packetId','commitmentId','threadId','creatorId','fanId','packetVersion','commitmentVersion',
   'controlEpoch','publisherAccountId','planRef','contentId','contentVersion','publicationSignedActId']
  OR recipient->>'packetId' IS DISTINCT FROM p::text OR recipient->>'threadId' IS DISTINCT FROM th::text
  OR recipient->>'publicationSignedActId' IS NULL THEN
  RAISE EXCEPTION 'The fixed genuine W4 recipient projection changed' USING ERRCODE='42501'; END IF;
 SELECT b.message_id,b.event_id,b.cursor,b.epoch,b.recipient,b.written INTO existing FROM creator.publication_worker_system_binding b
  WHERE b.preparation_nonce=n AND b.custody_token=t AND b.packet_id=p AND b.thread_id=th;
 IF existing IS NOT NULL THEN
  IF existing.written IS DISTINCT FROM true OR existing.recipient IS DISTINCT FROM recipient
   OR creator.publication_worker_system_link_matches(n,t,p,th,existing.message_id,existing.event_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The actual original System output changed' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT existing.message_id,existing.event_id,existing.cursor,existing.epoch;
  RETURN;
 END IF;
 -- These server UUIDs designate pending INSERTs; written=false grants no
 -- output proof. Only actual message/event writes below complete the binding.
 mid:=gen_random_uuid();eid:=gen_random_uuid();current_epoch:=(recipient->>'controlEpoch')::integer;
 INSERT INTO creator.publication_worker_system_binding(preparation_nonce,custody_token,content_id,
  packet_id,thread_id,backend_pid,transaction_id,login_name,message_id,event_id,epoch,recipient)
 VALUES(n,t,(recipient->>'contentId')::uuid,p,th,pg_backend_pid(),pg_current_xact_id(),session_user,mid,eid,current_epoch,recipient);
 SELECT thread.id,thread.creator_id,thread.fan_id,thread.control_epoch,thread.revision,thread.message_sequence,thread.event_cursor
 INTO original_thread FROM creator.thread thread WHERE thread.id=th
  AND thread.creator_id=(recipient->>'creatorId')::uuid AND thread.fan_id=(recipient->>'fanId')::uuid
  AND thread.deleted_at IS NULL FOR UPDATE NOWAIT;
 IF original_thread IS NULL OR original_thread.control_epoch IS DISTINCT FROM current_epoch THEN
  RAISE EXCEPTION 'The existing original recipient thread changed' USING ERRCODE='42501'; END IF;
 UPDATE creator.thread thread SET revision=thread.revision+1,message_sequence=thread.message_sequence+1,
  event_cursor=thread.event_cursor+1,last_activity_at=clock_timestamp()
 WHERE thread.id=th AND thread.creator_id=original_thread.creator_id AND thread.fan_id=original_thread.fan_id
  AND thread.control_epoch=current_epoch AND thread.revision=original_thread.revision
 RETURNING thread.event_cursor,thread.message_sequence INTO current_cursor,message_sequence;
 IF current_cursor IS NULL OR message_sequence IS NULL THEN
  RAISE EXCEPTION 'The original recipient counters changed' USING ERRCODE='42501'; END IF;
 INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,
  control_epoch,sequence,version,signed_act_id,signed_content_hash,citations,off_the_record,created_at)
 VALUES(mid,th,original_thread.creator_id,original_thread.fan_id,'system',NULL,'Answered publicly.','delivered',
  current_epoch,message_sequence,1,NULL,NULL,'{}'::uuid[],false,clock_timestamp());
 out_frame:=jsonb_build_object('threadId',th,'cursor',current_cursor,'epoch',current_epoch,'kind','delivered',
  'messageId',mid,'authorKind','system','text','Answered publicly.','generationId',NULL,'sequence',0,
  'systemLink',jsonb_build_object('kind','published_answer','creatorId',original_thread.creator_id,
   'contentId',(recipient->>'contentId')::uuid,'contentVersion',(recipient->>'contentVersion')::integer,'label','Answered publicly.'));
 INSERT INTO creator.event(id,thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id,created_at)
 VALUES(eid,th,original_thread.creator_id,original_thread.fan_id,current_cursor,'delivered',out_frame,(recipient->>'publisherAccountId')::uuid,clock_timestamp());
 UPDATE creator.publication_worker_system_binding b SET cursor=current_cursor,frame=out_frame,written=true
 WHERE b.preparation_nonce=n AND b.custody_token=t AND b.packet_id=p AND b.thread_id=th AND NOT b.written;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 OR creator.publication_worker_system_link_matches(n,t,p,th,mid,eid) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Actual original System output proof is required' USING ERRCODE='42501'; END IF;
 PERFORM pg_notify('creator_thread_frames',th::text);
 RETURN QUERY SELECT mid,eid,current_cursor,current_epoch;
END $$;

-- Only the real W4 owner may consume this ending port after its complete
-- delivery/proof receipt and before its final callback returns to W1. The raw
-- publication worker has no EXECUTE. W4's actual bridge remains required.
CREATE FUNCTION creator.end_publication_worker_system_links(n uuid,t uuid) RETURNS integer
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding record; actual integer:=0; changed integer;
BEGIN
 IF session_user<>'creator_publication_worker' OR n IS NULL OR t IS NULL
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL THEN
  RAISE EXCEPTION 'Actual original publication cleanup required' USING ERRCODE='42501'; END IF;
 FOR binding IN SELECT b.packet_id,b.thread_id,b.message_id,b.event_id,b.written FROM creator.publication_worker_system_binding b
  WHERE b.preparation_nonce=n AND b.custody_token=t ORDER BY b.thread_id,b.packet_id LOOP
  IF NOT binding.written OR creator.publication_worker_system_link_matches(n,t,binding.packet_id,
   binding.thread_id,binding.message_id,binding.event_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Actual complete original System proof changed' USING ERRCODE='42501'; END IF;
  actual:=actual+1;
 END LOOP;
 IF actual NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'The complete bounded original group is required' USING ERRCODE='42501'; END IF;
 DELETE FROM creator.publication_worker_system_binding b WHERE b.preparation_nonce=n AND b.custody_token=t;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>actual THEN RAISE EXCEPTION 'Original System cleanup changed' USING ERRCODE='42501'; END IF;
 RETURN changed;
END $$;

CREATE FUNCTION creator.require_publication_worker_system_cleanup() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.publication_worker_system_binding b
  WHERE b.preparation_nonce=NEW.preparation_nonce AND b.custody_token=NEW.custody_token
   AND b.backend_pid=NEW.backend_pid AND b.transaction_id=NEW.transaction_id AND b.login_name=NEW.login_name) THEN
  RAISE EXCEPTION 'Original System bindings must end before sole W1 COMMIT' USING ERRCODE='42501'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION creator.publication_worker_system_link(uuid,uuid,uuid,uuid) OWNER TO creator_w3_publication_output;
ALTER FUNCTION creator.publication_worker_system_link_matches(uuid,uuid,uuid,uuid,uuid,uuid) OWNER TO creator_w3_publication_output;
ALTER FUNCTION creator.end_publication_worker_system_links(uuid,uuid) OWNER TO creator_w3_publication_output;
ALTER FUNCTION creator.require_publication_worker_system_cleanup() OWNER TO creator_w3_publication_output;
SET LOCAL ROLE creator_owner;
CREATE CONSTRAINT TRIGGER w3_publication_system_cleanup AFTER INSERT ON creator.publication_worker_system_binding
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_publication_worker_system_cleanup();
RESET ROLE;
REVOKE ALL ON FUNCTION creator.publication_worker_system_link(uuid,uuid,uuid,uuid),
 creator.publication_worker_system_link_matches(uuid,uuid,uuid,uuid,uuid,uuid),
 creator.end_publication_worker_system_links(uuid,uuid),creator.require_publication_worker_system_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.publication_worker_system_link(uuid,uuid,uuid,uuid) TO creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.publication_worker_system_link_matches(uuid,uuid,uuid,uuid,uuid,uuid),
 creator.end_publication_worker_system_links(uuid,uuid) TO creator_fulfillment_publication_worker;
COMMIT;
