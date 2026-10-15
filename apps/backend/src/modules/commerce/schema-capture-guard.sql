-- Additive lane 4 follow-up (WP 4.1, INV-16 in depth). Shared registry order is unassigned; the
-- integrator owns allocation. The database refuses a capture request for a request nobody
-- accepted. decide() is the only writer of a capture effect and writes it in the same transaction
-- that records the creator's consumed signed acceptance and moves the request to accepting; a
-- capture row written any other way (a bug, a bad replay, a hand edit, the runtime login acting
-- directly) used to reach the processor, which captures whatever intent the row names.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE FUNCTION creator.commerce_capture_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.operation<>'capture' THEN RETURN NEW; END IF;
 -- The executor claims, settles and fails captures; only a change of what is captured, or
 -- re-arming a finished capture, needs the acceptance again.
 IF TG_OP='UPDATE'
    AND ROW(NEW.operation,NEW.packet_id,NEW.creator_id,NEW.fan_id,NEW.provider_key,NEW.request)
        IS NOT DISTINCT FROM ROW(OLD.operation,OLD.packet_id,OLD.creator_id,OLD.fan_id,OLD.provider_key,OLD.request)
    AND NOT (OLD.state IN ('done','failed') AND NEW.state IN ('pending','processing','unknown')) THEN
  RETURN NEW;
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM creator.commerce_packet p
  JOIN creator.creator_profile cp ON cp.id=p.creator_id
  JOIN creator.signed_act sa ON sa.id=p.accepted_act_id AND sa.act_type='accept' AND sa.account_id=cp.account_id
   AND sa.creator_id=p.creator_id AND sa.subject_id=p.thread_id
  JOIN creator.signed_act_consumption c ON c.signed_act_id=sa.id AND c.account_id=sa.account_id
  WHERE p.id=NEW.packet_id AND p.creator_id=NEW.creator_id AND p.fan_id=NEW.fan_id
   AND p.state IN ('accepting','accepted')
   AND NEW.provider_key=p.id::text||':capture:'||p.authorization_attempt::text
   AND NEW.request->>'intentId' IS NOT DISTINCT FROM p.intent_ref
   AND NEW.request->>'amount'=p.snapshot->>'amount'
   AND NEW.request->>'currency'=p.snapshot->>'currency'
 ) THEN
  RAISE EXCEPTION 'A capture needs the creator''s consumed signed acceptance of this exact request'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_capture_guard BEFORE INSERT OR UPDATE ON creator.commerce_effect
 FOR EACH ROW EXECUTE FUNCTION creator.commerce_capture_guard();
COMMIT;
