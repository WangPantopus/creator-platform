-- W3 local development prerequisites: clearly fictional creators and one team
-- member on synthetic development accounts. Creator verification belongs to
-- W1/W8 review; this seed only marks fictional creators verified on the owned
-- loopback creator_w3 database. Fans onboard through the product UI. No AI
-- version, license, source, consent, grant, payment or message is seeded.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'creator_w3' THEN
    RAISE EXCEPTION 'The W3 seed requires the isolated creator_w3 database';
  END IF;
END $$;
INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','maya','Maya','verified'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','devon','Devon','verified')
ON CONFLICT (id) DO NOTHING;
INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',ARRAY['triage','drafter','publisher'])
ON CONFLICT DO NOTHING;
COMMIT;
