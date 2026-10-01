-- W3 additive unallocated/unapplied proposal; W8 owns canonical registration.
-- Depends on pending_w3_message_lineage.sql. No policy or old consent is inferred.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.conversation_feedback
 ADD COLUMN consent_policy_version text,
 ADD COLUMN consented_at timestamptz,
 ADD COLUMN expires_at timestamptz,
 ADD CONSTRAINT feedback_consent_pair CHECK(
  (consent_policy_version IS NULL AND consented_at IS NULL AND expires_at IS NULL) OR
  (consent_policy_version IS NOT NULL AND length(consent_policy_version) BETWEEN 1 AND 120 AND
   consented_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at>consented_at)
 );
CREATE INDEX conversation_feedback_expiry ON creator.conversation_feedback(expires_at,message_id)
 WHERE expires_at IS NOT NULL;
-- Runtime reads exclude expired/unconsented feedback. W8's approved lifecycle
-- supplies the actual expiry, physical expiry purge and export/delete authority.
COMMIT;
