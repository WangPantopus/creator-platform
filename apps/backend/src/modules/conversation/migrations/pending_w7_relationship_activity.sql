-- Additive canonical W3 metadata proposal written by W7 for Home integration.
-- UNALLOCATED / UNREGISTERED / UNAPPLIED. W8 owns registry and rollout review.
-- Run only through the migration administrator after immutable source review.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.conversation_relationship ADD COLUMN activity_at timestamptz;
-- Only the timestamp can be updated. Pair identifiers are routing metadata,
-- never participant authority. W1 sets app.identity_session_id only after its
-- successful held current-session check. Unissued background workers are denied.
CREATE FUNCTION creator.relationship_activity_actor(creator_id uuid,fan_id uuid,fan_account_id uuid)
 RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT creator_id=nullif(current_setting('app.creator_id',true),'')::uuid
  AND fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
  AND fan_account_id=(SELECT f.account_id FROM creator.fan_profile f WHERE f.id=fan_id)
  AND EXISTS(SELECT 1 FROM creator.identity_session s
   WHERE s.id=nullif(current_setting('app.identity_session_id',true),'')::uuid
   AND s.account_id=nullif(current_setting('app.account_id',true),'')::uuid
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())
  AND (fan_account_id=nullif(current_setting('app.account_id',true),'')::uuid
   OR EXISTS(SELECT 1 FROM creator.creator_profile c WHERE c.id=creator_id
    AND c.verification='verified' AND NOT c.recovery_required
    AND (c.account_id=nullif(current_setting('app.account_id',true),'')::uuid
     OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=c.id
      AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid
      AND tm.revoked_at IS NULL AND 'triage'=ANY(tm.roles)))))
$$;
REVOKE ALL ON FUNCTION creator.relationship_activity_actor(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.relationship_activity_actor(uuid,uuid,uuid) TO creator_runtime;
CREATE POLICY relationship_pair_metadata ON creator.conversation_relationship
 FOR SELECT TO creator_runtime
 USING (creator.relationship_activity_actor(creator_id,fan_id,account_id));
CREATE POLICY relationship_activity_write ON creator.conversation_relationship
 FOR UPDATE TO creator_runtime
 USING (creator.relationship_activity_actor(creator_id,fan_id,account_id))
 WITH CHECK (creator.relationship_activity_actor(creator_id,fan_id,account_id));
-- The pre-existing permissive account_scope also applies to UPDATE. This
-- restriction prevents it from admitting a fan or worker without the new proof.
CREATE POLICY relationship_activity_session ON creator.conversation_relationship
 AS RESTRICTIVE FOR UPDATE TO creator_runtime
 USING (creator.relationship_activity_actor(creator_id,fan_id,account_id))
 WITH CHECK (creator.relationship_activity_actor(creator_id,fan_id,account_id));
GRANT UPDATE(activity_at) ON creator.conversation_relationship TO creator_runtime;
CREATE FUNCTION creator.record_relationship_activity() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
 BEGIN
  IF NEW.delivery_state='delivered' AND
    (TG_OP='INSERT' OR OLD.delivery_state IS DISTINCT FROM NEW.delivery_state) THEN
   UPDATE creator.conversation_relationship
    SET activity_at=greatest(activity_at,clock_timestamp())
    WHERE thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id
    AND account_id=(SELECT account_id FROM creator.fan_profile WHERE id=NEW.fan_id);
  END IF;
  RETURN NEW;
 END;
$$;
REVOKE ALL ON FUNCTION creator.record_relationship_activity() FROM PUBLIC;
CREATE TRIGGER record_relationship_activity
 AFTER INSERT OR UPDATE OF delivery_state ON creator.message
 FOR EACH ROW EXECUTE FUNCTION creator.record_relationship_activity();
CREATE INDEX conversation_relationship_activity_page
 ON creator.conversation_relationship(account_id,fan_id,activity_at DESC,thread_id DESC);
-- Administrator backfill uses actual persisted message creation/notice times.
-- Those historical timestamps are not a claim about provider delivery latency.
-- Runtime never obtains owner/BYPASSRLS rights or cross-family message reads.
RESET ROLE;
UPDATE creator.conversation_relationship r SET activity_at=greatest(
 t.privacy_notice_at,
 coalesce((SELECT max(m.created_at) FROM creator.message m
  WHERE m.thread_id=t.id AND m.creator_id=t.creator_id AND m.fan_id=t.fan_id
  AND m.delivery_state='delivered'),t.privacy_notice_at)
) FROM creator.thread t WHERE t.id=r.thread_id AND t.creator_id=r.creator_id AND t.fan_id=r.fan_id;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.conversation_relationship ALTER COLUMN activity_at SET NOT NULL,
 ALTER COLUMN activity_at SET DEFAULT clock_timestamp();
COMMIT;
