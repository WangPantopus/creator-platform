-- Held metadata-only attestation for original publication/callback workers.
-- Requires actual0158 and0176 role creation; no historical SQL/ledger changes.
-- No private body, provider receipt, lifecycle/job, signing or family authority.
BEGIN;
RESET ROLE;
DO $$ DECLARE worker text; role_oid oid; ledger oid; BEGIN
 ledger:=to_regclass('creator.schema_migration');
 IF ledger IS NULL OR NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=ledger AND c.relkind='r' AND NOT c.relispartition
   AND n.nspname='creator' AND r.rolname='creator_owner') THEN
  RAISE EXCEPTION 'Canonical migration metadata relation required';
 END IF;
 FOR worker IN SELECT unnest(ARRAY['creator_publication_worker','creator_call_callback_worker']) LOOP
  SELECT oid INTO role_oid FROM pg_roles WHERE rolname=worker AND rolcanlogin
   AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolreplication AND NOT rolbypassrls AND (rolconfig IS NULL OR cardinality(rolconfig)=0);
  IF role_oid IS NULL OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_oid OR roleid=role_oid)
   OR EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=role_oid)
   OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=role_oid)
   OR EXISTS(SELECT FROM pg_class WHERE relowner=role_oid)
   OR EXISTS(SELECT FROM pg_proc WHERE proowner=role_oid)
   OR EXISTS(SELECT FROM pg_database WHERE datdba=role_oid) THEN
   RAISE EXCEPTION 'Original isolated worker login required';
  END IF;
  -- Reject pre-existing broader custody rather than silently normalizing it.
  IF has_table_privilege(role_oid,ledger,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_table_privilege(role_oid,ledger,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION')
   OR EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=ledger AND a.attnum>0 AND NOT a.attisdropped AND
    (has_column_privilege(role_oid,ledger,a.attnum,'INSERT,UPDATE,REFERENCES')
     OR has_column_privilege(role_oid,ledger,a.attnum,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
     OR (a.attname NOT IN('version','checksum') AND has_column_privilege(role_oid,ledger,a.attnum,'SELECT')))) THEN
   RAISE EXCEPTION 'Migration metadata custody is broader than reviewed';
  END IF;
 END LOOP;
END $$;
GRANT SELECT(version,checksum) ON creator.schema_migration
 TO creator_publication_worker,creator_call_callback_worker;
COMMIT;
