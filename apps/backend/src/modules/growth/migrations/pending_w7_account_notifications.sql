-- W7 proposal only: W8 allocation/registry/order review is required before activation.
-- No slot above the founder-reserved 0044–0060 range is allocated by this file.
BEGIN;
SET LOCAL ROLE growth_owner;
ALTER TABLE growth.notification ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE growth.producer_relay ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE growth.producer_relay ADD COLUMN account_id uuid;
ALTER TABLE growth.notification ADD CONSTRAINT notification_account_scope CHECK (
  creator_id IS NOT NULL OR (type='spending_reminder' AND role='fan')
);
-- Retain historical creator-scoped rows. New account rows have one exact fan
-- recipient and no creator. No existing envelope, receipt or outcome is rewritten.
ALTER TABLE growth.producer_relay ADD CONSTRAINT producer_relay_account_scope CHECK ((
  (creator_id IS NOT NULL AND account_id IS NULL) OR
  (creator_id IS NULL AND account_id IS NOT NULL AND producer='commerce'
    AND envelope->>'schemaVersion'='2' AND envelope->>'type'='spending_reminder'
    AND envelope->'creatorId'='null'::jsonb
    AND lower(envelope->>'accountId')=account_id::text
    AND jsonb_typeof(envelope->'recipients')='array'
    AND jsonb_array_length(envelope->'recipients')=1
    AND lower(envelope->'recipients'->0->>'accountId')=account_id::text
    AND envelope->'recipients'->0->>'role'='fan')
) IS TRUE);
CREATE INDEX producer_relay_account ON growth.producer_relay(account_id,id) WHERE creator_id IS NULL;
CREATE FUNCTION growth.check_account_notification_recipient() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.creator_id IS NULL AND NOT EXISTS(
    SELECT FROM growth.event_inbox e WHERE e.id=NEW.event_id
      AND e.envelope->>'schemaVersion'='2' AND e.envelope->>'type'='spending_reminder'
      AND e.envelope->'creatorId'='null'::jsonb
      AND lower(e.envelope->>'accountId')=NEW.account_id::text
      AND jsonb_typeof(e.envelope->'recipients')='array'
      AND jsonb_array_length(e.envelope->'recipients')=1
      AND lower(e.envelope->'recipients'->0->>'accountId')=NEW.account_id::text
      AND e.envelope->'recipients'->0->>'role'='fan'
  ) THEN
    RAISE EXCEPTION 'account notification recipient unavailable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION growth.check_account_notification_recipient() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION growth.check_account_notification_recipient() TO growth_worker;
CREATE TRIGGER notification_account_recipient BEFORE INSERT OR UPDATE OF account_id,event_id,creator_id,role,type
ON growth.notification FOR EACH ROW EXECUTE FUNCTION growth.check_account_notification_recipient();
-- Existing forced account RLS on notifications and worker-only relay RLS stay
-- intact. No runtime grants, cross-owner reads or owner-purpose issuers are added.
COMMIT;
