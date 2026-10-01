-- Synthetic local actors and source messages. No provider success or payment records.
-- Apply only to the separately leased creator_w8 database.
BEGIN;
DO $$ BEGIN IF current_database()<>'creator_w8' THEN RAISE EXCEPTION 'W8 seed requires the isolated creator_w8 database'; END IF; END $$;
INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','maya-local','Maya','verified'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007','recovery-local','Recovery creator','verified') ON CONFLICT DO NOTHING;
INSERT INTO creator.fan_profile(id,account_id,handle) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','kilnfire-local'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','another-fan-local') ON CONFLICT DO NOTHING;
INSERT INTO creator.thread(id,creator_id,fan_id,privacy_notice_at,message_sequence) VALUES
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',now(),1),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',now(),1),
 ('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',now(),0) ON CONFLICT DO NOTHING;
INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,text,delivery_state,control_epoch,sequence) VALUES
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','ai','For a garage, look for a 120-volt test kiln first; you can move up once you know you will fire weekly.','delivered',0,1),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','ai','A separate fan conversation, unavailable to other fans.','delivered',0,1) ON CONFLICT DO NOTHING;
INSERT INTO creator_trust.ops_member(account_id,queues,supervisor,expires_at) VALUES
 ('10000000-0000-4000-8000-000000000004',ARRAY['safety','disputes','verification','pauses','support'],true,now()+interval '1 day'),
 ('10000000-0000-4000-8000-000000000005',ARRAY['safety','disputes','support'],false,now()+interval '1 day'),
 ('10000000-0000-4000-8000-000000000006',ARRAY['verification'],false,now()+interval '1 day')
 ON CONFLICT(account_id) DO UPDATE SET expires_at=excluded.expires_at;
COMMIT;
