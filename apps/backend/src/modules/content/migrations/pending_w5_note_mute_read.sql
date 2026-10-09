-- Additive W5 proposal (lane 5, WP 5.2). W8 must allocate and register this
-- unchanged source before it is applied. Existing canonical/applied SQL remains
-- immutable. Requires the content tables (0005).
--
-- Why: a fan can mute a creator's Notes. That choice is private to the fan
-- (creator.content_preference is readable only by that fan), so the creator's own
-- session, which fans a new Note out to her members, cannot see it, and a muted
-- member would still be pushed. This function answers exactly one question for
-- exactly one caller: "of these accounts, which muted MY Notes?". The caller must
-- be the verified creator who owns creator c; anyone else gets NULL. It returns
-- only accounts the caller supplied, at most 500 at a time, and nothing else.
-- It is used to drop recipients, never to show anyone who muted.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_content_mute') THEN
  CREATE ROLE creator_content_mute NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_content_mute' AND
   (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe content mute metadata role';
 END IF;
END $$;
GRANT USAGE ON SCHEMA creator TO creator_content_mute;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_content_mute;
GRANT SELECT(creator_id,account_id,muted) ON creator.content_preference TO creator_content_mute;
SET LOCAL ROLE creator_owner;
-- Only the creator the function has just proven the caller owns.
CREATE POLICY note_mute_read ON creator.content_preference FOR SELECT TO creator_content_mute
 USING(creator_id=nullif(current_setting('content.mute_creator_id',true),'')::uuid);
CREATE FUNCTION creator.content_note_muters(c uuid,accounts uuid[])
RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; prior text; result uuid[];
BEGIN
 IF c IS NULL OR accounts IS NULL OR cardinality(accounts)>500 OR array_position(accounts,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Invalid Note mute projection';
 END IF;
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 IF caller IS NULL OR NOT EXISTS(SELECT FROM creator.creator_profile p
   WHERE p.id=c AND p.account_id=caller AND p.verification='verified' AND NOT p.recovery_required) THEN
  RETURN NULL;
 END IF;
 prior := current_setting('content.mute_creator_id',true);
 PERFORM set_config('content.mute_creator_id',c::text,true);
 SELECT coalesce(array_agg(m.account_id ORDER BY m.account_id),ARRAY[]::uuid[]) INTO result
  FROM creator.content_preference m
  WHERE m.creator_id=c AND m.muted AND m.account_id=ANY(accounts);
 PERFORM set_config('content.mute_creator_id',coalesce(prior,''),true);
 RETURN result;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $$;
RESET ROLE;
ALTER FUNCTION creator.content_note_muters(uuid,uuid[]) OWNER TO creator_content_mute;
REVOKE ALL ON FUNCTION creator.content_note_muters(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.content_note_muters(uuid,uuid[]) TO creator_runtime;
COMMIT;
