-- W8 additive composed-signing proposal, reserved0060 and unapplied.
-- Source custody:0044 W4 personal Approval2dd53ad/4480936e and
-- 0059 W3 recording associationc9c1f43/e8ba9219 (includes0056/0058).
-- Apply only after reviewed0044/0056/0058/0059 in a traffic-closed rollout.
-- Original files/SQL/checksums, RLS/grants and canonical identity stay intact.
-- Exact0044 Approval SELECT/hash predicates are copied without relaxation;
-- current W3 AI/correction/recording/legacy predicates remain present.
-- No signer, purpose-worker authority, approval/retention or provider is issued.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE OR REPLACE FUNCTION creator.require_signed_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 signing creator.signed_act;
 owner_account uuid;
 original creator.message;
 exact_command jsonb;
 recording creator.media_asset;
 exact_evidence jsonb;
 current_key uuid;
 current_publication jsonb;
 approval creator.commerce_approval;
 exact_content jsonb;
BEGIN
 -- Delivered AI originals retain their exact text/version/lineage. Privacy
 -- may delete the row; memory flags and off-record state remain independent.
 IF TG_OP='UPDATE' AND OLD.author_kind='ai' AND OLD.delivery_state IN('delivered','interrupted') AND (
  NEW.id IS DISTINCT FROM OLD.id OR NEW.thread_id IS DISTINCT FROM OLD.thread_id OR
  NEW.creator_id IS DISTINCT FROM OLD.creator_id OR NEW.fan_id IS DISTINCT FROM OLD.fan_id OR
  NEW.author_kind IS DISTINCT FROM OLD.author_kind OR NEW.author_account_id IS DISTINCT FROM OLD.author_account_id OR
  NEW.delivery_state IS DISTINCT FROM OLD.delivery_state OR NEW.sequence IS DISTINCT FROM OLD.sequence OR
  NEW.control_epoch IS DISTINCT FROM OLD.control_epoch OR NEW.citations IS DISTINCT FROM OLD.citations OR
  NEW.signed_act_id IS DISTINCT FROM OLD.signed_act_id OR NEW.signed_content_hash IS DISTINCT FROM OLD.signed_content_hash OR
  NEW.signed_command IS DISTINCT FROM OLD.signed_command OR
  NEW.approval_id IS DISTINCT FROM OLD.approval_id OR
  NEW.recording_asset_id IS DISTINCT FROM OLD.recording_asset_id OR
  NEW.recording_evidence IS DISTINCT FROM OLD.recording_evidence OR
  NEW.text IS DISTINCT FROM OLD.text OR NEW.version IS DISTINCT FROM OLD.version OR
  NEW.agent_version_id IS DISTINCT FROM OLD.agent_version_id OR NEW.agent_version_hash IS DISTINCT FROM OLD.agent_version_hash
 ) THEN
  RAISE EXCEPTION 'A delivered AI original is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND OLD.corrects_message_id IS NOT NULL AND (
  NEW.id IS DISTINCT FROM OLD.id OR NEW.thread_id IS DISTINCT FROM OLD.thread_id OR
  NEW.creator_id IS DISTINCT FROM OLD.creator_id OR NEW.fan_id IS DISTINCT FROM OLD.fan_id OR
  NEW.author_kind IS DISTINCT FROM OLD.author_kind OR NEW.author_account_id IS DISTINCT FROM OLD.author_account_id OR
  NEW.delivery_state IS DISTINCT FROM OLD.delivery_state OR NEW.sequence IS DISTINCT FROM OLD.sequence OR
  NEW.control_epoch IS DISTINCT FROM OLD.control_epoch OR NEW.citations IS DISTINCT FROM OLD.citations OR
  NEW.text IS DISTINCT FROM OLD.text OR NEW.version IS DISTINCT FROM OLD.version OR
  NEW.corrects_message_id IS DISTINCT FROM OLD.corrects_message_id OR NEW.corrects_message_version IS DISTINCT FROM OLD.corrects_message_version OR
  NEW.signed_act_id IS DISTINCT FROM OLD.signed_act_id OR NEW.signed_content_hash IS DISTINCT FROM OLD.signed_content_hash OR
  NEW.signed_command IS DISTINCT FROM OLD.signed_command OR
  NEW.approval_id IS DISTINCT FROM OLD.approval_id OR
  NEW.recording_asset_id IS DISTINCT FROM OLD.recording_asset_id OR
  NEW.recording_evidence IS DISTINCT FROM OLD.recording_evidence
 ) THEN
  RAISE EXCEPTION 'A signed correction is immutable' USING ERRCODE='23514';
 END IF;

 IF TG_OP='UPDATE' AND OLD.recording_asset_id IS NOT NULL AND (
  NEW.id IS DISTINCT FROM OLD.id OR NEW.thread_id IS DISTINCT FROM OLD.thread_id OR
  NEW.creator_id IS DISTINCT FROM OLD.creator_id OR NEW.fan_id IS DISTINCT FROM OLD.fan_id OR
  NEW.author_kind IS DISTINCT FROM OLD.author_kind OR NEW.author_account_id IS DISTINCT FROM OLD.author_account_id OR
  NEW.delivery_state IS DISTINCT FROM OLD.delivery_state OR NEW.sequence IS DISTINCT FROM OLD.sequence OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
  NEW.control_epoch IS DISTINCT FROM OLD.control_epoch OR NEW.citations IS DISTINCT FROM OLD.citations OR
  NEW.text IS DISTINCT FROM OLD.text OR NEW.version IS DISTINCT FROM OLD.version OR
  NEW.agent_version_id IS DISTINCT FROM OLD.agent_version_id OR NEW.agent_version_hash IS DISTINCT FROM OLD.agent_version_hash OR
  NEW.corrects_message_id IS DISTINCT FROM OLD.corrects_message_id OR NEW.corrects_message_version IS DISTINCT FROM OLD.corrects_message_version OR
  NEW.signed_act_id IS DISTINCT FROM OLD.signed_act_id OR NEW.signed_content_hash IS DISTINCT FROM OLD.signed_content_hash OR
  NEW.signed_command IS DISTINCT FROM OLD.signed_command OR
  NEW.approval_id IS DISTINCT FROM OLD.approval_id OR
  NEW.recording_asset_id IS DISTINCT FROM OLD.recording_asset_id OR NEW.recording_evidence IS DISTINCT FROM OLD.recording_evidence
 ) THEN
  RAISE EXCEPTION 'A signed recording association is immutable' USING ERRCODE='23514';
 END IF;

 -- Consume every approved_draft through0044's exact personal Approval.
 -- The correction/recording signed_command column is not a generic named-act
 -- fallback: retain its existing rejection for an approved draft attachment.
 IF NEW.author_kind='approved_draft' THEN
  IF NEW.corrects_message_id IS NOT NULL OR NEW.corrects_message_version IS NOT NULL OR
   NEW.signed_command IS NOT NULL OR NEW.recording_asset_id IS NOT NULL OR NEW.recording_evidence IS NOT NULL THEN
   RAISE EXCEPTION 'A personal Approval cannot be a correction or recording association' USING ERRCODE='23514';
  END IF;
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id;
  SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
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
  IF signing.id IS NULL OR signing.account_id IS DISTINCT FROM owner_account OR NEW.author_account_id IS DISTINCT FROM owner_account
   OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR signing.subject_id IS DISTINCT FROM NEW.thread_id
   OR signing.content_hash IS DISTINCT FROM NEW.signed_content_hash
   OR signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(jsonb_build_object('actType',signing.act_type,'subjectId',NEW.thread_id::text,'content',exact_content)), 'sha256'), 'hex')
   OR signing.act_type IS DISTINCT FROM (CASE NEW.author_kind WHEN 'human_creator' THEN 'reply' WHEN 'human_broadcast' THEN 'broadcast' WHEN 'human_reaction' THEN 'reaction' ELSE 'approved_draft' END) THEN
   RAISE EXCEPTION 'A named act requires an exact creator-signed assertion' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;

 -- Only a new row may acquire the association. Immutable recording updates
 -- can change independent memory/privacy flags even after media expiry/revocation;
 -- every media read still requires current W6/W1 purpose authority.
 IF TG_OP='UPDATE' AND OLD.recording_asset_id IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.recording_asset_id IS NOT NULL OR NEW.recording_evidence IS NOT NULL) THEN
  RAISE EXCEPTION 'A recording association requires a new delivered message' USING ERRCODE='23514';
 END IF;
 IF NEW.recording_asset_id IS NOT NULL OR NEW.recording_evidence IS NOT NULL THEN
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id
   AND verification='verified' AND NOT recovery_required FOR SHARE;
  SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
  SELECT pc.id INTO current_key FROM creator.passkey_credential pc
   WHERE pc.id=signing.credential_id AND pc.account_id=owner_account AND pc.revoked_at IS NULL FOR SHARE;
  SELECT publication.command INTO current_publication FROM creator.signed_act_consumption consumed
   JOIN creator.signed_publication publication ON publication.signed_act_id=consumed.signed_act_id
   WHERE consumed.signed_act_id=signing.id AND consumed.account_id=owner_account AND
    publication.account_id=owner_account AND publication.withdrawn_at IS NULL FOR SHARE OF publication;
  SELECT * INTO recording FROM creator.media_asset
   WHERE id=NEW.recording_asset_id AND thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id
   FOR SHARE;
  exact_evidence := jsonb_build_object('assetId',recording.id::text,'version',recording.version,
   'sha256',recording.output_sha256,'mimeType',recording.mime_type,'durationMs',recording.duration_ms,'bytes',recording.bytes);
  exact_command := jsonb_build_object('actType','reply','subjectId',NEW.thread_id::text,
   'content',jsonb_build_object('mediaAssetId',recording.id::text,'version',recording.version,
    'sha256',recording.output_sha256,'mimeType',recording.mime_type,'durationMs',recording.duration_ms,'bytes',recording.bytes));
  IF NEW.author_kind IS DISTINCT FROM 'human_creator' OR NEW.text IS DISTINCT FROM '' OR
   NEW.delivery_state IS DISTINCT FROM 'delivered' OR NEW.author_account_id IS DISTINCT FROM owner_account OR
   NEW.agent_version_id IS NOT NULL OR NEW.agent_version_hash IS NOT NULL OR cardinality(NEW.citations)<>0 OR
   NEW.corrects_message_id IS NOT NULL OR NEW.corrects_message_version IS NOT NULL OR
   recording.id IS NULL OR recording.owner_account_id IS DISTINCT FROM owner_account OR
   recording.purpose IS DISTINCT FROM 'human_reply' OR recording.state IS DISTINCT FROM 'ready' OR
   recording.expires_at<=now() OR recording.mime_type IS DISTINCT FROM 'audio/mp4' OR
   recording.duration_ms IS NULL OR recording.duration_ms<=0 OR recording.output_sha256 IS NULL OR
   recording.signed_act_id IS DISTINCT FROM NEW.signed_act_id OR
   NEW.recording_evidence IS DISTINCT FROM exact_evidence OR NEW.signed_command IS DISTINCT FROM exact_command OR
   signing.id IS NULL OR signing.account_id IS DISTINCT FROM owner_account OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR
   signing.act_type IS DISTINCT FROM 'reply' OR signing.subject_id IS DISTINCT FROM NEW.thread_id OR
   signing.content_hash IS DISTINCT FROM NEW.signed_content_hash OR
   signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(exact_command),'sha256'),'hex') OR
   current_key IS NULL OR current_publication IS DISTINCT FROM exact_command OR
   recording.provenance->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR
   recording.provenance->>'kind' IS DISTINCT FROM 'human_recording' OR
   recording.provenance->'c2paVerified' IS DISTINCT FROM 'true'::jsonb OR
   recording.provenance->>'accountId' IS DISTINCT FROM owner_account::text OR
   recording.provenance->>'creatorId' IS DISTINCT FROM NEW.creator_id::text OR
   recording.provenance->>'fanId' IS DISTINCT FROM NEW.fan_id::text OR
   recording.provenance->>'threadId' IS DISTINCT FROM NEW.thread_id::text OR
   recording.provenance->>'purpose' IS DISTINCT FROM 'human_reply' OR
   recording.provenance->>'assetId' IS DISTINCT FROM recording.id::text OR
   recording.provenance->'assetVersion' IS DISTINCT FROM to_jsonb(recording.version) OR
   recording.provenance->>'signedActId' IS DISTINCT FROM NEW.signed_act_id::text OR
   recording.provenance->>'processedMediaSha256' IS DISTINCT FROM recording.output_sha256 OR
   recording.provenance->'processedMediaBytes' IS DISTINCT FROM to_jsonb(recording.bytes) OR
   recording.provenance->>'processedMediaMimeType' IS DISTINCT FROM recording.mime_type OR
   recording.provenance->'processedMediaDurationMs' IS DISTINCT FROM to_jsonb(recording.duration_ms) OR
   recording.provenance->>'transform' IS DISTINCT FROM 'aac_m4a' OR
   coalesce(recording.provenance->>'fileSha256','')!~'^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'A recording requires its exact ready same-family consumed creator-signed processed bytes' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.signed_command IS NOT NULL OR NEW.corrects_message_id IS NOT NULL THEN
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id;
  SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
  SELECT * INTO original FROM creator.message
   WHERE id=NEW.corrects_message_id AND thread_id=NEW.thread_id AND creator_id=NEW.creator_id AND fan_id=NEW.fan_id
   FOR SHARE;
  exact_command := jsonb_build_object(
   'actType','correction','subjectId',original.id::text,
   'content',jsonb_build_object('kind','conversation_correction','creatorId',NEW.creator_id::text,
    'threadId',NEW.thread_id::text,'fanId',NEW.fan_id::text,'messageVersion',original.version,'text',NEW.text)
  );
  IF NEW.author_kind IS DISTINCT FROM 'human_creator' OR
   NEW.author_account_id IS DISTINCT FROM owner_account OR signing.id IS NULL OR
   signing.account_id IS DISTINCT FROM owner_account OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR
   signing.act_type IS DISTINCT FROM 'correction' OR signing.subject_id IS DISTINCT FROM original.id OR
   original.id IS NULL OR original.id=NEW.id OR original.author_kind IS DISTINCT FROM 'ai' OR
   original.delivery_state NOT IN('delivered','interrupted') OR NEW.corrects_message_version IS DISTINCT FROM original.version OR
   NEW.signed_command IS DISTINCT FROM exact_command OR signing.content_hash IS DISTINCT FROM NEW.signed_content_hash OR
   signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(exact_command),'sha256'),'hex') OR
   NOT EXISTS(
    SELECT 1 FROM creator.signed_act_consumption consumed
    JOIN creator.signed_publication publication ON publication.signed_act_id=consumed.signed_act_id
    WHERE consumed.signed_act_id=signing.id AND consumed.account_id=owner_account AND
     publication.account_id=owner_account AND publication.command=exact_command AND publication.withdrawn_at IS NULL
   ) THEN
   RAISE EXCEPTION 'A correction requires its exact consumed creator-signed original/version/command' USING ERRCODE='23514';
  END IF;
 -- Preserve foundation's original thread/text predicate for every other named
 -- act. No generic command fallback or publication-derived extra prose.
 ELSIF NEW.author_kind IN ('human_creator','approved_draft','human_broadcast','human_reaction') THEN
  SELECT account_id INTO owner_account FROM creator.creator_profile WHERE id=NEW.creator_id;
  SELECT * INTO signing FROM creator.signed_act WHERE id=NEW.signed_act_id;
  IF signing.id IS NULL OR signing.account_id IS DISTINCT FROM owner_account OR NEW.author_account_id IS DISTINCT FROM owner_account
   OR signing.creator_id IS DISTINCT FROM NEW.creator_id OR signing.subject_id IS DISTINCT FROM NEW.thread_id
   OR signing.content_hash IS DISTINCT FROM NEW.signed_content_hash
   OR signing.content_hash IS DISTINCT FROM encode(public.digest(creator.canonical_json(jsonb_build_object('actType',signing.act_type,'subjectId',NEW.thread_id::text,'content',jsonb_build_object('text',NEW.text))), 'sha256'), 'hex')
   OR signing.act_type IS DISTINCT FROM (CASE NEW.author_kind WHEN 'human_creator' THEN 'reply' WHEN 'human_broadcast' THEN 'broadcast' WHEN 'human_reaction' THEN 'reaction' ELSE 'approved_draft' END) THEN
   RAISE EXCEPTION 'A named act requires an exact creator-signed assertion' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
