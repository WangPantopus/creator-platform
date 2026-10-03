-- Administrative seed for the isolated W6 local database only. These actors
-- are explicitly synthetic; this does not prove real external verification.
BEGIN;
INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification)
 VALUES('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','w6_local_creator','W6 Development Creator','verified')
 ON CONFLICT(account_id) DO UPDATE SET verification='verified';
INSERT INTO creator.fan_profile(id,account_id,handle)
 VALUES('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','w6_local_fan')
 ON CONFLICT(account_id) DO NOTHING;
INSERT INTO creator.creator_proof(id,account_id,creator_id,code,platform,account_url,state,expires_at,submitted_at,reviewed_at,reason)
 SELECT '60000000-0000-4000-8000-000000000003',account_id,id,'W6-LOCAL-DEVELOPMENT-ONLY','youtube','https://example.invalid/w6-development-proof','approved',now()+interval '1 day',now(),now(),'Administrative isolated development seed; no external proof was verified.'
 FROM creator.creator_profile WHERE account_id='10000000-0000-4000-8000-000000000001'
 ON CONFLICT(id) DO UPDATE SET state='approved',expires_at=excluded.expires_at;
INSERT INTO creator.thread(id,creator_id,fan_id,control,privacy_notice_at)
 SELECT '60000000-0000-4000-8000-000000000004',c.id,f.id,'human_active',now()
 FROM creator.creator_profile c CROSS JOIN creator.fan_profile f
 WHERE c.account_id='10000000-0000-4000-8000-000000000001' AND f.account_id='10000000-0000-4000-8000-000000000002'
 ON CONFLICT(creator_id,fan_id) DO NOTHING;
COMMIT;
