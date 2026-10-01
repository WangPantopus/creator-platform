-- W8 additive migration; no peer-owned table/state is modified.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_trust_owner') THEN CREATE ROLE creator_trust_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_trust_runtime') THEN CREATE ROLE creator_trust_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_trust_worker') THEN CREATE ROLE creator_trust_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA creator_trust AUTHORIZATION creator_trust_owner;
SET LOCAL ROLE creator_trust_owner;
CREATE TABLE creator_trust.ops_member (
 account_id uuid PRIMARY KEY, queues text[] NOT NULL, supervisor boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK(queues <@ ARRAY['safety','disputes','verification','pauses','support']::text[])
);
CREATE TABLE creator_trust.safety_case (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 reporter_account_id uuid NOT NULL, creator_id uuid, creator_name text, subject_account_id uuid, request_id uuid,
 kind text NOT NULL CHECK(kind IN ('ai_report','crisis','abuse','dispute','verification','pause','support')),
 queue text NOT NULL CHECK(queue IN ('safety','disputes','verification','pauses','support')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 12 AND 2000),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','urgent','reviewing','waiting','action_pending','resolved','appealed')),
 outcome text, resolution_reason text, decision_account_id uuid, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE INDEX cases_queue_cursor ON creator_trust.safety_case(queue,created_at DESC,id DESC);
CREATE INDEX cases_reporter ON creator_trust.safety_case(reporter_account_id,created_at DESC,id DESC);
CREATE TABLE creator_trust.case_access (
 case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id), account_id uuid NOT NULL,
 purpose text NOT NULL CHECK(length(purpose) BETWEEN 12 AND 2000), expires_at timestamptz NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,account_id),
 CHECK(expires_at <= granted_at + interval '15 minutes')
);
CREATE TABLE creator_trust.case_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 category text NOT NULL, snapshot jsonb NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(jsonb_typeof(snapshot)='object')
);
CREATE INDEX evidence_expiry ON creator_trust.case_evidence(expires_at);
CREATE TABLE creator_trust.case_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 actor_account_id uuid NOT NULL, type text NOT NULL, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_event_cursor ON creator_trust.case_event(case_id,created_at,id);
CREATE TABLE creator_trust.access_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 actor_account_id uuid NOT NULL, action text NOT NULL, purpose text NOT NULL,
 correlation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_audit_cursor ON creator_trust.access_audit(case_id,created_at DESC,id DESC);
CREATE TABLE creator_trust.notice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_account_id uuid NOT NULL,
 case_id uuid REFERENCES creator_trust.safety_case(id), type text NOT NULL, reason text NOT NULL,
 version integer NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(recipient_account_id,case_id,type,version)
);
CREATE INDEX notice_recipient ON creator_trust.notice(recipient_account_id,created_at DESC,id DESC);
CREATE TABLE creator_trust.effect (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 actor_account_id uuid NOT NULL, type text NOT NULL, input jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','blocked','retry','complete','dead_letter')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 lease_token uuid, receipt jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,type)
);
CREATE INDEX effect_ready ON creator_trust.effect(available_at,created_at) WHERE state <> 'complete';
CREATE TABLE creator_trust.block (
 account_id uuid NOT NULL, creator_id uuid NOT NULL, case_id uuid NOT NULL REFERENCES creator_trust.safety_case(id),
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, PRIMARY KEY(account_id,creator_id)
);
CREATE TABLE creator_trust.privacy_job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('export','delete')), scope text NOT NULL CHECK(scope IN ('account','creator','thread')),
 creator_id uuid, thread_id uuid, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','blocked','retry','complete','dead_letter')),
 verified_at timestamptz NOT NULL, verification_ref text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK(scope='account' OR creator_id IS NOT NULL), CHECK(scope<>'thread' OR thread_id IS NOT NULL)
);
CREATE INDEX privacy_jobs_owner ON creator_trust.privacy_job(account_id,created_at DESC,id DESC);
CREATE TABLE creator_trust.tombstone (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, scope text NOT NULL,
 creator_id uuid, thread_id uuid, job_id uuid NOT NULL UNIQUE REFERENCES creator_trust.privacy_job(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tombstone_boundary ON creator_trust.tombstone(account_id,creator_id,thread_id);
CREATE TABLE creator_trust.privacy_task (
 job_id uuid NOT NULL REFERENCES creator_trust.privacy_job(id), domain text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','blocked','retry','complete','dead_letter')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 receipt jsonb, data jsonb, error_code text, completed_at timestamptz,
 PRIMARY KEY(job_id,domain), CHECK(domain IN ('identity','conversation','agent','commerce','content','media','growth','trust'))
);
CREATE INDEX privacy_task_ready ON creator_trust.privacy_task(available_at,job_id) WHERE state<>'complete';
CREATE TABLE creator_trust.retained_record (
 job_id uuid NOT NULL REFERENCES creator_trust.privacy_job(id), domain text NOT NULL, category text NOT NULL,
 until_at timestamptz, reason text NOT NULL, PRIMARY KEY(job_id,domain,category),
 FOREIGN KEY(job_id,domain) REFERENCES creator_trust.privacy_task(job_id,domain)
);
CREATE TABLE creator_trust.command (
 account_id uuid NOT NULL, operation text NOT NULL, key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,operation,key)
);
CREATE TABLE creator_trust.crisis_counter (
 day date NOT NULL, region text NOT NULL, protocol_version text NOT NULL,
 referrals bigint NOT NULL DEFAULT 0 CHECK(referrals>=0), PRIMARY KEY(day,region,protocol_version)
);
CREATE TABLE creator_trust.service_incident (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), component text NOT NULL, state text NOT NULL,
 public_message text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE creator_trust.feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, consent_version text NOT NULL,
 cohort text NOT NULL CHECK(cohort IN ('expert','companion','blend','unspecified')),
 useful boolean NOT NULL, authorship_clear boolean NOT NULL, comment text CHECK(length(comment)<=2000),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days'
);
CREATE FUNCTION creator_trust.current_account() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.account_id',true),'')::uuid $$;
CREATE FUNCTION creator_trust.may_queue(q text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM creator_trust.ops_member WHERE account_id=creator_trust.current_account() AND q=ANY(queues) AND revoked_at IS NULL AND expires_at>now())
$$;
CREATE FUNCTION creator_trust.has_case_access(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM creator_trust.case_access a JOIN creator_trust.ops_member m ON m.account_id=a.account_id
 WHERE a.case_id=c AND a.account_id=creator_trust.current_account() AND a.expires_at>now() AND m.revoked_at IS NULL AND m.expires_at>now())
$$;
ALTER TABLE creator_trust.ops_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.ops_member FORCE ROW LEVEL SECURITY;
CREATE POLICY self_member ON creator_trust.ops_member TO creator_trust_runtime USING(account_id=creator_trust.current_account());
ALTER TABLE creator_trust.safety_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.safety_case FORCE ROW LEVEL SECURITY;
CREATE POLICY case_list ON creator_trust.safety_case FOR SELECT TO creator_trust_runtime USING(reporter_account_id=creator_trust.current_account() OR subject_account_id=creator_trust.current_account() OR creator_trust.may_queue(queue));
CREATE POLICY report_insert ON creator_trust.safety_case FOR INSERT TO creator_trust_runtime WITH CHECK(reporter_account_id=creator_trust.current_account());
CREATE POLICY case_update ON creator_trust.safety_case FOR UPDATE TO creator_trust_runtime USING(creator_trust.has_case_access(id) OR reporter_account_id=creator_trust.current_account() OR subject_account_id=creator_trust.current_account()) WITH CHECK(creator_trust.has_case_access(id) OR reporter_account_id=creator_trust.current_account() OR subject_account_id=creator_trust.current_account());
ALTER TABLE creator_trust.case_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.case_access FORCE ROW LEVEL SECURITY;
CREATE POLICY access_self ON creator_trust.case_access TO creator_trust_runtime USING(account_id=creator_trust.current_account()) WITH CHECK(account_id=creator_trust.current_account() AND EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND creator_trust.may_queue(c.queue)));
ALTER TABLE creator_trust.case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.case_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON creator_trust.case_evidence FOR SELECT TO creator_trust_runtime USING(creator_trust.has_case_access(case_id) AND expires_at>now());
CREATE POLICY evidence_insert ON creator_trust.case_evidence FOR INSERT TO creator_trust_runtime WITH CHECK(EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND c.reporter_account_id=creator_trust.current_account()));
ALTER TABLE creator_trust.case_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.case_event FORCE ROW LEVEL SECURITY;
CREATE POLICY event_read ON creator_trust.case_event FOR SELECT TO creator_trust_runtime USING(EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND (c.reporter_account_id=creator_trust.current_account() OR c.subject_account_id=creator_trust.current_account() OR creator_trust.has_case_access(c.id))));
CREATE POLICY event_insert ON creator_trust.case_event FOR INSERT TO creator_trust_runtime WITH CHECK(actor_account_id=creator_trust.current_account());
ALTER TABLE creator_trust.access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.access_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON creator_trust.access_audit FOR SELECT TO creator_trust_runtime USING(actor_account_id=creator_trust.current_account() OR EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND (c.reporter_account_id=creator_trust.current_account() OR c.subject_account_id=creator_trust.current_account())));
CREATE POLICY audit_insert ON creator_trust.access_audit FOR INSERT TO creator_trust_runtime WITH CHECK(actor_account_id=creator_trust.current_account() AND creator_trust.has_case_access(case_id));
ALTER TABLE creator_trust.notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.notice FORCE ROW LEVEL SECURITY;
CREATE POLICY notice_self ON creator_trust.notice FOR SELECT TO creator_trust_runtime USING(recipient_account_id=creator_trust.current_account());
CREATE POLICY notice_insert ON creator_trust.notice FOR INSERT TO creator_trust_runtime WITH CHECK(EXISTS(SELECT 1 FROM creator_trust.safety_case c WHERE c.id=case_id AND creator_trust.has_case_access(c.id) AND recipient_account_id IN(c.reporter_account_id,c.subject_account_id)));
ALTER TABLE creator_trust.effect ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_trust.effect FORCE ROW LEVEL SECURITY;
CREATE POLICY effect_read ON creator_trust.effect FOR SELECT TO creator_trust_runtime USING(creator_trust.has_case_access(case_id));
CREATE POLICY effect_insert ON creator_trust.effect FOR INSERT TO creator_trust_runtime WITH CHECK(creator_trust.has_case_access(case_id) AND actor_account_id=creator_trust.current_account());
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['block','privacy_job','tombstone','command','feedback'] LOOP
  EXECUTE format('ALTER TABLE creator_trust.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('ALTER TABLE creator_trust.%I FORCE ROW LEVEL SECURITY',r);
  EXECUTE format('CREATE POLICY account_scope ON creator_trust.%I TO creator_trust_runtime USING(account_id=creator_trust.current_account()) WITH CHECK(account_id=creator_trust.current_account())',r);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['privacy_task','retained_record'] LOOP
  EXECUTE format('ALTER TABLE creator_trust.%I ENABLE ROW LEVEL SECURITY',r);
  EXECUTE format('ALTER TABLE creator_trust.%I FORCE ROW LEVEL SECURITY',r);
  EXECUTE format('CREATE POLICY job_scope ON creator_trust.%I TO creator_trust_runtime USING(EXISTS(SELECT 1 FROM creator_trust.privacy_job j WHERE j.id=job_id AND j.account_id=creator_trust.current_account())) WITH CHECK(EXISTS(SELECT 1 FROM creator_trust.privacy_job j WHERE j.id=job_id AND j.account_id=creator_trust.current_account()))',r);
 END LOOP;
 -- Worker is a non-owner; it is authorized for coordinator data only, never peer content tables.
 FOREACH r IN ARRAY ARRAY['safety_case','case_access','case_evidence','case_event','access_audit','notice','effect','block','privacy_job','tombstone','privacy_task','retained_record','command','feedback'] LOOP
  EXECUTE format('CREATE POLICY coordinator_worker ON creator_trust.%I TO creator_trust_worker USING(true) WITH CHECK(true)',r);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA creator_trust TO creator_trust_runtime,creator_trust_worker;
GRANT SELECT ON creator_trust.ops_member TO creator_trust_runtime;
GRANT SELECT,INSERT,UPDATE ON creator_trust.safety_case,creator_trust.case_access,creator_trust.block,creator_trust.privacy_job,creator_trust.privacy_task TO creator_trust_runtime;
GRANT SELECT,INSERT ON creator_trust.case_evidence,creator_trust.case_event,creator_trust.access_audit,creator_trust.notice,creator_trust.effect,creator_trust.tombstone,creator_trust.command,creator_trust.retained_record,creator_trust.feedback TO creator_trust_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA creator_trust TO creator_trust_runtime,creator_trust_worker;
GRANT SELECT,INSERT,UPDATE ON creator_trust.safety_case,creator_trust.notice,creator_trust.effect,creator_trust.privacy_job,creator_trust.privacy_task,creator_trust.retained_record,creator_trust.crisis_counter TO creator_trust_worker;
GRANT SELECT ON creator_trust.case_access,creator_trust.case_evidence,creator_trust.case_event,creator_trust.access_audit,creator_trust.block,creator_trust.tombstone,creator_trust.feedback,creator_trust.command TO creator_trust_worker;
GRANT UPDATE ON creator_trust.case_evidence,creator_trust.case_event,creator_trust.notice,creator_trust.command TO creator_trust_worker;
GRANT DELETE ON creator_trust.case_evidence,creator_trust.feedback TO creator_trust_worker;
GRANT SELECT ON creator_trust.service_incident TO creator_trust_runtime,creator_trust_worker;
RESET ROLE;
INSERT INTO creator.schema_migration(version) VALUES('0008_trust_operations');
COMMIT;
