-- W8 exact Note reply review. Depends on0045 and0053; not registry activation.
-- Private text stays with W5. No copied evidence or invented retention period.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_trust_reply_projection') THEN
  CREATE ROLE creator_trust_reply_projection NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_trust_reply_projection;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_trust_reply_projection;
GRANT SELECT(id,account_id,display_name,verification,recovery_required) ON creator.creator_profile TO creator_trust_reply_projection;
GRANT SELECT(id,account_id,revoked_at,expires_at) ON creator.identity_session TO creator_trust_reply_projection;
GRANT SELECT(id,creator_id,version,kind,state,withdrawn_at) ON creator.content_index TO creator_trust_reply_projection;
GRANT SELECT(content_id,creator_id,version,signed_act_id,author_kind,published_at) ON creator.content_publication TO creator_trust_reply_projection;
GRANT SELECT(id,content_id,creator_id,fan_id,version,text,created_at,withdrawn_at),UPDATE(version)
 ON creator.content_reply TO creator_trust_reply_projection;
GRANT EXECUTE ON FUNCTION creator_trust.denial_projection(uuid,uuid,uuid,uuid),creator_trust.runtime_audience_denial(uuid,uuid) TO creator_trust_reply_projection;
SET LOCAL ROLE creator_trust_owner;
ALTER TABLE creator_trust.safety_case DROP CONSTRAINT safety_case_kind_check;
ALTER TABLE creator_trust.safety_case ADD CONSTRAINT safety_case_kind_check
 CHECK(kind IN('ai_report','crisis','abuse','dispute','verification','pause','support','reply_review'));
CREATE TABLE creator_trust.reply_review (
 case_id uuid PRIMARY KEY REFERENCES creator_trust.safety_case(id),
 reply_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,account_id uuid NOT NULL,
 reply_version integer NOT NULL CHECK(reply_version>0),text_hash text NOT NULL CHECK(text_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(reply_id,reply_version,text_hash)
);
CREATE TABLE creator_trust.reply_review_decision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES creator_trust.reply_review(case_id) ON DELETE CASCADE,
 case_version integer NOT NULL CHECK(case_version>1),reviewer_account_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN('allowed','flagged')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(case_id,case_version)
);
ALTER TABLE creator_trust.reply_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.reply_review FORCE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.reply_review_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.reply_review_decision FORCE ROW LEVEL SECURITY;
CREATE POLICY reply_actor ON creator_trust.reply_review FOR SELECT TO creator_trust_runtime
 USING(account_id=creator_trust.current_account() OR creator_trust.has_case_access(case_id));
CREATE POLICY reply_projection ON creator_trust.reply_review TO creator_trust_reply_projection
 USING(account_id=creator_trust.current_account() OR creator_trust.has_case_access(case_id))
 WITH CHECK(account_id=creator_trust.current_account());
CREATE POLICY reply_coordinator ON creator_trust.reply_review TO creator_trust_worker USING(true) WITH CHECK(true);
CREATE POLICY decision_read ON creator_trust.reply_review_decision FOR SELECT TO creator_trust_runtime,creator_trust_reply_projection
 USING(EXISTS(SELECT FROM creator_trust.reply_review r WHERE r.case_id=reply_review_decision.case_id));
CREATE POLICY decision_insert ON creator_trust.reply_review_decision FOR INSERT TO creator_trust_runtime
 WITH CHECK(reviewer_account_id=creator_trust.current_account() AND creator_trust.has_case_access(case_id)
  AND EXISTS(SELECT FROM creator_trust.safety_case c WHERE c.id=case_id AND c.kind='reply_review' AND c.queue='safety'
   AND c.state='resolved' AND c.version=case_version AND c.decision_account_id=reviewer_account_id
   AND c.outcome=CASE reply_review_decision.state WHEN 'allowed' THEN 'allow_reply' ELSE 'flag_reply' END));
CREATE POLICY decision_coordinator ON creator_trust.reply_review_decision TO creator_trust_worker USING(true) WITH CHECK(true);
CREATE POLICY projection_member ON creator_trust.ops_member FOR SELECT TO creator_trust_reply_projection
 USING(account_id=creator_trust.current_account());
CREATE POLICY projection_access ON creator_trust.case_access FOR SELECT TO creator_trust_reply_projection
 USING(account_id=creator_trust.current_account());
CREATE POLICY projection_case ON creator_trust.safety_case FOR SELECT TO creator_trust_reply_projection
 USING(reporter_account_id=creator_trust.current_account() OR creator_trust.has_case_access(id));
CREATE POLICY projection_case_insert ON creator_trust.safety_case FOR INSERT TO creator_trust_reply_projection
 WITH CHECK(reporter_account_id=creator_trust.current_account() AND subject_account_id=creator_trust.current_account()
  AND kind='reply_review' AND queue='safety' AND state='open' AND version=1);
CREATE POLICY projection_event ON creator_trust.case_event FOR INSERT TO creator_trust_reply_projection
 WITH CHECK(actor_account_id=creator_trust.current_account()
  AND EXISTS(SELECT FROM creator_trust.reply_review r WHERE r.case_id=case_event.case_id AND r.account_id=actor_account_id));
GRANT SELECT ON creator_trust.reply_review,creator_trust.reply_review_decision TO creator_trust_runtime,creator_trust_worker,creator_trust_reply_projection;
GRANT INSERT ON creator_trust.reply_review_decision TO creator_trust_runtime;
GRANT INSERT ON creator_trust.reply_review TO creator_trust_reply_projection;
GRANT DELETE ON creator_trust.reply_review,creator_trust.reply_review_decision TO creator_trust_worker;
GRANT SELECT(account_id,queues,expires_at,revoked_at) ON creator_trust.ops_member TO creator_trust_reply_projection;
GRANT SELECT(case_id,account_id,expires_at) ON creator_trust.case_access TO creator_trust_reply_projection;
GRANT SELECT(id,kind,queue,state,version,outcome,decision_account_id,reporter_account_id),
 INSERT(reporter_account_id,subject_account_id,creator_id,creator_name,kind,queue,reason,state)
 ON creator_trust.safety_case TO creator_trust_reply_projection;
GRANT INSERT(case_id,actor_account_id,type,reason) ON creator_trust.case_event TO creator_trust_reply_projection;
GRANT USAGE ON SEQUENCE creator_trust.safety_case_number_seq TO creator_trust_reply_projection;
RESET ROLE;
-- Existing PUBLIC reply policy invokes request-role helpers. Restrict that
-- policy to its actual consumer before installing this distinct purpose role.
ALTER POLICY reply_read ON creator.content_reply TO creator_runtime;
ALTER POLICY reply_update ON creator.content_reply TO creator_runtime;
ALTER POLICY content_read ON creator.content_publication TO creator_runtime;
CREATE POLICY trust_reply_publication ON creator.content_publication FOR SELECT TO creator_trust_reply_projection USING(
 EXISTS(SELECT FROM creator.content_reply r WHERE r.content_id=content_publication.content_id AND r.creator_id=content_publication.creator_id));
CREATE POLICY trust_reply_source ON creator.content_reply FOR SELECT TO creator_trust_reply_projection USING(
 EXISTS(SELECT FROM creator.fan_profile f WHERE f.id=fan_id AND f.account_id=nullif(current_setting('app.account_id',true),'')::uuid)
 OR EXISTS(SELECT FROM creator_trust.reply_review r WHERE r.reply_id=content_reply.id AND creator_trust.has_case_access(r.case_id)));
-- UPDATE(version) exists solely for FOR SHARE. No exported function writes it.
CREATE POLICY trust_reply_lock ON creator.content_reply FOR UPDATE TO creator_trust_reply_projection USING(
 EXISTS(SELECT FROM creator.fan_profile f WHERE f.id=fan_id AND f.account_id=nullif(current_setting('app.account_id',true),'')::uuid)
 OR EXISTS(SELECT FROM creator_trust.reply_review r WHERE r.reply_id=content_reply.id AND creator_trust.has_case_access(r.case_id))) WITH CHECK(false);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.review_note_reply(reply uuid,c uuid,fan uuid,v integer,h text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid;source record;existing record;decision record;new_case uuid;actual_hash text;denial text;
BEGIN
 caller:=nullif(current_setting('app.account_id',true),'')::uuid;
 IF caller IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session s WHERE s.id=nullif(current_setting('trust.reply_session_id',true),'')::uuid
  AND s.account_id=caller AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'Current reply author session required' USING ERRCODE='PT401';
 END IF;
 SELECT r.id,r.creator_id,r.fan_id,r.version,r.text,r.withdrawn_at,f.account_id INTO source FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id
  JOIN creator.content_index i ON i.id=r.content_id AND i.creator_id=r.creator_id AND i.kind='note' AND i.state='published' AND i.withdrawn_at IS NULL
  JOIN creator.content_publication p ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
   AND p.signed_act_id IS NOT NULL AND p.author_kind='human_broadcast' AND p.published_at IS NOT NULL
  JOIN creator.creator_profile cp ON cp.id=i.creator_id AND cp.verification='verified' AND NOT cp.recovery_required
  WHERE r.id=reply AND r.creator_id=c AND r.fan_id=fan AND f.account_id=caller FOR SHARE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reply author required' USING ERRCODE='PT403'; END IF;
 IF source.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'Reply was withdrawn' USING ERRCODE='PT410'; END IF;
 actual_hash:=encode(public.digest(creator.canonical_json(jsonb_build_object('replyId',source.id::text,'creatorId',source.creator_id::text,
  'fanId',source.fan_id::text,'version',source.version,'text',source.text)),'sha256'),'hex');
 IF source.version IS DISTINCT FROM v OR h IS DISTINCT FROM actual_hash THEN
  RAISE EXCEPTION 'Exact reply version and hash required' USING ERRCODE='PT409';
 END IF;
 denial:=creator_trust.runtime_audience_denial(c,fan);
 IF denial='denied' THEN RAISE EXCEPTION 'Reply authority denied' USING ERRCODE='PT403'; END IF;
 IF denial IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'Reply authority unavailable' USING ERRCODE='PT503'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('w8-reply:'||reply::text||':'||v::text||':'||h,0));
 SELECT r.case_id INTO existing FROM creator_trust.reply_review r WHERE r.reply_id=reply AND r.reply_version=v AND r.text_hash=h;
 IF NOT FOUND THEN
  INSERT INTO creator_trust.safety_case(reporter_account_id,subject_account_id,creator_id,creator_name,kind,queue,reason,state)
   SELECT caller,caller,c,p.display_name,'reply_review','safety','Review this exact private Note reply before it can be delivered.','open'
   FROM creator.creator_profile p WHERE p.id=c RETURNING id INTO new_case;
  IF new_case IS NULL THEN RAISE EXCEPTION 'Creator unavailable' USING ERRCODE='PT403'; END IF;
  INSERT INTO creator_trust.reply_review(case_id,reply_id,creator_id,fan_id,account_id,reply_version,text_hash)
   VALUES(new_case,reply,c,fan,caller,v,h);
  INSERT INTO creator_trust.case_event(case_id,actor_account_id,type,reason) VALUES(new_case,caller,'reply_review_requested',NULL);
 ELSE new_case:=existing.case_id;
 END IF;
 SELECT d.id,d.state INTO decision FROM creator_trust.reply_review_decision d JOIN creator_trust.safety_case s ON s.id=d.case_id
  WHERE d.case_id=new_case AND s.state='resolved' AND s.version=d.case_version AND s.decision_account_id=d.reviewer_account_id
  AND s.outcome=CASE d.state WHEN 'allowed' THEN 'allow_reply' ELSE 'flag_reply' END;
 IF FOUND THEN RETURN jsonb_build_object('state',decision.state,'reference','w8-reply-review:'||decision.id::text,'textHash',h); END IF;
 RETURN jsonb_build_object('state','pending','reference','w8-reply-pending:'||new_case::text,'textHash',h);
END $$;
CREATE FUNCTION creator_trust.reply_review_evidence(c uuid,approve boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE review record;source record;actual_hash text;fan_account uuid;owner_account uuid;
BEGIN
 IF NOT creator_trust.may_queue('safety') OR NOT creator_trust.has_case_access(c) THEN RAISE EXCEPTION 'Purpose-leased case access required' USING ERRCODE='PT403'; END IF;
 SELECT r.* INTO review FROM creator_trust.reply_review r WHERE r.case_id=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reply review unavailable' USING ERRCODE='PT410'; END IF;
 SELECT r.id,r.text,r.version,r.creator_id,r.fan_id,r.withdrawn_at,r.created_at INTO source
  FROM creator.content_reply r WHERE r.id=review.reply_id FOR SHARE;
 IF NOT FOUND OR source.withdrawn_at IS NOT NULL THEN RAISE EXCEPTION 'Reply was withdrawn' USING ERRCODE='PT410'; END IF;
 actual_hash:=encode(public.digest(creator.canonical_json(jsonb_build_object('replyId',source.id::text,'creatorId',source.creator_id::text,
  'fanId',source.fan_id::text,'version',source.version,'text',source.text)),'sha256'),'hex');
 IF source.version IS DISTINCT FROM review.reply_version OR actual_hash IS DISTINCT FROM review.text_hash THEN
  RAISE EXCEPTION 'Reply source changed' USING ERRCODE='PT409';
 END IF;
 IF approve THEN
  IF NOT EXISTS(SELECT FROM creator.content_reply r JOIN creator.content_index i ON i.id=r.content_id AND i.creator_id=r.creator_id
   JOIN creator.content_publication p ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
   JOIN creator.creator_profile cp ON cp.id=i.creator_id
   WHERE r.id=review.reply_id AND i.kind='note' AND i.state='published' AND i.withdrawn_at IS NULL
    AND p.signed_act_id IS NOT NULL AND p.author_kind='human_broadcast' AND p.published_at IS NOT NULL
    AND cp.verification='verified' AND NOT cp.recovery_required) THEN
   RAISE EXCEPTION 'Note is no longer published' USING ERRCODE='PT403';
  END IF;
  SELECT f.account_id,p.account_id INTO fan_account,owner_account FROM creator.fan_profile f CROSS JOIN creator.creator_profile p
   WHERE f.id=review.fan_id AND p.id=review.creator_id;
  IF NOT FOUND OR current_setting('transaction_isolation')<>'read committed' THEN
   RAISE EXCEPTION 'Reply authority unavailable' USING ERRCODE='PT503';
  END IF;
  IF creator_trust.denial_projection(review.creator_id,fan_account,owner_account,NULL) THEN
   RAISE EXCEPTION 'Reply authority denied' USING ERRCODE='PT403';
  END IF;
 END IF;
 RETURN jsonb_build_object('id',source.id,'category','note_reply_review','author_kind','fan','text',source.text,'created_at',source.created_at);
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.review_note_reply(uuid,uuid,uuid,integer,text) OWNER TO creator_trust_reply_projection;
ALTER FUNCTION creator_trust.reply_review_evidence(uuid,boolean) OWNER TO creator_trust_reply_projection;
REVOKE ALL ON FUNCTION creator_trust.review_note_reply(uuid,uuid,uuid,integer,text),creator_trust.reply_review_evidence(uuid,boolean) FROM PUBLIC;
GRANT USAGE ON SCHEMA creator_trust TO creator_runtime;
GRANT EXECUTE ON FUNCTION creator_trust.review_note_reply(uuid,uuid,uuid,integer,text) TO creator_runtime;
GRANT EXECUTE ON FUNCTION creator_trust.reply_review_evidence(uuid,boolean) TO creator_trust_runtime;
COMMIT;
