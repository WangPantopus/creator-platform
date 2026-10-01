-- W3 narrow additive unallocated/unapplied proposal. W1 reviews the signing
-- predicate; W8 allocates/registers after pending_w3_message_lineage.sql.
-- Existing thread/text signing is preserved exactly in the final branch.
BEGIN;
SET LOCAL ROLE creator_owner;

ALTER TABLE creator.message
 ADD CONSTRAINT message_correction_version_identity UNIQUE(id,thread_id,creator_id,fan_id,version),
 DROP CONSTRAINT message_correction_family,
 ADD CONSTRAINT message_correction_exact_version_family
  FOREIGN KEY(corrects_message_id,thread_id,creator_id,fan_id,corrects_message_version)
  REFERENCES creator.message(id,thread_id,creator_id,fan_id,version);
CREATE UNIQUE INDEX message_correction_signed_act ON creator.message(signed_act_id)
 WHERE corrects_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION creator.require_signed_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 signing creator.signed_act;
 owner_account uuid;
 original creator.message;
 exact_command jsonb;
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
  NEW.signed_command IS DISTINCT FROM OLD.signed_command
 ) THEN
  RAISE EXCEPTION 'A signed correction is immutable' USING ERRCODE='23514';
 END IF;

 IF NEW.signed_command IS NOT NULL OR NEW.corrects_message_id IS NOT NULL THEN
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
