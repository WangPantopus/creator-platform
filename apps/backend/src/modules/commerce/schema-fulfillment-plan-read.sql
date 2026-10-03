-- Held0199_w4_fulfillment_plan_read. W8 owns registration and activation.
-- Genuine interactive metadata issuer only; this grants no answer/body access.
-- The distinct0200 trust consumer must hold every original family's negatives
-- before W5 positives. Original178 records/SQL remain unchanged.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='creator_fulfillment_view_authority') THEN
  RAISE EXCEPTION 'A pre-existing fulfillment viewer owner needs independent review';
 END IF;
 CREATE ROLE creator_fulfillment_view_authority NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
END $$;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_fulfillment_view_scope (
 nonce uuid PRIMARY KEY,backend_pid integer NOT NULL,transaction_id xid8 NOT NULL,
 account_id uuid NOT NULL,session_id uuid NOT NULL,expires_at timestamptz NOT NULL,
 creator_id uuid NOT NULL,creator_account_id uuid NOT NULL,
 content_id uuid NOT NULL,content_version integer NOT NULL CHECK(content_version>0),
 plan_id uuid NOT NULL,plan_revision integer NOT NULL CHECK(plan_revision>0),
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
 audience jsonb NOT NULL,recipient_count integer NOT NULL CHECK(recipient_count BETWEEN 2 AND 100),
 UNIQUE(backend_pid,transaction_id,creator_id,content_id,content_version),
 FOREIGN KEY(plan_id,plan_revision) REFERENCES creator.commerce_fulfillment_plan(id,revision),
 CHECK(audience=jsonb_build_object('kind','public') OR audience=jsonb_build_object('kind','groups','ids',jsonb_build_array(plan_id)))
);
ALTER TABLE creator.commerce_fulfillment_view_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_fulfillment_view_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY fulfillment_view_scope_owner ON creator.commerce_fulfillment_view_scope
 TO creator_fulfillment_view_authority
 USING(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id())
 WITH CHECK(backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()
  AND account_id=nullif(current_setting('app.account_id',true),'')::uuid
  AND session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid);
GRANT USAGE ON SCHEMA creator TO creator_fulfillment_view_authority;
GRANT SELECT,INSERT,DELETE ON creator.commerce_fulfillment_view_scope TO creator_fulfillment_view_authority;
GRANT SELECT(version,checksum) ON creator.schema_migration TO creator_fulfillment_view_authority;
GRANT SELECT(id,account_id,expires_at,revoked_at) ON creator.identity_session TO creator_fulfillment_view_authority;
GRANT SELECT(id,account_id,verification,recovery_required) ON creator.creator_profile TO creator_fulfillment_view_authority;
GRANT SELECT(id,account_id) ON creator.fan_profile TO creator_fulfillment_view_authority;
GRANT SELECT(id,creator_id,version,state,kind,packet_id,audience,withdrawn_at) ON creator.content_index TO creator_fulfillment_view_authority;
GRANT SELECT(id,revision,creator_id,content_id,content_version,audience,minimum_recipients,recipient_count,source_hash,created_by) ON creator.commerce_fulfillment_plan TO creator_fulfillment_view_authority;
GRANT SELECT(plan_id,plan_revision,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,mode_id,mode_version,acceptance_id,acceptance_hash,request_hash,consent_hash,capture_id,capture_hash)
 ON creator.commerce_fulfillment_member TO creator_fulfillment_view_authority;

-- Only inaccessible fixed definer code sets/restores these internal selectors.
-- They restrict column-only metadata; a setting or returned tuple is no licence.
CREATE FUNCTION creator.commerce_fulfillment_view_metadata_bound() RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT session_user='creator_runtime' AND EXISTS(SELECT FROM creator.identity_session s
   WHERE s.id=nullif(current_setting('app.identity_session_id',true),'')::uuid
    AND s.account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())
  AND ((nullif(current_setting('w4.fulfillment_view_creator',true),'') IS NOT NULL
    AND nullif(current_setting('w4.fulfillment_view_content',true),'') IS NOT NULL
    AND nullif(current_setting('w4.fulfillment_view_plan',true),'') IS NOT NULL)
   OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held
    WHERE held.account_id=nullif(current_setting('app.account_id',true),'')::uuid
     AND held.session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid AND held.expires_at>clock_timestamp()))
$$;
REVOKE ALL ON FUNCTION creator.commerce_fulfillment_view_metadata_bound() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.commerce_fulfillment_view_metadata_bound() TO creator_fulfillment_view_authority;
CREATE POLICY fulfillment_view_metadata ON creator.creator_profile FOR SELECT TO creator_fulfillment_view_authority
 USING(creator.commerce_fulfillment_view_metadata_bound() AND (id=nullif(current_setting('w4.fulfillment_view_creator',true),'')::uuid
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id=creator_profile.id)));
CREATE POLICY fulfillment_view_metadata ON creator.fan_profile FOR SELECT TO creator_fulfillment_view_authority
 USING(creator.commerce_fulfillment_view_metadata_bound() AND (account_id=nullif(current_setting('app.account_id',true),'')::uuid
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_member m WHERE m.fan_id=fan_profile.id)));
CREATE POLICY fulfillment_view_metadata ON creator.content_index FOR SELECT TO creator_fulfillment_view_authority
 USING(creator.commerce_fulfillment_view_metadata_bound() AND ((creator_id=nullif(current_setting('w4.fulfillment_view_creator',true),'')::uuid
  AND id=nullif(current_setting('w4.fulfillment_view_content',true),'')::uuid)
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id=content_index.creator_id AND held.content_id=content_index.id)));
CREATE POLICY fulfillment_view_metadata ON creator.commerce_fulfillment_plan FOR SELECT TO creator_fulfillment_view_authority
 USING(creator.commerce_fulfillment_view_metadata_bound() AND ((creator_id=nullif(current_setting('w4.fulfillment_view_creator',true),'')::uuid
  AND content_id=nullif(current_setting('w4.fulfillment_view_content',true),'')::uuid
  AND id=nullif(current_setting('w4.fulfillment_view_plan',true),'')::uuid
  AND revision=nullif(current_setting('w4.fulfillment_view_revision',true),'')::integer)
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id=commerce_fulfillment_plan.creator_id
   AND held.plan_id=commerce_fulfillment_plan.id AND held.plan_revision=commerce_fulfillment_plan.revision)));
CREATE POLICY fulfillment_view_metadata ON creator.commerce_fulfillment_member FOR SELECT TO creator_fulfillment_view_authority
 USING(creator.commerce_fulfillment_view_metadata_bound() AND ((creator_id=nullif(current_setting('w4.fulfillment_view_creator',true),'')::uuid
  AND plan_id=nullif(current_setting('w4.fulfillment_view_plan',true),'')::uuid
  AND plan_revision=nullif(current_setting('w4.fulfillment_view_revision',true),'')::integer)
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id=commerce_fulfillment_member.creator_id
   AND held.plan_id=commerce_fulfillment_member.plan_id AND held.plan_revision=commerce_fulfillment_member.plan_revision)));

CREATE FUNCTION creator.begin_commerce_fulfillment_view(c uuid,i uuid,v integer,p uuid,r integer,h text,a jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE viewer uuid; session uuid; expiry timestamptz; creator_account uuid; n uuid; count_members integer;
 old_values text[]; names text[]=ARRAY['w4.fulfillment_view_creator','w4.fulfillment_view_content','w4.fulfillment_view_plan','w4.fulfillment_view_revision'];
 values text[]=ARRAY[c::text,i::text,p::text,r::text];
BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration WHERE version='0199_w4_fulfillment_plan_read') THEN
  RAISE EXCEPTION 'Original fulfillment viewer is not activated' USING ERRCODE='55000'; END IF;
 IF session_user<>'creator_runtime' OR current_setting('transaction_isolation')<>'read committed'
  OR c IS NULL OR i IS NULL OR p IS NULL OR v IS NULL OR v<1 OR r IS NULL OR r<1
  OR h IS NULL OR h !~ '^[a-f0-9]{64}$' OR a IS NULL THEN RETURN NULL; END IF;
 viewer=nullif(current_setting('app.account_id',true),'')::uuid;
 session=nullif(current_setting('app.identity_session_id',true),'')::uuid;
 IF viewer IS NULL OR session IS NULL
  OR (SELECT count(*) FROM creator.commerce_fulfillment_view_scope)>=100
  OR EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.creator_id<>c
   OR (held.creator_id=c AND held.content_id=i AND held.content_version=v)) THEN RETURN NULL; END IF;
 SELECT s.expires_at INTO expiry FROM creator.identity_session s WHERE s.id=session AND s.account_id=viewer
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 IF expiry IS NULL THEN RETURN NULL; END IF;
 FOR j IN 1..4 LOOP old_values[j]=current_setting(names[j],true); PERFORM set_config(names[j],coalesce(values[j],''),true); END LOOP;
 SELECT cp.account_id,plan.recipient_count INTO creator_account,count_members
 FROM creator.commerce_fulfillment_plan plan
 JOIN creator.creator_profile cp ON cp.id=plan.creator_id AND cp.account_id=plan.created_by
 JOIN creator.content_index content ON content.id=plan.content_id AND content.creator_id=plan.creator_id AND content.version=plan.content_version
 WHERE plan.id=p AND plan.revision=r AND plan.source_hash=h AND plan.creator_id=c AND plan.content_id=i AND plan.content_version=v
  AND plan.audience=a AND cp.verification='verified' AND NOT cp.recovery_required
  AND content.kind='public_answer' AND content.packet_id IS NULL AND content.state='published' AND content.withdrawn_at IS NULL AND content.audience=a
  AND (SELECT count(*) FROM creator.commerce_fulfillment_member m WHERE m.plan_id=p AND m.plan_revision=r)=plan.recipient_count
  AND (a=jsonb_build_object('kind','public') OR (a=jsonb_build_object('kind','groups','ids',jsonb_build_array(p))
   AND EXISTS(SELECT FROM creator.commerce_fulfillment_member m JOIN creator.fan_profile fan ON fan.id=m.fan_id
    WHERE m.plan_id=p AND m.plan_revision=r AND fan.account_id=viewer)));
 IF creator_account IS NOT NULL THEN
  n=gen_random_uuid();
  INSERT INTO creator.commerce_fulfillment_view_scope(nonce,backend_pid,transaction_id,account_id,session_id,expires_at,
   creator_id,creator_account_id,content_id,content_version,plan_id,plan_revision,plan_hash,audience,recipient_count)
  VALUES(n,pg_backend_pid(),pg_current_xact_id(),viewer,session,expiry,c,creator_account,i,v,p,r,h,a,count_members);
 END IF;
 FOR j IN 1..4 LOOP PERFORM set_config(names[j],coalesce(old_values[j],''),true); END LOOP;
 RETURN n;
END $$;

CREATE FUNCTION creator.commerce_fulfillment_view_matches(n uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
  AND n IS NOT NULL AND EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held
   JOIN creator.identity_session s ON s.id=held.session_id AND s.account_id=held.account_id
   JOIN creator.commerce_fulfillment_plan plan ON plan.id=held.plan_id AND plan.revision=held.plan_revision
    AND plan.creator_id=held.creator_id AND plan.content_id=held.content_id AND plan.content_version=held.content_version
    AND plan.source_hash=held.plan_hash AND plan.audience=held.audience AND plan.created_by=held.creator_account_id
    AND plan.recipient_count=held.recipient_count
   JOIN creator.content_index content ON content.id=held.content_id AND content.creator_id=held.creator_id AND content.version=held.content_version
    AND content.state='published' AND content.withdrawn_at IS NULL AND content.kind='public_answer' AND content.packet_id IS NULL AND content.audience=held.audience
   JOIN creator.creator_profile cp ON cp.id=held.creator_id AND cp.account_id=held.creator_account_id
    AND cp.verification='verified' AND NOT cp.recovery_required
   WHERE held.nonce=n AND held.backend_pid=pg_backend_pid() AND held.transaction_id=pg_current_xact_id()
    AND held.account_id=nullif(current_setting('app.account_id',true),'')::uuid
    AND held.session_id=nullif(current_setting('app.identity_session_id',true),'')::uuid
    AND held.expires_at>clock_timestamp() AND s.expires_at=held.expires_at AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp())
$$;

-- This private projection contains only exact original family identifiers and
-- immutable hashes/versions. W8 consumes it on the issuer's actual client.
-- Neither it nor matches authorizes any source read, positive scope or answer.
CREATE FUNCTION creator.commerce_fulfillment_view_originals(n uuid)
RETURNS TABLE(packet_id uuid,commitment_id uuid,thread_id uuid,fan_id uuid,fan_account_id uuid,creator_id uuid,creator_account_id uuid,
 packet_version integer,commitment_version integer,mode_id uuid,mode_version integer,acceptance_id uuid,acceptance_hash text,
 request_hash text,consent_hash text,capture_id uuid,capture_hash text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE held creator.commerce_fulfillment_view_scope%ROWTYPE; old_values text[];
 names text[]=ARRAY['w4.fulfillment_view_creator','w4.fulfillment_view_content','w4.fulfillment_view_plan','w4.fulfillment_view_revision'];
BEGIN
 IF NOT creator.commerce_fulfillment_view_matches(n) THEN RAISE EXCEPTION 'Current original viewer is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT held FROM creator.commerce_fulfillment_view_scope s WHERE s.nonce=n;
 FOR j IN 1..4 LOOP old_values[j]=current_setting(names[j],true); END LOOP;
 PERFORM set_config(names[1],held.creator_id::text,true),set_config(names[2],held.content_id::text,true),
  set_config(names[3],held.plan_id::text,true),set_config(names[4],held.plan_revision::text,true);
 RETURN QUERY SELECT m.packet_id,m.commitment_id,m.thread_id,m.fan_id,fan.account_id,m.creator_id,held.creator_account_id,
  m.packet_version,m.commitment_version,m.mode_id,m.mode_version,m.acceptance_id,m.acceptance_hash,m.request_hash,m.consent_hash,m.capture_id,m.capture_hash
  FROM creator.commerce_fulfillment_member m JOIN creator.fan_profile fan ON fan.id=m.fan_id
  WHERE m.plan_id=held.plan_id AND m.plan_revision=held.plan_revision AND m.creator_id=held.creator_id ORDER BY m.thread_id,m.packet_id;
 IF NOT FOUND OR (SELECT count(*) FROM creator.commerce_fulfillment_member m WHERE m.plan_id=held.plan_id AND m.plan_revision=held.plan_revision)<>held.recipient_count THEN
  RAISE EXCEPTION 'Original plan members changed' USING ERRCODE='42501'; END IF;
 FOR j IN 1..4 LOOP PERFORM set_config(names[j],coalesce(old_values[j],''),true); END LOOP;
END $$;

CREATE FUNCTION creator.end_commerce_fulfillment_view(n uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT creator.commerce_fulfillment_view_matches(n) THEN RAISE EXCEPTION 'Current original viewer is required' USING ERRCODE='42501'; END IF;
 DELETE FROM creator.commerce_fulfillment_view_scope s WHERE s.nonce=n;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original viewer changed' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION creator.require_fulfillment_view_cleanup() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM creator.commerce_fulfillment_view_scope held WHERE held.nonce=NEW.nonce) THEN
  RAISE EXCEPTION 'End the original fulfillment viewer before COMMIT' USING ERRCODE='42501'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER require_fulfillment_view_cleanup AFTER INSERT ON creator.commerce_fulfillment_view_scope
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.require_fulfillment_view_cleanup();
RESET ROLE;
ALTER FUNCTION creator.begin_commerce_fulfillment_view(uuid,uuid,integer,uuid,integer,text,jsonb) OWNER TO creator_fulfillment_view_authority;
ALTER FUNCTION creator.commerce_fulfillment_view_matches(uuid) OWNER TO creator_fulfillment_view_authority;
ALTER FUNCTION creator.commerce_fulfillment_view_originals(uuid) OWNER TO creator_fulfillment_view_authority;
ALTER FUNCTION creator.end_commerce_fulfillment_view(uuid) OWNER TO creator_fulfillment_view_authority;
ALTER FUNCTION creator.require_fulfillment_view_cleanup() OWNER TO creator_fulfillment_view_authority;
REVOKE ALL ON FUNCTION creator.begin_commerce_fulfillment_view(uuid,uuid,integer,uuid,integer,text,jsonb),
 creator.commerce_fulfillment_view_matches(uuid),creator.commerce_fulfillment_view_originals(uuid),
 creator.end_commerce_fulfillment_view(uuid),creator.require_fulfillment_view_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION creator.begin_commerce_fulfillment_view(uuid,uuid,integer,uuid,integer,text,jsonb),
 creator.commerce_fulfillment_view_matches(uuid),creator.commerce_fulfillment_view_originals(uuid),
 creator.end_commerce_fulfillment_view(uuid) TO creator_runtime;
COMMIT;
