-- Held0198_w5_content_privacy_export. W8 owns registration and activation.
-- Export only: no deletion, retention, source revocation or interactive grant.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w5_content_privacy_export') THEN
  CREATE ROLE creator_w5_content_privacy_export NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_w5_content_privacy_export'
  AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL)
  OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid)
   WHERE r.rolname='creator_w5_content_privacy_export')
 THEN RAISE EXCEPTION 'Isolated Content export purpose required'; END IF;
END $$;
GRANT USAGE ON SCHEMA creator,creator_trust TO creator_w5_content_privacy_export;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_w5_content_privacy_export;
GRANT SELECT(id,account_id),UPDATE(id) ON creator.fan_profile,creator.creator_profile TO creator_w5_content_privacy_export;
GRANT SELECT(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,owned_creator_ids,ownership_ref),UPDATE(id)
 ON creator_trust.privacy_job TO creator_w5_content_privacy_export;
GRANT SELECT(job_id,domain,state,lease_token,lease_until),UPDATE(job_id)
 ON creator_trust.privacy_task TO creator_w5_content_privacy_export;
SET LOCAL ROLE creator_trust_owner;
CREATE POLICY w5_content_export_metadata ON creator_trust.privacy_job FOR SELECT TO creator_w5_content_privacy_export USING(true);
CREATE POLICY w5_content_export_lock ON creator_trust.privacy_job FOR UPDATE TO creator_w5_content_privacy_export USING(true) WITH CHECK(false);
CREATE POLICY w5_content_export_metadata ON creator_trust.privacy_task FOR SELECT TO creator_w5_content_privacy_export USING(true);
CREATE POLICY w5_content_export_lock ON creator_trust.privacy_task FOR UPDATE TO creator_w5_content_privacy_export USING(true) WITH CHECK(false);
RESET ROLE;
SET LOCAL ROLE creator_owner;
CREATE POLICY w5_content_export_metadata ON creator.fan_profile FOR SELECT TO creator_w5_content_privacy_export USING(true);
CREATE POLICY w5_content_export_lock ON creator.fan_profile FOR UPDATE TO creator_w5_content_privacy_export USING(true) WITH CHECK(false);
CREATE POLICY w5_content_export_metadata ON creator.creator_profile FOR SELECT TO creator_w5_content_privacy_export USING(true);
CREATE POLICY w5_content_export_lock ON creator.creator_profile FOR UPDATE TO creator_w5_content_privacy_export USING(true) WITH CHECK(false);
GRANT SELECT(id,account_id,creator_id,subject_id,version,text_hash,envelope,created_at) ON creator.content_consent_history TO creator_w5_content_privacy_export;
GRANT SELECT(id,creator_id,content_id,version,type,state,created_at) ON creator.content_effect TO creator_w5_content_privacy_export;
GRANT SELECT(id,account_id,creator_id,subject_id,subject_kind,version,type,state,created_at) ON creator.content_fan_effect TO creator_w5_content_privacy_export;
GRANT SELECT(id,creator_id,state,version,audience,kind,published_at,scheduled_at,withdrawn_at,quote_reply_id,quote_consent_version,created_at,packet_id) ON creator.content_index TO creator_w5_content_privacy_export;
GRANT SELECT(creator_id,account_id,muted) ON creator.content_preference TO creator_w5_content_privacy_export;
GRANT SELECT(content_id,creator_id,version,signed_act_id,author_kind,author_account_id,author_label,published_at,media_evidence) ON creator.content_publication TO creator_w5_content_privacy_export;
GRANT SELECT(reply_id,share_text,show_handle,version) ON creator.content_quote_permission TO creator_w5_content_privacy_export;
GRANT SELECT(reply_id,creator_id,kind,signed_act_id,created_at) ON creator.content_reaction TO creator_w5_content_privacy_export;
GRANT SELECT(id,content_id,creator_id,fan_id,text,version,created_at,withdrawn_at) ON creator.content_reply TO creator_w5_content_privacy_export;
GRANT SELECT(reply_id,creator_id,account_id,reply_version,read_at) ON creator.content_reply_read TO creator_w5_content_privacy_export;
GRANT SELECT(reply_id,content_id,creator_id,fan_id,reply_version,state,review_ref,text_hash,created_at,withdrawn_at) ON creator.content_reply_review TO creator_w5_content_privacy_export;
GRANT SELECT(content_id,creator_id,version,document,author_account_id,created_at) ON creator.content_revision TO creator_w5_content_privacy_export;
GRANT SELECT(id,creator_id,fan_id,target_kind,target_id,text,share_digest,show_identity,version,withdrawn_at,created_at,thread_id) ON creator.content_thanks TO creator_w5_content_privacy_export;
GRANT SELECT(account_id,job_id,created_at) ON creator.content_tombstone TO creator_w5_content_privacy_export;
GRANT SELECT(creator_id,fan_id,account_id,text,version,sent_message_id,updated_at,thread_id) ON creator.studio_reply_draft TO creator_w5_content_privacy_export;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['content_index','content_revision','content_publication','content_reply','content_quote_permission',
  'content_reaction','content_thanks','content_consent_history','content_preference','content_reply_read','content_reply_review',
  'content_fan_effect','content_effect','content_tombstone','studio_reply_draft'] LOOP
  EXECUTE format('CREATE POLICY w5_content_export_metadata ON creator.%I FOR SELECT TO creator_w5_content_privacy_export USING(true)',r);
 END LOOP;
 -- The origin migration may precede this held purpose. Partial metadata never
 -- becomes a supposedly complete export; unknown later columns stay ungranted.
 IF (SELECT count(*) FROM pg_attribute WHERE attrelid='creator.content_revision'::regclass AND attnum>0 AND NOT attisdropped
  AND attname=ANY(ARRAY['ai_reuse_public_text','ai_reuse_source_hash','ai_reuse_command_hash']))=3 THEN
  GRANT SELECT(ai_reuse_public_text,ai_reuse_source_hash,ai_reuse_command_hash) ON creator.content_revision TO creator_w5_content_privacy_export;
 ELSIF EXISTS(SELECT FROM pg_attribute WHERE attrelid='creator.content_revision'::regclass AND attnum>0 AND NOT attisdropped
  AND attname=ANY(ARRAY['ai_reuse_public_text','ai_reuse_source_hash','ai_reuse_command_hash'])) THEN
  RAISE EXCEPTION 'Complete Content origin metadata required';
 END IF;
END $$;
CREATE TABLE creator.content_privacy_export_scope (
 pid integer NOT NULL, xid xid8 NOT NULL, caller name NOT NULL,
 job_id uuid NOT NULL, lease_token uuid NOT NULL, binding jsonb NOT NULL,
 PRIMARY KEY(pid,xid)
);
ALTER TABLE creator.content_privacy_export_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.content_privacy_export_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY w5_content_export_private ON creator.content_privacy_export_scope TO creator_w5_content_privacy_export USING(true) WITH CHECK(true);
CREATE FUNCTION creator.content_privacy_export(jid uuid,aid uuid,sc text,c uuid,t uuid,token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j record; task record; owned uuid[]; fan uuid; result jsonb; item record; binding jsonb; held record;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_w5_content_privacy_export'
  OR jid IS NULL OR aid IS NULL OR token IS NULL OR sc IS NULL OR sc NOT IN('account','creator','thread')
  OR (sc='account' AND (c IS NOT NULL OR t IS NOT NULL))
  OR (sc='creator' AND (c IS NULL OR t IS NOT NULL)) OR (sc='thread' AND (c IS NULL OR t IS NULL))
  OR current_setting('transaction_isolation')<>'read committed'
  OR nullif(current_setting('app.identity_session_id',true),'') IS NOT NULL
  OR nullif(current_setting('app.generation_scope_nonce',true),'') IS NOT NULL
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls
   AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
  OR NOT EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper
   AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
  OR EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   OR roleid=(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION 'Actual noninteractive Content export task required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND
  (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0198_w5_content_privacy_export')
  OR NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0087_w8_privacy_task_commit_fence'
   AND checksum='33e619bfdea66355e1d8d2b90ed2d0389f21ae024fda63e1b984c99aede847ef')
 THEN RAISE EXCEPTION 'Current registered Content export unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_attribute WHERE attrelid='creator.content_revision'::regclass AND attnum>0 AND NOT attisdropped
  AND attname=ANY(ARRAY['ai_reuse_public_text','ai_reuse_source_hash','ai_reuse_command_hash']))
  AND NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0186_w5_generation_content_origin'
   AND checksum='2f1c4b30133a0c8707b16b15c1e42a9daf539cb5edeeb48ad6a835352a4f444d')
 THEN RAISE EXCEPTION 'Current registered Content origin metadata required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace WHERE
  ((n.nspname='creator' AND r.relname=ANY(ARRAY['content_index','content_revision','content_publication','content_reply',
   'content_quote_permission','content_reaction','content_thanks','content_consent_history','content_preference','content_reply_read',
   'content_reply_review','content_fan_effect','content_effect','content_tombstone','studio_reply_draft','fan_profile','creator_profile']))
   OR (n.nspname='creator_trust' AND r.relname IN('privacy_job','privacy_task')))
  AND (NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR NOT EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=r.oid
   AND p.polname='w5_content_export_metadata' AND p.polcmd='r' AND p.polpermissive
   AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname=current_user)]
   AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
   OR EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=r.oid AND NOT p.polpermissive
    AND (0=ANY(p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname=current_user)=ANY(p.polroles)))))
 THEN RAISE EXCEPTION 'Exact Content export visibility required' USING ERRCODE='42501'; END IF;
 -- Independently read the real original job and task; no caller-supplied owned
 -- IDs, private87 scope ACL or extra EXECUTE grant on its pinned fence.
 SELECT id,account_id,kind,scope,creator_id,thread_id,verified_at,verification_ref,owned_creator_ids,ownership_ref
 INTO j FROM creator_trust.privacy_job WHERE id=jid AND account_id=aid AND kind='export' AND scope=sc
  AND creator_id IS NOT DISTINCT FROM c AND thread_id IS NOT DISTINCT FROM t
  AND verified_at IS NOT NULL AND verification_ref<>'' AND state NOT IN('complete','dead_letter') FOR SHARE NOWAIT;
 IF NOT FOUND OR (sc='account' AND (j.ownership_ref IS NULL OR j.owned_creator_ids IS NULL OR cardinality(j.owned_creator_ids)>100))
 THEN RAISE EXCEPTION 'Current original Content export unavailable' USING ERRCODE='42501'; END IF;
 SELECT job_id,domain,lease_token,lease_until INTO task FROM creator_trust.privacy_task
  WHERE job_id=jid AND domain='content' AND state='running' AND lease_token=token AND lease_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current Content export lease unavailable' USING ERRCODE='42501'; END IF;
 owned:=CASE WHEN sc='account' THEN j.owned_creator_ids ELSE ARRAY[]::uuid[] END;
 PERFORM id FROM creator.creator_profile WHERE id=ANY(owned) AND account_id=aid ORDER BY id FOR SHARE NOWAIT;
 IF (SELECT count(*) FROM creator.creator_profile WHERE id=ANY(owned) AND account_id=aid)<>cardinality(owned)
 THEN RAISE EXCEPTION 'Original creator ownership changed' USING ERRCODE='42501'; END IF;
 SELECT id INTO fan FROM creator.fan_profile WHERE account_id=aid FOR SHARE NOWAIT;
 binding:=to_jsonb(j)||jsonb_build_object('lease_until',task.lease_until,'fan_id',fan);
 SELECT * INTO held FROM creator.content_privacy_export_scope WHERE pid=pg_backend_pid() AND xid=pg_current_xact_id();
 IF FOUND THEN
  IF held.caller<>session_user OR held.job_id<>jid OR held.lease_token<>token OR held.binding<>binding THEN
   RAISE EXCEPTION 'Content export transaction changed' USING ERRCODE='42501';
  END IF;
 ELSE
  INSERT INTO creator.content_privacy_export_scope VALUES(pg_backend_pid(),pg_current_xact_id(),session_user,jid,token,binding);
 END IF;
 -- Whole-row projections below are complete only while every current column
 -- has the exact reviewed column grant. Newly added columns fail closed.
 IF EXISTS(SELECT FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='creator' AND r.relname=ANY(ARRAY['content_index','content_revision','content_reply','content_quote_permission',
   'content_reaction','content_thanks','content_consent_history','content_preference','content_reply_read','content_reply_review',
   'content_tombstone','studio_reply_draft']) AND a.attnum>0 AND NOT a.attisdropped
  AND NOT has_column_privilege(current_user,r.oid,a.attnum,'SELECT'))
 THEN RAISE EXCEPTION 'Current complete Content export projection required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT FROM pg_class r JOIN pg_namespace n ON n.oid=r.relnamespace
  WHERE n.nspname='creator' AND r.relname=ANY(ARRAY['content_index','content_revision','content_publication','content_reply',
   'content_quote_permission','content_reaction','content_thanks','content_consent_history','content_preference','content_reply_read',
   'content_reply_review','content_fan_effect','content_effect','content_tombstone','studio_reply_draft'])
  AND (NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR EXISTS(SELECT FROM pg_policy p WHERE p.polrelid=r.oid
   AND NOT p.polpermissive AND (0=ANY(p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname=current_user)=ANY(p.polroles)))))
 THEN RAISE EXCEPTION 'Current Content export visibility unavailable' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'replies',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM creator.content_reply WHERE fan_id=fan
   AND (c IS NULL OR creator_id=c) AND t IS NULL ORDER BY id LIMIT 1001) r),'[]'::jsonb),
  'quotePermissions',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT p.* FROM creator.content_quote_permission p
   JOIN creator.content_reply r ON r.id=p.reply_id WHERE r.fan_id=fan AND (c IS NULL OR r.creator_id=c) AND t IS NULL ORDER BY p.reply_id LIMIT 1001) p),'[]'::jsonb),
  'reactions',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT p.* FROM creator.content_reaction p
   JOIN creator.content_reply r ON r.id=p.reply_id WHERE r.fan_id=fan AND (c IS NULL OR r.creator_id=c) AND t IS NULL ORDER BY p.reply_id LIMIT 1001) p),'[]'::jsonb),
  'thanks',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM creator.content_thanks WHERE fan_id=fan
   AND (c IS NULL OR creator_id=c) AND (t IS NULL OR thread_id=t) ORDER BY id LIMIT 1001) r),'[]'::jsonb),
  'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (SELECT * FROM creator.content_revision WHERE t IS NULL
   AND (c IS NULL OR creator_id=c) AND (author_account_id=aid OR creator_id=ANY(owned)) ORDER BY content_id,version LIMIT 1001) r),'[]'::jsonb),
  'indexes',coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM (SELECT i.* FROM creator.content_index i WHERE t IS NULL
   AND (c IS NULL OR i.creator_id=c) AND (i.creator_id=ANY(owned) OR EXISTS(SELECT FROM creator.content_revision r WHERE r.content_id=i.id AND r.author_account_id=aid)) ORDER BY i.id LIMIT 1001) i),'[]'::jsonb),
  'publications',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT content_id,creator_id,version,signed_act_id,author_kind,
   author_account_id,author_label,published_at,media_evidence FROM creator.content_publication WHERE t IS NULL
   AND (c IS NULL OR creator_id=c) AND (author_account_id=aid OR creator_id=ANY(owned)) ORDER BY content_id,version LIMIT 1001) p),'[]'::jsonb),
  'drafts',coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (SELECT * FROM creator.studio_reply_draft WHERE account_id=aid
   AND (c IS NULL OR creator_id=c) AND (t IS NULL OR thread_id=t) ORDER BY creator_id,fan_id,account_id LIMIT 1001) d),'[]'::jsonb),
  'consents',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM (SELECT h.* FROM creator.content_consent_history h WHERE h.account_id=aid
   AND (c IS NULL OR h.creator_id=c) AND (t IS NULL OR h.subject_id IN(SELECT id FROM creator.content_thanks WHERE fan_id=fan AND thread_id=t)) ORDER BY h.id LIMIT 1001) h),'[]'::jsonb),
  'preferences',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM creator.content_preference WHERE account_id=aid
   AND (c IS NULL OR creator_id=c) AND t IS NULL ORDER BY creator_id LIMIT 1001) p),'[]'::jsonb),
  'replyReads',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM creator.content_reply_read WHERE account_id=aid
   AND (c IS NULL OR creator_id=c) AND t IS NULL ORDER BY reply_id LIMIT 1001) p),'[]'::jsonb),
  'replyReviews',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM creator.content_reply_review WHERE fan_id=fan
   AND (c IS NULL OR creator_id=c) AND t IS NULL ORDER BY reply_id LIMIT 1001) p),'[]'::jsonb),
  'fanEffects',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT e.id,e.account_id,e.creator_id,e.subject_id,e.subject_kind,e.version,e.type,e.state,e.created_at
   FROM creator.content_fan_effect e WHERE e.account_id=aid AND (c IS NULL OR e.creator_id=c)
   AND (t IS NULL OR e.subject_kind='thanks' AND e.subject_id IN(SELECT id FROM creator.content_thanks WHERE fan_id=fan AND thread_id=t)) ORDER BY e.id LIMIT 1001) e),'[]'::jsonb),
  'effects',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT e.id,e.creator_id,e.content_id,e.version,e.type,e.state,e.created_at
   FROM creator.content_effect e WHERE t IS NULL AND (c IS NULL OR e.creator_id=c) AND (e.creator_id=ANY(owned)
   OR EXISTS(SELECT FROM creator.content_revision r WHERE r.content_id=e.content_id AND r.version=e.version AND r.author_account_id=aid)) ORDER BY e.id LIMIT 1001) e),'[]'::jsonb),
  'tombstones',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT * FROM creator.content_tombstone WHERE account_id=aid
   AND sc='account' ORDER BY account_id LIMIT 1001) p),'[]'::jsonb)
 ) INTO result;
 FOR item IN SELECT key,value FROM jsonb_each(result) LOOP
  IF jsonb_array_length(item.value)>1000 THEN
   RAISE EXCEPTION 'Bounded Content export subjob required' USING ERRCODE='54000';
  END IF;
 END LOOP;
 IF task.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'Content export lease expired' USING ERRCODE='42501'; END IF;
 IF (SELECT id FROM creator.fan_profile WHERE account_id=aid) IS DISTINCT FROM fan THEN
  RAISE EXCEPTION 'Content export fan binding changed' USING ERRCODE='42501';
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION creator.finish_content_privacy_export_scope()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE binding jsonb;
BEGIN
 IF current_query() !~* '^\s*COMMIT\s*;?\s*$' OR NEW.pid<>pg_backend_pid() OR NEW.xid<>pg_current_xact_id()
  OR NEW.caller<>session_user OR session_user<>'creator_runtime'
 THEN RAISE EXCEPTION 'Content export commit mismatch' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND
  (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
 THEN RAISE EXCEPTION 'Content export closed before commit' USING ERRCODE='23514'; END IF;
 SELECT jsonb_build_object('id',j.id,'account_id',j.account_id,'kind',j.kind,'scope',j.scope,
  'creator_id',j.creator_id,'thread_id',j.thread_id,'verified_at',j.verified_at,'verification_ref',j.verification_ref,
  'owned_creator_ids',j.owned_creator_ids,'ownership_ref',j.ownership_ref,'lease_until',t.lease_until,
  'fan_id',(SELECT id FROM creator.fan_profile WHERE account_id=j.account_id)) INTO binding
 FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id WHERE j.id=NEW.job_id
  AND j.kind='export' AND j.state NOT IN('complete','dead_letter') AND j.verified_at IS NOT NULL AND j.verification_ref<>''
  AND t.domain='content' AND t.state='running' AND t.lease_token=NEW.lease_token AND t.lease_until>clock_timestamp();
 IF NOT FOUND OR binding<>NEW.binding THEN
  RAISE EXCEPTION 'Content export lease expired before commit' USING ERRCODE='23514';
 END IF;
 DELETE FROM creator.content_privacy_export_scope s WHERE s.pid=NEW.pid AND s.xid=NEW.xid AND s.caller=NEW.caller
  AND s.job_id=NEW.job_id AND s.lease_token=NEW.lease_token AND s.binding=NEW.binding;
 IF NOT FOUND THEN RAISE EXCEPTION 'Content export commit scope missing' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER content_privacy_export_commit_current AFTER INSERT ON creator.content_privacy_export_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.finish_content_privacy_export_scope();
RESET ROLE;
ALTER TABLE creator.content_privacy_export_scope OWNER TO creator_w5_content_privacy_export;
ALTER FUNCTION creator.content_privacy_export(uuid,uuid,text,uuid,uuid,uuid) OWNER TO creator_w5_content_privacy_export;
ALTER FUNCTION creator.finish_content_privacy_export_scope() OWNER TO creator_w5_content_privacy_export;
REVOKE ALL ON TABLE creator.content_privacy_export_scope FROM PUBLIC,creator_runtime,creator_trust_runtime,creator_trust_worker;
REVOKE ALL ON FUNCTION creator.content_privacy_export(uuid,uuid,text,uuid,uuid,uuid),creator.finish_content_privacy_export_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.content_privacy_export(uuid,uuid,text,uuid,uuid,uuid) TO creator_runtime;
COMMIT;
