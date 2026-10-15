-- Additive lane 4 proposal (WP 4.2, the notification half). Shared registry order is unassigned;
-- the integrator owns allocation, and the login's password and settings belong to the host.
-- The processor's notifications are inserted by the runtime login, which may only insert them
-- (schema-reliability.sql). This is the separate, non-owner login that may claim and finish them:
-- it reads the minimal columns and updates only the claim fields, and can do nothing else.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_commerce_inbox') THEN
    CREATE ROLE creator_commerce_inbox LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  END IF;
END $$;
SET LOCAL ROLE creator_owner;
GRANT USAGE ON SCHEMA creator TO creator_commerce_inbox;
GRANT SELECT (provider,event_id,event_type,object_ref,received_at,state,lease_until,attempt),
  UPDATE (state,lease_until,attempt,error_code)
  ON creator.commerce_provider_inbox TO creator_commerce_inbox;
COMMIT;
