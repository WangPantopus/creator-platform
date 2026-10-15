-- Additive W7 proposal (lane 5, WP 5.2, founder's option A). W8 must allocate and
-- register this unchanged source before it is applied. Existing canonical/applied
-- SQL remains immutable. Requires the growth tables (0007) and the roles it creates.
--
-- Why: answers, request status, call reminders and commitments are owned by other
-- modules and live in private rows (threads, packets, calls). The growth worker
-- has no authority to read those rows when it creates a notice or right before it
-- sends one. So the owner, in the process that already holds that authority,
-- records one small row saying what a notice about its object may say right now,
-- and withdraws it when its own state changes. The worker reads only this row.
-- The row holds nothing the notice does not already show: a version, who is
-- speaking, the creator's display name, a fixed safe sentence and a destination.
-- No message text, no amounts, no identity of anyone else.
--
-- Access: growth_worker only (as for producer_relay). Owners call
-- GrowthNotices.emit/withdraw in-process, exactly as they call GrowthRelay.
-- growth_runtime (the API) gets nothing: no request can read or write this table.
BEGIN;
SET LOCAL ROLE growth_owner;
CREATE TABLE growth.notice (
 type text NOT NULL CHECK(type IN('ai_reply','approved_draft','personal_reply','request_status','call_reminder','new_packet','creator_offer','commitment_due')),
 aggregate_id uuid NOT NULL,
 account_id uuid NOT NULL,
 creator_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 state text NOT NULL CHECK(state IN('current','withdrawn')),
 author_kind text NOT NULL CHECK(author_kind IN('ai','approved_draft','human_creator','human_call','team','system')),
 creator_name text NOT NULL CHECK(char_length(creator_name) BETWEEN 1 AND 80),
 safe_preview text NOT NULL CHECK(char_length(safe_preview) BETWEEN 1 AND 240),
 destination text NOT NULL CHECK(char_length(destination) BETWEEN 1 AND 512),
 status text CHECK(status IS NULL OR char_length(status) BETWEEN 1 AND 40),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(type,aggregate_id,account_id)
);
CREATE INDEX notice_account ON growth.notice(account_id);
CREATE INDEX notice_creator ON growth.notice(creator_id);
ALTER TABLE growth.notice ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth.notice FORCE ROW LEVEL SECURITY;
CREATE POLICY notice_worker ON growth.notice TO growth_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.notice TO growth_worker;
COMMIT;
