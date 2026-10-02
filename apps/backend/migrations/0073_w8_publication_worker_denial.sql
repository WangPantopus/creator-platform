-- Reserved W8 proposal. Requires 0053 + W1's 0071; no canonical activation.
-- Negative authority only; W1's sealed scope supplies positive task authority.
BEGIN;
GRANT USAGE ON SCHEMA creator_trust TO creator_publication_worker,creator_publication_authority;
GRANT SELECT(id,creator_id,version,state,packet_id) ON creator.content_index TO creator_trust_denial;
GRANT SELECT(content_id,creator_id,version,author_account_id,signed_act_id) ON creator.content_publication TO creator_trust_denial;
GRANT SELECT(id,content_hash) ON creator.signed_act TO creator_trust_denial;
GRANT SELECT(account_id) ON creator.content_tombstone TO creator_trust_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY publication_denial_metadata ON creator.content_index FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY publication_denial_metadata ON creator.content_publication FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY publication_denial_metadata ON creator.signed_act FOR SELECT TO creator_trust_denial USING(true);
CREATE POLICY publication_denial_metadata ON creator.content_tombstone FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;
CREATE FUNCTION creator_trust.publication_worker_denial(c uuid,p uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid; v integer; s uuid; h text; op text; owner_account uuid; actual_hash text; packet uuid; packet_denial text;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 op := nullif(current_setting('publication.operation',true),'');
 o := nullif(current_setting('publication.content_id',true),'')::uuid;
 v := nullif(current_setting('publication.version',true),'')::integer;
 s := nullif(current_setting('publication.signed_act_id',true),'')::uuid;
 h := coalesce(current_setting('publication.command_hash',true),'');
 IF c IS NULL OR p IS NULL OR o IS NULL OR v IS NULL OR v<1 OR op IS NULL OR op NOT IN('discover','issue') OR
   c IS DISTINCT FROM nullif(current_setting('publication.creator_id',true),'')::uuid OR
   p IS DISTINCT FROM nullif(current_setting('publication.publisher_account_id',true),'')::uuid OR
   (op='issue' AND h!~'^[a-f0-9]{64}$') OR
   (op='discover' AND ((s IS NULL AND h<>'') OR (s IS NOT NULL AND h!~'^[a-f0-9]{64}$'))) THEN RETURN 'unavailable'; END IF;
 SELECT cp.account_id,sa.content_hash,i.packet_id INTO owner_account,actual_hash,packet
 FROM creator.content_index i JOIN creator.creator_profile cp ON cp.id=i.creator_id
 JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
 LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id
 WHERE i.id=o AND i.creator_id=c AND i.version=v AND i.state IN('media_pending','scheduled','published')
   AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s;
 IF NOT FOUND OR (s IS NOT NULL AND actual_hash IS DISTINCT FROM h) THEN RETURN 'unavailable'; END IF;
 IF packet IS NOT NULL THEN
   IF to_regprocedure('creator_trust.publication_packet_denial(uuid,uuid)') IS NULL THEN RETURN 'unavailable'; END IF;
   packet_denial := creator_trust.publication_packet_denial(c,p);
   IF packet_denial IS DISTINCT FROM 'allowed' THEN RETURN coalesce(packet_denial,'unavailable'); END IF;
 END IF;
 -- Sorted shared denial locks precede identity/content/asset row locks. Team
 -- publishers are their real accounts, never a substituted creator or fan.
 IF creator_trust.denial_projection(c,p,owner_account,NULL) THEN RETURN 'denied'; END IF;
 -- Re-read after a lock wait; an earlier statement snapshot is not authority.
 IF NOT EXISTS(SELECT FROM creator.content_index i JOIN creator.content_publication pub
   ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
   JOIN creator.creator_profile cp ON cp.id=i.creator_id LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id
   WHERE i.id=o AND i.creator_id=c AND i.version=v AND i.state IN('media_pending','scheduled','published')
     AND cp.account_id=owner_account AND pub.author_account_id=p AND pub.signed_act_id IS NOT DISTINCT FROM s
     AND i.packet_id IS NOT DISTINCT FROM packet
     AND (s IS NULL OR sa.content_hash=h)) THEN RETURN 'unavailable'; END IF;
 IF EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(p,owner_account)) THEN RETURN 'denied'; END IF;
 RETURN 'allowed';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.publication_worker_denial(uuid,uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.publication_worker_denial(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.publication_worker_denial(uuid,uuid) TO creator_publication_worker,creator_publication_authority;
COMMIT;
