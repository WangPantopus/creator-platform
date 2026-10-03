-- Held0213_w4_fulfillment_publication_original_hash. W8 owns activation.
-- Fixed actorless all-original comparison under actual W1 retained0208/0158.
-- No Actor, interactive199/202 alias, body return, settings or business writes.
BEGIN;
RESET ROLE;
DO $$ DECLARE signature text; BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_publication_original_hash') THEN
  RAISE EXCEPTION 'A pre-existing publication comparison owner needs independent review'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'creator.publication_preparation_originals(uuid,uuid)',
  'creator.publication_preparation_original_family_bound(uuid,uuid,uuid,uuid)',
  'creator.publication_preparation_original_metadata_bound(text,uuid)'] LOOP
  IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(signature)
   AND pg_get_userbyid(p.proowner)='creator_publication_authority' AND p.prosecdef
   AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]) THEN
   RAISE EXCEPTION 'Actual private W1 retained-original ports required'; END IF;
 END LOOP;
 CREATE ROLE creator_fulfillment_publication_original_hash NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_fulfillment_publication_original_hash;
GRANT EXECUTE ON FUNCTION creator.publication_preparation_originals(uuid,uuid),
 creator.publication_preparation_original_family_bound(uuid,uuid,uuid,uuid),
 creator.publication_preparation_original_metadata_bound(text,uuid)
 TO creator_fulfillment_publication_original_hash;
SET LOCAL ROLE creator_owner;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,creator_id,shareable) ON creator.commerce_mode TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,creator_id,fan_id,thread_id,mode_id,version,state,payment_state,intent_ref,accepted_action,
 snapshot,disclosure,question,fan_answer,created_at,submitted_at,authorization_attempt,visibility,accepted_act_id,accepted_at)
 ON creator.commerce_packet TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,packet_id,creator_id,fan_id,mode,state,version,due_at,dispute_open,delivered_at,delivered_message_id,evidence)
 ON creator.commerce_commitment TO creator_fulfillment_publication_original_hash;
GRANT SELECT(packet_id,creator_id,fan_id,operation,state,provider_key,provider_ref,request)
 ON creator.commerce_effect TO creator_fulfillment_publication_original_hash;
-- Full original row descriptors are intentional. Partial record hashes would
-- differ from ORIGINAL_SERVICE_QUERY and could conceal consent/capture drift.
GRANT SELECT(id,creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,provider_ref,refs,created_at)
 ON creator.commerce_ledger TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,commitment_id,creator_id,fan_id,fan_choice,creator_permission,handle_display,revoked_at,version)
 ON creator.commerce_share_grant TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,account_id,credential_id,creator_id,act_type,subject_id,content_hash)
 ON creator.signed_act TO creator_fulfillment_publication_original_hash;
GRANT SELECT(signed_act_id,account_id) ON creator.signed_act_consumption TO creator_fulfillment_publication_original_hash;
GRANT SELECT(signed_act_id,account_id,command,withdrawn_at) ON creator.signed_publication TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn)
 ON creator.signed_verification TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,account_id,revoked_at) ON creator.passkey_credential TO creator_fulfillment_publication_original_hash;
GRANT SELECT(id,revision,creator_id,content_id,content_version,audience,minimum_recipients,recipient_count,source_hash,created_by)
 ON creator.commerce_fulfillment_plan TO creator_fulfillment_publication_original_hash;
GRANT SELECT(plan_id,plan_revision,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,
 mode_id,mode_version,acceptance_id,acceptance_hash,request_hash,consent_hash,capture_id,capture_hash)
 ON creator.commerce_fulfillment_member TO creator_fulfillment_publication_original_hash;
GRANT SELECT(plan_id,plan_revision,packet_id,creator_id,fan_id,thread_id,message_id,content_id,content_version,publication_signed_act_id)
 ON creator.commerce_group_delivery TO creator_fulfillment_publication_original_hash;

-- Both permissive and restrictive policies use the actual private retained
-- family. Existing PUBLIC commerce_scope cannot widen this owner's custody.
-- The W1 predicate reads only its own private metadata, avoiding policy cycles
-- through packet -> commerce_scope -> creator/fan -> packet.
DO $$ DECLARE relation text; predicate text; BEGIN
 FOR relation,predicate IN VALUES
  ('creator_profile','creator.publication_preparation_original_metadata_bound(''creator'',id)'),
  ('fan_profile','creator.publication_preparation_original_metadata_bound(''fan'',id)'),
  ('commerce_mode','creator.publication_preparation_original_metadata_bound(''mode'',id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id)'),
  ('commerce_packet','creator.publication_preparation_original_family_bound(creator_id,id,fan_id,thread_id)'),
  ('commerce_commitment','creator.publication_preparation_original_metadata_bound(''commitment'',id) AND creator.publication_preparation_original_metadata_bound(''packet'',packet_id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id) AND creator.publication_preparation_original_metadata_bound(''fan'',fan_id)'),
  ('commerce_effect','creator.publication_preparation_original_metadata_bound(''packet'',packet_id)'),
  ('commerce_ledger','creator.publication_preparation_original_metadata_bound(''packet'',packet_id)'),
  ('commerce_share_grant','creator.publication_preparation_original_metadata_bound(''commitment'',commitment_id)'),
  ('signed_act','creator.publication_preparation_original_metadata_bound(''acceptance'',id)'),
  ('signed_act_consumption','creator.publication_preparation_original_metadata_bound(''acceptance'',signed_act_id)'),
  ('signed_publication','creator.publication_preparation_original_metadata_bound(''acceptance'',signed_act_id)'),
  ('signed_verification','creator.publication_preparation_original_metadata_bound(''acceptance'',id)'),
  ('passkey_credential','EXISTS(SELECT FROM creator.signed_act original WHERE original.credential_id=passkey_credential.id AND original.account_id=passkey_credential.account_id)'),
  ('commerce_fulfillment_plan','creator.publication_preparation_original_metadata_bound(''plan'',id) AND creator.publication_preparation_original_metadata_bound(''creator'',creator_id)'),
  ('commerce_fulfillment_member','creator.publication_preparation_original_metadata_bound(''plan'',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id)'),
  ('commerce_group_delivery','creator.publication_preparation_original_metadata_bound(''plan'',plan_id) AND creator.publication_preparation_original_family_bound(creator_id,packet_id,fan_id,thread_id)') LOOP
  EXECUTE format('CREATE POLICY fulfillment_publication_original_read ON creator.%I FOR SELECT TO creator_fulfillment_publication_original_hash USING(%s)',relation,predicate);
  EXECUTE format('CREATE POLICY fulfillment_publication_original_bound ON creator.%I AS RESTRICTIVE FOR SELECT TO creator_fulfillment_publication_original_hash USING(%s)',relation,predicate);
 END LOOP;
END $$;

CREATE FUNCTION creator.fulfillment_publication_original_hash_matches(n uuid,t uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held record; current_held record; header record; original record; k text; lease bigint;
 count_members integer; plan_hash text; current_families jsonb; matches boolean;
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0213_w4_fulfillment_publication_original_hash') THEN
  RAISE EXCEPTION 'Actual publication original comparison is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_publication_worker' OR current_user<>'creator_fulfillment_publication_original_hash'
  OR current_setting('transaction_isolation')<>'read committed' OR n IS NULL OR t IS NULL
  OR nullif(current_setting('app.account_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.creator_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.fan_id',true),'') IS NOT NULL THEN RETURN false; END IF;
 -- No direct private208/0158 table grant. The two tokens are consumed only by
 -- the real issuer's fixed current projection on the original transaction.
 SELECT * INTO held FROM creator.publication_preparation_originals(n,t);
 IF held IS NULL OR held.signed_act_id IS NULL OR held.original_plan IS NULL
  OR jsonb_typeof(held.original_families) IS DISTINCT FROM 'array'
  OR jsonb_array_length(held.original_families) NOT BETWEEN 2 AND 100 THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0157_w4_public_packet_read')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0167_w1_signature_read_fence')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0205_w8_fulfillment_publication_denial')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0208_w1_publication_preparation') THEN RETURN false; END IF;
 SELECT h.id,h.revision,h.creator_id,h.content_id,h.content_version,h.audience,h.minimum_recipients,
  h.recipient_count,h.source_hash,h.created_by INTO header FROM creator.commerce_fulfillment_plan h
 WHERE h.id=(held.original_plan->>'planId')::uuid AND h.revision=(held.original_plan->>'revision')::integer
  AND h.creator_id=held.creator_id AND h.content_id=held.content_id AND h.content_version=held.version
  AND h.created_by=held.publisher_account_id AND h.created_by=(held.original_plan->>'creatorAccountId')::uuid
  AND h.source_hash=held.original_plan->>'hash' AND h.audience=held.original_plan->'audience'
  AND h.minimum_recipients BETWEEN 2 AND 100 AND h.recipient_count BETWEEN h.minimum_recipients AND 100
  AND h.recipient_count=(held.original_plan->>'recipientCount')::integer;
 IF header IS NULL OR header.recipient_count<>jsonb_array_length(held.original_families) THEN RETURN false; END IF;
 SELECT count(*),jsonb_agg((to_jsonb(m)-ARRAY['plan_id','plan_revision']) || jsonb_build_object(
  'creator_account_id',cp.account_id,'fan_account_id',fp.account_id) ORDER BY m.thread_id,m.packet_id)
 INTO count_members,current_families FROM creator.commerce_fulfillment_member m
 JOIN creator.creator_profile cp ON cp.id=m.creator_id JOIN creator.fan_profile fp ON fp.id=m.fan_id
 WHERE m.plan_id=header.id AND m.plan_revision=header.revision AND m.creator_id=held.creator_id;
 IF count_members<>header.recipient_count OR current_families IS DISTINCT FROM held.original_families THEN RETURN false; END IF;
 -- Byte-equivalent original0178 plan descriptor, including every member column.
 SELECT encode(sha256(convert_to(jsonb_build_object('id',h.id,'revision',h.revision,'creatorId',h.creator_id,
  'contentId',h.content_id,'contentVersion',h.content_version,'audience',h.audience,'minimumRecipients',h.minimum_recipients,
  'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.packet_id) FROM creator.commerce_fulfillment_member m
   WHERE m.plan_id=h.id AND m.plan_revision=h.revision))::text,'UTF8')),'hex') INTO plan_hash
 FROM creator.commerce_fulfillment_plan h WHERE h.id=header.id AND h.revision=header.revision;
 IF plan_hash IS DISTINCT FROM header.source_hash THEN RETURN false; END IF;

 -- Genuine205 already acquired these complete negatives BEFORE body/positives.
 -- Verify custody, never invoke a blocking denial projection or acquire a new
 -- negative key here after Studio's locks or after204 has ended.
 FOR k IN SELECT DISTINCT key FROM (
  SELECT 'w8-denial:account:'||x.fan_account_id::text AS key
   FROM jsonb_to_recordset(held.original_families) AS x(fan_account_id uuid)
  UNION ALL SELECT 'w8-denial:account:'||held.publisher_account_id::text
  UNION ALL SELECT 'w8-denial:account:'||(held.original_plan->>'creatorAccountId')
  UNION ALL SELECT 'w8-denial:creator:'||held.creator_id::text) keys ORDER BY key LOOP
  lease=hashtextextended(k,0);
  IF k IS NULL OR NOT EXISTS(SELECT FROM pg_locks l WHERE l.locktype='advisory' AND l.pid=pg_backend_pid()
   AND l.granted AND l.mode IN('ShareLock','ExclusiveLock') AND l.objsubid=1
   AND l.classid=((lease>>32)&4294967295)::oid AND l.objid=(lease&4294967295)::oid) THEN RETURN false; END IF;
 END LOOP;
 -- Actual0157 BEFORE-write mode/packet keys cover packet, commitment, share,
 -- refund ledger and provider effects. Try only, in complete sorted families.
 -- No UPDATE grant or row lock is needed on an original service/money record.
 FOR k IN SELECT DISTINCT 'commerce.mode:'||x.mode_id::text
  FROM jsonb_to_recordset(held.original_families) AS x(mode_id uuid) ORDER BY 1 LOOP
  IF k IS NULL OR NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN
   RAISE EXCEPTION 'Original mode permission is changing' USING ERRCODE='55P03'; END IF;
 END LOOP;
 FOR k IN SELECT DISTINCT 'commerce.public-packet:'||x.packet_id::text
  FROM jsonb_to_recordset(held.original_families) AS x(packet_id uuid) ORDER BY 1 LOOP
  IF k IS NULL OR NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN
   RAISE EXCEPTION 'Original request, consent or financial record is changing' USING ERRCODE='55P03'; END IF;
 END LOOP;
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('identity.signature-account:'||held.publisher_account_id::text,0)) THEN
  RAISE EXCEPTION 'Original current signature metadata is changing' USING ERRCODE='55P03'; END IF;
 -- Fresh plain MVCC after every fence. No settings, body, lower row lock or
 -- write follows. W1 still performs its joint cleanup and LAST publication
 -- signature/domain read, then sole COMMIT; these leases last through it.
 FOR original IN SELECT * FROM jsonb_to_recordset(held.original_families) AS x(
  packet_id uuid,commitment_id uuid,thread_id uuid,fan_id uuid,fan_account_id uuid,creator_id uuid,creator_account_id uuid,
  packet_version integer,commitment_version integer,mode_id uuid,mode_version integer,acceptance_id uuid,acceptance_hash text,
  request_hash text,consent_hash text,capture_id uuid,capture_hash text) ORDER BY x.thread_id,x.packet_id LOOP
  SELECT EXISTS(SELECT FROM creator.commerce_packet p
   JOIN creator.commerce_commitment c ON c.id=original.commitment_id AND c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
   JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=original.creator_account_id
    AND cp.account_id=held.publisher_account_id AND cp.verification='verified' AND NOT cp.recovery_required
   JOIN creator.fan_profile fp ON fp.id=p.fan_id AND fp.account_id=original.fan_account_id
   JOIN creator.commerce_mode mode ON mode.id=p.mode_id AND mode.creator_id=p.creator_id AND mode.shareable
   JOIN creator.commerce_effect effect ON effect.packet_id=p.id AND effect.creator_id=p.creator_id AND effect.fan_id=p.fan_id
    AND effect.operation='capture' AND effect.state='done'
    AND effect.provider_key=p.id::text||':capture:'||p.authorization_attempt::text AND effect.provider_ref=p.intent_ref
    AND effect.request=jsonb_build_object('intentId',p.intent_ref,'amount',(p.snapshot->>'amount')::bigint,'currency',p.snapshot->>'currency')
   JOIN creator.commerce_ledger capture ON capture.id=original.capture_id AND capture.packet_id=p.id
    AND capture.creator_id=p.creator_id AND capture.fan_id=p.fan_id AND capture.kind='capture'
    AND capture.cause=effect.provider_key AND capture.provider_ref=effect.provider_ref
    AND capture.amount=(p.snapshot->>'amount')::bigint AND capture.currency=p.snapshot->>'currency'
   JOIN creator.signed_act sa ON sa.id=p.accepted_act_id AND sa.id=original.acceptance_id AND sa.creator_id=p.creator_id
    AND sa.account_id=cp.account_id AND sa.subject_id=p.thread_id AND sa.act_type='accept' AND sa.content_hash=original.acceptance_hash
   JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
   JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id AND sp.withdrawn_at IS NULL
   JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.creator_id=sa.creator_id AND proof.account_id=sa.account_id
    AND proof.act_type=sa.act_type AND proof.content_hash=sa.content_hash AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
   JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id AND key.revoked_at IS NULL
   LEFT JOIN creator.commerce_share_grant share ON share.commitment_id=c.id AND share.creator_id=p.creator_id AND share.fan_id=p.fan_id
   WHERE p.id=original.packet_id AND p.creator_id=original.creator_id AND p.creator_id=held.creator_id
    AND p.fan_id=original.fan_id AND p.thread_id=original.thread_id AND p.mode_id=original.mode_id
    AND (p.snapshot->>'modeVersion')::integer=original.mode_version AND c.mode='group_answer' AND p.snapshot->>'mode'=c.mode
    AND p.state='accepted' AND p.payment_state='captured' AND p.accepted_at IS NOT NULL
    AND p.accepted_action='reply_myself' AND NOT c.dispute_open AND p.visibility='public' AND p.snapshot->>'shareable'='true'
    AND (share.commitment_id IS NULL OR (share.fan_choice AND share.creator_permission AND share.revoked_at IS NULL))
    AND NOT EXISTS(SELECT FROM creator.commerce_ledger refund WHERE refund.packet_id=p.id AND refund.kind='refund')
    AND NOT EXISTS(SELECT FROM creator.commerce_effect refund WHERE refund.packet_id=p.id AND refund.operation='refund' AND refund.state<>'failed')
    AND encode(sha256(convert_to(jsonb_build_object('snapshot',p.snapshot,'disclosure',p.disclosure,'question',p.question,'fanAnswer',p.fan_answer,'createdAt',p.created_at,'submittedAt',p.submitted_at,
     'authorizationAttempt',p.authorization_attempt,'visibility',p.visibility,'threadId',p.thread_id,
     'acceptedAct',p.accepted_act_id,'acceptedAt',p.accepted_at)::text,'UTF8')),'hex')=original.request_hash
    AND encode(sha256(convert_to(jsonb_build_object('visibility',p.visibility,'sharing',to_jsonb(share))::text,'UTF8')),'hex')=original.consent_hash
    AND encode(sha256(convert_to(to_jsonb(capture)::text,'UTF8')),'hex')=original.capture_hash
    AND jsonb_typeof(sp.command->'content'->'packetVersion')='number'
    AND (sp.command->'content'->>'packetVersion') ~ '^[1-9][0-9]*$'
    AND (sp.command->'content'->>'packetVersion')::numeric<original.packet_version
    AND sp.command=jsonb_build_object('actType','accept','subjectId',p.thread_id,'content',jsonb_build_object(
     'packetId',p.id,'packetVersion',sp.command->'content'->'packetVersion','snapshot',p.snapshot,'action','reply_myself'))
    AND encode(sha256(convert_to(creator.canonical_json(sp.command),'UTF8')),'hex')=original.acceptance_hash
    AND ((NOT held.finalizing AND p.version=original.packet_version AND c.version=original.commitment_version
      AND c.state IN('due','in_progress') AND c.due_at>clock_timestamp())
     OR (held.finalizing AND p.version=original.packet_version+1 AND c.version=original.commitment_version+1
      AND c.state='delivered' AND c.delivered_at IS NOT NULL AND c.delivered_at<=c.due_at
      AND c.evidence->>'fulfillmentKind'='published_group_answer' AND c.evidence->>'contentId'=held.content_id::text
      AND c.evidence->>'contentVersion'=held.version::text AND c.evidence->>'signedActId'=held.signed_act_id::text
      AND EXISTS(SELECT FROM creator.commerce_group_delivery d WHERE d.plan_id=header.id AND d.plan_revision=header.revision
       AND d.packet_id=p.id AND d.creator_id=p.creator_id AND d.fan_id=p.fan_id AND d.thread_id=p.thread_id
       AND d.content_id=held.content_id AND d.content_version=held.version AND d.publication_signed_act_id=held.signed_act_id
       AND d.message_id=c.delivered_message_id)))) INTO matches;
  IF matches IS DISTINCT FROM true THEN RETURN false; END IF;
 END LOOP;
 SELECT * INTO current_held FROM creator.publication_preparation_originals(n,t);
 RETURN to_jsonb(current_held)=to_jsonb(held);
END $$;
RESET ROLE;
ALTER FUNCTION creator.fulfillment_publication_original_hash_matches(uuid,uuid) OWNER TO creator_fulfillment_publication_original_hash;
REVOKE ALL ON FUNCTION creator.fulfillment_publication_original_hash_matches(uuid,uuid) FROM PUBLIC;
-- Only the actual W1 joint gate may invoke the comparison. No raw worker,
-- runtime/Team input grant or caller-supplied family/proof is introduced.
GRANT EXECUTE ON FUNCTION creator.fulfillment_publication_original_hash_matches(uuid,uuid) TO creator_publication_authority;
COMMIT;
