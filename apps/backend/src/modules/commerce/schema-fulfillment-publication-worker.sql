-- Held 0219_w4_fulfillment_publication_worker; W8 owns activation.
-- Original0178 is unchanged. Only genuine retained W1 preparation can issue
-- bounded original recipients or record the actual separate W3 System output.
BEGIN;
RESET ROLE;
DO $$ DECLARE signature text; BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_publication_worker') THEN
  RAISE EXCEPTION 'A pre-existing fulfillment worker owner needs independent review'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'creator.publication_preparation_originals(uuid,uuid)',
  'creator.publication_preparation_original_family_bound(uuid,uuid,uuid,uuid)',
  'creator.publication_preparation_original_metadata_bound(text,uuid)',
  'creator.prepared_publication_matches(uuid,uuid)',
  'creator.publication_scope_matches(uuid,uuid,integer)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(signature)
   AND pg_get_userbyid(p.proowner)='creator_publication_authority' AND p.prosecdef
   AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]) THEN
   RAISE EXCEPTION 'Actual private original W1 publication ports required'; END IF;
 END LOOP;
 CREATE ROLE creator_fulfillment_publication_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_fulfillment_publication_worker;
GRANT EXECUTE ON FUNCTION creator.publication_preparation_originals(uuid,uuid),
 creator.publication_preparation_original_family_bound(uuid,uuid,uuid,uuid),
 creator.publication_preparation_original_metadata_bound(text,uuid),
 creator.prepared_publication_matches(uuid,uuid),creator.publication_scope_matches(uuid,uuid,integer)
 TO creator_fulfillment_publication_worker;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_fulfillment_publication_worker;
-- These bounded identifiers are also required to plan the original PUBLIC
-- interactive plan policy; no profile body, handle or credential is granted.
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_fulfillment_publication_worker;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_fulfillment_publication_worker;
GRANT SELECT(id,revision,creator_id,content_id,content_version,audience,minimum_recipients,recipient_count,source_hash,created_by)
 ON creator.commerce_fulfillment_plan TO creator_fulfillment_publication_worker;
GRANT SELECT(plan_id,plan_revision,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,
 mode_id,mode_version,acceptance_id,acceptance_hash,request_hash,consent_hash,capture_id,capture_hash)
 ON creator.commerce_fulfillment_member TO creator_fulfillment_publication_worker;
GRANT SELECT(id,creator_id,fan_id,thread_id,version,state,payment_state,updated_at),UPDATE(version,updated_at)
 ON creator.commerce_packet TO creator_fulfillment_publication_worker;
GRANT SELECT(id,packet_id,creator_id,fan_id,mode,state,version,due_at,dispute_open,delivered_at,delivered_message_id,evidence,outcome,payout_release_at),
 UPDATE(state,version,delivered_at,delivered_message_id,evidence,outcome,payout_release_at)
 ON creator.commerce_commitment TO creator_fulfillment_publication_worker;
-- UPDATE(id) is solely the PostgreSQL privilege required for FOR UPDATE NOWAIT;
-- WITH CHECK(false) forbids actual thread changes by this Commerce owner.
GRANT SELECT(id,creator_id,fan_id,control_epoch,message_sequence,event_cursor,off_the_record,deleted_at),UPDATE(id)
 ON creator.thread TO creator_fulfillment_publication_worker;
GRANT SELECT(id,creator_id,version,kind,packet_id,state,audience,published_at,withdrawn_at)
 ON creator.content_index TO creator_fulfillment_publication_worker;
GRANT SELECT(content_id,creator_id,version,author_account_id,signed_act_id,published_at)
 ON creator.content_publication TO creator_fulfillment_publication_worker;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,version,
 signed_act_id,signed_content_hash,off_the_record,created_at)
 ON creator.message TO creator_fulfillment_publication_worker;
GRANT SELECT(id,thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id,created_at)
 ON creator.event TO creator_fulfillment_publication_worker;
GRANT SELECT,INSERT ON creator.commerce_group_delivery TO creator_fulfillment_publication_worker;
GRANT SELECT(id,creator_id,fan_id,aggregate_id,aggregate_version,type,payload,created_at),
 INSERT(creator_id,fan_id,aggregate_id,aggregate_version,type,payload)
 ON creator.commerce_event TO creator_fulfillment_publication_worker;

DO $$ DECLARE relation text; predicate text; BEGIN
 FOR relation,predicate IN VALUES
  ('creator_profile','creator.publication_preparation_original_metadata_bound(''creator'',id)'),
  ('fan_profile','creator.publication_preparation_original_metadata_bound(''fan'',id)'),
  ('commerce_fulfillment_plan','creator.publication_preparation_original_metadata_bound(''plan'',id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id)'),
  ('commerce_fulfillment_member','creator.publication_preparation_original_metadata_bound(''plan'',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id)'),
  ('commerce_packet','creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id)'),
  ('commerce_commitment','creator.publication_preparation_original_metadata_bound(''commitment'',id) AND creator.publication_preparation_original_metadata_bound(''packet'',packet_id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id) AND creator.publication_preparation_original_metadata_bound(''fan'',fan_id)'),
  ('thread','EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.thread_id=thread.id AND m.creator_id=thread.creator_id AND m.fan_id=thread.fan_id)'),
  ('content_index','EXISTS(SELECT FROM creator.commerce_fulfillment_plan p WHERE p.content_id=content_index.id AND p.creator_id=content_index.creator_id AND p.content_version=content_index.version)'),
  ('content_publication','EXISTS(SELECT FROM creator.commerce_fulfillment_plan p WHERE p.content_id=content_publication.content_id AND p.creator_id=content_publication.creator_id AND p.content_version=content_publication.version)'),
  ('message','EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.thread_id=message.thread_id AND m.creator_id=message.creator_id AND m.fan_id=message.fan_id)'),
  ('event','EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.thread_id=event.thread_id AND m.creator_id=event.creator_id AND m.fan_id=event.fan_id)'),
  ('commerce_group_delivery','creator.publication_preparation_original_metadata_bound(''plan'',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id)'),
  ('commerce_event','creator.publication_preparation_original_metadata_bound(''commitment'',aggregate_id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id) AND creator.publication_preparation_original_metadata_bound(''fan'',fan_id)') LOOP
  EXECUTE format('CREATE POLICY fulfillment_publication_worker_read ON creator.%I FOR SELECT TO creator_fulfillment_publication_worker USING(%s)',relation,predicate);
  EXECUTE format('CREATE POLICY fulfillment_publication_worker_read_bound ON creator.%I AS RESTRICTIVE FOR SELECT TO creator_fulfillment_publication_worker USING(%s)',relation,predicate);
 END LOOP;
END $$;
CREATE POLICY fulfillment_publication_worker_thread_lock ON creator.thread FOR UPDATE TO creator_fulfillment_publication_worker
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.thread_id=thread.id AND m.creator_id=thread.creator_id AND m.fan_id=thread.fan_id)) WITH CHECK(false);
CREATE POLICY fulfillment_publication_worker_thread_lock_bound ON creator.thread AS RESTRICTIVE FOR UPDATE TO creator_fulfillment_publication_worker
 USING(EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.thread_id=thread.id AND m.creator_id=thread.creator_id AND m.fan_id=thread.fan_id)) WITH CHECK(false);
CREATE POLICY fulfillment_publication_worker_packet_write ON creator.commerce_packet FOR UPDATE TO creator_fulfillment_publication_worker
 USING(creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id))
 WITH CHECK(creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id));
CREATE POLICY fulfillment_publication_worker_packet_write_bound ON creator.commerce_packet AS RESTRICTIVE FOR UPDATE TO creator_fulfillment_publication_worker
 USING(creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id))
 WITH CHECK(creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id));
CREATE POLICY fulfillment_publication_worker_commitment_write ON creator.commerce_commitment FOR UPDATE TO creator_fulfillment_publication_worker
 USING(creator.publication_preparation_original_metadata_bound('commitment',id) AND creator.publication_preparation_original_metadata_bound('packet',packet_id))
 WITH CHECK(creator.publication_preparation_original_metadata_bound('commitment',id) AND creator.publication_preparation_original_metadata_bound('packet',packet_id));
CREATE POLICY fulfillment_publication_worker_commitment_write_bound ON creator.commerce_commitment AS RESTRICTIVE FOR UPDATE TO creator_fulfillment_publication_worker
 USING(creator.publication_preparation_original_metadata_bound('commitment',id) AND creator.publication_preparation_original_metadata_bound('packet',packet_id))
 WITH CHECK(creator.publication_preparation_original_metadata_bound('commitment',id) AND creator.publication_preparation_original_metadata_bound('packet',packet_id));
CREATE POLICY fulfillment_publication_worker_delivery_insert ON creator.commerce_group_delivery FOR INSERT TO creator_fulfillment_publication_worker
 WITH CHECK(creator.publication_preparation_original_metadata_bound('plan',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id));
CREATE POLICY fulfillment_publication_worker_delivery_insert_bound ON creator.commerce_group_delivery AS RESTRICTIVE FOR INSERT TO creator_fulfillment_publication_worker
 WITH CHECK(creator.publication_preparation_original_metadata_bound('plan',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id));
CREATE POLICY fulfillment_publication_worker_event_insert ON creator.commerce_event FOR INSERT TO creator_fulfillment_publication_worker
 WITH CHECK(creator.publication_preparation_original_metadata_bound('commitment',aggregate_id) AND creator.publication_preparation_original_metadata_bound('creator',creator_id) AND creator.publication_preparation_original_metadata_bound('fan',fan_id));
CREATE POLICY fulfillment_publication_worker_event_insert_bound ON creator.commerce_event AS RESTRICTIVE FOR INSERT TO creator_fulfillment_publication_worker
 WITH CHECK(creator.publication_preparation_original_metadata_bound('commitment',aggregate_id) AND creator.publication_preparation_original_metadata_bound('creator',creator_id) AND creator.publication_preparation_original_metadata_bound('fan',fan_id));

CREATE FUNCTION creator.fulfillment_publication_worker_family_matches(n uuid,t uuid,p uuid,th uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0219_w4_fulfillment_publication_worker') THEN
  RAISE EXCEPTION 'Actual fulfillment publication worker is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR n IS NULL OR t IS NULL OR p IS NULL OR th IS NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL THEN RETURN false; END IF;
 IF creator.prepared_publication_matches(n,t) IS DISTINCT FROM true THEN RETURN false; END IF;
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 RETURN coalesce(held IS NOT NULL AND held.finalizing IS NOT DISTINCT FROM false AND held.publication_nonce IS NOT NULL
  AND held.fulfillment_nonce IS NOT NULL AND held.signed_act_id IS NOT NULL
  AND jsonb_typeof(held.original_families)='array' AND jsonb_array_length(held.original_families) BETWEEN 2 AND 100
  AND EXISTS(SELECT FROM jsonb_to_recordset(held.original_families) family(packet_id uuid,thread_id uuid,creator_id uuid,fan_id uuid)
   WHERE family.packet_id=p AND family.thread_id=th AND family.creator_id=held.creator_id
    AND creator.publication_preparation_original_family_bound(family.creator_id,p,family.fan_id,th)),false);
END $$;

CREATE FUNCTION creator.fulfillment_publication_worker_recipient(n uuid,t uuid,p uuid,th uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; recipient jsonb;
BEGIN
 IF creator.fulfillment_publication_worker_family_matches(n,t,p,th) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The actual bound original recipient is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 SELECT jsonb_build_object('packetId',m.packet_id,'commitmentId',m.commitment_id,'threadId',m.thread_id,
  'creatorId',m.creator_id,'fanId',m.fan_id,'packetVersion',m.packet_version,'commitmentVersion',m.commitment_version,
  'controlEpoch',thread.control_epoch,'publisherAccountId',held.publisher_account_id,
  'planRef',jsonb_build_object('id',plan.id,'revision',plan.revision,'hash',plan.source_hash),
  'contentId',plan.content_id,'contentVersion',plan.content_version,'publicationSignedActId',held.signed_act_id)
 INTO recipient FROM creator.commerce_fulfillment_member m
 JOIN creator.commerce_fulfillment_plan plan ON plan.id=m.plan_id AND plan.revision=m.plan_revision
 JOIN creator.thread thread ON thread.id=m.thread_id AND thread.creator_id=m.creator_id AND thread.fan_id=m.fan_id
 WHERE m.packet_id=p AND m.thread_id=th AND m.creator_id=held.creator_id
  AND plan.id=(held.original_plan->>'planId')::uuid AND plan.revision=(held.original_plan->>'revision')::integer
  AND plan.content_id=held.content_id AND plan.content_version=held.version AND plan.created_by=held.publisher_account_id
  AND plan.source_hash=held.original_plan->>'hash' AND plan.audience=held.original_plan->'audience'
  AND thread.deleted_at IS NULL;
 IF recipient IS NULL THEN RAISE EXCEPTION 'The original recipient changed' USING ERRCODE='42501'; END IF;
 RETURN recipient;
END $$;

CREATE FUNCTION creator.fulfillment_publication_worker_recipients(n uuid,t uuid)
RETURNS TABLE(packet_id uuid,commitment_id uuid,thread_id uuid,creator_id uuid,fan_id uuid,packet_version integer,
 commitment_version integer,control_epoch integer,publisher_account_id uuid,plan_id uuid,plan_revision integer,
 plan_hash text,content_id uuid,content_version integer,publication_signed_act_id uuid,minimum_recipients integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; family record; current_packet record; current_commitment record; actual integer;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0219_w4_fulfillment_publication_worker') THEN
  RAISE EXCEPTION 'Actual fulfillment publication worker is not activated' USING ERRCODE='55000'; END IF;
 IF creator.prepared_publication_matches(n,t) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The actual original bound preparation is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 IF held IS NULL OR held.finalizing IS DISTINCT FROM false OR held.publication_nonce IS NULL OR held.signed_act_id IS NULL
  OR jsonb_typeof(held.original_families) IS DISTINCT FROM 'array'
  OR jsonb_array_length(held.original_families) NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'The complete original group is required' USING ERRCODE='42501'; END IF;
 -- Sorted TRY row leases precede W5 object positives. Neither missing threads
 -- nor a caller fan list can create a recipient or acquire a different family.
 FOR family IN SELECT * FROM jsonb_to_recordset(held.original_families) x(
  packet_id uuid,commitment_id uuid,thread_id uuid,creator_id uuid,fan_id uuid,
  packet_version integer,commitment_version integer) ORDER BY x.thread_id,x.packet_id LOOP
  IF creator.fulfillment_publication_worker_family_matches(n,t,family.packet_id,family.thread_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The original family changed' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM creator.thread x WHERE x.id=family.thread_id AND x.creator_id=family.creator_id
   AND x.fan_id=family.fan_id AND x.deleted_at IS NULL FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'The original existing thread is required' USING ERRCODE='42501'; END IF;
  SELECT x.id,x.version,x.state,x.payment_state INTO current_packet FROM creator.commerce_packet x
   WHERE x.id=family.packet_id AND x.creator_id=family.creator_id AND x.fan_id=family.fan_id
    AND x.thread_id=family.thread_id FOR UPDATE NOWAIT;
  SELECT x.id,x.version,x.state,x.due_at,x.dispute_open INTO current_commitment FROM creator.commerce_commitment x
   WHERE x.id=family.commitment_id AND x.packet_id=family.packet_id AND x.creator_id=family.creator_id
    AND x.fan_id=family.fan_id FOR UPDATE NOWAIT;
  IF current_packet IS NULL OR current_commitment IS NULL OR current_packet.version<>family.packet_version
   OR current_packet.state<>'accepted' OR current_packet.payment_state<>'captured'
   OR current_commitment.version<>family.commitment_version OR current_commitment.state NOT IN('due','in_progress')
   OR current_commitment.due_at IS NULL OR current_commitment.due_at<=clock_timestamp() OR current_commitment.dispute_open
   OR EXISTS(SELECT FROM creator.commerce_group_delivery d WHERE d.packet_id=family.packet_id) THEN
   RAISE EXCEPTION 'The original undelivered service is required' USING ERRCODE='42501'; END IF;
 END LOOP;
 RETURN QUERY SELECT m.packet_id,m.commitment_id,m.thread_id,m.creator_id,m.fan_id,m.packet_version,m.commitment_version,
  thread.control_epoch,held.publisher_account_id,plan.id,plan.revision,plan.source_hash,plan.content_id,plan.content_version,held.signed_act_id,plan.minimum_recipients
 FROM creator.commerce_fulfillment_member m JOIN creator.commerce_fulfillment_plan plan ON plan.id=m.plan_id AND plan.revision=m.plan_revision
 JOIN creator.thread thread ON thread.id=m.thread_id AND thread.creator_id=m.creator_id AND thread.fan_id=m.fan_id
 WHERE plan.id=(held.original_plan->>'planId')::uuid AND plan.revision=(held.original_plan->>'revision')::integer
  AND plan.creator_id=held.creator_id AND plan.content_id=held.content_id AND plan.content_version=held.version
  AND plan.recipient_count=jsonb_array_length(held.original_families) AND plan.minimum_recipients BETWEEN 2 AND 100
  AND plan.recipient_count BETWEEN plan.minimum_recipients AND 100 ORDER BY m.thread_id,m.packet_id;
 GET DIAGNOSTICS actual=ROW_COUNT;
 IF actual IS DISTINCT FROM jsonb_array_length(held.original_families) THEN
  RAISE EXCEPTION 'The complete original group changed' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION creator.fulfillment_publication_worker_delivery_matches(
 plan uuid,r integer,p uuid,c uuid,f uuid,th uuid,m uuid,o uuid,v integer,s uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL THEN RETURN false; END IF;
 RETURN coalesce(creator.publication_preparation_original_family_bound(c,p,f,th)
  AND creator.publication_preparation_original_metadata_bound('plan',plan)
  AND creator.publication_scope_matches(c,o,v)
  AND EXISTS(SELECT FROM creator.commerce_fulfillment_member member
   JOIN creator.commerce_fulfillment_plan header ON header.id=member.plan_id AND header.revision=member.plan_revision
   JOIN creator.content_index i ON i.id=header.content_id AND i.creator_id=header.creator_id AND i.version=header.content_version
   JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
   JOIN creator.thread thread ON thread.id=member.thread_id AND thread.creator_id=member.creator_id AND thread.fan_id=member.fan_id
   JOIN creator.message message ON message.id=m AND message.thread_id=thread.id AND message.creator_id=thread.creator_id AND message.fan_id=thread.fan_id
   WHERE header.id=plan AND header.revision=r AND member.packet_id=p AND member.creator_id=c
    AND member.fan_id=f AND member.thread_id=th AND header.content_id=o AND header.content_version=v
    AND pub.author_account_id=header.created_by AND pub.signed_act_id=s AND s IS NOT NULL
    AND i.kind='public_answer' AND i.packet_id IS NULL AND i.state='published' AND i.withdrawn_at IS NULL
    AND i.audience=header.audience AND i.published_at IS NOT NULL AND pub.published_at=i.published_at
    AND thread.deleted_at IS NULL AND message.control_epoch=thread.control_epoch AND message.sequence=thread.message_sequence
    AND message.author_kind='system' AND message.author_account_id IS NULL AND message.signed_act_id IS NULL
    AND message.signed_content_hash IS NULL AND message.delivery_state='delivered' AND message.version=1
    AND message.text='Answered publicly.' AND message.off_the_record=thread.off_the_record
    AND message.created_at>=pub.published_at),false);
END $$;

CREATE FUNCTION creator.fulfillment_publication_worker_record_delivery(n uuid,t uuid,p uuid,m uuid,e uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; member record; header record; actual_event record; actual_thread record;
 delivery_time timestamptz; delivery_evidence jsonb; affected integer;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0219_w4_fulfillment_publication_worker') THEN
  RAISE EXCEPTION 'Actual fulfillment publication worker is not activated' USING ERRCODE='55000'; END IF;
 IF creator.prepared_publication_matches(n,t) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The original bound preparation is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 SELECT * INTO member FROM creator.commerce_fulfillment_member x WHERE x.packet_id=p
  AND x.plan_id=(held.original_plan->>'planId')::uuid AND x.plan_revision=(held.original_plan->>'revision')::integer;
 IF member IS NULL OR m IS NULL OR e IS NULL OR creator.fulfillment_publication_worker_family_matches(n,t,p,member.thread_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The original issued recipient is required' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.revision,x.creator_id,x.content_id,x.content_version,x.audience,x.minimum_recipients,x.recipient_count,x.source_hash,x.created_by INTO header FROM creator.commerce_fulfillment_plan x WHERE x.id=member.plan_id AND x.revision=member.plan_revision;
 IF creator.fulfillment_publication_worker_delivery_matches(header.id,header.revision,p,member.creator_id,member.fan_id,
  member.thread_id,m,held.content_id,held.version,held.signed_act_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The actual original neutral System output is required' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.control_epoch,x.message_sequence,x.event_cursor,x.off_the_record,x.deleted_at INTO actual_thread FROM creator.thread x WHERE x.id=member.thread_id;
 SELECT x.id,x.cursor,x.type,x.payload,x.actor_account_id,x.created_at
 INTO actual_event FROM creator.event x WHERE x.id=e AND x.thread_id=member.thread_id
  AND x.creator_id=member.creator_id AND x.fan_id=member.fan_id;
 IF actual_event IS NULL OR actual_event.type<>'delivered' OR actual_event.cursor<>actual_thread.event_cursor
  OR actual_event.actor_account_id IS DISTINCT FROM held.publisher_account_id
  OR creator.publication_worker_system_link_matches(n,t,p,member.thread_id,m,e) IS DISTINCT FROM true
  OR actual_event.payload IS DISTINCT FROM jsonb_build_object('threadId',member.thread_id,'cursor',actual_event.cursor,
   'epoch',actual_thread.control_epoch,'kind','delivered','messageId',m,'authorKind','system','text','Answered publicly.',
   'generationId',NULL,'sequence',0,'systemLink',jsonb_build_object('kind','published_answer','creatorId',held.creator_id,
    'contentId',held.content_id,'contentVersion',held.version,'label','Answered publicly.')) THEN
  RAISE EXCEPTION 'The actual exact original System frame is required' USING ERRCODE='42501'; END IF;
 -- The actual separate W3 fixed proof retains the original issuer's PID,
 -- full XID/login/preparation and exact output. It must be published/applied
 -- after this W4 role exists; absence never substitutes an xmin/table grant.
 -- These are reentrant when the required recipient stage already holds them.
 -- A direct entry still refuses contention below W5 instead of waiting.
 PERFORM 1 FROM creator.commerce_packet x WHERE x.id=p FOR UPDATE NOWAIT;
 PERFORM 1 FROM creator.commerce_commitment x WHERE x.id=member.commitment_id FOR UPDATE NOWAIT;
 delivery_time=clock_timestamp();
 delivery_evidence=jsonb_build_object('kind','group_answer','planRef',jsonb_build_object('id',header.id,'revision',header.revision,'hash',header.source_hash),
  'contentId',held.content_id,'contentVersion',held.version,'messageId',m,'publicationSignedActId',held.signed_act_id,'authorKind','system');
 INSERT INTO creator.commerce_group_delivery(plan_id,plan_revision,packet_id,creator_id,fan_id,thread_id,message_id,content_id,content_version,publication_signed_act_id)
 VALUES(header.id,header.revision,p,member.creator_id,member.fan_id,member.thread_id,m,held.content_id,held.version,held.signed_act_id);
 UPDATE creator.commerce_commitment x SET state='delivered',delivered_at=delivery_time,delivered_message_id=m,evidence=delivery_evidence,
  outcome='group_answer',payout_release_at=delivery_time+interval '7 days',version=x.version+1
 WHERE x.id=member.commitment_id AND x.packet_id=p AND x.creator_id=member.creator_id AND x.fan_id=member.fan_id
  AND x.version=member.commitment_version AND x.state IN('due','in_progress') AND x.mode='group_answer'
  AND x.due_at>=delivery_time AND NOT x.dispute_open;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'The original due commitment changed' USING ERRCODE='42501'; END IF;
 UPDATE creator.commerce_packet x SET version=x.version+1,updated_at=delivery_time
 WHERE x.id=p AND x.creator_id=member.creator_id AND x.fan_id=member.fan_id AND x.thread_id=member.thread_id
  AND x.version=member.packet_version AND x.state='accepted' AND x.payment_state='captured';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'The original captured packet changed' USING ERRCODE='42501'; END IF;
 INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload)
 VALUES(member.creator_id,member.fan_id,member.commitment_id,member.commitment_version+1,'commitment_delivered',
  jsonb_build_object('packetId',p,'kind','group_answer','planRef',jsonb_build_object('id',header.id,'revision',header.revision,'hash',header.source_hash),
   'contentId',held.content_id,'contentVersion',held.version,'messageId',m));
 RETURN true;
END $$;

CREATE FUNCTION creator.fulfillment_publication_worker_receipt(n uuid,t uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; header record; member record; current_commitment record; link record; actual_event record;
 deliveries jsonb='[]'::jsonb; evidence jsonb; actual integer=0;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0219_w4_fulfillment_publication_worker') THEN
  RAISE EXCEPTION 'Actual fulfillment publication worker is not activated' USING ERRCODE='55000'; END IF;
 IF creator.prepared_publication_matches(n,t) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'The original bound preparation is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 IF held IS NULL OR held.finalizing IS DISTINCT FROM false OR held.signed_act_id IS NULL THEN
  RAISE EXCEPTION 'The actual current group preparation is required' USING ERRCODE='42501'; END IF;
 SELECT x.id,x.revision,x.creator_id,x.content_id,x.content_version,x.audience,x.minimum_recipients,x.recipient_count,x.source_hash,x.created_by INTO header FROM creator.commerce_fulfillment_plan x WHERE x.id=(held.original_plan->>'planId')::uuid
  AND x.revision=(held.original_plan->>'revision')::integer AND x.source_hash=held.original_plan->>'hash';
 FOR member IN SELECT x.* FROM creator.commerce_fulfillment_member x WHERE x.plan_id=header.id AND x.plan_revision=header.revision
  ORDER BY x.thread_id,x.packet_id LOOP
  SELECT x.* INTO link FROM creator.commerce_group_delivery x WHERE x.plan_id=header.id AND x.plan_revision=header.revision AND x.packet_id=member.packet_id;
  SELECT x.id,x.packet_id,x.creator_id,x.fan_id,x.mode,x.state,x.version,x.due_at,x.dispute_open,x.delivered_at,x.delivered_message_id,x.evidence,x.outcome,x.payout_release_at INTO current_commitment FROM creator.commerce_commitment x WHERE x.id=member.commitment_id AND x.packet_id=member.packet_id;
  evidence=jsonb_build_object('kind','group_answer','planRef',jsonb_build_object('id',header.id,'revision',header.revision,'hash',header.source_hash),
   'contentId',held.content_id,'contentVersion',held.version,'messageId',link.message_id,'publicationSignedActId',held.signed_act_id,'authorKind','system');
  IF link IS NULL OR current_commitment IS NULL OR current_commitment.state<>'delivered'
   OR current_commitment.version<>member.commitment_version+1 OR current_commitment.delivered_message_id IS DISTINCT FROM link.message_id
   OR current_commitment.delivered_at IS NULL OR current_commitment.due_at IS NULL OR current_commitment.delivered_at>current_commitment.due_at
   OR current_commitment.dispute_open OR current_commitment.outcome IS DISTINCT FROM 'group_answer' OR current_commitment.evidence IS DISTINCT FROM evidence
   OR current_commitment.payout_release_at IS DISTINCT FROM current_commitment.delivered_at+interval '7 days'
   OR NOT EXISTS(SELECT FROM creator.commerce_packet x WHERE x.id=member.packet_id AND x.version=member.packet_version+1
    AND x.state='accepted' AND x.payment_state='captured')
   OR creator.fulfillment_publication_worker_delivery_matches(header.id,header.revision,member.packet_id,member.creator_id,
    member.fan_id,member.thread_id,link.message_id,held.content_id,held.version,held.signed_act_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The complete original delivery changed' USING ERRCODE='42501'; END IF;
  SELECT x.id,x.cursor,x.payload,x.actor_account_id,x.created_at INTO actual_event FROM creator.event x
   JOIN creator.thread thread ON thread.id=x.thread_id AND thread.creator_id=x.creator_id AND thread.fan_id=x.fan_id
   WHERE x.thread_id=member.thread_id AND x.creator_id=member.creator_id AND x.fan_id=member.fan_id AND x.type='delivered'
    AND x.cursor=thread.event_cursor AND x.payload=jsonb_build_object('threadId',member.thread_id,'cursor',x.cursor,
     'epoch',thread.control_epoch,'kind','delivered','messageId',link.message_id,'authorKind','system','text','Answered publicly.',
     'generationId',NULL,'sequence',0,'systemLink',jsonb_build_object('kind','published_answer','creatorId',held.creator_id,
      'contentId',held.content_id,'contentVersion',held.version,'label','Answered publicly.'));
  IF actual_event IS NULL OR actual_event.actor_account_id IS DISTINCT FROM held.publisher_account_id
   OR creator.publication_worker_system_link_matches(n,t,member.packet_id,member.thread_id,link.message_id,actual_event.id) IS DISTINCT FROM true
   OR NOT EXISTS(SELECT FROM creator.commerce_event x WHERE x.aggregate_id=member.commitment_id
    AND x.aggregate_version=member.commitment_version+1 AND x.creator_id=member.creator_id AND x.fan_id=member.fan_id
    AND x.type='commitment_delivered' AND x.payload=jsonb_build_object('packetId',member.packet_id,'kind','group_answer',
     'planRef',jsonb_build_object('id',header.id,'revision',header.revision,'hash',header.source_hash),
     'contentId',held.content_id,'contentVersion',held.version,'messageId',link.message_id)) THEN
   RAISE EXCEPTION 'The actual original delivery event changed' USING ERRCODE='42501'; END IF;
  actual=actual+1;
  deliveries=deliveries||jsonb_build_array(jsonb_build_object('packetId',member.packet_id,'messageId',link.message_id,'eventId',actual_event.id,'cursor',actual_event.cursor));
 END LOOP;
 IF header IS NULL OR actual IS DISTINCT FROM jsonb_array_length(held.original_families)
  OR actual IS DISTINCT FROM header.recipient_count OR actual NOT BETWEEN 2 AND 100 THEN
  RAISE EXCEPTION 'The complete original group delivery is required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('planRef',jsonb_build_object('id',header.id,'revision',header.revision,'hash',header.source_hash),
  'contentId',held.content_id,'contentVersion',held.version,'publicationSignedActId',held.signed_act_id,
  'minimumRecipients',header.minimum_recipients,'deliveries',deliveries);
END $$;

-- Additive worker branch; the original interactive predicate below is byte-preserved.
CREATE OR REPLACE FUNCTION creator.commerce_group_delivery_exact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF session_user='creator_publication_worker' THEN
  IF current_user<>'creator_fulfillment_publication_worker'
   OR creator.fulfillment_publication_worker_delivery_matches(NEW.plan_id,NEW.plan_revision,NEW.packet_id,
    NEW.creator_id,NEW.fan_id,NEW.thread_id,NEW.message_id,NEW.content_id,NEW.content_version,
    NEW.publication_signed_act_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'The actual worker original System link is required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT FROM creator.commerce_fulfillment_member member JOIN creator.commerce_fulfillment_plan plan
  ON plan.id=member.plan_id AND plan.revision=member.plan_revision
  JOIN creator.message m ON m.id=NEW.message_id AND m.thread_id=member.thread_id AND m.creator_id=member.creator_id AND m.fan_id=member.fan_id
  JOIN creator.content_index i ON i.id=plan.content_id AND i.creator_id=plan.creator_id AND i.version=plan.content_version
  JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
  WHERE member.plan_id=NEW.plan_id AND member.plan_revision=NEW.plan_revision AND member.packet_id=NEW.packet_id
   AND member.creator_id=NEW.creator_id AND member.fan_id=NEW.fan_id AND member.thread_id=NEW.thread_id
   AND plan.created_by=nullif(current_setting('app.account_id',true),'')::uuid AND i.id=NEW.content_id AND i.version=NEW.content_version
   AND i.state='published' AND pub.published_at IS NOT NULL AND pub.author_account_id=plan.created_by
   AND pub.signed_act_id=NEW.publication_signed_act_id AND m.author_kind='system' AND m.author_account_id IS NULL
   AND m.signed_act_id IS NULL AND m.signed_content_hash IS NULL AND m.delivery_state='delivered'
   AND m.text='Answered publicly.' AND m.created_at>=pub.published_at) THEN
  RAISE EXCEPTION 'The exact existing-thread System link is required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
RESET ROLE;
ALTER FUNCTION creator.fulfillment_publication_worker_family_matches(uuid,uuid,uuid,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_family_matches(uuid,uuid,uuid,uuid) FROM PUBLIC;
ALTER FUNCTION creator.fulfillment_publication_worker_recipient(uuid,uuid,uuid,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_recipient(uuid,uuid,uuid,uuid) FROM PUBLIC;
ALTER FUNCTION creator.fulfillment_publication_worker_recipients(uuid,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_recipients(uuid,uuid) FROM PUBLIC;
ALTER FUNCTION creator.fulfillment_publication_worker_delivery_matches(uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,integer,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_delivery_matches(uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,integer,uuid) FROM PUBLIC;
ALTER FUNCTION creator.fulfillment_publication_worker_record_delivery(uuid,uuid,uuid,uuid,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_record_delivery(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
ALTER FUNCTION creator.fulfillment_publication_worker_receipt(uuid,uuid) OWNER TO creator_fulfillment_publication_worker;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_worker_receipt(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_family_matches(uuid,uuid,uuid,uuid) TO creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_recipient(uuid,uuid,uuid,uuid) TO creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_recipients(uuid,uuid) TO creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_record_delivery(uuid,uuid,uuid,uuid,uuid) TO creator_publication_worker;
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_worker_receipt(uuid,uuid) TO creator_publication_worker;
-- Actual W3 successor creates its separate output owner and grants only
-- family_matches/recipient to that owner; no missing-writer fallback is issued.
COMMIT;
