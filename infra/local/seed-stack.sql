-- Local stack seed. Clearly fictional creators on the synthetic development
-- accounts of the development identity adapter, one team member, and the
-- synthetic Ops reviewers. Safe to run again: every row is keyed, and nothing
-- else is touched. Fans onboard through the product; no AI version, license,
-- source, consent, grant, payment or message is seeded here.
-- Applied by infra/local/stack.mjs to the stack's own database only.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'creator_stack%' THEN
    RAISE EXCEPTION 'The stack seed runs only in the stack''s own creator_stack database';
  END IF;
END $$;
INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','maya','Maya','verified'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','devon','Devon','verified')
ON CONFLICT (id) DO NOTHING;
INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',ARRAY['triage','drafter','publisher'])
ON CONFLICT DO NOTHING;
INSERT INTO creator_trust.ops_member(account_id,queues,supervisor,expires_at) VALUES
 ('10000000-0000-4000-8000-000000000004',ARRAY['safety','disputes','verification','pauses','support'],true,now()+interval '1 day'),
 ('10000000-0000-4000-8000-000000000005',ARRAY['safety','disputes','support'],false,now()+interval '1 day'),
 ('10000000-0000-4000-8000-000000000006',ARRAY['verification'],false,now()+interval '1 day')
ON CONFLICT(account_id) DO UPDATE SET expires_at=excluded.expires_at;
COMMIT;
