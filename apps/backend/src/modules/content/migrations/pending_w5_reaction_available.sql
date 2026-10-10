-- Additive W5 proposal. Founder approved this limited reader on 2026-10-09.
-- Queue behind #385; integrator must register it and review role/privacy custody.
-- Requires content (0005) and reply review. No text, new table, or copied private data.
BEGIN;
RESET ROLE;
DO $$ DECLARE r oid; BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_content_reaction_notice') THEN
  CREATE ROLE creator_content_reaction_notice NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
 END IF;
 SELECT oid INTO r FROM pg_roles WHERE rolname='creator_content_reaction_notice'
  AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
  AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication AND rolconfig IS NULL;
 IF r IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=r OR roleid=r)
  OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r)
  OR EXISTS(SELECT FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r
   AND dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))) THEN
  RAISE EXCEPTION 'Unused isolated reaction notice role required' USING ERRCODE='42501';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_content_reaction_notice;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_content_reaction_notice;
GRANT SELECT(id,creator_id,fan_id,version,withdrawn_at) ON creator.content_reply TO creator_content_reaction_notice;
GRANT SELECT(reply_id,creator_id) ON creator.content_reaction TO creator_content_reaction_notice;
GRANT SELECT(reply_id,creator_id,reply_version,state,withdrawn_at) ON creator.content_reply_review TO creator_content_reaction_notice;
SET LOCAL ROLE creator_owner;
-- The request policy calls request-only helpers. Its actual consumer is the
-- runtime role (also narrowed this way by 0069_w8_reply_review.sql).
ALTER POLICY reply_read ON creator.content_reply TO creator_runtime;
ALTER POLICY review_read ON creator.content_reply_review TO creator_runtime;
CREATE POLICY reaction_notice_reply ON creator.content_reply FOR SELECT TO creator_content_reaction_notice
 USING(id=nullif(current_setting('content.reaction_reply_id',true),'')::uuid
  AND creator_id=nullif(current_setting('content.reaction_creator_id',true),'')::uuid
  AND EXISTS(SELECT FROM creator.fan_profile f WHERE f.id=fan_id
   AND f.account_id=nullif(current_setting('content.reaction_account_id',true),'')::uuid));
-- Even if another permissive policy is added, this purpose role stays bounded.
CREATE POLICY reaction_notice_reply_bound ON creator.content_reply AS RESTRICTIVE FOR SELECT TO creator_content_reaction_notice
 USING(id=nullif(current_setting('content.reaction_reply_id',true),'')::uuid
  AND creator_id=nullif(current_setting('content.reaction_creator_id',true),'')::uuid
  AND EXISTS(SELECT FROM creator.fan_profile f WHERE f.id=fan_id
   AND f.account_id=nullif(current_setting('content.reaction_account_id',true),'')::uuid));
CREATE POLICY reaction_notice_reaction_bound ON creator.content_reaction AS RESTRICTIVE FOR SELECT TO creator_content_reaction_notice
 USING(reply_id=nullif(current_setting('content.reaction_reply_id',true),'')::uuid
  AND creator_id=nullif(current_setting('content.reaction_creator_id',true),'')::uuid);
CREATE POLICY reaction_notice_review ON creator.content_reply_review FOR SELECT TO creator_content_reaction_notice
 USING(reply_id=nullif(current_setting('content.reaction_reply_id',true),'')::uuid
  AND creator_id=nullif(current_setting('content.reaction_creator_id',true),'')::uuid);
CREATE POLICY reaction_notice_review_bound ON creator.content_reply_review AS RESTRICTIVE FOR SELECT TO creator_content_reaction_notice
 USING(reply_id=nullif(current_setting('content.reaction_reply_id',true),'')::uuid
  AND creator_id=nullif(current_setting('content.reaction_creator_id',true),'')::uuid);
CREATE FUNCTION creator.content_reaction_available(c uuid,reply uuid,account uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
 SET row_security=on AS $$
DECLARE result boolean; prior_c text; prior_r text; prior_a text;
BEGIN
 -- This is an internal negative check, not fan custody or a public API. The
 -- content owner's pool is the original creator_runtime login, never an Actor
 -- manufactured for a worker. No role membership is granted to this reader.
 IF session_user<>'creator_runtime' OR c IS NULL OR reply IS NULL OR account IS NULL THEN
  RETURN false;
 END IF;
 prior_c:=current_setting('content.reaction_creator_id',true);
 prior_r:=current_setting('content.reaction_reply_id',true);
 prior_a:=current_setting('content.reaction_account_id',true);
 PERFORM set_config('content.reaction_creator_id',c::text,true);
 PERFORM set_config('content.reaction_reply_id',reply::text,true);
 PERFORM set_config('content.reaction_account_id',account::text,true);
 SELECT EXISTS(SELECT FROM creator.content_reply r
  JOIN creator.content_reaction re ON re.reply_id=r.id AND re.creator_id=r.creator_id
  JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.creator_id=r.creator_id
   AND m.reply_version=r.version AND m.state='allowed' AND m.withdrawn_at IS NULL
  JOIN creator.fan_profile f ON f.id=r.fan_id
  WHERE r.id=reply AND r.creator_id=c AND f.account_id=account AND r.withdrawn_at IS NULL)
 INTO result;
 PERFORM set_config('content.reaction_creator_id',coalesce(prior_c,''),true);
 PERFORM set_config('content.reaction_reply_id',coalesce(prior_r,''),true);
 PERFORM set_config('content.reaction_account_id',coalesce(prior_a,''),true);
 RETURN result;
 -- An error propagates and rolls back the transaction/subtransaction, including
 -- these transaction-local settings; a successful read restores them above.
END $$;
RESET ROLE;
ALTER FUNCTION creator.content_reaction_available(uuid,uuid,uuid) OWNER TO creator_content_reaction_notice;
REVOKE ALL ON FUNCTION creator.content_reaction_available(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.content_reaction_available(uuid,uuid,uuid) TO creator_runtime;
COMMIT;
