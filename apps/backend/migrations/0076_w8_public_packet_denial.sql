-- Reserved W8 negative authority. Requires0053/0073/0074; no activation.
-- Exact tuple metadata only. No source text, fan identity or permission result
-- is exposed. W4/W1 still supply sharing, money and actual signature authority.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='creator_trust_denial' AND
   NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND
   NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication)
   OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='creator_trust_denial')
 THEN RAISE EXCEPTION 'Unsafe private denial metadata role'; END IF;
END $$;
GRANT SELECT(id,creator_id,version,state,kind,packet_id,audience,withdrawn_at) ON creator.content_index TO creator_trust_denial;
GRANT SELECT(id,creator_id,fan_id,thread_id) ON creator.commerce_packet TO creator_trust_denial;
SET LOCAL ROLE creator_owner;
CREATE POLICY public_packet_denial_metadata ON creator.commerce_packet FOR SELECT TO creator_trust_denial USING(true);
RESET ROLE;
SET LOCAL ROLE creator_trust_owner;

CREATE FUNCTION creator_trust.packet_denial_projection(c uuid,p uuid,o uuid,v integer,a jsonb,viewer uuid,worker boolean)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_account uuid; fan_account uuid; publisher uuid; t uuid; k text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR c IS NULL OR p IS NULL OR o IS NULL OR v IS NULL OR v<1
   OR worker IS NULL OR (NOT worker AND (viewer IS NULL OR a IS NULL)) THEN RETURN 'unavailable'; END IF;
 SELECT cp.account_id,f.account_id,pub.author_account_id,packet.thread_id INTO owner_account,fan_account,publisher,t
 FROM creator.content_index i JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
 JOIN creator.commerce_packet packet ON packet.id=i.packet_id AND packet.creator_id=i.creator_id
 JOIN creator.thread thread ON thread.id=packet.thread_id AND thread.creator_id=packet.creator_id AND thread.fan_id=packet.fan_id
 JOIN creator.fan_profile f ON f.id=packet.fan_id JOIN creator.creator_profile cp ON cp.id=packet.creator_id
 WHERE i.id=o AND i.creator_id=c AND i.version=v AND i.packet_id=p AND i.kind='public_answer' AND i.withdrawn_at IS NULL
   AND ((worker AND i.state IN('media_pending','scheduled','published')) OR (NOT worker AND i.state='published' AND i.audience=a));
 IF NOT FOUND OR owner_account IS NULL OR fan_account IS NULL OR publisher IS NULL THEN RETURN 'unavailable'; END IF;

 -- Hold every actual account and creator key before any pair projection or
 -- content lock. A bounded page can already hold another creator key: never
 -- wait for a new lower key behind a writer waiting for that earlier key.
 -- Contention is unavailable/retry, never an inferred absence of denial.
 FOR k IN SELECT DISTINCT key FROM unnest(ARRAY[
   'w8-denial:account:'||viewer::text,'w8-denial:account:'||fan_account::text,
   'w8-denial:account:'||owner_account::text,'w8-denial:account:'||publisher::text,
   'w8-denial:creator:'||c::text]) key WHERE key IS NOT NULL ORDER BY key LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended(k,0)) THEN RETURN 'unavailable'; END IF;
 END LOOP;
 -- The earlier statement's tuple may have changed while obtaining locks.
 IF NOT EXISTS(SELECT FROM creator.content_index i JOIN creator.content_publication pub
   ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
   JOIN creator.commerce_packet packet ON packet.id=i.packet_id AND packet.creator_id=i.creator_id
   JOIN creator.thread thread ON thread.id=packet.thread_id AND thread.creator_id=packet.creator_id AND thread.fan_id=packet.fan_id
   JOIN creator.fan_profile f ON f.id=packet.fan_id JOIN creator.creator_profile cp ON cp.id=packet.creator_id
   WHERE i.id=o AND i.creator_id=c AND i.version=v AND i.packet_id=p AND i.kind='public_answer' AND i.withdrawn_at IS NULL
     AND ((worker AND i.state IN('media_pending','scheduled','published')) OR (NOT worker AND i.state='published' AND i.audience=a))
     AND cp.account_id=owner_account AND f.account_id=fan_account AND pub.author_account_id=publisher AND packet.thread_id=t)
 THEN RETURN 'unavailable'; END IF;
 IF creator_trust.denial_projection(c,fan_account,owner_account,t)
   OR (viewer IS NOT NULL AND creator_trust.denial_projection(c,viewer,owner_account,NULL))
   OR creator_trust.denial_projection(c,publisher,owner_account,NULL)
   OR EXISTS(SELECT FROM creator.content_tombstone WHERE account_id IN(fan_account,owner_account,publisher,viewer))
 THEN RETURN 'denied'; END IF;
 RETURN 'allowed';
END $$;

CREATE FUNCTION creator_trust.runtime_packet_denial(c uuid,p uuid,o uuid,v integer,a jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller uuid; s uuid;
BEGIN
 caller := nullif(current_setting('app.account_id',true),'')::uuid;
 s := nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF caller IS NULL OR s IS NULL OR NOT EXISTS(SELECT FROM creator.identity_session
   WHERE id=s AND account_id=caller AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN 'unavailable'; END IF;
 RETURN creator_trust.packet_denial_projection(c,p,o,v,a,caller,false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN 'unavailable';
END $$;

-- Invoked by0073 BEFORE its ordinary publisher/owner projection. Validate the
-- actual durable candidate and exact issuer context, but issue no nonce/scope.
CREATE FUNCTION creator_trust.publication_packet_denial(c uuid,publisher uuid)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid; v integer; s uuid; h text; p uuid; op text;
BEGIN
 IF session_user<>'creator_publication_worker' OR current_setting('transaction_isolation')<>'read committed' THEN RETURN 'unavailable'; END IF;
 o := nullif(current_setting('publication.content_id',true),'')::uuid;
 v := nullif(current_setting('publication.version',true),'')::integer;
 s := nullif(current_setting('publication.signed_act_id',true),'')::uuid;
 h := coalesce(current_setting('publication.command_hash',true),'');
 op := nullif(current_setting('publication.operation',true),'');
 IF c IS DISTINCT FROM nullif(current_setting('publication.creator_id',true),'')::uuid
   OR publisher IS DISTINCT FROM nullif(current_setting('publication.publisher_account_id',true),'')::uuid
   OR op IS NULL OR op NOT IN('discover','issue') OR (op='issue' AND h!~'^[a-f0-9]{64}$')
   OR (op='discover' AND ((s IS NULL AND h<>'') OR (s IS NOT NULL AND h!~'^[a-f0-9]{64}$'))) THEN RETURN 'unavailable'; END IF;
 SELECT i.packet_id INTO p FROM creator.content_index i JOIN creator.content_publication pub
   ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
   LEFT JOIN creator.signed_act sa ON sa.id=pub.signed_act_id
   WHERE i.id=o AND i.creator_id=c AND i.version=v AND i.state IN('media_pending','scheduled','published')
     AND pub.author_account_id=publisher AND pub.signed_act_id IS NOT DISTINCT FROM s AND (s IS NULL OR sa.content_hash=h);
 IF NOT FOUND OR p IS NULL THEN RETURN 'unavailable'; END IF;
 RETURN creator_trust.packet_denial_projection(c,p,o,v,NULL,NULL,true);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN 'unavailable';
END $$;
RESET ROLE;
ALTER FUNCTION creator_trust.packet_denial_projection(uuid,uuid,uuid,integer,jsonb,uuid,boolean) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.runtime_packet_denial(uuid,uuid,uuid,integer,jsonb) OWNER TO creator_trust_denial;
ALTER FUNCTION creator_trust.publication_packet_denial(uuid,uuid) OWNER TO creator_trust_denial;
REVOKE ALL ON FUNCTION creator_trust.packet_denial_projection(uuid,uuid,uuid,integer,jsonb,uuid,boolean),
 creator_trust.runtime_packet_denial(uuid,uuid,uuid,integer,jsonb),creator_trust.publication_packet_denial(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator_trust.runtime_packet_denial(uuid,uuid,uuid,integer,jsonb) TO creator_runtime;
COMMIT;
