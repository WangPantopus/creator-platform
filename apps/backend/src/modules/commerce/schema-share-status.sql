-- W4 domain proposal (lane 4): a share card's status, read with no session.
-- W8 assigns the migration ID/order before shared registration. Apply only to
-- an explicitly leased database, after the public packet read (0070) family.
--
-- Growth shows a share card to anyone who has its link, so it asks, with no
-- account, whether the card may still be shown. This answers only that: does
-- share grant G still share creator C's exact signed reply M, at version V,
-- signed by act S with hash H, with the fan's handle shown or not as it was,
-- and no correction: a creator's own signed reply cannot be corrected (lane 3
-- corrects AI originals only). It returns no account, fan, amount, request or
-- private field. The checks mirror lane 3's deliveredTextCommand (the exact
-- signed reply command) and lane 1's matchesThreadAct (the signature still
-- stands), on their own tables.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_share_read') THEN
  CREATE ROLE creator_commerce_share_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_share_read' AND
  (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
  RAISE EXCEPTION 'Unsafe share status role';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_commerce_share_read;
GRANT SELECT(id,commitment_id,creator_id,fan_id,fan_choice,creator_permission,handle_display,revoked_at) ON creator.commerce_share_grant TO creator_commerce_share_read;
GRANT SELECT(id,creator_id,fan_id,delivered_at,delivered_message_id) ON creator.commerce_commitment TO creator_commerce_share_read;
GRANT SELECT(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,version,signed_act_id,signed_content_hash,signed_command,corrects_message_id,recording_asset_id,approval_id) ON creator.message TO creator_commerce_share_read;
GRANT SELECT(id,account_id,creator_id,act_type,content_hash,key_revoked,creator_revoked,withdrawn) ON creator.signed_verification TO creator_commerce_share_read;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_commerce_share_read;
-- Existing invoker row-security helpers (commerce_scope) evaluate these columns.
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_commerce_share_read;

-- Rows are visible to this role only for the one grant the function is asked
-- about. The setting alone grants nothing: only the function sets it, and it
-- restores it before returning.
CREATE POLICY share_status ON creator.commerce_share_grant FOR SELECT TO creator_commerce_share_read
 USING(id=nullif(current_setting('app.w4_share_grant',true),'')::uuid);
CREATE POLICY share_status ON creator.commerce_commitment FOR SELECT TO creator_commerce_share_read
 USING(EXISTS(SELECT 1 FROM creator.commerce_share_grant g
  WHERE g.id=nullif(current_setting('app.w4_share_grant',true),'')::uuid AND g.commitment_id=commerce_commitment.id));
CREATE POLICY share_status ON creator.message FOR SELECT TO creator_commerce_share_read
 USING(EXISTS(SELECT 1 FROM creator.commerce_share_grant g JOIN creator.commerce_commitment c ON c.id=g.commitment_id
  WHERE g.id=nullif(current_setting('app.w4_share_grant',true),'')::uuid AND c.creator_id=message.creator_id AND c.fan_id=message.fan_id
   AND c.delivered_message_id=message.id));

CREATE FUNCTION creator.commerce_share_status(g uuid,c uuid,m uuid,v integer,s uuid,h text,shown boolean)
RETURNS TABLE(valid boolean,correction text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_column
DECLARE old_grant text;
BEGIN
 old_grant=current_setting('app.w4_share_grant',true);
 PERFORM set_config('app.w4_share_grant',coalesce(g::text,''),true);
 -- A creator's own signed reply cannot be corrected (lane 3 corrects AI
 -- originals only), so a shared reply never has a correction.
 RETURN QUERY
 SELECT true,NULL::text
 FROM creator.commerce_share_grant granted
 JOIN creator.commerce_commitment commitment ON commitment.id=granted.commitment_id
  AND commitment.creator_id=granted.creator_id AND commitment.fan_id=granted.fan_id
 JOIN creator.message reply ON reply.id=commitment.delivered_message_id
  AND reply.creator_id=granted.creator_id AND reply.fan_id=granted.fan_id
 JOIN creator.creator_profile profile ON profile.id=granted.creator_id
 JOIN creator.signed_verification signature ON signature.id=reply.signed_act_id
  AND signature.creator_id=profile.id AND signature.account_id=profile.account_id
  AND signature.act_type='reply' AND signature.content_hash=reply.signed_content_hash
 WHERE granted.id=g AND granted.creator_id=c
  AND granted.fan_choice AND granted.creator_permission AND granted.revoked_at IS NULL
  AND (granted.handle_display='handle')=shown
  AND commitment.delivered_at IS NOT NULL
  AND reply.id=m AND reply.version=v AND reply.signed_act_id=s AND reply.signed_content_hash=h
  AND reply.author_kind='human_creator' AND reply.author_account_id=profile.account_id
  AND reply.delivery_state='delivered' AND reply.corrects_message_id IS NULL
  AND reply.recording_asset_id IS NULL AND reply.approval_id IS NULL AND reply.signed_command IS NULL
  AND encode(public.digest(creator.canonical_json(jsonb_build_object('actType','reply','subjectId',reply.thread_id::text,
   'content',jsonb_build_object('text',reply.text))),'sha256'),'hex')=h
  AND NOT signature.withdrawn AND NOT signature.key_revoked AND NOT signature.creator_revoked
  AND profile.verification='verified' AND NOT profile.recovery_required;
 PERFORM set_config('app.w4_share_grant',coalesce(old_grant,''),true);
END $$;
RESET ROLE;
ALTER FUNCTION creator.commerce_share_status(uuid,uuid,uuid,integer,uuid,text,boolean) OWNER TO creator_commerce_share_read;
REVOKE ALL ON FUNCTION creator.commerce_share_status(uuid,uuid,uuid,integer,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_share_status(uuid,uuid,uuid,integer,uuid,text,boolean) TO creator_runtime;
COMMIT;
