-- Held 0094_w4_fulfillment_plan_custody. W8 owns registration and activation.
-- Private immutable original service bindings; a public document carries only
-- {id,revision,hash}. Neither a parent hash nor a fan list grants permission.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_fulfillment_plan (
 id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 creator_id uuid NOT NULL REFERENCES creator.creator_profile(id),
 content_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version>0),
 audience jsonb NOT NULL CHECK(audience->>'kind' IN('public','groups')),
 minimum_recipients integer NOT NULL CHECK(minimum_recipients BETWEEN 2 AND 100),
 recipient_count integer NOT NULL CHECK(recipient_count BETWEEN minimum_recipients AND 100),
 source_hash text NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
 PRIMARY KEY(id,revision),UNIQUE(creator_id,content_id,content_version),
 FOREIGN KEY(content_id) REFERENCES creator.content_index(id),
 CHECK(audience=jsonb_build_object('kind','public') OR audience=jsonb_build_object('kind','groups','ids',jsonb_build_array(id)))
);
CREATE TABLE creator.commerce_fulfillment_member (
 plan_id uuid NOT NULL,plan_revision integer NOT NULL,
 packet_id uuid NOT NULL,commitment_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,thread_id uuid NOT NULL,
 packet_version integer NOT NULL CHECK(packet_version>0),commitment_version integer NOT NULL CHECK(commitment_version>0),
 mode_id uuid NOT NULL,mode_version integer NOT NULL CHECK(mode_version>0),
 acceptance_id uuid NOT NULL REFERENCES creator.signed_act(id),acceptance_hash text NOT NULL CHECK(acceptance_hash ~ '^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 consent_hash text NOT NULL CHECK(consent_hash ~ '^[a-f0-9]{64}$'),
 capture_id uuid NOT NULL REFERENCES creator.commerce_ledger(id),capture_hash text NOT NULL CHECK(capture_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(plan_id,plan_revision,packet_id),UNIQUE(plan_id,plan_revision,thread_id),
 FOREIGN KEY(plan_id,plan_revision) REFERENCES creator.commerce_fulfillment_plan(id,revision),
 FOREIGN KEY(packet_id,creator_id,fan_id) REFERENCES creator.commerce_packet(id,creator_id,fan_id),
 FOREIGN KEY(commitment_id,creator_id,fan_id) REFERENCES creator.commerce_commitment(id,creator_id,fan_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.commerce_group_delivery (
 plan_id uuid NOT NULL,plan_revision integer NOT NULL,packet_id uuid NOT NULL,
 creator_id uuid NOT NULL,fan_id uuid NOT NULL,thread_id uuid NOT NULL,
 message_id uuid NOT NULL UNIQUE,content_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version>0),
 publication_signed_act_id uuid NOT NULL REFERENCES creator.signed_act(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(plan_id,plan_revision,packet_id),
 FOREIGN KEY(plan_id,plan_revision,packet_id) REFERENCES creator.commerce_fulfillment_member(plan_id,plan_revision,packet_id),
 FOREIGN KEY(message_id,thread_id) REFERENCES creator.message(id,thread_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
CREATE TABLE creator.commerce_review_attestation (
 id uuid PRIMARY KEY,packet_id uuid NOT NULL UNIQUE,commitment_id uuid NOT NULL UNIQUE,
 creator_id uuid NOT NULL,fan_id uuid NOT NULL,thread_id uuid NOT NULL,
 packet_version integer NOT NULL CHECK(packet_version>0),commitment_version integer NOT NULL CHECK(commitment_version>0),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 acceptance_id uuid NOT NULL REFERENCES creator.signed_act(id),
 capture_id uuid NOT NULL REFERENCES creator.commerce_ledger(id),capture_hash text NOT NULL CHECK(capture_hash ~ '^[a-f0-9]{64}$'),
 reviewer_account_id uuid NOT NULL,signed_act_id uuid NOT NULL UNIQUE REFERENCES creator.signed_act(id),
 command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 statement text NOT NULL CHECK(statement='I reviewed the submitted request.'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(packet_id,creator_id,fan_id) REFERENCES creator.commerce_packet(id,creator_id,fan_id),
 FOREIGN KEY(commitment_id,creator_id,fan_id) REFERENCES creator.commerce_commitment(id,creator_id,fan_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id)
);
-- No fan list is stored on the parent. Fans can see only their own child/link
-- metadata; current source/recipient authority is still required by consumers.
ALTER TABLE creator.commerce_fulfillment_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_fulfillment_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY fulfillment_plan_read ON creator.commerce_fulfillment_plan FOR SELECT USING(
 EXISTS(SELECT FROM creator.creator_profile cp WHERE cp.id=creator_id AND cp.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND cp.verification='verified' AND NOT cp.recovery_required)
 OR EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.plan_id=id AND m.plan_revision=revision
  AND EXISTS(SELECT FROM creator.fan_profile fp WHERE fp.id=m.fan_id AND fp.account_id=nullif(current_setting('app.account_id',true),'')::uuid))
);
CREATE POLICY fulfillment_plan_insert ON creator.commerce_fulfillment_plan FOR INSERT WITH CHECK(
 created_by=nullif(current_setting('app.account_id',true),'')::uuid AND creation_transaction=pg_current_xact_id() AND EXISTS(SELECT FROM creator.creator_profile cp
  WHERE cp.id=creator_id AND cp.account_id=created_by AND cp.verification='verified' AND NOT cp.recovery_required)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_fulfillment_member','commerce_group_delivery','commerce_review_attestation'] LOOP
  EXECUTE format('ALTER TABLE creator.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE creator.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY fulfillment_pair_read ON creator.%I FOR SELECT USING(creator.commerce_scope(creator_id,fan_id))',t);
  EXECUTE format('CREATE POLICY fulfillment_owner_insert ON creator.%I FOR INSERT WITH CHECK(creator.commerce_scope(creator_id,fan_id)
   AND EXISTS(SELECT FROM creator.creator_profile cp WHERE cp.id=creator_id AND cp.account_id=nullif(current_setting(''app.account_id'',true),'''')::uuid
    AND cp.verification=''verified'' AND NOT cp.recovery_required))',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON creator.commerce_fulfillment_plan,creator.commerce_fulfillment_member,
 creator.commerce_group_delivery,creator.commerce_review_attestation TO creator_runtime;
CREATE FUNCTION creator.commerce_fulfillment_plan_hash(p uuid,r integer) RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('id',h.id,'revision',h.revision,'creatorId',h.creator_id,
  'contentId',h.content_id,'contentVersion',h.content_version,'audience',h.audience,'minimumRecipients',h.minimum_recipients,
  'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.packet_id) FROM creator.commerce_fulfillment_member m
   WHERE m.plan_id=h.id AND m.plan_revision=h.revision))::text,'UTF8')),'hex')
 FROM creator.commerce_fulfillment_plan h WHERE h.id=p AND h.revision=r
$$;
REVOKE ALL ON FUNCTION creator.commerce_fulfillment_plan_hash(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_plan_hash(uuid,integer) TO creator_runtime;
CREATE FUNCTION creator.commerce_fulfillment_plan_complete() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE h record; actual_count integer; actual_hash text;
BEGIN
 SELECT * INTO h FROM creator.commerce_fulfillment_plan WHERE id=NEW.id AND revision=NEW.revision;
 SELECT count(*) INTO actual_count FROM creator.commerce_fulfillment_member WHERE plan_id=h.id AND plan_revision=h.revision;
 actual_hash:=creator.commerce_fulfillment_plan_hash(h.id,h.revision);
 IF coalesce(h.id IS NULL OR h.created_by<>nullif(current_setting('app.account_id',true),'')::uuid OR actual_count<>h.recipient_count
  OR NOT EXISTS(SELECT FROM creator.content_index i WHERE i.id=h.content_id AND i.creator_id=h.creator_id)
  OR actual_count<h.minimum_recipients OR actual_hash IS DISTINCT FROM h.source_hash,true) THEN
  RAISE EXCEPTION 'The exact immutable fulfillment plan is incomplete' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER fulfillment_plan_complete AFTER INSERT ON creator.commerce_fulfillment_plan
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.commerce_fulfillment_plan_complete();
CREATE FUNCTION creator.commerce_fulfillment_original_member() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p record; c record; h record; capture record;
BEGIN
 SELECT * INTO h FROM creator.commerce_fulfillment_plan WHERE id=NEW.plan_id AND revision=NEW.plan_revision;
 SELECT * INTO p FROM creator.commerce_packet WHERE id=NEW.packet_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id;
 SELECT * INTO c FROM creator.commerce_commitment WHERE id=NEW.commitment_id AND packet_id=p.id;
 -- The canonical capture precedes commitment insertion. Its commitment_id is
 -- therefore NULL; bind the actual completed original capture effect instead.
 SELECT l.* INTO capture FROM creator.commerce_ledger l
 JOIN creator.commerce_effect e ON e.packet_id=l.packet_id AND e.creator_id=l.creator_id AND e.fan_id=l.fan_id
  AND e.operation='capture' AND e.state='done' AND e.provider_key=l.cause AND e.provider_ref=l.provider_ref
 WHERE l.id=NEW.capture_id AND l.packet_id=p.id AND l.kind='capture'
  AND e.provider_key=p.id::text||':capture:'||p.authorization_attempt::text
  AND e.request=jsonb_build_object('intentId',p.intent_ref,'amount',(p.snapshot->>'amount')::bigint,'currency',p.snapshot->>'currency')
  AND l.provider_ref=p.intent_ref;
 IF coalesce(h.id IS NULL OR h.created_by<>nullif(current_setting('app.account_id',true),'')::uuid OR h.creator_id<>NEW.creator_id
  OR h.creation_transaction<>pg_current_xact_id()
  OR p.id IS NULL OR c.id IS NULL OR capture.id IS NULL OR p.state<>'accepted' OR p.payment_state<>'captured'
  OR p.snapshot->>'mode'<>'group_answer' OR p.visibility<>'public' OR c.mode<>'group_answer'
  OR c.dispute_open OR NOT EXISTS(SELECT FROM creator.commerce_mode mode WHERE mode.id=p.mode_id
   AND mode.creator_id=p.creator_id AND mode.shareable AND p.snapshot->>'shareable'='true')
  OR EXISTS(SELECT FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='refund')
  OR EXISTS(SELECT FROM creator.commerce_effect e WHERE e.packet_id=p.id AND e.operation='refund' AND e.state<>'failed')
  OR EXISTS(SELECT FROM creator.commerce_share_grant share WHERE share.commitment_id=c.id
   AND (NOT share.fan_choice OR NOT share.creator_permission OR share.revoked_at IS NOT NULL))
  OR c.state NOT IN('due','in_progress') OR c.due_at<=clock_timestamp()
  OR p.version<>NEW.packet_version OR c.version<>NEW.commitment_version OR p.thread_id<>NEW.thread_id
  OR p.mode_id<>NEW.mode_id OR (p.snapshot->>'modeVersion')::integer<>NEW.mode_version
  OR p.accepted_act_id<>NEW.acceptance_id OR p.accepted_action<>'reply_myself'
  OR encode(sha256(convert_to(jsonb_build_object('snapshot',p.snapshot,'disclosure',p.disclosure,'question',p.question,'fanAnswer',p.fan_answer,'createdAt',p.created_at,'submittedAt',p.submitted_at,
   'authorizationAttempt',p.authorization_attempt,'visibility',p.visibility,'threadId',p.thread_id,
   'acceptedAct',p.accepted_act_id,'acceptedAt',p.accepted_at)::text,'UTF8')),'hex')<>NEW.request_hash
  OR encode(sha256(convert_to(jsonb_build_object('visibility',p.visibility,'sharing',
   (SELECT to_jsonb(s) FROM creator.commerce_share_grant s WHERE s.commitment_id=c.id))::text,'UTF8')),'hex')<>NEW.consent_hash
  OR capture.creator_id<>NEW.creator_id OR capture.fan_id<>NEW.fan_id
  OR capture.amount<>(p.snapshot->>'amount')::bigint OR capture.currency<>p.snapshot->>'currency'
  OR encode(sha256(convert_to(to_jsonb(capture)::text,'UTF8')),'hex')<>NEW.capture_hash
  OR NOT EXISTS(SELECT FROM creator.signed_act sa JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
   JOIN creator.creator_profile cp ON cp.id=sa.creator_id AND cp.account_id=sa.account_id AND cp.verification='verified' AND NOT cp.recovery_required
   WHERE sa.id=NEW.acceptance_id AND sa.creator_id=NEW.creator_id AND sa.account_id=h.created_by
    AND sa.subject_id=NEW.thread_id AND sa.act_type='accept' AND sa.content_hash=NEW.acceptance_hash),true) THEN
  RAISE EXCEPTION 'Use the actual original captured group service' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fulfillment_original_member BEFORE INSERT ON creator.commerce_fulfillment_member
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_fulfillment_original_member();
CREATE FUNCTION creator.commerce_group_delivery_exact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
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
CREATE TRIGGER fulfillment_group_delivery_exact BEFORE INSERT ON creator.commerce_group_delivery
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_group_delivery_exact();
CREATE FUNCTION creator.commerce_review_attestation_exact() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
  JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=NEW.reviewer_account_id
  JOIN creator.signed_act sa ON sa.id=NEW.signed_act_id AND sa.account_id=cp.account_id AND sa.creator_id=cp.id
  JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
  JOIN creator.signed_publication publication ON publication.signed_act_id=sa.id AND publication.account_id=sa.account_id AND publication.withdrawn_at IS NULL
  JOIN creator.commerce_effect effect ON effect.packet_id=p.id AND effect.creator_id=p.creator_id AND effect.fan_id=p.fan_id
   AND effect.operation='capture' AND effect.state='done' AND effect.provider_ref=p.intent_ref
   AND effect.provider_key=p.id::text||':capture:'||p.authorization_attempt::text
   AND effect.request=jsonb_build_object('intentId',p.intent_ref,'amount',(p.snapshot->>'amount')::bigint,'currency',p.snapshot->>'currency')
  JOIN creator.commerce_ledger capture ON capture.id=NEW.capture_id AND capture.packet_id=p.id AND capture.creator_id=p.creator_id AND capture.fan_id=p.fan_id
   AND capture.kind='capture' AND capture.cause=effect.provider_key AND capture.provider_ref=effect.provider_ref
   AND capture.amount=(p.snapshot->>'amount')::bigint AND capture.currency=p.snapshot->>'currency'
  WHERE p.id=NEW.packet_id AND c.id=NEW.commitment_id AND p.creator_id=NEW.creator_id AND p.fan_id=NEW.fan_id
   AND p.thread_id=NEW.thread_id AND p.version=NEW.packet_version AND c.version=NEW.commitment_version
   AND p.state='accepted' AND p.payment_state='captured' AND p.snapshot->>'mode'='guaranteed_review'
   AND c.mode='guaranteed_review' AND c.state IN('due','in_progress') AND c.due_at>clock_timestamp()
   AND NOT c.dispute_open AND NOT EXISTS(SELECT FROM creator.commerce_ledger refund WHERE refund.packet_id=p.id AND refund.kind='refund')
   AND NOT EXISTS(SELECT FROM creator.commerce_effect refund WHERE refund.packet_id=p.id AND refund.operation='refund' AND refund.state<>'failed')
   AND p.accepted_act_id=NEW.acceptance_id AND cp.verification='verified' AND NOT cp.recovery_required
   AND cp.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND sa.act_type='reply' AND sa.subject_id=p.thread_id
   AND encode(sha256(convert_to(jsonb_build_object('snapshot',p.snapshot,'disclosure',p.disclosure,'question',p.question,'fanAnswer',p.fan_answer,'createdAt',p.created_at,'submittedAt',p.submitted_at,
    'authorizationAttempt',p.authorization_attempt,'visibility',p.visibility,'threadId',p.thread_id,
    'acceptedAct',p.accepted_act_id,'acceptedAt',p.accepted_at)::text,'UTF8')),'hex')=NEW.request_hash
   AND encode(sha256(convert_to(to_jsonb(capture)::text,'UTF8')),'hex')=NEW.capture_hash
   AND sa.content_hash=NEW.command_hash AND publication.command=jsonb_build_object('actType','reply','subjectId',p.thread_id,
    'content',jsonb_build_object('kind','commerce_review_attestation','packetId',p.id,'packetVersion',p.version,
     'commitmentId',c.id,'commitmentVersion',c.version,'requestHash',NEW.request_hash,'acceptanceId',p.accepted_act_id,
     'captureId',capture.id,'captureHash',NEW.capture_hash,'statement',NEW.statement))) THEN
  RAISE EXCEPTION 'The original request needs its exact creator-signed review attestation' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fulfillment_review_attestation_exact BEFORE INSERT ON creator.commerce_review_attestation
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_review_attestation_exact();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_fulfillment_plan','commerce_fulfillment_member','commerce_group_delivery','commerce_review_attestation'] LOOP
  EXECUTE format('CREATE TRIGGER fulfillment_immutable BEFORE UPDATE OR DELETE ON creator.%I FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable()',t);
 END LOOP;
END $$;
COMMIT;
