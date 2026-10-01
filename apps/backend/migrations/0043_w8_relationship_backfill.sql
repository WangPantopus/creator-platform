-- Preserve pre-W3 fan relationships for account-scoped privacy enumeration.
-- Metadata only; existing pair/account RLS and runtime grants are unchanged.
BEGIN;
INSERT INTO creator.conversation_relationship(account_id,creator_id,fan_id,thread_id)
 SELECT f.account_id,t.creator_id,t.fan_id,t.id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id
 ON CONFLICT(thread_id) DO NOTHING;
COMMIT;
