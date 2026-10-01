-- New additive W4 proposal: W8 must allocate/register this file before activation.
-- Existing migration IDs/checksums and signed personal replies remain unchanged.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.creator_profile ADD COLUMN commerce_approval_epoch integer NOT NULL DEFAULT 0;
ALTER TABLE creator.creator_profile ADD COLUMN commerce_approval_changed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE creator.passkey_credential ADD COLUMN commerce_approval_epoch integer NOT NULL DEFAULT 0;
ALTER TABLE creator.passkey_credential ADD COLUMN commerce_approval_changed_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE creator.commerce_reply_draft (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),thread_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,
 source_message_id uuid NOT NULL,source_message_version integer NOT NULL CHECK(source_message_version>0),
 text text NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 8000),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id),
 FOREIGN KEY(source_message_id,thread_id) REFERENCES creator.message(id,thread_id),UNIQUE(id,thread_id,creator_id,fan_id)
);
CREATE TABLE creator.commerce_approval (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),draft_id uuid NOT NULL,draft_version integer NOT NULL CHECK(draft_version>0),
 thread_id uuid NOT NULL,creator_id uuid NOT NULL,fan_id uuid NOT NULL,approver_account_id uuid NOT NULL,
 role text NOT NULL DEFAULT 'creator' CHECK(role='creator'),signed_act_id uuid NOT NULL UNIQUE REFERENCES creator.signed_act(id),
 content_hash text NOT NULL,text text NOT NULL,command jsonb NOT NULL,approved_at timestamptz NOT NULL DEFAULT now(),
 creator_epoch integer NOT NULL,key_epoch integer NOT NULL,
 invalidated_at timestamptz,invalidated_reason text,delivered_message_id uuid REFERENCES creator.message(id),
 CHECK((invalidated_at IS NULL)=(invalidated_reason IS NULL)),
 FOREIGN KEY(draft_id,thread_id,creator_id,fan_id) REFERENCES creator.commerce_reply_draft(id,thread_id,creator_id,fan_id)
);
ALTER TABLE creator.message ADD COLUMN approval_id uuid REFERENCES creator.commerce_approval(id);
ALTER TABLE creator.commerce_reply_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_reply_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY draft_owner ON creator.commerce_reply_draft USING(
 EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=creator_id AND cp.account_id=nullif(current_setting('app.account_id',true),'')::uuid)
 OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=commerce_reply_draft.creator_id AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND tm.revoked_at IS NULL AND 'drafter'=ANY(tm.roles))
) WITH CHECK(
 EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=creator_id AND cp.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND cp.verification='verified' AND NOT cp.recovery_required)
 OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=commerce_reply_draft.creator_id AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND tm.revoked_at IS NULL AND 'drafter'=ANY(tm.roles))
);
CREATE POLICY approval_read ON creator.commerce_approval FOR SELECT USING(
 approver_account_id=nullif(current_setting('app.account_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=commerce_approval.creator_id AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND tm.revoked_at IS NULL AND 'drafter'=ANY(tm.roles))
);
CREATE POLICY approval_insert ON creator.commerce_approval FOR INSERT WITH CHECK(
 approver_account_id=nullif(current_setting('app.account_id',true),'')::uuid
 AND EXISTS(SELECT 1 FROM creator.creator_profile cp WHERE cp.id=creator_id AND cp.account_id=approver_account_id AND cp.verification='verified' AND NOT cp.recovery_required)
);
-- Drafters can only invalidate through the exact draft-edit trigger. They cannot
-- create a personal Approval, change its signed snapshot, or set delivery.
CREATE POLICY approval_update ON creator.commerce_approval FOR UPDATE USING(
 approver_account_id=nullif(current_setting('app.account_id',true),'')::uuid
 OR EXISTS(SELECT 1 FROM creator.team_membership tm WHERE tm.creator_id=commerce_approval.creator_id AND tm.account_id=nullif(current_setting('app.account_id',true),'')::uuid AND tm.revoked_at IS NULL AND 'drafter'=ANY(tm.roles))
);
GRANT SELECT,INSERT,UPDATE ON creator.commerce_reply_draft,creator.commerce_approval TO creator_runtime;
CREATE INDEX commerce_approval_current ON creator.commerce_approval(draft_id,draft_version,approved_at,id);
CREATE INDEX commerce_approval_creator_current ON creator.commerce_approval(creator_id) WHERE invalidated_at IS NULL AND delivered_message_id IS NULL;
CREATE FUNCTION creator.validate_draft_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM creator.message m WHERE m.id=NEW.source_message_id AND m.version=NEW.source_message_version
  AND m.thread_id=NEW.thread_id AND m.creator_id=NEW.creator_id AND m.fan_id=NEW.fan_id
  AND m.author_kind='ai' AND m.delivery_state IN('delivered','interrupted') AND m.text=NEW.text) OR NEW.version<>1 THEN
  RAISE EXCEPTION 'A reply draft starts from the exact durable AI message' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_draft_source BEFORE INSERT ON creator.commerce_reply_draft FOR EACH ROW EXECUTE FUNCTION creator.validate_draft_source();
CREATE FUNCTION creator.validate_personal_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d creator.commerce_reply_draft; exact_command jsonb; BEGIN
 SELECT * INTO d FROM creator.commerce_reply_draft WHERE id=NEW.draft_id AND thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id FOR SHARE;
 exact_command=jsonb_build_object('actType','approved_draft','subjectId',NEW.thread_id::text,'content',jsonb_build_object('text',d.text,'approval',jsonb_build_object('draftId',d.id::text,'draftVersion',d.version,'sourceMessageId',d.source_message_id::text,'sourceMessageVersion',d.source_message_version)));
 IF d.id IS NULL OR d.version<>NEW.draft_version OR d.text IS DISTINCT FROM NEW.text OR NEW.command IS DISTINCT FROM exact_command
  OR NEW.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(exact_command),'sha256'),'hex')
  OR NEW.invalidated_at IS NOT NULL OR NEW.delivered_message_id IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM creator.signed_act sa JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
   JOIN creator.creator_profile cp ON cp.id=sa.creator_id AND cp.account_id=sa.account_id
   JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=sa.account_id
   WHERE sa.id=NEW.signed_act_id AND sa.creator_id=NEW.creator_id AND sa.account_id=NEW.approver_account_id
   AND sa.act_type='approved_draft' AND sa.subject_id=NEW.thread_id AND sa.content_hash=NEW.content_hash
   AND NEW.creator_epoch=cp.commerce_approval_epoch AND NEW.key_epoch=pc.commerce_approval_epoch
   AND sa.verified_at>now()-interval '5 minutes' AND cp.verification='verified' AND NOT cp.recovery_required AND pc.revoked_at IS NULL) THEN
  RAISE EXCEPTION 'Approval requires the exact current draft and personal signed assertion' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_personal_approval BEFORE INSERT ON creator.commerce_approval FOR EACH ROW EXECUTE FUNCTION creator.validate_personal_approval();
CREATE FUNCTION creator.invalidate_draft_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.source_message_id,NEW.source_message_version,NEW.thread_id,NEW.creator_id,NEW.fan_id) IS DISTINCT FROM (OLD.source_message_id,OLD.source_message_version,OLD.thread_id,OLD.creator_id,OLD.fan_id) OR NEW.version<>OLD.version+1 THEN
  RAISE EXCEPTION 'Draft provenance is immutable and every edit advances its version' USING ERRCODE='23514';
 END IF;
 UPDATE creator.commerce_approval SET invalidated_at=coalesce(invalidated_at,now()),invalidated_reason=coalesce(invalidated_reason,'draft_edited') WHERE draft_id=OLD.id AND delivered_message_id IS NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_draft_approval BEFORE UPDATE ON creator.commerce_reply_draft FOR EACH ROW EXECUTE FUNCTION creator.invalidate_draft_approval();
CREATE FUNCTION creator.freeze_approval_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.draft_id,NEW.draft_version,NEW.thread_id,NEW.creator_id,NEW.fan_id,NEW.approver_account_id,NEW.role,NEW.signed_act_id,NEW.content_hash,NEW.text,NEW.command,NEW.approved_at,NEW.creator_epoch,NEW.key_epoch) IS DISTINCT FROM (OLD.draft_id,OLD.draft_version,OLD.thread_id,OLD.creator_id,OLD.fan_id,OLD.approver_account_id,OLD.role,OLD.signed_act_id,OLD.content_hash,OLD.text,OLD.command,OLD.approved_at,OLD.creator_epoch,OLD.key_epoch)
 OR (OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at)
 OR (OLD.invalidated_reason IS NOT NULL AND NEW.invalidated_reason IS DISTINCT FROM OLD.invalidated_reason)
 OR (OLD.delivered_message_id IS NOT NULL AND NEW.delivered_message_id IS DISTINCT FROM OLD.delivered_message_id)
 OR (NEW.delivered_message_id IS DISTINCT FROM OLD.delivered_message_id AND NEW.approver_account_id IS DISTINCT FROM nullif(current_setting('app.account_id',true),'')::uuid) THEN
  RAISE EXCEPTION 'Personal approval history cannot be rewritten' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_approval_snapshot BEFORE UPDATE ON creator.commerce_approval FOR EACH ROW EXECUTE FUNCTION creator.freeze_approval_snapshot();
CREATE FUNCTION creator.invalidate_creator_approvals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.verification,NEW.recovery_required,NEW.account_id) IS DISTINCT FROM (OLD.verification,OLD.recovery_required,OLD.account_id) THEN
  NEW.commerce_approval_epoch=OLD.commerce_approval_epoch+1;
  NEW.commerce_approval_changed_at=now();
 ELSIF (NEW.commerce_approval_epoch,NEW.commerce_approval_changed_at) IS DISTINCT FROM (OLD.commerce_approval_epoch,OLD.commerce_approval_changed_at) THEN
  RAISE EXCEPTION 'Approval authority history cannot be rewritten' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_creator_approvals BEFORE UPDATE ON creator.creator_profile FOR EACH ROW EXECUTE FUNCTION creator.invalidate_creator_approvals();
CREATE FUNCTION creator.invalidate_key_approvals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
  NEW.commerce_approval_epoch=OLD.commerce_approval_epoch+1;
  NEW.commerce_approval_changed_at=now();
 ELSIF (NEW.commerce_approval_epoch,NEW.commerce_approval_changed_at) IS DISTINCT FROM (OLD.commerce_approval_epoch,OLD.commerce_approval_changed_at) THEN
  RAISE EXCEPTION 'Approval key history cannot be rewritten' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_key_approvals BEFORE UPDATE ON creator.passkey_credential FOR EACH ROW EXECUTE FUNCTION creator.invalidate_key_approvals();
CREATE OR REPLACE FUNCTION creator.require_signed_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE signing creator.signed_act; owner_account uuid; approval creator.commerce_approval; exact_content jsonb; BEGIN
 IF NEW.author_kind IN ('human_creator','approved_draft','human_broadcast','human_reaction') THEN
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id;
  SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
  exact_content=jsonb_build_object('text',NEW.text);
  IF NEW.author_kind='approved_draft' THEN
   SELECT a.* INTO approval FROM creator.commerce_approval a JOIN creator.commerce_reply_draft d ON d.id=a.draft_id AND d.version=a.draft_version
    JOIN creator.creator_profile cp ON cp.id=a.creator_id AND cp.account_id=a.approver_account_id
    JOIN creator.passkey_credential pc ON pc.id=signing.credential_id AND pc.account_id=owner_account
    WHERE a.id=NEW.approval_id AND a.thread_id=NEW.thread_id AND a.creator_id=NEW.creator_id AND a.fan_id=NEW.fan_id
    AND a.invalidated_at IS NULL AND a.approver_account_id=owner_account AND a.signed_act_id=NEW.signed_act_id
    AND a.text=NEW.text AND d.text=NEW.text AND a.command->'content'->>'text'=NEW.text
    AND a.creator_epoch=cp.commerce_approval_epoch AND a.key_epoch=pc.commerce_approval_epoch
    AND a.content_hash=NEW.signed_content_hash AND cp.verification='verified' AND NOT cp.recovery_required AND pc.revoked_at IS NULL;
   IF approval.id IS NULL OR NEW.version<>1 OR (approval.delivered_message_id IS NOT NULL AND approval.delivered_message_id<>NEW.id) THEN
    RAISE EXCEPTION 'Approved draft requires a current exact-version personal Approval' USING ERRCODE='23514';
   END IF;
   exact_content=approval.command->'content';
  END IF;
  IF signing.id IS NULL OR signing.account_id IS DISTINCT FROM owner_account OR NEW.author_account_id IS DISTINCT FROM owner_account
   OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR signing.subject_id IS DISTINCT FROM NEW.thread_id
   OR signing.content_hash IS DISTINCT FROM NEW.signed_content_hash
   OR signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(jsonb_build_object('actType',signing.act_type,'subjectId',NEW.thread_id::text,'content',exact_content)), 'sha256'), 'hex')
   OR signing.act_type IS DISTINCT FROM (CASE NEW.author_kind WHEN 'human_creator' THEN 'reply' WHEN 'human_broadcast' THEN 'broadcast' WHEN 'human_reaction' THEN 'reaction' ELSE 'approved_draft' END) THEN
   RAISE EXCEPTION 'A named act requires an exact creator-signed assertion' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
