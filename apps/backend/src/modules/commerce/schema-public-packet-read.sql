-- W8 reserved 0070_w4_public_packet_read. Additive, unregistered proposal.
-- Requires canonical content reconciliation/media and personal Approval schemas.
-- No private prompt, fan identity, assertion, key or transaction is returned.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_public_read') THEN
  CREATE ROLE creator_commerce_public_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_public_read' AND
  (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe public request metadata role';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_commerce_public_read;

-- The caller retains its real account. These tuple settings restrict metadata
-- policies inside the two definer functions; settings alone grant no authority.
CREATE FUNCTION creator.commerce_public_packet_bound() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('app.account_id',true),'') IS NOT NULL AND EXISTS(
  SELECT 1 FROM creator.content_index i
  WHERE i.id=nullif(current_setting('app.w4_read_content',true),'')::uuid
   AND i.creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid
   AND i.version=nullif(current_setting('app.w4_read_version',true),'')::integer
   AND i.packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid
   AND i.state='published' AND i.withdrawn_at IS NULL AND i.kind='public_answer'
   AND i.audience=nullif(current_setting('app.w4_read_audience',true),'')::jsonb)
$$;
REVOKE ALL ON FUNCTION creator.commerce_public_packet_bound() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_public_packet_bound() TO creator_commerce_public_read;
GRANT SELECT(id,creator_id,version,packet_id,state,withdrawn_at,kind,audience) ON creator.content_index TO creator_commerce_public_read;
GRANT SELECT(id,creator_id,fan_id,thread_id,mode_id,snapshot,visibility,state,payment_state,accepted_act_id,accepted_action,accepted_at) ON creator.commerce_packet TO creator_commerce_public_read;
GRANT SELECT(id,packet_id,creator_id,fan_id,mode,state,delivered_at,delivered_message_id,evidence,dispute_open) ON creator.commerce_commitment TO creator_commerce_public_read;
GRANT SELECT(id,creator_id,shareable) ON creator.commerce_mode TO creator_commerce_public_read;
GRANT SELECT(commitment_id,creator_id,fan_id,fan_choice,creator_permission,revoked_at) ON creator.commerce_share_grant TO creator_commerce_public_read;
GRANT SELECT(packet_id,creator_id,fan_id,kind,amount,currency) ON creator.commerce_ledger TO creator_commerce_public_read;
GRANT SELECT(packet_id,operation,state) ON creator.commerce_effect TO creator_commerce_public_read;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_commerce_public_read;
-- Existing invoker RLS helpers evaluate these identity/Team metadata columns.
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_commerce_public_read;
GRANT SELECT(creator_id,account_id,roles,revoked_at) ON creator.team_membership TO creator_commerce_public_read;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,delivery_state,signed_act_id,signed_content_hash,approval_id,version) ON creator.message TO creator_commerce_public_read;
GRANT SELECT(id,account_id,credential_id,creator_id,act_type,subject_id,content_hash) ON creator.signed_act TO creator_commerce_public_read;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_commerce_public_read;
GRANT SELECT(signed_act_id,account_id,command,public_content,withdrawn_at) ON creator.signed_publication TO creator_commerce_public_read;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn) ON creator.signed_verification TO creator_commerce_public_read;
GRANT SELECT(id,account_id,revoked_at,commerce_approval_epoch) ON creator.passkey_credential TO creator_commerce_public_read;
GRANT SELECT(id,creator_id,fan_id,thread_id,approver_account_id,signed_act_id,content_hash,invalidated_at,delivered_message_id,key_epoch,creator_epoch) ON creator.commerce_approval TO creator_commerce_public_read;
GRANT SELECT(commerce_approval_epoch) ON creator.creator_profile TO creator_commerce_public_read;
GRANT SELECT(content_id,creator_id,version,signed_act_id,author_kind,author_account_id,published_at,media_evidence) ON creator.content_publication TO creator_commerce_public_read;
GRANT SELECT(content_id,creator_id,version,document) ON creator.content_revision TO creator_commerce_public_read;

CREATE POLICY public_packet_metadata ON creator.commerce_packet FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND id=nullif(current_setting('app.w4_read_packet',true),'')::uuid AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid);
CREATE POLICY public_packet_metadata ON creator.commerce_commitment FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid);
CREATE POLICY public_packet_metadata ON creator.commerce_share_grant FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid AND EXISTS(SELECT 1 FROM creator.commerce_commitment c WHERE c.id=commitment_id AND c.packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid));
CREATE POLICY public_packet_metadata ON creator.commerce_ledger FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid);
CREATE POLICY public_packet_metadata ON creator.commerce_effect FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid AND operation='refund');
CREATE POLICY public_packet_metadata ON creator.message FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid AND EXISTS(SELECT 1 FROM creator.commerce_commitment c WHERE c.delivered_message_id=message.id AND c.packet_id=nullif(current_setting('app.w4_read_packet',true),'')::uuid));
CREATE POLICY public_packet_metadata ON creator.commerce_approval FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid AND EXISTS(SELECT 1 FROM creator.message m WHERE m.approval_id=commerce_approval.id));
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['content_publication','content_revision'] LOOP
  EXECUTE format('CREATE POLICY public_packet_metadata ON creator.%I FOR SELECT TO creator_commerce_public_read USING(creator.commerce_public_packet_bound() AND content_id=nullif(current_setting(''app.w4_read_content'',true),'''')::uuid AND creator_id=nullif(current_setting(''app.w4_read_creator'',true),'''')::uuid AND version=nullif(current_setting(''app.w4_read_version'',true),'''')::integer)',relation);
 END LOOP;
END $$;
-- Immutable source identifiers only. These policies never expose credential
-- bytes/assertions and their definer result contains no account or message text.
CREATE POLICY public_packet_metadata ON creator.signed_act FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND creator_id=nullif(current_setting('app.w4_read_creator',true),'')::uuid AND
 (EXISTS(SELECT 1 FROM creator.commerce_packet p WHERE p.accepted_act_id=signed_act.id)
 OR EXISTS(SELECT 1 FROM creator.content_publication pub WHERE pub.signed_act_id=signed_act.id)
 OR EXISTS(SELECT 1 FROM creator.message m WHERE m.signed_act_id=signed_act.id)));
CREATE POLICY public_packet_metadata ON creator.signed_act_consumption FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND EXISTS(SELECT 1 FROM creator.signed_act sa WHERE sa.id=signed_act_id AND sa.account_id=signed_act_consumption.account_id));
CREATE POLICY public_packet_metadata ON creator.signed_publication FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND EXISTS(SELECT 1 FROM creator.signed_act sa WHERE sa.id=signed_act_id AND sa.account_id=signed_publication.account_id));
CREATE POLICY public_packet_metadata ON creator.passkey_credential FOR SELECT TO creator_commerce_public_read
 USING(creator.commerce_public_packet_bound() AND EXISTS(SELECT 1 FROM creator.signed_act sa WHERE sa.credential_id=passkey_credential.id AND sa.account_id=passkey_credential.account_id));

CREATE FUNCTION creator.commerce_public_packet_mode(c uuid,p uuid,i uuid,v integer,a jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_context text[]; names text[]=ARRAY['app.w4_read_creator','app.w4_read_packet','app.w4_read_content','app.w4_read_version','app.w4_read_audience']; values text[]=ARRAY[c::text,p::text,i::text,v::text,a::text]; result uuid; j integer;
BEGIN
 FOR j IN 1..5 LOOP old_context[j]=current_setting(names[j],true); PERFORM set_config(names[j],coalesce(values[j],''),true); END LOOP;
 SELECT packet.mode_id INTO result FROM creator.commerce_packet packet WHERE packet.id=p AND packet.creator_id=c;
 FOR j IN 1..5 LOOP PERFORM set_config(names[j],coalesce(old_context[j],''),true); END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION creator.commerce_public_packet_evidence(c uuid,p uuid,i uuid,v integer,a jsonb)
RETURNS TABLE(eligible boolean,signed_act_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_context text[]; names text[]=ARRAY['app.w4_read_creator','app.w4_read_packet','app.w4_read_content','app.w4_read_version','app.w4_read_audience']; values text[]=ARRAY[c::text,p::text,i::text,v::text,a::text]; j integer;
BEGIN
 FOR j IN 1..5 LOOP old_context[j]=current_setting(names[j],true); PERFORM set_config(names[j],coalesce(values[j],''),true); END LOOP;
 RETURN QUERY
 SELECT true, array_remove(ARRAY[acceptance.id,publication.id,delivery.id],NULL)
 FROM creator.commerce_packet packet
 JOIN creator.creator_profile owner ON owner.id=packet.creator_id
 JOIN creator.commerce_mode mode ON mode.id=packet.mode_id AND mode.creator_id=packet.creator_id
 JOIN creator.commerce_commitment commitment ON commitment.packet_id=packet.id AND commitment.creator_id=packet.creator_id AND commitment.fan_id=packet.fan_id
 JOIN creator.signed_act acceptance ON acceptance.id=packet.accepted_act_id AND acceptance.account_id=owner.account_id AND acceptance.creator_id=owner.id AND acceptance.act_type='accept' AND acceptance.subject_id=packet.thread_id
 JOIN creator.signed_act_consumption accepted ON accepted.signed_act_id=acceptance.id AND accepted.account_id=acceptance.account_id
 JOIN creator.signed_verification av ON av.id=acceptance.id AND av.account_id=acceptance.account_id AND av.creator_id=owner.id AND av.content_hash=acceptance.content_hash AND NOT av.key_revoked AND NOT av.creator_revoked AND NOT av.withdrawn
 JOIN creator.signed_publication ap ON ap.signed_act_id=acceptance.id AND ap.account_id=acceptance.account_id AND ap.withdrawn_at IS NULL
 JOIN creator.passkey_credential ak ON ak.id=acceptance.credential_id AND ak.account_id=acceptance.account_id AND ak.revoked_at IS NULL
 JOIN creator.content_publication pub ON pub.content_id=i AND pub.creator_id=c AND pub.version=v AND pub.author_account_id=owner.account_id AND pub.author_kind='human_creator' AND pub.published_at IS NOT NULL
 JOIN creator.content_revision revision ON revision.content_id=i AND revision.creator_id=c AND revision.version=v
 JOIN creator.signed_act publication ON publication.id=pub.signed_act_id AND publication.account_id=owner.account_id AND publication.creator_id=c AND publication.act_type='reply' AND publication.subject_id=i
 JOIN creator.signed_act_consumption published ON published.signed_act_id=publication.id AND published.account_id=publication.account_id
 JOIN creator.signed_verification pv ON pv.id=publication.id AND pv.account_id=publication.account_id AND pv.creator_id=c AND pv.content_hash=publication.content_hash AND NOT pv.key_revoked AND NOT pv.creator_revoked AND NOT pv.withdrawn
 JOIN creator.signed_publication pp ON pp.signed_act_id=publication.id AND pp.account_id=publication.account_id AND pp.withdrawn_at IS NULL AND (a->>'kind'<>'public' OR pp.public_content)
 JOIN creator.passkey_credential pk ON pk.id=publication.credential_id AND pk.account_id=publication.account_id AND pk.revoked_at IS NULL
 JOIN creator.message message ON message.id=commitment.delivered_message_id AND message.thread_id=packet.thread_id AND message.creator_id=c AND message.fan_id=packet.fan_id AND message.delivery_state='delivered'
 LEFT JOIN creator.signed_act delivery ON delivery.id=message.signed_act_id AND delivery.account_id=owner.account_id AND delivery.creator_id=c AND delivery.subject_id=packet.thread_id AND delivery.content_hash=message.signed_content_hash AND delivery.act_type=CASE WHEN message.author_kind='approved_draft' THEN 'approved_draft' ELSE 'reply' END
 LEFT JOIN creator.signed_act_consumption delivered ON delivered.signed_act_id=delivery.id AND delivered.account_id=delivery.account_id
 LEFT JOIN creator.signed_verification dv ON dv.id=delivery.id AND dv.account_id=delivery.account_id AND dv.creator_id=c AND dv.content_hash=delivery.content_hash AND NOT dv.key_revoked AND NOT dv.creator_revoked AND NOT dv.withdrawn
 LEFT JOIN creator.signed_publication dp ON dp.signed_act_id=delivery.id AND dp.account_id=delivery.account_id AND dp.withdrawn_at IS NULL
 LEFT JOIN creator.passkey_credential dk ON dk.id=delivery.credential_id AND dk.account_id=delivery.account_id AND dk.revoked_at IS NULL
 LEFT JOIN creator.commerce_share_grant share ON share.commitment_id=commitment.id AND share.creator_id=c AND share.fan_id=packet.fan_id
 WHERE packet.id=p AND packet.creator_id=c AND creator.commerce_public_packet_bound()
 AND owner.verification='verified' AND NOT owner.recovery_required
 AND packet.state='accepted' AND packet.payment_state='captured' AND packet.accepted_at IS NOT NULL
 AND commitment.state='delivered' AND commitment.delivered_at IS NOT NULL AND NOT commitment.dispute_open
 AND commitment.mode=packet.snapshot->>'mode' AND mode.shareable AND packet.snapshot->>'shareable'='true'
 AND ((packet.visibility='public' AND share.commitment_id IS NULL) OR (share.fan_choice AND share.creator_permission AND share.revoked_at IS NULL))
 AND EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p AND l.kind='capture' AND l.amount=(packet.snapshot->>'amount')::bigint AND l.currency=packet.snapshot->>'currency')
 AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p AND l.kind='refund')
 AND NOT EXISTS(SELECT 1 FROM creator.commerce_effect effect WHERE effect.packet_id=p AND effect.operation='refund' AND effect.state<>'failed')
 AND revision.document->>'kind'='public_answer' AND revision.document->>'packetId'=p::text AND revision.document->'audience'=a
 AND pp.command=jsonb_build_object('actType','reply','subjectId',i::text,'content',jsonb_build_object('kind','content_publication','creatorId',c::text,'version',v,'document',revision.document) || CASE WHEN jsonb_array_length(pub.media_evidence)>0 THEN jsonb_build_object('mediaEvidence',pub.media_evidence) ELSE '{}'::jsonb END)
 AND publication.content_hash=encode(public.digest(creator.canonical_json(pp.command),'sha256'),'hex')
 AND ((commitment.mode IN('written_reply','voice_note') AND message.author_kind IN('human_creator','approved_draft') AND message.author_account_id=owner.account_id
       AND delivery.id IS NOT NULL AND delivered.signed_act_id IS NOT NULL AND dv.id IS NOT NULL AND dp.signed_act_id IS NOT NULL AND dk.id IS NOT NULL
       AND (message.author_kind<>'approved_draft' OR EXISTS(SELECT 1 FROM creator.commerce_approval approval WHERE approval.id=message.approval_id AND approval.delivered_message_id=message.id AND approval.signed_act_id=delivery.id AND approval.content_hash=message.signed_content_hash AND approval.invalidated_at IS NULL AND approval.creator_epoch=owner.commerce_approval_epoch AND approval.key_epoch=dk.commerce_approval_epoch)))
      OR (commitment.mode='group_answer' AND message.author_kind='system' AND message.signed_act_id IS NULL
       AND commitment.evidence->>'fulfillmentKind'='published_group_answer' AND commitment.evidence->>'contentId'=i::text AND commitment.evidence->>'contentVersion'=v::text AND commitment.evidence->>'signedActId'=publication.id::text));
 FOR j IN 1..5 LOOP PERFORM set_config(names[j],coalesce(old_context[j],''),true); END LOOP;
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_public_packet_mode(uuid,uuid,uuid,integer,jsonb) OWNER TO creator_commerce_public_read;
ALTER FUNCTION creator.commerce_public_packet_evidence(uuid,uuid,uuid,integer,jsonb) OWNER TO creator_commerce_public_read;
REVOKE ALL ON FUNCTION creator.commerce_public_packet_mode(uuid,uuid,uuid,integer,jsonb),creator.commerce_public_packet_evidence(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_public_packet_mode(uuid,uuid,uuid,integer,jsonb),creator.commerce_public_packet_evidence(uuid,uuid,uuid,integer,jsonb) TO creator_runtime;
SET LOCAL ROLE creator_owner;

-- Writers may already hold their row lock when these triggers execute. Readers
-- therefore take the shared packet key before plain metadata reads, never a
-- FOR SHARE row lock below it. Existing mode mutations take mode first.
CREATE FUNCTION creator.fence_public_packet_write() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE packet uuid; BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='commerce_packet' THEN
   IF (NEW.id,NEW.creator_id,NEW.fan_id,NEW.thread_id) IS DISTINCT FROM (OLD.id,OLD.creator_id,OLD.fan_id,OLD.thread_id) THEN
    RAISE EXCEPTION 'Public request participant lineage is immutable' USING ERRCODE='23514';
   END IF;
  ELSIF TG_TABLE_NAME='commerce_share_grant' THEN
   IF NEW.commitment_id IS DISTINCT FROM OLD.commitment_id THEN
    RAISE EXCEPTION 'Public sharing commitment lineage is immutable' USING ERRCODE='23514';
   END IF;
  ELSIF NEW.packet_id IS DISTINCT FROM OLD.packet_id THEN
   RAISE EXCEPTION 'Public request fulfillment and money lineage is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_TABLE_NAME='commerce_packet' THEN packet=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSIF TG_TABLE_NAME='commerce_share_grant' THEN
  SELECT c.packet_id INTO packet FROM creator.commerce_commitment c WHERE c.id=CASE WHEN TG_OP='DELETE' THEN OLD.commitment_id ELSE NEW.commitment_id END;
 ELSE packet=CASE WHEN TG_OP='DELETE' THEN OLD.packet_id ELSE NEW.packet_id END;
 END IF;
 IF packet IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('commerce.public-packet:'||packet::text,0)); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION creator.fence_public_mode_write() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id THEN
  RAISE EXCEPTION 'Public request mode lineage is immutable' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commerce.mode:'||NEW.id::text,0));
 RETURN NEW;
END $$;
CREATE TRIGGER fence_public_mode_write BEFORE UPDATE ON creator.commerce_mode FOR EACH ROW EXECUTE FUNCTION creator.fence_public_mode_write();
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['commerce_packet','commerce_commitment','commerce_share_grant','commerce_ledger','commerce_effect'] LOOP
  EXECUTE format('CREATE TRIGGER fence_public_packet_write BEFORE INSERT OR UPDATE OR DELETE ON creator.%I FOR EACH ROW EXECUTE FUNCTION creator.fence_public_packet_write()',relation);
 END LOOP;
END $$;
COMMIT;
