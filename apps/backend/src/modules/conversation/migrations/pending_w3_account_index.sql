-- Additive W3 proposal; W8 must allocate/register after the conversation schema.
-- Original applied conversation/wellbeing proposals remain immutable.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE INDEX conversation_relationship_account_page
 ON creator.conversation_relationship(account_id,fan_id,thread_id DESC);
COMMIT;
