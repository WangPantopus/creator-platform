-- W7 additive follow-on; pending W8 ordering registration. Applied SQL stays immutable.
BEGIN;
SET LOCAL ROLE growth_owner;
ALTER TABLE growth.delivery ADD COLUMN digest_id uuid;
CREATE INDEX delivery_digest ON growth.delivery(digest_id) WHERE digest_id IS NOT NULL;
CREATE TABLE growth.provider_receipt (
  delivery_id uuid NOT NULL REFERENCES growth.delivery(id) ON DELETE CASCADE,
  registration_hash text NOT NULL,
  state text NOT NULL CHECK(state IN ('sending','sent','invalid','unknown')),
  provider_ref text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(delivery_id,registration_hash)
);
REVOKE ALL ON growth.provider_receipt FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON growth.provider_receipt TO growth_worker;
COMMIT;
