-- W3 additive producer proposal. W8 allocates/registers the canonical version.
-- Depends on foundation, W2 ai_version and the immutable W3 conversation proposal.
-- No backfill infers an old reply's version, correction, media or fan usefulness.
BEGIN;
SET LOCAL ROLE creator_owner;

ALTER TABLE creator.message
 ADD COLUMN agent_version_id uuid,
 ADD COLUMN agent_version_hash text,
 ADD COLUMN corrects_message_id uuid,
 ADD COLUMN corrects_message_version integer,
 ADD COLUMN signed_command jsonb,
 ADD CONSTRAINT message_family_identity UNIQUE(id,thread_id,creator_id,fan_id),
 ADD CONSTRAINT message_feedback_identity UNIQUE(id,thread_id,creator_id,fan_id,version,agent_version_id,agent_version_hash),
 ADD CONSTRAINT message_agent_version_pair CHECK(
   (agent_version_id IS NULL AND agent_version_hash IS NULL) OR
   (agent_version_id IS NOT NULL AND agent_version_hash IS NOT NULL AND agent_version_hash ~ '^[0-9a-f]{64}$')
 ),
 ADD CONSTRAINT message_agent_version_family FOREIGN KEY(agent_version_id,creator_id)
   REFERENCES creator.ai_version(id,creator_id),
 ADD CONSTRAINT message_correction_pair CHECK(
   (corrects_message_id IS NULL AND corrects_message_version IS NULL) OR
   (corrects_message_id IS NOT NULL AND corrects_message_version IS NOT NULL AND corrects_message_version>0 AND
    corrects_message_id<>id AND author_kind='human_creator' AND signed_act_id IS NOT NULL)
 ),
 ADD CONSTRAINT message_correction_family FOREIGN KEY(corrects_message_id,thread_id,creator_id,fan_id)
   REFERENCES creator.message(id,thread_id,creator_id,fan_id),
 ADD CONSTRAINT message_signed_command_object CHECK(
   signed_command IS NULL OR
   (jsonb_typeof(signed_command)='object' AND signed_act_id IS NOT NULL)
 );

CREATE INDEX conversation_correction_target
 ON creator.message(thread_id,creator_id,fan_id,corrects_message_id,sequence)
 WHERE corrects_message_id IS NOT NULL;

-- Explicit fan action, one current response per exact immutable delivered reply.
-- This stores no prompt, transcript, sensitive memory or inferred satisfaction.
CREATE TABLE creator.conversation_feedback (
 thread_id uuid NOT NULL,
 creator_id uuid NOT NULL,
 fan_id uuid NOT NULL,
 message_id uuid NOT NULL,
 message_version integer NOT NULL CHECK(message_version>0),
 account_id uuid NOT NULL,
 rating text NOT NULL CHECK(rating IN ('helpful','not_helpful')),
 agent_version_id uuid NOT NULL,
 agent_version_hash text NOT NULL CHECK(agent_version_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(message_id,account_id),
 FOREIGN KEY(thread_id,creator_id,fan_id) REFERENCES creator.thread(id,creator_id,fan_id),
 FOREIGN KEY(message_id,thread_id,creator_id,fan_id,message_version,agent_version_id,agent_version_hash)
   REFERENCES creator.message(id,thread_id,creator_id,fan_id,version,agent_version_id,agent_version_hash) ON DELETE CASCADE,
 FOREIGN KEY(agent_version_id,creator_id) REFERENCES creator.ai_version(id,creator_id)
);
CREATE INDEX conversation_feedback_pair
 ON creator.conversation_feedback(thread_id,creator_id,fan_id,updated_at,message_id);

ALTER TABLE creator.conversation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.conversation_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_read ON creator.conversation_feedback FOR SELECT USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('app.fan_id',true),'')::uuid
);
CREATE POLICY feedback_write ON creator.conversation_feedback FOR ALL USING (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('app.fan_id',true),'')::uuid AND
 account_id=nullif(current_setting('app.account_id',true),'')::uuid AND
 EXISTS(SELECT 1 FROM creator.fan_profile fp WHERE fp.id=conversation_feedback.fan_id AND fp.account_id=conversation_feedback.account_id)
) WITH CHECK (
 creator_id=nullif(current_setting('app.creator_id',true),'')::uuid AND
 fan_id=nullif(current_setting('app.fan_id',true),'')::uuid AND
 account_id=nullif(current_setting('app.account_id',true),'')::uuid AND
 EXISTS(SELECT 1 FROM creator.fan_profile fp WHERE fp.id=conversation_feedback.fan_id AND fp.account_id=conversation_feedback.account_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.conversation_feedback TO creator_runtime;

-- W1 still owns the exact named-message signature trigger extension. Adding
-- signed_command does not relax the existing trigger or activate other commands.
-- W8 lifecycle must export/purge feedback, preserve correction target pairs for
-- authorized dispute retention, and provision its narrow forced-RLS job role.
COMMIT;
