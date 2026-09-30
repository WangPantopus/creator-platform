-- W7 activation follow-on, after 0011; pending W8 registry/order.
BEGIN;
SET LOCAL ROLE growth_owner;
ALTER TABLE growth.activation_job ADD COLUMN lease_id uuid;
ALTER TABLE growth.activation_job ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE growth.activation_job ADD COLUMN completed_at timestamptz;
ALTER TABLE growth.activation_job ADD COLUMN document jsonb;
CREATE INDEX activation_due ON growth.activation_job(due_at) WHERE state IN ('queued','leased');
COMMIT;
