-- Reserved 0088_w5_reply_tenure_cap. Additive proposal; W8 owns activation.
-- W5's server still enforces the current confirmed-tenure limit per reply.
-- This maximum alone grants no tenure, audience, payment or reply permission.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.content_reply DROP CONSTRAINT content_reply_text_check;
ALTER TABLE creator.content_reply ADD CONSTRAINT content_reply_tenure_text_check
 CHECK(length(text) BETWEEN 1 AND 12000);
COMMIT;
