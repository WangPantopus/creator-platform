-- Additive repair for applied0212. Its existing output function reads
-- first_visible_at in COALESCE while updating the first durable sentence.
-- Keep the executable, worker restrictions, RLS and original history intact.
BEGIN;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM creator.schema_migration
  WHERE version='0212_w3_generation_worker_output'
   AND checksum='76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8')
  OR NOT EXISTS(SELECT FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
   WHERE p.oid=to_regprocedure('creator.generation_worker_output(uuid,uuid,integer,text,jsonb)')
    AND r.rolname='creator_w3_generation_output' AND NOT r.rolcanlogin
    AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
    AND r.rolconfig IS NULL
    AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
    AND p.prosecdef AND p.prokind='f' AND p.provolatile='v'
    AND p.proconfig=ARRAY['search_path=pg_catalog']
    AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=
      'f32169bba8e4c13bca95e6e18ff9900c1d1a157fe026cb841017cb7fd65a9453')
  OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.generation')
    AND relkind='r' AND pg_get_userbyid(relowner)='creator_owner'
    AND relrowsecurity AND relforcerowsecurity)
  OR NOT has_column_privilege('creator_w3_generation_output','creator.generation','first_visible_at','UPDATE') THEN
  RAISE EXCEPTION 'The exact original generation output owner and executable are required';
 END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT SELECT(first_visible_at) ON creator.generation TO creator_w3_generation_output;
RESET ROLE;
-- The reviewed activation operator alone records the source checksum.
COMMIT;
