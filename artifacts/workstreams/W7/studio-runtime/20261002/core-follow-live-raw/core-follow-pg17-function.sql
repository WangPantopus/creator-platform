CREATE OR REPLACE FUNCTION creator_growth_metadata.core_follow(s uuid, a uuid, c uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET row_security TO 'on'
AS $function$
DECLARE following boolean;
BEGIN
 IF session_user<>'creator_runtime' OR current_user<>'creator_growth_follow_metadata'
    OR current_setting('transaction_isolation')<>'read committed'
    OR pg_current_xact_id_if_assigned() IS NULL OR s IS NULL OR a IS NULL OR c IS NULL
    OR s IS DISTINCT FROM nullif(current_setting('app.identity_session_id',true),'')::uuid
    OR a IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid
    OR c IS DISTINCT FROM nullif(current_setting('app.creator_id',true),'')::uuid
 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT FROM creator.identity_session
    WHERE id=s AND account_id=a AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RETURN NULL; END IF;
 -- Exact primary-key pair, held to caller commit. Unfollow/account deletion
 -- waits on the same row. Never wait behind a writer after positive family locks.
 SELECT true INTO following FROM growth.follow
    WHERE account_id=a AND creator_id=c FOR SHARE NOWAIT;
 RETURN coalesce(following,false);
EXCEPTION WHEN lock_not_available OR invalid_text_representation THEN RETURN NULL;
END $function$
