-- Additive W4 follow-up to applied 0004. Shared registry order is unassigned; W8 owns allocation.
BEGIN;
SET LOCAL ROLE creator_owner;
CREATE TABLE creator.commerce_authorization_lineage (
 packet_id uuid NOT NULL REFERENCES creator.commerce_packet(id),creator_id uuid NOT NULL,fan_id uuid NOT NULL,
 attempt integer NOT NULL CHECK(attempt>0),intent_ref text NOT NULL UNIQUE,snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(packet_id,attempt)
);
ALTER TABLE creator.commerce_authorization_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator.commerce_authorization_lineage FORCE ROW LEVEL SECURITY;
CREATE POLICY lineage_scope ON creator.commerce_authorization_lineage USING(creator.commerce_scope(creator_id,fan_id)) WITH CHECK(creator.commerce_scope(creator_id,fan_id));
GRANT SELECT,INSERT ON creator.commerce_authorization_lineage TO creator_runtime;
CREATE TRIGGER commerce_lineage_immutable BEFORE UPDATE OR DELETE ON creator.commerce_authorization_lineage FOR EACH ROW EXECUTE FUNCTION creator.commerce_immutable();
COMMIT;
